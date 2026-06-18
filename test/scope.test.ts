import { describe, it, expect } from 'vitest'

// 스코프 테스트: 테스트 하네스가 동작하는지만 확인한다.
// 실제 테스트는 M1+ 기능과 함께 추가한다. (CLAUDE.md §9)
describe('scope', () => {
  it('테스트 하네스가 동작한다', () => {
    expect(1 + 1).toBe(2)
  })
})
