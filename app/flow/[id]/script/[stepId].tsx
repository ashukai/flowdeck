import { useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView, Pressable, StyleSheet, TextInput, Modal, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { useFlows } from '@/store/useFlows'
import { useLayout } from '@/lib/responsive'
import { Button, IconButton } from '@/components/ui'
import { Icon } from '@/components/Icon'
import { SEAT, SEATS, isPilot, parseScript, scriptCounts } from '@/lib/script'
import { uid } from '@/lib/id'
import { ScriptLine, Seat } from '@/types'
import { C, S, F } from '@/theme'

// The PF / PM dialogue inside one phase, written the way the procedure pages
// lay it out: numbered lines, PF on the left, PM on the right.

const MONO = Platform.select({ ios: 'Menlo', default: 'ui-monospace, Menlo, monospace' })

export default function ScriptEditor() {
  const { id, stepId } = useLocalSearchParams<{ id: string; stepId: string }>()
  const router = useRouter()
  const { wide, width } = useLayout()
  const twoCol = width >= 700
  const flow = useFlows((s) => s.flows.find((f) => f.id === id))
  const step = flow?.steps.find((st) => st.id === stepId)
  const setScript = useFlows((s) => s.setScript)

  const [editing, setEditing] = useState<string | null>(null)
  const [pasting, setPasting] = useState(false)
  const [pasteText, setPasteText] = useState('')

  const script = step?.script ?? []
  const counts = useMemo(() => scriptCounts(script), [script])
  const preview = useMemo(() => (pasting ? parseScript(pasteText, lastPilot(script)) : []), [pasting, pasteText, script])

  // empty lines left behind when leaving the page are dropped
  useEffect(() => {
    const fid = flow?.id, sid = step?.id
    return () => {
      if (!fid || !sid) return
      const st = useFlows.getState().flows.find((f) => f.id === fid)?.steps.find((x) => x.id === sid)
      const kept = (st?.script ?? []).filter((l) => l.text.trim())
      if (st?.script && kept.length !== st.script.length) useFlows.getState().setScript(fid, sid, kept)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!flow || !step) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>This box no longer exists.</Text>
        <Button label="Back" variant="soft" onPress={() => router.back()} />
      </View>
    )
  }

  const save = (next: ScriptLine[]) => setScript(flow.id, step.id, next)
  const patch = (lid: string, p: Partial<ScriptLine>) => save(script.map((l) => (l.id === lid ? { ...l, ...p } : l)))
  const remove = (lid: string) => { save(script.filter((l) => l.id !== lid)); setEditing(null) }
  const move = (lid: string, dir: -1 | 1) => {
    const i = script.findIndex((l) => l.id === lid), j = i + dir
    if (i < 0 || j < 0 || j >= script.length) return
    const next = [...script]; [next[i], next[j]] = [next[j], next[i]]; save(next)
  }
  const insertAfter = (lines: ScriptLine[]) => {
    const at = editing ? script.findIndex((l) => l.id === editing) + 1 : script.length
    save([...script.slice(0, at), ...lines, ...script.slice(at)])
  }
  const add = (who: Seat) => {
    const line: ScriptLine = { id: uid('ln_'), who, say: false, text: '' }
    insertAfter([line])
    setEditing(line.id)
  }
  // typing a leading quote turns the line into a callout
  const typeText = (l: ScriptLine, t: string) => {
    const q = t.match(/^["“「]/)
    if (q) patch(l.id, { say: true, text: t.replace(/^["“「]/, '').replace(/["”」]$/, '') })
    else patch(l.id, { text: t })
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <IconButton icon="chevron-left" label="Back" variant="ghost" size={40} onPress={() => router.back()} />
          <View style={{ flex: 1 }}>
            <Text style={styles.headTitle} numberOfLines={1}>{step.title}</Text>
            <Text style={styles.headSub} numberOfLines={1}>
              {script.length ? `PF ${counts.pf} · PM ${counts.pm}${counts.other ? ` · others ${counts.other}` : ''}` : 'PF / PM script'}
            </Text>
          </View>
          <Button label="Paste" icon="copy" variant="soft" size="sm" onPress={() => { setPasteText(''); setPasting(true) }} />
          <Button label="Practise" icon="play" size="sm" disabled={!script.length} onPress={() => router.push(`/flow/${flow.id}?at=${step.id}`)} />
        </View>

        <ScrollView contentContainerStyle={[styles.body, { paddingHorizontal: wide ? S.xl : S.lg }]} keyboardShouldPersistTaps="handled">
          {twoCol && script.length > 0 && (
            <View style={styles.colHeads}>
              <View style={[styles.colHead, { backgroundColor: SEAT.PF.tint }]}><Text style={[styles.colHeadText, { color: SEAT.PF.ink }]}>PF</Text></View>
              <View style={[styles.colHead, { backgroundColor: SEAT.PM.tint }]}><Text style={[styles.colHeadText, { color: SEAT.PM.ink }]}>PM</Text></View>
            </View>
          )}

          {script.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Who says and does what, in order</Text>
              <Text style={styles.muted}>
                Add the lines of this phase one by one, or paste them from your own notes. A line in quotes is said aloud; anything else is done.
              </Text>
              <View style={styles.example}>
                <Text style={styles.exampleText}>{'PF: "Before start checklist"\nPM ★: Set the transponder\nGround: "Brakes released"'}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: S.sm, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Button label="PF line" icon="plus" variant="soft" onPress={() => add('PF')} />
                <Button label="PM line" icon="plus" variant="soft" onPress={() => add('PM')} />
                <Button label="Paste lines" icon="copy" onPress={() => { setPasteText(''); setPasting(true) }} />
              </View>
            </View>
          ) : (
            script.map((l, i) => {
              const seat = SEAT[l.who]
              const side = twoCol && isPilot(l.who) ? (l.who === 'PF' ? 'left' : 'right') : 'full'
              const open = editing === l.id
              return (
                <View key={l.id} style={[styles.rowWrap, side === 'left' && { paddingRight: '50%' }, side === 'right' && { paddingLeft: '50%' }, side === 'full' && twoCol && { paddingHorizontal: '18%' }]}>
                  <Pressable
                    onPress={() => setEditing(open ? null : l.id)}
                    style={({ pressed }) => [styles.line, { borderLeftColor: seat.line, backgroundColor: open ? C.bg2 : seat.tint }, open && styles.lineOpen, pressed && !open && { opacity: 0.8 }]}
                  >
                    <View style={styles.lineTop}>
                      <Text style={styles.num}>{i + 1}</Text>
                      <View style={[styles.chip, { backgroundColor: seat.line + '40' }]}><Text style={[styles.chipText, { color: seat.ink }]}>{seat.short}</Text></View>
                      {l.key && <Text style={styles.key}>●</Text>}
                      {l.forget && <Text style={styles.star}>★</Text>}
                      <View style={{ flex: 1 }} />
                      <Icon name={l.say ? 'script' : 'check'} size={13} color={C.faint} />
                      <Text style={styles.kind}>{l.say ? 'said' : 'done'}</Text>
                    </View>
                    {open ? (
                      <TextInput
                        value={l.say ? `“${l.text}”` : l.text}
                        onChangeText={(t) => typeText(l, l.say ? t.replace(/^“/, '').replace(/”$/, '') : t)}
                        placeholder={l.who === 'PF' || l.who === 'PM' ? 'What is said or done' : 'What they say'}
                        placeholderTextColor={C.faint}
                        multiline
                        autoFocus={!l.text}
                        style={[styles.text, styles.input, l.say && styles.said]}
                      />
                    ) : (
                      <Text style={[styles.text, l.say && styles.said, !l.text && { color: C.faint }]}>
                        {l.text ? (l.say ? `“${l.text}”` : l.text) : 'Empty line'}
                      </Text>
                    )}
                    {!!l.note && !open && <Text style={styles.note}>{l.note}</Text>}
                  </Pressable>

                  {open && (
                    <View style={styles.tools}>
                      <View style={styles.seg}>
                        {SEATS.map((s) => (
                          <Pressable key={s} onPress={() => patch(l.id, { who: s })} style={[styles.segItem, l.who === s && styles.segOn]}>
                            <Text style={[styles.segText, l.who === s && styles.segTextOn]}>{SEAT[s].name}</Text>
                          </Pressable>
                        ))}
                      </View>
                      <View style={styles.toolRow}>
                        <View style={styles.seg}>
                          <Pressable onPress={() => patch(l.id, { say: true })} style={[styles.segItem, l.say && styles.segOn]}><Text style={[styles.segText, l.say && styles.segTextOn]}>Said</Text></Pressable>
                          <Pressable onPress={() => patch(l.id, { say: false })} style={[styles.segItem, !l.say && styles.segOn]}><Text style={[styles.segText, !l.say && styles.segTextOn]}>Done</Text></Pressable>
                        </View>
                        <Button label="● Key" variant={l.key ? 'ink' : 'soft'} size="sm" onPress={() => patch(l.id, { key: !l.key || undefined })} />
                        <Button label="★ Forget" variant={l.forget ? 'ink' : 'soft'} size="sm" onPress={() => patch(l.id, { forget: !l.forget || undefined })} />
                        <View style={{ flex: 1 }} />
                        <IconButton icon="chevron-up" label="Move up" size={34} onPress={() => move(l.id, -1)} />
                        <IconButton icon="chevron-down" label="Move down" size={34} onPress={() => move(l.id, 1)} />
                        <IconButton icon="trash" label="Delete line" size={34} tint={C.danger} onPress={() => remove(l.id)} />
                      </View>
                      <TextInput
                        value={l.note ?? ''}
                        onChangeText={(t) => patch(l.id, { note: t || undefined })}
                        placeholder="Note (optional): why, where to look, what to verify"
                        placeholderTextColor={C.faint}
                        style={styles.noteInput}
                      />
                    </View>
                  )}
                </View>
              )
            })
          )}
        </ScrollView>

        {script.length > 0 && (
          <View style={styles.addBar}>
            <Button label="PF" icon="plus" variant="soft" style={{ flex: 1, backgroundColor: SEAT.PF.tint }} onPress={() => add('PF')} />
            <Button label="PM" icon="plus" variant="soft" style={{ flex: 1, backgroundColor: SEAT.PM.tint }} onPress={() => add('PM')} />
            <Button label="Other" icon="plus" variant="soft" style={{ flex: 1 }} onPress={() => add('GND')} />
          </View>
        )}

        <Modal visible={pasting} transparent animationType="fade" onRequestClose={() => setPasting(false)}>
          <Pressable style={styles.backdrop} onPress={() => setPasting(false)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.sheetTitle}>Paste lines</Text>
              <Text style={styles.muted}>
                One line each. Start with PF:, PM:, Ground:, ATC: or Cabin: — lines without one belong to the same person as the line before. Quotes mean said aloud. ● marks a key point, ★ easy to forget, and text after // becomes a note. A two-column PF | PM table copied from Word works too.
              </Text>
              <TextInput
                value={pasteText}
                onChangeText={setPasteText}
                multiline
                autoFocus
                placeholder={'PF: "Before start checklist"\nPM: "Before start checklist complete" // read down to the line\nPF ●: Set the parking brake'}
                placeholderTextColor={C.faint}
                style={styles.pasteBox}
              />
              <Text style={styles.headSub}>
                {preview.length ? `${preview.length} line${preview.length === 1 ? '' : 's'} · PF ${scriptCounts(preview).pf} · PM ${scriptCounts(preview).pm}` : 'Nothing to add yet'}
              </Text>
              <View style={{ flexDirection: 'row', gap: S.sm }}>
                <Button label="Cancel" variant="soft" onPress={() => setPasting(false)} style={{ flex: 1 }} />
                <Button
                  label={preview.length ? `Add ${preview.length} lines` : 'Add lines'}
                  disabled={!preview.length}
                  onPress={() => { insertAfter(preview); setPasting(false); setEditing(null) }}
                  style={{ flex: 1 }}
                />
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </>
  )
}

function lastPilot(script: ScriptLine[]): Seat {
  const last = script[script.length - 1]
  return last?.who === 'PF' ? 'PM' : 'PF'
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: S.md, backgroundColor: C.bg },
  muted: { color: C.muted, fontSize: F.body, lineHeight: 21 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: S.sm,
    paddingHorizontal: S.md, paddingVertical: S.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border, backgroundColor: C.bg2,
  },
  headTitle: { color: C.text, fontSize: F.h3, fontWeight: '700', letterSpacing: -0.3 },
  headSub: { color: C.muted, fontSize: F.small },

  body: { paddingTop: S.lg, paddingBottom: 120, gap: 6, width: '100%', maxWidth: 920, alignSelf: 'center' },
  colHeads: { flexDirection: 'row', gap: S.sm, marginBottom: S.xs },
  colHead: { flex: 1, borderRadius: 10, paddingVertical: 6, alignItems: 'center' },
  colHeadText: { fontSize: F.small, fontWeight: '800', letterSpacing: 0.5 },

  rowWrap: { width: '100%' },
  line: { borderRadius: 12, borderLeftWidth: 4, paddingHorizontal: S.md, paddingVertical: 10, gap: 4 },
  lineOpen: { borderWidth: 1.5, borderColor: C.accent, borderLeftWidth: 4 },
  lineTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  num: { color: C.faint, fontSize: F.tiny, fontWeight: '700', minWidth: 16, fontVariant: ['tabular-nums'] },
  chip: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
  chipText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  key: { color: C.danger, fontSize: 11 },
  star: { color: '#D9950A', fontSize: 12 },
  kind: { color: C.faint, fontSize: F.tiny, fontWeight: '600' },
  text: { color: C.text, fontSize: F.body, lineHeight: 21 },
  said: { fontWeight: '700' },
  input: { padding: 0, minHeight: 22, outlineStyle: 'none' as any },
  note: { color: C.muted, fontSize: F.small, lineHeight: 18 },

  tools: { gap: S.sm, paddingTop: S.sm, paddingBottom: S.md, paddingHorizontal: 2 },
  toolRow: { flexDirection: 'row', alignItems: 'center', gap: S.sm, flexWrap: 'wrap' },
  seg: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#EEF1F6', borderRadius: 11, padding: 3, gap: 2, alignSelf: 'flex-start' },
  segItem: { paddingHorizontal: 11, height: 30, borderRadius: 8, justifyContent: 'center' },
  segOn: { backgroundColor: C.bg2, shadowColor: '#1B2130', shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  segText: { color: C.muted, fontSize: F.small, fontWeight: '600' },
  segTextOn: { color: C.text },
  noteInput: {
    backgroundColor: C.bg2, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    paddingHorizontal: S.md, paddingVertical: 8, color: C.text, fontSize: F.small,
  },

  empty: { alignItems: 'center', gap: S.md, paddingVertical: 48, maxWidth: 520, alignSelf: 'center' },
  emptyTitle: { color: C.text, fontSize: F.h2, fontWeight: '800', letterSpacing: -0.4, textAlign: 'center' },
  example: { alignSelf: 'stretch', backgroundColor: C.bg2, borderRadius: 12, padding: S.md, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  exampleText: { fontFamily: MONO, fontSize: F.small, color: C.text, lineHeight: 20 },

  addBar: {
    flexDirection: 'row', gap: S.sm, padding: S.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, backgroundColor: C.bg2,
  },

  backdrop: { flex: 1, backgroundColor: '#1B213066', justifyContent: 'center', alignItems: 'center', padding: S.lg },
  sheet: { width: '100%', maxWidth: 560, backgroundColor: C.bg2, borderRadius: 20, padding: S.xl, gap: S.md },
  sheetTitle: { color: C.text, fontSize: F.h3, fontWeight: '700' },
  pasteBox: {
    minHeight: 200, maxHeight: 360, backgroundColor: '#F7F8FB', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    padding: S.md, color: C.text, fontFamily: MONO, fontSize: F.small, lineHeight: 20, textAlignVertical: 'top',
  },
})
