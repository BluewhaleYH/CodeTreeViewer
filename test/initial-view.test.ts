import { describe, it, expect } from 'vitest'
import { selectInitialView } from '../src/renderer/src/graph/initial-view'
import type { CodeGraph, GraphNode } from '../src/shared/graph'

function fileNode(id: string): GraphNode {
  return {
    id,
    kind: 'file',
    name: id,
    path: id,
    language: 'java',
    domain: null,
    external: false,
    line: null
  }
}

function fnNode(id: string): GraphNode {
  return { ...fileNode(id), kind: 'function' }
}

function edge(from: string, to: string): CodeGraph['edges'][number] {
  return { id: `e:${from}->${to}`, type: 'file-dependency', from, to, line: null }
}

describe('초기 뷰 선택 (M5_5)', () => {
  it('소규모는 전체를 반환(function 제외)', () => {
    const graph: CodeGraph = {
      nodes: [fileNode('a'), fileNode('b'), fnNode('a#m')],
      edges: [edge('a', 'b')]
    }
    const view = selectInitialView(graph, 100)
    expect(view.reduced).toBe(false)
    expect(view.graph.nodes.map((n) => n.id).sort()).toEqual(['a', 'b'])
    expect(view.totalRenderable).toBe(2)
  })

  it('대규모는 진입점 중심으로 maxNodes까지만', () => {
    // a → b → c → d (체인), 루트 a
    const graph: CodeGraph = {
      nodes: ['a', 'b', 'c', 'd'].map(fileNode),
      edges: [edge('a', 'b'), edge('b', 'c'), edge('c', 'd')]
    }
    const view = selectInitialView(graph, 2)
    expect(view.reduced).toBe(true)
    expect(view.graph.nodes).toHaveLength(2)
    // 진입점 a부터 포함
    expect(view.graph.nodes.map((n) => n.id)).toContain('a')
    expect(view.totalRenderable).toBe(4)
  })

  it('부분 그래프의 엣지는 양 끝이 선택된 것만', () => {
    const graph: CodeGraph = {
      nodes: ['a', 'b', 'c'].map(fileNode),
      edges: [edge('a', 'b'), edge('b', 'c')]
    }
    const view = selectInitialView(graph, 2)
    expect(
      view.graph.edges.every((e) => {
        const ids = new Set(view.graph.nodes.map((n) => n.id))
        return ids.has(e.from) && ids.has(e.to)
      })
    ).toBe(true)
  })
})
