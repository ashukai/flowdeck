import { useFlows } from '@/store/useFlows'
import { Edge, Step } from '@/types'
import { cardHeight, cardWidth, tidyLayout } from '@/lib/flowGeometry'

// Seeds a small illustrative flow so a new user sees the shape of things:
// steps, a yes/no condition, an abort branch that loops back, and end markers.
// Text-only (no bundled images) — screenshots get added by the user.
export function seedExampleFlow(): string {
  const store = useFlows.getState()
  const id = store.createFlow({
    title: 'Engine start — A320',
    category: 'Example',
    description: 'Normal start with an abort branch. Replace the items with your operator SOP.',
  })

  const add = (title: string, patch: Partial<Step> = {}) => {
    const sid = store.addStep(id, title)!
    store.updateStep(id, sid, patch)
    return sid
  }

  const before = add('Before start', { bullets: ['APU BLEED — ON', 'Beacon — ON', 'Thrust levers — IDLE'] })
  const eng2 = add('Start engine 2', { bullets: ['ENG MODE selector — IGN/START', 'ENG 2 master — ON', 'Monitor N2, fuel flow, EGT'] })
  const check = add('Light-off and N2 normal?', { kind: 'decision' })
  const eng1 = add('Start engine 1', { bullets: ['ENG 1 master — ON', 'Parameters stabilise'] })
  const after = add('After start', { bullets: ['ENG MODE selector — NORM', 'APU BLEED — OFF', 'Ground equipment — clear'] })
  const ready = add('Ready for taxi', { kind: 'end' })
  const abort = add('Abort start', { bullets: ['ENG master — OFF', 'Follow the QRH'] })

  const edges: Edge[] = [
    { id: 'ex_1', from: before, to: eng2 },
    { id: 'ex_2', from: eng2, to: check },
    { id: 'ex_3', from: check, to: eng1, label: 'Yes' },
    { id: 'ex_4', from: check, to: abort, label: 'No' },
    { id: 'ex_5', from: eng1, to: after },
    { id: 'ex_6', from: after, to: ready },
    { id: 'ex_7', from: abort, to: eng2, label: 'Retry when cleared', dashed: true },
  ]
  store.setEdges(id, edges)

  const flow = useFlows.getState().flows.find((f) => f.id === id)!
  const pos = tidyLayout(flow.steps, edges, (st) => ({ w: cardWidth(st), h: cardHeight(st) }))
  // leave room on the left for the note beside the condition
  for (const k of Object.keys(pos)) pos[k] = { x: pos[k].x + 260, y: pos[k].y }
  for (const st of flow.steps) store.updateStep(id, st.id, { board: pos[st.id] })

  const c = pos[check]
  store.setNotes(id, [
    {
      id: 'note_seed_1',
      x: c.x - 260,
      y: c.y,
      text: 'EGT rising without N2 = hung start. Abort before continuing.',
      color: '#FFF3B8',
    },
  ])

  return id
}
