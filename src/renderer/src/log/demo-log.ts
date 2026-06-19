import type { LogSite } from '../../../shared/log'

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

/** 데모 로그 호출 위치(역추적 다중 후보 시연용). 선택 라인(인덱스 5)의 메시지와 매칭된다. */
export const DEMO_LOG_SITES: LogSite[] = [
  {
    file: 'core/src/main/kotlin/Repository.kt',
    line: 14,
    level: 'E',
    tag: 'Repository',
    format: '"load() failed: $e"',
    pattern: '^load\\(\\) failed: .*?$'
  },
  {
    file: 'app/src/main/kotlin/LoginViewModel.kt',
    line: 31,
    level: 'E',
    tag: null,
    format: '"load() failed: " + reason',
    pattern: '^load\\(\\) failed: .*?$'
  }
]

/** 데모 코드 뷰 소스(Repository.kt). 강조 라인 14. */
export const DEMO_CODE_LINES: string[] = [
  'package core',
  '',
  'import android.util.Log',
  'import retrofit2.Retrofit',
  '',
  'class Repository(private val api: ApiClient) {',
  '',
  '  suspend fun load(id: Int): Profile {',
  '    Log.i("Repository", "load() fetching profile id=$id")',
  '    return try {',
  '      api.get(id)',
  '    } catch (e: Exception) {',
  '      // 로그 메시지가 logcat의 E Repository 라인과 매칭된다',
  '      Log.e("Repository", "load() failed: $e")',
  '      throw e',
  '    }',
  '  }',
  '}'
]
