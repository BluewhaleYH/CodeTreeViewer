import type { SearchEntry } from './search-index'

/**
 * 코드 검색 매칭/정렬. (05 §2, §3)
 * 기본: 대소문자 무시 부분 일치. 옵션: 대소문자 구분 / 정확 일치 / 경로 포함.
 * 정렬: 일치 품질 점수(정확<접두<부분<경로) → 이름 길이 → 사전순.
 */

export interface SearchOptions {
  caseSensitive: boolean
  exact: boolean
  includePath: boolean
}

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  caseSensitive: false,
  exact: false,
  includePath: false
}

export function searchEntries(
  index: readonly SearchEntry[],
  query: string,
  options: SearchOptions = DEFAULT_SEARCH_OPTIONS
): SearchEntry[] {
  const raw = query.trim()
  if (!raw) return []
  const norm = (s: string): string => (options.caseSensitive ? s : s.toLowerCase())
  const q = norm(raw)

  const scored: { entry: SearchEntry; score: number }[] = []
  for (const entry of index) {
    const name = norm(entry.name)
    let score = -1
    if (options.exact) {
      if (name === q) score = 0
    } else if (name === q) {
      score = 0
    } else if (name.startsWith(q)) {
      score = 1
    } else if (name.includes(q)) {
      score = 2
    } else if (options.includePath && norm(entry.path).includes(q)) {
      score = 3
    }
    if (score >= 0) scored.push({ entry, score })
  }

  scored.sort(
    (a, b) =>
      a.score - b.score ||
      a.entry.name.length - b.entry.name.length ||
      a.entry.name.localeCompare(b.entry.name)
  )
  return scored.map((s) => s.entry)
}
