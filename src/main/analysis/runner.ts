import { readFile } from 'node:fs/promises'
import { setImmediate } from 'node:timers/promises'
import { scanProject, type ScanOptions } from './scanner'
import type { SourceParser } from './parser'
import type { AnalysisProgress, AnalysisSummary, SourceLanguage } from '../../shared/analysis'

export interface RunAnalysisOptions {
  onProgress?: (progress: AnalysisProgress) => void
  scan?: ScanOptions
  /** 비차단을 위해 N개 파일마다 이벤트 루프에 양보. */
  yieldEvery?: number
}

/**
 * 프로젝트를 분석한다: 스캔(M3_1) → 파싱(M3_2) → 요약. (02 §3, §8)
 * 진행률을 onProgress로 보고하고, yieldEvery마다 이벤트 루프에 양보해 비차단으로 동작한다. (추가-6)
 * 노드/엣지 추출은 M4에서 이 파이프라인에 추가한다(현재는 파싱 가능 여부/요약만).
 *
 * 설계 메모: MVP는 메인 프로세스에서 협력적 양보로 비차단을 달성한다.
 * 진짜 워커 스레드 분리는 추후 최적화(대규모 프로젝트)로 남긴다.
 */
export async function runAnalysis(
  projectPath: string,
  parser: SourceParser,
  options: RunAnalysisOptions = {}
): Promise<AnalysisSummary> {
  const { onProgress, scan, yieldEvery = 25 } = options

  onProgress?.({ phase: 'scanning', processed: 0, total: 0 })
  const scanResult = await scanProject(projectPath, scan)
  const total = scanResult.files.length

  const byLanguage: Record<SourceLanguage, number> = { java: 0, kotlin: 0 }
  const failures: AnalysisSummary['failures'] = []
  let parsedCount = 0

  onProgress?.({ phase: 'parsing', processed: 0, total })

  for (let i = 0; i < scanResult.files.length; i += 1) {
    const file = scanResult.files[i]
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
