import { describe, it, expect } from 'vitest'
import { searchEntries } from '../src/renderer/src/search/search'
import type { SearchEntry } from '../src/renderer/src/search/search-index'

function entry(name: string, path = name, kind: 'file' | 'function' = 'file'): SearchEntry {
  return { id: `${kind}:${path}#${name}`, name, kind, path, language: 'java', line: null }
}

const index: SearchEntry[] = [
  entry('Repository.kt', 'core/Repository.kt'),
  entry('RepositoryImpl.kt', 'core/RepositoryImpl.kt'),
  entry('Main.java', 'app/Main.java'),
  entry('load', 'core/Repository.kt', 'function'),
  entry('reload', 'core/Repository.kt', 'function')
]

describe('코드 검색 매칭/정렬 (M7_2)', () => {
  it('대소문자 무시 부분 일치(기본)', () => {
    const names = searchEntries(index, 'repo').map((e) => e.name)
    expect(names).toContain('Repository.kt')
    expect(names).toContain('RepositoryImpl.kt')
    expect(names).not.toContain('Main.java')
  })

  it('접두 일치가 부분 일치보다 먼저', () => {
    const names = searchEntries(index, 'load').map((e) => e.name)
    // 'load'(접두/정확) 이 'reload'(부분)보다 먼저
    expect(names[0]).toBe('load')
    expect(names).toContain('reload')
  })

  it('정확 일치 옵션', () => {
    const r = searchEntries(index, 'load', {
      caseSensitive: false,
      exact: true,
      includePath: false
    })
    expect(r.map((e) => e.name)).toEqual(['load'])
  })

  it('대소문자 구분 옵션', () => {
    const r = searchEntries(index, 'REPO', {
      caseSensitive: true,
      exact: false,
      includePath: false
    })
    expect(r).toHaveLength(0)
  })

  it('경로 포함 옵션', () => {
    const withPath = searchEntries(index, 'app', {
      caseSensitive: false,
      exact: false,
      includePath: true
    })
    expect(withPath.map((e) => e.name)).toContain('Main.java')
    const withoutPath = searchEntries(index, 'app', {
      caseSensitive: false,
      exact: false,
      includePath: false
    })
    expect(withoutPath).toHaveLength(0)
  })

  it('빈 질의는 빈 결과', () => {
    expect(searchEntries(index, '   ')).toHaveLength(0)
  })
})
