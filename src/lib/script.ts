import { ScriptLine, Seat } from '@/types'
import { uid } from '@/lib/id'

// Seats in the order they're offered, with the PF-cyan / PM-yellow coding
// pilots already use when they colour their procedure notes.
export const SEATS: Seat[] = ['PF', 'PM', 'GND', 'ATC', 'CABIN', 'BOTH']

export const SEAT: Record<Seat, { name: string; short: string; ink: string; tint: string; line: string }> = {
  PF:    { name: 'PF',     short: 'PF',  ink: '#06788A', tint: '#E2F6F9', line: '#5CC9D9' },
  PM:    { name: 'PM',     short: 'PM',  ink: '#8A6500', tint: '#FFF5D1', line: '#E9C24A' },
  GND:   { name: 'Ground', short: 'GND', ink: '#59617A', tint: '#EEF1F6', line: '#C3CAD8' },
  ATC:   { name: 'ATC',    short: 'ATC', ink: '#59617A', tint: '#EEF1F6', line: '#C3CAD8' },
  CABIN: { name: 'Cabin',  short: 'CAB', ink: '#59617A', tint: '#EEF1F6', line: '#C3CAD8' },
  BOTH:  { name: 'Both',   short: 'PF+PM', ink: '#3D4660', tint: '#EEF1F6', line: '#C3CAD8' },
}

export const isPilot = (s: Seat) => s === 'PF' || s === 'PM'

const ROLE_WORDS: Record<string, Seat> = {
  pf: 'PF', 'pilot flying': 'PF',
  pm: 'PM', pnf: 'PM', 'pilot monitoring': 'PM',
  gnd: 'GND', ground: 'GND', 'ground crew': 'GND',
  atc: 'ATC', tower: 'ATC', delivery: 'ATC',
  cabin: 'CABIN', cab: 'CABIN', 'cabin crew': 'CABIN',
  both: 'BOTH', 'pf/pm': 'BOTH', 'pf+pm': 'BOTH',
}

const QUOTED = /^["“”「『](.*?)["“”」』]?$/

// One typed or pasted line → a script line. Understands:
//   PF: "Before start checklist"     callout (quoted)
//   PM ★: Set the transponder        action, easy to forget
//   3. PF ●: "Before start checklist" numbering is ignored
//   ... // a note after two slashes
export function lineFromText(raw: string, fallback: Seat): ScriptLine | null {
  let t = raw.trim().replace(/^\d+[.)]\s*/, '')
  if (!t) return null
  let who = fallback
  const m = t.match(/^([A-Za-z/+ ]{2,18}?)\s*([●★*!]*)\s*[:：]\s*(.*)$/)
  if (m && ROLE_WORDS[m[1].trim().toLowerCase()]) {
    who = ROLE_WORDS[m[1].trim().toLowerCase()]
    t = `${m[2]} ${m[3]}`.trim()
  }
  let note: string | undefined
  const slash = t.indexOf(' // ')
  if (slash >= 0) { note = t.slice(slash + 4).trim() || undefined; t = t.slice(0, slash) }
  const key = /[●]/.test(t) || /(^|\s)!(\s|$)/.test(t)
  const forget = /[★*]/.test(t)
  t = t.replace(/[●★]/g, '').replace(/(^|\s)[!*](?=\s|$)/g, ' ').trim()
  const q = t.match(QUOTED)
  const say = !!q && /^["“「『]/.test(t)
  const text = (say ? q![1] : t).trim()
  if (!text) return null
  return { id: uid('ln_'), who, say, text, key: key || undefined, forget: forget || undefined, note }
}

// Pasted block → lines. A tab in a row without a role means a two-column
// table copied from Word or Excel: left cell PF, right cell PM.
export function parseScript(block: string, start: Seat = 'PF'): ScriptLine[] {
  const out: ScriptLine[] = []
  let who: Seat = start
  for (const row of block.replace(/\r\n?/g, '\n').split('\n')) {
    if (!row.trim()) continue
    if (row.includes('\t') && !/^\s*\d*[.)]?\s*[A-Za-z/+ ]{2,18}?\s*[●★*!]*\s*[:：]/.test(row)) {
      const [left, right] = row.split('\t')
      const a = left ? lineFromText(left, 'PF') : null
      const b = right ? lineFromText(right, 'PM') : null
      if (a) out.push({ ...a, who: 'PF' })
      if (b) out.push({ ...b, who: 'PM' })
      if (b) who = 'PF'
      continue
    }
    const l = lineFromText(row, who)
    if (l) { out.push(l); who = l.who }
  }
  return out
}

export function scriptCounts(script: ScriptLine[] = []) {
  return {
    pf: script.filter((l) => l.who === 'PF').length,
    pm: script.filter((l) => l.who === 'PM').length,
    other: script.filter((l) => !isPilot(l.who)).length,
    forget: script.filter((l) => l.forget).length,
    key: script.filter((l) => l.key).length,
  }
}

// Speak a callout aloud where the device can (browsers, including iPhone Safari).
export function speak(text: string) {
  try {
    const synth = (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis
    if (!synth) return
    synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-US'
    u.rate = 1.02
    synth.speak(u)
  } catch {}
}
