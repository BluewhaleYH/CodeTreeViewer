import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  defaultSettings,
  normalizeExcludeDirs,
  SETTINGS_VERSION,
  type AppSettings
} from '../shared/settings'

/**
 * 앱 설정 저장소(userData/settings.json). (TODO_EXTRA D)
 * 원자적 쓰기, 손상/부재 시 기본값으로 안전 폴백. 세션/캐시와 분리.
 */
export class SettingsStore {
  private cached: AppSettings | null = null

  constructor(private readonly dir: string) {}

  private file(): string {
    return join(this.dir, 'settings.json')
  }

  async load(): Promise<AppSettings> {
    if (this.cached) return this.cached
    try {
      const parsed = JSON.parse(await readFile(this.file(), 'utf8')) as Partial<AppSettings>
      if (parsed && parsed.version === SETTINGS_VERSION && Array.isArray(parsed.excludeDirs)) {
        this.cached = {
          version: SETTINGS_VERSION,
          excludeDirs: normalizeExcludeDirs(parsed.excludeDirs)
        }
        return this.cached
      }
    } catch {
      // 부재/손상 → 기본값.
    }
    this.cached = defaultSettings()
    return this.cached
  }

  async save(settings: AppSettings): Promise<AppSettings> {
    const next: AppSettings = {
      version: SETTINGS_VERSION,
      excludeDirs: normalizeExcludeDirs(settings.excludeDirs)
    }
    await mkdir(this.dir, { recursive: true })
    const target = this.file()
    const tmp = `${target}.tmp`
    await writeFile(tmp, JSON.stringify(next))
    await rename(tmp, target)
    this.cached = next
    return next
  }
}

let instance: SettingsStore | null = null
export function getSettingsStore(dir: string): SettingsStore {
  if (!instance) instance = new SettingsStore(dir)
  return instance
}
