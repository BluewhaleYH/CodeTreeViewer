import { describe, it, expect } from 'vitest'
import { GraphBuilder } from '../src/main/analysis/graph-builder'
import {
  fileNodeId,
  functionNodeId,
  externalNodeId,
  type GraphNode
} from '../src/shared/graph'

function fileNode(relativePath: string, name: string): GraphNode {
  return {
    id: fileNodeId(relativePath),
    kind: 'file',
    name,
    path: relativePath,
    language: 'java',
    domain: null,
    external: false,
    line: null
  }
}

describe('graph id 헬퍼 (M4_1)', () => {
  it('노드 id가 종류별로 구분된다', () => {
    expect(fileNodeId('a/B.java')).toBe('file:a/B.java')
    expect(functionNodeId('a/B.java', 'm')).toBe('function:a/B.java#m')
    expect(externalNodeId('java.util.List')).toBe('external:java.util.List')
  })
})

describe('GraphBuilder (M4_1)', () => {
  it('같은 id 노드는 중복 추가되지 않는다', () => {
    const b = new GraphBuilder()
    b.addNode(fileNode('a/A.java', 'A'))
    b.addNode(fileNode('a/A.java', 'A-다른이름')) // 같은 id
    expect(b.nodeCount()).toBe(1)
    expect(b.getNode(fileNodeId('a/A.java'))?.name).toBe('A') // 첫 등록 유지
  })

  it('동일 (type,from,to) 엣지는 1개로 합쳐진다', () => {
    const b = new GraphBuilder()
    const from = fileNodeId('a/A.java')
    const to = fileNodeId('a/B.java')
    b.addEdge('file-dependency', from, to)
    b.addEdge('file-dependency', from, to, 12)
    expect(b.edgeCount()).toBe(1)
  })

  it('자기 참조 엣지는 무시한다', () => {
    const b = new GraphBuilder()
    const id = fileNodeId('a/A.java')
    expect(b.addEdge('file-dependency', id, id)).toBeNull()
    expect(b.edgeCount()).toBe(0)
  })

  it('방향: from=부모, to=자식이 보존된다', () => {
    const b = new GraphBuilder()
    const a = fileNodeId('A.java')
    const c = fileNodeId('B.java')
    const edge = b.addEdge('file-dependency', a, c, 3)
    expect(edge?.from).toBe(a)
    expect(edge?.to).toBe(c)
    expect(edge?.line).toBe(3)
  })

  it('build는 id 정렬된 결정적 그래프를 낸다', () => {
    const b = new GraphBuilder()
    b.addNode(fileNode('z/Z.java', 'Z'))
    b.addNode(fileNode('a/A.java', 'A'))
    b.addEdge('file-dependency', fileNodeId('a/A.java'), fileNodeId('z/Z.java'))
    const graph = b.build()
    expect(graph.nodes.map((n) => n.id)).toEqual(['file:a/A.java', 'file:z/Z.java'])
    expect(graph.edges).toHaveLength(1)
  })
})
