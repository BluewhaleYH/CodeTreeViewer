import { describe, it, expect } from 'vitest'
import { assignDomainColors, distinctDomains } from '../src/renderer/src/graph/domain-colors'
import type { CodeGraph, GraphNode } from '../src/shared/graph'

function node(id: string, domain: string | null, external = false): GraphNode {
  return { id, kind: 'file', name: id, path: id, language: 'java', domain, external, line: null }
}

describe('영역 색상 배정 (M6_4)', () => {
  const graph: CodeGraph = {
    nodes: [
      node('a1', 'app'),
      node('a2', 'app'),
      node('c1', 'core'),
      node('ext', null, true),
      { ...node('fn', 'app'), kind: 'function' }
    ],
    edges: []
  }

  it('파일 노드의 구분된 영역만 정렬해 추출(외부/함수 제외)', () => {
    expect(distinctDomains(graph)).toEqual(['app', 'core'])
  })

  it('영역마다 색을 배정하고 같은 영역은 같은 색', () => {
    const colors = assignDomainColors(graph)
    expect(colors.size).toBe(2)
    expect(colors.get('app')).toBeDefined()
    expect(colors.get('core')).toBeDefined()
    expect(colors.get('app')).not.toBe(colors.get('core'))
  })

  it('결정적: 같은 그래프는 같은 배정', () => {
    expect([...assignDomainColors(graph)]).toEqual([...assignDomainColors(graph)])
  })
})
