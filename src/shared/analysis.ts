/**
 * 분석 관련 직렬화 가능 타입(IPC 경계를 넘나든다). main/renderer 공용.
 * 트리 등 비직렬화 객체는 여기에 두지 않는다.
 */

export type SourceLanguage = 'java' | 'kotlin'

export interface AnalysisProgress {
  phase: 'scanning' | 'parsing' | 'done'
  processed: number
  total: number
}

export interface AnalysisFailure {
  relativePath: string
  reason: string
}

export interface AnalysisSummary {
  root: string
  fileCount: number
  parsedCount: number
  failureCount: number
  byLanguage: Record<SourceLanguage, number>
  skippedDirCount: number
  failures: AnalysisFailure[]
}
