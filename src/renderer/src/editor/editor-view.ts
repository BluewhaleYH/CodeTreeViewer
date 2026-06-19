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
  /** 편집 내용 변경 → 미저장 여부 통지. (M12_2) */
  onDirtyChange?: (dirty: boolean) => void
  /** 저장 요청(Ctrl+S 또는 저장 버튼). (M12_2) */
  onSave?: (content: string) => void
}

export class EditorView {
  private editor: monaco.editor.IStandaloneCodeEditor | null = null
  private diffEditor: monaco.editor.IStandaloneDiffEditor | null = null
  private currentKey: string | null = null
  private baseContent = ''
  private lang = 'plaintext'
  private dirty = false
  private readonly title: HTMLElement
  private readonly dirtyDot: HTMLElement
  private readonly editorHost: HTMLElement

  constructor(
    private readonly host: HTMLElement,
    private readonly callbacks: EditorViewCallbacks
  ) {
    this.host.classList.add('editorview')
    this.host.innerHTML = `
      <div class="editorview__header">
        <span class="editorview__dirty" hidden>●</span>
        <span class="editorview__title"></span>
        <button class="editorview__btn editorview__diff" title="편집 전/후 차이 보기">차이</button>
        <button class="editorview__btn editorview__save" title="저장 (Ctrl+S)">저장</button>
        <button class="editorview__btn editorview__close" title="편집기 닫기">✕</button>
      </div>
      <div class="editorview__body"></div>
    `
    this.title = this.host.querySelector('.editorview__title') as HTMLElement
    this.dirtyDot = this.host.querySelector('.editorview__dirty') as HTMLElement
    this.editorHost = this.host.querySelector('.editorview__body') as HTMLElement
    ;(this.host.querySelector('.editorview__close') as HTMLElement).addEventListener('click', () =>
      this.callbacks.onClose()
    )
    ;(this.host.querySelector('.editorview__save') as HTMLElement).addEventListener('click', () =>
      this.requestSave()
    )
    ;(this.host.querySelector('.editorview__diff') as HTMLElement).addEventListener('click', () =>
      this.toggleDiff()
    )
  }

  private disposeEditors(): void {
    this.editor?.dispose()
    this.editor = null
    this.diffEditor?.getModel()?.original.dispose()
    this.diffEditor?.getModel()?.modified.dispose()
    this.diffEditor?.dispose()
    this.diffEditor = null
  }

  /** 편집 ↔ 차이(읽기 전용 diff) 보기를 전환한다. (06 §5, M12_4) */
  private toggleDiff(): void {
    if (this.diffEditor) {
      // 차이 → 편집: 현재(수정) 내용을 유지하며 일반 편집기로 복귀.
      const content = this.diffEditor.getModel()?.modified.getValue() ?? this.baseContent
      this.disposeEditors()
      const editor = this.ensureEditor()
      editor.getModel()?.setValue(content)
      monaco.editor.setModelLanguage(editor.getModel()!, this.lang)
      this.recomputeDirty()
    } else if (this.editor) {
      // 편집 → 차이: 원본(저장본) vs 현재.
      const content = this.editor.getValue()
      this.disposeEditors()
      this.diffEditor = monaco.editor.createDiffEditor(this.editorHost, {
        theme: 'vs-dark',
        readOnly: true,
        automaticLayout: true,
        renderSideBySide: false,
        minimap: { enabled: false },
        fontSize: 12
      })
      this.diffEditor.setModel({
        original: monaco.editor.createModel(this.baseContent, this.lang),
        modified: monaco.editor.createModel(content, this.lang)
      })
    }
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
      this.editor.onDidChangeModelContent(() => this.recomputeDirty())
      this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => this.requestSave())
    }
    return this.editor
  }

  private recomputeDirty(): void {
    if (!this.editor) return
    const next = this.editor.getValue() !== this.baseContent
    if (next === this.dirty) return
    this.dirty = next
    this.dirtyDot.hidden = !next
    this.callbacks.onDirtyChange?.(next)
  }

  private requestSave(): void {
    this.callbacks.onSave?.(this.getContent())
  }

  /** 표시할 파일을 설정한다. key가 같으면 다시 열지 않는다. */
  setFile(key: string | null, data: EditorFileData | null): void {
    if (this.currentKey === key) return
    this.currentKey = key
    if (this.diffEditor) this.disposeEditors() // 새 파일은 항상 편집 모드로
    if (!data) {
      this.title.textContent = ''
      this.baseContent = ''
      this.dirty = false
      this.dirtyDot.hidden = true
      this.editor?.setValue('')
      return
    }
    const editor = this.ensureEditor()
    this.title.textContent = `${data.file}:${data.line}`
    this.title.title = data.file
    this.baseContent = data.content
    this.lang = languageFor(data.file)
    this.dirty = false
    this.dirtyDot.hidden = true
    const model = editor.getModel()
    if (model) {
      model.setValue(data.content)
      monaco.editor.setModelLanguage(model, this.lang)
    } else {
      editor.setModel(monaco.editor.createModel(data.content, this.lang))
    }
    editor.revealLineInCenter(data.line)
    editor.setPosition({ lineNumber: data.line, column: 1 })
  }

  /** 저장 성공 후 호출: 현재 내용을 기준선으로 삼아 미저장 표시를 해제한다. (M12_2) */
  markSaved(): void {
    this.baseContent = this.getContent()
    this.dirty = false
    this.dirtyDot.hidden = true
  }

  /** 현재 편집 내용(편집/차이 모드 모두). (저장용) */
  getContent(): string {
    if (this.editor) return this.editor.getValue()
    return this.diffEditor?.getModel()?.modified.getValue() ?? ''
  }
}
