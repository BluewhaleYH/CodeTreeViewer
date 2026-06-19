import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionStore } from '../src/main/session/session-store'
import { emptySession, type SessionState } from '../src/shared/session'

let dir: string

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
})

const sample: SessionState = {
  version: 1,
  window: { bounds: { x: 0, y: 0, width: 1280, height: 800 }, maximized: false },
  tabs: [{ projectPath: '/p/a', projectName: 'a', view: { mode: 'graph', selectedNodeId: null } }],
  activeIndex: 0
}

describe('SessionStore (M8_1)', () => {
  it('파일이 없으면 빈 세션을 반환한다', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ctv-sess-'))
    const store = new SessionStore(dir)
    expect(await store.load()).toEqual(emptySession())
  })

  it('저장한 세션을 다시 읽는다(원자적 쓰기)', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ctv-sess-'))
    const store = new SessionStore(dir)
    await store.save(sample)
    expect(await store.load()).toEqual(sample)
  })

  it('손상된 JSON은 빈 세션으로 폴백한다', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ctv-sess-'))
    await writeFile(join(dir, 'session.json'), '{ broken')
    const store = new SessionStore(dir)
    expect(await store.load()).toEqual(emptySession())
  })

  it('버전 불일치는 빈 세션으로 폴백한다', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ctv-sess-'))
    await writeFile(join(dir, 'session.json'), JSON.stringify({ ...sample, version: 999 }))
    const store = new SessionStore(dir)
    expect(await store.load()).toEqual(emptySession())
  })
})
