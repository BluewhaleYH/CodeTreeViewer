import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
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

const sample2: SessionState = {
  ...sample,
  tabs: [{ projectPath: '/p/b', projectName: 'b', view: { mode: 'tree', selectedNodeId: null } }]
}

describe('SessionStore (M8_1)', () => {
  it('파일이 없으면 빈 세션을 반환한다(손상 아님)', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ctv-sess-'))
    const store = new SessionStore(dir)
    const r = await store.load()
    expect(r.state).toEqual(emptySession())
    expect(r.corrupted).toBe(false)
    expect(r.recovered).toBe(false)
  })

  it('저장한 세션을 다시 읽는다(원자적 쓰기)', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ctv-sess-'))
    const store = new SessionStore(dir)
    await store.save(sample)
    const r = await store.load()
    expect(r.state).toEqual(sample)
    expect(r.corrupted).toBe(false)
  })

  it('손상된 JSON은 (백업 없으면) 빈 세션으로 폴백하고 손상을 표시한다', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ctv-sess-'))
    await writeFile(join(dir, 'session.json'), '{ broken')
    const store = new SessionStore(dir)
    const r = await store.load()
    expect(r.state).toEqual(emptySession())
    expect(r.corrupted).toBe(true)
  })

  it('버전 불일치는 (백업 없으면) 빈 세션으로 폴백하고 손상을 표시한다', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ctv-sess-'))
    await writeFile(join(dir, 'session.json'), JSON.stringify({ ...sample, version: 999 }))
    const store = new SessionStore(dir)
    const r = await store.load()
    expect(r.state).toEqual(emptySession())
    expect(r.corrupted).toBe(true)
  })
})

describe('SessionStore — 백업 폴백/손상 대비 (M8_5)', () => {
  it('두 번째 저장 시 직전 정상본을 백업으로 회전한다', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ctv-sess-'))
    const store = new SessionStore(dir)
    await store.save(sample)
    await store.save(sample2)
    const backup = JSON.parse(await readFile(join(dir, 'session.bak.json'), 'utf8'))
    expect(backup).toEqual(sample)
    const r = await store.load()
    expect(r.state).toEqual(sample2)
  })

  it('본본이 손상되면 직전 백업본으로 복구한다', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ctv-sess-'))
    const store = new SessionStore(dir)
    await store.save(sample) // 백업 없음
    await store.save(sample2) // backup=sample, target=sample2
    await writeFile(join(dir, 'session.json'), '{ corrupt') // 본본 손상
    const r = await store.load()
    expect(r.state).toEqual(sample) // 직전 백업본
    expect(r.recovered).toBe(true)
    expect(r.corrupted).toBe(true)
  })

  it('본본 부재(저장 중 중단)면 손상 표시 없이 백업본으로 복구한다', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ctv-sess-'))
    const store = new SessionStore(dir)
    await store.save(sample)
    await store.save(sample2)
    await rm(join(dir, 'session.json')) // 본본만 사라짐
    const r = await store.load()
    expect(r.state).toEqual(sample)
    expect(r.recovered).toBe(true)
    expect(r.corrupted).toBe(false) // 부재는 손상이 아님
  })

  it('본본·백업 모두 손상되면 빈 세션으로 안전 기동하고 손상을 표시한다', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ctv-sess-'))
    await writeFile(join(dir, 'session.json'), '{ a')
    await writeFile(join(dir, 'session.bak.json'), '{ b')
    const store = new SessionStore(dir)
    const r = await store.load()
    expect(r.state).toEqual(emptySession())
    expect(r.corrupted).toBe(true)
    expect(r.recovered).toBe(false)
  })
})
