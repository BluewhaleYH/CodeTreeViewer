import { basename } from 'node:path'
import { GraphBuilder } from './graph-builder'
import { fileNodeId, type CodeGraph } from '../../shared/graph'
import type { ScannedFile } from './scanner'
import type { FileInfo, ImportRef } from './extract'

/**
 * 파일 의존성 그래프를 만든다(import 기반). (02 §3, §4)
 * 방향: 부모=import 하는 파일, 자식=import 되는 파일. (§4.3)
 * 프로젝트 내에서 해석되는 import만 엣지로 만든다. 미해결 import(외부 라이브러리 등)는
 * 여기서는 보류하고, `external` 노드 분리는 M4_3에서 처리한다. (D9)
 */

function stripSourceExt(name: string): string {
  return name.replace(/\.(java|kt)$/i, '')
}

export function buildFileGraph(
  files: readonly ScannedFile[],
  infos: readonly FileInfo[]
): CodeGraph {
  const builder = new GraphBuilder()

  // 1) 스캔된 모든 파일을 노드로.
  for (const file of files) {
    builder.addNode({
      id: fileNodeId(file.relativePath),
      kind: 'file',
      name: basename(file.relativePath),
      path: file.relativePath,
      language: file.language,
      domain: null,
      external: false,
      line: null
    })
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
    names.add(stripSourceExt(basename(rel))) // 파일명(=Java 공개 클래스 관례) 보강
    for (const name of names) {
      const fqn = pkg ? `${pkg}.${name}` : name
      if (!typeIndex.has(fqn)) typeIndex.set(fqn, rel)
    }
  }

  // 3) import 해석 → 엣지.
  for (const info of infos) {
    const fromId = fileNodeId(info.file.relativePath)
    for (const imp of info.imports) {
      for (const targetRel of resolveImport(imp, typeIndex, packageIndex)) {
        if (targetRel !== info.file.relativePath) {
          builder.addEdge('file-dependency', fromId, fileNodeId(targetRel), imp.line)
        }
      }
    }
  }

  return builder.build()
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
