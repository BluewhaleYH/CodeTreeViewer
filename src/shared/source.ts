/**
 * 소스 읽기/저장 IPC 타입(코드 편집). (06 §3, §6, M12_2)
 */

export interface SourceReadResult {
  content: string
  /** 디스크 수정 시각(ms, 정수). 외부 변경 충돌 감지에 사용. */
  mtime: number
}

export type SourceSaveResult =
  | { ok: true; mtime: number }
  | { ok: false; conflict: true }
  | { ok: false; error: string }
