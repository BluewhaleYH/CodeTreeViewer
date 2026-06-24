import { describe, it, expect } from 'vitest'
import { selectFocusView, selectInitialView } from '../src/renderer/src/graph/initial-view'
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

describe('포커스 뷰 선택 (TODO_MORE)', () => {
  it('중심 파일에서 양방향(의존+피의존) 이웃을 모두 포함한다', () => {
    // b ← a → ... 그리고 c → a (c가 a를 의존). 중심 a면 a,b,c 모두 포함.
    const graph: CodeGraph = {
      nodes: ['a', 'b', 'c', 'far'].map(fileNode),
      edges: [edge('a', 'b'), edge('c', 'a'), edge('far', 'c')]
    }
    const view = selectFocusView(graph, 'a', 100)
    const ids = view.nodes.map((n) => n.id).sort()
    // a의 1-홉: b(의존), c(피의존). far는 2-홉(c 경유) → 노드 상한 넉넉하면 포함.
    expect(ids).toContain('a')
    expect(ids).toContain('b')
    expect(ids).toContain('c')
  })

  it('교차 파일 호출처(file-call)도 포커스 이웃에 포함한다', () => {
    // A.java의 함수를 B.java가 호출 → file-call B→A. 중심 A면 B도 포함.
    const graph: CodeGraph = {
      nodes: ['A.java', 'B.java'].map(fileNode),
      edges: [{ id: 'fc', type: 'file-call', from: 'B.java', to: 'A.java', line: 1 }]
    }
    const view = selectFocusView(graph, 'A.java', 100)
    expect(view.nodes.map((n) => n.id).sort()).toEqual(['A.java', 'B.java'])
  })

  it('노드 상한을 넘지 않으며 가까운 거리부터 채운다', () => {
    // 별 모양: center에 직접 연결된 1..5 + 멀리 떨어진 far(2-홉)
    const graph: CodeGraph = {
      nodes: ['center', 'n1', 'n2', 'n3', 'far'].map(fileNode),
      edges: [edge('center', 'n1'), edge('center', 'n2'), edge('center', 'n3'), edge('n1', 'far')]
    }
    const view = selectFocusView(graph, 'center', 3)
    const ids = view.nodes.map((n) => n.id)
    expect(ids.length).toBeLessThanOrEqual(3)
    expect(ids).toContain('center') // 중심은 항상 포함
    expect(ids).not.toContain('far') // 2-홉은 상한에 막혀 제외
  })

  it('function 노드는 렌더 대상이 아니므로 제외한다', () => {
    const graph: CodeGraph = {
      nodes: [fileNode('a'), fileNode('b'), fnNode('a#m')],
      edges: [edge('a', 'b')]
    }
    const view = selectFocusView(graph, 'a', 100)
    expect(view.nodes.every((n) => n.kind === 'file')).toBe(true)
  })
})
