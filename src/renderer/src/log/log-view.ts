import { visibleRange } from './log-virtual'

/**
 * 로그 덤프 열람 뷰(영속 컴포넌트). (04 §2~§3, M11_1·M11_2)
 * 가상 스크롤로 보이는 라인만 렌더해 대용량(수십만 라인)에서도 멈춤 없이 열람한다.
 * 고정 행 높이 + 가로 스크롤(긴 라인). 필터/선택 연동은 M11_3~M11_5.
 */

export interface LogDumpData {
  name: string
  lines: readonly string[]
}

export interface LogViewCallbacks {
  onClose: () => void
}

/** 행 높이(px). CSS .logview__row 와 반드시 일치해야 한다. */
const ROW_HEIGHT = 18
const OVERSCAN = 12

export class LogView {
  private currentKey: string | null = null
  private name = ''
  private lines: readonly string[] = []

  private readonly header: HTMLElement
  private readonly body: HTMLElement
  private readonly windowEl: HTMLElement

  constructor(
    private readonly host: HTMLElement,
    private readonly callbacks: LogViewCallbacks
  ) {
    this.host.classList.add('logview')
    this.host.innerHTML = `
      <div class="logview__header"></div>
      <div class="logview__body"><div class="logview__window"></div></div>
    `
    this.header = this.host.querySelector('.logview__header') as HTMLElement
    this.body = this.host.querySelector('.logview__body') as HTMLElement
    this.windowEl = this.host.querySelector('.logview__window') as HTMLElement
    this.body.addEventListener('scroll', () => this.renderWindow())
  }

  /** 표시할 덤프를 설정한다. key가 같으면 다시 그리지 않는다. */
  setDump(key: string | null, dump: LogDumpData | null): void {
    if (this.currentKey === key) return
    this.currentKey = key
    this.lines = dump?.lines ?? []
    this.name = dump?.name ?? ''
    this.body.scrollTop = 0
    this.renderHeader()
    this.renderWindow()
  }

  private renderHeader(): void {
    this.header.replaceChildren()
    if (!this.currentKey) return

    const title = document.createElement('span')
    title.className = 'logview__title'
    title.textContent = this.name
    title.title = this.name

    const count = document.createElement('span')
    count.className = 'logview__count muted'
    count.textContent = `${this.lines.length.toLocaleString()} 라인`

    const closeBtn = document.createElement('button')
    closeBtn.className = 'logview__btn'
    closeBtn.textContent = '✕'
    closeBtn.title = '로그 닫기'
    closeBtn.addEventListener('click', () => this.callbacks.onClose())

    this.header.append(title, count, closeBtn)
  }

  /** 보이는 구간만 렌더하고, 위/아래 패딩으로 전체 스크롤 높이를 유지한다(가상 스크롤). */
  private renderWindow(): void {
    const total = this.lines.length
    const { start, end } = visibleRange(
      this.body.scrollTop,
      this.body.clientHeight,
      ROW_HEIGHT,
      total,
      OVERSCAN
    )
    this.windowEl.style.paddingTop = `${start * ROW_HEIGHT}px`
    this.windowEl.style.paddingBottom = `${Math.max(0, total - end) * ROW_HEIGHT}px`

    const frag = document.createDocumentFragment()
    for (let i = start; i < end; i += 1) {
      const row = document.createElement('div')
      row.className = 'logview__row'
      const ln = document.createElement('span')
      ln.className = 'logview__ln'
      ln.textContent = String(i + 1)
      const text = document.createElement('span')
      text.className = 'logview__text'
      text.textContent = this.lines[i]
      row.append(ln, text)
      frag.appendChild(row)
    }
    this.windowEl.replaceChildren(frag)
  }
}
