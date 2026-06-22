import type { CodeGraph } from '../../../shared/graph'

/**
 * 영역(Domain) 색상 배정. (03 §6, D10)
 * 도메인이 범용(모듈/디렉터리)이라 팔레트에서 자동 배정한다.
 * 정렬된 도메인 순서로 결정적 배정 → 동일 프로젝트는 항상 같은 색.
 */

// 영역 색은 가짓수를 적게 유지한다(많으면 구분이 흐려짐). 초과 도메인은 순환. (TODO_MORE)
const PALETTE = ['#4a9eff', '#e2b341', '#5fbf76', '#c678dd', '#e06c75']

export const DEFAULT_NODE_COLOR = '#4a9eff'
export const EXTERNAL_NODE_COLOR = '#555a60'

/** 렌더 대상(파일 노드)의 구분된 영역(정렬). */
export function distinctDomains(graph: CodeGraph): string[] {
  const domains = new Set<string>()
  for (const node of graph.nodes) {
    if (node.kind === 'file' && !node.external && node.domain) domains.add(node.domain)
  }
  return [...domains].sort()
}

export function assignDomainColors(graph: CodeGraph): Map<string, string> {
  const colors = new Map<string, string>()
  distinctDomains(graph).forEach((domain, i) => {
    colors.set(domain, PALETTE[i % PALETTE.length])
  })
  return colors
}
