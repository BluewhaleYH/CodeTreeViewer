import { basename } from 'node:path'
import { GraphBuilder } from './graph-builder'
import { externalNodeId, fileNodeId, functionNodeId, type CodeGraph } from '../../shared/graph'
import { classifyDomain, type DomainRule } from './domain'
import type { ScannedFile } from './scanner'
import type { FileInfo, ImportRef } from './extract'

/**
 * 파일 의존성 그래프를 만든다(import 기반). (02 §3, §4, §7.1, §9)
 * 방향: 부모=import 하는 파일, 자식=import 되는 파일. (§4.3)
 * - 프로젝트 내에서 해석되는 import → 내부 파일 엣지.
 * - 해석되지 않는 import(외부 라이브러리/SDK 등) → `external` 노드 + 엣지. (D9, §9)
 *
 * 오탐 방지(§7.1, 00 §9 C1):
 * - 해석은 FQN 정확 일치만 사용.
 * - 파일명→타입 인덱스는 Java만(공개 클래스=파일명 관례). Kotlin은 선언명만 사용
 *   (파일명≠클래스명이므로 파일명 기반은 가짜 일치를 만들 수 있음).
 */

function stripSourceExt(name: string): string {
  return name.replace(/\.(java|kt)$/i, '')
}

export function buildFileGraph(
  files: readonly ScannedFile[],
  infos: readonly FileInfo[],
  domainRules: readonly DomainRule[] = []
): CodeGraph {
  const builder = new GraphBuilder()

  // 1) 스캔된 모든 파일을 노드로. 영역(Domain) 분류 부여. (M4_5, D10)
  for (const file of files) {
    builder.addNode({
      id: fileNodeId(file.relativePath),
      kind: 'file',
      name: basename(file.relativePath),
      path: file.relativePath,
      language: file.language,
      domain: classifyDomain(file.relativePath, domainRules),
      external: false,
      line: null
    })
  }

  // 1-1) 함수/메서드 정의 노드(검색·라벨용, 호출 엣지 없음). 소속 파일의 영역을 따른다. (M4_4, M4_5)
  for (const info of infos) {
    const domain = classifyDomain(info.file.relativePath, domainRules)
    for (const fn of info.functions) {
      builder.addNode({
        id: functionNodeId(info.file.relativePath, fn.name),
        kind: 'function',
        name: fn.name,
        path: info.file.relativePath,
        language: info.file.language,
        domain,
        external: false,
        line: fn.line
      })
    }
  }

  // 2) 인덱스 구축: FQN(타입) → 파일, 패키지 → 파일 목록.
  const typeIndex = new Map<string, string>()
  const packageIndex = new Map<string, string[]>()
  for (const info of infos) {
    const pkg = info.packageName ?? ''
    const rel = info.file.relativePath

    const inPackage = packageIndex.get(pkg) ?? []
    inPackage.push(rel)
    packageIndex.set(pkg, inPackage)

    const names = new Set(info.topLevelNames)
    if (info.file.language === 'java') names.add(stripSourceExt(basename(rel)))
    for (const name of names) {
      const fqn = pkg ? `${pkg}.${name}` : name
      if (!typeIndex.has(fqn)) typeIndex.set(fqn, rel)
    }
  }

  // 2-1) 함수 호출 해석용 인덱스: 이름 → 함수 노드 id(전역/파일별). (M10_1)
  const fnGlobalByName = new Map<string, string[]>()
  const fnFileByName = new Map<string, Map<string, string[]>>()
  for (const info of infos) {
    const rel = info.file.relativePath
    const perFile = new Map<string, string[]>()
    fnFileByName.set(rel, perFile)
    for (const fn of info.functions) {
      const id = functionNodeId(rel, fn.name)
      pushTo(fnGlobalByName, fn.name, id)
      pushTo(perFile, fn.name, id)
    }
  }

  // 2-2) 보수적 호출 해석 → function-call 엣지(부모=호출하는 함수, 자식=호출되는 함수). (02 §6, D: 오탐 최소)
  //  - 같은 파일에 동일명 정의가 정확히 1개면 그 함수로.
  //  - 같은 파일에 여러 개(오버로드)면 모호 → 생략.
  //  - 파일에 없으면 프로젝트 전체에서 동일명이 유일할 때만.
  //  - 자기 호출(재귀)은 GraphBuilder가 자기참조로 무시.
  for (const info of infos) {
    const rel = info.file.relativePath
    const perFile = fnFileByName.get(rel)
    for (const fn of info.functions) {
      const callerId = functionNodeId(rel, fn.name)
      for (const call of fn.calls) {
        const calleeId = resolveCall(call.name, perFile, fnGlobalByName)
        if (calleeId) builder.addEdge('function-call', callerId, calleeId, call.line)
      }
    }
  }

  // 3) import 해석 → 내부 엣지 또는 외부 노드.
  for (const info of infos) {
    const fromId = fileNodeId(info.file.relativePath)
    for (const imp of info.imports) {
      const resolved = resolveImport(imp, typeIndex, packageIndex)
      if (resolved.length > 0) {
        for (const targetRel of resolved) {
          if (targetRel !== info.file.relativePath) {
            builder.addEdge('file-dependency', fromId, fileNodeId(targetRel), imp.line)
          }
        }
      } else {
        // 프로젝트 밖/미해결 → external 노드. (D9, §9)
        const extId = externalNodeId(imp.target)
        if (!builder.hasNode(extId)) {
          builder.addNode({
            id: extId,
            kind: 'file',
            name: imp.target,
            path: imp.target,
            language: null,
            domain: null,
            external: true,
            line: null
          })
        }
        builder.addEdge('file-dependency', fromId, extId, imp.line)
      }
    }
  }

  return builder.build()
}

function pushTo(map: Map<string, string[]>, key: string, value: string): void {
  const arr = map.get(key)
  if (arr) arr.push(value)
  else map.set(key, [value])
}

/**
 * 보수적 호출 해석. 같은 파일 우선(유일할 때), 없으면 프로젝트 전역 유일일 때만 해석. (02 §6)
 * 모호(동명이인 다수)하면 null → 엣지 생성 안 함(오탐 방지).
 */
function resolveCall(
  name: string,
  perFile: Map<string, string[]> | undefined,
  globalByName: Map<string, string[]>
): string | null {
  const inFile = perFile?.get(name)
  if (inFile) return inFile.length === 1 ? inFile[0] : null
  const global = globalByName.get(name)
  return global && global.length === 1 ? global[0] : null
}

function resolveImport(
  imp: ImportRef,
  typeIndex: Map<string, string>,
  packageIndex: Map<string, string[]>
): string[] {
  if (imp.kind === 'type') {
    const target = typeIndex.get(imp.target)
    return target ? [target] : []
  }
  return packageIndex.get(imp.target) ?? []
}
