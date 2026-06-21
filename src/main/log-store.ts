import { createReadStream } from 'node:fs'
import { open, stat } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { compileFilter, type LogFilter } from '../shared/log-filter'
import { parseLogcatLine } from '../shared/logcat-parse'
import { matchLogSites } from '../shared/log-match'
import type { LogSite } from '../shared/log'

/**
 * 대용량 로그 디스크 스트리밍. (04 §3, TODO_EXTRA C)
 * 임계값을 넘는 로그는 전량 메모리에 올리지 않고, main이 라인 오프셋 인덱스만 보관한 뒤
 * 표시 윈도우는 디스크에서 부분 읽기, 필터/검색/매칭은 줄 단위 스트리밍 스캔으로 처리한다.
 */

/** 이 크기를 넘으면 스트리밍 모드. (바이트) */
export const LOG_STREAM_THRESHOLD = 50 * 1024 * 1024

export interface LineIndex {
  /** 각 라인 시작 바이트 오프셋. 길이 = 라인 수. */
  offsets: number[]
  /** 파일 바이트 크기. */
  size: number
}

/** 파일을 한 번 스캔해 라인 시작 오프셋 인덱스를 만든다(전체 텍스트 비보관). */
export async function buildLineIndex(path: string): Promise<LineIndex> {
  const { size } = await stat(path)
  const offsets: number[] = [0]
  const fh = await open(path, 'r')
  try {
    const CHUNK = 1 << 20
    const buf = Buffer.allocUnsafe(CHUNK)
    let pos = 0
    while (pos < size) {
      const { bytesRead } = await fh.read(buf, 0, CHUNK, pos)
      if (bytesRead <= 0) break
      for (let i = 0; i < bytesRead; i += 1) {
        if (buf[i] === 0x0a) offsets.push(pos + i + 1) // '\n' 다음 = 다음 라인 시작
      }
      pos += bytesRead
    }
  } finally {
    await fh.close()
  }
  // 파일이 개행으로 끝나면 마지막 빈 라인 오프셋 제거(splitLines 의미와 일치).
  if (offsets.length > 1 && offsets[offsets.length - 1] === size) offsets.pop()
  if (size === 0) return { offsets: [], size }
  return { offsets, size }
}

/** [start, end) 라인을 디스크에서 읽어 반환한다(가상 스크롤 윈도우). */
export async function readLines(
  index: LineIndex,
  path: string,
  start: number,
  end: number
): Promise<string[]> {
  const { offsets, size } = index
  const s = Math.max(0, start)
  const e = Math.min(offsets.length, end)
  if (s >= e) return []
  const startByte = offsets[s]
  const endByte = e < offsets.length ? offsets[e] : size
  const len = endByte - startByte
  if (len <= 0) return []
  const fh = await open(path, 'r')
  try {
    const buf = Buffer.allocUnsafe(len)
    await fh.read(buf, 0, len, startByte)
    return buf.toString('utf8').split(/\r?\n/).slice(0, e - s)
  } finally {
    await fh.close()
  }
}

/** 임의의 라인 인덱스 목록을 디스크에서 읽어 반환한다(필터로 흩어진 가시 라인 표시용). */
export async function readLinesAt(
  index: LineIndex,
  path: string,
  indices: readonly number[]
): Promise<string[]> {
  const { offsets, size } = index
  const fh = await open(path, 'r')
  try {
    const out: string[] = []
    for (const i of indices) {
      if (i < 0 || i >= offsets.length) {
        out.push('')
        continue
      }
      const startByte = offsets[i]
      const endByte = i + 1 < offsets.length ? offsets[i + 1] : size
      const len = Math.max(0, endByte - startByte)
      if (len === 0) {
        out.push('')
        continue
      }
      const buf = Buffer.allocUnsafe(len)
      await fh.read(buf, 0, len, startByte)
      out.push(buf.toString('utf8').replace(/\r?\n$/, ''))
    }
    return out
  } finally {
    await fh.close()
  }
}

/** 줄 단위 스트리밍 반복(메모리 비적재). */
async function forEachLine(path: string, fn: (line: string, index: number) => void): Promise<void> {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity })
  let i = 0
  for await (const line of rl) {
    fn(line, i)
    i += 1
  }
}

/** 필터를 통과하는 라인 인덱스(스트리밍 스캔). */
export async function scanFilter(path: string, filter: LogFilter): Promise<number[]> {
  const pred = compileFilter(filter)
  const out: number[] = []
  await forEachLine(path, (line, i) => {
    if (pred(line, parseLogcatLine(line))) out.push(i)
  })
  return out
}

/** visible 인덱스 중 검색어에 매치되는 라인(스트리밍 스캔). */
export async function scanSearch(
  path: string,
  visible: readonly number[],
  query: string,
  regex: boolean
): Promise<number[]> {
  if (query === '') return []
  let test: (s: string) => boolean
  if (regex) {
    let re: RegExp
    try {
      re = new RegExp(query, 'i')
    } catch {
      return []
    }
    test = (s) => re.test(s)
  } else {
    const q = query.toLowerCase()
    test = (s) => s.toLowerCase().includes(q)
  }
  const visibleSet = new Set(visible)
  const out: number[] = []
  await forEachLine(path, (line, i) => {
    if (visibleSet.has(i) && test(line)) out.push(i)
  })
  return out
}

/** 특정 소스 파일의 로그 사이트와 연관된 라인 인덱스(노드→로그 연동, 스트리밍 스캔). */
export async function scanRelated(
  path: string,
  sites: readonly LogSite[],
  file: string
): Promise<number[]> {
  const fileSites = sites.filter((s) => s.file === file)
  const out: number[] = []
  if (fileSites.length === 0) return out
  await forEachLine(path, (line, i) => {
    if (matchLogSites(line, parseLogcatLine(line), fileSites).length > 0) out.push(i)
  })
  return out
}
