/**
 * 로그 내 검색(순수). (04 §8, 05 §6, M11_6)
 * 필터(표시 숨김)와 달리 매치를 찾아 이동(next/prev)·강조한다.
 * 현재 표시 중(필터 통과) 라인 인덱스 위에서만 검색한다.
 */
export function searchMatches(
  lines: readonly string[],
  indices: readonly number[],
  query: string,
  regex: boolean
): number[] {
  if (query === '') return []
  let test: (s: string) => boolean
  if (regex) {
    let re: RegExp
    try {
      re = new RegExp(query, 'i')
    } catch {
      return [] // 잘못된 정규식은 매치 없음
    }
    test = (s) => re.test(s)
  } else {
    const q = query.toLowerCase()
    test = (s) => s.toLowerCase().includes(q)
  }
  return indices.filter((i) => test(lines[i]))
}
