import { BrowserWindow, dialog, ipcMain } from 'electron'
import { basename } from 'node:path'
import { SourceParser } from './analysis/parser'
import { resolveParserConfig } from './analysis/wasm-paths'
import { runAnalysis } from './analysis/runner'
import type { AnalysisSummary } from '../shared/analysis'

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
    parserPromise = SourceParser.create(resolveParserConfig())
  }
  return parserPromise
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

  ipcMain.handle('analysis:run', async (event, payload: AnalyzePayload): Promise<AnalysisSummary> => {
    const parser = await getParser()
    return runAnalysis(payload.projectPath, parser, {
      onProgress: (progress) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('analysis:progress', { id: payload.id, progress })
        }
      }
    })
  })
}
