/**
 * 앱 설정(영속). main/renderer 공용. (TODO_EXTRA D)
 * 현재는 스캔 제외 디렉터리만. 분석 캐시는 스캔된 파일 집합 지문으로 무효화되므로
 * 제외 목록이 바뀌면 자연히 재분석된다.
 */

export const SETTINGS_VERSION = 1

/** 항상 제외하는 디렉터리 기본값(빌드 산출물/VCS/IDE/의존성). (02 §3, 추가-4) */
export const DEFAULT_EXCLUDE_DIRS: readonly string[] = [
  '.git',
  '.svn',
  '.hg',
  '.gradle',
  '.idea',
  '.vscode',
  'build',
  'out',
  'dist',
  'node_modules'
]

export interface AppSettings {
  version: number
  /** 스캔에서 제외할 디렉터리 이름 목록. */
  excludeDirs: string[]
}

export function defaultSettings(): AppSettings {
  return { version: SETTINGS_VERSION, excludeDirs: [...DEFAULT_EXCLUDE_DIRS] }
}

/** 입력을 정규화한다(트림·중복 제거·빈값 제거). */
export function normalizeExcludeDirs(dirs: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const d of dirs) {
    const t = d.trim()
    if (t && !seen.has(t)) {
      seen.add(t)
      out.push(t)
    }
  }
  return out
}
