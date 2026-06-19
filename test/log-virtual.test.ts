import { describe, it, expect } from 'vitest'
import { visibleRange } from '../src/renderer/src/log/log-virtual'

describe('visibleRange — 가상 스크롤 (M11_2)', () => {
  it('맨 위: 0부터 보이는 만큼 + overscan', () => {
    // viewport 180 / row 18 = 10행, overscan 5
    expect(visibleRange(0, 180, 18, 1000, 5)).toEqual({ start: 0, end: 15 })
  })

  it('스크롤 중간: first - overscan ~ first + visible + overscan', () => {
    // scrollTop 1800 → first=100. visible=10. overscan 5 → [95, 115)
    expect(visibleRange(1800, 180, 18, 1000, 5)).toEqual({ start: 95, end: 115 })
  })

  it('끝에서 total로 클램프된다', () => {
    // first=995, visible=10, overscan 5 → end min(1000, 1010)=1000, start 990
    expect(visibleRange(995 * 18, 180, 18, 1000, 5)).toEqual({ start: 990, end: 1000 })
  })

  it('total 0이면 빈 범위', () => {
    expect(visibleRange(0, 180, 18, 0)).toEqual({ start: 0, end: 0 })
  })

  it('음수 scrollTop은 0으로 처리', () => {
    expect(visibleRange(-50, 180, 18, 1000, 5)).toEqual({ start: 0, end: 15 })
  })

  it('rowHeight 0은 안전하게 빈 범위', () => {
    expect(visibleRange(0, 180, 0, 1000)).toEqual({ start: 0, end: 0 })
  })
})
