// Shared whiteboard geometry: box sizes, arrow routing and the tidy layout.
// The board and the PDF both use this, so a printed flow matches the screen.

import { Edge, Step } from '@/types'

export type Pos = { x: number; y: number }

export const CARD_W = 250
export const SMALL_W = 170
export const SMALL_H = 52
export const DECISION_W = 220
export const DECISION_H = 124
export const END_W = 160
export const END_H = 46
export const NOTE_W = 210
export const NOTE_H = 110
export const MARGIN = 80
// card internals (must match the board render for bullet hit-testing)
export const CARD_PAD = 12
export const HEAD_H = 30
export const HEAD_GAP = 6
export const BULLET_ROW = 22
export const IMG_H = 84
export const META_H = 20
// A4 at 96 dpi (210×297mm); A4_PAD is where the page grid starts.
export const A4_W = 794
export const A4_H = 1123
export const A4_PAD = 40

const GAP_X = 70
const GAP_Y = 84

export function visibleBullets(st: Step) {
  if (st.script?.length) return []
  return st.bullets.map((b, i) => ({ text: b, i })).filter((x) => x.text.trim().length > 0)
}

// A box with a PF / PM script previews its first lines on the board.
export const SCRIPT_PREVIEW = 4
export function scriptRows(st: Step): number {
  const n = st.script?.length ?? 0
  if (!n) return 0
  return Math.min(n, SCRIPT_PREVIEW) + (n > SCRIPT_PREVIEW ? 1 : 0)
}

// Diamonds grow with their question so the text always fits inside.
function decisionSize(title: string) {
  const w = Math.round(Math.min(340, Math.max(DECISION_W, 150 + title.trim().length * 4.2)))
  return { w, h: Math.max(DECISION_H, Math.round(w * 0.56)) }
}

export function cardWidth(st: Step): number {
  if (st.kind === 'decision') return decisionSize(st.title).w
  if (st.kind === 'end') return END_W
  if (st.size === 'small') return st.w ?? SMALL_W
  return st.w ?? CARD_W
}

// Height needed to show all content (headH may be measured when the title wraps).
export function contentHeight(st: Step, headH = HEAD_H): number {
  if (st.kind === 'decision') return decisionSize(st.title).h
  if (st.kind === 'end') return END_H
  if (st.size === 'small') return SMALL_H
  const n = scriptRows(st) || visibleBullets(st).length
  const body = n > 0 ? n * BULLET_ROW : 22
  const img = st.image ? IMG_H + 8 : 0
  return CARD_PAD * 2 + headH + HEAD_GAP + body + img + META_H
}

export function cardHeight(st: Step, headH = HEAD_H): number {
  if (st.kind === 'decision') return decisionSize(st.title).h
  if (st.kind === 'end') return END_H
  if (st.size === 'small') return st.h ?? SMALL_H
  const content = contentHeight(st, headH)
  return st.h ? Math.max(st.h, content) : content
}

// Sequential fallback when a flow has no explicit edges yet.
export function impliedEdges(steps: Step[]): Edge[] {
  return steps.slice(0, -1).map((st, i) => ({ id: `auto_${st.id}`, from: st.id, to: steps[i + 1].id }))
}

// Numbers shown on normal step cards (decisions, end markers and small boxes skip).
export function stepNumbers(steps: Step[]): Record<string, number> {
  const out: Record<string, number> = {}
  let n = 0
  for (const st of steps) if (!st.kind && st.size !== 'small') out[st.id] = ++n
  return out
}

// ── Arrows ─────────────────────────────────────────────────────────────────
type Side = 'top' | 'bottom' | 'left' | 'right'
const NORMAL: Record<Side, Pos> = {
  top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
}
type Box = { x: number; y: number; w: number; h: number }

function anchor(b: Box, side: Side): Pos {
  if (side === 'top') return { x: b.x + b.w / 2, y: b.y }
  if (side === 'bottom') return { x: b.x + b.w / 2, y: b.y + b.h }
  if (side === 'left') return { x: b.x, y: b.y + b.h / 2 }
  return { x: b.x + b.w, y: b.y + b.h / 2 }
}

// Flowchart routing: down the page by default; a decision sends side branches
// out of its left/right corner; arrows that go back up loop round the right.
function pickSides(a: Box, b: Box, fromDecision: boolean): [Side, Side] {
  const acx = a.x + a.w / 2, bcx = b.x + b.w / 2
  const overlapX = b.x < a.x + a.w && b.x + b.w > a.x
  if (b.y >= a.y + a.h + 12) {
    if (fromDecision && !overlapX) return [bcx > acx ? 'right' : 'left', 'top']
    return ['bottom', 'top']
  }
  if (b.y + b.h + 12 <= a.y) {
    if (overlapX) return ['right', 'right']
    return bcx > acx ? ['right', 'left'] : ['left', 'right']
  }
  return bcx >= acx ? ['right', 'left'] : ['left', 'right']
}

export type EdgeGeom = { p1: Pos; p2: Pos; c1: Pos; c2: Pos; into: Pos }

export function edgeGeom(a: Box, b: Box, fromDecision = false): EdgeGeom {
  const [s1, s2] = pickSides(a, b, fromDecision)
  const p1 = anchor(a, s1), p2 = anchor(b, s2)
  const n1 = NORMAL[s1], n2 = NORMAL[s2]
  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y)
  let pull = Math.max(36, Math.min(140, dist * 0.42))
  if (s1 === 'right' && s2 === 'right') pull = Math.max(70, Math.abs(p2.y - p1.y) * 0.25 + 50)
  return {
    p1, p2,
    c1: { x: p1.x + n1.x * pull, y: p1.y + n1.y * pull },
    c2: { x: p2.x + n2.x * pull, y: p2.y + n2.y * pull },
    into: { x: -n2.x, y: -n2.y },
  }
}

export function bezierPoint(g: EdgeGeom, t: number): Pos {
  const u = 1 - t
  return {
    x: u * u * u * g.p1.x + 3 * u * u * t * g.c1.x + 3 * u * t * t * g.c2.x + t * t * t * g.p2.x,
    y: u * u * u * g.p1.y + 3 * u * u * t * g.c1.y + 3 * u * t * t * g.c2.y + t * t * t * g.p2.y,
  }
}

export function edgePath(g: EdgeGeom): string {
  return `M ${g.p1.x} ${g.p1.y} C ${g.c1.x} ${g.c1.y}, ${g.c2.x} ${g.c2.y}, ${g.p2.x} ${g.p2.y}`
}

// Arrowhead pointing into the target box, as an SVG polygon "points" string.
export function arrowHead(g: EdgeGeom, len = 11, half = 5.5): string {
  const { p2: t, into: u } = g
  const bx = t.x - u.x * len, by = t.y - u.y * len
  const px = -u.y * half, py = u.x * half
  return `${t.x},${t.y} ${bx + px},${by + py} ${bx - px},${by - py}`
}

// Where an arrow's label sits: near the start for decision branches (reads like
// "◇ → Yes"), mid-way for everything else.
export function labelPoint(g: EdgeGeom, fromDecision: boolean): Pos {
  return bezierPoint(g, fromDecision ? 0.28 : 0.5)
}

// Label centres for every labelled arrow, nudged down until no two pills overlap.
export function placeLabels(items: { id: string; pt: Pos; text: string }[]): Record<string, Pos> {
  const out: Record<string, Pos> = {}
  const boxes: { x: number; y: number; w: number; h: number }[] = []
  const H = 24
  for (const it of items) {
    const w = Math.min(180, it.text.length * 6.6 + 22)
    let y = it.pt.y
    const hits = () => boxes.some((b) => Math.abs(b.x - it.pt.x) < (b.w + w) / 2 + 4 && Math.abs(b.y - y) < H)
    for (let i = 0; i < 12 && hits(); i++) y += H
    boxes.push({ x: it.pt.x, y, w, h: H })
    out[it.id] = { x: it.pt.x, y }
  }
  return out
}

// "yes"-like labels keep the straight line down; "no"-like go to the side.
function branchRank(label?: string): number {
  const l = (label ?? '').trim().toLowerCase()
  if (!l || /^(yes|y|true|normal|ok|then)\b/.test(l)) return 0
  if (/^(no|n|false|otherwise|else|abnormal)\b/.test(l)) return 2
  return 1
}

// ── Tidy layout ────────────────────────────────────────────────────────────
// Top-to-bottom flowchart. Each box's first branch continues straight down
// (the normal path); further branches open to the right. Rows come from the
// longest path, so a box that two branches rejoin sits below both of them.
export function tidyLayout(steps: Step[], edges: Edge[], size: (st: Step) => { w: number; h: number }): Record<string, Pos> {
  const ids = steps.map((s) => s.id)
  const byId = new Map(steps.map((s) => [s.id, s]))
  const out = new Map<string, string[]>(ids.map((id) => [id, []]))
  const indeg = new Map<string, number>(ids.map((id) => [id, 0]))
  const sorted = [...edges].sort((a, b) => branchRank(a.label) - branchRank(b.label))
  for (const e of sorted) {
    if (e.from === e.to || !out.has(e.from) || !out.has(e.to)) continue
    if (out.get(e.from)!.includes(e.to)) continue
    out.get(e.from)!.push(e.to)
    indeg.set(e.to, indeg.get(e.to)! + 1)
  }

  // DFS: spanning tree + back edges (loops such as "No → repeat step 2")
  const state = new Map<string, 1 | 2>()
  const back = new Set<string>()
  const kids = new Map<string, string[]>()
  const roots: string[] = []
  const dfs = (u: string) => {
    state.set(u, 1)
    kids.set(u, [])
    for (const v of out.get(u)!) {
      if (state.get(v) === 1) back.add(`${u}>${v}`)
      else if (!state.has(v)) { kids.get(u)!.push(v); dfs(v) }
    }
    state.set(u, 2)
  }
  for (const id of ids) if (indeg.get(id) === 0 && !state.has(id)) { roots.push(id); dfs(id) }
  for (const id of ids) if (!state.has(id)) { roots.push(id); dfs(id) }

  // rows: longest path over the loop-free graph (Kahn order)
  const row = new Map<string, number>(ids.map((id) => [id, 0]))
  const deg = new Map<string, number>(ids.map((id) => [id, 0]))
  for (const u of ids) for (const v of out.get(u)!) if (!back.has(`${u}>${v}`)) deg.set(v, deg.get(v)! + 1)
  const queue = ids.filter((id) => deg.get(id) === 0)
  while (queue.length) {
    const u = queue.shift()!
    for (const v of out.get(u)!) {
      if (back.has(`${u}>${v}`)) continue
      row.set(v, Math.max(row.get(v)!, row.get(u)! + 1))
      deg.set(v, deg.get(v)! - 1)
      if (deg.get(v) === 0) queue.push(v)
    }
  }

  const dims = new Map(ids.map((id) => [id, size(byId.get(id)!)]))
  const rowH: number[] = []
  for (const id of ids) {
    const r = row.get(id)!
    rowH[r] = Math.max(rowH[r] ?? 0, dims.get(id)!.h)
  }
  const rowTop: number[] = []
  let y = MARGIN
  for (let r = 0; r < rowH.length; r++) {
    rowTop[r] = y
    y += (rowH[r] ?? 0) + GAP_Y
  }

  // columns: measure each subtree's extent around its centre line, then place
  const ext = new Map<string, { l: number; r: number }>()
  const off = new Map<string, number>()
  const measure = (u: string): { l: number; r: number } => {
    const half = dims.get(u)!.w / 2
    let l = half, r = half
    kids.get(u)!.forEach((v, i) => {
      const m = measure(v)
      if (i === 0) {
        off.set(v, 0)
        l = Math.max(l, m.l)
        r = Math.max(r, m.r)
      } else {
        const o = r + GAP_X + m.l
        off.set(v, o)
        r = o + m.r
      }
    })
    ext.set(u, { l, r })
    return { l, r }
  }
  const cx = new Map<string, number>()
  const place = (u: string, x: number) => {
    cx.set(u, x)
    for (const v of kids.get(u)!) place(v, x + off.get(v)!)
  }
  let cursor = MARGIN
  for (const r of roots) {
    const m = measure(r)
    place(r, cursor + m.l)
    cursor += m.l + m.r + GAP_X * 1.5
  }

  const pos: Record<string, Pos> = {}
  for (const id of ids) {
    const d = dims.get(id)!
    const r = row.get(id)!
    pos[id] = { x: Math.round(cx.get(id)! - d.w / 2), y: Math.round(rowTop[r] + (rowH[r] - d.h) / 2) }
  }
  return pos
}
