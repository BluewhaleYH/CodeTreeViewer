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

export type CompareStatus = 'added' | 'removed' | 'common'

export interface CompareNode {
  node: import('../../../shared/graph').GraphNode
  status: CompareStatus
}
export interface CompareEdge {
  edge: import('../../../shared/graph').GraphEdge
  status: CompareStatus
}

/**
 * 스냅샷(before)과 현재(after)의 합집합에 상태를 매긴다(전/후 비교 모드). (03, 06 §5, M14_3)
 * after에만 = added, before에만 = removed, 둘 다 = common.
 */
export function compareStatuses(
  before: CodeGraph,
  after: CodeGraph
): { nodes: CompareNode[]; edges: CompareEdge[] } {
  const beforeN = new Set(before.nodes.map((n) => n.id))
  const afterN = new Map(after.nodes.map((n) => [n.id, n]))
  const nodes: CompareNode[] = []
  for (const n of after.nodes)
    nodes.push({ node: n, status: beforeN.has(n.id) ? 'common' : 'added' })
  for (const n of before.nodes) if (!afterN.has(n.id)) nodes.push({ node: n, status: 'removed' })

  const beforeE = new Set(before.edges.map((e) => e.id))
  const afterE = new Map(after.edges.map((e) => [e.id, e]))
  const edges: CompareEdge[] = []
  for (const e of after.edges)
    edges.push({ edge: e, status: beforeE.has(e.id) ? 'common' : 'added' })
  for (const e of before.edges) if (!afterE.has(e.id)) edges.push({ edge: e, status: 'removed' })

  return { nodes, edges }
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
