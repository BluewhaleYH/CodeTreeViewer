import type { CodeGraph } from '../../../shared/graph'

/**
 * 함수 호출처 역추적(backtrace)용 순수 로직. (02 §6, 03 §5.3, M10_2)
 * function-call 엣지(부모=호출 함수 → 자식=피호출 함수)를 역방향으로 따라가
 * 선택 함수(마지막 노드)의 호출처 체인을 점진적으로 표시한다.
 */

/** 피호출 함수 id → 직접 호출처(caller) 함수 id 목록. (function-call 엣지 역방향) */
export function buildCallerAdjacency(graph: CodeGraph): Map<string, string[]> {
  const adjacency = new Map<string, string[]>()
  for (const edge of graph.edges) {
    if (edge.type !== 'function-call') continue
    const callers = adjacency.get(edge.to) ?? []
    callers.push(edge.from)
    adjacency.set(edge.to, callers)
  }
  return adjacency
}

/** functionId의 직접 호출처(1-홉). */
export function directCallers(
  functionId: string,
  callerAdjacency: Map<string, string[]>
): string[] {
  return callerAdjacency.get(functionId) ?? []
}

/** displayed 중 아직 표시되지 않은 호출처를 가진(=더 확장 가능한) 함수 id 집합. */
export function expandableCallers(
  displayed: ReadonlySet<string>,
  callerAdjacency: Map<string, string[]>
): Set<string> {
  const out = new Set<string>()
  for (const id of displayed) {
    for (const caller of callerAdjacency.get(id) ?? []) {
      if (!displayed.has(caller)) {
        out.add(id)
        break
      }
    }
  }
  return out
}

/** displayed 함수 노드 + 그 사이 function-call 엣지로 구성된 부분 그래프. */
export function backtraceSubgraph(displayed: ReadonlySet<string>, graph: CodeGraph): CodeGraph {
  const nodes = graph.nodes.filter((n) => displayed.has(n.id))
  const edges = graph.edges.filter(
    (e) => e.type === 'function-call' && displayed.has(e.from) && displayed.has(e.to)
  )
  return { nodes, edges }
}
