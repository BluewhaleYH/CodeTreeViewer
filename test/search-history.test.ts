import { describe, it, expect } from 'vitest'
import { SearchHistory } from '../src/renderer/src/search/search-history'

describe('검색 히스토리 (M7_5)', () => {
  it('최근 검색어를 앞에 보관한다', () => {
    const h = new SearchHistory()
    h.add('a')
    h.add('b')
    expect(h.recent()).toEqual(['b', 'a'])
  })

  it('중복은 앞으로 끌어올린다', () => {
    const h = new SearchHistory()
    h.add('a')
    h.add('b')
    h.add('a')
    expect(h.recent()).toEqual(['a', 'b'])
  })

  it('최대 개수를 넘기지 않는다', () => {
    const h = new SearchHistory(3)
    h.add('a')
    h.add('b')
    h.add('c')
    h.add('d')
    expect(h.recent()).toEqual(['d', 'c', 'b'])
  })

  it('공백 질의는 무시한다', () => {
    const h = new SearchHistory()
    h.add('  ')
    expect(h.recent()).toEqual([])
  })
})
