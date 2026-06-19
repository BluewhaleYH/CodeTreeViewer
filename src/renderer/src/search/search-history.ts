/**
 * 검색 히스토리(최근 검색어). (05 §7)
 * 전역·최대 N개·메모리 보관(영속화는 추후 — 세션 M8 후보). 중복은 앞으로 끌어올린다.
 */
export class SearchHistory {
  private items: string[] = []

  constructor(private readonly max = 10) {}

  add(query: string): void {
    const q = query.trim()
    if (!q) return
    this.items = [q, ...this.items.filter((item) => item !== q)].slice(0, this.max)
  }

  recent(): readonly string[] {
    return this.items
  }

  clear(): void {
    this.items = []
  }
}
