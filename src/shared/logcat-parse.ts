/**
 * logcat 라인 파싱(순수). (04 §4, M11_3, 결정: logcat 우선 파싱 + 일반 텍스트 폴백)
 * threadtime 포맷(`adb logcat -v threadtime`, bugreport 기본)을 우선 인식한다.
 *   예) `06-19 14:22:01.118  1234  1300 D MainActivity: onCreate()`
 * 인식 실패 라인은 null(일반 텍스트) → 레벨/태그 필터는 통과시키되 텍스트/정규식으로 필터링.
 */

export type LogLevel = 'V' | 'D' | 'I' | 'W' | 'E' | 'F'

export interface LogcatFields {
  time: string
  pid: number
  tid: number
  level: LogLevel
  tag: string
  message: string
}

const THREADTIME =
  /^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+(.+?):\s?(.*)$/

export function parseLogcatLine(raw: string): LogcatFields | null {
  const m = THREADTIME.exec(raw)
  if (!m) return null
  return {
    time: m[1],
    pid: Number(m[2]),
    tid: Number(m[3]),
    level: m[4] as LogLevel,
    tag: m[5].trim(),
    message: m[6]
  }
}

/** 전체 라인을 1회 파싱한다(로그 열 때). 미인식은 null. */
export function parseAll(lines: readonly string[]): (LogcatFields | null)[] {
  return lines.map(parseLogcatLine)
}
