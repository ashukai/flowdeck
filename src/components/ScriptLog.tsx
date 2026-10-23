import { View, Text, StyleSheet } from 'react-native'
import { Icon } from '@/components/Icon'
import { SEAT, isPilot } from '@/lib/script'
import { ScriptLine } from '@/types'
import { C, S, F } from '@/theme'

// A phase's dialogue as a conversation: PF on the left, PM on the right,
// Ground / ATC / Cabin in the middle. `hidden` turns the current line into
// a blank "your turn" bubble so it can be recalled before it's shown.
export function ScriptBubble({ line, n, hidden, mine, result }: {
  line: ScriptLine
  n: number
  hidden?: boolean
  mine?: boolean
  result?: 'got' | 'miss'
}) {
  const seat = SEAT[line.who]
  const align = line.who === 'PF' ? 'flex-start' : line.who === 'PM' ? 'flex-end' : 'center'
  return (
    <View style={[styles.row, { alignItems: align }]}>
      <View
        style={[
          styles.bubble,
          { backgroundColor: hidden ? C.bg2 : seat.tint, borderColor: hidden ? seat.line : 'transparent' },
          hidden && styles.hidden,
          mine && !hidden && { borderColor: seat.line },
          !isPilot(line.who) && { maxWidth: '70%' },
        ]}
      >
        <View style={styles.head}>
          <Text style={styles.n}>{n}</Text>
          <Text style={[styles.who, { color: seat.ink }]}>{seat.name}{mine ? ' · you' : ''}</Text>
          {line.key && <Text style={styles.key}>●</Text>}
          {line.forget && <Text style={styles.star}>★</Text>}
          {result && (
            <View style={[styles.result, result === 'got' ? styles.got : styles.miss]}>
              <Icon name={result === 'got' ? 'check' : 'x'} size={11} color="#fff" strokeWidth={3} />
            </View>
          )}
        </View>
        {hidden ? (
          <Text style={styles.prompt}>{line.say ? 'Your call — say it' : 'Your action — do it'}</Text>
        ) : (
          <Text style={[styles.text, line.say && styles.said]}>{line.say ? `“${line.text}”` : line.text}</Text>
        )}
        {!hidden && !!line.note && <Text style={styles.note}>{line.note}</Text>}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { width: '100%' },
  bubble: { maxWidth: '82%', minWidth: 140, borderRadius: 16, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 10, gap: 3 },
  hidden: { borderStyle: 'dashed' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  n: { color: C.faint, fontSize: F.tiny, fontWeight: '700', fontVariant: ['tabular-nums'] },
  who: { fontSize: F.tiny, fontWeight: '800', letterSpacing: 0.3 },
  key: { color: C.danger, fontSize: 10 },
  star: { color: '#D9950A', fontSize: 11 },
  result: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' as any },
  got: { backgroundColor: C.success },
  miss: { backgroundColor: C.danger },
  text: { color: C.text, fontSize: 17, lineHeight: 24, letterSpacing: -0.2 },
  said: { fontWeight: '700' },
  prompt: { color: C.muted, fontSize: F.body, fontWeight: '600', paddingVertical: 2 },
  note: { color: C.muted, fontSize: F.small, lineHeight: 18 },
})

export const scriptGap = S.sm
