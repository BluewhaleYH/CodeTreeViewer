import { describe, it, expect } from 'vitest'
import { classifyDomain, defaultDomain } from '../src/main/analysis/domain'

describe('영역(Domain) 분류 (M4_5)', () => {
  it('Gradle 모듈(/src/ 앞 경로)을 영역으로 본다', () => {
    expect(defaultDomain('app/src/main/java/com/X.java')).toBe('app')
    expect(defaultDomain('libs/core/src/main/kotlin/Y.kt')).toBe('libs/core')
  })

  it('src가 없으면 최상위 디렉터리를 영역으로 본다', () => {
    expect(defaultDomain('frameworks/base/core/java/Z.java')).toBe('frameworks')
  })

  it('루트 직속 파일은 미분류(null)', () => {
    expect(defaultDomain('Top.java')).toBeNull()
  })

  it('사용자 매핑(접두사)이 기본 프리셋보다 우선한다', () => {
    const rules = [{ prefix: 'frameworks/', domain: 'Framework' }]
    expect(classifyDomain('frameworks/base/core/Z.java', rules)).toBe('Framework')
    // 매칭 안 되는 경로는 기본 프리셋
    expect(classifyDomain('app/src/main/X.java', rules)).toBe('app')
  })
})
