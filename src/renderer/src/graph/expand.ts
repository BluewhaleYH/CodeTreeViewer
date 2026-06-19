import type { CodeGraph } from '../../../shared/graph'

/**
 * 점진 확장 로직(순수). (03 §8, M5_6)
 * 대규모에서 초기 뷰는 일부만 표시되며(M5_5), 노드 클릭으로 숨은 이웃을 펼친다.
 * 이웃은 무방향(부모+자식). function 노드는 렌더 대상이 아니므로 엣지에 등장하지 않는다.
 */

/** 무방향 이웃 인접(파일/외부 노드). */
export function buildNeighborAdjacency(graph: CodeGraph): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>()
  const link = (a: string, b: string): void => {
    const set = adjacency.get(a) ?? new Set<string>()
    set.add(b)
    adjacency.set(a, set)
  }
  for (const edge of graph.edges) {
    link(edge.from, edge.to)
    link(edge.to, edge.from)
  }
  return adjacency
}

/** 표시 중이며 숨은 이웃을 가진 노드(=확장 가능). */
export function expandableNodeIds(
  displayed: ReadonlySet<string>,
  neighborAdjacency: Map<string, Set<string>>
): Set<string> {
  const expandable = new Set<string>()
  for (const id of displayed) {
    const neighbors = neighborAdjacency.get(id)
    if (!neighbors) continue
    for (const n of neighbors) {
      if (!displayed.has(n)) {
        expandable.add(id)
        break
      }
    }
  }
  return expandable
}

/** 특정 노드를 펼칠 때 새로 추가할 이웃 id. */
export function neighborsToAdd(
  id: string,
  displayed: ReadonlySet<string>,
  neighborAdjacency: Map<string, Set<string>>
): string[] {
  const neighbors = neighborAdjacency.get(id)
  if (!neighbors) return []
  return [...neighbors].filter((n) => !displayed.has(n))
}
