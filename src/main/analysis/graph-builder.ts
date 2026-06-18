import type { CodeGraph, EdgeType, GraphEdge, GraphNode } from '../../shared/graph'

/**
 * 노드/엣지를 중복 없이 누적하는 그래프 빌더. (02 §4)
 * 추출(M4_2~)이 이 빌더로 그래프를 구성한다. 순수 로직 → 단위 테스트 대상.
 */
export class GraphBuilder {
  private readonly nodes = new Map<string, GraphNode>()
  private readonly edges = new Map<string, GraphEdge>()

  /** 노드를 추가한다. 같은 id가 있으면 기존 노드를 유지(첫 등록 우선)하고 반환한다. */
  addNode(node: GraphNode): GraphNode {
    const existing = this.nodes.get(node.id)
    if (existing) return existing
    this.nodes.set(node.id, node)
    return node
  }

  hasNode(id: string): boolean {
    return this.nodes.has(id)
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id)
  }

  /**
   * 엣지를 추가한다(from=부모, to=자식). 동일 (type, from, to)는 1개로 중복 제거.
   * 자기 참조(from===to)는 무시한다. 반환: 추가/기존 엣지, 자기 참조 시 null.
   */
  addEdge(type: EdgeType, from: string, to: string, line: number | null = null): GraphEdge | null {
    if (from === to) return null
    const id = `${type}:${from}->${to}`
    const existing = this.edges.get(id)
    if (existing) return existing
    const edge: GraphEdge = { id, type, from, to, line }
    this.edges.set(id, edge)
    return edge
  }

  nodeCount(): number {
    return this.nodes.size
  }

  edgeCount(): number {
    return this.edges.size
  }

  /** 결정적 순서(id 정렬)로 그래프를 산출한다. */
  build(): CodeGraph {
    const byId = (a: { id: string }, b: { id: string }): number => a.id.localeCompare(b.id)
    return {
      nodes: [...this.nodes.values()].sort(byId),
      edges: [...this.edges.values()].sort(byId)
    }
  }
}
