/** 자체 검수(스크린샷)용 데모 logcat 라인. 실제 로그와 무관. (M11_1) */
export const DEMO_LOG_LINES: string[] = [
  '06-19 14:22:01.118  1234  1300 D MainActivity: onCreate()',
  '06-19 14:22:01.123  1234  1300 D LoginViewModel: login() start user=alice',
  '06-19 14:22:01.130  1234  1300 I Repository: load() fetching profile id=42',
  '06-19 14:22:01.142  1234  1305 D ApiClient: get(/profile/42) enqueue',
  '06-19 14:22:01.250  1234  1305 W ApiClient: get() retry 1 (timeout)',
  '06-19 14:22:01.400  1234  1305 E Repository: load() failed: java.net.SocketTimeoutException',
  '06-19 14:22:01.402  1234  1300 W LoginViewModel: onRetry() scheduling retry',
  '06-19 14:22:01.910  1234  1305 I Repository: load() ok (cached)',
  '06-19 14:22:01.915  1234  1300 D LoginViewModel: login() success',
  '06-19 14:22:02.001  1234  1300 V Logger: flush() 3 events'
]
