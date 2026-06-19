/**
 * 분석 관련 직렬화 가능 타입(IPC 경계를 넘나든다). main/renderer 공용.
 * 트리 등 비직렬화 객체는 여기에 두지 않는다.
 */

import type { CodeGraph } from './graph'

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
  /** 그래프 노드 수(파일 + 함수 + 외부 노드). (02 §4) */
  nodeCount: number
  /** 함수/메서드 정의 노드 수(검색·라벨용). (02 §4.1, D7) */
  functionNodeCount: number
  /** 외부/미해결 노드 수. (02 §9) */
  externalNodeCount: number
  /** 구분된 영역(Domain) 수(파일 노드 기준). (02 §5) */
  domainCount: number
  /** 그래프 엣지 수(파일 의존성 등). (02 §4) */
  edgeCount: number
  failures: AnalysisFailure[]
}

/** 분석 결과(IPC로 렌더러에 전달). 요약 + 그래프 본체. */
export interface AnalysisResult {
  summary: AnalysisSummary
  graph: CodeGraph
}
