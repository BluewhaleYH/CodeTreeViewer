import type { CodeGraph } from '../../../shared/graph'

/**
 * 재분석 전/후 그래프 차이(영향 범위). (06 §5, M12_4)
 * 추가/삭제된 노드·엣지를 산출한다(변경 노드는 호출 측에서 편집 파일로 보강).
 */
export interface GraphDiff {
  addedNodes: string[]
  removedNodes: string[]
  addedEdges: number
  removedEdges: number
}

export function diffGraphs(before: CodeGraph, after: CodeGraph): GraphDiff {
  const beforeNodes = new Set(before.nodes.map((n) => n.id))
  const afterNodes = new Set(after.nodes.map((n) => n.id))
  const beforeEdges = new Set(before.edges.map((e) => e.id))
  const afterEdges = new Set(after.edges.map((e) => e.id))
  return {
    addedNodes: after.nodes.map((n) => n.id).filter((id) => !beforeNodes.has(id)),
    removedNodes: before.nodes.map((n) => n.id).filter((id) => !afterNodes.has(id)),
    addedEdges: after.edges.filter((e) => !beforeEdges.has(e.id)).length,
    removedEdges: before.edges.filter((e) => !afterEdges.has(e.id)).length
  }
}
