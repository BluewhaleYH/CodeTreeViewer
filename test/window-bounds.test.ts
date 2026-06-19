import { describe, it, expect } from 'vitest'
import { chooseBounds, isVisibleOn, type Rect } from '../src/main/session/window-bounds'

const display: Rect = { x: 0, y: 0, width: 1920, height: 1080 }

describe('창 경계 보정 (M8_2)', () => {
  it('디스플레이와 겹치면 visible', () => {
    expect(isVisibleOn({ x: 100, y: 100, width: 800, height: 600 }, [display])).toBe(true)
  })

  it('완전히 화면 밖이면 not visible', () => {
    expect(isVisibleOn({ x: 5000, y: 5000, width: 800, height: 600 }, [display])).toBe(false)
  })

  it('화면 안 경계는 그대로 복원', () => {
    const restored: Rect = { x: 100, y: 100, width: 1000, height: 700 }
    expect(chooseBounds(restored, [display], { width: 1280, height: 800 })).toEqual(restored)
  })

  it('화면 밖/없음이면 기본 크기로 폴백', () => {
    const fallback = { width: 1280, height: 800 }
    expect(
      chooseBounds({ x: 9999, y: 9999, width: 800, height: 600 }, [display], fallback)
    ).toEqual(fallback)
    expect(chooseBounds(null, [display], fallback)).toEqual(fallback)
  })
})
