import type { LogSite } from './log'
import type { LogcatFields } from './logcat-parse'

/**
 * 로그 라인 → 소스 로그 호출 후보 매칭. (04 §5, M11_4)
 * 메시지를 각 사이트의 패턴(정규식)에 매칭한다. 다중 후보는 그대로 반환(단정 금지). (04 §5.2, D-L3)
 * 양쪽 모두 태그가 있으면 태그 일치를 요구해 후보를 좁힌다.
 */
export function matchLogSites(
  raw: string,
  fields: LogcatFields | null,
  sites: readonly LogSite[]
): LogSite[] {
  const message = fields?.message ?? raw
  const logTag = fields?.tag ?? null
  const out: LogSite[] = []
  for (const site of sites) {
    if (site.tag && logTag && site.tag !== logTag) continue
    let re: RegExp
    try {
      re = new RegExp(site.pattern)
    } catch {
      continue
    }
    if (re.test(message)) out.push(site)
  }
  return out
}

/**
 * 매칭 후보의 신뢰도(0~1). (04 §5.3, M14_2)
 * 정적 텍스트가 길수록·가변부가 적을수록·태그가 명시될수록 높다.
 */
export function confidenceOf(site: LogSite, logTag: string | null): number {
  const inner = site.pattern.replace(/^\^/, '').replace(/\$$/, '')
  const parts = inner.split('.*?')
  // 이스케이프(\x)를 한 글자로 환산한 정적 길이.
  const staticLen = parts.reduce((n, p) => n + p.replace(/\\(.)/g, '$1').length, 0)
  const wildcardCount = parts.length - 1

  let score = Math.min(1, staticLen / 24)
  if (wildcardCount > 0) score *= 0.85 // 가변부가 있으면 약간 감점
  if (site.tag && logTag)
    score *= 1 // 태그가 명시·일치(매칭 통과)면 가점 유지
  else score *= 0.9 // 태그 미상(소스 태그가 상수 등)
  return Math.max(0, Math.min(1, score))
}

/** 신뢰도 → 라벨(높음/중간/낮음). */
export function confidenceLabel(score: number): '높음' | '중간' | '낮음' {
  if (score >= 0.75) return '높음'
  if (score >= 0.45) return '중간'
  return '낮음'
}

/**
 * 특정 소스 파일과 연관된 로그 라인 인덱스 집합. (노드 → 로그 연동, 04 §7, M11_5)
 * 그 파일의 로그 사이트에 매칭되는 라인을 찾는다.
 */
export function relatedLogLines(
  lines: readonly string[],
  parsed: readonly (LogcatFields | null)[],
  sites: readonly LogSite[],
  file: string
): Set<number> {
  const fileSites = sites.filter((s) => s.file === file)
  const out = new Set<number>()
  if (fileSites.length === 0) return out
  for (let i = 0; i < lines.length; i += 1) {
    if (matchLogSites(lines[i], parsed[i] ?? null, fileSites).length > 0) out.add(i)
  }
  return out
}
