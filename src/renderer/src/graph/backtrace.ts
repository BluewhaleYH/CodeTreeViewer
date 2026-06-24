import type { CodeGraph, EdgeType } from '../../../shared/graph'

/**
 * 호출처/의존처 역추적(backtrace)용 순수 로직. (02 §6, 03 §5.3, M10_2)
 * 대상 엣지(부모=의존/호출하는 쪽 → 자식=의존/피호출되는 쪽)를 역방향으로 따라가
 * 선택 노드(마지막 노드)의 역추적 체인을 점진적으로 표시한다.
 * - 함수 노드: function-call 엣지로 호출처를 거슬러 올라간다.
 * - 파일 노드: file-dependency·file-call 엣지로 그 파일을 의존/호출하는 쪽을 거슬러 올라간다. (TODO_MORE)
 */

/** 함수 노드 역추적에 사용하는 엣지 종류(호출 관계). */
export const FUNCTION_BACKTRACE_EDGES: readonly EdgeType[] = ['function-call']
/** 파일 노드 역추적에 사용하는 엣지 종류(파일 의존/호출 관계). */
export const FILE_BACKTRACE_EDGES: readonly EdgeType[] = ['file-dependency', 'file-call']

/** 피호출/피의존 노드 id → 직접 호출처/의존처 노드 id 목록. (대상 엣지 역방향) */
export function buildCallerAdjacency(
  graph: CodeGraph,
  edgeTypes: readonly EdgeType[] = FUNCTION_BACKTRACE_EDGES
): Map<string, string[]> {
  const adjacency = new Map<string, string[]>()
  for (const edge of graph.edges) {
    if (!edgeTypes.includes(edge.type)) continue
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

/**
 * functionId에서 호출처 체인을 depth 단계까지 따라가 표시할 노드 집합을 만든다(BFS). (TODO_MORE)
 * depth=1이면 직접 호출처까지. 사이클은 visited로 차단.
 */
export function callersUpToDepth(
  functionId: string,
  callerAdjacency: Map<string, string[]>,
  depth: number
): Set<string> {
  const displayed = new Set<string>([functionId])
  let frontier = [functionId]
  for (let d = 0; d < depth; d += 1) {
    const next: string[] = []
    for (const id of frontier) {
      for (const caller of callerAdjacency.get(id) ?? []) {
        if (!displayed.has(caller)) {
          displayed.add(caller)
          next.push(caller)
        }
      }
    }
    if (next.length === 0) break
    frontier = next
  }
  return displayed
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

/** displayed 노드 + 그 사이 대상 엣지로 구성된 부분 그래프. */
export function backtraceSubgraph(
  displayed: ReadonlySet<string>,
  graph: CodeGraph,
  edgeTypes: readonly EdgeType[] = FUNCTION_BACKTRACE_EDGES
): CodeGraph {
  const nodes = graph.nodes.filter((n) => displayed.has(n.id))
  const edges = graph.edges.filter(
    (e) => edgeTypes.includes(e.type) && displayed.has(e.from) && displayed.has(e.to)
  )
  return { nodes, edges }
}

/** rootId로부터 호출처 거리(역방향 BFS)를 displayed 범위에서 계산한다. */
export function backtraceDepths(
  rootId: string,
  callerAdjacency: Map<string, string[]>,
  displayed: ReadonlySet<string>
): Map<string, number> {
  const depth = new Map<string, number>([[rootId, 0]])
  let frontier = [rootId]
  let d = 0
  while (frontier.length > 0) {
    d += 1
    const next: string[] = []
    for (const id of frontier) {
      for (const caller of callerAdjacency.get(id) ?? []) {
        if (displayed.has(caller) && !depth.has(caller)) {
          depth.set(caller, d)
          next.push(caller)
        }
      }
    }
    frontier = next
  }
  return depth
}

/**
 * 역추적 트리: displayed 노드 + **선택 노드(root) 쪽으로 흐르는 엣지만** 남긴다. (TODO_MORE)
 * 대상 엣지 X→Y(X가 Y 호출/의존)는 Y가 root에 더 가까울 때(depth(Y) < depth(X))만 유지 →
 * 같은 depth/먼 depth로 가는 교차 엣지를 제거해 **root만 유일한 sink(리프)**가 되게 한다.
 */
export function backtraceTree(
  displayed: ReadonlySet<string>,
  graph: CodeGraph,
  rootId: string,
  callerAdjacency: Map<string, string[]>,
  edgeTypes: readonly EdgeType[] = FUNCTION_BACKTRACE_EDGES
): CodeGraph {
  const depth = backtraceDepths(rootId, callerAdjacency, displayed)
  const nodes = graph.nodes.filter((n) => displayed.has(n.id) && depth.has(n.id))
  const keep = new Set(nodes.map((n) => n.id))
  const edges = graph.edges.filter(
    (e) =>
      edgeTypes.includes(e.type) &&
      keep.has(e.from) &&
      keep.has(e.to) &&
      (depth.get(e.to) as number) < (depth.get(e.from) as number)
  )
  return { nodes, edges }
}
