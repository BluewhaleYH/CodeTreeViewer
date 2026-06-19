import { externalNodeId, fileNodeId, type CodeGraph, type GraphNode } from '../../../shared/graph'
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

export function buildDemoGraph(): CodeGraph {
  const files: GraphNode[] = [
    fileNode('app/src/main/kotlin/MainActivity.kt', 'app', 'kotlin'),
    fileNode('app/src/main/kotlin/LoginViewModel.kt', 'app', 'kotlin'),
    fileNode('core/src/main/kotlin/Repository.kt', 'core', 'kotlin'),
    fileNode('core/src/main/kotlin/ApiClient.kt', 'core', 'kotlin'),
    fileNode('core/src/main/kotlin/Models.kt', 'core', 'kotlin'),
    fileNode('util/src/main/java/Logger.java', 'util', 'java'),
    fileNode('util/src/main/java/Strings.java', 'util', 'java')
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
    return { id: `file-dependency:${from}->${toId}`, type: 'file-dependency', from, to: toId, line: null }
  }

  const edges = [
    dep('app/src/main/kotlin/MainActivity.kt', fileNodeId('app/src/main/kotlin/LoginViewModel.kt')),
    dep('app/src/main/kotlin/MainActivity.kt', fileNodeId('util/src/main/java/Strings.java')),
    dep('app/src/main/kotlin/LoginViewModel.kt', fileNodeId('core/src/main/kotlin/Repository.kt')),
    dep('app/src/main/kotlin/LoginViewModel.kt', fileNodeId('util/src/main/java/Logger.java')),
    dep('core/src/main/kotlin/Repository.kt', fileNodeId('core/src/main/kotlin/ApiClient.kt')),
    dep('core/src/main/kotlin/Repository.kt', fileNodeId('core/src/main/kotlin/Models.kt')),
    dep('core/src/main/kotlin/ApiClient.kt', externalNodeId('retrofit2.Retrofit'))
  ]

  return { nodes: [...files, ext], edges }
}

export const DEMO_SUMMARY: AnalysisSummary = {
  root: '/home/dev/AndroidProject',
  fileCount: 7,
  parsedCount: 7,
  failureCount: 0,
  byLanguage: { java: 2, kotlin: 5 },
  skippedDirCount: 0,
  nodeCount: 8,
  functionNodeCount: 0,
  externalNodeCount: 1,
  domainCount: 3,
  edgeCount: 7,
  failures: []
}
