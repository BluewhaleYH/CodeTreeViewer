import { focusTargetId, type SearchEntry } from './search-index'
import { DEFAULT_SEARCH_OPTIONS, searchEntries, type SearchOptions } from './search'
import { SearchHistory } from './search-history'

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
  private readonly history = new SearchHistory()
  // "보기 내" 검색: 현재 그래프에 표시 중인 노드로 결과를 한정한다. (TODO_MORE)
  private scopeToView = false
  private scopeProvider: (() => ReadonlySet<string>) | null = null

  private readonly input: HTMLInputElement
  private readonly results: HTMLElement

  constructor(
    private readonly host: HTMLElement,
    private readonly onPick: (entry: SearchEntry) => void
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
          <label title="현재 그래프에 보이는 노드 안에서만 검색(중첩)"><input type="checkbox" data-scope="view" /> 보기 내</label>
        </div>
      </div>
      <div class="search__results"></div>
    `
    this.input = this.host.querySelector('.search__input') as HTMLInputElement
    this.results = this.host.querySelector('.search__results') as HTMLElement
    ;(this.host.querySelector('input[data-scope="view"]') as HTMLInputElement).addEventListener(
      'change',
      (e) => {
        this.scopeToView = (e.target as HTMLInputElement).checked
        this.renderResults()
      }
    )

    this.input.addEventListener('input', () => {
      this.query = this.input.value
      this.renderResults()
    })
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.history.add(this.query)
    })
    this.host.querySelectorAll<HTMLInputElement>('input[data-opt]').forEach((el) => {
      el.addEventListener('change', () => {
        const key = el.dataset.opt as keyof SearchOptions
        this.options = { ...this.options, [key]: el.checked }
        this.renderResults()
      })
    })
  }

  /** 자체 검수(스크린샷)용 질의/히스토리 시드. */
  seedQuery(query: string): void {
    this.query = query
    this.input.value = query
    this.renderResults()
  }

  seedHistory(queries: string[]): void {
    ;[...queries].reverse().forEach((q) => this.history.add(q))
    this.renderResults()
  }

  /** "보기 내" 검색이 참조할, 현재 표시 중인 노드 id 집합 공급자. (TODO_MORE) */
  setScopeProvider(provider: () => ReadonlySet<string>): void {
    this.scopeProvider = provider
  }

  /** 검색 입력칸으로 포커스를 이동하고 전체 선택한다(Ctrl+F). (TODO_EXTRA D-단축키) */
  focus(): void {
    this.input.focus()
    this.input.select()
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

    // 빈 질의: 최근 검색어(히스토리) 표시. (05 §7)
    if (this.query.trim() === '') {
      const recent = this.history.recent()
      if (recent.length === 0) {
        this.results.classList.remove('is-open')
        return
      }
      this.results.classList.add('is-open')
      const header = document.createElement('div')
      header.className = 'search__empty'
      header.textContent = '최근 검색'
      this.results.appendChild(header)
      for (const q of recent) {
        const row = document.createElement('button')
        row.className = 'search__row'
        row.addEventListener('click', () => {
          this.query = q
          this.input.value = q
          this.input.focus()
          this.renderResults()
        })
        const icon = document.createElement('span')
        icon.className = 'search__icon'
        icon.textContent = '↩'
        const name = document.createElement('span')
        name.className = 'search__name'
        name.textContent = q
        row.append(icon, name)
        this.results.appendChild(row)
      }
      return
    }

    const matches = this.scopedEntries(searchEntries(this.index, this.query, this.options))
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
      row.addEventListener('click', () => {
        this.history.add(this.query)
        this.onPick(entry)
      })

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

  /**
   * "보기 내"가 켜져 있으면 현재 표시 중인 노드로 결과를 한정한다. (TODO_MORE)
   * 함수 항목은 소속 파일 노드가 보일 때(또는 그 함수 노드 자체가 보일 때) 포함한다.
   */
  private scopedEntries(matches: readonly SearchEntry[]): readonly SearchEntry[] {
    if (!this.scopeToView || !this.scopeProvider) return matches
    const scope = this.scopeProvider()
    if (scope.size === 0) return matches
    return matches.filter((e) => scope.has(e.id) || scope.has(focusTargetId(e)))
  }
}
