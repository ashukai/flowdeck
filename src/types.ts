// Core domain model. Deliberately SOP-agnostic so the same shapes serve
// pilots (type-rating flows), nurses (clinical SOPs), etc.

export type AnnotationKind = 'arrow' | 'rect' | 'oval' | 'pin' | 'text'

// All geometry is stored NORMALIZED to the image box (0..1), so annotations
// stay correct at any render size and survive PDF export.
export interface Annotation {
  id: string
  kind: AnnotationKind
  color: string
  // anchor point (pin/text) OR start point (arrow) OR top-left (rect/oval)
  x: number
  y: number
  // end point (arrow) OR bottom-right offset (rect/oval). Unused for pin/text.
  x2?: number
  y2?: number
  text?: string        // for `text` labels and `pin` callouts
  strokeWidth?: number // normalized to image width; defaults applied at render
}

export interface StepImage {
  uri: string
  width: number   // intrinsic px, for aspect ratio
  height: number
}

// Who a script line belongs to. PF and PM are the two pilots; the rest are
// voices from outside the flight deck.
export type Seat = 'PF' | 'PM' | 'GND' | 'ATC' | 'CABIN' | 'BOTH'

// One line of a two-crew procedure, in order: either said aloud (a callout)
// or done (an action / check).
export interface ScriptLine {
  id: string
  who: Seat
  say: boolean      // true = spoken callout, false = action or check
  text: string
  key?: boolean     // ● a point of the basic procedure
  forget?: boolean  // ★ easy to forget or get wrong
  note?: string     // small explanation under the line
}

export interface Step {
  id: string
  title: string
  bullets: string[]
  // Done-state per bullet (same indexes as `bullets`); used for study/checklist mode.
  done?: boolean[]
  note?: string
  image?: StepImage
  annotations: Annotation[]
  color?: string // border/accent color on the whiteboard (badge, stripe, outline)
  fill?: string  // inside background color of the card
  // Custom size on the whiteboard (board coords). Absent = auto-sized.
  w?: number
  h?: number
  // What the box is on the whiteboard. Absent = a normal step.
  //   'decision' — a diamond holding a yes/no question; its arrows are the branches
  //   'end'      — a start/end marker (pill)
  kind?: 'decision' | 'end'
  // 'small' renders as a compact title-only box with a single check;
  // bullets are kept but hidden until converted back to normal size.
  size?: 'small'
  checked?: boolean // box-level done state for small boxes
  // The PF / PM dialogue for this phase, in order.
  script?: ScriptLine[]
  // Free position on the flow whiteboard (board coordinates). Auto-laid-out when absent.
  board?: { x: number; y: number }
}

// Explicit connection between two steps on the whiteboard.
// When a flow has no `edges`, sequential connections are implied.
export interface Edge {
  id: string
  from: string // step id
  to: string   // step id
  color?: string
  dashed?: boolean
  label?: string // condition, e.g. "N2 stable & fuel flow normal"
}

// Free-floating explanation / sticky note on the whiteboard.
export interface BoardNote {
  id: string
  x: number
  y: number
  text: string
  color?: string
}

export interface Flow {
  id: string
  title: string
  category: string      // e.g. "A320 Type Rating", "ICU Admission"
  description?: string
  accent?: string        // optional per-flow color
  steps: Step[]
  edges?: Edge[]
  notes?: BoardNote[]
  // Practice record per script line: how often it was got right / missed.
  drill?: Record<string, { got: number; miss: number }>
  createdAt: number
  updatedAt: number
}

export type FlowMeta = Pick<Flow, 'id' | 'title' | 'category' | 'description' | 'accent'>
