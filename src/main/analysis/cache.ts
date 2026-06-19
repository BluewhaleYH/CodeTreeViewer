import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ScannedFile } from './scanner'
import type { AnalysisSummary } from '../../shared/analysis'
import type { CodeGraph } from '../../shared/graph'

/**
 * 분석 결과 캐시. (02 §7.2)
 * 무효화 키 = 파일 stat(mtime+size) 지문 + 분석기 버전.
 * stat 기반(내용 해시 아님) → 미변경 파일을 다시 읽지 않고 빠르게 검증. (추가-5)
 * 저장 위치는 세션과 분리(userData). 사용자 프로젝트 폴더는 오염하지 않는다. (01 §6)
 */

/** 분석 로직이 바뀌면 올린다(기존 캐시 무효화). M4_3 외부 노드 추가로 3. */
export const ANALYZER_VERSION = 3

export interface CacheEntry {
  root: string
  version: number
  fingerprint: string
  summary: AnalysisSummary
  graph: CodeGraph
}

/** 스캔된 파일들의 stat(mtime+size) 지문. 파일 목록/내용 변화 시 값이 바뀐다. */
export async function fileFingerprint(files: readonly ScannedFile[]): Promise<string> {
  const hash = createHash('sha256')
  for (const file of files) {
    let meta = 'missing'
    try {
      const info = await stat(file.absolutePath)
      meta = `${info.mtimeMs}:${info.size}`
    } catch {
      // 사라진 파일은 'missing'으로 표기(지문에 반영).
    }
    hash.update(`${file.relativePath}|${meta}\n`)
  }
  return hash.digest('hex')
}

export class AnalysisCache {
  constructor(private readonly dir: string) {}

  private fileFor(root: string): string {
    const key = createHash('sha256').update(root).digest('hex')
    return join(this.dir, `${key}.json`)
  }

  async get(root: string): Promise<CacheEntry | null> {
    try {
      const raw = await readFile(this.fileFor(root), 'utf8')
      return JSON.parse(raw) as CacheEntry
    } catch {
      return null
    }
  }

  async set(root: string, entry: CacheEntry): Promise<void> {
    await mkdir(this.dir, { recursive: true })
    const target = this.fileFor(root)
    const tmp = `${target}.tmp`
    // 원자적 쓰기(부분기록 방지). (01 §10 정책 준용)
    await writeFile(tmp, JSON.stringify(entry))
    await rename(tmp, target)
  }
}
