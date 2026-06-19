import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { SourceReadResult, SourceSaveResult } from '../shared/source'

/**
 * 프로젝트 소스 읽기/저장(코드 편집). (06 §3, §6, M12_2)
 * - 프로젝트 경계 밖(../) 차단.
 * - 저장은 원자적 쓰기(tmp→rename). (01 §10 정책 준용)
 * - 저장 전 baseMtime와 디스크 mtime을 비교해 외부 변경 충돌을 감지한다.
 */

function withinProject(projectPath: string, relativePath: string): string | null {
  const target = join(projectPath, relativePath)
  return resolve(target).startsWith(resolve(projectPath)) ? target : null
}

export async function readSourceFile(
  projectPath: string,
  relativePath: string
): Promise<SourceReadResult | null> {
  const target = withinProject(projectPath, relativePath)
  if (!target) return null
  try {
    const content = await readFile(target, 'utf8')
    const st = await stat(target)
    return { content, mtime: Math.round(st.mtimeMs) }
  } catch {
    return null
  }
}

export async function saveSourceFile(
  projectPath: string,
  relativePath: string,
  content: string,
  baseMtime: number | null
): Promise<SourceSaveResult> {
  const target = withinProject(projectPath, relativePath)
  if (!target) return { ok: false, error: '프로젝트 경계를 벗어난 경로' }

  // 외부 변경 충돌 감지: baseMtime이 주어지고 디스크 mtime과 다르면 충돌. (06 §6)
  if (baseMtime !== null) {
    try {
      const st = await stat(target)
      if (Math.round(st.mtimeMs) !== baseMtime) return { ok: false, conflict: true }
    } catch {
      // 파일이 사라졌으면 충돌로 보지 않고 새로 쓴다.
    }
  }

  try {
    await mkdir(dirname(target), { recursive: true })
    const tmp = `${target}.tmp`
    await writeFile(tmp, content, 'utf8')
    await rename(tmp, target)
    const st = await stat(target)
    return { ok: true, mtime: Math.round(st.mtimeMs) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
