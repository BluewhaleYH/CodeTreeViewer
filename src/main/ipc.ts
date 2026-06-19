import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { SourceParser } from './analysis/parser'
import { resolveParserConfig } from './analysis/wasm-paths'
import { analyzeProject } from './analysis/runner'
import { AnalysisCache } from './analysis/cache'
import { getSessionManager } from './session/session-manager'
import type { AnalysisResult } from '../shared/analysis'
import type { PersistedTab, SessionState } from '../shared/session'
import type { LogOpenResult } from '../shared/log'

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
      return { summary: result.summary, graph: result.graph }
    }
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
    const content = await readFile(path, 'utf8')
    return { path, name: basename(path), content }
  })

  // 세션 로드/탭 저장. 창 상태는 main이 소유. (01 §5)
  ipcMain.handle('session:load', (): SessionState => getSessionManager().get())
  ipcMain.handle(
    'session:save-tabs',
    (_event, payload: { tabs: PersistedTab[]; activeIndex: number }): void => {
      getSessionManager().setTabs(payload.tabs, payload.activeIndex)
    }
  )
}
