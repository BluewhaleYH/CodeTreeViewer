import { visibleRange } from './log-virtual'
import { visualRows, buildPrefix, wrappedRange } from './log-wrap'
import { parseAll, parseLogcatLine, type LogcatFields, type LogLevel } from '../../../shared/logcat-parse'
import { ALL_LEVELS, filterIndices, type LogFilter } from '../../../shared/log-filter'
import { relatedLogLines } from '../../../shared/log-match'
import { searchMatches } from '../../../shared/log-search'
import type { LogSite } from '../../../shared/log'

/**
 * 로그 덤프 열람 뷰(영속 컴포넌트). (04 §2~§4, M11_1·M11_2·M11_3)
 * 가상 스크롤(대용량) + 레벨/태그/텍스트/정규식 필터(표시 전용, 원본 보존).
 * 선택 연동(로그↔노드↔코드)은 M11_4~M11_5.
 */

/**
 * 로그 표시 소스. (TODO_EXTRA C)
 * - memory: 작은 파일 — 전체 라인을 렌더러가 보유(모든 기능 동기).
 * - stream: 대용량 — main이 디스크 스트리밍, 렌더러는 윈도우만 보유(필터/검색/매칭은 IPC).
 */
export type LogDumpData =
  | { name: string; mode: 'memory'; lines: readonly string[] }
  | { name: string; mode: 'stream'; id: number; lineCount: number }

export interface LogViewCallbacks {
  onClose: () => void
  /** 라인 선택(역추적 후보 표시). (04 §5, M11_4) */
  onSelectLine: (index: number, raw: string) => void
}

/** 행 높이(px). CSS .logview__row 와 반드시 일치해야 한다. */
const ROW_HEIGHT = 18
const OVERSCAN = 12

export class LogView {
  private currentKey: string | null = null
  private name = ''
  private lines: readonly string[] = []
  private parsed: (LogcatFields | null)[] = []

  // 스트리밍 모드(대용량 로그): main 디스크 스트리밍 + 렌더러 윈도우 캐시. (TODO_EXTRA C)
  private streaming = false
  private streamId = -1
  private lineCount = 0
  private windowCache = new Map<number, string>()
  // 비동기 필터/검색/윈도우의 경쟁 방지 토큰(최신 요청만 반영).
  private filterToken = 0
  private searchToken = 0
  private windowToken = 0

  /** 필터를 통과한 원본 라인 인덱스. */
  private visible: number[] = []
  /** 선택된 원본 라인 인덱스(역추적). */
  private selectedLine: number | null = null
  /** 선택 노드(파일)와 연관된 라인 집합(노드→로그 연동). */
  private related: Set<number> = new Set()
  private relatedKey: string | null = null
  private readonly activeLevels = new Set<LogLevel>(ALL_LEVELS)
  private tagQuery = ''
  private textQuery = ''
  private useRegex = false

  // 줄바꿈(wrap) 모드: 가변 높이 가상 스크롤. (TODO_EXTRA C)
  private wrap = false
  private wrapPrefix: number[] | null = null
  private wrapCharsPerRow = 0
  private charWidth = 0

  // 검색(이동/강조). (M11_6)
  private searchQuery = ''
  private searchRegex = false
  private matches: number[] = []
  private matchSet: Set<number> = new Set()
  private matchPos = -1

  private readonly countEl: HTMLElement
  private readonly body: HTMLElement
  private readonly windowEl: HTMLElement
  private readonly tagInput: HTMLInputElement
  private readonly textInput: HTMLInputElement
  private readonly searchInput: HTMLInputElement
  private readonly searchCount: HTMLElement

  constructor(
    private readonly host: HTMLElement,
    private readonly callbacks: LogViewCallbacks
  ) {
    this.host.classList.add('logview')
    this.host.innerHTML = `
      <div class="logview__header">
        <span class="logview__title"></span>
        <span class="logview__count muted"></span>
        <button class="logview__btn logview__close" title="로그 닫기">✕</button>
      </div>
      <div class="logview__filter">
        <div class="logview__levels"></div>
        <input class="logview__tag" type="text" placeholder="태그" spellcheck="false" />
        <input class="logview__textq" type="text" placeholder="텍스트" spellcheck="false" />
        <label class="logview__regex"><input type="checkbox" /> 정규식</label>
        <label class="logview__wrap"><input type="checkbox" /> 줄바꿈</label>
      </div>
      <div class="logview__search">
        <input class="logview__searchq" type="text" placeholder="로그 검색" spellcheck="false" />
        <span class="logview__matchcount muted"></span>
        <button class="logview__navbtn logview__prev" title="이전 매치 (Shift+Enter)">▲</button>
        <button class="logview__navbtn logview__next" title="다음 매치 (Enter)">▼</button>
        <label class="logview__regex"><input class="logview__sregex" type="checkbox" /> 정규식</label>
      </div>
      <div class="logview__body"><div class="logview__window"></div></div>
    `
    this.countEl = this.host.querySelector('.logview__count') as HTMLElement
    this.body = this.host.querySelector('.logview__body') as HTMLElement
    this.windowEl = this.host.querySelector('.logview__window') as HTMLElement
    this.tagInput = this.host.querySelector('.logview__tag') as HTMLInputElement
    this.textInput = this.host.querySelector('.logview__textq') as HTMLInputElement
    this.searchInput = this.host.querySelector('.logview__searchq') as HTMLInputElement
    this.searchCount = this.host.querySelector('.logview__matchcount') as HTMLElement
    ;(this.host.querySelector('.logview__close') as HTMLElement).addEventListener('click', () =>
      this.callbacks.onClose()
    )

    // 검색: 입력 → 매치 갱신, Enter/▼ 다음, Shift+Enter/▲ 이전. (M11_6)
    this.searchInput.addEventListener('input', () => {
      this.searchQuery = this.searchInput.value
      this.updateMatches()
    })
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        this.step(e.shiftKey ? -1 : 1)
      }
    })
    ;(this.host.querySelector('.logview__sregex') as HTMLInputElement).addEventListener(
      'change',
      (e) => {
        this.searchRegex = (e.target as HTMLInputElement).checked
        this.updateMatches()
      }
    )
    ;(this.host.querySelector('.logview__next') as HTMLElement).addEventListener('click', () =>
      this.step(1)
    )
    ;(this.host.querySelector('.logview__prev') as HTMLElement).addEventListener('click', () =>
      this.step(-1)
    )

    this.buildLevelToggles()
    this.tagInput.addEventListener('input', () => {
      this.tagQuery = this.tagInput.value
      this.applyFilter()
    })
    this.textInput.addEventListener('input', () => {
      this.textQuery = this.textInput.value
      this.applyFilter()
    })
    ;(this.host.querySelector('.logview__regex input') as HTMLInputElement).addEventListener(
      'change',
      (e) => {
        this.useRegex = (e.target as HTMLInputElement).checked
        this.applyFilter()
      }
    )
    // 줄바꿈 토글: 가변 높이 가상 스크롤로 전환. (TODO_EXTRA C)
    ;(this.host.querySelector('.logview__wrap input') as HTMLInputElement).addEventListener(
      'change',
      (e) => {
        this.wrap = (e.target as HTMLInputElement).checked
        this.wrapPrefix = null
        this.host.classList.toggle('is-wrap', this.wrap)
        this.renderWindow()
      }
    )

    this.body.addEventListener('scroll', () => this.renderWindow())
    // 패널 너비 변경 시 행당 글자 수가 달라지므로 wrap 캐시를 무효화한다.
    new ResizeObserver(() => {
      if (!this.wrap) return
      this.wrapPrefix = null
      this.renderWindow()
    }).observe(this.body)
  }

  private buildLevelToggles(): void {
    const host = this.host.querySelector('.logview__levels') as HTMLElement
    for (const level of ALL_LEVELS) {
      const btn = document.createElement('button')
      btn.className = `logview__level is-on level-${level}`
      btn.textContent = level
      btn.title = `${level} 레벨 표시 토글`
      btn.addEventListener('click', () => {
        if (this.activeLevels.has(level)) this.activeLevels.delete(level)
        else this.activeLevels.add(level)
        btn.classList.toggle('is-on', this.activeLevels.has(level))
        this.applyFilter()
      })
      host.appendChild(btn)
    }
  }

  private get filter(): LogFilter {
    return {
      levels: this.activeLevels.size === ALL_LEVELS.length ? null : new Set(this.activeLevels),
      tag: this.tagQuery.trim(),
      text: this.textQuery,
      regex: this.useRegex
    }
  }

  /** 원본 라인 텍스트(메모리: 배열, 스트림: 윈도우 캐시). */
  private line(i: number): string {
    return this.streaming ? (this.windowCache.get(i) ?? '') : (this.lines[i] ?? '')
  }

  /** 원본 라인 파싱 필드(스트림은 캐시된 라인을 즉석 파싱). */
  private fieldsFor(i: number): LogcatFields | null {
    if (!this.streaming) return this.parsed[i] ?? null
    const raw = this.windowCache.get(i)
    return raw === undefined ? null : parseLogcatLine(raw)
  }

  /** 전체 라인 수(메모리/스트림 공통). */
  private get totalLines(): number {
    return this.streaming ? this.lineCount : this.lines.length
  }

  /** 표시할 덤프를 설정한다. key가 같으면 다시 그리지 않는다. */
  setDump(key: string | null, dump: LogDumpData | null): void {
    if (this.currentKey === key) return
    this.currentKey = key
    this.streaming = dump?.mode === 'stream'
    this.windowCache = new Map()
    if (dump?.mode === 'stream') {
      this.streamId = dump.id
      this.lineCount = dump.lineCount
      this.lines = []
      this.parsed = []
      this.wrap = false // 스트림 모드는 wrap 미지원(라인 길이 전량 필요)
    } else {
      this.streamId = -1
      this.lineCount = 0
      this.lines = dump?.lines ?? []
      this.parsed = dump ? parseAll(this.lines) : []
    }
    this.name = dump?.name ?? ''
    this.selectedLine = null
    this.related = new Set()
    this.relatedKey = null
    this.searchQuery = ''
    this.searchInput.value = ''
    this.matches = []
    this.matchSet = new Set()
    this.matchPos = -1
    this.renderSearchCount()
    this.host.classList.toggle('is-active', Boolean(dump))
    this.host.classList.toggle('is-stream', this.streaming)
    this.host.classList.toggle('is-wrap', this.wrap && !this.streaming)
    ;(this.host.querySelector('.logview__title') as HTMLElement).textContent = this.name
    this.applyFilter()
  }

  /** 자체 검수(스크린샷)용 검색 시드. */
  seedSearch(query: string): void {
    this.searchQuery = query
    this.searchInput.value = query
    this.updateMatches()
  }

  /** 선택 라인을 외부(store)와 동기화한다. 같으면 무시. */
  setSelectedLine(index: number | null): void {
    if (this.selectedLine === index) return
    this.selectedLine = index
    this.renderWindow()
  }

  /** 선택된 파일 노드와 연관된 라인을 강조한다(노드→로그 연동). (04 §7, M11_5) */
  setRelatedFile(file: string | null, sites: readonly LogSite[]): void {
    const key = file && this.currentKey ? `${this.currentKey}:${file}` : null
    if (this.relatedKey === key) return
    this.relatedKey = key
    if (this.streaming) {
      if (!file) {
        this.related = new Set()
        this.renderWindow()
        return
      }
      void window.codetree.logRelated(this.streamId, [...sites], file).then((idx) => {
        if (this.relatedKey !== key) return // 더 최신 선택이 있으면 무시
        this.related = new Set(idx)
        this.renderWindow()
      })
      return
    }
    this.related = file ? relatedLogLines(this.lines, this.parsed, sites, file) : new Set()
    this.renderWindow()
  }

  /** 등폭 글자 폭(px)을 1회 측정해 캐시한다. */
  private measureCharWidth(): number {
    if (this.charWidth > 0) return this.charWidth
    const probe = document.createElement('span')
    probe.className = 'logview__text'
    probe.style.position = 'absolute'
    probe.style.visibility = 'hidden'
    probe.style.whiteSpace = 'pre'
    probe.textContent = 'M'.repeat(100)
    this.windowEl.appendChild(probe)
    const w = probe.getBoundingClientRect().width / 100
    probe.remove()
    if (w > 0) this.charWidth = w
    return this.charWidth
  }

  /** 현재 패널 너비에서 한 시각 행에 들어가는 글자 수. */
  private charsPerRow(): number {
    const cw = this.measureCharWidth()
    const GUTTER = 66 // .logview__ln(56) + 우측 패딩(10)
    const avail = Math.max(0, this.body.clientWidth - GUTTER)
    return cw > 0 ? Math.max(1, Math.floor(avail / cw)) : 80
  }

  /** wrap 모드 누적 오프셋(prefix)을 (필요 시) 재계산해 캐시한다. */
  private ensureWrapPrefix(): void {
    const cpr = this.charsPerRow()
    if (this.wrapPrefix && this.wrapCharsPerRow === cpr) return
    const counts = this.visible.map((idx) => visualRows(this.lines[idx].length, cpr))
    this.wrapPrefix = buildPrefix(counts, ROW_HEIGHT)
    this.wrapCharsPerRow = cpr
  }

  /** 필터를 적용해 가시 인덱스를 재계산하고 다시 그린다. (스트림은 main 디스크 스캔) */
  private applyFilter(): void {
    if (this.streaming) {
      const f = this.filter
      const token = ++this.filterToken
      void window.codetree
        .logScan(this.streamId, {
          levels: f.levels ? [...f.levels] : null,
          tag: f.tag,
          text: f.text,
          regex: f.regex
        })
        .then((visible) => {
          if (token !== this.filterToken) return // 더 최신 필터가 있으면 무시
          this.visible = visible
          this.afterFilter()
        })
      return
    }
    this.visible = filterIndices(this.lines, this.parsed, this.filter)
    this.afterFilter()
  }

  /** 필터 결과 반영 공통 처리(메모리/스트림). */
  private afterFilter(): void {
    this.wrapPrefix = null // 가시 집합 변경 → wrap 오프셋 재계산 필요
    this.countEl.textContent =
      this.visible.length === this.totalLines
        ? `${this.totalLines.toLocaleString()} 라인`
        : `${this.visible.length.toLocaleString()} / ${this.totalLines.toLocaleString()} 라인`
    this.body.scrollTop = 0
    this.updateMatches() // 필터 변경 시 검색 매치도 갱신
    this.renderWindow()
  }

  /** 검색 매치를 (현재 표시 라인 위에서) 재계산하고 카운트를 갱신한다. (M11_6) */
  private updateMatches(): void {
    if (this.streaming) {
      const token = ++this.searchToken
      const p = this.searchQuery
        ? window.codetree.logSearch(this.streamId, this.visible, this.searchQuery, this.searchRegex)
        : Promise.resolve<number[]>([])
      void p.then((matches) => {
        if (token !== this.searchToken) return
        this.matches = matches
        this.afterMatches()
      })
      return
    }
    this.matches = searchMatches(this.lines, this.visible, this.searchQuery, this.searchRegex)
    this.afterMatches()
  }

  private afterMatches(): void {
    this.matchSet = new Set(this.matches)
    this.matchPos = this.matches.length > 0 ? 0 : -1
    this.renderSearchCount()
    this.renderWindow()
  }

  private renderSearchCount(): void {
    this.searchCount.textContent =
      this.searchQuery === ''
        ? ''
        : this.matches.length === 0
          ? '0'
          : `${this.matchPos + 1}/${this.matches.length}`
  }

  /** 다음(dir=1)/이전(dir=-1) 매치로 이동: 스크롤 + 라인 선택(3중 연동). (M11_6) */
  private step(dir: number): void {
    if (this.matches.length === 0) return
    this.matchPos = (this.matchPos + dir + this.matches.length) % this.matches.length
    const originalIndex = this.matches[this.matchPos]
    const pos = this.visible.indexOf(originalIndex)
    if (pos >= 0) {
      if (this.wrap && !this.streaming) this.ensureWrapPrefix()
      const offset =
        this.wrap && !this.streaming && this.wrapPrefix ? this.wrapPrefix[pos] : pos * ROW_HEIGHT
      this.body.scrollTop = Math.max(0, offset - this.body.clientHeight / 2)
    }
    this.renderSearchCount()
    this.renderWindow()
    this.emitSelect(originalIndex)
  }

  /** 라인 선택을 외부에 통지한다(스트림은 필요 시 라인을 디스크에서 가져온다). */
  private emitSelect(originalIndex: number): void {
    if (this.streaming) {
      const cached = this.windowCache.get(originalIndex)
      if (cached !== undefined) {
        this.callbacks.onSelectLine(originalIndex, cached)
        return
      }
      void window.codetree.logLines(this.streamId, [originalIndex]).then((t) => {
        const raw = t[0] ?? ''
        this.windowCache.set(originalIndex, raw)
        this.callbacks.onSelectLine(originalIndex, raw)
      })
      return
    }
    this.callbacks.onSelectLine(originalIndex, this.lines[originalIndex])
  }

  /** 보이는 구간만 렌더하고, 위/아래 패딩으로 전체 스크롤 높이를 유지한다(가상 스크롤). */
  private renderWindow(): void {
    const total = this.visible.length
    let start: number
    let end: number
    if (this.wrap && !this.streaming) {
      this.ensureWrapPrefix()
      const r = wrappedRange(this.body.scrollTop, this.body.clientHeight, this.wrapPrefix!, OVERSCAN)
      start = r.start
      end = r.end
      this.windowEl.style.paddingTop = `${r.padTop}px`
      this.windowEl.style.paddingBottom = `${r.padBottom}px`
    } else {
      const r = visibleRange(this.body.scrollTop, this.body.clientHeight, ROW_HEIGHT, total, OVERSCAN)
      start = r.start
      end = r.end
      this.windowEl.style.paddingTop = `${start * ROW_HEIGHT}px`
      this.windowEl.style.paddingBottom = `${Math.max(0, total - end) * ROW_HEIGHT}px`
    }

    // 스트림: 보이는 구간의 미캐시 라인을 디스크에서 가져온 뒤 재렌더(채움). (TODO_EXTRA C)
    if (this.streaming) {
      const need: number[] = []
      for (let i = start; i < end; i += 1) {
        const oi = this.visible[i]
        if (!this.windowCache.has(oi)) need.push(oi)
      }
      if (need.length > 0) {
        const token = ++this.windowToken
        void window.codetree.logLines(this.streamId, need).then((texts) => {
          need.forEach((oi, k) => this.windowCache.set(oi, texts[k] ?? ''))
          if (token === this.windowToken) this.renderWindow()
        })
      }
    }

    const frag = document.createDocumentFragment()
    for (let i = start; i < end; i += 1) {
      const originalIndex = this.visible[i]
      const fields = this.fieldsFor(originalIndex)
      const row = document.createElement('div')
      row.className = fields ? `logview__row level-${fields.level}` : 'logview__row'
      if (this.related.has(originalIndex)) row.classList.add('is-related')
      if (this.matchPos >= 0 && this.matches[this.matchPos] === originalIndex) {
        row.classList.add('is-match-current')
      } else if (this.matchSet.has(originalIndex)) {
        row.classList.add('is-match')
      }
      if (originalIndex === this.selectedLine) row.classList.add('is-selected')
      row.addEventListener('click', () => this.emitSelect(originalIndex))
      const ln = document.createElement('span')
      ln.className = 'logview__ln'
      ln.textContent = String(originalIndex + 1)
      const text = document.createElement('span')
      text.className = 'logview__text'
      text.textContent = this.line(originalIndex)
      row.append(ln, text)
      frag.appendChild(row)
    }
    this.windowEl.replaceChildren(frag)
  }
}
