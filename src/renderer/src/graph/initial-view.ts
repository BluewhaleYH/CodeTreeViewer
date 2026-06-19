import type { CodeGraph } from '../../../shared/graph'

/**
 * 초기 뷰 선택. (03 §5.1, 00 §10 D15)
 * - 렌더 대상(파일+외부) 노드가 maxNodes 이하 → 전체.
 * - 초과 → 진입점(incoming 없는 노드)에서 BFS로 maxNodes까지만 초기 표시(점진 확장은 M5_6).
 * function 노드는 렌더 대상이 아니므로 제외하고 계산한다.
 */

export const DEFAULT_MAX_INITIAL_NODES = 2000

export interface InitialView {
  /** 초기 렌더할 부분 그래프(파일+외부). */
  graph: CodeGraph
  /** 전체 대비 축소 여부(대규모). */
  reduced: boolean
  /** 렌더 대상 전체 노드 수. */
  totalRenderable: number
}

export function selectInitialView(
  full: CodeGraph,
  maxNodes: number = DEFAULT_MAX_INITIAL_NODES
): InitialView {
  const renderNodes = full.nodes.filter((node) => node.kind !== 'function')
  const total = renderNodes.length
  const renderable = new Set(renderNodes.map((n) => n.id))
  // 렌더 노드 사이 엣지만(function-call 등 함수 노드 끝점 엣지는 제외). (M10_1)
  const renderEdges = full.edges.filter((e) => renderable.has(e.from) && renderable.has(e.to))

  if (total <= maxNodes) {
    return {
      graph: { nodes: renderNodes, edges: renderEdges },
      reduced: false,
      totalRenderable: total
    }
  }
  const incoming = new Set(full.edges.map((e) => e.to))
  const adjacency = new Map<string, string[]>()
  for (const edge of full.edges) {
    const arr = adjacency.get(edge.from) ?? []
    arr.push(edge.to)
    adjacency.set(edge.from, arr)
  }

  // 진입점(루트) = incoming 없는 렌더 노드.
  const queue: string[] = renderNodes.filter((n) => !incoming.has(n.id)).map((n) => n.id)
  const selected = new Set<string>()
  let head = 0
  while (head < queue.length && selected.size < maxNodes) {
    const id = queue[head++]
    if (selected.has(id) || !renderable.has(id)) continue
    selected.add(id)
    for (const child of adjacency.get(id) ?? []) {
      if (!selected.has(child)) queue.push(child)
    }
  }
  // 루트가 없거나(전부 사이클) 부족하면 남은 노드로 채운다.
  if (selected.size < maxNodes) {
    for (const node of renderNodes) {
      if (selected.size >= maxNodes) break
      selected.add(node.id)
    }
  }

  const nodes = renderNodes.filter((n) => selected.has(n.id))
  const edges = full.edges.filter((e) => selected.has(e.from) && selected.has(e.to))
  return { graph: { nodes, edges }, reduced: true, totalRenderable: total }
}
