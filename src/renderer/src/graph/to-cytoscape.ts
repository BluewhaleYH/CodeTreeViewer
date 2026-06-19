import type { ElementDefinition } from 'cytoscape'
import type { CodeGraph } from '../../../shared/graph'

/**
 * CodeGraph를 Cytoscape elements로 변환한다. (03 §7)
 * MVP 관계도/트리는 파일 의존성 레벨이므로 function 노드는 렌더하지 않는다(검색·라벨용 데이터로만 유지).
 */
export function toCytoscapeElements(graph: CodeGraph): ElementDefinition[] {
  const nodes: ElementDefinition[] = graph.nodes
    .filter((node) => node.kind !== 'function')
    .map((node) => ({
      data: {
        id: node.id,
        label: node.name,
        kind: node.kind,
        domain: node.domain ?? '',
        external: node.external ? 'true' : 'false'
      }
    }))

  const edges: ElementDefinition[] = graph.edges.map((edge) => ({
    data: {
      id: edge.id,
      source: edge.from,
      target: edge.to,
      type: edge.type
    }
  }))

  return [...nodes, ...edges]
}
