/**
 * 로그 덤프 분석 공용 타입(IPC 경계). (04 §2~§8)
 * 단계: 2차. logcat 우선 파싱 + 일반 텍스트 폴백(결정). 파싱 필드는 M11_3에서 채운다.
 */

/** 로그 파일 열기 결과(메인 → 렌더러). 대용량 스트리밍은 M11_2. */
export interface LogOpenResult {
  path: string
  name: string
  /** 파일 전체 내용(M11_2에서 스트리밍/청크로 대체 예정). */
  content: string
}
