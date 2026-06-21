import { session } from 'electron'

/**
 * 렌더러 응답에 Content-Security-Policy 헤더를 주입한다. (TODO_EXTRA A, 01 §2)
 *
 * 정적 `<meta>` 대신 헤더로 dev/prod를 분기한다:
 * - dev(HMR): Vite 클라이언트가 `eval`/inline을 쓰고 ws로 HMR을 받으므로 완화한다.
 * - prod: 스크립트의 `'unsafe-inline'`/`'unsafe-eval'`을 제거한 엄격 정책(XSS 방어).
 *
 * dev/prod 구분은 `ELECTRON_RENDERER_URL` 유무로 한다(dev=HMR 서버, prod=loadFile).
 * `index.html`에는 CSP 메타가 없다(헤더가 단일 출처).
 */
export function installContentSecurityPolicy(): void {
  const isDev = Boolean(process.env['ELECTRON_RENDERER_URL'])
  const policy = isDev ? DEV_CSP : PROD_CSP
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders }
    // 기존 CSP 키(대소문자 무관)를 제거하고 단일 정책으로 덮어쓴다.
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === 'content-security-policy') delete headers[key]
    }
    headers['Content-Security-Policy'] = [policy]
    callback({ responseHeaders: headers })
  })
}

/**
 * 프로덕션 정책: 스크립트는 동일 출처만(eval/inline 불가).
 * - style: Monaco가 동적 `<style>`를 주입하므로 `'unsafe-inline'` 유지(스타일은 XSS 벡터가 약함).
 * - worker: Vite `?worker` 번들(동일 출처) + 일부 blob 워커 대비.
 * - connect: 렌더러는 IPC만 사용하므로 외부 연결 불필요.
 */
const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-src 'none'"
].join('; ')

/** 개발 정책: HMR(eval/inline/ws) 허용. */
const DEV_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "connect-src 'self' ws:"
].join('; ')
