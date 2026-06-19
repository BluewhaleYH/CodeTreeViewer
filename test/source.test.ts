import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readSourceFile, saveSourceFile } from '../src/main/source'

let dir: string
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
})

describe('source 읽기/저장 (M12_2)', () => {
  it('파일을 읽어 content + mtime을 반환한다', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ctv-src-'))
    await writeFile(join(dir, 'A.kt'), 'class A')
    const r = await readSourceFile(dir, 'A.kt')
    expect(r?.content).toBe('class A')
    expect(typeof r?.mtime).toBe('number')
  })

  it('없는 파일은 null', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ctv-src-'))
    expect(await readSourceFile(dir, 'none.kt')).toBeNull()
  })

  it('경로 이탈(../)은 차단', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ctv-src-'))
    expect(await readSourceFile(dir, '../secret')).toBeNull()
    const r = await saveSourceFile(dir, '../evil', 'x', null)
    expect(r.ok).toBe(false)
  })

  it('원자적으로 저장하고 mtime을 반환한다', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ctv-src-'))
    await writeFile(join(dir, 'A.kt'), 'old')
    const res = await saveSourceFile(dir, 'A.kt', 'new content', null)
    expect(res.ok).toBe(true)
    expect(await readFile(join(dir, 'A.kt'), 'utf8')).toBe('new content')
  })

  it('baseMtime이 디스크와 다르면 충돌(conflict)', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ctv-src-'))
    await writeFile(join(dir, 'A.kt'), 'v1')
    const st = await stat(join(dir, 'A.kt'))
    const stale = Math.round(st.mtimeMs) - 1000 // 과거 mtime
    const res = await saveSourceFile(dir, 'A.kt', 'v2', stale)
    expect(res).toEqual({ ok: false, conflict: true })
    expect(await readFile(join(dir, 'A.kt'), 'utf8')).toBe('v1') // 덮어쓰지 않음
  })

  it('올바른 baseMtime이면 저장된다', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ctv-src-'))
    await writeFile(join(dir, 'A.kt'), 'v1')
    const read = await readSourceFile(dir, 'A.kt')
    const res = await saveSourceFile(dir, 'A.kt', 'v2', read?.mtime ?? null)
    expect(res.ok).toBe(true)
    expect(await readFile(join(dir, 'A.kt'), 'utf8')).toBe('v2')
  })
})
