import { describe, it, expect } from 'vitest'
import { toCytoscapeElements } from '../src/renderer/src/graph/to-cytoscape'
import type { CodeGraph } from '../src/shared/graph'

describe('toCytoscapeElements (M5_2)', () => {
  const graph: CodeGraph = {
    nodes: [
      {
        id: 'file:a/A.java',
        kind: 'file',
        name: 'A.java',
        path: 'a/A.java',
        language: 'java',
        domain: 'a',
        external: false,
        line: null
      },
      {
        id: 'external:ext.Lib',
        kind: 'file',
        name: 'ext.Lib',
        path: 'ext.Lib',
        language: null,
        domain: null,
        external: true,
        line: null
      },
      {
        id: 'function:a/A.java#foo',
        kind: 'function',
        name: 'foo',
        path: 'a/A.java',
        language: 'java',
        domain: 'a',
        external: false,
        line: 2
      }
    ],
    edges: [
      {
        id: 'file-dependency:file:a/A.java->external:ext.Lib',
        type: 'file-dependency',
        from: 'file:a/A.java',
        to: 'external:ext.Lib',
        line: 3
      }
    ]
  }

  it('파일/외부 노드와 엣지를 변환하고 function 노드는 제외한다', () => {
    const elements = toCytoscapeElements(graph)
    // file + external + edge = 3 (function 제외)
    expect(elements).toHaveLength(3)
    expect(elements.some((e) => e.data.id === 'function:a/A.java#foo')).toBe(false)
    const nodeA = elements.find((e) => e.data.id === 'file:a/A.java')
    expect(nodeA?.data.label).toBe('A.java')
    expect(nodeA?.data.external).toBe('false')
    const ext = elements.find((e) => e.data.id === 'external:ext.Lib')
    expect(ext?.data.external).toBe('true')
    const edge = elements.find((e) => e.data.source === 'file:a/A.java')
    expect(edge?.data.target).toBe('external:ext.Lib')
  })
})
