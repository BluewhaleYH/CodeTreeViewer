import cytoscape, {
  type Core,
  type LayoutOptions,
  type NodeSingular,
  type StylesheetStyle
} from 'cytoscape'
import type { CodeGraph } from '../../../shared/graph'
import type { TabState, ViewMode } from '../tabs/tab-store'
import { toCytoscapeElements } from './to-cytoscape'
import { buildChildAdjacency, hiddenNodeIds } from './tree-collapse'
import { DEFAULT_MAX_INITIAL_NODES, selectInitialView } from './initial-view'
import { buildNeighborAdjacency, expandableNodeIds } from './expand'
import { assignDomainColors } from './domain-colors'

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
    selector: 'edge',
    style: {
      width: 1,
      'line-color': '#3c3c3c',
      'target-arrow-color': '#3c3c3c',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.6,
      'curve-style': 'bezier'
    }
  }
]

const radialLayout: LayoutOptions = {
  name: 'concentric',
  concentric: (node: NodeSingular) => node.degree(false),
  levelWidth: () => 1,
  minNodeSpacing: 28,
  spacingFactor: 1.1,
  animate: false
}

const treeLayout: LayoutOptions = {
  name: 'breadthfirst',
  directed: true,
  spacingFactor: 1.0,
  grid: false,
  animate: false
}

function layoutFor(mode: ViewMode): LayoutOptions {
  return mode === 'tree' ? treeLayout : radialLayout
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
    const key = `${tab.id}:${tab.view.mode}`
    if (this.currentKey === key && this.cy) {
      // 같은 뷰: 외부(시드/검색 등)에서 바뀐 선택을 캔버스에 반영한다.
      this.syncSelection(tab.view.selectedNodeId)
      return
    }
    this.currentKey = key
    this.draw(graph, tab.view.mode, tab.view.selectedNodeId)
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
      wheelSensitivity: 0.2,
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
    cy.layout(radialLayout).run()
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
    this.host.style.display = 'none'
  }

  private destroyCy(): void {
    if (this.cy) {
      this.cy.destroy()
      this.cy = null
    }
  }
}
