import { describe, it, expect } from 'vitest'
import { buildLogPattern, type LogSite } from '../src/shared/log'
import {
  matchLogSites,
  relatedLogLines,
  confidenceOf,
  confidenceLabel
} from '../src/shared/log-match'
import { parseAll, parseLogcatLine } from '../src/shared/logcat-parse'

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

describe('confidenceOf — 매칭 신뢰도 (M14_2)', () => {
  function site(pattern: string, tag: string | null): LogSite {
    return { file: 'f', line: 1, level: 'E', tag, format: '', pattern }
  }

  it('정적 텍스트가 길수록 신뢰도가 높다', () => {
    const longStatic = confidenceOf(site('^this is a fairly long static message$', 'T'), 'T')
    const shortStatic = confidenceOf(site('^short .*?$', 'T'), 'T')
    expect(longStatic).toBeGreaterThan(shortStatic)
  })

  it('가변부(와일드카드)가 있으면 같은 정적 길이라도 약간 낮다', () => {
    const noWild = confidenceOf(site('^abcdefghij$', 'T'), 'T')
    const withWild = confidenceOf(site('^abcdefghij.*?$', 'T'), 'T')
    expect(withWild).toBeLessThan(noWild)
  })

  it('소스 태그가 명시되면(미상보다) 신뢰도가 높다', () => {
    const tagged = confidenceOf(site('^load failed: .*?$', 'Repo'), 'Repo')
    const untagged = confidenceOf(site('^load failed: .*?$', null), 'Repo')
    expect(tagged).toBeGreaterThan(untagged)
  })

  it('신뢰도는 0~1로 클램프된다', () => {
    const s = confidenceOf(site('^' + 'x'.repeat(200) + '$', 'T'), 'T')
    expect(s).toBeLessThanOrEqual(1)
    expect(s).toBeGreaterThanOrEqual(0)
  })

  it('라벨은 점수 구간에 따른다', () => {
    expect(confidenceLabel(0.9)).toBe('높음')
    expect(confidenceLabel(0.5)).toBe('중간')
    expect(confidenceLabel(0.2)).toBe('낮음')
  })
})

describe('relatedLogLines — 노드→로그 연동 (M11_5)', () => {
  const lines = [
    '06-19 14:22:01.118  1234  1300 D MainActivity: onCreate()',
    '06-19 14:22:01.400  1234  1305 E Repository: load() failed: timeout',
    '06-19 14:22:01.401  1234  1305 E Repository: load() failed: io'
  ]
  const parsed = parseAll(lines)

  it('해당 파일의 사이트에 매칭되는 라인 인덱스를 모은다', () => {
    const got = relatedLogLines(lines, parsed, sites, 'a/Repository.kt')
    expect([...got].sort()).toEqual([1, 2])
  })

  it('사이트 없는 파일이면 빈 집합', () => {
    expect(relatedLogLines(lines, parsed, sites, 'z/None.kt').size).toBe(0)
  })
})
