import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { emptySession, SESSION_VERSION, type SessionState } from '../../shared/session'

/** 세션 로드 결과. 손상 감지 시 비차단 알림을 띄우기 위해 플래그를 함께 반환한다. (01 §10) */
export interface SessionLoadResult {
  state: SessionState
  /** 직전 백업본에서 복구했는지 여부. */
  recovered: boolean
  /** 손상(파싱 실패/구조 불일치)을 감지했는지 여부 → 비차단 알림 트리거. */
  corrupted: boolean
}

type ReadResult = { kind: 'ok'; state: SessionState } | { kind: 'missing' } | { kind: 'corrupt' }

/**
 * 세션 저장소. (01 §6, §10)
 * userData에 session.json을 원자적으로 쓰고(임시 → rename), 직전 정상본을 session.bak.json으로 회전한다.
 * 로드 시 본본이 손상/부재면 백업본으로 폴백하고, 그것도 실패하면 빈 세션으로 안전 기동한다. 분석 캐시와 분리.
 */
export class SessionStore {
  constructor(private readonly dir: string) {}

  private file(): string {
    return join(this.dir, 'session.json')
  }

  private backupFile(): string {
    return join(this.dir, 'session.bak.json')
  }

  /** 한 파일을 읽어 ok/missing/corrupt로 분류한다(부재는 손상이 아님). */
  private async tryRead(path: string): Promise<ReadResult> {
    let raw: string
    try {
      raw = await readFile(path, 'utf8')
    } catch {
      return { kind: 'missing' }
    }
    try {
      const parsed = JSON.parse(raw) as SessionState
      if (!parsed || parsed.version !== SESSION_VERSION || !Array.isArray(parsed.tabs)) {
        return { kind: 'corrupt' }
      }
      return { kind: 'ok', state: parsed }
    } catch {
      return { kind: 'corrupt' }
    }
  }

  async load(): Promise<SessionLoadResult> {
    const primary = await this.tryRead(this.file())
    if (primary.kind === 'ok') {
      return { state: primary.state, recovered: false, corrupted: false }
    }
    // 본본 부재/손상 → 직전 백업본으로 폴백 시도.
    const backup = await this.tryRead(this.backupFile())
    const corrupted = primary.kind === 'corrupt' || backup.kind === 'corrupt'
    if (backup.kind === 'ok') {
      return { state: backup.state, recovered: true, corrupted }
    }
    // 둘 다 실패 → 빈 세션으로 안전 기동.
    return { state: emptySession(), recovered: false, corrupted }
  }

  async save(state: SessionState): Promise<void> {
    await mkdir(this.dir, { recursive: true })
    const target = this.file()
    const tmp = `${target}.tmp`
    await writeFile(tmp, JSON.stringify(state))
    // 직전 정상본을 백업으로 회전(원자적 이동). 최초 저장이면 target이 없어 무시된다.
    try {
      await rename(target, this.backupFile())
    } catch {
      /* 최초 저장: 기존 session.json 없음 */
    }
    await rename(tmp, target)
  }
}
