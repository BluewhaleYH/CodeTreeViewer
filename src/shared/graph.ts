import type { SourceLanguage } from './analysis'

/**
 * 코드 그래프 모델(노드 + 엣지). 직렬화 가능(IPC 경계를 넘어 03 시각화가 렌더). (02 §4)
 * 방향성: 부모 = 의존하는 쪽, 자식 = 의존되는 쪽. (02 §4.3, 00 §10 D5)
 */

export type NodeKind = 'file' | 'function'

/** MVP: file-dependency. function-call은 2차(M10). (02 §4.2) */
export type EdgeType = 'file-dependency' | 'function-call'

export interface GraphNode {
  id: string
  kind: NodeKind
  /** 표시 이름(파일명 또는 함수명). */
  name: string
  /** 프로젝트 상대 경로(POSIX). 함수 노드는 소속 파일 경로. */
  path: string
  language: SourceLanguage | null
  /** 영역(Domain) 분류. 미분류는 null. (02 §5, M4_5) */
  domain: string | null
  /** 프로젝트 밖/미해결 노드 여부(오탐 방지용 구분). (02 §9) */
  external: boolean
  /** 소스 내 위치(라인, 1-based). 없으면 null. */
  line: number | null
}

export interface GraphEdge {
  id: string
  type: EdgeType
  /** 부모(의존하는 쪽) 노드 id. (02 §4.3) */
  from: string
  /** 자식(의존되는 쪽) 노드 id. */
  to: string
  /** 관계가 선언된 소스 위치(라인). 없으면 null. */
  line: number | null
}

export interface CodeGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/** 노드 id 헬퍼(전역 유일성 보장). */
export function fileNodeId(relativePath: string): string {
  return `file:${relativePath}`
}

export function functionNodeId(relativePath: string, name: string): string {
  return `function:${relativePath}#${name}`
}

/** 프로젝트 밖/미해결 대상 노드 id(예: 외부 라이브러리 심볼). */
export function externalNodeId(name: string): string {
  return `external:${name}`
}
