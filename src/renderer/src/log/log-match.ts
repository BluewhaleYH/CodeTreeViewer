import type { LogSite } from '../../../shared/log'
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
