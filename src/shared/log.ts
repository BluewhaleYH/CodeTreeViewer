/**
 * 로그 덤프 분석 공용 타입(IPC 경계). (04 §2~§8)
 * 단계: 2차. logcat 우선 파싱 + 일반 텍스트 폴백(결정).
 */

/**
 * 로그 파일 열기 결과(메인 → 렌더러). (TODO_EXTRA C)
 * 임계값 이하: 전체 내용을 메모리로(`memory`). 초과: 디스크 스트리밍(`stream`) — 라인 수만 전달하고
 * 표시 윈도우/필터/검색은 main이 디스크에서 처리한다.
 */
export type LogOpenResult =
  | { mode: 'memory'; path: string; name: string; content: string }
  | { mode: 'stream'; path: string; name: string; id: number; lineCount: number }

/**
 * 소스의 로그 호출 위치(로그→코드 역추적용). (04 §5, M11_4)
 * 분석 시 Android Log.* / Slog / Timber 등의 호출에서 추출한다(결정: Log.* + 흔한 프레임워크).
 */
export interface LogSite {
  /** 소속 파일(프로젝트 상대 경로). */
  file: string
  /** 호출 라인(1-based). */
  line: number
  /** 로그 레벨(메서드명에서: d→D 등). 미상이면 null. */
  level: string | null
  /** 태그(문자열 리터럴일 때만). 식별자/상수는 null. */
  tag: string | null
  /** 원본 포맷 문자열(표시용). */
  format: string
  /** 메시지 매칭용 정규식 소스(^...$). 가변부는 와일드카드. */
  pattern: string
}

/** 로그 메시지 템플릿 세그먼트: 정적 리터럴 또는 가변부(포맷 인자/문자열 템플릿). */
export type LogTemplateSeg = { lit: string } | { wildcard: true }

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 템플릿 세그먼트를 매칭 정규식 소스로 만든다. (04 §5.1)
 * 정적부는 이스케이프, 가변부는 `.*?`. 정적 텍스트가 너무 짧으면(과도 일반화 방지) null.
 */
export function buildLogPattern(segments: readonly LogTemplateSeg[]): string | null {
  const staticLen = segments.reduce((n, s) => n + ('lit' in s ? s.lit.length : 0), 0)
  if (staticLen < 4) return null // 정적 텍스트가 빈약하면 후보로 쓰지 않음(오탐 방지)
  const body = segments.map((s) => ('lit' in s ? escapeRegex(s.lit) : '.*?')).join('')
  return `^${body}$`
}
