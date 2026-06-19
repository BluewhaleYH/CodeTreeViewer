import { describe, it, expect } from 'vitest'
import { parseLogcatLine, parseAll } from '../src/renderer/src/log/logcat-parse'
import { filterIndices, compileFilter, EMPTY_FILTER } from '../src/renderer/src/log/log-filter'

const LINES = [
  '06-19 14:22:01.118  1234  1300 D MainActivity: onCreate()',
  '06-19 14:22:01.130  1234  1300 I Repository: load() fetching',
  '06-19 14:22:01.400  1234  1305 E Repository: load() failed: timeout',
  '06-19 14:22:01.402  1234  1300 W LoginViewModel: onRetry()',
  'plain text line without logcat format'
]
const PARSED = parseAll(LINES)

describe('logcat 파싱 (M11_3)', () => {
  it('threadtime 라인을 필드로 분해한다', () => {
    const f = parseLogcatLine(LINES[0])
    expect(f).toEqual({
      time: '06-19 14:22:01.118',
      pid: 1234,
      tid: 1300,
      level: 'D',
      tag: 'MainActivity',
      message: 'onCreate()'
    })
  })

  it('메시지에 콜론이 있어도 태그는 첫 콜론까지', () => {
    const f = parseLogcatLine(LINES[2])
    expect(f?.tag).toBe('Repository')
    expect(f?.message).toBe('load() failed: timeout')
  })

  it('형식이 아니면 null(일반 텍스트)', () => {
    expect(parseLogcatLine(LINES[4])).toBeNull()
  })
})

describe('로그 필터 (M11_3)', () => {
  it('빈 필터는 전체 인덱스', () => {
    expect(filterIndices(LINES, PARSED, EMPTY_FILTER)).toEqual([0, 1, 2, 3, 4])
  })

  it('레벨 필터: E/W만 (일반 텍스트 라인은 레벨 필터 통과)', () => {
    const idx = filterIndices(LINES, PARSED, {
      ...EMPTY_FILTER,
      levels: new Set(['E', 'W'])
    })
    expect(idx).toEqual([2, 3, 4]) // E, W, 그리고 일반 텍스트
  })

  it('태그 필터(부분·대소문자 무시), 일반 텍스트는 제외', () => {
    const idx = filterIndices(LINES, PARSED, { ...EMPTY_FILTER, tag: 'repo' })
    expect(idx).toEqual([1, 2])
  })

  it('텍스트 필터(부분 일치)', () => {
    const idx = filterIndices(LINES, PARSED, { ...EMPTY_FILTER, text: 'failed' })
    expect(idx).toEqual([2])
  })

  it('정규식 필터', () => {
    const idx = filterIndices(LINES, PARSED, {
      ...EMPTY_FILTER,
      text: 'load\\(\\) (fetching|failed)',
      regex: true
    })
    expect(idx).toEqual([1, 2])
  })

  it('잘못된 정규식은 텍스트 조건 미적용(전체 통과)', () => {
    const idx = filterIndices(LINES, PARSED, { ...EMPTY_FILTER, text: '[', regex: true })
    expect(idx).toEqual([0, 1, 2, 3, 4])
  })

  it('레벨 + 텍스트 결합', () => {
    const idx = filterIndices(LINES, PARSED, {
      ...EMPTY_FILTER,
      levels: new Set(['E']),
      text: 'load'
    })
    expect(idx).toEqual([2])
  })

  it('compileFilter 술어를 직접 쓸 수 있다', () => {
    const pred = compileFilter({ ...EMPTY_FILTER, levels: new Set(['I']) })
    expect(pred(LINES[1], PARSED[1])).toBe(true)
    expect(pred(LINES[0], PARSED[0])).toBe(false)
  })
})
