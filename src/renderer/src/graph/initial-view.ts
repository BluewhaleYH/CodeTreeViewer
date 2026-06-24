import type { CodeGraph } from '../../../shared/graph'

/**
 * 초기 뷰 선택. (03 §5.1, 00 §10 D15)
 * - 렌더 대상(파일+외부) 노드가 maxNodes 이하 → 전체.
 * - 초과 → 진입점(incoming 없는 노드)에서 BFS로 maxNodes까지만 초기 표시(점진 확장은 M5_6).
 * function 노드는 렌더 대상이 아니므로 제외하고 계산한다.
 */

/**
 * 초기 렌더 노드 상한. 대규모 프로젝트(수천 파일)에서 탭 전환마다 dagre 레이아웃 +
 * 캔버스 렌더가 동기로 돌아 UI가 멈추는 것을 막기 위해, 진입점 중심 일부만 먼저 그린다.
 * 나머지는 노드 클릭으로 점진 확장한다. (TODO_MORE 성능)
 */
export const DEFAULT_MAX_INITIAL_NODES = 600

export interface InitialView {
  /** 초기 렌더할 부분 그래프(파일+외부). */
  graph: CodeGraph
  /** 전체 대비 축소 여부(대규모). */
  reduced: boolean
  /** 렌더 대상 전체 노드 수. */
  totalRenderable: number
}

/**
 * 포커스 뷰 선택(검색에서 파일을 고르면 그 파일을 중심으로 다시 그리기). (TODO_MORE)
 * 중심 노드에서 **무방향(의존/피의존 양방향)** BFS로 가까운 렌더 노드(파일+외부)를
 * maxNodes까지 모은다. 같은 거리(depth)의 노드는 어느 파일이든 모두 포함한다.
 * (A.java의 함수를 B.java가 호출하면 B.java도 file-call 엣지로 이웃이 되어 포함된다.)
 * function 노드는 렌더 대상이 아니므로 제외한다.
 */
export function selectFocusView(
  full: CodeGraph,
  focusId: string,
  maxNodes: number = DEFAULT_MAX_INITIAL_NODES
): CodeGraph {
  const renderNodes = full.nodes.filter((node) => node.kind !== 'function')
  const renderable = new Set(renderNodes.map((n) => n.id))
  if (!renderable.has(focusId)) {
    // 중심이 렌더 대상이 아니면(함수 등) 빈 그래프 → 호출부에서 일반 뷰로 폴백.
    return { nodes: [], edges: [] }
  }
  // 무방향 인접(렌더 노드 사이 엣지만).
  const adjacency = new Map<string, string[]>()
  const link = (a: string, b: string): void => {
    const arr = adjacency.get(a) ?? []
    arr.push(b)
    adjacency.set(a, arr)
  }
  for (const e of full.edges) {
    if (renderable.has(e.from) && renderable.has(e.to)) {
      link(e.from, e.to)
      link(e.to, e.from)
    }
  }
  // 중심에서 거리순(BFS)으로 maxNodes까지. 가까운 거리부터 채우며 상한을 넘지 않는다.
  const selected = new Set<string>([focusId])
  let frontier = [focusId]
  while (frontier.length > 0 && selected.size < maxNodes) {
    const next: string[] = []
    for (const id of frontier) {
      for (const nb of adjacency.get(id) ?? []) {
        if (!selected.has(nb)) {
          selected.add(nb)
          next.push(nb)
          if (selected.size >= maxNodes) break
        }
      }
      if (selected.size >= maxNodes) break
    }
    frontier = next
  }
  const nodes = renderNodes.filter((n) => selected.has(n.id))
  const edges = full.edges.filter((e) => selected.has(e.from) && selected.has(e.to))
  return { nodes, edges }
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
