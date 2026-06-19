import type Parser from 'web-tree-sitter'
import type { ScannedFile } from './scanner'

/**
 * 파스 트리에서 패키지/import/최상위 선언명을 추출한다. (02 §3, §4)
 * tree-sitter-kotlin이 일부 유효 코드에 ERROR를 내더라도 노드 쿼리로 추출(hasError 비의존).
 */

export interface ImportRef {
  /** 'type': 특정 타입 FQN, 'package': 와일드카드(패키지 전체). */
  kind: 'type' | 'package'
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

export interface FileInfo {
  file: ScannedFile
  packageName: string | null
  topLevelNames: string[]
  imports: ImportRef[]
  /** 함수/메서드 정의(검색·라벨용, 호출 관계 아님). (02 §1, §4.1, D7) */
  functions: FunctionDef[]
}

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
  return file.language === 'java'
    ? extractJava(tree.rootNode, file)
    : extractKotlin(tree.rootNode, file)
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

  return { file, packageName, topLevelNames, imports, functions }
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

  return { file, packageName, topLevelNames, imports, functions }
}
