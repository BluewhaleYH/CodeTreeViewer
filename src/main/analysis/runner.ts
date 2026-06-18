import { readFile } from 'node:fs/promises'
import { setImmediate } from 'node:timers/promises'
import { scanProject, type ScanOptions, type ScanResult } from './scanner'
import type { SourceParser } from './parser'
import { AnalysisCache, ANALYZER_VERSION, fileFingerprint } from './cache'
import type { AnalysisProgress, AnalysisSummary, SourceLanguage } from '../../shared/analysis'

export interface RunAnalysisOptions {
  onProgress?: (progress: AnalysisProgress) => void
  scan?: ScanOptions
  /** 비차단을 위해 N개 파일마다 이벤트 루프에 양보. */
  yieldEvery?: number
}

export interface AnalyzeResult {
  summary: AnalysisSummary
  fromCache: boolean
}

/**
 * 스캔 결과를 파싱해 요약을 만든다(비차단 양보 + 진행률).
 * 노드/엣지 추출은 M4에서 이 단계에 추가한다(현재는 파싱 가능 여부/요약만).
 */
async function analyzeScanned(
  scanResult: ScanResult,
  parser: SourceParser,
  options: RunAnalysisOptions
): Promise<AnalysisSummary> {
  const { onProgress, yieldEvery = 25 } = options
  const files = scanResult.files
  const total = files.length

  const byLanguage: Record<SourceLanguage, number> = { java: 0, kotlin: 0 }
  const failures: AnalysisSummary['failures'] = []
  let parsedCount = 0

  onProgress?.({ phase: 'parsing', processed: 0, total })

  for (let i = 0; i < files.length; i += 1) {
    const file = files[i]
    try {
      const code = await readFile(file.absolutePath, 'utf8')
      parser.parse(file.language, code)
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

  onProgress?.({ phase: 'parsing', processed: total, total })
  onProgress?.({ phase: 'done', processed: total, total })

  return {
    root: scanResult.root,
    fileCount: total,
    parsedCount,
    failureCount: failures.length,
    byLanguage,
    skippedDirCount: scanResult.skippedDirs.length,
    failures
  }
}

/**
 * 프로젝트를 분석한다(캐시 미사용): 스캔(M3_1) → 파싱(M3_2) → 요약. (02 §3, §8)
 * 진행률을 보고하고 yieldEvery마다 이벤트 루프에 양보한다(비차단). (추가-6)
 */
export async function runAnalysis(
  projectPath: string,
  parser: SourceParser,
  options: RunAnalysisOptions = {}
): Promise<AnalysisSummary> {
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
    return { summary: cached.summary, fromCache: true }
  }

  const summary = await analyzeScanned(scanResult, parser, options)
  await cache.set(projectPath, {
    root: projectPath,
    version: ANALYZER_VERSION,
    fingerprint,
    summary
  })
  return { summary, fromCache: false }
}
