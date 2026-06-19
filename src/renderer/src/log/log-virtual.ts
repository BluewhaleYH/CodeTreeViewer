/**
 * 가상 스크롤 가시 범위 계산(순수). (04 §3, M11_2)
 * 고정 행 높이를 가정하고 보이는 구간 ± overscan만 렌더하도록 [start, end)를 산출한다.
 */
export interface VisibleRange {
  start: number
  end: number
}

export function visibleRange(
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  total: number,
  overscan = 8
): VisibleRange {
  if (total <= 0 || rowHeight <= 0) return { start: 0, end: 0 }
  const top = Math.max(0, scrollTop)
  const first = Math.floor(top / rowHeight)
  const visibleCount = Math.ceil(Math.max(0, viewportHeight) / rowHeight)
  const start = Math.max(0, first - overscan)
  const end = Math.min(total, first + visibleCount + overscan)
  return { start, end }
}
