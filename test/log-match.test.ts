import { describe, it, expect } from 'vitest'
import { buildLogPattern, type LogSite } from '../src/shared/log'
import { matchLogSites } from '../src/renderer/src/log/log-match'
import { parseLogcatLine } from '../src/renderer/src/log/logcat-parse'

describe('buildLogPattern (M11_4)', () => {
  it('정적 세그먼트는 이스케이프, 가변부는 와일드카드', () => {
    expect(buildLogPattern([{ lit: 'load() failed: ' }, { wildcard: true }])).toBe(
      '^load\\(\\) failed: .*?$'
    )
  })

  it('정적 텍스트가 너무 짧으면 null(과도 일반화 방지)', () => {
    expect(buildLogPattern([{ wildcard: true }])).toBeNull()
    expect(buildLogPattern([{ lit: 'ab' }, { wildcard: true }])).toBeNull()
  })

  it('순수 정적 문자열', () => {
    expect(buildLogPattern([{ lit: 'onCreate()' }])).toBe('^onCreate\\(\\)$')
  })
})

const sites: LogSite[] = [
  {
    file: 'a/Repository.kt',
    line: 14,
    level: 'E',
    tag: 'Repository',
    format: '"load() failed: $e"',
    pattern: '^load\\(\\) failed: .*?$'
  },
  {
    file: 'b/Other.kt',
    line: 9,
    level: 'E',
    tag: null,
    format: '"load() failed: " + x',
    pattern: '^load\\(\\) failed: .*?$'
  },
  {
    file: 'c/Api.kt',
    line: 3,
    level: 'D',
    tag: 'ApiClient',
    format: '"get() ok"',
    pattern: '^get\\(\\) ok$'
  }
]

describe('matchLogSites (M11_4)', () => {
  it('메시지 패턴에 맞는 후보를 모두 반환(다중 후보)', () => {
    const raw = '06-19 14:22:01.400  1234  1305 E Repository: load() failed: timeout'
    const got = matchLogSites(raw, parseLogcatLine(raw), sites)
    // Repository.kt(tag 일치) + Other.kt(tag null) 둘 다 매칭, Api.kt는 패턴 불일치
    expect(got.map((s) => s.file)).toEqual(['a/Repository.kt', 'b/Other.kt'])
  })

  it('양쪽 태그가 있고 다르면 제외한다', () => {
    const raw = '06-19 14:22:01.400  1234  1305 E SomethingElse: load() failed: x'
    const got = matchLogSites(raw, parseLogcatLine(raw), sites)
    // tag 'SomethingElse' ≠ 'Repository' → Repository 제외, tag null인 Other만
    expect(got.map((s) => s.file)).toEqual(['b/Other.kt'])
  })

  it('일반 텍스트 라인(태그 없음)은 메시지만으로 매칭', () => {
    const got = matchLogSites('load() failed: boom', null, sites)
    expect(got.map((s) => s.file)).toEqual(['a/Repository.kt', 'b/Other.kt'])
  })

  it('일치 후보가 없으면 빈 배열', () => {
    const raw = '06-19 14:22:01.118  1234  1300 D MainActivity: onCreate()'
    expect(matchLogSites(raw, parseLogcatLine(raw), sites)).toEqual([])
  })
})
