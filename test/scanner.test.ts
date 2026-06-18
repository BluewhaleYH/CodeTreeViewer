import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanProject, DEFAULT_EXCLUDED_DIRS } from '../src/main/analysis/scanner'

let root: string

async function write(rel: string, content = ''): Promise<void> {
  const full = join(root, rel)
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, content)
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ctv-scan-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('scanProject — 재귀 스캔/확장자/제외 (M3_1)', () => {
  it('.java/.kt를 수집하고 언어를 식별한다', async () => {
    await write('app/src/main/java/com/Foo.java')
    await write('app/src/main/kotlin/com/Bar.kt')

    const result = await scanProject(root)
    const rels = result.files.map((f) => f.relativePath)

    expect(rels).toEqual(['app/src/main/java/com/Foo.java', 'app/src/main/kotlin/com/Bar.kt'])
    expect(result.files.find((f) => f.relativePath.endsWith('Foo.java'))?.language).toBe('java')
    expect(result.files.find((f) => f.relativePath.endsWith('Bar.kt'))?.language).toBe('kotlin')
  })

  it('대상이 아닌 확장자(.kts/.md/.xml)는 제외한다', async () => {
    await write('Keep.java')
    await write('build.gradle.kts')
    await write('README.md')
    await write('AndroidManifest.xml')

    const result = await scanProject(root)
    expect(result.files.map((f) => f.relativePath)).toEqual(['Keep.java'])
  })

  it('빌드/VCS/IDE/의존성 디렉터리를 제외한다', async () => {
    await write('src/Keep.java')
    await write('build/generated/Gen.java')
    await write('.git/hooks/Hook.java')
    await write('.gradle/Cache.kt')
    await write('node_modules/dep/Dep.java')

    const result = await scanProject(root)
    expect(result.files.map((f) => f.relativePath)).toEqual(['src/Keep.java'])
  })

  it('테스트 소스는 기본 포함한다(사용자 결정)', async () => {
    await write('app/src/main/java/Main.java')
    await write('app/src/test/java/MainTest.java')
    await write('app/src/androidTest/java/MainAndroidTest.java')

    const result = await scanProject(root)
    expect(result.files.map((f) => f.relativePath)).toContain('app/src/test/java/MainTest.java')
    expect(result.files.map((f) => f.relativePath)).toContain(
      'app/src/androidTest/java/MainAndroidTest.java'
    )
  })

  it('excludeDirs 옵션으로 제외 디렉터리를 바꿀 수 있다', async () => {
    await write('src/Keep.java')
    await write('build/Out.java')

    const result = await scanProject(root, { excludeDirs: [] })
    // build를 제외하지 않으면 둘 다 포함
    expect(result.files.map((f) => f.relativePath)).toEqual(['build/Out.java', 'src/Keep.java'])
  })

  it('심볼릭 링크는 따라가지 않는다(루프 방지)', async () => {
    await write('src/Real.java')
    await symlink(join(root, 'src'), join(root, 'link'))

    const result = await scanProject(root)
    expect(result.files.map((f) => f.relativePath)).toEqual(['src/Real.java'])
  })

  it('기본 제외 목록에 핵심 디렉터리가 포함되어 있다', () => {
    expect(DEFAULT_EXCLUDED_DIRS).toContain('build')
    expect(DEFAULT_EXCLUDED_DIRS).toContain('.git')
    expect(DEFAULT_EXCLUDED_DIRS).toContain('node_modules')
  })
})
