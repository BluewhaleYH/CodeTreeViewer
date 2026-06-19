/**
 * 창 경계 보정(순수). (01 §3)
 * 저장된 위치가 현재 디스플레이 밖이면(모니터 분리/해상도 변경) 기본 크기로 폴백한다.
 */

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

/** rect가 디스플레이 작업영역 중 하나와 겹치면 visible. */
export function isVisibleOn(rect: Rect, areas: readonly Rect[]): boolean {
  return areas.some(
    (a) =>
      rect.x < a.x + a.width &&
      rect.x + rect.width > a.x &&
      rect.y < a.y + a.height &&
      rect.y + rect.height > a.y
  )
}

/** 복원할 창 옵션을 고른다. 화면 밖이면 기본 크기(중앙). */
export function chooseBounds(
  restored: Rect | null,
  areas: readonly Rect[],
  fallback: Size
): Rect | Size {
  if (restored && isVisibleOn(restored, areas)) return restored
  return fallback
}
