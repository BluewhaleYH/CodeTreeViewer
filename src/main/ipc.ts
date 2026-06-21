import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { SourceParser } from './analysis/parser'
import { resolveParserConfig } from './analysis/wasm-paths'
import { analyzeProject, reanalyzeFile, runAnalysis } from './analysis/runner'
import type { FileInfo } from './analysis/extract'
import type { ScannedFile } from './analysis/scanner'
import { AnalysisCache, ANALYZER_VERSION, fileFingerprint } from './analysis/cache'
import { getSessionManager } from './session/session-manager'
import { readSourceFile, saveSourceFile } from './source'
import {
  LOG_STREAM_THRESHOLD,
  buildLineIndex,
  readLinesAt,
  scanFilter,
  scanSearch,
  scanRelated,
  type LineIndex
} from './log-store'
import type { LogFilter } from '../shared/log-filter'
import type { LogLevel } from '../shared/logcat-parse'
import type { AnalysisResult } from '../shared/analysis'
import type { PersistedTab, SessionState } from '../shared/session'
import type { LogOpenResult, LogSite } from '../shared/log'
import type { SourceReadResult, SourceSaveResult } from '../shared/source'

export interface ProjectSelection {
  path: string
  name: string
}

interface AnalyzePayload {
  id: string
  projectPath: string
}

// 파서는 비용이 크므로 한 번 생성해 재사용한다.
let parserPromise: Promise<SourceParser> | null = null
function getParser(): Promise<SourceParser> {
  if (!parserPromise) {
    parserPromise = SourceParser.create(
      resolveParserConfig({ packaged: app.isPackaged, resourcesPath: process.resourcesPath })
    )
  }
  return parserPromise
}

// 증분 재분석용 인메모리 파싱 산출물(프로젝트별, 세션 한정). (M12_3)
const infosCache = new Map<
  string,
  { files: ScannedFile[]; infos: FileInfo[]; summary: import('../shared/analysis').AnalysisSummary }
>()

// 스트리밍 로그 레지스트리(세션 한정). id → 파일 경로 + 라인 인덱스. (TODO_EXTRA C)
const logStreams = new Map<number, { path: string; index: LineIndex }>()
let logStreamCounter = 0

// 분석 캐시(세션과 분리, userData). (02 §7.2, 01 §6)
let analysisCache: AnalysisCache | null = null
function getCache(): AnalysisCache {
  if (!analysisCache) {
    analysisCache = new AnalysisCache(join(app.getPath('userData'), 'analysis-cache'))
  }
  return analysisCache
}

/**
 * 메인 프로세스 IPC 핸들러를 등록한다.
 * - `dialog:open-project`: 폴더 선택 다이얼로그. (01 §4)
 * - `analysis:run`: 프로젝트 분석 실행. 진행률은 `analysis:progress`로 스트리밍. (02 §3, §8)
 */
export function registerIpcHandlers(): void {
  ipcMain.handle('dialog:open-project', async (event): Promise<ProjectSelection | null> => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    const result = owner
      ? await dialog.showOpenDialog(owner, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] })

    if (result.canceled || result.filePaths.length === 0) return null

    const path = result.filePaths[0]
    return { path, name: basename(path) }
  })

  ipcMain.handle(
    'analysis:run',
    async (event, payload: AnalyzePayload): Promise<AnalysisResult> => {
      const parser = await getParser()
      const result = await analyzeProject(payload.projectPath, parser, getCache(), {
        onProgress: (progress) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send('analysis:progress', { id: payload.id, progress })
          }
        }
      })
      return { summary: result.summary, graph: result.graph, logSites: result.logSites }
    }
  )

  // 저장 시 증분 재분석: 변경 파일만 재파싱(가능하면) 후 그래프/검색 갱신. (06 §4, M12_3)
  ipcMain.handle(
    'analysis:reanalyze',
    async (
      _event,
      payload: { projectPath: string; relativePath: string }
    ): Promise<AnalysisResult> => {
      const parser = await getParser()
      const cached = infosCache.get(payload.projectPath)
      const file = cached?.files.find((f) => f.relativePath === payload.relativePath)

      let result
      if (cached && file) {
        result = await reanalyzeFile(file, parser, cached) // 변경 파일만 재파싱
      } else {
        result = await runAnalysis(payload.projectPath, parser) // 베이스 없음 → 전체 1회
      }
      infosCache.set(payload.projectPath, {
        files: result.files,
        infos: result.infos,
        summary: result.summary
      })
      // 디스크 캐시도 최신 상태로 갱신(재기동 가속).
      await getCache().set(payload.projectPath, {
        root: payload.projectPath,
        version: ANALYZER_VERSION,
        fingerprint: await fileFingerprint(result.files),
        summary: result.summary,
        graph: result.graph,
        logSites: result.logSites
      })
      return { summary: result.summary, graph: result.graph, logSites: result.logSites }
    }
  )

  // 프로젝트 내 소스 파일 읽기(코드 뷰/편집기). (04 §6, M11_5; mtime 추가 M12_2)
  ipcMain.handle(
    'source:read',
    (_event, p: { projectPath: string; relativePath: string }): Promise<SourceReadResult | null> =>
      readSourceFile(p.projectPath, p.relativePath)
  )

  // 소스 파일 저장(원자적 쓰기 + 외부 변경 충돌 감지). (06 §3, §6, M12_2)
  ipcMain.handle(
    'source:save',
    (
      _event,
      p: { projectPath: string; relativePath: string; content: string; baseMtime: number | null }
    ): Promise<SourceSaveResult> =>
      saveSourceFile(p.projectPath, p.relativePath, p.content, p.baseMtime)
  )

  // 로그 덤프 파일 열기. (04 §2, M11_1) 대용량 스트리밍은 M11_2.
  ipcMain.handle('log:open', async (event): Promise<LogOpenResult | null> => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      properties: ['openFile'],
      filters: [
        { name: '로그/텍스트', extensions: ['log', 'txt', 'logcat', 'out'] },
        { name: '모든 파일', extensions: ['*'] }
      ]
    }
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null

    const path = result.filePaths[0]
    const name = basename(path)
    const { size } = await stat(path)
    if (size <= LOG_STREAM_THRESHOLD) {
      const content = await readFile(path, 'utf8')
      return { mode: 'memory', path, name, content }
    }
    // 대용량: 라인 인덱스만 보관, 표시/필터/검색은 디스크 스트리밍. (TODO_EXTRA C)
    const index = await buildLineIndex(path)
    logStreamCounter += 1
    const id = logStreamCounter
    logStreams.set(id, { path, index })
    return { mode: 'stream', path, name, id, lineCount: index.offsets.length }
  })

  // 스트리밍 로그: 표시 윈도우(흩어진 가시 라인)·필터·검색·관련 라인. (TODO_EXTRA C)
  ipcMain.handle('log:lines', (_e, p: { id: number; indices: number[] }): Promise<string[]> => {
    const s = logStreams.get(p.id)
    return s ? readLinesAt(s.index, s.path, p.indices) : Promise.resolve([])
  })
  ipcMain.handle(
    'log:scan',
    (
      _e,
      p: { id: number; filter: { levels: LogLevel[] | null; tag: string; text: string; regex: boolean } }
    ): Promise<number[]> => {
      const s = logStreams.get(p.id)
      if (!s) return Promise.resolve([])
      const filter: LogFilter = {
        levels: p.filter.levels ? new Set(p.filter.levels) : null,
        tag: p.filter.tag,
        text: p.filter.text,
        regex: p.filter.regex
      }
      return scanFilter(s.path, filter)
    }
  )
  ipcMain.handle(
    'log:search',
    (_e, p: { id: number; visible: number[]; query: string; regex: boolean }): Promise<number[]> => {
      const s = logStreams.get(p.id)
      return s ? scanSearch(s.path, p.visible, p.query, p.regex) : Promise.resolve([])
    }
  )
  ipcMain.handle(
    'log:related',
    (_e, p: { id: number; sites: LogSite[]; file: string }): Promise<number[]> => {
      const s = logStreams.get(p.id)
      return s ? scanRelated(s.path, p.sites, p.file) : Promise.resolve([])
    }
  )

  // 세션 로드/탭 저장. 창 상태는 main이 소유. (01 §5)
  ipcMain.handle('session:load', (): SessionState => getSessionManager().get())
  ipcMain.handle(
    'session:save-tabs',
    (
      _event,
      payload: { tabs: PersistedTab[]; activeIndex: number; recentlyClosed?: PersistedTab[] }
    ): void => {
      getSessionManager().setTabs(payload.tabs, payload.activeIndex, payload.recentlyClosed ?? [])
    }
  )

  // 프로젝트 경로 존재 확인(복원 시 깨진 경로 감지). (TODO_EXTRA D)
  ipcMain.handle('project:exists', async (_event, p: { path: string }): Promise<boolean> => {
    try {
      return (await stat(p.path)).isDirectory()
    } catch {
      return false
    }
  })
}
