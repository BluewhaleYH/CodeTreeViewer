import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SourceParser } from '../src/main/analysis/parser'
import { resolveParserConfig } from '../src/main/analysis/wasm-paths'
import { runAnalysis, reanalyzeFile } from '../src/main/analysis/runner'
import { fileNodeId, functionNodeId } from '../src/shared/graph'

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

  it('미해결 import(외부 라이브러리)는 external 노드 + 엣지로 분리한다 (M4_3)', async () => {
    root = await mkdtemp(join(tmpdir(), 'ctv-dep-'))
    await write('a/A.java', 'package a;\nimport java.util.List;\nclass A {}')

    const { graph, summary } = await runAnalysis(root, parser)
    const ext = graph.nodes.find((n) => n.external)
    expect(ext?.name).toBe('java.util.List')
    expect(summary.externalNodeCount).toBe(1)
    expect(graph.edges).toHaveLength(1)
    expect(graph.edges[0].from).toBe(fileNodeId('a/A.java'))
    expect(graph.edges[0].to).toBe(ext?.id)
  })

  it('같은 외부 타입을 여러 파일이 import하면 external 노드는 1개로 합쳐진다', async () => {
    root = await mkdtemp(join(tmpdir(), 'ctv-dep-'))
    await write('a/A.java', 'package a;\nimport ext.Lib;\nclass A {}')
    await write('a/B.java', 'package a;\nimport ext.Lib;\nclass B {}')

    const { graph } = await runAnalysis(root, parser)
    expect(graph.nodes.filter((n) => n.external)).toHaveLength(1)
    expect(graph.edges.filter((e) => e.to.startsWith('external:'))).toHaveLength(2)
  })

  it('Kotlin은 파일명이 아닌 선언명으로만 해석한다(오탐 방지)', async () => {
    root = await mkdtemp(join(tmpdir(), 'ctv-dep-'))
    // Box.kt는 class Container를 선언(파일명≠클래스명).
    await write('b/Box.kt', 'package b\nclass Container')
    await write('a/ByName.kt', 'package a\nimport b.Container\nclass ByName')
    await write('a/ByFile.kt', 'package a\nimport b.Box\nclass ByFile')

    const { graph } = await runAnalysis(root, parser)
    // b.Container는 내부 해석(Box.kt), b.Box는 외부(파일명 인덱스 미사용).
    const internalEdge = graph.edges.find((e) => e.to === fileNodeId('b/Box.kt'))
    expect(internalEdge?.from).toBe(fileNodeId('a/ByName.kt'))
    expect(graph.nodes.find((n) => n.external)?.name).toBe('b.Box')
  })

  it('요약에 노드/엣지/외부 수가 담긴다', async () => {
    root = await mkdtemp(join(tmpdir(), 'ctv-dep-'))
    await write('a/A.java', 'package a;\nimport b.B;\nimport ext.X;\nclass A {}')
    await write('b/B.java', 'package b;\nclass B {}')

    const { summary } = await runAnalysis(root, parser)
    expect(summary.nodeCount).toBe(3) // A, B, external X
    expect(summary.externalNodeCount).toBe(1)
    expect(summary.edgeCount).toBe(2)
  })
})

describe('함수/메서드 정의 노드 (M4_4)', () => {
  it('Java 메서드를 function 노드로 추출한다(호출 엣지 없음)', async () => {
    root = await mkdtemp(join(tmpdir(), 'ctv-fn-'))
    await write(
      'a/A.java',
      'package a;\nclass A {\n  void foo() {}\n  int bar(int x) { return x; }\n}'
    )

    const { graph, summary } = await runAnalysis(root, parser)
    const fns = graph.nodes.filter((n) => n.kind === 'function')
    expect(fns.map((n) => n.name).sort()).toEqual(['bar', 'foo'])
    expect(fns.every((n) => n.path === 'a/A.java')).toBe(true)
    expect(summary.functionNodeCount).toBe(2)
    // 정의만: 함수 관련 엣지는 없음
    expect(graph.edges).toHaveLength(0)
  })

  it('Kotlin 함수를 function 노드로 추출한다', async () => {
    root = await mkdtemp(join(tmpdir(), 'ctv-fn-'))
    await write('a/Main.kt', 'package a\nfun top() {}\nclass C {\n  fun member() {}\n}')

    const { summary } = await runAnalysis(root, parser)
    expect(summary.functionNodeCount).toBe(2)
  })

  it('function 노드는 라인 정보를 갖는다', async () => {
    root = await mkdtemp(join(tmpdir(), 'ctv-fn-'))
    await write('a/A.java', 'package a;\nclass A {\n  void foo() {}\n}')

    const { graph } = await runAnalysis(root, parser)
    const fn = graph.nodes.find((n) => n.kind === 'function')
    expect(fn?.line).toBe(3)
  })
})

describe('함수 호출 그래프 (M10_1)', () => {
  it('같은 파일 내 호출을 function-call 엣지로 만든다(부모=호출하는 함수)', async () => {
    root = await mkdtemp(join(tmpdir(), 'ctv-call-'))
    await write(
      'a/A.java',
      'package a;\nclass A {\n  void caller() { callee(); }\n  void callee() {}\n}'
    )

    const { graph, summary } = await runAnalysis(root, parser)
    const call = graph.edges.find((e) => e.type === 'function-call')
    expect(call?.from).toBe(functionNodeId('a/A.java', 'caller'))
    expect(call?.to).toBe(functionNodeId('a/A.java', 'callee'))
    expect(summary.callEdgeCount).toBe(1)
    expect(summary.edgeCount).toBe(0) // 파일 의존성 엣지는 없음
  })

  it('프로젝트 전역에서 이름이 유일하면 다른 파일 함수로 해석한다', async () => {
    root = await mkdtemp(join(tmpdir(), 'ctv-call-'))
    await write('a/A.java', 'package a;\nclass A {\n  void caller() { target(); }\n}')
    await write('b/B.java', 'package b;\nclass B {\n  void target() {}\n}')

    const { graph } = await runAnalysis(root, parser)
    const call = graph.edges.find((e) => e.type === 'function-call')
    expect(call?.from).toBe(functionNodeId('a/A.java', 'caller'))
    expect(call?.to).toBe(functionNodeId('b/B.java', 'target'))
  })

  it('동명이인이 여러 곳이면 모호 → 엣지를 만들지 않는다(오탐 방지)', async () => {
    root = await mkdtemp(join(tmpdir(), 'ctv-call-'))
    await write('a/A.java', 'package a;\nclass A {\n  void caller() { dup(); }\n}')
    await write('b/B.java', 'package b;\nclass B {\n  void dup() {}\n}')
    await write('c/C.java', 'package c;\nclass C {\n  void dup() {}\n}')

    const { summary } = await runAnalysis(root, parser)
    expect(summary.callEdgeCount).toBe(0)
  })

  it('재귀(자기 호출)는 엣지를 만들지 않는다', async () => {
    root = await mkdtemp(join(tmpdir(), 'ctv-call-'))
    await write('a/A.java', 'package a;\nclass A {\n  int f(int n) { return f(n - 1); }\n}')

    const { summary } = await runAnalysis(root, parser)
    expect(summary.callEdgeCount).toBe(0)
  })

  it('미해결 호출(외부/표준 라이브러리)은 엣지를 만들지 않는다', async () => {
    root = await mkdtemp(join(tmpdir(), 'ctv-call-'))
    await write(
      'a/A.java',
      'package a;\nclass A {\n  void run() { System.out.println("x"); helper(); }\n}'
    )

    const { summary } = await runAnalysis(root, parser)
    expect(summary.callEdgeCount).toBe(0) // println·helper 모두 미해결
  })

  it('Kotlin 호출도 해석한다', async () => {
    root = await mkdtemp(join(tmpdir(), 'ctv-call-'))
    await write('a/Main.kt', 'package a\nfun caller() { callee() }\nfun callee() {}')

    const { graph, summary } = await runAnalysis(root, parser)
    expect(summary.callEdgeCount).toBe(1)
    const call = graph.edges.find((e) => e.type === 'function-call')
    expect(call?.from).toBe(functionNodeId('a/Main.kt', 'caller'))
    expect(call?.to).toBe(functionNodeId('a/Main.kt', 'callee'))
  })
})

describe('로그 호출 추출 (M11_4)', () => {
  it('Java Log.x(TAG, "msg")에서 로그 호출 위치를 추출한다', async () => {
    root = await mkdtemp(join(tmpdir(), 'ctv-log-'))
    await write(
      'a/A.java',
      'package a;\nimport android.util.Log;\nclass A {\n  void m() {\n    Log.e("Repo", "load() failed: " + e);\n  }\n}'
    )

    const { logSites } = await runAnalysis(root, parser)
    expect(logSites).toHaveLength(1)
    expect(logSites[0].file).toBe('a/A.java')
    expect(logSites[0].level).toBe('E')
    expect(logSites[0].tag).toBe('Repo')
    expect(new RegExp(logSites[0].pattern).test('load() failed: timeout')).toBe(true)
  })

  it('포맷 지정자(%s)를 가변부로 패턴화한다', async () => {
    root = await mkdtemp(join(tmpdir(), 'ctv-log-'))
    await write(
      'a/A.java',
      'package a;\nimport android.util.Log;\nclass A {\n  void m() { Log.d("T", "user %s logged in"); }\n}'
    )

    const { logSites } = await runAnalysis(root, parser)
    expect(logSites).toHaveLength(1)
    const re = new RegExp(logSites[0].pattern)
    expect(re.test('user alice logged in')).toBe(true)
    expect(re.test('user bob logged in')).toBe(true)
  })

  it('정적 텍스트가 빈약한 로그(메시지가 변수뿐)는 후보로 만들지 않는다', async () => {
    root = await mkdtemp(join(tmpdir(), 'ctv-log-'))
    await write(
      'a/A.java',
      'package a;\nimport android.util.Log;\nclass A {\n  void m() { Log.d("T", msg); }\n}'
    )

    const { logSites } = await runAnalysis(root, parser)
    expect(logSites).toHaveLength(0)
  })

  it('Kotlin Log 호출도 추출한다', async () => {
    root = await mkdtemp(join(tmpdir(), 'ctv-log-'))
    await write(
      'a/Main.kt',
      'package a\nimport android.util.Log\nfun m() {\n  Log.w("Net", "retry failed again")\n}'
    )

    const { logSites } = await runAnalysis(root, parser)
    expect(logSites).toHaveLength(1)
    expect(logSites[0].level).toBe('W')
    expect(new RegExp(logSites[0].pattern).test('retry failed again')).toBe(true)
  })
})

describe('증분 재분석 (M12_3)', () => {
  it('변경 파일만 재파싱해 그래프(엣지)를 갱신한다', async () => {
    root = await mkdtemp(join(tmpdir(), 'ctv-inc-'))
    await write('a/A.java', 'package a;\nclass A {}')
    await write('b/B.java', 'package b;\nclass B {}')

    const full = await runAnalysis(root, parser)
    expect(full.graph.edges).toHaveLength(0) // 아직 import 없음

    // A.java에 import 추가 후 변경 파일만 증분 재분석.
    await write('a/A.java', 'package a;\nimport b.B;\nclass A {}')
    const fileA = full.files.find((f) => f.relativePath === 'a/A.java')
    expect(fileA).toBeTruthy()
    const inc = await reanalyzeFile(fileA!, parser, full)

    const edge = inc.graph.edges.find((e) => e.type === 'file-dependency')
    expect(edge?.from).toBe(fileNodeId('a/A.java'))
    expect(edge?.to).toBe(fileNodeId('b/B.java'))
    expect(inc.summary.edgeCount).toBe(1)
  })

  it('변경되지 않은 다른 파일의 노드/로그사이트는 유지된다', async () => {
    root = await mkdtemp(join(tmpdir(), 'ctv-inc-'))
    await write(
      'a/A.java',
      'package a;\nimport android.util.Log;\nclass A { void m(){ Log.e("T","load() failed: "+e); } }'
    )
    await write('b/B.java', 'package b;\nclass B {}')

    const full = await runAnalysis(root, parser)
    expect(full.logSites).toHaveLength(1)

    // B만 변경 → A의 로그사이트는 그대로.
    await write('b/B.java', 'package b;\nclass B { int x; }')
    const fileB = full.files.find((f) => f.relativePath === 'b/B.java')!
    const inc = await reanalyzeFile(fileB, parser, full)
    expect(inc.logSites).toHaveLength(1)
    expect(inc.logSites[0].file).toBe('a/A.java')
  })
})

describe('영역(Domain) 부여 (M4_5)', () => {
  it('파일/함수 노드에 영역(모듈)을 부여하고 외부는 null', async () => {
    root = await mkdtemp(join(tmpdir(), 'ctv-dom-'))
    await write(
      'app/src/main/java/a/A.java',
      'package a;\nimport ext.Lib;\nclass A {\n  void m() {}\n}'
    )
    await write('core/src/main/java/b/B.java', 'package b;\nclass B {}')

    const { graph, summary } = await runAnalysis(root, parser)
    const fileA = graph.nodes.find(
      (n) => n.path === 'app/src/main/java/a/A.java' && n.kind === 'file'
    )
    expect(fileA?.domain).toBe('app')
    const fnM = graph.nodes.find((n) => n.kind === 'function' && n.name === 'm')
    expect(fnM?.domain).toBe('app') // 소속 파일의 영역
    const ext = graph.nodes.find((n) => n.external)
    expect(ext?.domain).toBeNull()
    expect(summary.domainCount).toBe(2) // app, core
  })
})
