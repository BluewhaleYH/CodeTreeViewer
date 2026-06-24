# HANDOFF — CodeTreeViewer 인수인계

> 세션 간 복기용 메모. 세션 시작 시 이 문서 → `docs/TODO.md` → `docs/TODO_EXTRA.md` 순으로 읽는다. (CLAUDE.md §5)
> 최종 갱신: 2026-06-22 (v0.2.0 이후 **TODO_EXTRA 기술부채 일괄 하드닝** 완료).

---

## 1. 한 줄 요약

Android 플랫폼/프레임워크 개발자용 **코드 관계 시각화 + 로그 역추적 + 인앱 편집** 네이티브 데스크톱 앱(Electron + TS).
**기획된 MVP·2차·추후 전 범위 구현 완료** + **기술부채(TODO_EXTRA) 하드닝 완료.** `docs/TODO.md` 0개, `docs/TODO_EXTRA.md` 27건 해소·5건 🚧보류. 현재 **사용자 배포 → 니즈 파악** 단계.

---

## 2. 현재 상태

- **버전/릴리스**: `v0.1.0` → `v0.2.0` GitHub Releases 배포. (하드닝 작업은 아직 미릴리스 — 다음 릴리스 시 v0.3.0 권장)
- **테스트**: 단위/통합 **237개**(Vitest) + **E2E 2개**(Playwright Electron) 통과. 모든 PR이 CI(Linux/Windows/E2E) 그린 후 squash 머지.
- **브랜치**: `main` 단일. 기능별 PR로만 작업(main 직접 푸시 금지 — 정책상 차단됨, 체크오프도 PR로).
- **배포물**: AppImage/deb(Linux), nsis 설치본/포터블 zip(Windows). 무서명. electron-updater 자동 업데이트. **앱 아이콘 적용**(`resources/icon.png`).
- **보안**: 프로덕션 CSP 강화(`script-src 'self'`, eval/inline 제거) — `src/main/security.ts`가 dev/prod 분기 헤더 주입.

### 2.1 TODO_EXTRA 하드닝 (2026-06-22, PR #62~#77)

해소 27건 — 주요:
- **분석/캐시**: 파스 트리 즉시 해제(#66) · 하이브리드 지문+LRU 정리+분석기버전 빌드해시 자동화(#67).
- **번들**: 캡처 시드 동적 분리(prod 제외, #68) · Monaco 슬림 import(청크 30+→7, #69).
- **탭 UX**: 중복 탭 포커스 · 닫은 탭 복원(세션영속, Ctrl+Shift+T) · 깨진 경로 안내(#70).
- **단축키**: 전체 표 확정 + Ctrl+F/Ctrl+1~9/Ctrl+Shift+G(#71).
- **로그**: wrap 토글 복원(가변 높이 가상 스크롤, #72) · 대용량 디스크 스트리밍(임계값 50MB, #73).
- **설정**: 스캔 제외 규칙 UI 모달(#74).
- **테스트/배포**: Playwright Electron E2E + CI 잡(xvfb, #75) · 앱 아이콘(#76).
- **성능 합격선 확정**: 초기 ≤2000 노드 / 경계에서 팬·줌 ≥30fps(#77, `03 §8`).
- (이전: 보류 표시 #65 · CSP 강화 #62 · CI 아티팩트 정리 #63 · CSP 체크오프 #64)

🚧 **보류 5건**(현재 해결 불가/결정 수용 — `docs/TODO_EXTRA.md`에 사유 명시):
tree-sitter-kotlin 오탐 · web-tree-sitter 0.20.x 고정(둘 다 최신 Kotlin 문법 wasm 자체 빌드 필요) · 분석 워커 스레드(D11 수용) · Kotlin 의미구분(현 범위 충분) · `package.json` allowScripts(현 환경 설치 의존).

---

## 3. 구현 완료 범위 (마일스톤)

### MVP (M0~M9) — `v0.1.0`
- **M0** 스캐폴딩(electron-vite, typecheck/lint/format, Vitest, 캡처 절차).
- **M1** 앱 셸(창, 단일 인스턴스, 메뉴).
- **M2** 프로젝트 선택 / 다중 탭(탭별 독립 상태).
- **M3** 코드 분석 기반(재귀 스캔, tree-sitter 파싱, 비차단 실행, 캐시).
- **M4** 관계/심볼/영역(파일 의존성 엣지, 외부 노드 분리, 함수 정의 추출, 영역 분류).
- **M5** 시각화 렌더(Cytoscape.js, 관계도/트리, 초기 뷰, 점진 확장).
- **M6** 인터랙션/색상(전환, 1-홉 클릭, 하이라이트, 영역 색·범례, 정보 패널).
- **M7** 검색(이름 인덱스, 부분/퍼지, 포커스 동기화, 히스토리).
- **M8** 세션 영속(저장소, 창/탭/뷰 복원, 손상 대비 백업·폴백·비차단 알림).
- **M9** 배포 파이프라인(DEPLOY.md, AppImage/deb/nsis/zip, GitHub Actions CI, electron-updater).

### 2차 (M10~M13)
- **M10** 함수 호출 그래프(보수적 호출 해석 → function-call 엣지, 호출처 역추적 온디맨드 포커스 뷰).
- **M11** 로그 덤프 분석(열람, 가상 스크롤, logcat 필터, 로그→코드 매칭+다중 후보, 3-뷰 3중 연동, 로그 검색).
- **M12** 앱 내 코드 편집(Monaco, 저장+원자적 쓰기+외부 변경 mtime 감지, 저장 시 증분 재분석, diff+영향 범위).
- **M13** C/C++ 네이티브 분석(tree-sitter c/cpp, #include 의존성 보수적 해석).

### 추후 (M14)
- **M14** 확장(JNI 경계 정적 이름규칙 매칭, 로그 매칭 신뢰도, 그래프 전/후 비교 모드, 라이트 모드).

---

## 4. 아키텍처 핵심

- **프로세스**: main(Node) / preload(contextBridge IPC) / renderer(Vite, 프레임워크 없음). 보안 기본값(contextIsolation on, sandbox, nodeIntegration off).
- **분석 엔진**(main, `src/main/analysis/`): scanner → parser(web-tree-sitter WASM) → extract(FileInfo) → dependency-graph(buildFileGraph) → runner(요약+그래프+로그사이트). stat 기반 프로젝트 캐시 + 증분 재분석용 인메모리 infos 캐시.
- **렌더러 상태**(`src/renderer/src/tabs/tab-store.ts`): TabStore(subscribe/emit). 탭별 view(mode/selectedNode/backtrace/compare) · analysis(graph/logSites) · log · codeView · impact · snapshot.
- **그래프**(`graph/graph-view.ts`): Cytoscape 생명주기. 모드 분기 = 파일 그래프 / 역추적 / 비교. `currentKey`+`fullGraph` 참조로 재그리기 판단.
- **로그**(`log/`): 가상 스크롤 + wrap(가변 높이) + 필터/매칭/신뢰도/검색. **이중 모드** — 메모리(≤50MB, 동기) / 스트림(>50MB, main `src/main/log-store.ts`가 라인 인덱스+윈도우 읽기+줄 단위 스캔, 렌더러 비동기). 필터/매칭/검색 순수 로직은 `src/shared/`로 이동(main·renderer 공유).
- **편집기**(`editor/editor-view.ts`): Monaco 슬림 import(`editor.api` + java/kotlin contribution). 저장은 `source.ts`(원자적 + mtime 충돌).
- **설정**(`src/main/settings-store.ts` + `settings/settings-view.ts`): `settings.json`(userData). 현재 스캔 제외 디렉터리. 변경 시 재분석(스캔 집합 지문 변화로 캐시 자연 무효화).
- **자체 검수 시드**(`capture-seed.ts`): `isCapture`일 때만 동적 import(prod 번들 제외).
- **순수 로직 분리**: 모든 핵심 로직(해석/필터/매칭/diff/wrap/캐시지문 등)은 DOM/electron 비의존 순수 함수로 빼서 단위 테스트.

---

## 5. 주요 결정 (사용자 합의)

- D14 Cytoscape.js / D12 한국어 UI / D13 Ctrl 수정자(Win·Linux 주 대상) / D3 다크 기본.
- 오탐 방지 원칙: 해석은 보수적(정확/유일 일치만), 모호하면 미연결 + 외부 노드/후보 제시.
- 로그: logcat 우선 파싱 + 텍스트 폴백 / Android Log.\* + Timber·Slog 인식 / 정적+포맷 패턴화 다중후보 / 세션 한정 인덱스.
- 편집: Monaco / 저장 시 자동 증분 재분석 / 저장 시점 mtime 비교 / 영향 범위 배지·색.
- JNI: 정적 이름규칙(Java\_...) → 파일 경계 엣지(동적 RegisterNatives는 미구현).
- 배포: GitHub Releases 호스팅 + electron-updater(기동+6시간), 무서명.
- 하드닝(2026-06-22): 캐시 무효화 하이브리드 지문 + 분석기버전 빌드해시 자동화 / 로그 스트리밍 임계값 50MB / 동일 프로젝트 중복 탭 = 기존 탭 포커스 / 닫은 탭 세션영속 / 단축키 Ctrl+F·1~9·Shift+G 추가 / 렌더 합격선 초기 2000노드·30fps / 보류 5건 합의.

---

## 6. 빌드 / 실행 / 테스트 / 릴리스

- 설치 `npm install` · 개발 `npm run dev` · 검사 `npm run typecheck && npm run lint` · 테스트 `npm test` · **E2E `npm run test:e2e`**(build + Playwright `_electron`; 로컬 macOS는 디스플레이로 직접, CI는 xvfb).
- 빌드 `npm run build`(→ out/) · 패키징 `build:linux`/`build:win`/`build:win:installer`(→ dist/, gitignore).
- **자체 검수 캡처**: `npm run screenshot`(CAPTURE_SCREENSHOT=1) → `screenshots/`(gitignore). 큰 PNG는 `sips -Z`로 줄여서 확인.
- **릴리스 절차**: `npm version <ver> --no-git-tag-version` → `package.json`/lock 커밋 → 태그 `v<ver>` push → **CI(Actions)가 멀티 OS 빌드 + GitHub Releases 퍼블리시(draft)** → `gh release edit v<ver> --draft=false --latest`로 공개.
- CI: `.github/workflows/build.yml` — 잡 3개(Linux 빌드 / Windows 빌드 / **E2E(xvfb)**). PR/푸시는 빌드 검증만(아티팩트 업로드 없음 — 쿼터 절약), 태그(`v*`)는 `--publish always`로 Releases 퍼블리시.

---

## 7. 워크플로 (CLAUDE.md §6 준수)

체크박스 1개 = 작업 1단위: 스펙 읽기 → 브랜치 → 구현 → 자체검수(스크린샷) → `reviews/unprocessed/M<n>_<k>.md` 요청 → 리뷰 결과 `reviews/M<n>_<k>.md` → 반영 → `reviews/processed/`로 이동 → push → PR → CI → squash 머지 → `docs/TODO.md` 체크.
- `reviews/`, `screenshots/`, `dist/` 는 gitignore(로컬 전용). 커밋/PR 말미 Co-Authored-By / Generated-with 라인.

---

## 8. 환경 주의사항 (중요)

- 개발 머신: **macOS**(배포 대상 아님, dev 전용). docker/dpkg/wine 없음 → **최종 패키지(AppImage/deb/nsis)는 CI에서만 생성·검증**. 로컬은 `electron-builder --dir`(언팩)로 설정/wasm 적재만 확인.
- npm이 electron/esbuild install 스크립트 차단 → `npm approve-scripts` 필요(`allowScripts` 유지). 메모리 `electron-install-sandbox` 참조.
- tree-sitter는 web-tree-sitter(WASM), 0.20.x 고정(ABI). 메모리 `tree-sitter-wasm-versions` 참조.
- `gh run watch`가 간헐적으로 조기 종료(rc=1) → status 폴링으로 대기.

---

## 9. 기술부채 / 후속

**`docs/TODO_EXTRA.md`**: 27건 해소(§2.1), 5건 🚧보류만 잔존. 보류 5건은 외부 wasm 툴체인 확보 또는 단계 합의 시 착수.

기능 범위(SPEC) 차원의 남은 항목(TODO_EXTRA 아님):
- C/C++ 함수 추출 미구현(현재 `#include` 파일 의존성만). JNI 동적 등록(RegisterNatives)/중첩 클래스 미지원.
- 라이트 모드 그래프 캔버스 라벨 대비 미세조정 여지(cytoscape 색 상수는 테마 공용).
- 스트림 모드 로그는 wrap 미지원(가변 높이에 라인 길이 전량 필요 — 의도된 제약).
- 실기기 팬/줌 fps 측정(헤드리스로는 GPU 렌더 fps 불가; 합격선 수치는 `03 §8` 확정).

---

## 10. 다음 할 일 (사용자 방향)

- **현재 단계: 사용자 배포 → 니즈 파악.** 실사용 피드백으로 우선순위 재정렬 예정.
- **권장 다음 액션**: 하드닝 결과를 **v0.3.0으로 릴리스**(§6 릴리스 절차) → 실사용자에게 배포.
- 신규 기능은 기존처럼 SPEC(docs/) 갱신 → TODO 항목화 → 단계 합의 후 진행.
- 보류 5건 해제 트리거: 최신 Kotlin 문법 wasm 자체 빌드 환경 마련 시 tree-sitter 2건 동반 업그레이드; 워커 스레드/Kotlin 의미구분은 대규모 성능·2차 호출그래프 고도화와 함께.
- 후보: 실데이터 기반 매칭 신뢰도 튜닝, 실기기 렌더 fps 측정, 멀티 스냅샷 비교, 검색/필터 고도화 등(피드백 반영).
