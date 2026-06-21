import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm, readdir } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AnalysisCache, fileFingerprint, contentFingerprint } from '../src/main/analysis/cache'
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

describe('contentFingerprint — 내용 해시(하이브리드) (TODO_EXTRA B)', () => {
  it('mtime이 달라도 내용이 같으면 동일 지문, 내용 변경 시 다른 지문', async () => {
    root = await mkdtemp(join(tmpdir(), 'ctv-cfp-'))
    await write('A.java', 'class A {}')
    const c1 = await contentFingerprint((await scanProject(root)).files)

    await sleep(5)
    await write('A.java', 'class A {}') // 같은 내용, mtime만 변함
    const statChanged = await fileFingerprint((await scanProject(root)).files)
    const c2 = await contentFingerprint((await scanProject(root)).files)
    expect(c2).toBe(c1) // 내용 동일 → 지문 동일

    await write('A.java', 'class A { void m() {} }') // 내용 변경
    const c3 = await contentFingerprint((await scanProject(root)).files)
    expect(c3).not.toBe(c1)
    // (참고) stat 지문은 mtime만 바뀌어도 달라진다
    expect(statChanged).toBeTypeOf('string')
  })
})

describe('AnalysisCache.prune — LRU 상한 정리 (TODO_EXTRA C)', () => {
  it('상한을 넘으면 오래된 항목부터 제거한다', async () => {
    cacheDir = await mkdtemp(join(tmpdir(), 'ctv-prune-'))
    const cache = new AnalysisCache(cacheDir)
    const mkEntry = (p: string) => ({
      root: p,
      version: 'v',
      fingerprint: 'fp',
      summary: {
        root: p,
        fileCount: 0,
        parsedCount: 0,
        failureCount: 0,
        byLanguage: {},
        skippedDirCount: 0,
        nodeCount: 0,
        functionNodeCount: 0,
        externalNodeCount: 0,
        domainCount: 0,
        edgeCount: 0,
        callEdgeCount: 0,
        failures: []
      },
      graph: { nodes: [], edges: [] }
    })
    for (const p of ['/a', '/b', '/c']) {
      await cache.set(p, mkEntry(p))
      await sleep(5) // mtime 차이 보장
    }
    await cache.prune(2) // 상한 2 → 가장 오래된 1개 제거
    const remaining = (await readdir(cacheDir)).filter((n) => n.endsWith('.json'))
    expect(remaining.length).toBe(2)
    // 가장 오래된 /a는 제거, 최신 /c는 유지
    expect(await cache.get('/a')).toBeNull()
    expect(await cache.get('/c')).not.toBeNull()
  })
})

describe('AnalysisCache get/set (M3_4)', () => {
  it('저장한 항목을 다시 읽는다, 없으면 null', async () => {
    cacheDir = await mkdtemp(join(tmpdir(), 'ctv-cache-'))
    const cache = new AnalysisCache(cacheDir)
    expect(await cache.get('/p/none')).toBeNull()

    const entry = {
      root: '/p/x',
      version: 'test-v',
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
        callEdgeCount: 0,
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

  it('mtime만 바뀌고 내용이 같으면 재분석을 생략한다(하이브리드)', async () => {
    root = await mkdtemp(join(tmpdir(), 'ctv-an-'))
    cacheDir = await mkdtemp(join(tmpdir(), 'ctv-cache-'))
    await write('A.java', 'class A {}')
    const cache = new AnalysisCache(cacheDir)

    const r1 = await analyzeProject(root, parser, cache)
    expect(r1.fromCache).toBe(false)

    await sleep(5)
    await write('A.java', 'class A {}') // 동일 내용, mtime만 변경 → stat 지문은 달라짐
    const r2 = await analyzeProject(root, parser, cache)
    expect(r2.fromCache).toBe(true) // 내용 해시로 재확인 → 재사용
    expect(r2.summary).toEqual(r1.summary)
  })
})
