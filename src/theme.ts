// Central design tokens. Kept flat and import-friendly: `import { C, R, S, F } from '@/theme'`.
// Light design: soft off-white surfaces, ink text, blue accent.
export const C = {
  bg:        '#F5F6FA',  // app background
  bg2:       '#FFFFFF',  // cards / surfaces
  bg3:       '#EDF0F6',  // raised / inputs
  border:    '#E2E6EF',
  text:      '#1B2130',
  muted:     '#6E7787',
  faint:     '#A2AABB',
  accent:    '#3D6DE8',  // primary action
  accent2:   '#2F55C4',
  accentSoft:'#E9EFFD',
  danger:    '#E23A5F',
  dangerSoft:'#FCEBF0',
  success:   '#1FA97A',
  warn:      '#D9950A',
  boardDot:  '#D5DAE6',  // whiteboard dot grid
} as const

// Border / accent colors selectable on the whiteboard (first entry = default).
export const STEP_COLORS = [
  '#3D6DE8', // blue (default)
  '#1FA97A', // green
  '#E8912D', // orange
  '#E23A5F', // red
  '#8B5CF6', // purple
  '#0EA5B7', // teal
  '#EC4899', // pink
  '#65A30D', // lime
  '#0284C7', // sky
  '#78716C', // stone
  '#1B2130', // ink
] as const

// Inside fill tints for cards (first entry = plain white / no tint).
export const STEP_FILLS = [
  '#FFFFFF', // white (default)
  '#EAF1FF', // blue tint
  '#E7F7F0', // green tint
  '#FDF0E1', // orange tint
  '#FCEBEF', // red tint
  '#F3ECFE', // purple tint
  '#E6F7F9', // teal tint
  '#FCE9F3', // pink tint
  '#F1F7E4', // lime tint
  '#EEF2F6', // grey tint
] as const

// Sticky-note fills for explanation boxes.
export const NOTE_COLORS = [
  '#FFF3B8', // yellow
  '#DFF5E3', // mint
  '#FFE1E1', // rose
  '#E3EDFF', // sky
  '#F1E5FF', // lilac
] as const

// Annotation palette — high-contrast colors that survive screenshots & print.
export const ANNOT_COLORS = [
  '#FF3B30', // red
  '#FF9500', // orange
  '#FFD60A', // yellow
  '#34C759', // green
  '#0A84FF', // blue
  '#FFFFFF', // white
  '#000000', // black
] as const

export const R = { lg: 18, md: 14, sm: 10, xs: 6 } as const
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 36 } as const
export const F = {
  h1: 26, h2: 20, h3: 17, body: 15, small: 13, tiny: 11,
} as const
