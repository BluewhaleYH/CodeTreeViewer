import type { ElementDefinition } from 'cytoscape'
import type { CodeGraph } from '../../../shared/graph'

/** CodeGraph를 Cytoscape elements로 변환한다. (03 §7) */
export function toCytoscapeElements(graph: CodeGraph): ElementDefinition[] {
  const nodes: ElementDefinition[] = graph.nodes.map((node) => ({
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
