import { describe, it, expect } from 'vitest'
import { buildChildAdjacency, hiddenNodeIds } from '../src/renderer/src/graph/tree-collapse'
import type { CodeGraph } from '../src/shared/graph'

function edge(from: string, to: string): CodeGraph['edges'][number] {
  return { id: `e:${from}->${to}`, type: 'file-dependency', from, to, line: null }
}

const graph: CodeGraph = {
  nodes: [],
  edges: [edge('a', 'b'), edge('b', 'c'), edge('b', 'd'), edge('a', 'e')]
}

describe('트리 접기/펼치기 (M5_4)', () => {
  it('부모→자식 인접을 만든다', () => {
    const adj = buildChildAdjacency(graph)
    expect(adj.get('a')?.sort()).toEqual(['b', 'e'])
    expect(adj.get('b')?.sort()).toEqual(['c', 'd'])
  })

  it('접힌 노드의 모든 자손을 숨긴다(자신은 제외)', () => {
    const adj = buildChildAdjacency(graph)
    const hidden = hiddenNodeIds(new Set(['a']), adj)
    expect([...hidden].sort()).toEqual(['b', 'c', 'd', 'e'])
    expect(hidden.has('a')).toBe(false)
  })

  it('중간 노드를 접으면 그 아래만 숨긴다', () => {
    const adj = buildChildAdjacency(graph)
    const hidden = hiddenNodeIds(new Set(['b']), adj)
    expect([...hidden].sort()).toEqual(['c', 'd'])
  })

  it('사이클이 있어도 무한 루프하지 않는다', () => {
    const cyclic: CodeGraph = { nodes: [], edges: [edge('a', 'b'), edge('b', 'a')] }
    const adj = buildChildAdjacency(cyclic)
    const hidden = hiddenNodeIds(new Set(['a']), adj)
    expect(hidden.has('b')).toBe(true)
  })
})
