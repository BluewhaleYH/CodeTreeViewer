import type { SearchEntry } from './search-index'
import { DEFAULT_SEARCH_OPTIONS, searchEntries, type SearchOptions } from './search'

/**
 * 검색 UI(영속 요소). (05 §2)
 * 입력/옵션 변경 시 인덱스를 매칭해 결과를 표시한다. 결과 클릭 → onPick(노드 id).
 * 매 렌더마다 재생성하지 않도록 main의 영속 컨테이너에 마운트한다.
 */

const MAX_RESULTS = 50

export class SearchView {
  private query = ''
  private options: SearchOptions = { ...DEFAULT_SEARCH_OPTIONS }
  private index: readonly SearchEntry[] = []
  private contextKey: string | null = null

  private readonly input: HTMLInputElement
  private readonly results: HTMLElement

  constructor(
    private readonly host: HTMLElement,
    private readonly onPick: (nodeId: string) => void
  ) {
    this.host.classList.add('searchbar')
    this.host.innerHTML = `
      <div class="search__box">
        <input class="search__input" type="text" placeholder="파일·함수 검색…" spellcheck="false" />
        <div class="search__options">
          <label><input type="checkbox" data-opt="caseSensitive" /> Aa</label>
          <label><input type="checkbox" data-opt="exact" /> 정확</label>
          <label><input type="checkbox" data-opt="includePath" /> 경로</label>
          <label><input type="checkbox" data-opt="fuzzy" /> 퍼지</label>
        </div>
      </div>
      <div class="search__results"></div>
    `
    this.input = this.host.querySelector('.search__input') as HTMLInputElement
    this.results = this.host.querySelector('.search__results') as HTMLElement

    this.input.addEventListener('input', () => {
      this.query = this.input.value
      this.renderResults()
    })
    this.host.querySelectorAll<HTMLInputElement>('input[data-opt]').forEach((el) => {
      el.addEventListener('change', () => {
        const key = el.dataset.opt as keyof SearchOptions
        this.options = { ...this.options, [key]: el.checked }
        this.renderResults()
      })
    })
  }

  /** 자체 검수(스크린샷)용 질의 시드. */
  seedQuery(query: string): void {
    this.query = query
    this.input.value = query
    this.renderResults()
  }

  /** 활성 탭의 검색 인덱스를 설정한다. 탭이 바뀌면 입력을 초기화한다. */
  setContext(contextKey: string, index: readonly SearchEntry[]): void {
    this.index = index
    if (this.contextKey !== contextKey) {
      this.contextKey = contextKey
      this.query = ''
      this.input.value = ''
    }
    this.renderResults()
  }

  private renderResults(): void {
    this.results.innerHTML = ''
    const matches = searchEntries(this.index, this.query, this.options)
    if (this.query.trim() === '') {
      this.results.classList.remove('is-open')
      return
    }
    this.results.classList.add('is-open')

    if (matches.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'search__empty'
      empty.textContent = '결과 없음'
      this.results.appendChild(empty)
      return
    }

    for (const entry of matches.slice(0, MAX_RESULTS)) {
      const row = document.createElement('button')
      row.className = 'search__row'
      row.addEventListener('click', () => this.onPick(entry.id))

      const icon = document.createElement('span')
      icon.className = 'search__icon'
      icon.textContent = entry.kind === 'function' ? 'ƒ' : '◻'

      const name = document.createElement('span')
      name.className = 'search__name'
      name.textContent = entry.name

      const path = document.createElement('span')
      path.className = 'search__path'
      path.textContent = entry.path

      row.append(icon, name, path)
      this.results.appendChild(row)
    }

    if (matches.length > MAX_RESULTS) {
      const more = document.createElement('div')
      more.className = 'search__empty'
      more.textContent = `…외 ${matches.length - MAX_RESULTS}개`
      this.results.appendChild(more)
    }
  }
}
