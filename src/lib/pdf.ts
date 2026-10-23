import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import { Platform } from 'react-native'
import { Annotation, Edge, Flow, Step } from '@/types'
import { STEP_COLORS } from '@/theme'
import { SEAT } from '@/lib/script'
import {
  Pos, NOTE_W, NOTE_H, CARD_PAD, HEAD_GAP, BULLET_ROW, A4_W, A4_H, A4_PAD,
  visibleBullets, cardWidth, cardHeight, impliedEdges, stepNumbers, SCRIPT_PREVIEW,
  edgeGeom, edgePath, arrowHead, labelPoint, placeLabels, tidyLayout,
} from '@/lib/flowGeometry'

const ACCENT = STEP_COLORS[0]
const EDGE_INK = '#8A93A6'

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
}

function positionsFor(flow: Flow, edges: Edge[]): Record<string, Pos> {
  const fallback = tidyLayout(flow.steps, edges, (st) => ({ w: cardWidth(st), h: cardHeight(st) }))
  const pos: Record<string, Pos> = {}
  for (const st of flow.steps) pos[st.id] = st.board ?? fallback[st.id]
  for (const n of flow.notes ?? []) pos[n.id] = { x: n.x, y: n.y }
  return pos
}

// Annotations normalized 0..1 → SVG overlay stretched over the image.
function overlaySvg(annotations: Annotation[]): string {
  const pins = annotations.filter((a) => a.kind === 'pin')
  const parts: string[] = []
  for (const a of annotations) {
    const x = a.x * 100, y = a.y * 100
    const x2 = (a.x2 ?? a.x) * 100, y2 = (a.y2 ?? a.y) * 100
    const w = (a.strokeWidth ?? 0.008) * 100
    if (a.kind === 'arrow') {
      const ang = Math.atan2(y2 - y, x2 - x)
      const hl = Math.max(2, w * 3)
      const q1 = `${x2 - hl * Math.cos(ang - Math.PI / 7)},${y2 - hl * Math.sin(ang - Math.PI / 7)}`
      const q2 = `${x2 - hl * Math.cos(ang + Math.PI / 7)},${y2 - hl * Math.sin(ang + Math.PI / 7)}`
      parts.push(`<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" stroke="${a.color}" stroke-width="${w}" stroke-linecap="round"/>`)
      parts.push(`<polygon points="${x2},${y2} ${q1} ${q2}" fill="${a.color}"/>`)
    } else if (a.kind === 'rect') {
      parts.push(`<rect x="${Math.min(x, x2)}" y="${Math.min(y, y2)}" width="${Math.abs(x2 - x)}" height="${Math.abs(y2 - y)}" fill="none" stroke="${a.color}" stroke-width="${w}"/>`)
    } else if (a.kind === 'oval') {
      parts.push(`<ellipse cx="${(x + x2) / 2}" cy="${(y + y2) / 2}" rx="${Math.abs(x2 - x) / 2}" ry="${Math.abs(y2 - y) / 2}" fill="none" stroke="${a.color}" stroke-width="${w}"/>`)
    } else if (a.kind === 'pin') {
      const n = pins.indexOf(a) + 1
      parts.push(`<circle cx="${x}" cy="${y}" r="2.6" fill="${a.color}" stroke="#fff" stroke-width="0.6"/>`)
      parts.push(`<text x="${x}" y="${y}" fill="#fff" font-size="3" font-weight="700" text-anchor="middle" dominant-baseline="central">${n}</text>`)
    } else if (a.kind === 'text') {
      parts.push(`<text x="${x}" y="${y + 2}" fill="${a.color}" font-size="3.4" font-weight="700">${esc(a.text || '')}</text>`)
    }
  }
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%">${parts.join('')}</svg>`
}

// One card as an absolutely-positioned HTML block, offset into its page.
function cardHtml(st: Step, num: number | undefined, pos: Pos, w: number, h: number, ox: number, oy: number): string {
  const left = pos.x - ox, top = pos.y - oy
  if (st.kind === 'decision') {
    const stroke = st.color ?? '#AEB6C5'
    return `<div class="decision" style="left:${left}px;top:${top}px;width:${w}px;height:${h}px">
      <svg width="${w}" height="${h}"><polygon points="${w / 2},2 ${w - 2},${h / 2} ${w / 2},${h - 2} 2,${h / 2}"
        fill="${st.fill ?? '#FFFFFF'}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round"/></svg>
      <span class="dtext" style="max-width:${Math.round(w * 0.6)}px">${esc(st.title)}</span>
    </div>`
  }
  if (st.kind === 'end') {
    return `<div class="endpill" style="left:${left}px;top:${top}px;width:${w}px;height:${h}px">${esc(st.title)}</div>`
  }
  const vis = visibleBullets(st)
  const small = st.size === 'small'
  const allDone = small ? !!st.checked : vis.length > 0 && vis.every((v) => st.done?.[v.i])
  const doneCount = vis.filter((v) => st.done?.[v.i]).length
  const col = allDone ? '#1FA97A' : (st.color ?? ACCENT)
  const bg = allDone ? '#EDFAF3' : (st.fill ?? '#FFFFFF')

  if (small) {
    return `<div class="card small" style="left:${left}px;top:${top}px;width:${w}px;height:${h}px;border-left-color:${col};background:${bg}">
      <span class="chk ${allDone ? 'on' : ''}">${allDone ? '✓' : ''}</span>
      <span class="stitle ${allDone ? 'done' : ''}">${esc(st.title)}</span>
    </div>`
  }

  const lines = st.script?.length
    ? st.script.slice(0, SCRIPT_PREVIEW).map((l) => {
        const seat = SEAT[l.who]
        return `<div class="brow"><span class="stag" style="background:${seat.tint};color:${seat.ink}">${seat.short}</span><span class="btext${l.say ? ' said' : ''}">${esc(l.say ? `“${l.text}”` : l.text)}</span></div>`
      }).join('') + (st.script.length > SCRIPT_PREVIEW ? `<div class="brow"><span class="btext more">+ ${st.script.length - SCRIPT_PREVIEW} more lines</span></div>` : '')
    : ''
  const bullets = lines || vis.map((v) => {
    const on = !!st.done?.[v.i]
    return `<div class="brow"><span class="chk ${on ? 'on' : ''}">${on ? '✓' : ''}</span><span class="btext ${on ? 'bdone' : ''}">${esc(v.text)}</span></div>`
  }).join('')
  const img = st.image
    ? `<div class="imgwrap"><img src="${st.image.uri}"/>${overlaySvg(st.annotations)}</div>`
    : ''
  const meta = [
    st.script?.length ? `PF ${st.script.filter((l) => l.who === 'PF').length} · PM ${st.script.filter((l) => l.who === 'PM').length}` : '',
    vis.length ? `${doneCount}/${vis.length} done` : '',
    st.annotations.length ? `${st.annotations.length} marks` : '',
    allDone ? 'complete ✓' : '',
  ].filter(Boolean).join('  ·  ')

  return `<div class="card" style="left:${left}px;top:${top}px;width:${w}px;min-height:${h}px;border-left-color:${col};background:${bg}">
    <div class="chead">
      <span class="badge" style="background:${col}">${allDone ? '✓' : num ?? ''}</span>
      <span class="ctitle">${esc(st.title)}</span>
    </div>
    ${bullets || '<div class="cempty">—</div>'}
    ${img}
    <div class="cmeta ${allDone ? 'mdone' : ''}">${meta}</div>
  </div>`
}

export function flowHtml(flow: Flow): string {
  const edges = flow.edges ?? impliedEdges(flow.steps)
  const pos = positionsFor(flow, edges)
  const widths: Record<string, number> = {}
  const heights: Record<string, number> = {}
  for (const st of flow.steps) { widths[st.id] = cardWidth(st); heights[st.id] = cardHeight(st) }
  const notes = flow.notes ?? []
  const decisions = new Set(flow.steps.filter((s) => s.kind === 'decision').map((s) => s.id))
  const numbers = stepNumbers(flow.steps)
  const geom = (e: Edge) => {
    const a = pos[e.from], b = pos[e.to]
    if (!a || !b) return null
    return edgeGeom(
      { ...a, w: widths[e.from], h: heights[e.from] },
      { ...b, w: widths[e.to], h: heights[e.to] },
      decisions.has(e.from),
    )
  }

  // content bounds → page grid
  let maxX = A4_PAD + A4_W, maxY = A4_PAD + A4_H
  for (const st of flow.steps) {
    const p = pos[st.id]; if (!p) continue
    maxX = Math.max(maxX, p.x + widths[st.id]); maxY = Math.max(maxY, p.y + heights[st.id])
  }
  for (const n of notes) {
    maxX = Math.max(maxX, n.x + NOTE_W); maxY = Math.max(maxY, n.y + NOTE_H)
  }
  const cols = Math.max(1, Math.ceil((maxX - A4_PAD) / A4_W))
  const rows = Math.max(1, Math.ceil((maxY - A4_PAD) / A4_H))

  // Shared SVG guts (edges) rendered per page via a viewBox crop.
  const edgePaths = edges.map((e) => {
    const g = geom(e)
    if (!g) return ''
    const col = e.color ?? EDGE_INK
    return `<path d="${edgePath(g)}" stroke="${col}" stroke-width="2" fill="none" stroke-linecap="round" ${e.dashed ? 'stroke-dasharray="7,6"' : ''}/>` +
      `<polygon points="${arrowHead(g)}" fill="${col}"/>`
  }).join('')

  const labelItems: { id: string; pt: Pos; text: string; dec: boolean }[] = []
  for (const e of edges) {
    const g = e.label ? geom(e) : null
    if (g) labelItems.push({ id: e.id, pt: labelPoint(g, decisions.has(e.from)), text: e.label!, dec: decisions.has(e.from) })
  }
  labelItems.sort((a, b) => Number(b.dec) - Number(a.dec))
  const labelAt = placeLabels(labelItems)

  const pages: string[] = []
  let n = 1
  const total = cols * rows
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ox = A4_PAD + c * A4_W, oy = A4_PAD + r * A4_H
      const svg = `<svg class="edges" viewBox="${ox} ${oy} ${A4_W} ${A4_H}" preserveAspectRatio="none">${edgePaths}</svg>`
      const cards = flow.steps.map((st) => {
        const p = pos[st.id]; if (!p) return ''
        return cardHtml(st, numbers[st.id], p, widths[st.id], heights[st.id], ox, oy)
      }).join('')
      const noteEls = notes.map((nt) => {
        const bg = nt.color ?? '#FFF3B8'
        return `<div class="note" style="left:${nt.x - ox}px;top:${nt.y - oy}px;background:${bg}">
          <div class="ntext">${esc(nt.text)}</div><div class="nlabel">NOTE</div></div>`
      }).join('')
      const labels = edges.map((e) => {
        if (!e.label) return ''
        const pt = labelAt[e.id]; if (!pt) return ''
        const tint = e.color ? `border-color:${e.color};color:${e.color}` : ''
        return `<div class="elwrap" style="left:${pt.x - ox - 90}px;top:${pt.y - oy - 12}px"><span class="elabel" style="${tint}">${esc(e.label)}</span></div>`
      }).join('')
      const num = total > 1 ? `<div class="pnum">A4 · ${n} / ${total}</div>` : ''
      pages.push(`<div class="page">${svg}${labels}${cards}${noteEls}${num}</div>`)
      n++
    }
  }

  return `<!doctype html><html><head><meta charset="utf-8"/>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1B2130; }
    .page { position: relative; width: ${A4_W}px; height: ${A4_H}px; overflow: hidden; page-break-after: always; background: #fff; }
    .page:last-child { page-break-after: auto; }
    .edges { position: absolute; inset: 0; width: 100%; height: 100%; }
    .card { position: absolute; background: #fff; border: 1px solid #E2E6EF; border-left-width: 4px; border-radius: 14px; padding: ${CARD_PAD}px;
            box-shadow: 0 3px 8px rgba(27,33,48,0.08); }
    .card.small { display: flex; align-items: center; gap: 8px; border-radius: 12px; padding: 0 12px; }
    .chead { display: flex; align-items: flex-start; gap: 8px; margin-bottom: ${HEAD_GAP}px; }
    .badge { flex: 0 0 24px; height: 24px; border-radius: 999px; color: #fff; font-weight: 800; font-size: 11px;
             display: flex; align-items: center; justify-content: center; }
    .ctitle { font-size: 15px; font-weight: 800; line-height: 20px; }
    .stitle { font-size: 13px; font-weight: 800; }
    .stitle.done { color: #1FA97A; }
    .brow { display: flex; align-items: center; gap: 8px; height: ${BULLET_ROW}px; }
    .chk { flex: 0 0 16px; width: 16px; height: 16px; border-radius: 5px; border: 2px solid #C7CDDA;
           display: flex; align-items: center; justify-content: center; font-size: 10px; color: #fff; font-weight: 800; }
    .chk.on { background: #1FA97A; border-color: #1FA97A; }
    .small .chk { width: 18px; height: 18px; }
    .btext { font-size: 13px; color: #6E7787; }
    .btext.bdone { color: #1FA97A; text-decoration: line-through; }
    .stag { flex: 0 0 auto; min-width: 30px; height: 16px; border-radius: 5px; font-size: 9px; font-weight: 800;
            display: flex; align-items: center; justify-content: center; padding: 0 4px; }
    .btext.said { color: #1B2130; font-weight: 600; }
    .btext.more { color: #A2AABB; }
    .brow .btext { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cempty { color: #A2AABB; font-size: 13px; }
    .cmeta { margin-top: 6px; font-size: 11px; color: #A2AABB; font-weight: 700; }
    .cmeta.mdone { color: #1FA97A; }
    .imgwrap { position: relative; margin-top: 8px; border-radius: 8px; overflow: hidden; border: 1px solid #E2E6EF; }
    .imgwrap img { display: block; width: 100%; }
    .note { position: absolute; width: ${NOTE_W}px; min-height: ${NOTE_H}px; border-radius: 12px; padding: 12px;
            box-shadow: 0 3px 8px rgba(27,33,48,0.08); }
    .ntext { font-size: 13px; font-weight: 600; color: #1B2130; }
    .nlabel { margin-top: 8px; font-size: 10px; font-weight: 800; color: #6E7787; letter-spacing: .5px; }
    .elwrap { position: absolute; width: 180px; text-align: center; }
    .elabel { display: inline-block; font-size: 11px; font-weight: 700; color: #1B2130;
              background: #fff; border: 1px solid #E2E6EF; border-radius: 999px; padding: 2px 10px; }
    .decision { position: absolute; display: flex; align-items: center; justify-content: center; }
    .decision svg { position: absolute; inset: 0; }
    .dtext { position: relative; text-align: center; font-size: 13px; font-weight: 700; line-height: 17px; }
    .endpill { position: absolute; display: flex; align-items: center; justify-content: center; border: 1.5px solid #1B2130;
               border-radius: 999px; background: #fff; font-size: 13px; font-weight: 800; }
    .pnum { position: absolute; right: 16px; bottom: 12px; font-size: 10px; font-weight: 800; color: #A2AABB; }
  </style></head><body>${pages.join('')}</body></html>`
}

export async function exportFlowPdf(flow: Flow): Promise<void> {
  const html = flowHtml(flow)
  if (Platform.OS === 'web') {
    // expo-print on web opens the browser print dialog (→ Save as PDF).
    await Print.printAsync({ html })
    return
  }
  const { uri } = await Print.printToFileAsync({ html })
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: flow.title, UTI: 'com.adobe.pdf' })
  }
}
