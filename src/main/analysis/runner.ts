import { readFile } from 'node:fs/promises'
import { setImmediate } from 'node:timers/promises'
import { scanProject, type ScanOptions, type ScanResult, type ScannedFile } from './scanner'
import type { SourceParser } from './parser'
import { extractFileInfo, type FileInfo } from './extract'
import { buildFileGraph } from './dependency-graph'
import type { DomainRule } from './domain'
import { AnalysisCache, ANALYZER_VERSION, fileFingerprint } from './cache'
import type { AnalysisProgress, AnalysisSummary, SourceLanguage } from '../../shared/analysis'
import type { CodeGraph } from '../../shared/graph'
import type { LogSite } from '../../shared/log'

export interface RunAnalysisOptions {
  onProgress?: (progress: AnalysisProgress) => void
  scan?: ScanOptions
  /** 비차단을 위해 N개 파일마다 이벤트 루프에 양보. */
  yieldEvery?: number
  /** 영역(Domain) 사용자 매핑 규칙. 미지정 시 범용 기본 프리셋. (D10) */
  domainRules?: DomainRule[]
}

export interface AnalysisRunResult {
  summary: AnalysisSummary
  graph: CodeGraph
  logSites: LogSite[]
}

/** 증분 재분석에 필요한 파싱 산출물까지 포함한 전체 결과(메인 내부 보관용, IPC 비전달). (M12_3) */
export interface FullRunResult extends AnalysisRunResult {
  infos: FileInfo[]
  files: ScannedFile[]
}

/** 그래프에서 파생되는 요약 필드(증분 재분석 시 재계산 대상). */
function graphSummaryFields(
  graph: CodeGraph,
  domains: Set<string>
): Pick<
  AnalysisSummary,
  | 'nodeCount'
  | 'functionNodeCount'
  | 'externalNodeCount'
  | 'domainCount'
  | 'edgeCount'
  | 'callEdgeCount'
  | 'jniEdgeCount'
> {
  return {
    nodeCount: graph.nodes.length,
    functionNodeCount: graph.nodes.filter((n) => n.kind === 'function').length,
    externalNodeCount: graph.nodes.filter((n) => n.external).length,
    domainCount: domains.size,
    edgeCount: graph.edges.filter((e) => e.type === 'file-dependency').length,
    callEdgeCount: graph.edges.filter((e) => e.type === 'function-call').length,
    jniEdgeCount: graph.edges.filter((e) => e.type === 'jni-boundary').length
  }
}

function domainsOf(graph: CodeGraph): Set<string> {
  const domains = new Set<string>()
  for (const node of graph.nodes) {
    if (node.kind === 'file' && node.domain) domains.add(node.domain)
  }
  return domains
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
): Promise<FullRunResult> {
  const { onProgress, yieldEvery = 25 } = options
  const files = scanResult.files
  const total = files.length

  const byLanguage: Partial<Record<SourceLanguage, number>> = {}
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
        // 추출 실패해도 파일 노드는 유지(import/함수/로그만 비움).
        infos.push({
          file,
          packageName: null,
          topLevelNames: [],
          imports: [],
          functions: [],
          logSites: [],
          nativeMethods: [],
          jniFunctions: []
        })
      }
      parsedCount += 1
      byLanguage[file.language] = (byLanguage[file.language] ?? 0) + 1
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

  const graph = buildFileGraph(files, infos, options.domainRules)

  onProgress?.({ phase: 'parsing', processed: total, total })
  onProgress?.({ phase: 'done', processed: total, total })

  const summary: AnalysisSummary = {
    root: scanResult.root,
    fileCount: total,
    parsedCount,
    failureCount: failures.length,
    byLanguage,
    skippedDirCount: scanResult.skippedDirs.length,
    ...graphSummaryFields(graph, domainsOf(graph)),
    failures
  }
  const logSites = infos.flatMap((i) => i.logSites)
  return { summary, graph, logSites, infos, files }
}

/**
 * 단일 파일만 다시 파싱해 그래프/요약/로그사이트를 갱신한다(증분 재분석). (06 §4, M12_3)
 * 이전 분석의 FileInfo[]를 재사용하고 변경 파일만 교체 → 미변경 파일은 다시 파싱하지 않는다.
 */
export async function reanalyzeFile(
  file: ScannedFile,
  parser: SourceParser,
  prev: { files: ScannedFile[]; infos: FileInfo[]; summary: AnalysisSummary },
  domainRules: DomainRule[] = []
): Promise<FullRunResult> {
  let newInfo: FileInfo
  try {
    const code = await readFile(file.absolutePath, 'utf8')
    const tree = parser.parse(file.language, code)
    newInfo = extractFileInfo(tree, file)
  } catch {
    newInfo = {
      file,
      packageName: null,
      topLevelNames: [],
      imports: [],
      functions: [],
      logSites: [],
      nativeMethods: [],
      jniFunctions: []
    }
  }

  const infos = prev.infos.map((i) => (i.file.relativePath === file.relativePath ? newInfo : i))
  const graph = buildFileGraph(prev.files, infos, domainRules)
  const logSites = infos.flatMap((i) => i.logSites)
  const summary: AnalysisSummary = {
    ...prev.summary,
    ...graphSummaryFields(graph, domainsOf(graph))
  }
  return { summary, graph, logSites, infos, files: prev.files }
}

/**
 * 프로젝트를 분석한다(캐시 미사용): 스캔(M3_1) → 파싱(M3_2) → 추출/그래프(M4) → 요약.
 */
export async function runAnalysis(
  projectPath: string,
  parser: SourceParser,
  options: RunAnalysisOptions = {}
): Promise<FullRunResult> {
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
    return {
      summary: cached.summary,
      graph: cached.graph,
      logSites: cached.logSites ?? [],
      fromCache: true
    }
  }

  const { summary, graph, logSites } = await analyzeScanned(scanResult, parser, options)
  await cache.set(projectPath, {
    root: projectPath,
    version: ANALYZER_VERSION,
    fingerprint,
    summary,
    graph,
    logSites
  })
  return { summary, graph, logSites, fromCache: false }
}
