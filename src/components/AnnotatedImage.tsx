import { useRef, useState } from 'react'
import { View, Text, PanResponder, LayoutChangeEvent, StyleSheet, GestureResponderEvent } from 'react-native'
import { Image } from 'expo-image'
import Svg, { Line, Rect, Ellipse, Polygon, Circle, G } from 'react-native-svg'
import { Annotation, AnnotationKind, StepImage } from '@/types'
import { uid } from '@/lib/id'
import { C, F } from '@/theme'

export type Tool = 'select' | AnnotationKind

const DEFAULT_STROKE = 0.008 // normalized to image width

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n))
}

// Distance from point to a line segment, in normalized units.
function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy || 1e-6
  let t = ((px - ax) * dx + (py - ay) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * dx, cy = ay + t * dy
  return Math.hypot(px - cx, py - cy)
}

function hitTest(a: Annotation, x: number, y: number): boolean {
  const pad = 0.03
  switch (a.kind) {
    case 'arrow':
      return distToSeg(x, y, a.x, a.y, a.x2 ?? a.x, a.y2 ?? a.y) < 0.04
    case 'rect':
    case 'oval': {
      const x1 = Math.min(a.x, a.x2 ?? a.x), x2 = Math.max(a.x, a.x2 ?? a.x)
      const y1 = Math.min(a.y, a.y2 ?? a.y), y2 = Math.max(a.y, a.y2 ?? a.y)
      return x >= x1 - pad && x <= x2 + pad && y >= y1 - pad && y <= y2 + pad
    }
    case 'pin':
    case 'text':
      return Math.hypot(x - a.x, y - a.y) < 0.06
  }
}

export function AnnotatedImage({
  image,
  annotations,
  editable = false,
  tool = 'select',
  color = '#FF3B30',
  selectedId,
  onSelect,
  onChange,
  maxHeight,
}: {
  image: StepImage
  annotations: Annotation[]
  editable?: boolean
  tool?: Tool
  color?: string
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  onChange?: (next: Annotation[]) => void
  maxHeight?: number
}) {
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [draft, setDraft] = useState<Annotation | null>(null)
  const dragRef = useRef<{ id: string; sx: number; sy: number; orig: Annotation } | null>(null)

  // Fit the image into available width while preserving aspect ratio.
  const aspect = image.width && image.height ? image.width / image.height : 16 / 9
  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width
    let h = w / aspect
    if (maxHeight && h > maxHeight) h = maxHeight
    setBox({ w, h })
  }

  const toNorm = (e: GestureResponderEvent) => ({
    x: clamp01(e.nativeEvent.locationX / (box.w || 1)),
    y: clamp01(e.nativeEvent.locationY / (box.h || 1)),
  })

  const commit = (next: Annotation[]) => onChange?.(next)

  const responder = PanResponder.create({
    onStartShouldSetPanResponder: () => editable,
    onMoveShouldSetPanResponder: () => editable,
    onPanResponderGrant: (e) => {
      const { x, y } = toNorm(e)
      if (tool === 'select') {
        // topmost hit wins
        const hit = [...annotations].reverse().find((a) => hitTest(a, x, y))
        onSelect?.(hit ? hit.id : null)
        if (hit) dragRef.current = { id: hit.id, sx: x, sy: y, orig: hit }
        return
      }
      if (tool === 'pin' || tool === 'text') {
        const a: Annotation = {
          id: uid('an_'),
          kind: tool,
          color,
          x, y,
          text: tool === 'text' ? 'Label' : '',
        }
        commit([...annotations, a])
        onSelect?.(a.id)
        return
      }
      // drawing arrow / rect / oval
      setDraft({ id: uid('an_'), kind: tool, color, x, y, x2: x, y2: y, strokeWidth: DEFAULT_STROKE })
    },
    onPanResponderMove: (e) => {
      const { x, y } = toNorm(e)
      if (tool === 'select' && dragRef.current) {
        const d = dragRef.current
        const dx = x - d.sx, dy = y - d.sy
        const o = d.orig
        const moved: Annotation = {
          ...o,
          x: clamp01(o.x + dx),
          y: clamp01(o.y + dy),
          x2: o.x2 != null ? clamp01(o.x2 + dx) : undefined,
          y2: o.y2 != null ? clamp01(o.y2 + dy) : undefined,
        }
        commit(annotations.map((a) => (a.id === o.id ? moved : a)))
        return
      }
      if (draft) setDraft({ ...draft, x2: x, y2: y })
    },
    onPanResponderRelease: () => {
      dragRef.current = null
      if (draft) {
        const big = Math.hypot((draft.x2 ?? 0) - draft.x, (draft.y2 ?? 0) - draft.y) > 0.02
        if (big) {
          commit([...annotations, draft])
          onSelect?.(draft.id)
        }
        setDraft(null)
      }
    },
  })

  const all = draft ? [...annotations, draft] : annotations
  const sw = (a: Annotation) => Math.max(2, (a.strokeWidth ?? DEFAULT_STROKE) * box.w)

  return (
    <View onLayout={onLayout} style={{ width: '100%' }}>
      <View style={{ width: box.w, height: box.h, backgroundColor: '#000', borderRadius: 8, overflow: 'hidden' }}>
        <Image source={{ uri: image.uri }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
        {box.w > 0 && (
          <Svg width={box.w} height={box.h} style={StyleSheet.absoluteFill}>
            {all.map((a) => {
              const selected = a.id === selectedId
              const x = a.x * box.w, y = a.y * box.h
              const x2 = (a.x2 ?? a.x) * box.w, y2 = (a.y2 ?? a.y) * box.h
              if (a.kind === 'arrow') {
                const ang = Math.atan2(y2 - y, x2 - x)
                const hl = Math.max(10, sw(a) * 3.2)
                const p1x = x2 - hl * Math.cos(ang - Math.PI / 7)
                const p1y = y2 - hl * Math.sin(ang - Math.PI / 7)
                const p2x = x2 - hl * Math.cos(ang + Math.PI / 7)
                const p2y = y2 - hl * Math.sin(ang + Math.PI / 7)
                return (
                  <G key={a.id}>
                    <Line x1={x} y1={y} x2={x2} y2={y2} stroke={a.color} strokeWidth={sw(a)} strokeLinecap="round" />
                    <Polygon points={`${x2},${y2} ${p1x},${p1y} ${p2x},${p2y}`} fill={a.color} />
                    {selected && <Circle cx={x} cy={y} r={sw(a) + 4} fill="none" stroke={C.accent} strokeWidth={2} />}
                  </G>
                )
              }
              if (a.kind === 'rect') {
                const rx = Math.min(x, x2), ry = Math.min(y, y2)
                return (
                  <Rect
                    key={a.id}
                    x={rx} y={ry}
                    width={Math.abs(x2 - x)} height={Math.abs(y2 - y)}
                    fill="none" stroke={a.color} strokeWidth={sw(a)}
                    rx={4}
                    strokeDasharray={selected ? '6,4' : undefined}
                  />
                )
              }
              if (a.kind === 'oval') {
                return (
                  <Ellipse
                    key={a.id}
                    cx={(x + x2) / 2} cy={(y + y2) / 2}
                    rx={Math.abs(x2 - x) / 2} ry={Math.abs(y2 - y) / 2}
                    fill="none" stroke={a.color} strokeWidth={sw(a)}
                    strokeDasharray={selected ? '6,4' : undefined}
                  />
                )
              }
              if (a.kind === 'pin') {
                const r = Math.max(11, box.w * 0.022)
                return (
                  <Circle
                    key={a.id}
                    cx={x} cy={y} r={r}
                    fill={a.color}
                    stroke={selected ? C.accent : '#fff'} strokeWidth={selected ? 3 : 2}
                  />
                )
              }
              return null
            })}
          </Svg>
        )}

        {/* Pin numbers + text labels overlaid as real text for crisp rendering */}
        {box.w > 0 &&
          all.map((a, i) => {
            if (a.kind === 'pin') {
              const r = Math.max(11, box.w * 0.022)
              return (
                <Text
                  key={a.id}
                  style={{
                    position: 'absolute',
                    left: a.x * box.w - r,
                    top: a.y * box.h - r,
                    width: r * 2,
                    height: r * 2,
                    lineHeight: r * 2,
                    textAlign: 'center',
                    color: '#fff',
                    fontWeight: '800',
                    fontSize: r,
                  }}
                >
                  {all.filter((x) => x.kind === 'pin').indexOf(a) + 1}
                </Text>
              )
            }
            if (a.kind === 'text') {
              return (
                <View
                  key={a.id}
                  style={{
                    position: 'absolute',
                    left: a.x * box.w,
                    top: a.y * box.h,
                    maxWidth: box.w * 0.7,
                    backgroundColor: a.color,
                    borderRadius: 6,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderWidth: a.id === selectedId ? 2 : 0,
                    borderColor: C.accent,
                  }}
                >
                  <Text style={{ color: pickFg(a.color), fontWeight: '700', fontSize: F.small }}>
                    {a.text || 'Label'}
                  </Text>
                </View>
              )
            }
            return null
          })}

        {editable && <View style={StyleSheet.absoluteFill} {...responder.panHandlers} />}
      </View>
    </View>
  )
}

// Choose readable text color for a given background.
function pickFg(hex: string): string {
  const h = hex.replace('#', '')
  if (h.length < 6) return '#000'
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq >= 150 ? '#000' : '#fff'
}
