import { app } from 'electron'
import { SessionStore } from './session-store'
import {
  emptySession,
  type PersistedTab,
  type SessionState,
  type WindowState
} from '../../shared/session'

/**
 * 세션 상태를 메모리에서 관리하고 디바운스 저장한다. (01 §5)
 * 창 상태(main 소유)와 탭 상태(renderer가 IPC로 전달)를 각각 갱신해 서로 덮어쓰지 않게 한다.
 */

const SAVE_DEBOUNCE_MS = 400

export class SessionManager {
  private state: SessionState = emptySession()
  private corrupted = false
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly store: SessionStore) {}

  async init(): Promise<void> {
    const result = await this.store.load()
    this.state = result.state
    this.corrupted = result.corrupted
  }

  get(): SessionState {
    return this.state
  }

  /** 로드 시 세션 손상을 감지했는지. 비차단 알림 트리거에 사용한다. (01 §10) */
  wasCorrupted(): boolean {
    return this.corrupted
  }

  setWindow(window: WindowState): void {
    this.state = { ...this.state, window }
    this.schedule()
  }

  setTabs(tabs: PersistedTab[], activeIndex: number, recentlyClosed: PersistedTab[] = []): void {
    this.state = { ...this.state, tabs, activeIndex, recentlyClosed }
    this.schedule()
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      void this.store.save(this.state)
    }, SAVE_DEBOUNCE_MS)
  }

  /** 즉시 저장(정상 종료 시). */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    await this.store.save(this.state)
  }
}

let instance: SessionManager | null = null
export function getSessionManager(): SessionManager {
  if (!instance) instance = new SessionManager(new SessionStore(app.getPath('userData')))
  return instance
}
