import { readFile } from 'node:fs/promises'
import { setImmediate } from 'node:timers/promises'
import { scanProject, type ScanOptions, type ScanResult } from './scanner'
import type { SourceParser } from './parser'
import { extractFileInfo, type FileInfo } from './extract'
import { buildFileGraph } from './dependency-graph'
import { AnalysisCache, ANALYZER_VERSION, fileFingerprint } from './cache'
import type { AnalysisProgress, AnalysisSummary, SourceLanguage } from '../../shared/analysis'
import type { CodeGraph } from '../../shared/graph'

export interface RunAnalysisOptions {
  onProgress?: (progress: AnalysisProgress) => void
  scan?: ScanOptions
  /** 비차단을 위해 N개 파일마다 이벤트 루프에 양보. */
  yieldEvery?: number
}

export interface AnalysisRunResult {
  summary: AnalysisSummary
  graph: CodeGraph
}

export interface AnalyzeResult extends AnalysisRunResult {
  fromCache: boolean
}

/**
 * 스캔 결과를 파싱·추출해 의존성 그래프와 요약을 만든다(비차단 양보 + 진행률). (02 §3, §4, §8)
 */
async function analyzeScanned(
  scanResult: ScanResult,
  parser: SourceParser,
  options: RunAnalysisOptions
): Promise<AnalysisRunResult> {
  const { onProgress, yieldEvery = 25 } = options
  const files = scanResult.files
  const total = files.length

  const byLanguage: Record<SourceLanguage, number> = { java: 0, kotlin: 0 }
  const failures: AnalysisSummary['failures'] = []
  const infos: FileInfo[] = []
  let parsedCount = 0

  onProgress?.({ phase: 'parsing', processed: 0, total })

  for (let i = 0; i < files.length; i += 1) {
    const file = files[i]
    try {
      const code = await readFile(file.absolutePath, 'utf8')
      const tree = parser.parse(file.language, code)
      try {
        infos.push(extractFileInfo(tree, file))
      } catch {
        // 추출 실패해도 파일 노드는 유지(import/함수만 비움).
        infos.push({ file, packageName: null, topLevelNames: [], imports: [], functions: [] })
      }
      parsedCount += 1
      byLanguage[file.language] += 1
    } catch (error) {
      failures.push({
        relativePath: file.relativePath,
        reason: error instanceof Error ? error.message : String(error)
      })
    }

    if ((i + 1) % yieldEvery === 0) {
      onProgress?.({ phase: 'parsing', processed: i + 1, total })
      await setImmediate()
    }
  }

  const graph = buildFileGraph(files, infos)

  onProgress?.({ phase: 'parsing', processed: total, total })
  onProgress?.({ phase: 'done', processed: total, total })

  const summary: AnalysisSummary = {
    root: scanResult.root,
    fileCount: total,
    parsedCount,
    failureCount: failures.length,
    byLanguage,
    skippedDirCount: scanResult.skippedDirs.length,
    nodeCount: graph.nodes.length,
    functionNodeCount: graph.nodes.filter((n) => n.kind === 'function').length,
    externalNodeCount: graph.nodes.filter((n) => n.external).length,
    edgeCount: graph.edges.length,
    failures
  }
  return { summary, graph }
}

/**
 * 프로젝트를 분석한다(캐시 미사용): 스캔(M3_1) → 파싱(M3_2) → 추출/그래프(M4) → 요약.
 */
export async function runAnalysis(
  projectPath: string,
  parser: SourceParser,
  options: RunAnalysisOptions = {}
): Promise<AnalysisRunResult> {
  options.onProgress?.({ phase: 'scanning', processed: 0, total: 0 })
  const scanResult = await scanProject(projectPath, options.scan)
  return analyzeScanned(scanResult, parser, options)
}

/**
 * 캐시 인지형 분석. 파일 지문+분석기 버전이 일치하면 캐시를 재사용한다. (02 §7.2)
 */
export async function analyzeProject(
  projectPath: string,
  parser: SourceParser,
  cache: AnalysisCache,
  options: RunAnalysisOptions = {}
): Promise<AnalyzeResult> {
  options.onProgress?.({ phase: 'scanning', processed: 0, total: 0 })
  const scanResult = await scanProject(projectPath, options.scan)
  const fingerprint = await fileFingerprint(scanResult.files)

  const cached = await cache.get(projectPath)
  if (cached && cached.version === ANALYZER_VERSION && cached.fingerprint === fingerprint) {
    const total = scanResult.files.length
    options.onProgress?.({ phase: 'done', processed: total, total })
    return { summary: cached.summary, graph: cached.graph, fromCache: true }
  }

  const { summary, graph } = await analyzeScanned(scanResult, parser, options)
  await cache.set(projectPath, {
    root: projectPath,
    version: ANALYZER_VERSION,
    fingerprint,
    summary,
    graph
  })
  return { summary, graph, fromCache: false }
}
