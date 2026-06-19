/**
 * 코드 뷰(읽기 전용 소스 + 강조 라인). (04 §6, M11_5)
 * 3-뷰 레이아웃의 우측 패널. 매칭된 소스 위치를 표시하고 해당 라인을 강조·스크롤한다.
 * 편집(Monaco)은 M12.
 */

export interface CodeViewData {
  file: string
  /** 강조할 라인(1-based). */
  line: number
  lines: readonly string[]
}

export interface CodeViewCallbacks {
  onClose: () => void
}

export class CodeView {
  private currentKey: string | null = null

  private readonly header: HTMLElement
  private readonly body: HTMLElement

  constructor(
    private readonly host: HTMLElement,
    private readonly callbacks: CodeViewCallbacks
  ) {
    this.host.classList.add('codeview')
    this.host.innerHTML = `
      <div class="codeview__header">
        <span class="codeview__title"></span>
        <button class="codeview__btn codeview__close" title="코드 뷰 닫기">✕</button>
      </div>
      <div class="codeview__body"></div>
    `
    this.header = this.host.querySelector('.codeview__header') as HTMLElement
    this.body = this.host.querySelector('.codeview__body') as HTMLElement
    ;(this.host.querySelector('.codeview__close') as HTMLElement).addEventListener('click', () =>
      this.callbacks.onClose()
    )
  }

  /** 표시할 소스를 설정한다. key가 같으면 다시 그리지 않는다. */
  setData(key: string | null, data: CodeViewData | null): void {
    if (this.currentKey === key) return
    this.currentKey = key
    this.render(data)
  }

  private render(data: CodeViewData | null): void {
    ;(this.header.querySelector('.codeview__title') as HTMLElement).textContent = data
      ? `${data.file}:${data.line}`
      : ''
    this.body.replaceChildren()
    if (!data) return

    const frag = document.createDocumentFragment()
    let target: HTMLElement | null = null
    data.lines.forEach((raw, i) => {
      const lineNo = i + 1
      const row = document.createElement('div')
      row.className = lineNo === data.line ? 'codeview__row is-target' : 'codeview__row'
      const ln = document.createElement('span')
      ln.className = 'codeview__ln'
      ln.textContent = String(lineNo)
      const text = document.createElement('span')
      text.className = 'codeview__text'
      text.textContent = raw
      row.append(ln, text)
      if (lineNo === data.line) target = row
      frag.appendChild(row)
    })
    this.body.appendChild(frag)
    // 강조 라인으로 스크롤(중앙 근처).
    if (target) (target as HTMLElement).scrollIntoView({ block: 'center' })
  }
}
