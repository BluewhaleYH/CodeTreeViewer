import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SettingsStore } from '../src/main/settings-store'
import { defaultSettings, normalizeExcludeDirs, DEFAULT_EXCLUDE_DIRS } from '../src/shared/settings'

let dir: string
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
})

describe('normalizeExcludeDirs (TODO_EXTRA D)', () => {
  it('트림·빈값 제거·중복 제거', () => {
    expect(normalizeExcludeDirs([' build ', 'build', '', '  ', 'out'])).toEqual(['build', 'out'])
  })
})

describe('SettingsStore (TODO_EXTRA D)', () => {
  it('부재 시 기본값을 반환한다', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ctv-set-'))
    const store = new SettingsStore(dir)
    expect(await store.load()).toEqual(defaultSettings())
  })

  it('저장한 값을 정규화해 보관·재로드한다', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ctv-set-'))
    const store = new SettingsStore(dir)
    const saved = await store.save({ version: 1, excludeDirs: [' build ', 'build', 'vendor'] })
    expect(saved.excludeDirs).toEqual(['build', 'vendor'])
    // 새 인스턴스로 디스크에서 재로드
    const store2 = new SettingsStore(dir)
    expect((await store2.load()).excludeDirs).toEqual(['build', 'vendor'])
  })

  it('손상된 설정 파일은 기본값으로 폴백한다', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ctv-set-'))
    await writeFile(join(dir, 'settings.json'), '{ not json')
    const store = new SettingsStore(dir)
    expect((await store.load()).excludeDirs).toEqual([...DEFAULT_EXCLUDE_DIRS])
  })
})
