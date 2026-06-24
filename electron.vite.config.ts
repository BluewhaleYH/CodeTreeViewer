import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

/**
 * 빌드 식별자(짧은 커밋 해시). 어느 빌드를 실행 중인지 타이틀바로 확인할 수 있게 한다. (TODO_MORE)
 * CI는 GITHUB_SHA, 로컬은 git rev-parse, 둘 다 없으면 'dev'.
 */
function buildId(): string {
  const env = process.env.GITHUB_SHA
  if (env) return env.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'dev'
  }
}

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
    define: {
      __BUILD_ID__: JSON.stringify(buildId())
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') }
      }
    }
  }
})
