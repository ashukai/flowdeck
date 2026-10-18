import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet, PanResponder, Platform, Alert, Modal, ScrollView, useWindowDimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { Image } from 'expo-image'
import Svg, { Defs, Pattern, Rect, Circle, Path, Polygon, Text as SvgText } from 'react-native-svg'
import { useFlows } from '@/store/useFlows'
import { Button, Field, IconButton } from '@/components/ui'
import { exportFlowPdf } from '@/lib/pdf'
import { canPrint } from '@/lib/hosting'
import { useConfirm } from '@/components/Confirm'
import { uid } from '@/lib/id'
import { Edge, BoardNote, Step } from '@/types'
import { C, R, S, F, STEP_COLORS, STEP_FILLS, NOTE_COLORS } from '@/theme'
import {
  Pos, CARD_W, SMALL_W, SMALL_H, DECISION_W, DECISION_H, END_W, END_H, NOTE_W, NOTE_H, MARGIN, A4_W, A4_H, A4_PAD,
  CARD_PAD, HEAD_H, HEAD_GAP, BULLET_ROW, IMG_H, META_H,
  visibleBullets, cardWidth, cardHeight, impliedEdges, stepNumbers,
  edgeGeom, bezierPoint, edgePath, arrowHead, labelPoint, placeLabels, tidyLayout,
} from '@/lib/flowGeometry'

// ── Whiteboard geometry (shared with the PDF) ─────────────────────────────
const MIN_SCALE = 0.35
const MAX_SCALE = 2.2
const MIN_CARD_W = 170
const MIN_CARD_H = 90
const GAP_Y = 84
const GAP_X = 70

type PosMap = Record<string, Pos>
type Selection = { type: 'card' | 'edge' | 'note'; id: string } | null
type Sizes = Record<string, number>

function geomFor(e: Edge, pos: PosMap, wds: Sizes, hts: Sizes, decisions: Set<string>) {
  const a = pos[e.from], b = pos[e.to]
  if (!a || !b) return null
  return edgeGeom(
    { x: a.x, y: a.y, w: wds[e.from] ?? CARD_W, h: hts[e.from] ?? 150 },
    { x: b.x, y: b.y, w: wds[e.to] ?? CARD_W, h: hts[e.to] ?? 150 },
    decisions.has(e.from),
  )
}

const layoutSize = (st: Step) => ({ w: cardWidth(st), h: cardHeight(st) })

type Box = { x: number; y: number; w: number; h: number }
type NewKind = 'step' | 'small' | 'decision' | 'end'
const EDGE_INK = '#8A93A6'     // arrows are quiet ink; the accent marks what's selected
const DIAMOND_LINE = '#AEB6C5'

function sizeFor(k: NewKind) {
  if (k === 'decision') return { w: DECISION_W, h: DECISION_H }
  if (k === 'end') return { w: END_W, h: END_H }
  if (k === 'small') return { w: SMALL_W, h: SMALL_H }
  return { w: CARD_W, h: cardHeight({ id: '', title: '', bullets: [], annotations: [] }) }
}

// The branch a new arrow out of a decision should carry: Yes first, then No.
function nextBranch(eds: Edge[], from: string): 'Yes' | 'No' | undefined {
  const used = eds.filter((e) => e.from === from).map((e) => (e.label ?? '').trim().toLowerCase())
  if (!used.includes('yes')) return 'Yes'
  if (!used.includes('no')) return 'No'
  return undefined
}

export default function Board() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { width: winW } = useWindowDimensions()
  const flow = useFlows((s) => s.flows.find((f) => f.id === id))
  const updateStep = useFlows((s) => s.updateStep)
  const deleteStep = useFlows((s) => s.deleteStep)
  const addStep = useFlows((s) => s.addStep)
  const setEdges = useFlows((s) => s.setEdges)
  const setNotes = useFlows((s) => s.setNotes)
  const { ask, sheet } = useConfirm()

  // viewport transform: screen = board * scale + offset
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState<Pos>({ x: 0, y: 0 })
  const [viewport, setViewport] = useState({ w: 0, h: 0 })
  const [positions, setPositions] = useState<PosMap>({})
  const [selection, setSelection] = useState<Selection>(null)
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const [redirectEdge, setRedirectEdge] = useState<{ edgeId: string; mode: 'from' | 'to' } | null>(null)
  // Live drag-to-connect: source card + current pointer position (board coords).
  const [dragConnect, setDragConnect] = useState<{ fromId: string; x: number; y: number; overId: string | null } | null>(null)
  const [showA4, setShowA4] = useState(true)
  const [showColours, setShowColours] = useState(false)
  // Live size while dragging the resize handle (avoids store writes per frame).
  const [liveSize, setLiveSize] = useState<{ id: string; w: number; h: number } | null>(null)
  // Measured header heights (title may wrap to 2+ lines) keyed by step id.
  const [headHeights, setHeadHeights] = useState<Record<string, number>>({})
  const reportHead = (id: string, h: number) => {
    setHeadHeights((prev) => (Math.abs((prev[id] ?? HEAD_H) - h) > 0.5 ? { ...prev, [id]: h } : prev))
  }
  const [textModal, setTextModal] = useState<{ kind: 'edge' | 'note' | 'title'; id: string; value: string } | null>(null)
  const didFit = useRef(false)
  const lastTap = useRef({ id: '', t: 0 })

  const steps = flow?.steps ?? []
  const edges = useMemo(() => flow?.edges ?? impliedEdges(steps), [flow?.edges, steps])
  const notes = flow?.notes ?? []
  const heights = useMemo(() => {
    const m: Record<string, number> = {}
    for (const st of steps) {
      const eff = liveSize?.id === st.id ? { ...st, h: liveSize.h } : st
      m[st.id] = cardHeight(eff, headHeights[st.id] ?? HEAD_H)
    }
    return m
  }, [steps, headHeights, liveSize])
  const widths = useMemo(() => {
    const m: Record<string, number> = {}
    for (const st of steps) m[st.id] = liveSize?.id === st.id ? liveSize.w : cardWidth(st)
    return m
  }, [steps, liveSize])
  const decisions = useMemo(() => new Set(steps.filter((s) => s.kind === 'decision').map((s) => s.id)), [steps])
  const numbers = useMemo(() => stepNumbers(steps), [steps])

  // How many A4 pages to tile so the grid always covers the current content.
  const a4Pages = useMemo(() => {
    let maxX = A4_PAD + A4_W, maxY = A4_PAD + A4_H
    for (const st of steps) {
      const p = positions[st.id]
      if (!p) continue
      maxX = Math.max(maxX, p.x + (widths[st.id] ?? CARD_W))
      maxY = Math.max(maxY, p.y + (heights[st.id] ?? 150))
    }
    for (const n of notes) {
      const p = positions[n.id]
      if (!p) continue
      maxX = Math.max(maxX, p.x + NOTE_W)
      maxY = Math.max(maxY, p.y + NOTE_H)
    }
    const cols = Math.max(1, Math.ceil((maxX - A4_PAD) / A4_W))
    const rows = Math.max(1, Math.ceil((maxY - A4_PAD) / A4_H))
    const out: { x: number; y: number; n: number }[] = []
    let n = 1
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        out.push({ x: A4_PAD + c * A4_W, y: A4_PAD + r * A4_H, n: n++ })
    return out
  }, [steps, notes, positions, widths, heights])

  // Refs so gesture handlers (bound once to DOM/PanResponder) see fresh values.
  const live = useRef({
    scale, offset, positions, steps, edges, notes, heights, widths,
    selection, connectFrom, redirectEdge, dragConnect, liveSize, decisions,
  })
  live.current = { scale, offset, positions, steps, edges, notes, heights, widths, selection, connectFrom, redirectEdge, dragConnect, liveSize, decisions }

  const flowIdRef = useRef<string | undefined>(flow?.id)
  flowIdRef.current = flow?.id
  const routerRef = useRef(router)
  routerRef.current = router

  // Seed / merge positions whenever steps or notes change.
  const posKey = steps.map((s) => s.id).join(',') + '|' + notes.map((n) => n.id).join(',')
  useEffect(() => {
    if (!flow) return
    setPositions((prev) => {
      const next: PosMap = {}
      const fallback = tidyLayout(flow.steps, flow.edges ?? impliedEdges(flow.steps), layoutSize)
      flow.steps.forEach((st) => {
        next[st.id] = prev[st.id] ?? st.board ?? fallback[st.id]
      })
      for (const n of flow.notes ?? []) next[n.id] = prev[n.id] ?? { x: n.x, y: n.y }
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posKey])

  // Content bounding box (board coords).
  const bbox = useMemo(() => {
    const rects: { x: number; y: number; w: number; h: number }[] = []
    for (const st of steps) {
      const p = positions[st.id]
      if (p) rects.push({ x: p.x, y: p.y, w: widths[st.id] ?? CARD_W, h: heights[st.id] ?? 150 })
    }
    for (const n of notes) {
      const p = positions[n.id]
      if (p) rects.push({ x: p.x, y: p.y, w: NOTE_W, h: NOTE_H })
    }
    if (!rects.length) return { minX: 0, minY: 0, maxX: 1200, maxY: 800 }
    return {
      minX: Math.min(...rects.map((r) => r.x)),
      minY: Math.min(...rects.map((r) => r.y)),
      maxX: Math.max(...rects.map((r) => r.x + r.w)),
      maxY: Math.max(...rects.map((r) => r.y + r.h)),
    }
  }, [positions, steps, notes, heights, widths])

  // Arrow labels, with decision branches placed first so Yes/No keep their spot.
  const labelPos = useMemo(() => {
    const items: { id: string; pt: Pos; text: string; dec: boolean }[] = []
    for (const e of edges) {
      if (!e.label) continue
      const g = geomFor(e, positions, widths, heights, decisions)
      if (g) items.push({ id: e.id, pt: labelPoint(g, decisions.has(e.from)), text: e.label, dec: decisions.has(e.from) })
    }
    items.sort((a, b) => Number(b.dec) - Number(a.dec))
    return placeLabels(items)
  }, [edges, positions, widths, heights, decisions])

  const canvasW = Math.max(bbox.maxX + 600, 2400)
  const canvasH = Math.max(bbox.maxY + 600, 1600)

  const fitToContent = (vw = viewport.w, vh = viewport.h) => {
    if (!vw || !vh) return
    const usable = vh - 64 // keep clear of the floating bar at the bottom
    const bw = bbox.maxX - bbox.minX + MARGIN
    const bh = bbox.maxY - bbox.minY + MARGIN
    const s = Math.min(vw / bw, usable / bh, 1.15)
    const cs = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s))
    setScale(cs)
    setOffset({
      x: (vw - (bbox.maxX + bbox.minX) * cs) / 2,
      y: (usable - (bbox.maxY + bbox.minY) * cs) / 2,
    })
  }

  useEffect(() => {
    if (!didFit.current && viewport.w > 0 && Object.keys(positions).length > 0) {
      didFit.current = true
      fitToContent()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport, positions])

  const zoomAt = (cx: number, cy: number, nextScale: number) => {
    const ns = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale))
    const { scale: s, offset: o } = live.current
    const bx = (cx - o.x) / s
    const by = (cy - o.y) / s
    setScale(ns)
    setOffset({ x: cx - bx * ns, y: cy - by * ns })
  }
  const zoomCenter = (factor: number) => zoomAt(viewport.w / 2, viewport.h / 2, live.current.scale * factor)

  // ── Whiteboard mutations ───────────────────────────────────────────────
  // Implied (sequential) edges have stable ids, so customizing one simply
  // materializes the whole implied set into flow.edges and edits in place.
  const patchEdge = (edgeId: string, patch: Partial<Edge>) => {
    if (!flow) return
    const eds = flow.edges ?? impliedEdges(flow.steps)
    setEdges(flow.id, eds.map((e) => (e.id === edgeId ? { ...e, ...patch } : e)))
  }

  const deleteEdge = (edgeId: string) => {
    if (!flow) return
    const eds = flow.edges ?? impliedEdges(flow.steps)
    setEdges(flow.id, eds.filter((e) => e.id !== edgeId))
    setSelection(null)
  }

  const addEdge = (from: string, to: string) => {
    if (!flow || from === to) return
    const eds = flow.edges ?? impliedEdges(flow.steps)
    if (eds.some((e) => e.from === from && e.to === to)) return
    const label = decisions.has(from) ? nextBranch(eds, from) : undefined
    setEdges(flow.id, [...eds, { id: uid('edge_'), from, to, label }])
  }

  const removeStep = (stepId: string) => {
    if (!flow) return
    const go = () => {
      if (flow.edges) setEdges(flow.id, flow.edges.filter((e) => e.from !== stepId && e.to !== stepId))
      deleteStep(flow.id, stepId)
      setSelection(null)
    }
    const st = flow.steps.find((s) => s.id === stepId)
    const name = st?.title ?? 'step'
    ask({ title: `Delete "${name}"?`, message: 'Its arrows go too.', action: 'Delete', onConfirm: go })
  }

  const removeNote = (noteId: string) => {
    if (!flow) return
    setNotes(flow.id, (flow.notes ?? []).filter((n) => n.id !== noteId))
    setSelection(null)
  }

  const patchNote = (noteId: string, patch: Partial<BoardNote>) => {
    if (!flow) return
    setNotes(flow.id, (flow.notes ?? []).map((n) => (n.id === noteId ? { ...n, ...patch } : n)))
  }

  const toggleChecked = (stepId: string) => {
    const fid = flowIdRef.current
    if (!fid) return
    const store = useFlows.getState()
    const st = store.flows.find((f) => f.id === fid)?.steps.find((s) => s.id === stepId)
    if (!st) return
    store.updateStep(fid, stepId, { checked: !st.checked })
  }

  const toggleBullet = (stepId: string, bulletIdx: number) => {
    const fid = flowIdRef.current
    if (!fid) return
    // read fresh state — taps can land faster than re-renders
    const store = useFlows.getState()
    const st = store.flows.find((f) => f.id === fid)?.steps.find((s) => s.id === stepId)
    if (!st) return
    const done = [...(st.done ?? [])]
    while (done.length < st.bullets.length) done.push(false)
    done[bulletIdx] = !done[bulletIdx]
    store.updateStep(fid, stepId, { done })
  }

  // ── Gestures (shared by native PanResponder & web DOM pointers) ────────
  const gesture = useRef({
    mode: 'none' as 'none' | 'pan' | 'card' | 'note' | 'connect' | 'resize',
    targetId: '',
    pendingEdge: '' as string,
    sizeStart: { w: 0, h: 0 },
    start: { x: 0, y: 0 },      // board coords at grant
    local: { x: 0, y: 0 },      // grant point relative to hit rect
    itemStart: { x: 0, y: 0 },
    itemLast: { x: 0, y: 0 },
    offsetStart: { x: 0, y: 0 },
    moved: false,
  })

  const gestureStart = (lx: number, ly: number) => {
    const { scale: s, offset: o, positions: pos, steps: sts, notes: nts, edges: eds, heights: hts, widths: wds } = live.current
    const bx = (lx - o.x) / s
    const by = (ly - o.y) / s
    const g = gesture.current
    g.moved = false
    g.pendingEdge = ''
    g.start = { x: bx, y: by }
    if (__DEV__ && Platform.OS === 'web') {
      ;(globalThis as any).__boardDebug = { lx, ly, bx, by, s, o, pos: JSON.parse(JSON.stringify(pos)), heights: { ...hts } }
    }

    // notes are rendered on top → test first
    const noteHit = [...nts].reverse().find((n) => {
      const p = pos[n.id]
      return p && bx >= p.x && bx <= p.x + NOTE_W && by >= p.y && by <= p.y + NOTE_H
    })
    if (noteHit) {
      g.mode = 'note'
      g.targetId = noteHit.id
      g.itemStart = { ...pos[noteHit.id] }
      g.itemLast = { ...pos[noteHit.id] }
      g.local = { x: bx - pos[noteHit.id].x, y: by - pos[noteHit.id].y }
      return
    }

    // resize handle: bottom-right corner of the currently-selected card.
    const sel = live.current.selection
    if (sel?.type === 'card') {
      const st = sts.find((x) => x.id === sel.id)
      const p = st && pos[st.id]
      if (st && p && st.size !== 'small' && !st.kind) {
        const w = wds[st.id] ?? CARD_W, h = hts[st.id] ?? 150
        const cx = p.x + w, cy = p.y + h
        if (Math.hypot(bx - cx, by - cy) <= 20 / s) {
          g.mode = 'resize'
          g.targetId = st.id
          g.start = { x: bx, y: by }
          g.sizeStart = { w, h }
          return
        }
      }
    }

    // connection handle: a dot on the right edge of each card. Dragging it
    // starts a live "connect" gesture — no box selection needed.
    const handleR = 16 / s
    const handleHit = [...sts].reverse().find((st) => {
      const p = pos[st.id]
      if (!p) return false
      const w = wds[st.id] ?? CARD_W
      const h = hts[st.id] ?? 150
      return Math.hypot(bx - (p.x + w / 2), by - (p.y + h)) <= handleR
    })
    if (handleHit) {
      g.mode = 'connect'
      g.targetId = handleHit.id
      setDragConnect({ fromId: handleHit.id, x: bx, y: by, overId: null })
      return
    }

    const cardHit = [...sts].reverse().find((st) => {
      const p = pos[st.id]
      const h = hts[st.id] ?? 150
      const w = wds[st.id] ?? CARD_W
      return p && bx >= p.x && bx <= p.x + w && by >= p.y && by <= p.y + h
    })
    if (cardHit) {
      g.mode = 'card'
      g.targetId = cardHit.id
      g.itemStart = { ...pos[cardHit.id] }
      g.itemLast = { ...pos[cardHit.id] }
      g.local = { x: bx - pos[cardHit.id].x, y: by - pos[cardHit.id].y }
      return
    }

    // edge proximity (sampled bezier), tolerance ~12px screen
    const tol = 12 / s
    for (const e of eds) {
      const geom = geomFor(e, pos, wds, hts, live.current.decisions)
      if (!geom) continue
      for (let t = 0; t <= 1.001; t += 0.05) {
        const pt = bezierPoint(geom, t)
        if (Math.hypot(pt.x - bx, pt.y - by) < tol) {
          g.pendingEdge = e.id
          break
        }
      }
      if (g.pendingEdge) break
    }

    g.mode = 'pan'
    g.offsetStart = { ...o }
  }

  const gestureMove = (dx: number, dy: number) => {
    const g = gesture.current
    if (Math.abs(dx) + Math.abs(dy) > 6) g.moved = true
    const { scale: s } = live.current
    if (g.mode === 'card' || g.mode === 'note') {
      g.itemLast = { x: g.itemStart.x + dx / s, y: g.itemStart.y + dy / s }
      const next = g.itemLast
      setPositions((prev) => ({ ...prev, [g.targetId]: next }))
    } else if (g.mode === 'resize') {
      const w = Math.round(Math.max(MIN_CARD_W, g.sizeStart.w + dx / s))
      const h = Math.round(Math.max(MIN_CARD_H, g.sizeStart.h + dy / s))
      setLiveSize({ id: g.targetId, w, h })
    } else if (g.mode === 'connect') {
      const { positions: pos, steps: sts, heights: hts, widths: wds } = live.current
      const bx = g.start.x + dx / s
      const by = g.start.y + dy / s
      // which card is the pointer over? (skip the source)
      const over = [...sts].reverse().find((st) => {
        if (st.id === g.targetId) return false
        const p = pos[st.id]
        if (!p) return false
        const w = wds[st.id] ?? CARD_W, h = hts[st.id] ?? 150
        return bx >= p.x && bx <= p.x + w && by >= p.y && by <= p.y + h
      })
      setDragConnect({ fromId: g.targetId, x: bx, y: by, overId: over?.id ?? null })
    } else if (g.mode === 'pan') {
      setOffset({ x: g.offsetStart.x + dx, y: g.offsetStart.y + dy })
    }
  }

  const gestureEnd = () => {
    const g = gesture.current
    const fid = flowIdRef.current
    const { steps: sts, connectFrom: connecting, heights: hts } = live.current

    if (g.mode === 'card') {
      if (g.moved && fid) {
        updateStep(fid, g.targetId, { board: { ...g.itemLast } })
      } else if (!g.moved) {
        const st = sts.find((x) => x.id === g.targetId)
        const { redirectEdge: redir } = live.current
        if (redir) {
          const edge = live.current.edges.find((e) => e.id === redir.edgeId)
          if (edge && fid) {
            const updated = { ...edge, [redir.mode === 'from' ? 'from' : 'to']: g.targetId }
            patchEdge(edge.id, updated)
            setRedirectEdge(null)
            setSelection(null)
          }
        } else if (connecting && connecting !== g.targetId) {
          addEdge(connecting, g.targetId)
          setConnectFrom(null)
        } else if (st && st.size === 'small' && g.local.x < 44) {
          // small box: the checkbox zone toggles the whole box
          toggleChecked(g.targetId)
        } else if (st) {
          // bullet row tap? (checklist toggle)
          const vis = st.size === 'small' || st.kind ? [] : visibleBullets(st)
          const rowTop = CARD_PAD + (headHeights[st.id] ?? HEAD_H) + HEAD_GAP
          const row = Math.floor((g.local.y - rowTop) / BULLET_ROW)
          if (vis.length > 0 && g.local.y >= rowTop && row >= 0 && row < vis.length) {
            toggleBullet(g.targetId, vis[row].i)
          } else {
            const now = Date.now()
            if (lastTap.current.id === g.targetId && now - lastTap.current.t < 350 && fid) {
              if (st.kind) setTextModal({ kind: 'title', id: st.id, value: st.title })
              else routerRef.current.push(`/flow/${fid}/step/${g.targetId}`)
            } else {
              setSelection({ type: 'card', id: g.targetId })
            }
            lastTap.current = { id: g.targetId, t: now }
          }
        }
      }
    } else if (g.mode === 'note') {
      if (g.moved && fid) {
        patchNote(g.targetId, { x: g.itemLast.x, y: g.itemLast.y })
      } else if (!g.moved) {
        const now = Date.now()
        const n = live.current.notes.find((x) => x.id === g.targetId)
        if (lastTap.current.id === g.targetId && now - lastTap.current.t < 350 && n) {
          setTextModal({ kind: 'note', id: n.id, value: n.text })
        } else {
          setSelection({ type: 'note', id: g.targetId })
        }
        lastTap.current = { id: g.targetId, t: now }
      }
    } else if (g.mode === 'resize') {
      const ls = live.current.liveSize
      if (ls && fid && ls.id === g.targetId) {
        updateStep(fid, g.targetId, { w: ls.w, h: ls.h })
      }
      setLiveSize(null)
    } else if (g.mode === 'connect') {
      const dc = live.current.dragConnect
      if (dc?.overId && dc.overId !== g.targetId) {
        addEdge(g.targetId, dc.overId)
      }
      setDragConnect(null)
    } else if (g.mode === 'pan' && !g.moved) {
      if (g.pendingEdge) {
        setSelection({ type: 'edge', id: g.pendingEdge })
      } else {
        setSelection(null)
        setConnectFrom(null)
      }
    }
    g.mode = 'none'
  }

  const gestureStartRef = useRef(gestureStart); gestureStartRef.current = gestureStart
  const gestureMoveRef = useRef(gestureMove); gestureMoveRef.current = gestureMove
  const gestureEndRef = useRef(gestureEnd); gestureEndRef.current = gestureEnd

  // Native (iPhone/iPad): PanResponder.
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => Platform.OS !== 'web',
      onMoveShouldSetPanResponder: () => Platform.OS !== 'web',
      onPanResponderGrant: (e) =>
        gestureStartRef.current(e.nativeEvent.locationX, e.nativeEvent.locationY),
      onPanResponderMove: (_e, gs) => gestureMoveRef.current(gs.dx, gs.dy),
      onPanResponderRelease: () => gestureEndRef.current(),
      onPanResponderTerminate: () => { gesture.current.mode = 'none' },
    })
  ).current

  // Web (Mac): raw DOM pointer events.
  const boardRef = useRef<View>(null)
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const node = boardRef.current as unknown as HTMLElement | null
    if (!node || !node.addEventListener) return
    let dragging = false
    let sx = 0, sy = 0
    const down = (ev: PointerEvent) => {
      if (ev.button !== 0) return
      // The canvas subtree is pointer-events:none, so board interactions target
      // the viewport node itself. Anything else (action bar buttons) is not ours.
      if (ev.target !== node) return
      dragging = true
      sx = ev.clientX; sy = ev.clientY
      const rect = node.getBoundingClientRect()
      try { node.setPointerCapture(ev.pointerId) } catch {}
      gestureStartRef.current(ev.clientX - rect.left, ev.clientY - rect.top)
    }
    const move = (ev: PointerEvent) => {
      if (!dragging) return
      gestureMoveRef.current(ev.clientX - sx, ev.clientY - sy)
    }
    const up = () => {
      if (!dragging) return
      dragging = false
      gestureEndRef.current()
    }
    node.addEventListener('pointerdown', down)
    node.addEventListener('pointermove', move)
    node.addEventListener('pointerup', up)
    node.addEventListener('pointercancel', up)
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault()
      if (ev.ctrlKey || ev.metaKey) {
        const rect = node.getBoundingClientRect()
        zoomAt(ev.clientX - rect.left, ev.clientY - rect.top, live.current.scale * (1 - ev.deltaY * 0.01))
      } else {
        const o = live.current.offset
        setOffset({ x: o.x - ev.deltaX, y: o.y - ev.deltaY })
      }
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      node.removeEventListener('pointerdown', down)
      node.removeEventListener('pointermove', move)
      node.removeEventListener('pointerup', up)
      node.removeEventListener('pointercancel', up)
      node.removeEventListener('wheel', onWheel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!flow) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: C.muted }}>Flow not found.</Text>
        <Button label="Back to library" variant="ghost" onPress={() => router.replace('/')} />
      </View>
    )
  }

  // Notes ride along with the box they sit closest to, so a layout change
  // never leaves an explanation covering the wrong thing.
  const notesFollow = (before: PosMap, after: PosMap) => {
    const moved: BoardNote[] = []
    for (const n of notes) {
      const np = before[n.id]
      if (!np) continue
      let best: string | null = null, bestD = Infinity
      for (const st of flow.steps) {
        const q = before[st.id]
        if (!q) continue
        const d = Math.hypot(q.x + (widths[st.id] ?? CARD_W) / 2 - (np.x + NOTE_W / 2), q.y + (heights[st.id] ?? 150) / 2 - (np.y + NOTE_H / 2))
        if (d < bestD) { bestD = d; best = st.id }
      }
      if (!best || !after[best]) continue
      const dx = after[best].x - before[best].x, dy = after[best].y - before[best].y
      if (dx || dy) moved.push({ ...n, x: Math.round(np.x + dx), y: Math.round(np.y + dy) })
    }
    return moved
  }

  // Write a batch of new positions to the store and the screen in one go.
  const commitPositions = (next: PosMap, changedSteps: string[], movedNotes: BoardNote[]) => {
    for (const id of changedSteps) updateStep(flow.id, id, { board: next[id] })
    if (movedNotes.length) {
      const byId = new Map(movedNotes.map((n) => [n.id, n]))
      setNotes(flow.id, (useFlows.getState().flows.find((f) => f.id === flow.id)?.notes ?? []).map((n) => byId.get(n.id) ?? n))
    }
    setPositions((prev) => {
      const merged = { ...prev, ...next }
      for (const n of movedNotes) merged[n.id] = { x: n.x, y: n.y }
      return merged
    })
  }

  const arrange = () => {
    const fresh = tidyLayout(flow.steps, edges, (st) => ({ w: widths[st.id] ?? cardWidth(st), h: heights[st.id] ?? cardHeight(st) }))
    // keep the flow where it was on the board rather than jumping to the corner
    const first = flow.steps[0]?.id
    if (first && positions[first]) {
      const dx = positions[first].x - fresh[first].x
      for (const k of Object.keys(fresh)) fresh[k] = { x: fresh[k].x + dx, y: fresh[k].y }
    }
    commitPositions(fresh, flow.steps.map((s) => s.id), notesFollow(positions, fresh))
    setTimeout(() => fitToContent(), 0)
  }

  // ── One-tap building ──────────────────────────────────────────────────
  // A new box lands under its parent, already connected. If the parent
  // already leads somewhere, the new box is inserted in between and
  // everything below moves down to make room. A condition inserted that
  // way keeps the old path as its "Yes" and gets a fresh "No".
  const quickAdd = (parentId: string | null, kind: NewKind, branch?: 'Yes' | 'No') => {
    let eds = [...(flow.edges ?? impliedEdges(flow.steps))]
    const pos: PosMap = { ...positions }
    const changed = new Set<string>()
    const extra: Box[] = []
    const boxOf = (id: string): Box => ({ ...pos[id], w: widths[id] ?? CARD_W, h: heights[id] ?? 150 })

    const freeSpot = (x: number, y: number, w: number, h: number) => {
      const rects: Box[] = [...extra]
      for (const st of flow.steps) if (pos[st.id]) rects.push(boxOf(st.id))
      for (const n of notes) if (pos[n.id]) rects.push({ ...pos[n.id], w: NOTE_W, h: NOTE_H })
      const hit = (nx: number) => rects.some((r) => nx < r.x + r.w + 24 && nx + w + 24 > r.x && y < r.y + r.h + 24 && y + h + 24 > r.y)
      let nx = x
      for (let i = 0; i < 80 && hit(nx); i++) nx += 40
      return { x: Math.round(nx), y: Math.round(y) }
    }
    const spawn = (k: NewKind, near: Box | null, side: 'below' | 'right') => {
      const sz = sizeFor(k)
      let x = MARGIN, y = MARGIN
      if (near) {
        y = near.y + near.h + GAP_Y
        x = side === 'below' ? near.x + near.w / 2 - sz.w / 2 : near.x + near.w + GAP_X / 2
      }
      const at = freeSpot(x, y, sz.w, sz.h)
      extra.push({ ...at, ...sz })
      const sid = addStep(flow.id, k === 'decision' ? 'Condition?' : k === 'end' ? 'End' : k === 'small' ? 'Action' : 'New step')!
      const patch: Partial<Step> = { board: at }
      if (k === 'decision' || k === 'end') patch.kind = k
      if (k === 'small') patch.size = 'small'
      updateStep(flow.id, sid, patch)
      pos[sid] = at
      return { id: sid, box: { ...at, ...sz } }
    }

    const parent = parentId && pos[parentId] ? parentId : null
    let label: string | undefined = branch
    if (parent && decisions.has(parent) && !label) label = nextBranch(eds, parent)
    const outgoing = parent && !decisions.has(parent) ? eds.filter((e) => e.from === parent) : []
    const inserting = outgoing.length > 0 && kind !== 'end'

    let movedNotes: BoardNote[] = []
    if (inserting && parent) {
      // make room: everything below the parent shifts down by the new box's height
      const pb = boxOf(parent)
      const shift = sizeFor(kind).h + GAP_Y
      const before = { ...pos }
      for (const st of flow.steps) {
        if (st.id !== parent && pos[st.id] && pos[st.id].y >= pb.y + pb.h - 4) {
          pos[st.id] = { x: pos[st.id].x, y: pos[st.id].y + shift }
          changed.add(st.id)
        }
      }
      movedNotes = notesFollow(before, pos)
      for (const n of movedNotes) pos[n.id] = { x: n.x, y: n.y }
    }

    const parentBox = parent ? boxOf(parent) : null
    const main = spawn(kind, parentBox, label === 'No' ? 'right' : 'below')

    if (inserting) {
      // the old onward arrows now leave from the new box
      eds = eds.map((e) => (e.from === parent ? { ...e, from: main.id, label: kind === 'decision' ? (e.label ?? 'Yes') : e.label } : e))
    }
    if (parent) eds.push({ id: uid('edge_'), from: parent, to: main.id, label })
    if (kind === 'decision') {
      if (!inserting) {
        const yes = spawn('step', main.box, 'below')
        eds.push({ id: uid('edge_'), from: main.id, to: yes.id, label: 'Yes' })
      }
      const no = spawn('step', main.box, 'right')
      eds.push({ id: uid('edge_'), from: main.id, to: no.id, label: 'No' })
    }

    commitPositions(pos, [...changed], movedNotes)
    setEdges(flow.id, eds)
    setSelection({ type: 'card', id: main.id })
    if (kind === 'step') router.push(`/flow/${flow.id}/step/${main.id}`)
    else setTextModal({ kind: 'title', id: main.id, value: kind === 'end' ? 'End' : '' })
  }

  // Toolbar adds grow from the selected box, else from the last one.
  const growFrom = () => {
    if (selection?.type === 'card') return selection.id
    return flow.steps[flow.steps.length - 1]?.id ?? null
  }

  const onAddNote = () => {
    const cx = (viewport.w / 2 - offset.x) / scale - NOTE_W / 2
    const cy = (viewport.h / 2 - offset.y) / scale - NOTE_H / 2
    const note: BoardNote = { id: uid('note_'), x: cx, y: cy, text: 'Condition / explanation…', color: NOTE_COLORS[0] }
    setNotes(flow.id, [...(flow.notes ?? []), note])
    setPositions((prev) => ({ ...prev, [note.id]: { x: cx, y: cy } }))
    setSelection({ type: 'note', id: note.id })
  }

  const saveTextModal = () => {
    if (!textModal) return
    if (textModal.kind === 'edge') patchEdge(textModal.id, { label: textModal.value.trim() || undefined })
    else if (textModal.kind === 'title') {
      const t = textModal.value.trim()
      if (t && flow) updateStep(flow.id, textModal.id, { title: t })
    } else patchNote(textModal.id, { text: textModal.value })
    setTextModal(null)
  }

  const selectedStep = selection?.type === 'card' ? flow.steps.find((s) => s.id === selection.id) : undefined
  const selectedEdge = selection?.type === 'edge' ? edges.find((e) => e.id === selection.id) : undefined
  const selectedNote = selection?.type === 'note' ? notes.find((n) => n.id === selection.id) : undefined

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
        {/* Toolbar: one row on wide screens; on a phone, a title row plus a
            single row of tools that scrolls sideways */}
        {(() => {
          const tools = (
            <>
              <View style={styles.toolGroup}>
                <Button label="Step" icon="step" variant="ghost" size="sm" onPress={() => quickAdd(growFrom(), 'step')} />
                <Button label="Condition" icon="diamond" variant="ghost" size="sm" onPress={() => quickAdd(growFrom(), 'decision')} />
                <Button label="Small" icon="small" variant="ghost" size="sm" onPress={() => quickAdd(growFrom(), 'small')} />
                <Button label="Note" icon="note" variant="ghost" size="sm" onPress={onAddNote} />
              </View>
              <View style={styles.toolGroup}>
                <Button label="Tidy up" icon="tidy" variant="ghost" size="sm" onPress={arrange} />
                <IconButton icon="minus" label="Zoom out" variant="ghost" size={34} onPress={() => zoomCenter(1 / 1.25)} />
                <IconButton icon="plus" label="Zoom in" variant="ghost" size={34} onPress={() => zoomCenter(1.25)} />
                <Button label="Fit" icon="fit" variant="ghost" size="sm" onPress={() => fitToContent()} />
                <Button label="A4" icon="page" variant={showA4 ? 'raised' : 'ghost'} size="sm" onPress={() => setShowA4((v) => !v)} />
                <Button label="List" icon="list" variant="ghost" size="sm" onPress={() => router.push(`/flow/${flow.id}/edit`)} />
              </View>
            </>
          )
          const head = (
            <>
              <IconButton icon="chevron-left" label="Back" variant="ghost" size={40} onPress={() => router.back()} />
              <View style={{ flex: 1, minWidth: 100 }}>
                <Text style={styles.title} numberOfLines={1}>{flow.title}</Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                  {Object.keys(numbers).length} steps{decisions.size ? ` · ${decisions.size} condition${decisions.size === 1 ? '' : 's'}` : ''}
                </Text>
              </View>
            </>
          )
          const finish = (
            <>
              {canPrint && (
                <IconButton icon="download" label="Export PDF" size={40} onPress={() => exportFlowPdf(flow).catch((e) => Alert.alert('Export failed', String(e)))} />
              )}
              <Button label="Present" icon="play" onPress={() => router.push(`/flow/${flow.id}`)} />
            </>
          )
          return winW >= 1240 ? (
            <View style={[styles.toolbar, styles.toolbarRow]}>
              {head}
              {tools}
              <View style={{ flex: 1 }} />
              {finish}
            </View>
          ) : (
            <View style={styles.toolbar}>
              <View style={styles.toolbarRow}>
                {head}
                {finish}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolScroll}>
                {tools}
              </ScrollView>
            </View>
          )
        })()}

        {/* Board viewport */}
        <View
          ref={boardRef}
          style={styles.viewport}
          onLayout={(e) => setViewport({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
          {...responder.panHandlers}
        >
          <View
            pointerEvents="none"
            style={{
              position: 'absolute', left: 0, top: 0,
              width: canvasW, height: canvasH,
              transform: [{ translateX: offset.x }, { translateY: offset.y }, { scale }],
              transformOrigin: 'top left',
            }}
          >
            <Svg width={canvasW} height={canvasH} style={StyleSheet.absoluteFill}>
              <Defs>
                <Pattern id="dots" width={26} height={26} patternUnits="userSpaceOnUse">
                  <Circle cx={2} cy={2} r={1.6} fill={C.boardDot} />
                </Pattern>
              </Defs>
              <Rect width="100%" height="100%" fill="url(#dots)" />

              {/* A4 page guides — faint, behind everything, to keep layout printable */}
              {showA4 && a4Pages.map((pg) => (
                <Fragment key={`a4_${pg.n}`}>
                  <Rect x={pg.x} y={pg.y} width={A4_W} height={A4_H} rx={2}
                    fill="none" stroke={C.accent} strokeWidth={1} strokeDasharray="2,7" opacity={0.28} />
                  <SvgText x={pg.x + 8} y={pg.y + 20} fill={C.faint} fontSize={12} fontWeight="700" opacity={0.6}>
                    {`A4${a4Pages.length > 1 ? ` · ${pg.n}` : ''}`}
                  </SvgText>
                </Fragment>
              ))}

              {edges.map((e) => {
                const geom = geomFor(e, positions, widths, heights, decisions)
                if (!geom) return null
                const sel = selection?.type === 'edge' && selection.id === e.id
                const col = sel ? (e.color ?? C.accent) : (e.color ?? EDGE_INK)
                return (
                  <Fragment key={e.id}>
                    <Path d={edgePath(geom)} stroke={col} strokeWidth={sel ? 3.5 : 2} fill="none"
                      strokeDasharray={e.dashed ? '7,6' : undefined} strokeLinecap="round" />
                    <Polygon points={arrowHead(geom)} fill={col} />
                  </Fragment>
                )
              })}

              {/* live drag-to-connect ghost arrow */}
              {dragConnect && (() => {
                const p = positions[dragConnect.fromId]
                if (!p) return null
                const w = widths[dragConnect.fromId] ?? CARD_W
                const h = heights[dragConnect.fromId] ?? 150
                const sx = p.x + w / 2, sy = p.y + h
                const ex = dragConnect.x, ey = dragConnect.y
                const pull = Math.min(120, Math.max(40, Math.abs(ey - sy) * 0.45))
                const d = `M ${sx} ${sy} C ${sx} ${sy + pull}, ${ex} ${ey - pull}, ${ex} ${ey}`
                return <Path d={d} stroke={C.accent} strokeWidth={2.5} fill="none" strokeDasharray="6,5" opacity={0.9} />
              })()}

              {/* connection handles — a dot under each box; drag it onto another box */}
              {flow.steps.map((st) => {
                const p = positions[st.id]
                if (!p) return null
                const w = widths[st.id] ?? CARD_W
                const h = heights[st.id] ?? 150
                const active = dragConnect?.fromId === st.id || (selection?.type === 'card' && selection.id === st.id)
                return (
                  <Circle key={`h_${st.id}`} cx={p.x + w / 2} cy={p.y + h} r={active ? 7 : 5}
                    fill={active ? C.accent : C.bg2} stroke={active ? C.accent : C.faint} strokeWidth={1.5} />
                )
              })}

              {/* highlight the card the pointer is hovering to drop onto */}
              {dragConnect?.overId && (() => {
                const p = positions[dragConnect.overId]
                if (!p) return null
                const w = widths[dragConnect.overId] ?? CARD_W
                const h = heights[dragConnect.overId] ?? 150
                return <Rect x={p.x - 3} y={p.y - 3} width={w + 6} height={h + 6} rx={16}
                  fill="none" stroke={C.success} strokeWidth={3} />
              })()}
            </Svg>

            {/* edge labels */}
            {edges.map((e) => {
              const pt = e.label ? labelPos[e.id] : undefined
              if (!pt) return null
              return (
                <View key={e.id} style={[styles.edgeLabelWrap, { left: pt.x - 90, top: pt.y - 13 }]}>
                  <View style={[styles.edgeLabel, e.color ? { borderColor: e.color } : null]}>
                    <Text style={[styles.edgeLabelText, e.color ? { color: e.color } : null]} numberOfLines={2}>{e.label}</Text>
                  </View>
                </View>
              )
            })}

            {/* step cards */}
            {flow.steps.map((st, i) => {
              const p = positions[st.id]
              if (!p) return null
              const vis = visibleBullets(st)
              const small = st.size === 'small'
              const allDone = small ? !!st.checked : vis.length > 0 && vis.every((v) => st.done?.[v.i])
              const doneCount = vis.filter((v) => st.done?.[v.i]).length
              const col = allDone ? C.success : (st.color ?? C.accent)
              const sel = selection?.type === 'card' && selection.id === st.id
              const isConnectSource = connectFrom === st.id
              const hot = sel || isConnectSource || dragConnect?.overId === st.id
              if (st.kind === 'decision') {
                const w = widths[st.id] ?? CARD_W, h = heights[st.id] ?? 120
                const stroke = hot ? (st.color ?? C.accent) : (st.color ?? DIAMOND_LINE)
                return (
                  <View key={st.id} style={[styles.decision, { left: p.x, top: p.y, width: w, height: h }]}>
                    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
                      <Polygon
                        points={`${w / 2},2 ${w - 2},${h / 2} ${w / 2},${h - 2} 2,${h / 2}`}
                        fill={st.fill ?? C.bg2} stroke={stroke} strokeWidth={hot ? 2.5 : 1.5} strokeLinejoin="round"
                      />
                    </Svg>
                    <Text style={[styles.decisionText, { maxWidth: w * 0.6 }]} numberOfLines={3}>{st.title}</Text>
                  </View>
                )
              }
              if (st.kind === 'end') {
                return (
                  <View key={st.id} style={[styles.endPill, { left: p.x, top: p.y }, hot && { borderColor: st.color ?? C.accent, borderWidth: 2.5 }]}>
                    <Text style={styles.endText} numberOfLines={1}>{st.title}</Text>
                  </View>
                )
              }
              if (small) {
                return (
                  <View
                    key={st.id}
                    style={[
                      styles.card, styles.smallCard,
                      { left: p.x, top: p.y, borderColor: sel || isConnectSource ? col : C.border },
                      (sel || isConnectSource) && { borderWidth: 2 },
                      allDone && { backgroundColor: '#EDFAF3' },
                      { borderLeftWidth: 4, borderLeftColor: col },
                    ]}
                  >
                    <View style={[styles.checkbox, styles.smallCheckbox, allDone && { backgroundColor: C.success, borderColor: C.success }]}>
                      {allDone && <Text style={styles.checkboxTick}>✓</Text>}
                    </View>
                    <Text style={[styles.smallTitle, allDone && { color: C.success }]} numberOfLines={2}>{st.title}</Text>
                  </View>
                )
              }
              return (
                <View
                  key={st.id}
                  style={[
                    styles.card,
                    { left: p.x, top: p.y, width: widths[st.id], height: heights[st.id], borderColor: sel || isConnectSource ? col : C.border },
                    { backgroundColor: st.fill ?? C.bg2 },
                    (sel || isConnectSource) && { borderWidth: 2 },
                    allDone && { backgroundColor: '#EDFAF3' },
                    { borderLeftWidth: 4, borderLeftColor: col },
                  ]}
                >
                  <View style={styles.cardHead} onLayout={(e) => reportHead(st.id, e.nativeEvent.layout.height)}>
                    <View style={[styles.badge, { backgroundColor: col }]}>
                      <Text style={styles.badgeText}>{allDone ? '✓' : numbers[st.id] ?? ''}</Text>
                    </View>
                    <Text style={styles.cardTitle} numberOfLines={3}>{st.title}</Text>
                  </View>
                  {vis.length ? (
                    <View>
                      {vis.map((v, row) => {
                        const isDone = !!st.done?.[v.i]
                        return (
                          <View key={row} style={[styles.bulletRow, { height: BULLET_ROW }]}>
                            <View style={[styles.checkbox, isDone && { backgroundColor: C.success, borderColor: C.success }]}>
                              {isDone && <Text style={styles.checkboxTick}>✓</Text>}
                            </View>
                            <Text style={[styles.cardBullet, isDone && styles.cardBulletDone]} numberOfLines={1}>{v.text}</Text>
                          </View>
                        )
                      })}
                    </View>
                  ) : (
                    <Text style={styles.cardEmpty}>Tap twice to add content</Text>
                  )}
                  {st.image && <Image source={{ uri: st.image.uri }} style={styles.cardImg} contentFit="cover" />}
                  <Text style={[styles.cardMeta, allDone && { color: C.success }]}>
                    {vis.length ? `${doneCount}/${vis.length} done` : ''}
                    {st.annotations.length ? `  ·  ${st.annotations.length} marks` : ''}
                    {allDone ? '  ·  complete ✓' : ''}
                  </Text>
                  {sel && (
                    <View style={[styles.resizeHandle, { borderColor: col }]} pointerEvents="none" />
                  )}
                </View>
              )
            })}

            {/* sticky notes */}
            {notes.map((n) => {
              const p = positions[n.id]
              if (!p) return null
              const sel = selection?.type === 'note' && selection.id === n.id
              return (
                <View key={n.id} style={[styles.note, { left: p.x, top: p.y, backgroundColor: n.color ?? NOTE_COLORS[0] }, sel && styles.noteSelected]}>
                  <Text style={styles.noteText} numberOfLines={4}>{n.text}</Text>
                  <Text style={styles.noteHint}>note</Text>
                </View>
              )
            })}
          </View>

          {/* bottom bar: hint / connect banner / selection actions */}
          {redirectEdge ? (
            <View style={styles.bottomBar} pointerEvents="box-none">
              <View style={styles.actionBar}>
                <Text style={styles.actionText}>Tap a card to redirect {redirectEdge.mode === 'from' ? 'from' : 'to'}</Text>
                <Button label="Cancel" variant="raised" size="sm" onPress={() => setRedirectEdge(null)} />
              </View>
            </View>
          ) : connectFrom ? (
            <View style={styles.bottomBar} pointerEvents="box-none">
              <View style={styles.actionBar}>
                <Text style={styles.actionText}>Tap a target card to connect</Text>
                <Button label="Cancel" variant="raised" size="sm" onPress={() => setConnectFrom(null)} />
              </View>
            </View>
          ) : selectedStep ? (
            <View style={styles.bottomBar} pointerEvents="box-none">
              <View style={[styles.actionBar, { flexDirection: 'column', alignItems: 'stretch' }]}>
                {showColours && (
                  <>
                    <View style={styles.swatchRow}>
                      <Text style={styles.swatchLabel}>Border</Text>
                      {STEP_COLORS.map((c) => (
                        <Pressable key={c} onPress={() => updateStep(flow.id, selectedStep.id, { color: c === STEP_COLORS[0] ? undefined : c })}
                          style={[styles.swatch, { backgroundColor: c }, (selectedStep.color ?? STEP_COLORS[0]) === c && styles.swatchOn]} />
                      ))}
                    </View>
                    {selectedStep.kind !== 'end' && (
                      <View style={styles.swatchRow}>
                        <Text style={styles.swatchLabel}>Fill</Text>
                        {STEP_FILLS.map((c) => (
                          <Pressable key={c} onPress={() => updateStep(flow.id, selectedStep.id, { fill: c === STEP_FILLS[0] ? undefined : c })}
                            style={[styles.swatch, { backgroundColor: c, borderWidth: 1, borderColor: C.border }, (selectedStep.fill ?? STEP_FILLS[0]) === c && styles.swatchOn]} />
                        ))}
                      </View>
                    )}
                  </>
                )}
                <View style={styles.actionButtons}>
                  {selectedStep.kind === 'decision' ? (
                    <>
                      {nextBranch(edges, selectedStep.id) === 'Yes' && (
                        <Button label="Yes" icon="plus" size="sm" onPress={() => quickAdd(selectedStep.id, 'step', 'Yes')} />
                      )}
                      {nextBranch(edges, selectedStep.id) !== undefined && (
                        <Button label="No" icon="plus" size="sm" onPress={() => quickAdd(selectedStep.id, 'step', 'No')} />
                      )}
                      <Button label="Question" icon="pencil" variant="dark" size="sm" onPress={() => setTextModal({ kind: 'title', id: selectedStep.id, value: selectedStep.title })} />
                    </>
                  ) : (
                    <>
                      <Button label="Next step" icon="arrow-down" size="sm" onPress={() => quickAdd(selectedStep.id, 'step')} />
                      <Button label="Condition" icon="diamond" variant="dark" size="sm" onPress={() => quickAdd(selectedStep.id, 'decision')} />
                      {selectedStep.kind !== 'end' && !edges.some((e) => e.from === selectedStep.id) && (
                        <Button label="End" icon="flag" variant="dark" size="sm" onPress={() => quickAdd(selectedStep.id, 'end')} />
                      )}
                      <Button
                        label={selectedStep.kind === 'end' ? 'Rename' : 'Edit'}
                        icon="pencil"
                        variant="dark"
                        size="sm"
                        onPress={() => selectedStep.kind === 'end'
                          ? setTextModal({ kind: 'title', id: selectedStep.id, value: selectedStep.title })
                          : router.push(`/flow/${flow.id}/step/${selectedStep.id}`)}
                      />
                    </>
                  )}
                  <Button label="Connect" icon="link" variant="dark" size="sm" onPress={() => { setConnectFrom(selectedStep.id); setSelection(null) }} />
                  {!selectedStep.kind && (
                    <Button
                      label={selectedStep.size === 'small' ? 'Bigger' : 'Smaller'}
                      variant="dark"
                      size="sm"
                      onPress={() => updateStep(flow.id, selectedStep.id, { size: selectedStep.size === 'small' ? undefined : 'small' })}
                    />
                  )}
                  {!!(selectedStep.w || selectedStep.h) && (
                    <Button label="Reset size" variant="dark" size="sm" onPress={() => updateStep(flow.id, selectedStep.id, { w: undefined, h: undefined })} />
                  )}
                  <Button label="Colour" icon="palette" variant={showColours ? 'raised' : 'dark'} size="sm" onPress={() => setShowColours((v) => !v)} />
                  <Button label="Delete" icon="trash" variant="darkDanger" size="sm" onPress={() => removeStep(selectedStep.id)} />
                </View>
              </View>
            </View>
          ) : selectedEdge ? (
            <View style={styles.bottomBar} pointerEvents="box-none">
              <View style={[styles.actionBar, { flexDirection: 'column', alignItems: 'stretch' }]}>
                {showColours && (
                  <View style={styles.swatchRow}>
                    {STEP_COLORS.map((c) => (
                      <Pressable key={c} onPress={() => patchEdge(selectedEdge.id, { color: c === STEP_COLORS[0] ? undefined : c })}
                        style={[styles.swatch, { backgroundColor: c }, selectedEdge.color === c && styles.swatchOn]} />
                    ))}
                  </View>
                )}
                <View style={styles.actionButtons}>
                  {decisions.has(selectedEdge.from) && (
                    <>
                      <Button label="Yes" variant={selectedEdge.label === 'Yes' ? 'raised' : 'dark'} size="sm" onPress={() => patchEdge(selectedEdge.id, { label: 'Yes' })} />
                      <Button label="No" variant={selectedEdge.label === 'No' ? 'raised' : 'dark'} size="sm" onPress={() => patchEdge(selectedEdge.id, { label: 'No' })} />
                    </>
                  )}
                  <Button label="Label…" icon="pencil" variant="dark" size="sm" onPress={() => setTextModal({ kind: 'edge', id: selectedEdge.id, value: selectedEdge.label ?? '' })} />
                  <Button label={selectedEdge.dashed ? 'Solid' : 'Dashed'} variant="dark" size="sm" onPress={() => patchEdge(selectedEdge.id, { dashed: !selectedEdge.dashed })} />
                  <Button label="Move start" variant="dark" size="sm" onPress={() => { setRedirectEdge({ edgeId: selectedEdge.id, mode: 'from' }); setSelection(null) }} />
                  <Button label="Move end" variant="dark" size="sm" onPress={() => { setRedirectEdge({ edgeId: selectedEdge.id, mode: 'to' }); setSelection(null) }} />
                  <Button label="Colour" icon="palette" variant={showColours ? 'raised' : 'dark'} size="sm" onPress={() => setShowColours((v) => !v)} />
                  <Button label="Delete" icon="trash" variant="darkDanger" size="sm" onPress={() => deleteEdge(selectedEdge.id)} />
                </View>
              </View>
            </View>
          ) : selectedNote ? (
            <View style={styles.bottomBar} pointerEvents="box-none">
              <View style={styles.actionBar}>
                {NOTE_COLORS.map((c) => (
                  <Pressable key={c} onPress={() => patchNote(selectedNote.id, { color: c })}
                    style={[styles.swatch, { backgroundColor: c, borderWidth: 1, borderColor: C.border }, (selectedNote.color ?? NOTE_COLORS[0]) === c && styles.swatchOn]} />
                ))}
                <Button label="Text…" icon="pencil" variant="dark" size="sm" onPress={() => setTextModal({ kind: 'note', id: selectedNote.id, value: selectedNote.text })} />
                <Button label="Delete" icon="trash" variant="darkDanger" size="sm" onPress={() => removeNote(selectedNote.id)} />
              </View>
            </View>
          ) : (
            <View style={styles.bottomBar} pointerEvents="none">
              <View style={styles.hintWrap}>
                <Text style={styles.hint}>Select a box to add the next step or a condition · drag the dot under a box onto another to connect · double-tap to edit</Text>
              </View>
            </View>
          )}
        </View>

        {/* text editor modal (edge condition / note text) */}
        <Modal visible={!!textModal} transparent animationType="fade" onRequestClose={() => setTextModal(null)}>
          <Pressable style={styles.backdrop} onPress={() => setTextModal(null)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.sheetTitle}>
                {textModal?.kind === 'edge' ? 'Label on this arrow'
                  : textModal?.kind === 'title'
                    ? (steps.find((x) => x.id === textModal.id)?.kind === 'decision' ? 'The question' : 'Box title')
                  : 'Note text'}
              </Text>
              <Field
                value={textModal?.value ?? ''}
                onChangeText={(t) => setTextModal((m) => (m ? { ...m, value: t } : m))}
                placeholder={
                  textModal?.kind === 'edge' ? 'e.g. Only when N2 stable'
                    : textModal?.kind === 'title'
                      ? (steps.find((x) => x.id === textModal.id)?.kind === 'decision' ? 'e.g. Light-off within 10 seconds?' : 'e.g. GEAR UP')
                    : 'Explanation…'
                }
                multiline={textModal?.kind !== 'title'}
                onSubmitEditing={textModal?.kind === 'title' ? saveTextModal : undefined}
                autoFocus
              />
              <View style={{ flexDirection: 'row', gap: S.sm }}>
                <Button label="Cancel" variant="ghost" onPress={() => setTextModal(null)} style={{ flex: 1 }} />
                <Button label="Save" onPress={saveTextModal} style={{ flex: 1 }} />
              </View>
            </Pressable>
          </Pressable>
        </Modal>
        {sheet}
      </SafeAreaView>
    </>
  )
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: S.md, backgroundColor: C.bg },
  toolbar: {
    gap: S.sm, paddingHorizontal: S.md, paddingVertical: S.sm,
    backgroundColor: C.bg2, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  toolbarRow: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  toolScroll: { flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingRight: S.md },
  toolGroup: { flexDirection: 'row', alignItems: 'center', gap: 2, padding: 3, borderRadius: 13, backgroundColor: '#EEF1F6' },
  title: { color: C.text, fontSize: F.h3, fontWeight: '800' },
  subtitle: { color: C.muted, fontSize: F.tiny, fontWeight: '600' },
  viewport: { flex: 1, overflow: 'hidden', backgroundColor: C.bg },
  card: {
    position: 'absolute', width: CARD_W,
    backgroundColor: C.bg2, borderRadius: R.md, borderWidth: 1, borderColor: C.border,
    padding: CARD_PAD,
    shadowColor: '#1B2130', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  smallCard: {
    width: SMALL_W, height: SMALL_H,
    flexDirection: 'row', alignItems: 'center', gap: S.sm,
    paddingVertical: 0, paddingHorizontal: S.md,
  },
  smallCheckbox: { width: 18, height: 18, borderRadius: 5 },
  smallTitle: { color: C.text, fontSize: F.small, fontWeight: '800', flex: 1, lineHeight: 16 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: S.sm, minHeight: HEAD_H, marginBottom: HEAD_GAP },
  badge: { width: 24, height: 24, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: F.tiny },
  cardTitle: { color: C.text, fontSize: F.body, fontWeight: '800', flex: 1, lineHeight: 20 },
  resizeHandle: {
    position: 'absolute', right: -2, bottom: -2, width: 16, height: 16,
    borderRightWidth: 3, borderBottomWidth: 3, borderBottomRightRadius: R.md,
    backgroundColor: 'transparent',
  },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  checkbox: {
    width: 15, height: 15, borderRadius: 4, borderWidth: 1.5, borderColor: C.faint,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff',
  },
  checkboxTick: { color: '#fff', fontSize: 9, fontWeight: '900', lineHeight: 11 },
  cardBullet: { color: C.muted, fontSize: F.small, flex: 1 },
  cardBulletDone: { color: C.success, textDecorationLine: 'line-through', textDecorationColor: C.success + '88' },
  cardImg: { height: IMG_H, borderRadius: R.xs, backgroundColor: C.bg3, marginTop: 8 },
  cardEmpty: { color: C.faint, fontSize: F.small, fontStyle: 'italic', height: 22 },
  cardMeta: { color: C.faint, fontSize: F.tiny, fontWeight: '600', height: META_H, marginTop: 'auto' as any },
  note: {
    position: 'absolute', width: NOTE_W, height: NOTE_H,
    borderRadius: R.sm, padding: S.md,
    borderWidth: 1, borderColor: '#00000018',
    shadowColor: '#1B2130', shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  noteSelected: { borderColor: C.text, borderWidth: 2 },
  noteText: { color: '#3A3A28', fontSize: F.small, fontWeight: '600', lineHeight: 18, flex: 1 },
  noteHint: { color: '#00000055', fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  edgeLabelWrap: { position: 'absolute', width: 180, alignItems: 'center' },
  edgeLabel: {
    maxWidth: 180, backgroundColor: C.bg2, borderRadius: 999, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  edgeLabelText: { color: C.text, fontSize: F.tiny, fontWeight: '700', textAlign: 'center' },
  decision: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  decisionText: { color: C.text, fontSize: F.small, fontWeight: '700', textAlign: 'center', lineHeight: 17 },
  endPill: {
    position: 'absolute', width: END_W, height: END_H, borderRadius: 999,
    borderWidth: 1.5, borderColor: C.text, backgroundColor: C.bg2,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: S.md,
  },
  endText: { color: C.text, fontSize: F.small, fontWeight: '800' },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 14, alignItems: 'center' },
  actionBar: {
    flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap', justifyContent: 'center',
    backgroundColor: '#1B2130F5', borderRadius: 18,
    paddingHorizontal: 6, paddingVertical: 6, maxWidth: '94%',
    shadowColor: '#0B0F1A', shadowOpacity: 0.28, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  actionText: { color: '#FFFFFF', fontSize: F.small, fontWeight: '600', paddingHorizontal: S.sm },
  swatchRow: { flexDirection: 'row', alignItems: 'center', gap: S.xs, flexWrap: 'wrap', justifyContent: 'center', paddingHorizontal: 6, paddingVertical: 4 },
  swatchLabel: { color: '#FFFFFF99', fontSize: F.tiny, fontWeight: '600', width: 42 },
  actionButtons: { flexDirection: 'row', alignItems: 'center', gap: 2, flexWrap: 'wrap', justifyContent: 'center' },
  swatch: { width: 24, height: 24, borderRadius: 999 },
  swatchOn: { borderWidth: 2.5, borderColor: '#FFFFFF' },
  hintWrap: { backgroundColor: '#FFFFFFEE', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: C.border },
  hint: { color: C.muted, fontSize: F.tiny, fontWeight: '600' },
  backdrop: { flex: 1, backgroundColor: '#00000066', justifyContent: 'center', alignItems: 'center', padding: S.lg },
  sheet: { width: '100%', maxWidth: 440, backgroundColor: C.bg2, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.xl, gap: S.md },
  sheetTitle: { color: C.text, fontSize: F.h3, fontWeight: '800' },
})
