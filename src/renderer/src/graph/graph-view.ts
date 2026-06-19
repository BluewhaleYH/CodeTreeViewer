import cytoscape, {
  type Core,
  type LayoutOptions,
  type NodeSingular,
  type StylesheetStyle
} from 'cytoscape'
import type { CodeGraph } from '../../../shared/graph'
import type { TabState } from '../tabs/tab-store'
import { toCytoscapeElements } from './to-cytoscape'

/**
 * 그래프 캔버스(Cytoscape) 생명주기 관리. (03 §2)
 * 매 렌더마다 재생성하지 않고, 활성 탭의 그래프가 바뀔 때만 다시 그린다.
 * 팬/줌/드래그는 Cytoscape 기본 동작으로 제공된다.
 * 관계도(태양계형)는 방사형(concentric) 배치 — 연결이 많은 노드를 중심에 둔다. (M5_3, 03 §3)
 * 트리 뷰는 M5_4, 선택 노드 중심 궤도화는 M6, 영역 색상은 M6.
 */

/** 관계도(태양계형) 방사형 레이아웃: degree(연결 수)가 클수록 중심. (03 §3) */
const radialLayout: LayoutOptions = {
  name: 'concentric',
  concentric: (node: NodeSingular) => node.degree(false),
  levelWidth: () => 1,
  minNodeSpacing: 28,
  spacingFactor: 1.1,
  animate: false
}

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
    selector: 'node[kind="function"]',
    style: { 'background-color': '#6a737d', width: 7, height: 7 }
  },
  {
    selector: 'node[external="true"]',
    style: { 'background-color': '#555a60', shape: 'diamond', width: 10, height: 10 }
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

export class GraphView {
  private cy: Core | null = null
  private currentTabId: string | null = null

  constructor(private readonly host: HTMLElement) {}

  /** 활성 탭의 그래프를 동기화한다. 같은 탭이면 재생성하지 않는다. */
  sync(tab: TabState | null): void {
    const graph = tab && tab.analysis.status === 'done' ? tab.analysis.graph : null
    if (!tab || !graph || tab.projectPath === null) {
      this.clear()
      return
    }
    if (this.currentTabId === tab.id && this.cy) return
    this.currentTabId = tab.id
    this.draw(graph)
  }

  private draw(graph: CodeGraph): void {
    this.destroyCy()
    this.host.style.display = 'block'
    this.cy = cytoscape({
      container: this.host,
      elements: toCytoscapeElements(graph),
      style: GRAPH_STYLE,
      layout: radialLayout,
      wheelSensitivity: 0.2,
      minZoom: 0.05,
      maxZoom: 4
    })
  }

  private clear(): void {
    this.destroyCy()
    this.currentTabId = null
    this.host.style.display = 'none'
  }

  private destroyCy(): void {
    if (this.cy) {
      this.cy.destroy()
      this.cy = null
    }
  }
}
