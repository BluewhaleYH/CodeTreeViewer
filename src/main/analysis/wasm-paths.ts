import { join } from 'node:path'
import type { ParserConfig } from './parser'

/**
 * 개발 모드 기준 wasm 경로 해석. 프로젝트 node_modules에서 찾는다.
 * 패키징 배포본의 wasm 위치/asarUnpack 처리는 M9(배포)에서 다룬다.
 */
export function resolveParserConfig(
  nodeModulesDir: string = join(process.cwd(), 'node_modules')
): ParserConfig {
  return {
    runtimeWasmPath: join(nodeModulesDir, 'web-tree-sitter', 'tree-sitter.wasm'),
    grammarWasmPaths: {
      java: join(nodeModulesDir, 'tree-sitter-wasms', 'out', 'tree-sitter-java.wasm'),
      kotlin: join(nodeModulesDir, 'tree-sitter-wasms', 'out', 'tree-sitter-kotlin.wasm')
    }
  }
}
