/**
 * 영역(Domain) 분류. (02 §5, 00 §10 D10)
 * 방식: 사용자 정의 매핑(경로 접두사 규칙) 우선, 없으면 범용 기본 프리셋.
 * 기본 프리셋은 특정 레이아웃(AOSP 등)을 가정하지 않고 모듈/최상위 디렉터리로 그룹화한다.
 */

export interface DomainRule {
  /** relativePath 접두사. 매칭되면 domain을 부여한다. */
  prefix: string
  domain: string
}

/**
 * 범용 기본 영역: Gradle 모듈 추정(`/src/` 앞 경로) 또는 최상위 디렉터리.
 * 예) `app/src/main/java/X.java` → `app`, `libs/core/src/...` → `libs/core`,
 *     `frameworks/base/core/...` → `frameworks`(src 없음 → 최상위 디렉터리).
 * 루트 직속 파일은 분류 불가(null).
 */
export function defaultDomain(relativePath: string): string | null {
  const srcIndex = relativePath.indexOf('/src/')
  if (srcIndex > 0) return relativePath.slice(0, srcIndex)
  const firstSlash = relativePath.indexOf('/')
  if (firstSlash > 0) return relativePath.slice(0, firstSlash)
  return null
}

/** 사용자 매핑(접두사 규칙) 우선, 없으면 기본 프리셋. 미분류는 null. */
export function classifyDomain(
  relativePath: string,
  rules: readonly DomainRule[] = []
): string | null {
  for (const rule of rules) {
    if (relativePath.startsWith(rule.prefix)) return rule.domain
  }
  return defaultDomain(relativePath)
}
