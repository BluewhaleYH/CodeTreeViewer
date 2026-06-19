/**
 * 로그 덤프 열람 뷰(영속 컴포넌트). (04 §2, M11_1)
 * 라인 번호 + 본문을 표시하고, 줄바꿈 토글/가로 스크롤을 제공한다.
 * 대용량(가상 스크롤)은 M11_2, 필터/선택 연동은 M11_3~M11_5에서 확장한다.
 */

export interface LogDumpData {
  name: string
  lines: readonly string[]
}

export interface LogViewCallbacks {
  onClose: () => void
}

export class LogView {
  private currentKey: string | null = null
  private dump: LogDumpData | null = null
  private wrap = false

  private readonly header: HTMLElement
  private readonly body: HTMLElement

  constructor(
    private readonly host: HTMLElement,
    private readonly callbacks: LogViewCallbacks
  ) {
    this.host.classList.add('logview')
    this.host.innerHTML = `
      <div class="logview__header"></div>
      <div class="logview__body"></div>
    `
    this.header = this.host.querySelector('.logview__header') as HTMLElement
    this.body = this.host.querySelector('.logview__body') as HTMLElement
  }

  /** 표시할 덤프를 설정한다. key가 같으면 다시 그리지 않는다(불필요한 재렌더 방지). */
  setDump(key: string | null, dump: LogDumpData | null): void {
    if (this.currentKey === key) return
    this.currentKey = key
    this.dump = dump
    this.render()
  }

  private toggleWrap(): void {
    this.wrap = !this.wrap
    this.render()
  }

  private render(): void {
    this.header.replaceChildren()
    this.body.replaceChildren()
    if (!this.dump) return

    const title = document.createElement('span')
    title.className = 'logview__title'
    title.textContent = this.dump.name
    title.title = this.dump.name

    const count = document.createElement('span')
    count.className = 'logview__count muted'
    count.textContent = `${this.dump.lines.length.toLocaleString()} 라인`

    const wrapBtn = document.createElement('button')
    wrapBtn.className = 'logview__btn'
    wrapBtn.textContent = this.wrap ? '줄바꿈 끄기' : '줄바꿈'
    wrapBtn.addEventListener('click', () => this.toggleWrap())

    const closeBtn = document.createElement('button')
    closeBtn.className = 'logview__btn'
    closeBtn.textContent = '✕'
    closeBtn.title = '로그 닫기'
    closeBtn.addEventListener('click', () => this.callbacks.onClose())

    this.header.append(title, count, wrapBtn, closeBtn)

    const lines = document.createElement('div')
    lines.className = this.wrap ? 'logview__lines is-wrap' : 'logview__lines'
    const frag = document.createDocumentFragment()
    this.dump.lines.forEach((raw, i) => {
      const row = document.createElement('div')
      row.className = 'logview__row'
      const ln = document.createElement('span')
      ln.className = 'logview__ln'
      ln.textContent = String(i + 1)
      const text = document.createElement('span')
      text.className = 'logview__text'
      text.textContent = raw
      row.append(ln, text)
      frag.appendChild(row)
    })
    lines.appendChild(frag)
    this.body.appendChild(lines)
  }
}
