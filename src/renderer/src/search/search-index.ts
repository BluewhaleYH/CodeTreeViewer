import { fileNodeId, type CodeGraph } from '../../../shared/graph'
import type { SourceLanguage } from '../../../shared/analysis'

/**
 * 노드 이름 검색 인덱스. (05 §5)
 * 분석 그래프에서 파일명 + 함수/메서드 정의명을 모아 즉시 검색 가능한 항목으로 만든다.
 * 그래프(분석 결과)에서 파생되므로 재분석 시 자연히 갱신된다. (05 §5)
 */

export interface SearchEntry {
  /** 그래프 노드 id. 결과 선택 시 포커스 동기화에 사용. (03 §10) */
  id: string
  name: string
  kind: 'file' | 'function'
  /** 파일 노드는 자신의 경로, 함수 노드는 소속 파일 경로. */
  path: string
  language: SourceLanguage | null
  /** 함수 정의 라인(파일 노드는 null). */
  line: number | null
}

/**
 * 결과 선택 시 그래프에서 포커스할 노드 id. (03 §10, M7_4)
 * 함수는 렌더 대상이 아니므로 소속 파일 노드를 포커스한다.
 */
export function focusTargetId(entry: SearchEntry): string {
  return entry.kind === 'function' ? fileNodeId(entry.path) : entry.id
}

/**
 * 검색 인덱스를 만든다.
 * 대상: 프로젝트 내 파일 노드(외부 제외) + 함수 정의 노드. (05 §2)
 */
export function buildSearchIndex(graph: CodeGraph): SearchEntry[] {
  const entries: SearchEntry[] = []
  for (const node of graph.nodes) {
    if (node.kind === 'file' && !node.external) {
      entries.push({
        id: node.id,
        name: node.name,
        kind: 'file',
        path: node.path,
        language: node.language,
        line: null
      })
    } else if (node.kind === 'function') {
      entries.push({
        id: node.id,
        name: node.name,
        kind: 'function',
        path: node.path,
        language: node.language,
        line: node.line
      })
    }
  }
  return entries
}
