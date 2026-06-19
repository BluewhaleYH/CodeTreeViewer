import { describe, it, expect } from 'vitest'
import { buildSearchIndex } from '../src/renderer/src/search/search-index'
import type { CodeGraph, GraphNode } from '../src/shared/graph'

function fileNode(id: string, name: string, external = false): GraphNode {
  return {
    id,
    kind: 'file',
    name,
    path: name,
    language: 'java',
    domain: null,
    external,
    line: null
  }
}
function fnNode(id: string, name: string, path: string, line: number): GraphNode {
  return { id, kind: 'function', name, path, language: 'java', domain: null, external: false, line }
}

describe('검색 인덱스 (M7_1)', () => {
  const graph: CodeGraph = {
    nodes: [
      fileNode('file:a/A.java', 'A.java'),
      fnNode('function:a/A.java#foo', 'foo', 'a/A.java', 3),
      fnNode('function:a/A.java#bar', 'bar', 'a/A.java', 7),
      fileNode('external:ext.Lib', 'ext.Lib', true)
    ],
    edges: []
  }

  it('파일명 + 함수명을 인덱싱하고 외부 노드는 제외한다', () => {
    const index = buildSearchIndex(graph)
    expect(index.map((e) => e.name).sort()).toEqual(['A.java', 'bar', 'foo'])
    expect(index.some((e) => e.id.startsWith('external:'))).toBe(false)
  })

  it('항목에 id/kind/path/line이 담긴다', () => {
    const index = buildSearchIndex(graph)
    const foo = index.find((e) => e.name === 'foo')
    expect(foo).toMatchObject({
      id: 'function:a/A.java#foo',
      kind: 'function',
      path: 'a/A.java',
      line: 3
    })
    const file = index.find((e) => e.name === 'A.java')
    expect(file).toMatchObject({ kind: 'file', line: null })
  })
})
