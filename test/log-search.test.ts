import { describe, it, expect } from 'vitest'
import { searchMatches } from '../src/shared/log-search'

const lines = [
  'D MainActivity: onCreate()',
  'I Repository: load() fetching',
  'E Repository: load() failed: timeout',
  'W ApiClient: get() retry'
]
const all = [0, 1, 2, 3]

describe('searchMatches — 로그 검색 (M11_6)', () => {
  it('빈 질의는 매치 없음', () => {
    expect(searchMatches(lines, all, '', false)).toEqual([])
  })

  it('부분 일치(대소문자 무시)', () => {
    expect(searchMatches(lines, all, 'repository', false)).toEqual([1, 2])
  })

  it('정규식 검색', () => {
    expect(searchMatches(lines, all, 'load\\(\\) (fetching|failed)', true)).toEqual([1, 2])
  })

  it('표시 중(필터 통과) 인덱스 위에서만 검색한다', () => {
    // 인덱스 2,3만 표시된 상태에서 'load' 검색 → 2만
    expect(searchMatches(lines, [2, 3], 'load', false)).toEqual([2])
  })

  it('잘못된 정규식은 매치 없음', () => {
    expect(searchMatches(lines, all, '[', true)).toEqual([])
  })
})
