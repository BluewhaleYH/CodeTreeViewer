import { defineConfig } from '@playwright/test'

/**
 * Electron E2E 설정. (TODO_EXTRA E)
 * 앱은 각 테스트에서 _electron.launch로 직접 띄운다(브라우저 프로젝트 없음).
 * 실행 전 `npm run build`로 out/이 준비되어 있어야 한다(test:e2e 스크립트가 보장).
 */
export default defineConfig({
  testDir: './test/e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [['list']]
})
