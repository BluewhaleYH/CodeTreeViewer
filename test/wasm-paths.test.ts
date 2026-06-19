import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { resolveParserConfig } from '../src/main/analysis/wasm-paths'

describe('resolveParserConfig (M9_2)', () => {
  it('패키징 모드는 resources/wasm 경로로 해석한다', () => {
    const config = resolveParserConfig({ packaged: true, resourcesPath: '/app/resources' })
    expect(config.runtimeWasmPath).toBe(join('/app/resources', 'wasm', 'tree-sitter.wasm'))
    expect(config.grammarWasmPaths.java).toBe(
      join('/app/resources', 'wasm', 'tree-sitter-java.wasm')
    )
    expect(config.grammarWasmPaths.kotlin).toBe(
      join('/app/resources', 'wasm', 'tree-sitter-kotlin.wasm')
    )
  })

  it('패키징이지만 resourcesPath가 없으면 개발 경로로 폴백한다', () => {
    const config = resolveParserConfig({ packaged: true, nodeModulesDir: '/proj/node_modules' })
    expect(config.runtimeWasmPath).toBe(
      join('/proj/node_modules', 'web-tree-sitter', 'tree-sitter.wasm')
    )
  })

  it('개발 모드는 node_modules 경로로 해석한다', () => {
    const config = resolveParserConfig({ nodeModulesDir: '/proj/node_modules' })
    expect(config.grammarWasmPaths.kotlin).toBe(
      join('/proj/node_modules', 'tree-sitter-wasms', 'out', 'tree-sitter-kotlin.wasm')
    )
  })

  it('인자 없으면 cwd의 node_modules를 기본 사용한다', () => {
    const config = resolveParserConfig()
    expect(config.runtimeWasmPath).toBe(
      join(process.cwd(), 'node_modules', 'web-tree-sitter', 'tree-sitter.wasm')
    )
  })
})
