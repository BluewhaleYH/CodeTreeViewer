import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ScannedFile } from './scanner'
import type { AnalysisSummary } from '../../shared/analysis'
import type { CodeGraph } from '../../shared/graph'
import type { LogSite } from '../../shared/log'

/**
 * 분석 결과 캐시. (02 §7.2)
 * 무효화 키 = 파일 지문(하이브리드) + 분석기 버전.
 *
 * 지문은 2단계(하이브리드):
 * 1) stat(mtime+size) 지문 — 빠름. 일치하면 그대로 재사용.
 * 2) stat이 달라졌을 때만 내용 해시(contentFingerprint)로 실제 변경 여부 재확인 →
 *    mtime만 바뀌고 내용은 같은 경우(git checkout 등)에 불필요한 재분석을 피한다. (TODO_EXTRA B)
 *
 * 저장 위치는 세션과 분리(userData). 사용자 프로젝트 폴더는 오염하지 않는다. (01 §6)
 * 누적 방지를 위해 set 시 LRU 상한 정리를 수행한다. (TODO_EXTRA C)
 */

/**
 * 분석기 버전. 빌드 시 electron.vite.config.ts가 `src/main/analysis` 소스 해시를
 * `__ANALYZER_HASH__`로 주입한다 → 분석 로직이 바뀌면 자동으로 값이 달라져 기존 캐시가 무효화된다
 * (수동 버전 관리 불필요). (TODO_EXTRA B)
 * 테스트(vitest)는 define 미적용이라 'dev'로 폴백한다(런 내 일관).
 */
declare const __ANALYZER_HASH__: string | undefined
export const ANALYZER_VERSION: string =
  typeof __ANALYZER_HASH__ === 'string' ? __ANALYZER_HASH__ : 'dev'

/** 캐시 디렉터리에 보관할 최대 프로젝트 수(LRU 초과분 정리). */
export const MAX_CACHE_ENTRIES = 50

export interface CacheEntry {
  root: string
  version: string
  /** stat(mtime+size) 지문. */
  fingerprint: string
  /** 내용 해시 지문(하이브리드 재확인용). */
  contentFingerprint?: string
  summary: AnalysisSummary
  graph: CodeGraph
  /** 로그→코드 역추적용 호출 위치. (04 §5, M11_4) */
  logSites?: LogSite[]
}

/** 동시성 상한을 둔 병렬 map(순서 보존). 대규모에서 FD 고갈 없이 I/O를 겹친다. (TODO_MORE 성능) */
async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  async function worker(): Promise<void> {
    for (let i = next++; i < items.length; i = next++) {
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

/** 스캔된 파일들의 stat(mtime+size) 지문. 파일 목록/내용 변화 시 값이 바뀐다. */
export async function fileFingerprint(files: readonly ScannedFile[]): Promise<string> {
  // stat을 병렬화(순서 보존)해 대규모 프로젝트의 지문 계산 지연을 줄인다. (TODO_MORE 성능)
  const metas = await mapLimit(files, 64, async (file) => {
    try {
      const info = await stat(file.absolutePath)
      return `${info.mtimeMs}:${info.size}`
    } catch {
      // 사라진 파일은 'missing'으로 표기(지문에 반영).
      return 'missing'
    }
  })
  const hash = createHash('sha256')
  files.forEach((file, i) => hash.update(`${file.relativePath}|${metas[i]}\n`))
  return hash.digest('hex')
}

/** 스캔된 파일들의 내용 해시 지문. mtime이 달라도 내용이 같으면 동일하다. */
export async function contentFingerprint(files: readonly ScannedFile[]): Promise<string> {
  const hash = createHash('sha256')
  for (const file of files) {
    hash.update(`${file.relativePath}|`)
    try {
      hash.update(await readFile(file.absolutePath))
    } catch {
      hash.update('missing')
    }
    hash.update('\n')
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
    await this.prune()
  }

  /** 캐시 항목이 상한을 넘으면 가장 오래된(mtime 기준) 것부터 정리한다(LRU). (TODO_EXTRA C) */
  async prune(maxEntries = MAX_CACHE_ENTRIES): Promise<void> {
    try {
      const names = (await readdir(this.dir)).filter((n) => n.endsWith('.json'))
      if (names.length <= maxEntries) return
      const withTime = await Promise.all(
        names.map(async (n) => ({ n, t: (await stat(join(this.dir, n))).mtimeMs }))
      )
      withTime.sort((a, b) => b.t - a.t) // 최신 우선
      for (const { n } of withTime.slice(maxEntries)) {
        await unlink(join(this.dir, n)).catch(() => {})
      }
    } catch {
      // 디렉터리 부재 등은 무시.
    }
  }
}
