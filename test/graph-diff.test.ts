import { describe, it, expect } from 'vitest'
import { diffGraphs, compareStatuses } from '../src/renderer/src/graph/graph-diff'
import type { CodeGraph, GraphEdge, GraphNode } from '../src/shared/graph'

function node(id: string): GraphNode {
  return {
    id,
    kind: 'file',
    name: id,
    path: id,
    language: 'kotlin',
    domain: 'app',
    external: false,
    line: null
  }
}
function edge(id: string, from: string, to: string): GraphEdge {
  return { id, type: 'file-dependency', from, to, line: null }
}

describe('diffGraphs — 영향 범위 (M12_4)', () => {
  it('추가/삭제 노드와 엣지 수를 계산한다', () => {
    const before: CodeGraph = {
      nodes: [node('a'), node('b')],
      edges: [edge('e1', 'a', 'b')]
    }
    const after: CodeGraph = {
      nodes: [node('a'), node('c')], // b 삭제, c 추가
      edges: [edge('e2', 'a', 'c')] // e1 삭제, e2 추가
    }
    expect(diffGraphs(before, after)).toEqual({
      addedNodes: ['c'],
      removedNodes: ['b'],
      addedEdges: 1,
      removedEdges: 1
    })
  })

  it('변화 없으면 모두 0/빈 배열', () => {
    const g: CodeGraph = { nodes: [node('a')], edges: [edge('e', 'a', 'a')] }
    expect(diffGraphs(g, g)).toEqual({
      addedNodes: [],
      removedNodes: [],
      addedEdges: 0,
      removedEdges: 0
    })
  })
})

describe('compareStatuses — 전/후 비교 (M14_3)', () => {
  it('합집합 노드에 added/removed/common 상태를 매긴다', () => {
    const before: CodeGraph = { nodes: [node('a'), node('b')], edges: [edge('e1', 'a', 'b')] }
    const after: CodeGraph = { nodes: [node('a'), node('c')], edges: [edge('e2', 'a', 'c')] }
    const { nodes, edges } = compareStatuses(before, after)
    const byId = new Map(nodes.map((n) => [n.node.id, n.status]))
    expect(byId.get('a')).toBe('common')
    expect(byId.get('c')).toBe('added')
    expect(byId.get('b')).toBe('removed')
    const eById = new Map(edges.map((e) => [e.edge.id, e.status]))
    expect(eById.get('e2')).toBe('added')
    expect(eById.get('e1')).toBe('removed')
  })
})
