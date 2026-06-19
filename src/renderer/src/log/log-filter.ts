import type { LogcatFields, LogLevel } from './logcat-parse'

/**
 * 로그 필터(표시 전용, 원본 보존). (04 §4, M11_3)
 * 레벨/태그/텍스트(또는 정규식)로 표시할 라인을 고른다.
 */

export const ALL_LEVELS: readonly LogLevel[] = ['V', 'D', 'I', 'W', 'E', 'F']

export interface LogFilter {
  /** 포함할 레벨 집합. null이면 전체. 파싱 안 된(일반 텍스트) 라인은 레벨 필터를 통과한다. */
  levels: ReadonlySet<LogLevel> | null
  /** 태그 부분 일치(대소문자 무시). 빈 문자열이면 미적용(일반 텍스트 라인은 태그 필터 적용 시 제외). */
  tag: string
  /** 텍스트/정규식 검색어(원문 라인 대상). 빈 문자열이면 미적용. */
  text: string
  /** text를 정규식으로 해석할지. 잘못된 정규식은 미적용(전체 통과)으로 처리한다. */
  regex: boolean
}

export const EMPTY_FILTER: LogFilter = { levels: null, tag: '', text: '', regex: false }

/** 필터가 사실상 비어 있는지(전체 통과). */
export function isEmptyFilter(f: LogFilter): boolean {
  return f.levels === null && f.tag === '' && f.text === ''
}

type Predicate = (raw: string, fields: LogcatFields | null) => boolean

/** 필터를 1회 컴파일해 라인 술어를 만든다(정규식/소문자 변환을 미리 처리). */
export function compileFilter(filter: LogFilter): Predicate {
  const levels = filter.levels
  const tag = filter.tag ? filter.tag.toLowerCase() : ''
  let re: RegExp | null = null
  let text = ''
  if (filter.text) {
    if (filter.regex) {
      try {
        re = new RegExp(filter.text, 'i')
      } catch {
        re = null // 잘못된 정규식 → 텍스트 조건 미적용
      }
    } else {
      text = filter.text.toLowerCase()
    }
  }

  return (raw, fields) => {
    if (levels && fields && !levels.has(fields.level)) return false
    if (tag) {
      if (!fields || !fields.tag.toLowerCase().includes(tag)) return false
    }
    if (re) {
      if (!re.test(raw)) return false
    } else if (text) {
      if (!raw.toLowerCase().includes(text)) return false
    }
    return true
  }
}

/** 필터를 통과하는 원본 라인 인덱스 목록을 반환한다. */
export function filterIndices(
  lines: readonly string[],
  parsed: readonly (LogcatFields | null)[],
  filter: LogFilter
): number[] {
  if (isEmptyFilter(filter)) return lines.map((_, i) => i)
  const pred = compileFilter(filter)
  const out: number[] = []
  for (let i = 0; i < lines.length; i += 1) {
    if (pred(lines[i], parsed[i] ?? null)) out.push(i)
  }
  return out
}
