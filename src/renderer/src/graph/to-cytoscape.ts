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
  const includedNodes = graph.nodes.filter((node) => node.kind !== 'function')
  const includedIds = new Set(includedNodes.map((n) => n.id))
  const nodes: ElementDefinition[] = includedNodes.map((node) => ({
    data: {
      id: node.id,
      label: node.name,
      kind: node.kind,
      domain: node.domain ?? '',
      external: node.external ? 'true' : 'false',
      color: colorFor(node, domainColors)
    }
  }))

  // 양 끝이 모두 렌더되는 노드인 엣지만 포함한다. function-call 엣지(함수 노드 끝점)는
  // 함수 노드 미렌더(M10_2 전)이므로 자연히 제외 → 끊긴 엣지로 인한 cytoscape 오류 방지. (M10_1)
  const edges: ElementDefinition[] = graph.edges
    .filter((edge) => includedIds.has(edge.from) && includedIds.has(edge.to))
    .map((edge) => ({
      data: {
        id: edge.id,
        source: edge.from,
        target: edge.to,
        type: edge.type
      }
    }))

  return [...nodes, ...edges]
}

/**
 * 역추적(backtrace) 부분 그래프를 Cytoscape elements로 변환한다. (M10_2)
 * 파일 그래프와 달리 **함수 노드를 렌더**한다(호출처 체인). 색은 소속 영역 색을 따른다.
 */
export function backtraceElements(
  graph: CodeGraph,
  domainColors: Map<string, string> = new Map()
): ElementDefinition[] {
  const ids = new Set(graph.nodes.map((n) => n.id))
  const nodes: ElementDefinition[] = graph.nodes.map((node) => ({
    data: {
      id: node.id,
      label: node.name,
      kind: node.kind,
      domain: node.domain ?? '',
      external: node.external ? 'true' : 'false',
      color: colorFor(node, domainColors)
    }
  }))
  const edges: ElementDefinition[] = graph.edges
    .filter((edge) => ids.has(edge.from) && ids.has(edge.to))
    .map((edge) => ({
      data: { id: edge.id, source: edge.from, target: edge.to, type: edge.type }
    }))
  return [...nodes, ...edges]
}

function colorFor(node: GraphNode, domainColors: Map<string, string>): string {
  if (node.external) return EXTERNAL_NODE_COLOR
  return (node.domain && domainColors.get(node.domain)) || DEFAULT_NODE_COLOR
}
