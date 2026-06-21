/**
 * 줄바꿈(wrap) 모드용 가변 높이 가상 스크롤(순수). (04 §3, TODO_EXTRA C)
 *
 * 고정 행 높이 가상 스크롤(log-virtual.ts)은 한 라인 = 한 행을 가정한다.
 * wrap 모드에서는 긴 라인이 여러 시각 행으로 접히므로, 각 라인의 시각 행 수로
 * 누적 픽셀 오프셋(prefix)을 만들어 가변 높이 가상 스크롤을 수행한다.
 *
 * 등폭 글꼴이라 라인 길이와 행당 글자 수로 시각 행 수를 결정적으로 계산할 수 있다(DOM 측정 불필요).
 */

/** 라인 한 줄이 wrap 시 차지하는 시각 행 수(최소 1). */
export function visualRows(lineLength: number, charsPerRow: number): number {
  if (charsPerRow <= 0) return 1
  return Math.max(1, Math.ceil(lineLength / charsPerRow))
}

/** 각 라인의 시각 행 수로 누적 픽셀 오프셋 prefix[0..n]을 만든다(prefix[i] = i번째 라인 top). */
export function buildPrefix(rowCounts: readonly number[], rowHeight: number): number[] {
  const prefix = new Array<number>(rowCounts.length + 1)
  prefix[0] = 0
  for (let i = 0; i < rowCounts.length; i += 1) {
    prefix[i + 1] = prefix[i] + rowCounts[i] * rowHeight
  }
  return prefix
}

/** prefix에서 픽셀 y를 포함하는 라인 인덱스(prefix[i] <= y < prefix[i+1])를 이분 탐색한다. */
function lineAt(prefix: readonly number[], y: number): number {
  let lo = 0
  let hi = prefix.length - 2 // 마지막 라인 인덱스
  if (hi < 0) return 0
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (prefix[mid] <= y) lo = mid
    else hi = mid - 1
  }
  return lo
}

export interface WrappedRange {
  start: number
  end: number
  padTop: number
  padBottom: number
}

/** 누적 prefix로 가변 높이 가상 스크롤의 [start, end) + 위/아래 패딩을 구한다. */
export function wrappedRange(
  scrollTop: number,
  viewportHeight: number,
  prefix: readonly number[],
  overscan = 6
): WrappedRange {
  const n = prefix.length - 1
  if (n <= 0) return { start: 0, end: 0, padTop: 0, padBottom: 0 }
  const total = prefix[n]
  const top = Math.max(0, scrollTop)
  const bottom = top + Math.max(0, viewportHeight)
  const first = lineAt(prefix, top)
  const last = lineAt(prefix, Math.min(bottom, total))
  const start = Math.max(0, first - overscan)
  const end = Math.min(n, last + 1 + overscan)
  return { start, end, padTop: prefix[start], padBottom: total - prefix[end] }
}
