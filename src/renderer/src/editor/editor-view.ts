import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

/**
 * Monaco 기반 코드 편집기(우측 패널). (06 §2, M12)
 * 노드/로그 후보에서 소스를 열어 해당 라인으로 이동한다. 편집은 가능하나 저장은 M12_2.
 * 워커는 Vite `?worker`로 번들된 동일 출처 파일 → CSP default-src 'self' 허용.
 */

// Monaco 워커 환경(에디터 코어 워커만; java/kotlin은 별도 언어 워커 불필요).
self.MonacoEnvironment = {
  getWorker: () => new editorWorker()
}

function languageFor(file: string): string {
  if (file.endsWith('.kt') || file.endsWith('.kts')) return 'kotlin'
  if (file.endsWith('.java')) return 'java'
  return 'plaintext'
}

export interface EditorFileData {
  file: string
  /** 이동할 라인(1-based). */
  line: number
  content: string
}

export interface EditorViewCallbacks {
  onClose: () => void
  /** 편집 내용 변경(미저장 표시·저장 활성화는 M12_2). */
  onChange?: (content: string) => void
}

export class EditorView {
  private editor: monaco.editor.IStandaloneCodeEditor | null = null
  private currentKey: string | null = null
  private readonly title: HTMLElement
  private readonly editorHost: HTMLElement

  constructor(
    private readonly host: HTMLElement,
    private readonly callbacks: EditorViewCallbacks
  ) {
    this.host.classList.add('editorview')
    this.host.innerHTML = `
      <div class="editorview__header">
        <span class="editorview__title"></span>
        <button class="editorview__btn editorview__close" title="편집기 닫기">✕</button>
      </div>
      <div class="editorview__body"></div>
    `
    this.title = this.host.querySelector('.editorview__title') as HTMLElement
    this.editorHost = this.host.querySelector('.editorview__body') as HTMLElement
    ;(this.host.querySelector('.editorview__close') as HTMLElement).addEventListener('click', () =>
      this.callbacks.onClose()
    )
  }

  private ensureEditor(): monaco.editor.IStandaloneCodeEditor {
    if (!this.editor) {
      this.editor = monaco.editor.create(this.editorHost, {
        value: '',
        language: 'plaintext',
        theme: 'vs-dark',
        readOnly: false,
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 12,
        scrollBeyondLastLine: false
      })
      this.editor.onDidChangeModelContent(() => {
        this.callbacks.onChange?.(this.editor?.getValue() ?? '')
      })
    }
    return this.editor
  }

  /** 표시할 파일을 설정한다. key가 같으면 다시 열지 않는다. */
  setFile(key: string | null, data: EditorFileData | null): void {
    if (this.currentKey === key) return
    this.currentKey = key
    if (!data) {
      this.title.textContent = ''
      this.editor?.setValue('')
      return
    }
    const editor = this.ensureEditor()
    this.title.textContent = `${data.file}:${data.line}`
    this.title.title = data.file
    const model = editor.getModel()
    if (model) {
      model.setValue(data.content)
      monaco.editor.setModelLanguage(model, languageFor(data.file))
    } else {
      editor.setModel(monaco.editor.createModel(data.content, languageFor(data.file)))
    }
    editor.revealLineInCenter(data.line)
    editor.setPosition({ lineNumber: data.line, column: 1 })
  }

  /** 현재 편집 내용. (M12_2 저장용) */
  getContent(): string {
    return this.editor?.getValue() ?? ''
  }
}
