import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

/**
 * 분석 소스(src/main/analysis)의 내용 해시. 분석 로직이 바뀌면 값이 달라진다.
 * cache.ts의 ANALYZER_VERSION으로 주입되어 캐시를 자동 무효화한다(수동 버전 관리 제거). (TODO_EXTRA B)
 */
function analyzerHash(): string {
  const hash = createHash('sha256')
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (name.endsWith('.ts')) hash.update(name).update(readFileSync(p))
    }
  }
  walk(resolve(__dirname, 'src/main/analysis'))
  return hash.digest('hex').slice(0, 16)
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      __ANALYZER_HASH__: JSON.stringify(analyzerHash())
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') }
      }
    }
  }
})
