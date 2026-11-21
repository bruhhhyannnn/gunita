import { useEffect, useRef } from 'react'
import type { ForceGraph3DInstance } from '3d-force-graph'
import { NODE_COLORS, type GLink, type GNode } from '#/lib/graph'

type N = GNode & { x?: number; y?: number; z?: number }
type L = Omit<GLink, 'source' | 'target'> & { source: string | N; target: string | N }

/** Pulls nodes onto two brain-like hemispheres instead of a round blob. */
function brainForce(radius: () => number) {
  let nodes: N[] = []
  const force = (alpha: number) => {
    const R = radius()
    const gap = R * 0.14
    for (const n of nodes as (N & { vx: number; vy: number; vz: number })[]) {
      const side = (n.x ?? 0) >= 0 ? 1 : -1
      const cx = side * gap
      const dx = (n.x ?? 0) - cx
      const dy = n.y ?? 0
      const dz = n.z ?? 0
      const rx = R * 0.62
      const ry = R * 0.8
      const rz = R * 1.05
      const d = Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2 + (dz / rz) ** 2) || 1
      // Keep nodes in a shell between 70% and 100% of the hemisphere, like a cortex.
      const k = d > 1 ? (d - 1) * 0.35 : d < 0.7 ? (d - 0.7) * 0.25 : 0
      n.vx -= dx * k * alpha
      n.vy -= dy * k * alpha * 0.9
      n.vz -= dz * k * alpha
      if (Math.abs(n.x ?? 0) < gap * 0.6) n.vx += side * gap * 0.05 * alpha
    }
  }
  force.initialize = (ns: N[]) => {
    nodes = ns
  }
  return force
}

export function BrainGraph({
  nodes,
  links,
  selected,
  onSelect,
  flat,
  brainShape,
}: {
  nodes: GNode[]
  links: GLink[]
  selected: string | null
  onSelect: (id: string | null) => void
  flat: boolean
  brainShape: boolean
}) {
  const el = useRef<HTMLDivElement>(null)
  const graph = useRef<ForceGraph3DInstance<N, L> | null>(null)
  const selectRef = useRef(onSelect)
  selectRef.current = onSelect
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const countRef = useRef(nodes.length)
  countRef.current = nodes.length

  useEffect(() => {
    let disposed = false
    let ro: ResizeObserver | null = null
    void (async () => {
      const [{ default: ForceGraph3D }, { default: SpriteText }] = await Promise.all([import('3d-force-graph'), import('three-spritetext')])
      if (disposed || !el.current) return
      const g = new ForceGraph3D(el.current, { controlType: 'orbit' }) as unknown as ForceGraph3DInstance<N, L>
      g.backgroundColor('#07090d')
        .showNavInfo(false)
        .nodeId('id')
        .nodeVal((n) => (n.group === 'entity' ? 3 : 1.4) + Math.min(n.degree, 14) * 0.45)
        .nodeColor((n) => (selectedRef.current && n.id !== selectedRef.current ? dim(NODE_COLORS[n.type] ?? '#ccc') : (NODE_COLORS[n.type] ?? '#ccc')))
        .nodeOpacity(0.95)
        .nodeResolution(14)
        .nodeLabel((n) => n.name)
        .nodeThreeObjectExtend(true)
        .nodeThreeObject((n) => {
          if (n.group !== 'entity' && n.degree < 3) return undefined as never
          const s = new SpriteText(n.name.length > 28 ? n.name.slice(0, 27) + '…' : n.name)
          s.color = n.group === 'entity' ? '#ffffffd9' : '#ffffff99'
          s.textHeight = n.group === 'entity' ? 3.2 : 2.4
          s.position.y = 6
          return s as never
        })
        .linkColor((l) => (l.kind === 'relation' ? (l.confirmed ? '#c9a7ff' : '#a98bff') : l.kind === 'mention' ? '#7fb7ff' : l.kind === 'member' ? '#9aa4b5' : '#5b6474'))
        .linkOpacity(0.35)
        .linkWidth((l) => (l.kind === 'relation' && l.confirmed ? 0.9 : l.kind === 'mention' ? 0.6 : 0))
        .linkLabel((l) => l.label ?? '')
        // AI suggestions that you haven't confirmed shimmer instead of being solid lines.
        .linkDirectionalParticles((l) => (l.kind === 'relation' && !l.confirmed ? 3 : 0))
        .linkDirectionalParticleWidth(1.2)
        .linkDirectionalParticleSpeed(0.004)
        .onNodeClick((n) => selectRef.current(n.id))
        .onBackgroundClick(() => selectRef.current(null))
        .cooldownTicks(220)
      g.d3Force('charge')?.strength(-38)
      g.d3Force('brain', brainForce(() => 40 + 7 * Math.sqrt(countRef.current)) as never)
      graph.current = g
      const size = () => {
        if (!el.current) return
        g.width(el.current.clientWidth).height(el.current.clientHeight)
      }
      size()
      ro = new ResizeObserver(size)
      ro.observe(el.current)
      g.graphData({ nodes: nodes.map((n) => ({ ...n })), links: links.map((l) => ({ ...l })) })
      setTimeout(() => g.zoomToFit(800, 40), 1600)
    })()
    return () => {
      disposed = true
      ro?.disconnect()
      graph.current?._destructor()
      graph.current = null
      if (el.current) el.current.innerHTML = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update data in place so existing nodes keep their positions.
  useEffect(() => {
    const g = graph.current
    if (!g) return
    const prev = new Map(g.graphData().nodes.map((n) => [n.id, n]))
    const next = nodes.map((n) => Object.assign(prev.get(n.id) ?? {}, n))
    g.graphData({ nodes: next, links: links.map((l) => ({ ...l })) })
  }, [nodes, links])

  useEffect(() => {
    graph.current?.numDimensions(flat ? 2 : 3)
  }, [flat])

  useEffect(() => {
    const g = graph.current
    if (!g) return
    g.d3Force('brain', brainShape ? (brainForce(() => 40 + 7 * Math.sqrt(countRef.current)) as never) : null)
    g.d3ReheatSimulation()
  }, [brainShape])

  // Highlight the selected node and fly the camera to it.
  useEffect(() => {
    const g = graph.current
    if (!g) return
    g.nodeColor(g.nodeColor())
    const n = selected ? g.graphData().nodes.find((x) => x.id === selected) : null
    if (!n) return
    const dist = 70
    const r = 1 + dist / (Math.hypot(n.x ?? 1, n.y ?? 1, n.z ?? 1) || 1)
    g.cameraPosition({ x: (n.x ?? 0) * r, y: (n.y ?? 0) * r, z: (n.z ?? 0) * r }, { x: n.x ?? 0, y: n.y ?? 0, z: n.z ?? 0 }, 900)
  }, [selected])

  return <div ref={el} className="absolute inset-0" />
}

function dim(hex: string) {
  return hex + '55'
}
