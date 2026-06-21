import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildLineIndex,
  readLines,
  readLinesAt,
  scanFilter,
  scanSearch,
  scanRelated
} from '../src/main/log-store'
import { EMPTY_FILTER } from '../src/shared/log-filter'
import type { LogSite } from '../src/shared/log'

let dir: string
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
})

async function makeFile(content: string): Promise<string> {
  dir = await mkdtemp(join(tmpdir(), 'ctv-log-'))
  const path = join(dir, 'big.log')
  await writeFile(path, content)
  return path
}

describe('log-store buildLineIndex/readLines (TODO_EXTRA C)', () => {
  it('개행으로 끝나는 파일의 라인 인덱스/윈도우', async () => {
    const path = await makeFile('a\nbb\nccc\n')
    const index = await buildLineIndex(path)
    expect(index.offsets.length).toBe(3) // a, bb, ccc
    expect(await readLines(index, path, 0, 3)).toEqual(['a', 'bb', 'ccc'])
    expect(await readLines(index, path, 1, 3)).toEqual(['bb', 'ccc'])
    expect(await readLines(index, path, 2, 3)).toEqual(['ccc'])
  })

  it('개행으로 끝나지 않는 파일', async () => {
    const path = await makeFile('x\ny\nz')
    const index = await buildLineIndex(path)
    expect(index.offsets.length).toBe(3)
    expect(await readLines(index, path, 0, 3)).toEqual(['x', 'y', 'z'])
  })

  it('CRLF 개행도 윈도우에서 분리한다', async () => {
    const path = await makeFile('p\r\nq\r\nr\r\n')
    const index = await buildLineIndex(path)
    expect(index.offsets.length).toBe(3)
    expect(await readLines(index, path, 0, 2)).toEqual(['p', 'q'])
  })

  it('범위를 벗어난 윈도우 요청은 안전', async () => {
    const path = await makeFile('one\ntwo\n')
    const index = await buildLineIndex(path)
    expect(await readLines(index, path, 5, 9)).toEqual([])
    expect(await readLines(index, path, 0, 100)).toEqual(['one', 'two'])
  })

  it('흩어진 라인 인덱스를 개별로 읽는다(readLinesAt)', async () => {
    const path = await makeFile('l0\nl1\nl2\nl3\nl4\n')
    const index = await buildLineIndex(path)
    expect(await readLinesAt(index, path, [0, 2, 4])).toEqual(['l0', 'l2', 'l4'])
    expect(await readLinesAt(index, path, [3, 99])).toEqual(['l3', '']) // 범위 밖은 빈 문자열
  })
})

describe('log-store 스트리밍 스캔 (TODO_EXTRA C)', () => {
  const log = [
    '06-19 14:22:01.118  1 1 D MainActivity: onCreate()',
    '06-19 14:22:01.123  1 1 E Repository: load failed',
    '06-19 14:22:01.130  1 1 I Repository: load ok',
    '06-19 14:22:01.142  1 1 W Net: slow'
  ].join('\n')

  it('빈 필터는 전체 인덱스', async () => {
    const path = await makeFile(log)
    expect(await scanFilter(path, EMPTY_FILTER)).toEqual([0, 1, 2, 3])
  })

  it('레벨 필터(E만)', async () => {
    const path = await makeFile(log)
    const result = await scanFilter(path, { ...EMPTY_FILTER, levels: new Set(['E']) })
    expect(result).toEqual([1])
  })

  it('태그 필터(Repository)', async () => {
    const path = await makeFile(log)
    const result = await scanFilter(path, { ...EMPTY_FILTER, tag: 'Repository' })
    expect(result).toEqual([1, 2])
  })

  it('텍스트 필터', async () => {
    const path = await makeFile(log)
    const result = await scanFilter(path, { ...EMPTY_FILTER, text: 'failed' })
    expect(result).toEqual([1])
  })

  it('검색은 visible 인덱스 중에서만 매치', async () => {
    const path = await makeFile(log)
    expect(await scanSearch(path, [0, 1, 2, 3], 'load', false)).toEqual([1, 2])
    expect(await scanSearch(path, [2, 3], 'load', false)).toEqual([2]) // visible 제한
  })

  it('관련 라인(파일 로그 사이트 매칭)', async () => {
    const path = await makeFile(log)
    const sites: LogSite[] = [
      {
        file: 'Repository.kt',
        line: 10,
        level: 'E',
        tag: 'Repository',
        format: 'load failed',
        pattern: 'load failed'
      }
    ]
    expect(await scanRelated(path, sites, 'Repository.kt')).toEqual([1])
    expect(await scanRelated(path, sites, 'Other.kt')).toEqual([])
  })
})
