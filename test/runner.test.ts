import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SourceParser } from '../src/main/analysis/parser'
import { resolveParserConfig } from '../src/main/analysis/wasm-paths'
import { runAnalysis } from '../src/main/analysis/runner'
import { contentFingerprint } from '../src/main/analysis/cache'
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

    const { summary } = await runAnalysis(root, parser)

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

  it('파싱·추출 후 파스 트리를 해제한다(메모리 누수 방지)', async () => {
    root = await mkdtemp(join(tmpdir(), 'ctv-run-'))
    await write('A.java', 'class A {}')
    await write('B.kt', 'fun b() {}')

    // parser.parse를 감싸 반환 트리의 delete 호출을 센다.
    let deletes = 0
    const wrapped = {
      parse(language: Parameters<SourceParser['parse']>[0], code: string) {
        const tree = parser.parse(language, code)
        const orig = tree.delete.bind(tree)
        tree.delete = (): void => {
          deletes += 1
          orig()
        }
        return tree
      }
    } as unknown as SourceParser

    const { summary } = await runAnalysis(root, wrapped)
    expect(summary.parsedCount).toBe(2)
    expect(deletes).toBe(2) // 파일마다 정확히 1회 해제
  })

  it('파싱 중 계산한 contentFingerprint가 contentFingerprint(files)와 일치한다 (성능: 재읽기 제거)', async () => {
    root = await mkdtemp(join(tmpdir(), 'ctv-run-'))
    await write('app/A.java', 'class A { void f() {} }')
    await write('app/B.kt', 'fun b() = 1\n')
    await write('app/C.java', 'class C {}')

    const result = await runAnalysis(root, parser)
    // 파싱하며 누적한 지문이 별도 재읽기로 계산한 지문과 동일해야 캐시 하이브리드 체크가 동작한다.
    expect(result.contentFingerprint).toBe(await contentFingerprint(result.files))
  })

  it('빈 프로젝트도 안전하게 처리한다', async () => {
    root = await mkdtemp(join(tmpdir(), 'ctv-run-'))
    const { summary } = await runAnalysis(root, parser)
    expect(summary.fileCount).toBe(0)
    expect(summary.parsedCount).toBe(0)
  })

  it('resolveParserConfig가 존재하는 wasm 경로를 가리킨다', () => {
    const config = resolveParserConfig()
    expect(config.grammarWasmPaths.java).toMatch(/tree-sitter-java\.wasm$/)
    expect(config.grammarWasmPaths.kotlin).toMatch(/tree-sitter-kotlin\.wasm$/)
  })
})
