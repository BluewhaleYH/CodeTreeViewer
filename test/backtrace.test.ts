import { describe, it, expect } from 'vitest'
import {
  buildCallerAdjacency,
  directCallers,
  callersUpToDepth,
  backtraceTree,
  expandableCallers,
  backtraceSubgraph
} from '../src/renderer/src/graph/backtrace'
import type { CodeGraph, GraphEdge, GraphNode } from '../src/shared/graph'

function fn(id: string): GraphNode {
  return {
    id,
    kind: 'function',
    name: id,
    path: 'p',
    language: 'kotlin',
    domain: 'app',
    external: false,
    line: 1
  }
}

function callEdge(from: string, to: string): GraphEdge {
  return { id: `function-call:${from}->${to}`, type: 'function-call', from, to, line: null }
}

// a → c, b → c, c → d (a,b가 c를 호출, c가 d를 호출)
const graph: CodeGraph = {
  nodes: [fn('a'), fn('b'), fn('c'), fn('d')],
  edges: [
    callEdge('a', 'c'),
    callEdge('b', 'c'),
    callEdge('c', 'd'),
    // file-dependency 엣지는 무시되어야 한다.
    { id: 'file-dependency:x->y', type: 'file-dependency', from: 'x', to: 'y', line: null }
  ]
}

describe('backtrace — 호출처 역추적 (M10_2)', () => {
  it('buildCallerAdjacency는 function-call 엣지를 역방향(피호출→호출처)으로 만든다', () => {
    const adj = buildCallerAdjacency(graph)
    expect((adj.get('c') ?? []).sort()).toEqual(['a', 'b'])
    expect(adj.get('d')).toEqual(['c'])
    expect(adj.has('y')).toBe(false) // file-dependency 무시
  })

  it('directCallers는 1-홉 호출처만 반환한다', () => {
    const adj = buildCallerAdjacency(graph)
    expect(directCallers('c', adj).sort()).toEqual(['a', 'b'])
    expect(directCallers('a', adj)).toEqual([]) // 진입점
  })

  it('callersUpToDepth는 지정 단계까지 호출처 체인을 모은다 (TODO_MORE)', () => {
    const adj = buildCallerAdjacency(graph)
    expect([...callersUpToDepth('d', adj, 1)].sort()).toEqual(['c', 'd'])
    expect([...callersUpToDepth('d', adj, 2)].sort()).toEqual(['a', 'b', 'c', 'd'])
    expect([...callersUpToDepth('d', adj, 6)].sort()).toEqual(['a', 'b', 'c', 'd']) // 체인 소진
  })

  it('callersUpToDepth는 사이클이 있어도 종료한다 (TODO_MORE)', () => {
    const cyc: CodeGraph = {
      nodes: [fn('x'), fn('y')],
      edges: [callEdge('x', 'y'), callEdge('y', 'x')]
    }
    const adj = buildCallerAdjacency(cyc)
    expect([...callersUpToDepth('x', adj, 10)].sort()).toEqual(['x', 'y'])
  })

  it('backtraceTree는 선택 노드만 sink로 두고 교차 엣지를 제거한다 (TODO_MORE)', () => {
    // a→c, b→c, c→d + 교차 a→b. d 선택 시 a→b(같은 depth)는 제거되어야 함.
    const g: CodeGraph = {
      nodes: [fn('a'), fn('b'), fn('c'), fn('d')],
      edges: [callEdge('a', 'c'), callEdge('b', 'c'), callEdge('c', 'd'), callEdge('a', 'b')]
    }
    const adj = buildCallerAdjacency(g)
    const displayed = callersUpToDepth('d', adj, 5)
    const tree = backtraceTree(displayed, g, 'd', adj)
    expect(tree.edges.map((e) => `${e.from}->${e.to}`).sort()).toEqual(['a->c', 'b->c', 'c->d'])
    const hasOut = (id: string): boolean => tree.edges.some((e) => e.from === id)
    expect(hasOut('d')).toBe(false) // d만 sink(리프)
    expect(hasOut('a')).toBe(true)
    expect(hasOut('b')).toBe(true)
  })

  it('expandableCallers는 아직 표시되지 않은 호출처를 가진 노드를 표시한다', () => {
    const adj = buildCallerAdjacency(graph)
    // c만 표시된 상태: c는 a,b를 더 펼칠 수 있다.
    expect([...expandableCallers(new Set(['c']), adj)]).toEqual(['c'])
    // a,b,c 표시: 더 펼칠 호출처 없음.
    expect([...expandableCallers(new Set(['a', 'b', 'c']), adj)]).toEqual([])
  })

  it('backtraceSubgraph는 표시 노드 + 그 사이 호출 엣지만 포함한다', () => {
    const sub = backtraceSubgraph(new Set(['a', 'c']), graph)
    expect(sub.nodes.map((n) => n.id).sort()).toEqual(['a', 'c'])
    expect(sub.edges.map((e) => e.id)).toEqual(['function-call:a->c'])
  })
})
