import cytoscape, { type Core, type LayoutOptions, type StylesheetStyle } from 'cytoscape'
import dagre from 'cytoscape-dagre'

// 방향성 계층 레이아웃(dagre)을 1회 등록. 관계도가 의존 방향(위→아래)을 반영하도록. (TODO_MORE)
cytoscape.use(dagre)
import type { CodeGraph } from '../../../shared/graph'
import type { TabState, ViewMode } from '../tabs/tab-store'
import { backtraceElements, compareElements, toCytoscapeElements } from './to-cytoscape'
import { buildChildAdjacency, hiddenNodeIds } from './tree-collapse'
import { DEFAULT_MAX_INITIAL_NODES, selectInitialView } from './initial-view'
import { buildNeighborAdjacency, expandableNodeIds } from './expand'
import { assignDomainColors } from './domain-colors'
import { backtraceSubgraph, buildCallerAdjacency, expandableCallers } from './backtrace'

/** Ctrl+휠 줌 감도(높을수록 한 번에 더 크게 확대/축소). cytoscape 기본 1.0. (TODO_MORE) */
const WHEEL_SENSITIVITY = 1.0

/**
 * 그래프 캔버스(Cytoscape) 생명주기 + 상호작용. (03 §2~§5, §8)
 * 상호작용(D17): 한 번 클릭 = 선택 + 직접 부모/자식(1-홉) 표시. 더블클릭 = 관계도 더 깊게 확장 / 트리 접기·펼치기.
 * 선택은 뷰 모드 전환 후에도 유지된다(03 §5.2).
 */

const DOUBLE_TAP_MS = 300

const GRAPH_STYLE: StylesheetStyle[] = [
  {
    selector: 'node',
    style: {
      'background-color': 'data(color)',
      label: 'data(label)',
      'font-size': 7,
      color: '#9aa0a6',
      width: 12,
      height: 12,
      'text-valign': 'bottom',
      'text-halign': 'center',
      'min-zoomed-font-size': 7
    }
  },
  {
    selector: 'node[external="true"]',
    style: { shape: 'diamond', width: 10, height: 10 }
  },
  {
    // 역추적 모드의 함수 노드(둥근 사각형으로 파일 노드와 구분). (M10_2)
    selector: 'node[kind="function"]',
    style: { shape: 'round-rectangle', width: 16, height: 11 }
  },
  { selector: 'node.collapsed', style: { 'border-width': 2, 'border-color': '#e2b341' } },
  {
    selector: 'node.expandable',
    style: { 'border-width': 2, 'border-color': '#e2b341', 'border-style': 'dashed' }
  },
  {
    selector: 'node.selected',
    style: { 'border-width': 3, 'border-color': '#ffffff', 'border-style': 'solid' }
  },
  { selector: '.dimmed', style: { opacity: 0.16 } },
  {
    // 재분석 영향(추가/변경) 노드 강조. (06 §5, M12_4)
    selector: 'node.impacted',
    style: { 'border-width': 3, 'border-color': '#5fd38a', 'border-style': 'double' }
  },
  // 전/후 비교 모드 상태 색. (03, 06 §5, M14_3)
  {
    selector: 'node[status="added"]',
    style: { 'background-color': '#5fd38a', 'border-width': 2, 'border-color': '#5fd38a' }
  },
  {
    selector: 'node[status="removed"]',
    style: {
      'background-color': '#e06c75',
      'border-width': 2,
      'border-color': '#e06c75',
      opacity: 0.55
    }
  },
  {
    selector: 'edge[status="added"]',
    style: { 'line-color': '#5fd38a', 'target-arrow-color': '#5fd38a' }
  },
  {
    selector: 'edge[status="removed"]',
    style: { 'line-color': '#e06c75', 'target-arrow-color': '#e06c75', 'line-style': 'dotted' }
  },
  {
    selector: 'edge',
    style: {
      width: 1,
      'line-color': '#3c3c3c',
      'target-arrow-color': '#3c3c3c',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.6,
      'curve-style': 'bezier'
    }
  },
  {
    // 호출(function-call) 엣지: 파일 의존성과 구분되는 색/점선. (M10_2)
    selector: 'edge[type="function-call"]',
    style: { 'line-color': '#6b8cce', 'target-arrow-color': '#6b8cce', 'line-style': 'dashed' }
  },
  {
    // 상속(inheritance) 엣지: 흰 속빈 삼각형 화살표(UML 상속 관례). (TODO_MORE)
    selector: 'edge[type="inheritance"]',
    style: {
      'line-color': '#cdd3da',
      'target-arrow-color': '#cdd3da',
      'target-arrow-shape': 'triangle-tee',
      'arrow-scale': 0.9,
      width: 1.5
    }
  },
  {
    // 파일 간 호출(file-call) 집계 엣지: 호출 색 점선. (TODO_MORE)
    selector: 'edge[type="file-call"]',
    style: { 'line-color': '#6b8cce', 'target-arrow-color': '#6b8cce', 'line-style': 'dashed' }
  },
  {
    // JNI 경계 엣지: 보라색 굵은 점선(Java ↔ 네이티브). (M14_1)
    selector: 'edge[type="jni-boundary"]',
    style: {
      'line-color': '#b98cff',
      'target-arrow-color': '#b98cff',
      'line-style': 'dashed',
      width: 2
    }
  }
]

/** 역추적(호출 체인) 레이아웃: 위계적 배치(호출처 위 → 피호출 아래). */
const backtraceLayout: LayoutOptions = {
  name: 'breadthfirst',
  directed: true,
  spacingFactor: 1.1,
  animate: false
}

// 관계도: 방향성 계층(dagre). 부모(의존하는 쪽)가 위, 자식이 아래로 흐른다. (TODO_MORE)
const graphLayout = {
  name: 'dagre',
  rankDir: 'TB',
  nodeSep: 26,
  rankSep: 48,
  fit: true,
  padding: 30,
  animate: false
} as unknown as LayoutOptions

const treeLayout: LayoutOptions = {
  name: 'breadthfirst',
  directed: true,
  spacingFactor: 1.0,
  grid: false,
  animate: false
}

function layoutFor(mode: ViewMode): LayoutOptions {
  return mode === 'tree' ? treeLayout : graphLayout
}

export class GraphView {
  private cy: Core | null = null
  private currentKey: string | null = null
  private mode: ViewMode = 'graph'

  private fullGraph: CodeGraph = { nodes: [], edges: [] }
  private domainColors: Map<string, string> = new Map()
  private neighborAdjacency: Map<string, Set<string>> = new Map()
  private childAdjacency: Map<string, string[]> = new Map()
  private displayed = new Set<string>()
  private readonly collapsed = new Set<string>()

  private selectedId: string | null = null
  private lastTapId: string | null = null
  private lastTapTime = 0

  // 역추적(backtrace) 상태. (M10_2)
  private backtraceId: string | null = null
  private callerAdjacency: Map<string, string[]> = new Map()

  // 재분석 영향 범위 강조. (M12_4)
  private impactKey: string | null = null

  constructor(
    private readonly host: HTMLElement,
    private readonly onSelectNode?: (nodeId: string | null) => void,
    private readonly maxInitialNodes: number = DEFAULT_MAX_INITIAL_NODES
  ) {}

  sync(tab: TabState | null): void {
    const graph = tab && tab.analysis.status === 'done' ? tab.analysis.graph : null
    if (!tab || !graph || tab.projectPath === null) {
      this.clear()
      return
    }
    // 전/후 비교 모드: 스냅샷 vs 현재 합집합. (03, 06 §5, M14_3)
    if (tab.view.compare && tab.snapshot) {
      const key = `${tab.id}:cmp`
      if (this.currentKey === key && this.cy && this.fullGraph === graph) return
      this.currentKey = key
      this.drawCompare(tab.snapshot, graph)
      return
    }
    // 역추적 모드: 선택 함수의 호출처 체인을 표시한다. (M10_2)
    if (tab.view.backtrace) {
      const key = `${tab.id}:bt:${tab.view.backtrace}`
      if (this.currentKey === key && this.cy) return
      this.currentKey = key
      this.drawBacktrace(graph, tab.view.backtrace)
      return
    }
    const key = `${tab.id}:${tab.view.mode}`
    // 같은 뷰 + 같은 그래프: 선택만 반영. 재분석 등으로 그래프가 바뀌면 다시 그린다. (M12_3)
    if (this.currentKey === key && this.cy && this.fullGraph === graph) {
      this.syncSelection(tab.view.selectedNodeId)
      return
    }
    this.currentKey = key
    this.draw(graph, tab.view.mode, tab.view.selectedNodeId)
  }

  /** 전/후 비교 그래프를 그린다(합집합 + 상태 색). (03, 06 §5, M14_3) */
  private drawCompare(before: CodeGraph, after: CodeGraph): void {
    this.destroyCy()
    this.host.style.display = 'block'
    this.backtraceId = null
    this.impactKey = null
    this.fullGraph = after
    this.domainColors = assignDomainColors(after)
    const cy = cytoscape({
      container: this.host,
      elements: compareElements(before, after, this.domainColors),
      style: GRAPH_STYLE,
      layout: layoutFor('graph'),
      wheelSensitivity: WHEEL_SENSITIVITY,
      minZoom: 0.05,
      maxZoom: 4
    })
    this.cy = cy
  }

  /**
   * 역추적 뷰를 그린다. 선택 함수(마지막 노드) + 직접 호출처(1-홉)를 표시하고,
   * 호출처 노드 클릭 시 그 위 호출처를 점진 확장한다. (02 §6, 03 §5.3, D17 점진 확장)
   */
  private drawBacktrace(graph: CodeGraph, functionId: string): void {
    this.destroyCy()
    this.host.style.display = 'block'
    this.backtraceId = functionId
    this.fullGraph = graph
    this.domainColors = assignDomainColors(graph)
    this.callerAdjacency = buildCallerAdjacency(graph)

    const callers = this.callerAdjacency.get(functionId) ?? []
    this.displayed = new Set([functionId, ...callers])

    const cy = cytoscape({
      container: this.host,
      elements: backtraceElements(backtraceSubgraph(this.displayed, graph), this.domainColors),
      style: GRAPH_STYLE,
      layout: backtraceLayout,
      wheelSensitivity: WHEEL_SENSITIVITY,
      minZoom: 0.05,
      maxZoom: 4
    })
    this.cy = cy

    // 호출처 노드 클릭 = 그 위 호출처 점진 확장.
    cy.on('tap', 'node', (event) => this.revealCallers(event.target.id()))
    this.markBacktraceExpandable()
    cy.getElementById(functionId).addClass('selected') // 마지막 노드 강조
  }

  /** 노드의 직접 호출처(1-홉)를 드러낸다(점진 확장). (M10_2) */
  private revealCallers(id: string): void {
    const cy = this.cy
    if (!cy) return
    const callers = this.callerAdjacency.get(id) ?? []
    const added = callers.filter((c) => !this.displayed.has(c))
    if (added.length === 0) return

    added.forEach((c) => this.displayed.add(c))
    const sub = backtraceSubgraph(this.displayed, this.fullGraph)
    const addedSet = new Set(added)
    const newNodes = sub.nodes.filter((n) => addedSet.has(n.id))
    const newEdges = sub.edges.filter(
      (e) => (addedSet.has(e.from) || addedSet.has(e.to)) && cy.getElementById(e.id).length === 0
    )
    cy.add(backtraceElements({ nodes: newNodes, edges: newEdges }, this.domainColors))
    cy.layout(backtraceLayout).run()
    this.markBacktraceExpandable()
    if (this.backtraceId) cy.getElementById(this.backtraceId).addClass('selected')
  }

  /** 재분석 영향 노드를 강조한다(추가/변경). 파일 그래프 모드에서만 의미. (06 §5, M12_4) */
  setImpact(nodeIds: readonly string[]): void {
    const key = nodeIds.join('|')
    if (this.impactKey === key) return
    this.impactKey = key
    const cy = this.cy
    if (!cy) return
    const wanted = new Set(nodeIds)
    cy.nodes().forEach((node) => {
      node.toggleClass('impacted', wanted.has(node.id()))
    })
  }

  private markBacktraceExpandable(): void {
    const cy = this.cy
    if (!cy) return
    const expandable = expandableCallers(this.displayed, this.callerAdjacency)
    cy.nodes().forEach((node) => {
      node.toggleClass('expandable', expandable.has(node.id()))
    })
  }

  /**
   * store의 선택을 캔버스에 맞춘다(통지 없이). 검색 등 외부 선택 시 사용.
   * 숨은 노드면 드러내고(reveal), 선택 강조 후 화면 중앙으로 이동한다. (03 §10, M7_4)
   */
  private syncSelection(selectedNodeId: string | null): void {
    if (this.selectedId === selectedNodeId) return
    if (selectedNodeId && !this.displayed.has(selectedNodeId)) {
      this.revealNode(selectedNodeId)
    }
    const target = selectedNodeId && this.displayed.has(selectedNodeId) ? selectedNodeId : null
    this.selectedId = target
    this.applySelectedStyle()
    if (target) this.centerOn(target)
  }

  /** 단일 노드(파일/외부)를 드러낸다(검색 포커스 등). */
  private revealNode(id: string): void {
    const cy = this.cy
    if (!cy || this.displayed.has(id)) return
    const node = this.fullGraph.nodes.find((n) => n.id === id && n.kind !== 'function')
    if (!node) return
    this.displayed.add(id)
    const newEdges = this.fullGraph.edges.filter(
      (e) =>
        this.displayed.has(e.from) &&
        this.displayed.has(e.to) &&
        cy.getElementById(e.id).length === 0
    )
    cy.add(toCytoscapeElements({ nodes: [node], edges: newEdges }, this.domainColors))
    cy.layout(layoutFor(this.mode)).run()
    this.markExpandable()
  }

  private centerOn(id: string): void {
    const cy = this.cy
    if (!cy) return
    const node = cy.getElementById(id)
    if (node.length > 0) cy.animate({ center: { eles: node } }, { duration: 200 })
  }

  private draw(graph: CodeGraph, mode: ViewMode, selectedNodeId: string | null): void {
    this.destroyCy()
    this.host.style.display = 'block'
    this.backtraceId = null
    this.impactKey = null // 재그리기 후 영향 강조 재적용 필요
    this.mode = mode
    this.collapsed.clear()
    this.fullGraph = graph
    this.neighborAdjacency = buildNeighborAdjacency(graph)
    this.domainColors = assignDomainColors(graph)

    const view = selectInitialView(graph, this.maxInitialNodes)
    this.displayed = new Set(view.graph.nodes.map((n) => n.id))
    this.childAdjacency = buildChildAdjacency(view.graph)

    const cy = cytoscape({
      container: this.host,
      elements: toCytoscapeElements(view.graph, this.domainColors),
      style: GRAPH_STYLE,
      layout: layoutFor(mode),
      wheelSensitivity: WHEEL_SENSITIVITY,
      minZoom: 0.05,
      maxZoom: 4
    })
    this.cy = cy

    this.registerTapHandlers()
    if (mode === 'graph') this.markExpandable()

    // 모드 전환 후 선택 유지. (03 §5.2)
    this.selectedId = selectedNodeId && this.displayed.has(selectedNodeId) ? selectedNodeId : null
    this.applySelectedStyle()
  }

  private registerTapHandlers(): void {
    const cy = this.cy
    if (!cy) return

    cy.on('tap', 'node', (event) => {
      const id = event.target.id()
      const now = Date.now()
      const isDouble = id === this.lastTapId && now - this.lastTapTime < DOUBLE_TAP_MS
      this.lastTapId = id
      this.lastTapTime = now

      // 한 번 클릭: 선택 + 직접 이웃(1-홉) 표시.
      this.selectNode(id)
      if (this.mode === 'graph') this.reveal(id, 1)

      if (isDouble) {
        // 더블클릭: 관계도는 더 깊게(2-홉), 트리는 접기/펼치기.
        if (this.mode === 'tree') this.toggleCollapse(id)
        else this.reveal(id, 2)
      }
    })

    cy.on('tap', (event) => {
      if (event.target === cy) this.selectNode(null)
    })
  }

  private selectNode(id: string | null): void {
    if (this.selectedId === id) return
    this.selectedId = id
    this.applySelectedStyle()
    this.onSelectNode?.(id)
  }

  /**
   * 선택 노드 강조 + 1-홉 이웃/엣지 강조, 나머지 디엠퍼사이즈. (03 §9, M6_3)
   */
  private applySelectedStyle(): void {
    const cy = this.cy
    if (!cy) return
    cy.elements().removeClass('selected dimmed')
    if (!this.selectedId) return
    const node = cy.getElementById(this.selectedId)
    if (node.length === 0) return
    node.addClass('selected')
    // 선택 노드 + 직접 이웃 + 연결 엣지를 제외한 나머지를 흐리게.
    cy.elements().difference(node.closedNeighborhood()).addClass('dimmed')
  }

  /** 노드의 hops-홉 이내 숨은 이웃을 드러낸다. (1-홉=직접 부모/자식) */
  private reveal(id: string, hops: number): void {
    const cy = this.cy
    if (!cy) return

    const added = new Set<string>()
    let frontier = [id]
    for (let depth = 0; depth < hops; depth += 1) {
      const next: string[] = []
      for (const nodeId of frontier) {
        for (const neighbor of this.neighborAdjacency.get(nodeId) ?? []) {
          if (!this.displayed.has(neighbor) && !added.has(neighbor)) {
            added.add(neighbor)
          }
          next.push(neighbor)
        }
      }
      frontier = next
    }
    if (added.size === 0) return

    added.forEach((n) => this.displayed.add(n))
    const addedNodes = this.fullGraph.nodes.filter((n) => added.has(n.id))
    const newEdges = this.fullGraph.edges.filter(
      (e) =>
        this.displayed.has(e.from) &&
        this.displayed.has(e.to) &&
        cy.getElementById(e.id).length === 0
    )
    cy.add(toCytoscapeElements({ nodes: addedNodes, edges: newEdges }, this.domainColors))
    cy.layout(layoutFor(this.mode)).run()
    this.markExpandable()
    this.applySelectedStyle()
  }

  private toggleCollapse(id: string): void {
    const cy = this.cy
    if (!cy) return
    if (this.collapsed.has(id)) this.collapsed.delete(id)
    else this.collapsed.add(id)
    cy.getElementById(id).toggleClass('collapsed', this.collapsed.has(id))

    const hidden = hiddenNodeIds(this.collapsed, this.childAdjacency)
    cy.batch(() => {
      cy.nodes().forEach((node) => {
        node.style('display', hidden.has(node.id()) ? 'none' : 'element')
      })
      cy.edges().forEach((edge) => {
        const hide = hidden.has(edge.source().id()) || hidden.has(edge.target().id())
        edge.style('display', hide ? 'none' : 'element')
      })
    })
  }

  private markExpandable(): void {
    const cy = this.cy
    if (!cy) return
    const expandable = expandableNodeIds(this.displayed, this.neighborAdjacency)
    cy.nodes().forEach((node) => {
      node.toggleClass('expandable', expandable.has(node.id()))
    })
  }

  private clear(): void {
    this.destroyCy()
    this.currentKey = null
    this.selectedId = null
    this.backtraceId = null
    this.impactKey = null
    this.host.style.display = 'none'
  }

  private destroyCy(): void {
    if (this.cy) {
      this.cy.destroy()
      this.cy = null
    }
  }
}
