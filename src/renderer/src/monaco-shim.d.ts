// Monaco 슬림 import의 타입 해석 보강. (TODO_EXTRA C)
// editor.api는 전체 'monaco-editor' 타입의 부분집합(동일 API 표면) → 타입은 메인에서 재노출.
// (메인 타입 로드로 Window.MonacoEnvironment 전역 선언도 함께 적용됨)
declare module 'monaco-editor/esm/vs/editor/editor.api' {
  export * from 'monaco-editor'
}
// 문법 contribution은 사이드이펙트 전용(언어 등록) → 타입 없음.
declare module 'monaco-editor/esm/vs/basic-languages/java/java.contribution'
declare module 'monaco-editor/esm/vs/basic-languages/kotlin/kotlin.contribution'
