import type Parser from 'web-tree-sitter'
import type { ScannedFile } from './scanner'
import { buildLogPattern, type LogSite, type LogTemplateSeg } from '../../shared/log'

/**
 * 파스 트리에서 패키지/import/최상위 선언명을 추출한다. (02 §3, §4)
 * tree-sitter-kotlin이 일부 유효 코드에 ERROR를 내더라도 노드 쿼리로 추출(hasError 비의존).
 */

export interface ImportRef {
  /**
   * 'type': 특정 타입 FQN, 'package': 와일드카드(패키지 전체). (Java/Kotlin)
   * 'include-local': #include "..."(경로 해석), 'include-system': #include <...>(외부). (C/C++, M13)
   */
  kind: 'type' | 'package' | 'include-local' | 'include-system'
  target: string
  line: number
}

/** 함수 본문 내 호출 1건(호출 대상 단순명 + 위치). (02 §6, M10_1) */
export interface CallRef {
  name: string
  line: number
}

export interface FunctionDef {
  name: string
  line: number
  /** 이 함수 본문에서 호출하는 함수들(단순명). 해석/엣지화는 dependency-graph에서. (02 §6) */
  calls: CallRef[]
}

/** 상속/구현 참조 1건(상위 타입 이름 + 위치). 단순명 또는 정규화명. (TODO_MORE) */
export interface SupertypeRef {
  /** 상위 타입 이름(extends/implements 대상). 단순명 또는 FQN. */
  name: string
  line: number
}

export interface FileInfo {
  file: ScannedFile
  packageName: string | null
  topLevelNames: string[]
  imports: ImportRef[]
  /** extends/implements/상위타입 참조(상속 엣지 해석은 dependency-graph에서). (TODO_MORE) */
  supertypes: SupertypeRef[]
  /** 함수/메서드 정의(검색·라벨용, 호출 관계 아님). (02 §1, §4.1, D7) */
  functions: FunctionDef[]
  /** 소스 내 로그 호출 위치(로그→코드 역추적용). (04 §5, M11_4) */
  logSites: LogSite[]
  /** Java native 메서드의 기대 JNI 맹글링명(Java 측). (M14_1) */
  nativeMethods: string[]
  /** C/C++의 JNI 구현 함수명(Java_...). (M14_1) */
  jniFunctions: string[]
  /**
   * C/C++의 RegisterNatives/FindClass 클래스 디스크립터 → Java 클래스 FQN.
   * AOSP가 실제로 쓰는 JNINativeMethod 테이블 방식 JNI 경계 탐지용. (TODO_MORE)
   */
  jniClassRefs?: string[]
}

/** 로그 호출로 인식할 리시버(마지막 식별자 기준). (결정: Log.* + 흔한 프레임워크) */
const LOG_RECEIVERS = new Set(['Log', 'Slog', 'Timber'])
/** 로그 메서드명 → 레벨. */
const LOG_METHODS: Record<string, string> = {
  v: 'V',
  d: 'D',
  i: 'I',
  w: 'W',
  e: 'E',
  wtf: 'F'
}
/** Java/Kotlin 포맷 지정자(%s, %d, %02x, %1$s 등) → 가변부. */
const FORMAT_SPECIFIER = /%(?:\d+\$)?[-#+ 0,(]*\d*(?:\.\d+)?[a-zA-Z]/g

type Node = Parser.SyntaxNode

function stripLastSegment(fqn: string): string {
  const i = fqn.lastIndexOf('.')
  return i >= 0 ? fqn.slice(0, i) : fqn
}

/** node에서 위로 올라가며 주어진 타입의 가장 가까운 조상을 찾는다(호출→소속 함수 귀속용). */
function nearestAncestorOfType(node: Node, type: string): Node | null {
  let cur = node.parent
  while (cur) {
    if (cur.type === type) return cur
    cur = cur.parent
  }
  return null
}

/**
 * Kotlin call_expression의 호출 대상 단순명을 뽑는다.
 * `foo()` → foo, `a.b.bar()` → bar(마지막 식별자). 그 외 형태는 null(보수적).
 */
function kotlinCalleeName(call: Node): string | null {
  const callee = call.namedChildren[0]
  if (!callee) return null
  if (callee.type === 'simple_identifier') return callee.text
  if (callee.type === 'navigation_expression') {
    const ids = callee.descendantsOfType('simple_identifier')
    return ids.length > 0 ? ids[ids.length - 1].text : null
  }
  return null
}

export function extractFileInfo(tree: Parser.Tree, file: ScannedFile): FileInfo {
  switch (file.language) {
    case 'java':
      return extractJava(tree.rootNode, file)
    case 'kotlin':
      return extractKotlin(tree.rootNode, file)
    default:
      return extractCFamily(tree.rootNode, file) // c / cpp
  }
}

/** 타입 노드에서 기반 타입명(제네릭은 베이스)을 뽑는다. (TODO_MORE) */
function javaTypeName(node: Node): string | null {
  if (node.type === 'type_identifier' || node.type === 'scoped_type_identifier') return node.text
  if (node.type === 'generic_type') {
    const base = node.namedChildren[0]
    return base ? javaTypeName(base) : null
  }
  return null
}

/** Java: extends/implements/interface extends 절에서 상위 타입명을 수집한다. (TODO_MORE) */
function extractJavaSupertypes(root: Node): SupertypeRef[] {
  const out: SupertypeRef[] = []
  for (const clause of root.descendantsOfType([
    'superclass',
    'super_interfaces',
    'extends_interfaces'
  ])) {
    const line = clause.startPosition.row + 1
    const typeNodes =
      clause.type === 'superclass'
        ? clause.namedChildren
        : (clause.descendantsOfType('type_list')[0]?.namedChildren ?? clause.namedChildren)
    for (const t of typeNodes) {
      const name = javaTypeName(t)
      if (name) out.push({ name, line })
    }
  }
  return out
}

/** Kotlin: 클래스 선언의 위임 지정자(`: Base()/Iface`)에서 상위 타입명(단순명)을 수집한다. (TODO_MORE) */
function extractKotlinSupertypes(root: Node): SupertypeRef[] {
  const out: SupertypeRef[] = []
  for (const spec of root.descendantsOfType('delegation_specifier')) {
    const tids = spec.descendantsOfType('type_identifier')
    if (tids.length > 0)
      out.push({ name: tids[tids.length - 1].text, line: spec.startPosition.row + 1 })
  }
  return out
}

/** C++: base_class_clause에서 베이스 클래스명을 수집한다. (C는 상속 없음 → 빈 배열) (TODO_MORE) */
function extractCppSupertypes(root: Node): SupertypeRef[] {
  const out: SupertypeRef[] = []
  for (const clause of root.descendantsOfType('base_class_clause')) {
    for (const t of clause.descendantsOfType('type_identifier')) {
      out.push({ name: t.text, line: clause.startPosition.row + 1 })
    }
  }
  return out
}

/**
 * C/C++ 선언자(declarator)에서 함수/호출의 단순명을 뽑는다.
 * 포인터/참조/괄호 선언자는 안쪽으로, 한정자(`Class::method`)는 마지막 식별자를 쓴다. (TODO_MORE)
 */
function cppDeclName(node: Node | null): string | null {
  if (!node) return null
  switch (node.type) {
    case 'identifier':
    case 'field_identifier':
    case 'type_identifier':
    case 'destructor_name':
    case 'operator_name':
      return node.text
    case 'qualified_identifier': {
      const ids = node.descendantsOfType(['identifier', 'field_identifier', 'destructor_name'])
      return ids.length > 0 ? ids[ids.length - 1].text : null
    }
    case 'pointer_declarator':
    case 'reference_declarator':
    case 'parenthesized_declarator':
    case 'function_declarator':
      return cppDeclName(node.childForFieldName('declarator'))
    default: {
      const ids = node.descendantsOfType(['identifier', 'field_identifier'])
      return ids.length > 0 ? ids[ids.length - 1].text : null
    }
  }
}

/** C/C++ call_expression의 호출 대상 단순명. `foo()`/`obj.bar()`/`ns::baz()` → 마지막 식별자. */
function cppCalleeName(call: Node): string | null {
  const fn = call.childForFieldName('function')
  if (!fn) return null
  if (fn.type === 'identifier' || fn.type === 'field_identifier') return fn.text
  if (fn.type === 'field_expression') return fn.childForFieldName('field')?.text ?? null
  return cppDeclName(fn)
}

/** 인자로 넘어온 식별자(함수 참조 후보) 단순명. `&foo`/`ns::foo`/`foo` → `foo`. (TODO_MORE) */
function argReferenceName(arg: Node): string | null {
  switch (arg.type) {
    case 'identifier':
      return arg.text
    case 'qualified_identifier': {
      const ids = arg.descendantsOfType(['identifier', 'field_identifier', 'destructor_name'])
      return ids.length > 0 ? ids[ids.length - 1].text : null
    }
    case 'pointer_expression': // &foo (함수 포인터 전달)
    case 'parenthesized_expression': {
      const inner = arg.childForFieldName('argument') ?? arg.namedChildren[0] ?? null
      return inner && inner.id !== arg.id ? argReferenceName(inner) : null
    }
    default:
      return null
  }
}

/**
 * 간접 호출(콜백) 후보명. `do_in_main_thread(base::BindOnce(b, addr))`처럼 함수를 직접 호출하지 않고
 * 다른 호출의 **인자로 함수 참조를 넘기는** 경우, 그 함수 이름들을 호출 후보로 본다. (TODO_MORE)
 * 실제 엣지 생성은 dependency-graph의 보수적 해석(프로젝트 내 동일명 유일)에서 걸러진다.
 */
function cppCallbackArgNames(call: Node): string[] {
  const args = call.childForFieldName('arguments')
  if (!args) return []
  const out: string[] = []
  for (const arg of args.namedChildren) {
    const name = argReferenceName(arg)
    if (name) out.push(name)
  }
  return out
}

/**
 * JNI 클래스 디스크립터 문자열("pkg/sub/Class")인지 판단한다.
 * 슬래시 포함 + 허용 문자(`\w/$`)만 + 마지막 세그먼트가 대문자로 시작(클래스명). (TODO_MORE)
 */
function isJniClassDescriptor(s: string): boolean {
  if (!s.includes('/') || /[^\w/$]/.test(s)) return false
  const segs = s.split('/')
  if (segs.length < 2) return false
  return /^[A-Z]/.test(segs[segs.length - 1])
}

/**
 * C/C++ 소스의 JNI 클래스 디스크립터 문자열을 Java 클래스 FQN으로 수집한다.
 * `RegisterNatives`/`REGISTER_NATIVE_METHODS`/`FindClass`의 "com/android/.../Foo" 인자 →
 * `com.android...Foo`(내부 클래스 `$`는 최상위로). dependency-graph에서 Java 파일과 매칭. (TODO_MORE)
 */
function extractJniClassRefs(root: Node): string[] {
  const out = new Set<string>()
  for (const lit of root.descendantsOfType('string_literal')) {
    const raw = stripQuotes(lit.text)
    if (!isJniClassDescriptor(raw)) continue
    out.add(raw.replace(/\//g, '.').replace(/\$.*$/, ''))
  }
  return [...out]
}

/** C/C++: 함수 정의 + 본문 내 호출을 추출한다(호출 그래프/역추적용). (TODO_MORE) */
function extractCFamilyFunctions(root: Node): FunctionDef[] {
  const functions: FunctionDef[] = []
  const funcById = new Map<number, FunctionDef>()
  for (const fn of root.descendantsOfType('function_definition')) {
    const name = cppDeclName(fn.childForFieldName('declarator'))
    if (!name) continue
    const def: FunctionDef = { name, line: fn.startPosition.row + 1, calls: [] }
    functions.push(def)
    funcById.set(fn.id, def)
  }
  // 호출은 가장 가까운 함수 정의에 귀속. (java/kotlin과 동일 방식)
  for (const call of root.descendantsOfType('call_expression')) {
    const owner = nearestAncestorOfType(call, 'function_definition')
    const fn = owner ? funcById.get(owner.id) : undefined
    if (!fn) continue
    const line = call.startPosition.row + 1
    // 직접 호출 대상.
    const name = cppCalleeName(call)
    if (name) fn.calls.push({ name, line })
    // 간접 호출(콜백): 인자로 넘긴 함수 참조도 호출 후보로 추가(BindOnce/PostTask 등). (TODO_MORE)
    for (const cb of cppCallbackArgNames(call)) {
      if (cb !== name) fn.calls.push({ name: cb, line })
    }
  }
  return functions
}

/**
 * C/C++: #include 지시문을 파일 의존성 import로 + 함수 정의/호출을 추출한다. (02 §2, §3, M13, TODO_MORE)
 * `#include "..."` → include-local(경로 해석), `#include <...>` → include-system(외부).
 */
function extractCFamily(root: Node, file: ScannedFile): FileInfo {
  const imports: ImportRef[] = []
  for (const inc of root.descendantsOfType('preproc_include')) {
    const path = inc.childForFieldName('path')
    if (!path) continue
    const line = inc.startPosition.row + 1
    if (path.type === 'string_literal') {
      imports.push({ kind: 'include-local', target: stripQuotes(path.text), line })
    } else if (path.type === 'system_lib_string') {
      // <stdio.h> → stdio.h
      imports.push({ kind: 'include-system', target: path.text.replace(/^<|>$/g, ''), line })
    }
  }
  // JNI 구현 함수(Java_...) 수집. (M14_1)
  const jniFunctions: string[] = []
  for (const fn of root.descendantsOfType('function_definition')) {
    const decl = fn.descendantsOfType('function_declarator')[0]
    const name = decl?.descendantsOfType('identifier')[0]?.text
    if (name && name.startsWith('Java_')) jniFunctions.push(name)
  }
  return {
    file,
    packageName: null,
    topLevelNames: [],
    imports,
    supertypes: file.language === 'cpp' ? extractCppSupertypes(root) : [],
    functions: extractCFamilyFunctions(root),
    logSites: [],
    nativeMethods: [],
    jniFunctions,
    jniClassRefs: extractJniClassRefs(root)
  }
}

/** Java FQN(pkg.Class.method)을 기대 JNI 함수명으로 맹글링한다. (단순 시그니처 제외) */
function jniMangle(fqn: string): string {
  return `Java_${fqn.replace(/_/g, '_1').replace(/\./g, '_')}`
}

/** Java 파일의 native 메서드 → 기대 JNI 맹글링명 목록. (M14_1) */
function extractJavaNativeMethods(root: Node, packageName: string | null): string[] {
  const out: string[] = []
  for (const method of root.descendantsOfType('method_declaration')) {
    const mods = method.namedChildren.find((c) => c.type === 'modifiers')
    if (!mods || !/\bnative\b/.test(mods.text)) continue
    const name = method.childForFieldName('name')?.text
    const cls = nearestAncestorOfType(method, 'class_declaration')?.childForFieldName('name')?.text
    if (!name || !cls) continue
    out.push(jniMangle(packageName ? `${packageName}.${cls}.${name}` : `${cls}.${name}`))
  }
  return out
}

function extractJava(root: Node, file: ScannedFile): FileInfo {
  const kids = root.namedChildren

  let packageName: string | null = null
  const pkg = kids.find((c) => c.type === 'package_declaration')
  if (pkg) packageName = pkg.namedChildren[0]?.text ?? null

  const imports: ImportRef[] = []
  for (const decl of kids.filter((c) => c.type === 'import_declaration')) {
    const id = decl.namedChildren.find(
      (c) => c.type === 'scoped_identifier' || c.type === 'identifier'
    )
    if (!id) continue
    const fqn = id.text
    const isWildcard = decl.namedChildren.some((c) => c.type === 'asterisk')
    const isStatic = /^\s*import\s+static\b/.test(decl.text)
    const line = decl.startPosition.row + 1

    if (isWildcard && !isStatic) {
      imports.push({ kind: 'package', target: fqn, line })
    } else if (isStatic && !isWildcard) {
      // static 단일 import는 멤버이므로 소속 타입으로 의존. (com.a.B.c → com.a.B)
      imports.push({ kind: 'type', target: stripLastSegment(fqn), line })
    } else {
      imports.push({ kind: 'type', target: fqn, line })
    }
  }

  const typeDecls = new Set([
    'class_declaration',
    'interface_declaration',
    'enum_declaration',
    'record_declaration',
    'annotation_type_declaration'
  ])
  const topLevelNames: string[] = []
  for (const c of kids) {
    if (typeDecls.has(c.type)) {
      const name = c.childForFieldName('name')?.text
      if (name) topLevelNames.push(name)
    }
  }

  // 메서드 정의(중첩 클래스 포함) + 본문 내 호출. (M4_4, M10_1)
  // web-tree-sitter는 노드 접근마다 새 래퍼를 만들어 객체 동일성이 보장되지 않으므로 node.id로 매핑한다.
  const functions: FunctionDef[] = []
  const funcById = new Map<number, FunctionDef>()
  for (const method of root.descendantsOfType('method_declaration')) {
    const name = method.childForFieldName('name')?.text
    if (!name) continue
    const fn: FunctionDef = { name, line: method.startPosition.row + 1, calls: [] }
    functions.push(fn)
    funcById.set(method.id, fn)
  }
  // 호출은 가장 가까운 메서드 정의에 귀속(중첩/익명 클래스 메서드는 그 메서드로). (02 §6)
  for (const call of root.descendantsOfType('method_invocation')) {
    const name = call.childForFieldName('name')?.text
    if (!name) continue
    const owner = nearestAncestorOfType(call, 'method_declaration')
    const fn = owner ? funcById.get(owner.id) : undefined
    if (fn) fn.calls.push({ name, line: call.startPosition.row + 1 })
  }

  return {
    file,
    packageName,
    topLevelNames,
    imports,
    supertypes: extractJavaSupertypes(root),
    functions,
    logSites: extractJavaLogSites(root, file),
    nativeMethods: extractJavaNativeMethods(root, packageName),
    jniFunctions: []
  }
}

function extractKotlin(root: Node, file: ScannedFile): FileInfo {
  const kids = root.namedChildren

  let packageName: string | null = null
  const pkg = kids.find((c) => c.type === 'package_header')
  if (pkg) packageName = pkg.namedChildren.find((c) => c.type === 'identifier')?.text ?? null

  const imports: ImportRef[] = []
  const importList = kids.find((c) => c.type === 'import_list')
  if (importList) {
    for (const header of importList.namedChildren.filter((c) => c.type === 'import_header')) {
      const id = header.namedChildren.find((c) => c.type === 'identifier')
      if (!id) continue
      const fqn = id.text
      const isWildcard = header.namedChildren.some((c) => c.type === 'wildcard_import')
      const line = header.startPosition.row + 1
      imports.push(
        isWildcard ? { kind: 'package', target: fqn, line } : { kind: 'type', target: fqn, line }
      )
    }
  }

  const topLevelNames: string[] = []
  for (const c of kids) {
    if (c.type === 'class_declaration' || c.type === 'object_declaration') {
      const name = c.namedChildren.find((n) => n.type === 'type_identifier')?.text
      if (name) topLevelNames.push(name)
    } else if (c.type === 'function_declaration') {
      const name = c.namedChildren.find((n) => n.type === 'simple_identifier')?.text
      if (name) topLevelNames.push(name)
    }
  }

  // 함수 정의(최상위 + 멤버) + 본문 내 호출. node.id로 매핑(래퍼 동일성 비보장). (M4_4, M10_1)
  const functions: FunctionDef[] = []
  const funcById = new Map<number, FunctionDef>()
  for (const decl of root.descendantsOfType('function_declaration')) {
    const name = decl.namedChildren.find((n) => n.type === 'simple_identifier')?.text
    if (!name) continue
    const fn: FunctionDef = { name, line: decl.startPosition.row + 1, calls: [] }
    functions.push(fn)
    funcById.set(decl.id, fn)
  }
  for (const call of root.descendantsOfType('call_expression')) {
    const name = kotlinCalleeName(call)
    if (!name) continue
    const owner = nearestAncestorOfType(call, 'function_declaration')
    const fn = owner ? funcById.get(owner.id) : undefined
    if (fn) fn.calls.push({ name, line: call.startPosition.row + 1 })
  }

  return {
    file,
    packageName,
    topLevelNames,
    imports,
    supertypes: extractKotlinSupertypes(root),
    functions,
    logSites: extractKotlinLogSites(root, file),
    nativeMethods: [],
    jniFunctions: []
  }
}

// --- 로그 호출 추출(로그→코드 역추적). (04 §5, M11_4) ---

function lastIdentifier(text: string): string {
  const i = text.lastIndexOf('.')
  return i >= 0 ? text.slice(i + 1) : text
}

function stripQuotes(text: string): string {
  return text.length >= 2 && (text.startsWith('"') || text.startsWith("'"))
    ? text.slice(1, -1)
    : text
}

/** 리터럴 텍스트를 포맷 지정자(%s 등) 기준으로 정적/가변 세그먼트로 나눈다. */
function literalSegs(inner: string): LogTemplateSeg[] {
  const segs: LogTemplateSeg[] = []
  let last = 0
  FORMAT_SPECIFIER.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = FORMAT_SPECIFIER.exec(inner)) !== null) {
    if (m.index > last) segs.push({ lit: inner.slice(last, m.index) })
    segs.push({ wildcard: true })
    last = m.index + m[0].length
  }
  if (last < inner.length) segs.push({ lit: inner.slice(last) })
  return segs
}

/** Java 메시지 인자 → 템플릿 세그먼트(문자열 리터럴/문자열 결합 처리). */
function javaMessageTemplate(node: Node): LogTemplateSeg[] {
  if (node.type === 'string_literal') return literalSegs(stripQuotes(node.text))
  if (node.type === 'binary_expression') {
    const op = node.childForFieldName('operator')?.text
    const left = node.childForFieldName('left')
    const right = node.childForFieldName('right')
    if (op === '+' && left && right) {
      return [...javaMessageTemplate(left), ...javaMessageTemplate(right)]
    }
  }
  return [{ wildcard: true }]
}

/** Kotlin 문자열 리터럴 → 템플릿 세그먼트(content=정적, interpolation=가변). */
function kotlinStringTemplate(node: Node): LogTemplateSeg[] {
  const kids = node.namedChildren
  if (kids.length === 0) return literalSegs(stripQuotes(node.text))
  const segs: LogTemplateSeg[] = []
  for (const k of kids) {
    if (k.type.includes('content')) segs.push(...literalSegs(k.text))
    else segs.push({ wildcard: true })
  }
  return segs
}

function isStringNode(node: Node): boolean {
  return node.type === 'string_literal' || node.type.includes('string_literal')
}

function makeSite(
  file: ScannedFile,
  line: number,
  method: string,
  msgNode: Node,
  tagNode: Node | null,
  segs: LogTemplateSeg[]
): LogSite | null {
  const pattern = buildLogPattern(segs)
  if (!pattern) return null
  const tag = tagNode && isStringNode(tagNode) ? stripQuotes(tagNode.text) : null
  return {
    file: file.relativePath,
    line,
    level: LOG_METHODS[method] ?? null,
    tag,
    format: msgNode.text,
    pattern
  }
}

function extractJavaLogSites(root: Node, file: ScannedFile): LogSite[] {
  const sites: LogSite[] = []
  for (const call of root.descendantsOfType('method_invocation')) {
    const method = call.childForFieldName('name')?.text
    const obj = call.childForFieldName('object')
    if (!method || !obj || !(method in LOG_METHODS)) continue
    if (!LOG_RECEIVERS.has(lastIdentifier(obj.text))) continue
    const args = call.childForFieldName('arguments')?.namedChildren ?? []
    if (args.length === 0) continue
    const isTimber = lastIdentifier(obj.text) === 'Timber'
    const msgNode = isTimber ? args[0] : args.length >= 2 ? args[1] : args[0]
    const tagNode = isTimber ? null : args.length >= 2 ? args[0] : null
    const site = makeSite(
      file,
      call.startPosition.row + 1,
      method,
      msgNode,
      tagNode,
      javaMessageTemplate(msgNode)
    )
    if (site) sites.push(site)
  }
  return sites
}

function extractKotlinLogSites(root: Node, file: ScannedFile): LogSite[] {
  const sites: LogSite[] = []
  for (const call of root.descendantsOfType('call_expression')) {
    const callee = call.namedChildren[0]
    if (!callee || callee.type !== 'navigation_expression') continue
    const ids = callee.descendantsOfType('simple_identifier')
    if (ids.length < 2) continue
    const method = ids[ids.length - 1].text
    const receiver = ids[ids.length - 2].text
    if (!(method in LOG_METHODS) || !LOG_RECEIVERS.has(receiver)) continue

    const suffix = call.namedChildren.find((c) => c.type === 'call_suffix')
    const valueArguments = suffix?.namedChildren.find((c) => c.type === 'value_arguments')
    const valueArgs = (valueArguments?.namedChildren ?? []).filter(
      (c) => c.type === 'value_argument'
    )
    const exprs = valueArgs.map((va) => va.namedChildren[0]).filter((n): n is Node => Boolean(n))
    if (exprs.length === 0) continue

    const isTimber = receiver === 'Timber'
    const msgNode = isTimber ? exprs[0] : exprs.length >= 2 ? exprs[1] : exprs[0]
    const tagNode = isTimber ? null : exprs.length >= 2 ? exprs[0] : null
    const segs: LogTemplateSeg[] = isStringNode(msgNode)
      ? kotlinStringTemplate(msgNode)
      : [{ wildcard: true }]
    const site = makeSite(file, call.startPosition.row + 1, method, msgNode, tagNode, segs)
    if (site) sites.push(site)
  }
  return sites
}
