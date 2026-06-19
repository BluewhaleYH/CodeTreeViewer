import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AnalysisCache, fileFingerprint } from '../src/main/analysis/cache'
import { analyzeProject } from '../src/main/analysis/runner'
import { scanProject } from '../src/main/analysis/scanner'
import { SourceParser } from '../src/main/analysis/parser'
import { resolveParserConfig } from '../src/main/analysis/wasm-paths'

let parser: SourceParser
let root: string
let cacheDir: string

beforeAll(async () => {
  parser = await SourceParser.create(resolveParserConfig())
})

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true })
  if (cacheDir) await rm(cacheDir, { recursive: true, force: true })
})

async function write(rel: string, content = ''): Promise<void> {
  const full = join(root, rel)
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, content)
}

describe('fileFingerprint (M3_4)', () => {
  it('동일 파일은 같은 지문, 변경 시 다른 지문', async () => {
    root = await mkdtemp(join(tmpdir(), 'ctv-fp-'))
    await write('A.java', 'class A {}')
    const f1 = await fileFingerprint((await scanProject(root)).files)
    const f1b = await fileFingerprint((await scanProject(root)).files)
    expect(f1b).toBe(f1)

    await sleep(5)
    await write('A.java', 'class A { void m() {} }') // 크기 변화
    const f2 = await fileFingerprint((await scanProject(root)).files)
    expect(f2).not.toBe(f1)
  })

  it('파일 추가 시 지문이 바뀐다', async () => {
    root = await mkdtemp(join(tmpdir(), 'ctv-fp-'))
    await write('A.java', 'class A {}')
    const f1 = await fileFingerprint((await scanProject(root)).files)
    await write('B.kt', 'fun b() {}')
    const f2 = await fileFingerprint((await scanProject(root)).files)
    expect(f2).not.toBe(f1)
  })
})

describe('AnalysisCache get/set (M3_4)', () => {
  it('저장한 항목을 다시 읽는다, 없으면 null', async () => {
    cacheDir = await mkdtemp(join(tmpdir(), 'ctv-cache-'))
    const cache = new AnalysisCache(cacheDir)
    expect(await cache.get('/p/none')).toBeNull()

    const entry = {
      root: '/p/x',
      version: 5,
      fingerprint: 'abc',
      summary: {
        root: '/p/x',
        fileCount: 1,
        parsedCount: 1,
        failureCount: 0,
        byLanguage: { java: 1, kotlin: 0 },
        skippedDirCount: 0,
        nodeCount: 1,
        functionNodeCount: 0,
        externalNodeCount: 0,
        domainCount: 0,
        edgeCount: 0,
        failures: []
      },
      graph: { nodes: [], edges: [] }
    }
    await cache.set('/p/x', entry)
    expect(await cache.get('/p/x')).toEqual(entry)
  })
})

describe('analyzeProject 캐시 재사용/무효화 (M3_4)', () => {
  it('두 번째 분석은 캐시 재사용, 파일 변경 시 무효화', async () => {
    root = await mkdtemp(join(tmpdir(), 'ctv-an-'))
    cacheDir = await mkdtemp(join(tmpdir(), 'ctv-cache-'))
    await write('A.java', 'class A {}')
    const cache = new AnalysisCache(cacheDir)

    const r1 = await analyzeProject(root, parser, cache)
    expect(r1.fromCache).toBe(false)

    const r2 = await analyzeProject(root, parser, cache)
    expect(r2.fromCache).toBe(true)
    expect(r2.summary).toEqual(r1.summary)

    await sleep(5)
    await write('A.java', 'class A { void x() {} }')
    const r3 = await analyzeProject(root, parser, cache)
    expect(r3.fromCache).toBe(false)
  })
})
