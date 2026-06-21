import { describe, it, expect } from 'vitest'
import { visualRows, buildPrefix, wrappedRange } from '../src/renderer/src/log/log-wrap'

describe('visualRows — wrap 시각 행 수', () => {
  it('짧은 라인은 1행', () => {
    expect(visualRows(0, 80)).toBe(1)
    expect(visualRows(80, 80)).toBe(1)
  })
  it('행당 글자 수를 넘으면 올림으로 여러 행', () => {
    expect(visualRows(81, 80)).toBe(2)
    expect(visualRows(200, 80)).toBe(3)
  })
  it('charsPerRow가 0 이하면 1행으로 폴백', () => {
    expect(visualRows(500, 0)).toBe(1)
  })
})

describe('buildPrefix — 누적 픽셀 오프셋', () => {
  it('시각 행 수 × 행높이의 누적합', () => {
    // 라인별 시각행: [1, 2, 1], 행높이 18 → top 오프셋 [0, 18, 54, 72]
    expect(buildPrefix([1, 2, 1], 18)).toEqual([0, 18, 54, 72])
  })
  it('빈 입력은 [0]', () => {
    expect(buildPrefix([], 18)).toEqual([0])
  })
})

describe('wrappedRange — 가변 높이 가상 스크롤 범위', () => {
  // 5개 라인, 시각행 [1,1,3,1,1], 행높이 10 → prefix [0,10,20,50,60,70]
  const prefix = buildPrefix([1, 1, 3, 1, 1], 10)

  it('맨 위에서 보이는 구간 + 패딩', () => {
    const r = wrappedRange(0, 30, prefix, 0)
    expect(r.start).toBe(0)
    expect(r.padTop).toBe(0)
    // bottom=30 → prefix에서 30을 포함하는 라인은 index 2(prefix[2]=20<=30<50)
    expect(r.end).toBe(3)
    expect(r.padBottom).toBe(70 - prefix[3]) // 70-50=20
  })

  it('스크롤 중간 구간: 큰(접힌) 라인을 포함', () => {
    const r = wrappedRange(25, 20, prefix, 0)
    // top=25 → 라인2(20..50), bottom=45 → 라인2
    expect(r.start).toBe(2)
    expect(r.end).toBe(3)
    expect(r.padTop).toBe(20)
  })

  it('overscan을 적용해 위아래로 확장', () => {
    const r = wrappedRange(25, 20, prefix, 1)
    expect(r.start).toBe(1)
    expect(r.end).toBe(4)
  })

  it('빈 prefix는 0 범위', () => {
    const r = wrappedRange(0, 100, buildPrefix([], 10))
    expect(r).toEqual({ start: 0, end: 0, padTop: 0, padBottom: 0 })
  })

  it('총 높이 = 마지막 prefix, 패딩 합 + 렌더 높이가 일치', () => {
    const r = wrappedRange(0, 1000, prefix, 0) // 전체 보임
    expect(r.start).toBe(0)
    expect(r.end).toBe(5)
    expect(r.padTop).toBe(0)
    expect(r.padBottom).toBe(0)
  })
})
