import cytoscape, { type Core, type LayoutOptions, type StylesheetStyle } from 'cytoscape'
import dagre from 'cytoscape-dagre'

// 방향성 계층 레이아웃(dagre)을 1회 등록. 관계도가 의존 방향(위→아래)을 반영하도록. (TODO_MORE)
cytoscape.use(dagre)
import type { CodeGraph, EdgeType } from '../../../shared/graph'
import type { TabState, ViewMode } from '../tabs/tab-store'
import { backtraceElements, compareElements, toCytoscapeElements } from './to-cytoscape'
import { buildChildAdjacency, hiddenNodeIds } from './tree-collapse'
import { DEFAULT_MAX_INITIAL_NODES, selectFocusView, selectInitialView } from './initial-view'
import { buildNeighborAdjacency, expandableNodeIds } from './expand'
import { assignDomainColors } from './domain-colors'
import {
  backtraceTree,
  buildCallerAdjacency,
  callersUpToDepth,
  expandableCallers,
  FILE_BACKTRACE_EDGES,
  FUNCTION_BACKTRACE_EDGES
} from './backtrace'

/** 역추적 진입 시 초기 표시 단계(호출처 체인 깊이). 이후 노드 클릭으로 더 확장. (TODO_MORE) */
const BACKTRACE_INITIAL_DEPTH = 6

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
      'font-size': 8,
      color: '#cdd3da',
      width: 12,
      height: 12,
      'text-valign': 'bottom',
      'text-halign': 'center',
      'text-margin-y': 2,
      // 라벨 겹침 완화: 줄바꿈(\n)/긴 이름 줄임 + 어두운 반투명 배경으로 가독성 확보. (TODO_MORE)
      'text-wrap': 'wrap',
      'text-max-width': '96px',
      'text-background-color': '#1e1e1e',
      'text-background-opacity': 0.7,
      'text-background-padding': '2px',
      'text-background-shape': 'roundrectangle',
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
  { selector: '.dimmed', style: { opacity: 0.08 } },
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
  spacingFactor: 1.7, // 라벨(함수명+파일명) 겹침 완화. (TODO_MORE)
  // 역추적은 체인 전체(선택 노드 → 위로 거슬러 올라가는 호출처들)가 한눈에 보이도록 전체 fit.
  // (선택 노드만 줌하면 위쪽 호출처 체인이 화면 밖으로 잘려 '자매 노드 없음'을 확인하기 어려움.) (TODO_MORE)
  fit: true,
  padding: 40,
  animate: false
}

// 관계도: 방향성 계층(dagre). 부모(의존하는 쪽)가 위, 자식이 아래로 흐른다. (TODO_MORE)
const graphLayout = {
  name: 'dagre',
  rankDir: 'TB',
  nodeSep: 50, // 라벨 겹침 완화(같은 단계 가로 간격). (TODO_MORE)
  rankSep: 70,
  fit: true,
  padding: 30,
  animate: false
} as unknown as LayoutOptions

const treeLayout: LayoutOptions = {
  name: 'breadthfirst',
  directed: true,
  spacingFactor: 1.5, // 라벨 겹침 완화. (TODO_MORE)
  grid: false,
  animate: false
}

function layoutFor(mode: ViewMode): LayoutOptions {
  return mode === 'tree' ? treeLayout : graphLayout
}

/** 증분 갱신(이웃/호출처 확장)용 레이아웃: 화면을 다시 맞추지 않아 줌/위치를 보존한다. (TODO_MORE) */
function incrementalLayoutFor(mode: ViewMode): LayoutOptions {
  return { ...layoutFor(mode), fit: false } as unknown as LayoutOptions
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
  // 현재 역추적이 따라가는 엣지 종류(함수=호출, 파일=의존/호출). (TODO_MORE)
  private backtraceEdges: readonly EdgeType[] = FUNCTION_BACKTRACE_EDGES

  // 재분석 영향 범위 강조. (M12_4)
  private impactKey: string | null = null

  constructor(
    private readonly host: HTMLElement,
    private readonly onSelectNode?: (nodeId: string | null) => void,
    private readonly maxInitialNodes: number = DEFAULT_MAX_INITIAL_NODES,
    // 역추적 모드에서 노드를 클릭하면 선택을 바꾸지 않고 해당 소스를 코드 패널에 연다. (TODO_MORE)
    private readonly onOpenSource?: (nodeId: string) => void
  ) {}

  /** 현재 캔버스에 표시 중인 노드 id 집합(검색 범위 한정용). (TODO_MORE) */
  getDisplayedIds(): ReadonlySet<string> {
    return this.displayed
  }

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
    // 포커스 모드: 검색에서 고른 파일을 중심으로 그래프/트리를 다시 그린다. (TODO_MORE)
    if (tab.view.focus) {
      const key = `${tab.id}:focus:${tab.view.focus}:${tab.view.mode}`
      if (this.currentKey === key && this.cy && this.fullGraph === graph) {
        this.syncSelection(tab.view.selectedNodeId)
        return
      }
      this.currentKey = key
      this.drawFocus(graph, tab.view.focus, tab.view.mode, tab.view.selectedNodeId)
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
  private drawBacktrace(graph: CodeGraph, rootId: string): void {
    this.destroyCy()
    this.host.style.display = 'block'
    this.backtraceId = rootId
    this.fullGraph = graph
    this.domainColors = assignDomainColors(graph)
    // 함수 노드는 호출 관계로, 파일 노드는 의존/호출 관계로 거슬러 올라간다. (TODO_MORE)
    const rootNode = graph.nodes.find((n) => n.id === rootId)
    this.backtraceEdges =
      rootNode?.kind === 'function' ? FUNCTION_BACKTRACE_EDGES : FILE_BACKTRACE_EDGES
    this.callerAdjacency = buildCallerAdjacency(graph, this.backtraceEdges)

    // 초기에 호출처/의존처 체인을 여러 단계까지 표시(이후 노드 클릭으로 더 확장). (TODO_MORE)
    this.displayed = callersUpToDepth(rootId, this.callerAdjacency, BACKTRACE_INITIAL_DEPTH)

    const cy = cytoscape({
      container: this.host,
      elements: backtraceElements(
        backtraceTree(this.displayed, graph, rootId, this.callerAdjacency, this.backtraceEdges),
        this.domainColors
      ),
      style: GRAPH_STYLE,
      wheelSensitivity: WHEEL_SENSITIVITY,
      minZoom: 0.05,
      maxZoom: 4
    })
    this.cy = cy

    // 노드 클릭 = 해당 소스를 코드 패널에 열고(선택/모드는 유지) 그 위 호출처를 점진 확장. (TODO_MORE)
    cy.on('tap', 'node', (event) => {
      const id = event.target.id()
      this.onOpenSource?.(id)
      this.revealCallers(id)
    })
    this.markBacktraceExpandable()
    cy.getElementById(rootId).addClass('selected') // 마지막 노드 강조(유일한 리프)
    // 체인 전체가 보이도록 레이아웃 자체의 fit:true를 사용(선택 노드만 줌하지 않음). (TODO_MORE)
    cy.layout(backtraceLayout).run()
  }

  /** 노드의 직접 호출처(1-홉)를 드러낸다(점진 확장). (M10_2) */
  private revealCallers(id: string): void {
    const cy = this.cy
    if (!cy) return
    const callers = this.callerAdjacency.get(id) ?? []
    const added = callers.filter((c) => !this.displayed.has(c))
    if (added.length === 0) return

    added.forEach((c) => this.displayed.add(c))
    const rootId = this.backtraceId ?? id
    const sub = backtraceTree(
      this.displayed,
      this.fullGraph,
      rootId,
      this.callerAdjacency,
      this.backtraceEdges
    )
    const addedSet = new Set(added)
    const newNodes = sub.nodes.filter((n) => addedSet.has(n.id))
    const newEdges = sub.edges.filter(
      (e) => (addedSet.has(e.from) || addedSet.has(e.to)) && cy.getElementById(e.id).length === 0
    )
    cy.add(backtraceElements({ nodes: newNodes, edges: newEdges }, this.domainColors))
    cy.layout({ ...backtraceLayout, fit: false } as unknown as LayoutOptions).run()
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
    if (target) this.fitToSelection(target)
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

  /** 선택 노드 + 직접 이웃이 화면의 약 80%를 채우도록 맞춘다(가장자리에 여백). (TODO_MORE) */
  private fitToSelection(id: string): void {
    const cy = this.cy
    if (!cy) return
    const node = cy.getElementById(id)
    if (node.length === 0) return
    const padding = Math.round(Math.min(cy.width(), cy.height()) * 0.1)
    cy.animate({ fit: { eles: node.closedNeighborhood(), padding } }, { duration: 220 })
  }

  /**
   * 포커스 뷰를 그린다. 중심 파일에서 양방향(의존/피의존)으로 가까운 노드를 모아
   * 그 파일을 화면 중앙에 두고 다시 그린다. 이후 노드 클릭으로 더 확장된다. (TODO_MORE)
   * 같은 거리의 노드는 어느 파일이든 모두 포함된다(교차 파일 호출처도 표시).
   */
  private drawFocus(
    graph: CodeGraph,
    focusId: string,
    mode: ViewMode,
    selectedNodeId: string | null
  ): void {
    this.destroyCy()
    this.host.style.display = 'block'
    this.backtraceId = null
    this.impactKey = null
    this.mode = mode
    this.collapsed.clear()
    this.fullGraph = graph
    this.neighborAdjacency = buildNeighborAdjacency(graph)
    this.domainColors = assignDomainColors(graph)

    const view = selectFocusView(graph, focusId, this.maxInitialNodes)
    if (view.nodes.length === 0) {
      // 중심이 렌더 노드가 아니면(예: 함수) 일반 뷰로 폴백.
      this.draw(graph, mode, selectedNodeId)
      return
    }
    this.displayed = new Set(view.nodes.map((n) => n.id))
    this.childAdjacency = buildChildAdjacency(view)

    const cy = cytoscape({
      container: this.host,
      elements: toCytoscapeElements(view, this.domainColors),
      style: GRAPH_STYLE,
      wheelSensitivity: WHEEL_SENSITIVITY,
      minZoom: 0.05,
      maxZoom: 4
    })
    this.cy = cy

    this.registerTapHandlers()
    if (mode === 'graph') this.markExpandable()

    // 선택은 중심 파일(없으면 그대로). 선택 강조 + 비이웃 흐림.
    this.selectedId =
      selectedNodeId && this.displayed.has(selectedNodeId) ? selectedNodeId : focusId
    this.applySelectedStyle()

    // 레이아웃 완료 후 중심 파일로 ~80% 줌(중앙 배치).
    const layout = cy.layout(layoutFor(mode))
    layout.one('layoutstop', () => this.fitToSelection(focusId))
    layout.run()
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

    // 레이아웃을 명시 실행하고, 완료 후 초기 포커스를 잡는다. (TODO_MORE)
    // - 선택 노드가 있으면 그 노드로 ~80% 줌.
    // - 없으면 전체 그래프를 보이게 맞추되, ingoing이 가장 많은 노드를 시작 기준으로 강조.
    const layout = cy.layout(layoutFor(mode))
    layout.one('layoutstop', () => this.applyInitialFocus(view.graph))
    layout.run()
  }

  /**
   * 초기 포커스: 선택 노드가 표시 중이면 그 노드로 줌, 아니면 전체를 보이게 맞추고
   * ingoing(피의존)이 가장 많은 노드를 시작 기준으로 강조한다. (TODO_MORE)
   */
  private applyInitialFocus(graph: CodeGraph): void {
    const cy = this.cy
    if (!cy) return
    if (this.selectedId && this.displayed.has(this.selectedId)) {
      this.fitToSelection(this.selectedId)
      return
    }
    // 전체 노드가 보이도록 맞춘 뒤, 가장 많이 의존받는 노드를 강조(시작 기준).
    const padding = Math.round(Math.min(cy.width(), cy.height()) * 0.06)
    cy.fit(undefined, padding)
    const startId = this.mostIncomingId(graph)
    if (startId) cy.getElementById(startId).addClass('selected')
  }

  /** 표시 중인 렌더 노드(파일/외부) 중 ingoing 엣지가 가장 많은 노드 id. (TODO_MORE) */
  private mostIncomingId(graph: CodeGraph): string | null {
    const inCount = new Map<string, number>()
    for (const e of graph.edges) {
      if (this.displayed.has(e.to)) inCount.set(e.to, (inCount.get(e.to) ?? 0) + 1)
    }
    let best: string | null = null
    let bestN = -1
    for (const n of graph.nodes) {
      if (n.kind === 'function' || !this.displayed.has(n.id)) continue
      const c = inCount.get(n.id) ?? 0
      if (c > bestN) {
        bestN = c
        best = n.id
      }
    }
    return best
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

      // 한 번 클릭: 선택 + 관련 in/out 강조(나머지 흐리게) + 직접 이웃(1-홉) 표시.
      // 줌은 그대로 둬서 "나머지가 흐려진" 모습이 보이도록 한다. (TODO_MORE)
      this.selectNode(id)
      if (this.mode === 'graph') this.reveal(id, 1)

      if (isDouble) {
        // 더블클릭: 관계도는 더 깊게(2-홉)+그 노드로 ~80% 줌, 트리는 접기/펼치기.
        if (this.mode === 'tree') this.toggleCollapse(id)
        else {
          this.reveal(id, 2)
          this.fitToSelection(id)
        }
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
    cy.layout(incrementalLayoutFor(this.mode)).run()
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
