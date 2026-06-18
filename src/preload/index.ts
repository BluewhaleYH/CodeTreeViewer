import { contextBridge } from 'electron'

/**
 * 렌더러에 노출하는 안전한 API.
 * contextIsolation 환경에서 contextBridge로만 노출한다. (01 §2)
 * 실제 IPC 채널/기능 API는 이후 마일스톤에서 확장한다.
 */
const api = {
  platform: process.platform
}

contextBridge.exposeInMainWorld('codetree', api)

export type CodeTreeApi = typeof api
