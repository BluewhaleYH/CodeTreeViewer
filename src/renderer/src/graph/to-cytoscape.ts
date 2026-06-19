import type { ElementDefinition } from 'cytoscape'
import type { CodeGraph, GraphNode } from '../../../shared/graph'
import { DEFAULT_NODE_COLOR, EXTERNAL_NODE_COLOR } from './domain-colors'

/**
 * CodeGraph를 Cytoscape elements로 변환한다. (03 §6, §7)
 * MVP 관계도/트리는 파일 의존성 레벨이므로 function 노드는 렌더하지 않는다(검색·라벨용 데이터로만 유지).
 * 노드 색은 영역(Domain) 색상 맵에서 가져온다. (M6_4)
 */
export function toCytoscapeElements(
  graph: CodeGraph,
  domainColors: Map<string, string> = new Map()
): ElementDefinition[] {
  const nodes: ElementDefinition[] = graph.nodes
    .filter((node) => node.kind !== 'function')
    .map((node) => ({
      data: {
        id: node.id,
        label: node.name,
        kind: node.kind,
        domain: node.domain ?? '',
        external: node.external ? 'true' : 'false',
        color: colorFor(node, domainColors)
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

function colorFor(node: GraphNode, domainColors: Map<string, string>): string {
  if (node.external) return EXTERNAL_NODE_COLOR
  return (node.domain && domainColors.get(node.domain)) || DEFAULT_NODE_COLOR
}
