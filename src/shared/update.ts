/** 자동 업데이트 관련 비차단 알림. (DEPLOY.md §4) */
export interface UpdateNotice {
  /** 새 버전 다운로드 완료(재시작 시 적용). */
  kind: 'downloaded'
}
