import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { SourceParser, parseFiles, type ParserConfig } from '../src/main/analysis/parser'
import type { ScannedFile } from '../src/main/analysis/scanner'

const require = createRequire(import.meta.url)
const config: ParserConfig = {
  runtimeWasmPath: join(dirname(require.resolve('web-tree-sitter')), 'tree-sitter.wasm'),
  grammarWasmPaths: {
    java: require.resolve('tree-sitter-wasms/out/tree-sitter-java.wasm'),
    kotlin: require.resolve('tree-sitter-wasms/out/tree-sitter-kotlin.wasm')
  }
}

let parser: SourceParser

beforeAll(async () => {
  parser = await SourceParser.create(config)
})

describe('SourceParser — Tree-sitter 파싱 (M3_2)', () => {
  it('Java 소스를 파싱한다', () => {
    const tree = parser.parse('java', 'package a;\nclass Foo { void m() {} }')
    expect(tree.rootNode.type).toBe('program')
    expect(tree.rootNode.hasError()).toBe(false)
  })

  it('Kotlin 소스를 파싱한다', () => {
    const tree = parser.parse('kotlin', 'fun main() {\n  val x = 1\n}\n')
    expect(tree.rootNode.type).toBe('source_file')
    expect(tree.rootNode.hasError()).toBe(false)
    expect(tree.rootNode.childCount).toBeGreaterThan(0)
  })

  it('구문 오류는 hasError로 표시하고 트리는 유지한다(오류 허용)', () => {
    const tree = parser.parse('java', 'class Foo { void m( { ')
    expect(tree.rootNode.hasError()).toBe(true)
  })
})

describe('parseFiles — 실패 파일 건너뜀/기록 (M3_2)', () => {
  let root: string

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true })
  })

  it('읽기 실패 파일은 failures에 기록하고 나머지는 계속 파싱한다', async () => {
    root = await mkdtemp(join(tmpdir(), 'ctv-parse-'))
    const okPath = join(root, 'Ok.java')
    await writeFile(okPath, 'class Ok {}')

    const files: ScannedFile[] = [
      { absolutePath: okPath, relativePath: 'Ok.java', language: 'java' },
      { absolutePath: join(root, 'Missing.kt'), relativePath: 'Missing.kt', language: 'kotlin' }
    ]

    const result = await parseFiles(parser, files)
    expect(result.parsed.map((p) => p.file.relativePath)).toEqual(['Ok.java'])
    expect(result.parsed[0].hasError).toBe(false)
    expect(result.failures.map((f) => f.file.relativePath)).toEqual(['Missing.kt'])
    expect(result.failures[0].reason).toMatch(/ENOENT|no such file/i)
  })
})
