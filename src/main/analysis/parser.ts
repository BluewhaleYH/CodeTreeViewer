import { readFile } from 'node:fs/promises'
import Parser from 'web-tree-sitter'
import type { ScannedFile, SourceLanguage } from './scanner'

/**
 * Tree-sitter(WASM) 통합. (02 §2, §3)
 * 네이티브 바인딩 대신 web-tree-sitter(WASM)를 사용해 Electron/Node(테스트) 양쪽에서 동일하게 동작한다.
 * 문법 wasm은 tree-sitter-wasms(tree-sitter CLI 0.20.x 빌드)에서 가져오며, 런타임은 web-tree-sitter 0.20.x로 맞춘다.
 * 문법/런타임 wasm 경로는 주입받는다(런타임 번들 위치 연결은 M3_3).
 */

export interface ParserConfig {
  /** web-tree-sitter 런타임 wasm(tree-sitter.wasm) 경로. 미지정 시 기본 해석. */
  runtimeWasmPath?: string
  /** 언어별 문법 wasm 경로(로드할 언어만). */
  grammarWasmPaths: Partial<Record<SourceLanguage, string>>
}

export interface ParsedFile {
  file: ScannedFile
  tree: Parser.Tree
  /** 구문 오류 포함 여부(tree-sitter는 오류 허용 파싱이라 부분 트리는 유지한다). */
  hasError: boolean
}

export interface ParseFailure {
  file: ScannedFile
  reason: string
}

export interface ParseProjectResult {
  parsed: ParsedFile[]
  /** 읽기/파싱 불가로 건너뛴 파일. 분석은 계속한다. (02 §3, §8) */
  failures: ParseFailure[]
}

let runtimeInitialized = false

export class SourceParser {
  private readonly parser: Parser
  private readonly languages: Map<SourceLanguage, Parser.Language>

  private constructor(parser: Parser, languages: Map<SourceLanguage, Parser.Language>) {
    this.parser = parser
    this.languages = languages
  }

  /** 파서를 초기화하고 언어 문법을 로드한다. */
  static async create(config: ParserConfig): Promise<SourceParser> {
    if (!runtimeInitialized) {
      await Parser.init(
        config.runtimeWasmPath ? { locateFile: () => config.runtimeWasmPath as string } : undefined
      )
      runtimeInitialized = true
    }

    const parser = new Parser()
    const languages = new Map<SourceLanguage, Parser.Language>()
    for (const [language, wasmPath] of Object.entries(config.grammarWasmPaths) as [
      SourceLanguage,
      string
    ][]) {
      const bytes = await readFile(wasmPath)
      languages.set(language, await Parser.Language.load(bytes))
    }

    return new SourceParser(parser, languages)
  }

  /** 소스 코드를 파싱해 트리를 반환한다. */
  parse(language: SourceLanguage, code: string): Parser.Tree {
    const grammar = this.languages.get(language)
    if (!grammar) throw new Error(`지원하지 않는 언어: ${language}`)
    this.parser.setLanguage(grammar)
    return this.parser.parse(code)
  }
}

/**
 * 스캔된 파일들을 읽어 파싱한다.
 * 읽기/파싱 실패 파일은 건너뛰고 failures에 기록한다(부분 결과 허용). (02 §3, §8)
 */
export async function parseFiles(
  parser: SourceParser,
  files: readonly ScannedFile[]
): Promise<ParseProjectResult> {
  const parsed: ParsedFile[] = []
  const failures: ParseFailure[] = []

  for (const file of files) {
    try {
      const code = await readFile(file.absolutePath, 'utf8')
      const tree = parser.parse(file.language, code)
      parsed.push({ file, tree, hasError: tree.rootNode.hasError() })
    } catch (error) {
      failures.push({ file, reason: error instanceof Error ? error.message : String(error) })
    }
  }

  return { parsed, failures }
}
