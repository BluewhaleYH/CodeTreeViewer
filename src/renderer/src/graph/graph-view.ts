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

/**
 * 그래프 캔버스(Cytoscape) 생명주기 관리. (03 §2~§4)
 * - 관계도(graph): concentric 방사형(허브 중심). (M5_3, §3)
 * - 트리(tree): breadthfirst 계층 배치 + 노드 탭으로 접기/펼치기. (M5_4, §4)
 * 활성 탭/뷰 모드가 바뀔 때만 다시 그린다. 팬/줌/드래그는 Cytoscape 기본.
 */

const GRAPH_STYLE: StylesheetStyle[] = [
  {
    selector: 'node',
    style: {
      'background-color': '#4a9eff',
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
    style: { 'background-color': '#555a60', shape: 'diamond', width: 10, height: 10 }
  },
  {
    selector: 'node.collapsed',
    style: { 'border-width': 2, 'border-color': '#e2b341' }
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
  }
]

/** 관계도(태양계형) 방사형: degree가 클수록 중심. (03 §3) */
const radialLayout: LayoutOptions = {
  name: 'concentric',
  concentric: (node: NodeSingular) => node.degree(false),
  levelWidth: () => 1,
  minNodeSpacing: 28,
  spacingFactor: 1.1,
  animate: false
}

/** 트리(계층) 배치: 부모(import 하는 쪽)가 위, 자식이 아래. (03 §4) */
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
  private childAdjacency: Map<string, string[]> = new Map()
  private readonly collapsed = new Set<string>()

  constructor(private readonly host: HTMLElement) {}

  /** 활성 탭/뷰 모드의 그래프를 동기화한다. 같은 키면 재생성하지 않는다. */
  sync(tab: TabState | null): void {
    const graph = tab && tab.analysis.status === 'done' ? tab.analysis.graph : null
    if (!tab || !graph || tab.projectPath === null) {
      this.clear()
      return
    }
    const key = `${tab.id}:${tab.view.mode}`
    if (this.currentKey === key && this.cy) return
    this.currentKey = key
    this.draw(graph, tab.view.mode)
  }

  private draw(graph: CodeGraph, mode: ViewMode): void {
    this.destroyCy()
    this.host.style.display = 'block'
    this.collapsed.clear()
    this.childAdjacency = buildChildAdjacency(graph)

    this.cy = cytoscape({
      container: this.host,
      elements: toCytoscapeElements(graph),
      style: GRAPH_STYLE,
      layout: layoutFor(mode),
      wheelSensitivity: 0.2,
      minZoom: 0.05,
      maxZoom: 4
    })

    if (mode === 'tree') this.enableCollapse()
  }

  /** 트리 모드: 노드 탭 → 자손 접기/펼치기. (03 §4) */
  private enableCollapse(): void {
    const cy = this.cy
    if (!cy) return
    cy.on('tap', 'node', (event) => {
      const id = event.target.id()
      if (this.collapsed.has(id)) this.collapsed.delete(id)
      else this.collapsed.add(id)
      event.target.toggleClass('collapsed', this.collapsed.has(id))
      this.applyVisibility()
    })
  }

  private applyVisibility(): void {
    const cy = this.cy
    if (!cy) return
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

  private clear(): void {
    this.destroyCy()
    this.currentKey = null
    this.host.style.display = 'none'
  }

  private destroyCy(): void {
    if (this.cy) {
      this.cy.destroy()
      this.cy = null
    }
  }
}
