import { describe, it, expect } from 'vitest'
import {
  buildNeighborAdjacency,
  expandableNodeIds,
  neighborsToAdd
} from '../src/renderer/src/graph/expand'
import type { CodeGraph } from '../src/shared/graph'

function edge(from: string, to: string): CodeGraph['edges'][number] {
  return { id: `e:${from}->${to}`, type: 'file-dependency', from, to, line: null }
}

// a → b → c, a → d
const graph: CodeGraph = {
  nodes: [],
  edges: [edge('a', 'b'), edge('b', 'c'), edge('a', 'd')]
}

describe('점진 확장 (M5_6)', () => {
  it('무방향 이웃 인접을 만든다', () => {
    const adj = buildNeighborAdjacency(graph)
    expect([...(adj.get('a') ?? [])].sort()).toEqual(['b', 'd'])
    expect([...(adj.get('b') ?? [])].sort()).toEqual(['a', 'c'])
  })

  it('숨은 이웃이 있는 표시 노드가 확장 가능', () => {
    const adj = buildNeighborAdjacency(graph)
    const displayed = new Set(['a', 'b']) // c, d 숨김
    const expandable = expandableNodeIds(displayed, adj)
    // a는 d 숨김, b는 c 숨김 → 둘 다 확장 가능
    expect([...expandable].sort()).toEqual(['a', 'b'])
  })

  it('확장 시 숨은 이웃만 추가한다', () => {
    const adj = buildNeighborAdjacency(graph)
    const displayed = new Set(['a', 'b'])
    expect(neighborsToAdd('a', displayed, adj)).toEqual(['d'])
    expect(neighborsToAdd('b', displayed, adj)).toEqual(['c'])
  })

  it('모든 이웃이 표시 중이면 확장 가능 없음', () => {
    const adj = buildNeighborAdjacency(graph)
    const displayed = new Set(['a', 'b', 'c', 'd'])
    expect(expandableNodeIds(displayed, adj).size).toBe(0)
    expect(neighborsToAdd('a', displayed, adj)).toEqual([])
  })
})
