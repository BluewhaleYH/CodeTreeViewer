/**
 * 분석 관련 직렬화 가능 타입(IPC 경계를 넘나든다). main/renderer 공용.
 * 트리 등 비직렬화 객체는 여기에 두지 않는다.
 */

import type { CodeGraph } from './graph'
import type { LogSite } from './log'

export type SourceLanguage = 'java' | 'kotlin' | 'c' | 'cpp'

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
  /** 언어별 파일 수(존재하는 언어만). */
  byLanguage: Partial<Record<SourceLanguage, number>>
  skippedDirCount: number
  /** 그래프 노드 수(파일 + 함수 + 외부 노드). (02 §4) */
  nodeCount: number
  /** 함수/메서드 정의 노드 수(검색·라벨용). (02 §4.1, D7) */
  functionNodeCount: number
  /** 외부/미해결 노드 수. (02 §9) */
  externalNodeCount: number
  /** 구분된 영역(Domain) 수(파일 노드 기준). (02 §5) */
  domainCount: number
  /** 파일 의존성(file-dependency) 엣지 수. (02 §4) */
  edgeCount: number
  /** 함수 호출(function-call) 엣지 수. (02 §6, M10_1) */
  callEdgeCount: number
  /** JNI 경계(jni-boundary) 엣지 수. (M14_1) */
  jniEdgeCount?: number
  failures: AnalysisFailure[]
}

/** 분석 결과(IPC로 렌더러에 전달). 요약 + 그래프 + 로그 호출 위치. */
export interface AnalysisResult {
  summary: AnalysisSummary
  graph: CodeGraph
  /** 로그→코드 역추적용 소스 로그 호출 위치. (04 §5, M11_4) */
  logSites: LogSite[]
}
