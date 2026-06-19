# DEPLOY — 빌드 / 패키징 / 자동 업데이트

> 단일 출처(SSOT)는 SPEC. 본 문서는 `01_APP_ENVIRONMENT_SPEC.md §9`(업데이트 요구사항)와 `CLAUDE.md §9`(빌드/실행/패키징)의 **배포·업데이트 상세**를 다룬다.
> 결정: 무서명 자동 배포·자동 업데이트(`00` §10), 업데이트 피드 호스트 = **GitHub Releases**, M9에서 **electron-updater 배선까지** 포함.

## 1. 대상 플랫폼 / 산출물

| 플랫폼 | 타깃 | 비고 |
| ---- | ---- | ---- |
| Linux | **AppImage**, **deb** | 주 배포 형식 AppImage(자동 업데이트 지원), deb는 패키지 설치용 |
| Windows | **nsis 설치본**, **포터블 zip** | nsis가 자동 업데이트 대상. zip은 무설치 실행용 |

- macOS는 **배포 대상이 아니다**(개발 환경 전용, `00` §10 D13). `mac` 타깃은 구성하지 않는다.
- 산출물은 `dist/`에 생성된다(gitignore 대상).

## 2. 빌드 / 패키징 스크립트

| 명령 | 동작 |
| ---- | ---- |
| `npm run build` | 타입체크 + `electron-vite build` → `out/` (프로덕션 번들) |
| `npm run build:linux` | `out/` 빌드 후 `electron-builder --linux AppImage deb` → `dist/` |
| `npm run build:win` | `electron-builder --win zip` (포터블, wine 크로스빌드 가능) |
| `npm run build:win:installer` | `electron-builder --win nsis` (**Windows 네이티브/CI 전용** — nsis는 wine 크로스빌드 불가) |

- 개발 실행(`dev`/`start`/`screenshot`)은 `ELECTRON_DISABLE_SANDBOX=1`로 샌드박스를 끈다(Linux `chrome-sandbox` SUID 회피). **패키징 배포본은 정상 샌드박스로 동작**한다.

## 3. 코드 서명 정책 (무서명)

- MVP는 **무서명 배포**다(`00` §10, `01` §9). 서명/공증 단계를 두지 않는다.
- 영향:
  - **Windows**: SmartScreen 경고("알 수 없는 게시자")가 표시될 수 있다. 설치/실행은 가능. nsis **자동 업데이트는 서명 없이도 동작**한다.
  - **Linux**: AppImage/deb는 서명 요건이 없다. AppImage 실행 권한(`chmod +x`) 안내만 필요.
- 추후 서명 도입 시 본 절과 `electron-builder` 설정(인증서/타임스탬프)을 갱신한다. (미해결: `추가)` 배포-1)

## 4. 자동 업데이트 (electron-updater + GitHub Releases)

### 4.1 구성

- 라이브러리: **electron-updater**(electron-builder 생태계, MIT).
- 피드 provider: **GitHub Releases**(`electron-builder.yml`의 `publish: github`). 릴리즈 자산과 `latest.yml`(win)/`latest-linux.yml`(AppImage)이 업데이트 메타데이터가 된다.
- 대상 타깃: **Windows nsis**, **Linux AppImage**. deb/zip 포터블은 자동 업데이트 비대상(수동 갱신).

### 4.2 동작 흐름 (앱 기동 시)

1. 메인 프로세스가 기동 직후 1회 + 이후 주기적(기본 **6시간**)으로 업데이트를 확인한다.
2. 새 버전이 있으면 백그라운드로 다운로드한다(사용자 작업 비차단).
3. 다운로드 완료 시 **비차단 알림**(`01` §10의 배너와 동일한 인앱 통지)으로 "재시작 시 업데이트 적용"을 안내한다.
4. 사용자가 재시작(또는 종료 후 실행)하면 새 버전으로 교체된다.
   - nsis: `quitAndInstall`로 설치 후 재실행.
   - AppImage: 새 AppImage로 교체 후 재실행.
5. 개발 모드(`ELECTRON_RENDERER_URL` 존재) 및 무피드 환경에서는 업데이트 확인을 **건너뛴다**(에러로 기동 실패하지 않음).

### 4.3 채널 / 주기 / 롤백

- **채널**: 단일 안정 채널(`latest`). 프리릴리즈(`-beta` 등)는 업데이트 대상에서 제외한다.
- **주기**: 기동 시 + 6시간 간격(상수, 추후 설정화 가능).
- **롤백**: 자동 롤백은 없다. 문제가 있는 릴리즈는 **GitHub Releases에서 해당 릴리즈를 내리거나 이전 버전을 최신으로 재게시**하여 대응한다. 사용자는 이전 릴리즈 자산을 직접 받아 다운그레이드할 수 있다.

## 5. tree-sitter wasm 패키징 (asarUnpack)

- 파서는 런타임에 `tree-sitter.wasm` + 문법 wasm(`tree-sitter-java/kotlin.wasm`)을 **파일 경로로 로드**한다(`web-tree-sitter`). asar 내부 경로는 `fs`로 직접 읽을 수 없으므로 **asar에서 풀어야(asarUnpack)** 한다.
- 설정: `electron-builder.yml`에 wasm 자산을 `extraResources` 또는 `asarUnpack`으로 포함하고, 런타임에서 `app.isPackaged`에 따라 `process.resourcesPath` 기준 경로를 해석한다(`wasm-paths.ts` 확장).
- 버전 고정(`web-tree-sitter@0.20.x` + `tree-sitter-wasms@0.1.x`)은 ABI 호환 때문이며 패키징에서도 유지한다.

## 6. 릴리즈 절차

1. `package.json`의 `version`을 올린다(SemVer). 태그 `v<version>`을 만든다.
2. 빌드/퍼블리시:
   - 로컬: `GH_TOKEN=<토큰> npm run build:linux`/`build:win:installer` 후 `electron-builder ... --publish always`로 GitHub Releases에 업로드.
   - 또는 CI(추후): 태그 push 시 Linux/Windows 러너에서 빌드·퍼블리시(`추가)` 배포-2).
3. 릴리즈에 AppImage/deb/nsis/zip + `latest*.yml` 자산이 포함됐는지 확인한다.
4. 기존 설치본이 기동 시 새 버전을 감지·다운로드하는지 확인한다.

> nsis는 wine 크로스빌드가 불가하므로 Windows 설치본/자동업데이트 자산은 **Windows 네이티브 또는 Windows CI 러너**에서 생성한다.

## 7. 성공 기준

- **DP1.** `build:linux`/`build:win`이 `dist/`에 AppImage+deb / 포터블 zip을 생성한다.
- **DP2.** 패키징 배포본이 정상 샌드박스로 기동하고 wasm 파서가 동작한다(분석 성공).
- **DP3.** 새 버전을 GitHub Releases에 게시하면 기존 설치본이 기동 시 업데이트를 감지·다운로드하고, 재시작 시 교체된다.

## 추가) — 미해결 / 제안

- **(배포-1)** 코드 서명/공증 도입 시점·인증서 조달.
- **(배포-2)** CI 파이프라인(태그 push → 멀티 OS 빌드·퍼블리시) 구성.
- **(배포-3)** 업데이트 확인 주기·채널(베타 채널 제공 여부)의 설정 노출.
- **(배포-4)** deb 패키지 의존성·데스크톱 통합(.desktop, 아이콘) 세부.
- **(배포-5)** 델타 업데이트(blockmap) 적용 여부.
