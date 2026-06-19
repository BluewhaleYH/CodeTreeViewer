import { join } from 'node:path'
import type { ParserConfig } from './parser'

/**
 * wasm 경로 해석. (DEPLOY.md §5)
 * - 개발/테스트: 프로젝트 node_modules에서 찾는다.
 * - 패키징 배포본: electron-builder `extraResources`로 복사된 `<resources>/wasm/`에서 찾는다.
 *   (asar 내부는 fs로 직접 읽을 수 없으므로 wasm을 리소스로 풀어 둔다.)
 */
export interface WasmResolveOptions {
  /** 패키징 배포본 여부(app.isPackaged). */
  packaged?: boolean
  /** 패키징 시 리소스 경로(process.resourcesPath). */
  resourcesPath?: string
  /** 개발/테스트 시 node_modules 경로 오버라이드. */
  nodeModulesDir?: string
}

export function resolveParserConfig(options: WasmResolveOptions = {}): ParserConfig {
  if (options.packaged && options.resourcesPath) {
    const dir = join(options.resourcesPath, 'wasm')
    return {
      runtimeWasmPath: join(dir, 'tree-sitter.wasm'),
      grammarWasmPaths: {
        java: join(dir, 'tree-sitter-java.wasm'),
        kotlin: join(dir, 'tree-sitter-kotlin.wasm')
      }
    }
  }

  const nodeModulesDir = options.nodeModulesDir ?? join(process.cwd(), 'node_modules')
  return {
    runtimeWasmPath: join(nodeModulesDir, 'web-tree-sitter', 'tree-sitter.wasm'),
    grammarWasmPaths: {
      java: join(nodeModulesDir, 'tree-sitter-wasms', 'out', 'tree-sitter-java.wasm'),
      kotlin: join(nodeModulesDir, 'tree-sitter-wasms', 'out', 'tree-sitter-kotlin.wasm')
    }
  }
}
