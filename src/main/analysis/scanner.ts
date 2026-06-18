import { readdir } from 'node:fs/promises'
import { extname, join, relative, sep } from 'node:path'
import type { SourceLanguage } from '../../shared/analysis'

/**
 * 프로젝트 폴더 재귀 스캔. (02 §3)
 * electron 비의존(Node fs만 사용) → 단위 테스트 대상.
 * 파싱(Tree-sitter)은 M3_2, 분석 실행/진행률은 M3_3, 캐시는 M3_4.
 */

export type { SourceLanguage }

export interface ScannedFile {
  /** 절대 경로 */
  absolutePath: string
  /** root 기준 상대 경로(POSIX 구분자 '/') */
  relativePath: string
  language: SourceLanguage
}

export interface ScanResult {
  root: string
  files: ScannedFile[]
  /** 읽지 못해 건너뛴 디렉터리(권한 등). 분석은 계속한다. (02 §8) */
  skippedDirs: string[]
}

export interface ScanOptions {
  /** 디렉터리 이름 기준 제외 목록. 미지정 시 기본값 사용. */
  excludeDirs?: string[]
}

/**
 * 항상 제외하는 디렉터리(빌드 산출물/VCS/IDE/의존성). (02 §3, 추가-4)
 * 테스트 소스는 기본 포함(사용자 결정). 향후 설정으로 제외 가능.
 */
export const DEFAULT_EXCLUDED_DIRS = [
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

const LANGUAGE_BY_EXT: Record<string, SourceLanguage> = {
  '.java': 'java',
  '.kt': 'kotlin'
}

/** 프로젝트 루트를 재귀 스캔해 대상(.java/.kt) 파일을 수집한다. */
export async function scanProject(root: string, options: ScanOptions = {}): Promise<ScanResult> {
  const excluded = new Set(options.excludeDirs ?? DEFAULT_EXCLUDED_DIRS)
  const files: ScannedFile[] = []
  const skippedDirs: string[] = []

  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      // 권한 없음 등으로 읽지 못하면 기록하고 건너뛴다.
      skippedDirs.push(dir)
      return
    }

    for (const entry of entries) {
      // 심볼릭 링크는 따라가지 않는다(루프 방지). (02 §8)
      if (entry.isSymbolicLink()) continue

      const full = join(dir, entry.name)

      if (entry.isDirectory()) {
        if (excluded.has(entry.name)) continue
        await walk(full)
      } else if (entry.isFile()) {
        const language = LANGUAGE_BY_EXT[extname(entry.name).toLowerCase()]
        if (language) {
          files.push({
            absolutePath: full,
            relativePath: relative(root, full).split(sep).join('/'),
            language
          })
        }
      }
    }
  }

  await walk(root)
  // 결정적 순서(테스트/그래프 안정성).
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  return { root, files, skippedDirs }
}
