import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { emptySession, SESSION_VERSION, type SessionState } from '../../shared/session'

/**
 * 세션 저장소. (01 §6, §10)
 * userData에 session.json을 원자적으로 쓴다(임시 → rename). 분석 캐시와 분리.
 * 손상/부재/버전 불일치 시 빈 세션으로 안전 폴백한다. (백업 폴백 보강은 M8_5)
 */
export class SessionStore {
  constructor(private readonly dir: string) {}

  private file(): string {
    return join(this.dir, 'session.json')
  }

  async load(): Promise<SessionState> {
    try {
      const raw = await readFile(this.file(), 'utf8')
      const parsed = JSON.parse(raw) as SessionState
      if (!parsed || parsed.version !== SESSION_VERSION || !Array.isArray(parsed.tabs)) {
        return emptySession()
      }
      return parsed
    } catch {
      return emptySession()
    }
  }

  async save(state: SessionState): Promise<void> {
    await mkdir(this.dir, { recursive: true })
    const target = this.file()
    const tmp = `${target}.tmp`
    await writeFile(tmp, JSON.stringify(state))
    await rename(tmp, target)
  }
}
