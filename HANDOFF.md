# HANDOFF — 세션 인수인계 메모

> 세션 시작 시 이 문서를 먼저 읽는다. (CLAUDE.md §5)
> 최종 갱신: 2026-06-19

---

## 1. 현재 상태 한눈에

- **단계**: MVP(1차) 구현 진행 중.
- **완료 마일스톤**: M0(스캐폴딩), M1(앱 셸), **M2(프로젝트 선택/다중 탭)** 까지 main 머지 완료.
- **다음 작업**: **M3 — 코드 분석: 스캔/파싱 기반** (`docs/TODO.md` 최상단 미완료 항목).
- **브랜치**: `main` 최신. 작업 브랜치 없음(M2_4까지 머지·삭제 완료).
- **앱 상태**: Electron 앱이 기동하며 다중 탭 + 폴더 선택 + welcome 화면까지 동작. 아직 실제 코드 분석/시각화는 없음.

## 2. 완료된 작업 (PR 기준)

### M0 — 스캐폴딩/툴체인 (PR #1, 단일 PR로 묶음)
- Electron + TypeScript + electron-vite. `npm run dev`(HMR)/`build` 동작.
- main/preload/renderer 골격 + 보안 기본값(contextIsolation/sandbox/nodeIntegration off, CSP).
- typecheck(node/web 분리)/lint(ESLint9 flat)/format(Prettier)/test(Vitest) + 스코프 테스트.
- `.gitignore`, 스크린샷 캡처 절차(`scripts/SCREENSHOTS.md`).

### M1 — 앱 셸 (PR #2, #3, #4 — 체크박스별)
- M1_1: `src/main/window.ts` 윈도우 모듈, 최소 크기 940×600, 최소화/최대화/종료.
- M1_2: 단일 인스턴스 락 + 두 번째 실행 시 기존 창 포커스(실제 2-인스턴스 실행 검증).
- M1_3: `src/main/menu.ts` 기본 메뉴(프로젝트 열기/새 탭/탭 닫기/종료) → `menu:*` IPC 이벤트 발신.

### M2 — 프로젝트 선택/다중 탭 (PR #5, #6, #7, #8 — 체크박스별)
- M2_1: `src/main/ipc.ts` `dialog:open-project`(폴더 선택) + 순수 `TabStore` + 탭 바/콘텐츠. 빈 탭 재사용/새 탭.
- M2_2: 탭 추가(+)/닫기(×, 인접 폴백)/전환(클릭), 메뉴 new-tab/close-tab 연결.
- M2_3: 빈 상태 welcome 화면(아이콘 + 안내 + `프로젝트 열기` 버튼).
- M2_4: 탭별 독립 상태 컨테이너 — `TabState.view(ViewMode)` 격리, `createTab`/`setViewMode`.

> `docs/TODO.md`의 M0~M2 체크박스 모두 `[x]`.

## 3. 다음 할 일 (M3부터)

`docs/TODO.md` 순서대로 진행. M3 체크박스:
- [ ] 프로젝트 재귀 스캔 + 대상 확장자 수집 + 제외 규칙 (`02` §3, 추가-4)
- [ ] Tree-sitter(java/kotlin) 통합 + 파일 파싱(실패 건너뜀·기록) (`02` §2,§3,§8)
- [ ] 분석 실행 구조(워커/진행률·완료 보고, 비차단) (`02` §8, 추가-6)
- [ ] 분석 캐시(무효화 키) + 재사용 (`02` §7.2)

**M3 착수 전 결정 필요**(SPEC `추가)` 미해결):
- 스캔 제외 규칙 기본값(빌드 산출물/테스트/생성 코드) — `02` 추가-4.
- (M4 착수 전) 안드로이드 영역 프리셋 구체 패턴 — `02` 추가-1.

## 4. 코드 구조 현황

```
src/main/        index.ts(생명주기·단일인스턴스) window.ts menu.ts ipc.ts
src/preload/     index.ts(contextBridge: openProjectDialog/onMenuAction/captureMode)
src/renderer/    index.html  src/main.ts(부트스트랩)  src/global.d.ts
  src/tabs/      tab-store.ts(순수 상태·테스트 대상) tab-bar.ts tab-content.ts
test/            scope.test.ts  tab-store.test.ts(14 케이스)
scripts/         SCREENSHOTS.md
docs/            00~06 SPEC, TODO.md, TEMP_SPEC(SUPERSEDED)
```

- **렌더러 패턴**: 프레임워크 없이 순수 TS + DOM. 상태는 `TabStore`(구독/통지), 뷰는 `render*()` 함수가 innerHTML 클리어 후 재구성. 사용자 데이터는 항상 `textContent`(XSS 안전).
- **IPC**: 메뉴 액션은 main→renderer 이벤트(`menu:*`), 다이얼로그는 renderer→main `invoke`.

## 5. 핵심 결정 사항 (출처: `docs/00_OVERVIEW_SPEC.md §10`)

- D5 부모/자식: **의존하는 쪽=부모**.
- D6 영역 분류: **사용자 매핑 + 안드로이드 프리셋**.
- D7 MVP는 함수 **정의만** 추출(호출 그래프는 2차).
- D8 시각화는 **관계도/트리 형태로만**.

## 6. 작업 워크플로 규약 (이 프로젝트에서 합의된 것)

- **문서 baseline**: 스펙/TODO는 main에 직접 커밋(PR #이전 `177ba48`).
- **M0만 단일 PR**로 묶음. **M1 이후는 체크박스 1개 = 브랜치/PR/머지 1회**.
- **밀어붙이기**: 사용자가 "쭉 진행"이라고 한 마일스톤(M1, M2)은 체크박스마다 멈추지 않고 끝까지 진행. 기본값은 한 단위 끝나면 보고 후 대기(CLAUDE.md §7).
- **PR 머지**: `gh pr merge <n> --squash --delete-branch`. 머지 후 main pull → `docs/TODO.md` 체크박스 `[x]` 커밋.
- **리뷰 파일**: `reviews/unprocessed/M<n>_<k>.md`(요청) → 리뷰 후 `reviews/M<n>_<k>.md`(결과) → `reviews/processed/`로 이동. **reviews/는 gitignore(로컬 전용)**.
- 커밋 메시지 말미: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## 7. 검증 방법

- **자동 테스트**: 순수 로직은 Vitest로 검증(예: `TabStore`). `npm run test`.
- **UI 검수**: `npm run screenshot`(= `CAPTURE_SCREENSHOT=1`)로 창 캡처 → `screenshots/`(gitignore). 헤드리스는 `xvfb-run -a`.
  - capturePage는 **웹 콘텐츠만** 캡처(네이티브 메뉴바/창 프레임은 안 잡힘).
  - capture 모드에서 데모 상태 시드(`window.codetree.captureMode`)로 UI 확인.
- 매 체크박스: `npm run typecheck && npm run lint && npm run test && npm run build` 통과 확인.

## 8. 환경 주의사항 (중요)

- 이 환경의 npm은 `electron`·`esbuild`의 install 스크립트를 차단함 → `npm approve-scripts <pkg>` 필요(package.json에 `allowScripts` 필드 추가됨, 유지).
- 그래도 `electron-vite dev`가 `Error: Electron uninstall`로 죽으면 캐시 zip 수동 추출:
  ```
  rm -rf node_modules/electron/dist && mkdir -p node_modules/electron/dist
  unzip -q -o ~/Library/Caches/electron/electron-v<ver>-darwin-arm64.zip -d node_modules/electron/dist
  printf 'Electron.app/Contents/MacOS/Electron' > node_modules/electron/path.txt
  ```
- (메모리에도 기록됨: `electron-install-sandbox`)

## 9. 팔로업 / 미해결 (이후 단계에서 처리)

- 렌더러 CSP가 dev HMR용으로 완화됨 → 프로덕션 강화 필요(보안/배포 단계).
- electron-builder 아이콘/deb maintainer 등 패키징 세부 → **M9**.
- 뷰 모드(`view.mode`) 토글 UI → M5/M6. 세션 저장/복원(창/탭/파일/뷰) → **M8**.
- SPEC `추가)` 미해결: 렌더링 라이브러리 선택(`03`), 성능 합격선·초기 뷰·홉 수(`03`), 영역 프리셋 패턴(`02`).
