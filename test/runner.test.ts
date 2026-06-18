import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SourceParser } from '../src/main/analysis/parser'
import { resolveParserConfig } from '../src/main/analysis/wasm-paths'
import { runAnalysis } from '../src/main/analysis/runner'
import type { AnalysisProgress } from '../src/shared/analysis'

let parser: SourceParser
let root: string

beforeAll(async () => {
  // wasm-paths(런타임 해석기)를 그대로 사용해 검증한다.
  parser = await SourceParser.create(resolveParserConfig())
})

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true })
})

async function write(rel: string, content = ''): Promise<void> {
  const full = join(root, rel)
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, content)
}

describe('runAnalysis — 스캔→파싱 오케스트레이션 (M3_3)', () => {
  it('프로젝트를 분석해 요약을 만든다', async () => {
    root = await mkdtemp(join(tmpdir(), 'ctv-run-'))
    await write('app/src/main/java/Foo.java', 'class Foo {}')
    await write('app/src/main/kotlin/Bar.kt', 'fun bar() {}')
    await write('build/Ignored.java', 'class Ignored {}')

    const summary = await runAnalysis(root, parser)

    expect(summary.fileCount).toBe(2)
    expect(summary.parsedCount).toBe(2)
    expect(summary.failureCount).toBe(0)
    expect(summary.byLanguage).toEqual({ java: 1, kotlin: 1 })
  })

  it('진행률을 scanning→parsing→done 순으로 보고한다', async () => {
    root = await mkdtemp(join(tmpdir(), 'ctv-run-'))
    await write('A.java', 'class A {}')

    const phases: AnalysisProgress['phase'][] = []
    await runAnalysis(root, parser, { onProgress: (p) => phases.push(p.phase) })

    expect(phases[0]).toBe('scanning')
    expect(phases).toContain('parsing')
    expect(phases[phases.length - 1]).toBe('done')
  })

  it('빈 프로젝트도 안전하게 처리한다', async () => {
    root = await mkdtemp(join(tmpdir(), 'ctv-run-'))
    const summary = await runAnalysis(root, parser)
    expect(summary.fileCount).toBe(0)
    expect(summary.parsedCount).toBe(0)
  })

  it('resolveParserConfig가 존재하는 wasm 경로를 가리킨다', () => {
    const config = resolveParserConfig()
    expect(config.grammarWasmPaths.java).toMatch(/tree-sitter-java\.wasm$/)
    expect(config.grammarWasmPaths.kotlin).toMatch(/tree-sitter-kotlin\.wasm$/)
  })
})
