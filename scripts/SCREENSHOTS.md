# UI 검수용 스크린샷 캡처 절차

CLAUDE.md §6.4의 자체 검수(스크린샷) 단계를 자동화하기 위한 안내다.
스크린샷은 **로컬 `screenshots/` 폴더에만** 저장되며 git에는 올리지 않는다(`.gitignore` 대상).

## 동작 방식

`CAPTURE_SCREENSHOT=1`이 설정되면 메인 프로세스가 창이 준비된 직후
`webContents.capturePage()`로 화면을 캡처해 `screenshots/capture-<platform>.png`로 저장하고 앱을 종료한다.
(구현: `src/main/index.ts`)

## 실행

### 데스크톱(디스플레이 있음) — macOS / Windows / Linux

```bash
npm run screenshot
```

### 헤드리스(디스플레이 없음) — Linux CI 등

가상 디스플레이(`xvfb`)에서 실행한다.

```bash
xvfb-run -a npm run screenshot
```

결과: `screenshots/capture-<platform>.png`
