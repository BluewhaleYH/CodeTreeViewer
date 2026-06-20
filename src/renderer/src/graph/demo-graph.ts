import {
  externalNodeId,
  fileNodeId,
  functionNodeId,
  type CodeGraph,
  type GraphNode
} from '../../../shared/graph'
import type { AnalysisSummary, SourceLanguage } from '../../../shared/analysis'

/** 자체 검수(스크린샷)용 데모 그래프/요약. 실제 분석과 무관. */

function fileNode(path: string, domain: string, language: SourceLanguage): GraphNode {
  return {
    id: fileNodeId(path),
    kind: 'file',
    name: path.split('/').pop() ?? path,
    path,
    language,
    domain,
    external: false,
    line: null
  }
}

function fnNode(path: string, name: string, domain: string, line: number): GraphNode {
  return {
    id: functionNodeId(path, name),
    kind: 'function',
    name,
    path,
    language: 'kotlin',
    domain,
    external: false,
    line
  }
}

export function buildDemoGraph(): CodeGraph {
  const files: GraphNode[] = [
    fileNode('app/src/main/kotlin/MainActivity.kt', 'app', 'kotlin'),
    fileNode('app/src/main/kotlin/LoginViewModel.kt', 'app', 'kotlin'),
    fileNode('core/src/main/kotlin/Repository.kt', 'core', 'kotlin'),
    fileNode('core/src/main/kotlin/ApiClient.kt', 'core', 'kotlin'),
    fileNode('core/src/main/kotlin/Models.kt', 'core', 'kotlin'),
    fileNode('util/src/main/java/Logger.java', 'util', 'java'),
    fileNode('util/src/main/java/Strings.java', 'util', 'java'),
    // C/C++ 네이티브(M13)
    fileNode('native/jni/native-lib.cpp', 'native', 'cpp'),
    fileNode('native/jni/engine.h', 'native', 'cpp'),
    // JNI 경계 데모(M14_1): native 메서드를 가진 Java 브리지
    fileNode('app/src/main/java/NativeBridge.java', 'app', 'java')
  ]
  const ext: GraphNode = {
    id: externalNodeId('retrofit2.Retrofit'),
    kind: 'file',
    name: 'retrofit2.Retrofit',
    path: 'retrofit2.Retrofit',
    language: null,
    domain: null,
    external: true,
    line: null
  }

  const dep = (fromPath: string, toId: string): CodeGraph['edges'][number] => {
    const from = fileNodeId(fromPath)
    return {
      id: `file-dependency:${from}->${toId}`,
      type: 'file-dependency',
      from,
      to: toId,
      line: null
    }
  }

  // 함수 노드 + 호출 엣지(역추적 데모용). (M10_2)
  const vm = 'app/src/main/kotlin/LoginViewModel.kt'
  const repo = 'core/src/main/kotlin/Repository.kt'
  const api = 'core/src/main/kotlin/ApiClient.kt'
  const functions: GraphNode[] = [
    fnNode(vm, 'login', 'app', 12),
    fnNode(vm, 'onRetry', 'app', 24),
    fnNode(repo, 'load', 'core', 8),
    fnNode(repo, 'save', 'core', 20),
    fnNode(api, 'get', 'core', 10)
  ]

  const call = (
    fromPath: string,
    fromFn: string,
    toPath: string,
    toFn: string
  ): CodeGraph['edges'][number] => {
    const from = functionNodeId(fromPath, fromFn)
    const to = functionNodeId(toPath, toFn)
    return { id: `function-call:${from}->${to}`, type: 'function-call', from, to, line: null }
  }

  const edges = [
    dep('app/src/main/kotlin/MainActivity.kt', fileNodeId('app/src/main/kotlin/LoginViewModel.kt')),
    dep('app/src/main/kotlin/MainActivity.kt', fileNodeId('util/src/main/java/Strings.java')),
    dep('app/src/main/kotlin/LoginViewModel.kt', fileNodeId('core/src/main/kotlin/Repository.kt')),
    dep('app/src/main/kotlin/LoginViewModel.kt', fileNodeId('util/src/main/java/Logger.java')),
    dep('core/src/main/kotlin/Repository.kt', fileNodeId('core/src/main/kotlin/ApiClient.kt')),
    dep('core/src/main/kotlin/Repository.kt', fileNodeId('core/src/main/kotlin/Models.kt')),
    dep('core/src/main/kotlin/ApiClient.kt', externalNodeId('retrofit2.Retrofit')),
    // C/C++ include 의존성(M13)
    dep('native/jni/native-lib.cpp', fileNodeId('native/jni/engine.h')),
    // JNI 경계(M14_1): Java native 메서드 → C++ 구현
    {
      id: 'jni-boundary:bridge->lib',
      type: 'jni-boundary' as const,
      from: fileNodeId('app/src/main/java/NativeBridge.java'),
      to: fileNodeId('native/jni/native-lib.cpp'),
      line: null
    },
    // 호출: login·onRetry → load, load → get, save → get
    call(vm, 'login', repo, 'load'),
    call(vm, 'onRetry', repo, 'load'),
    call(repo, 'load', api, 'get'),
    call(repo, 'save', api, 'get')
  ]

  return { nodes: [...files, ext, ...functions], edges }
}

export const DEMO_SUMMARY: AnalysisSummary = {
  root: '/home/dev/AndroidProject',
  fileCount: 10,
  parsedCount: 10,
  failureCount: 0,
  byLanguage: { java: 3, kotlin: 5, cpp: 2 },
  skippedDirCount: 0,
  nodeCount: 16,
  functionNodeCount: 5,
  externalNodeCount: 1,
  domainCount: 4,
  edgeCount: 8,
  jniEdgeCount: 1,
  callEdgeCount: 4,
  failures: []
}
