import type { CodeGraph } from '../../../shared/graph'

/**
 * 트리 접기/펼치기 로직(순수). (03 §4)
 * 부모→자식 인접(엣지 from=부모, to=자식)을 만들고, 접힌 노드의 자손을 숨김 집합으로 계산한다.
 * 주의(MVP 한계): 자식이 여러 부모를 가지면, 한 부모만 접혀도 숨겨진다(엄밀한 다중부모 판정은 추후).
 */

export function buildChildAdjacency(graph: CodeGraph): Map<string, string[]> {
  const adjacency = new Map<string, string[]>()
  for (const edge of graph.edges) {
    const children = adjacency.get(edge.from) ?? []
    children.push(edge.to)
    adjacency.set(edge.from, children)
  }
  return adjacency
}

/** 접힌 노드들의 모든 자손 id(접힌 노드 자체는 제외). 사이클 안전. */
export function hiddenNodeIds(
  collapsed: ReadonlySet<string>,
  childAdjacency: Map<string, string[]>
): Set<string> {
  const hidden = new Set<string>()
  for (const root of collapsed) {
    const stack = [...(childAdjacency.get(root) ?? [])]
    while (stack.length > 0) {
      const id = stack.pop() as string
      if (hidden.has(id)) continue
      hidden.add(id)
      for (const child of childAdjacency.get(id) ?? []) stack.push(child)
    }
  }
  return hidden
}
