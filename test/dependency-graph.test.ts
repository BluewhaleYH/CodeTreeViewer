import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SourceParser } from '../src/main/analysis/parser'
import { resolveParserConfig } from '../src/main/analysis/wasm-paths'
import { runAnalysis } from '../src/main/analysis/runner'
import { fileNodeId } from '../src/shared/graph'

let parser: SourceParser
let root: string

beforeAll(async () => {
  parser = await SourceParser.create(resolveParserConfig())
})

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true })
})

async function write(rel: string, content: string): Promise<void> {
  const full = join(root, rel)
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, content)
}

describe('파일 의존성 그래프 (M4_2)', () => {
  it('Java import를 프로젝트 내 파일 엣지로 만든다(부모=import 하는 쪽)', async () => {
    root = await mkdtemp(join(tmpdir(), 'ctv-dep-'))
    await write('com/foo/A.java', 'package com.foo;\nimport com.bar.B;\nclass A { B b; }')
    await write('com/bar/B.java', 'package com.bar;\nclass B {}')

    const { graph } = await runAnalysis(root, parser)
    expect(graph.nodes.map((n) => n.id).sort()).toEqual([
      fileNodeId('com/bar/B.java'),
      fileNodeId('com/foo/A.java')
    ])
    expect(graph.edges).toHaveLength(1)
    expect(graph.edges[0].from).toBe(fileNodeId('com/foo/A.java')) // 부모
    expect(graph.edges[0].to).toBe(fileNodeId('com/bar/B.java')) // 자식
    expect(graph.edges[0].type).toBe('file-dependency')
  })

  it('Kotlin import도 엣지로 만든다', async () => {
    root = await mkdtemp(join(tmpdir(), 'ctv-dep-'))
    await write('a/Main.kt', 'package a\nimport b.Helper\nfun main() {}')
    await write('b/Helper.kt', 'package b\nclass Helper')

    const { graph } = await runAnalysis(root, parser)
    expect(graph.edges).toHaveLength(1)
    expect(graph.edges[0].from).toBe(fileNodeId('a/Main.kt'))
    expect(graph.edges[0].to).toBe(fileNodeId('b/Helper.kt'))
  })

  it('와일드카드 import는 패키지 내 모든 파일로 연결한다', async () => {
    root = await mkdtemp(join(tmpdir(), 'ctv-dep-'))
    await write('app/Main.java', 'package app;\nimport util.*;\nclass Main {}')
    await write('util/X.java', 'package util;\nclass X {}')
    await write('util/Y.java', 'package util;\nclass Y {}')

    const { graph } = await runAnalysis(root, parser)
    const fromMain = graph.edges.filter((e) => e.from === fileNodeId('app/Main.java'))
    expect(fromMain.map((e) => e.to).sort()).toEqual([
      fileNodeId('util/X.java'),
      fileNodeId('util/Y.java')
    ])
  })

  it('미해결 import(외부 라이브러리)는 엣지를 만들지 않는다(외부 노드는 M4_3)', async () => {
    root = await mkdtemp(join(tmpdir(), 'ctv-dep-'))
    await write('a/A.java', 'package a;\nimport java.util.List;\nclass A {}')

    const { graph } = await runAnalysis(root, parser)
    expect(graph.nodes).toHaveLength(1)
    expect(graph.edges).toHaveLength(0)
  })

  it('요약에 노드/엣지 수가 담긴다', async () => {
    root = await mkdtemp(join(tmpdir(), 'ctv-dep-'))
    await write('a/A.java', 'package a;\nimport b.B;\nclass A {}')
    await write('b/B.java', 'package b;\nclass B {}')

    const { summary } = await runAnalysis(root, parser)
    expect(summary.nodeCount).toBe(2)
    expect(summary.edgeCount).toBe(1)
  })
})
