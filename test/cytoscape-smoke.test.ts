import { describe, it, expect } from 'vitest'
import cytoscape from 'cytoscape'

// 렌더 라이브러리(Cytoscape.js) 선택 확정 스모크. (M5_1)
// 실제 캔버스 렌더/레이아웃은 M5_2부터.
describe('Cytoscape.js 스모크 (M5_1)', () => {
  it('헤드리스 인스턴스로 노드/엣지 그래프를 구성한다', () => {
    const cy = cytoscape({
      headless: true,
      elements: [
        { data: { id: 'a' } },
        { data: { id: 'b' } },
        { data: { id: 'ab', source: 'a', target: 'b' } }
      ]
    })
    expect(cy.nodes().length).toBe(2)
    expect(cy.edges().length).toBe(1)
    expect(cy.getElementById('a').isNode()).toBe(true)
    cy.destroy()
  })
})
