import { defaultSettings, normalizeExcludeDirs, type AppSettings } from '../../../shared/settings'

/**
 * 설정 모달. (TODO_EXTRA D)
 * 현재는 스캔 제외 디렉터리 편집(칩 추가/삭제 + 기본값 복원). 저장 시 콜백으로 통지한다.
 */
export class SettingsView {
  private overlay: HTMLElement | null = null

  constructor(private readonly onSave: (settings: AppSettings) => void) {}

  /** 현재 설정으로 모달을 연다(이미 열려 있으면 무시). */
  open(current: AppSettings): void {
    if (this.overlay) return
    let dirs = normalizeExcludeDirs(current.excludeDirs)

    const overlay = document.createElement('div')
    overlay.className = 'settings-overlay'
    overlay.innerHTML = `
      <div class="settings-modal" role="dialog" aria-label="설정">
        <h2 class="settings-modal__title">설정</h2>
        <section class="settings-section">
          <h3 class="settings-section__title">스캔 제외 디렉터리</h3>
          <p class="muted settings-section__desc">분석 시 건너뛸 디렉터리 이름입니다. 변경하면 열린 프로젝트를 다시 분석합니다.</p>
          <div class="settings-chips"></div>
          <div class="settings-add">
            <input class="settings-add__input" type="text" placeholder="디렉터리 이름 추가" spellcheck="false" />
            <button class="settings-add__btn" type="button">추가</button>
          </div>
        </section>
        <div class="settings-actions">
          <button class="settings-reset" type="button">기본값으로</button>
          <span class="settings-spacer"></span>
          <button class="settings-cancel" type="button">취소</button>
          <button class="settings-save" type="button">저장</button>
        </div>
      </div>
    `
    this.overlay = overlay
    document.body.appendChild(overlay)

    const chipsHost = overlay.querySelector('.settings-chips') as HTMLElement
    const addInput = overlay.querySelector('.settings-add__input') as HTMLInputElement

    const renderChips = (): void => {
      chipsHost.replaceChildren()
      if (dirs.length === 0) {
        const empty = document.createElement('span')
        empty.className = 'muted'
        empty.textContent = '(제외 없음)'
        chipsHost.appendChild(empty)
        return
      }
      for (const d of dirs) {
        const chip = document.createElement('span')
        chip.className = 'settings-chip'
        const label = document.createElement('span')
        label.textContent = d
        const remove = document.createElement('button')
        remove.className = 'settings-chip__remove'
        remove.type = 'button'
        remove.setAttribute('aria-label', `${d} 제거`)
        remove.textContent = '×'
        remove.addEventListener('click', () => {
          dirs = dirs.filter((x) => x !== d)
          renderChips()
        })
        chip.append(label, remove)
        chipsHost.appendChild(chip)
      }
    }

    const addDir = (): void => {
      const next = normalizeExcludeDirs([...dirs, addInput.value])
      dirs = next
      addInput.value = ''
      addInput.focus()
      renderChips()
    }

    ;(overlay.querySelector('.settings-add__btn') as HTMLElement).addEventListener('click', addDir)
    addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        addDir()
      }
    })
    ;(overlay.querySelector('.settings-reset') as HTMLElement).addEventListener('click', () => {
      dirs = [...defaultSettings().excludeDirs]
      renderChips()
    })
    ;(overlay.querySelector('.settings-cancel') as HTMLElement).addEventListener('click', () =>
      this.close()
    )
    ;(overlay.querySelector('.settings-save') as HTMLElement).addEventListener('click', () => {
      this.onSave({ version: current.version, excludeDirs: normalizeExcludeDirs(dirs) })
      this.close()
    })
    // 배경 클릭/ESC로 닫기.
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close()
    })
    this.escHandler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') this.close()
    }
    window.addEventListener('keydown', this.escHandler)

    renderChips()
    addInput.focus()
  }

  private escHandler: ((e: KeyboardEvent) => void) | null = null

  close(): void {
    if (this.escHandler) {
      window.removeEventListener('keydown', this.escHandler)
      this.escHandler = null
    }
    this.overlay?.remove()
    this.overlay = null
  }
}
