import { describe, it, expect } from 'vitest'
import { splitLines } from '../src/renderer/src/log/log-lines'

describe('splitLines (M11_1)', () => {
  it('빈 문자열은 빈 배열', () => {
    expect(splitLines('')).toEqual([])
  })

  it('LF 기준으로 나눈다', () => {
    expect(splitLines('a\nb\nc')).toEqual(['a', 'b', 'c'])
  })

  it('CRLF/CR도 처리한다', () => {
    expect(splitLines('a\r\nb\rc')).toEqual(['a', 'b', 'c'])
  })

  it('끝의 개행으로 생기는 빈 라인은 제거한다', () => {
    expect(splitLines('a\nb\n')).toEqual(['a', 'b'])
  })

  it('중간 빈 라인은 보존한다', () => {
    expect(splitLines('a\n\nb')).toEqual(['a', '', 'b'])
  })
})
