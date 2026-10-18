import { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, ScrollView, Pressable, StyleSheet, Animated, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { useFlows } from '@/store/useFlows'
import { useLayout } from '@/lib/responsive'
import { AnnotatedImage } from '@/components/AnnotatedImage'
import { Button, IconButton } from '@/components/ui'
import { Icon } from '@/components/Icon'
import { impliedEdges, stepNumbers, visibleBullets } from '@/lib/flowGeometry'
import { Edge, Step } from '@/types'
import { C, S, F } from '@/theme'

// Present walks the flow the way it's drawn: Next follows the arrow, a
// condition asks its question and your answer picks the branch. Back
// retraces the route you actually took, not the list order.

const SOFT = '#F1F4F9'

function branchRank(label?: string) {
  const l = (label ?? '').trim().toLowerCase()
  if (/^(yes|y|true|normal|ok)\b/.test(l)) return 0
  if (/^(no|n|false|abnormal)\b/.test(l)) return 1
  return 2
}

export default function Present() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { wide } = useLayout()
  const flow = useFlows((s) => s.flows.find((f) => f.id === id))
  const updateStep = useFlows((s) => s.updateStep)

  const steps = flow?.steps ?? []
  const edges = useMemo(() => flow?.edges ?? impliedEdges(steps), [flow?.edges, steps])
  const numbers = useMemo(() => stepNumbers(steps), [steps])
  const byId = useMemo(() => new Map(steps.map((s) => [s.id, s])), [steps])
  const start = useMemo(() => {
    const hasIncoming = new Set(edges.filter((e) => e.from !== e.to).map((e) => e.to))
    return steps.find((s) => !hasIncoming.has(s.id))?.id ?? steps[0]?.id
  }, [steps, edges])

  // the route so far, and the arrow label chosen at each hop
  const [path, setPath] = useState<string[]>([])
  const [taken, setTaken] = useState<(string | undefined)[]>([])
  const [finished, setFinished] = useState(false)
  const [recall, setRecall] = useState(false)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (start && (path.length === 0 || !byId.has(path[path.length - 1]))) {
      setPath([start]); setTaken([]); setFinished(false)
    }
  }, [start, byId, path])

  const curId = path[path.length - 1]
  const cur = curId ? byId.get(curId) : undefined
  const outs = useMemo(
    () => edges.filter((e) => e.from === curId && byId.has(e.to)).sort((a, b) => branchRank(a.label) - branchRank(b.label)),
    [edges, curId, byId],
  )
  const isChoice = cur?.kind === 'decision' || outs.length > 1
  const done = finished || cur?.kind === 'end'

  const crumbRef = useRef<ScrollView>(null)

  // gentle fade + rise each time the box changes
  const anim = useRef(new Animated.Value(1)).current
  useEffect(() => {
    anim.setValue(0)
    Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: Platform.OS !== 'web' }).start()
  }, [curId, finished, anim])

  const go = (e: Edge) => {
    setPath((p) => [...p, e.to])
    setTaken((t) => [...t, e.label])
    setFinished(false)
  }
  const back = () => {
    if (finished) { setFinished(false); return }
    if (path.length <= 1) return
    setPath((p) => p.slice(0, -1))
    setTaken((t) => t.slice(0, -1))
  }
  const jump = (i: number) => {
    setPath((p) => p.slice(0, i + 1))
    setTaken((t) => t.slice(0, i))
    setFinished(false)
  }
  const restart = () => {
    if (!flow) return
    for (const st of flow.steps) if (st.done?.some(Boolean) || st.checked) updateStep(flow.id, st.id, { done: [], checked: false })
    setRevealed(new Set())
    setPath(start ? [start] : [])
    setTaken([])
    setFinished(false)
  }

  const toggleBullet = (st: Step, i: number) => {
    if (!flow) return
    const d = [...(st.done ?? [])]
    while (d.length < st.bullets.length) d.push(false)
    d[i] = !d[i]
    updateStep(flow.id, st.id, { done: d })
  }

  // keyboard on the Mac: → / Enter next, ← back, Y / N answer
  const keys = useRef<(k: string) => void>(() => {})
  keys.current = (k: string) => {
    if (!cur) return
    if ((k === 'ArrowRight' || k === 'Enter') && !isChoice && !done) {
      if (outs[0]) go(outs[0])
      else setFinished(true)
    } else if (k === 'ArrowLeft') back()
    else if (isChoice && (k === 'y' || k === 'n')) {
      const e = outs.find((o) => (o.label ?? '').trim().toLowerCase().startsWith(k))
      if (e) go(e)
    }
  }
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return
    const h = (ev: KeyboardEvent) => {
      if ((ev.target as HTMLElement)?.tagName === 'INPUT' || (ev.target as HTMLElement)?.tagName === 'TEXTAREA') return
      keys.current(ev.key.length === 1 ? ev.key.toLowerCase() : ev.key)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  if (!flow) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Flow not found.</Text>
        <Button label="Back to library" variant="soft" onPress={() => router.replace('/')} />
      </View>
    )
  }

  const answered = taken.filter((t, i) => byId.get(path[i])?.kind === 'decision' && t).length
  const visitedSteps = new Set(path.filter((p) => !byId.get(p)?.kind)).size
  const title = (st: Step | undefined) => st?.title ?? ''
  const kicker = (st: Step) =>
    st.kind === 'decision' ? 'Condition' : st.kind === 'end' ? 'End' : st.size === 'small' ? 'Action' : `Step ${numbers[st.id] ?? ''}`

  // ── pieces ──────────────────────────────────────────────────────────────
  const trail = (
    <View style={styles.trail}>
      <Text style={styles.trailHead}>Your route</Text>
      {path.map((pid, i) => {
        const st = byId.get(pid)
        const current = i === path.length - 1
        return (
          <Pressable key={`${pid}_${i}`} onPress={() => jump(i)} style={({ pressed }) => [styles.trailRow, pressed && { opacity: 0.6 }]}>
            <View style={styles.trailRail}>
              <View style={[styles.trailDot, current ? styles.trailDotNow : styles.trailDotDone, st?.kind === 'decision' && styles.trailDotDiamond]} />
              {i < path.length - 1 && <View style={styles.trailLine} />}
            </View>
            <View style={{ flex: 1, paddingBottom: S.md }}>
              <Text style={[styles.trailText, current && { color: C.text, fontWeight: '700' }]} numberOfLines={2}>{title(st)}</Text>
              {taken[i] ? <Text style={styles.trailChoice}>{taken[i]}</Text> : null}
            </View>
          </Pressable>
        )
      })}
    </View>
  )

  const crumbs = (
    <ScrollView
      ref={crumbRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
      contentContainerStyle={styles.crumbs}
      onContentSizeChange={() => crumbRef.current?.scrollToEnd({ animated: true })}
    >
      {path.map((pid, i) => {
        const current = i === path.length - 1
        return (
          <Pressable key={`${pid}_${i}`} onPress={() => jump(i)} style={[styles.crumb, current && styles.crumbNow]}>
            <Text style={[styles.crumbText, current && { color: '#fff' }]} numberOfLines={1}>
              {taken[i - 1] ? `${taken[i - 1]} · ` : ''}{title(byId.get(pid))}
            </Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )

  const complete = (
    <View style={styles.complete}>
      <View style={styles.completeBadge}><Icon name="check" size={40} color={C.accent} strokeWidth={2.5} /></View>
      <Text style={styles.kicker}>Flow complete</Text>
      <Text style={[styles.title, { textAlign: 'center' }]}>{cur?.kind === 'end' ? cur.title : 'End of flow'}</Text>
      <Text style={[styles.muted, { textAlign: 'center', marginTop: S.sm }]}>
        {visitedSteps} step{visitedSteps === 1 ? '' : 's'} · {answered} condition{answered === 1 ? '' : 's'} answered
      </Text>
      <View style={styles.completeActions}>
        <Button label="Run it again" icon="restart" size="lg" onPress={restart} />
        <Button label="Back to board" icon="grid" variant="soft" size="lg" onPress={() => router.push(`/flow/${flow.id}/board`)} />
      </View>
      <Text style={[styles.hint, { marginTop: S.md }]}>Running it again clears the ticks.</Text>
    </View>
  )

  const choice = cur && (
    <View style={{ alignItems: 'center' }}>
      {cur.kind === 'decision' && (
        <View style={styles.diamondBadge}><Icon name="diamond" size={30} color={C.accent} /></View>
      )}
      <Text style={styles.kicker}>{kicker(cur)}</Text>
      <Text style={[styles.title, { textAlign: 'center' }]}>{cur.title}</Text>
      {outs.length === 0 ? (
        <Text style={[styles.muted, { textAlign: 'center', marginTop: S.lg }]}>
          This condition has no branches yet. Add Yes and No on the board.
        </Text>
      ) : (
        <View style={[styles.answers, wide && { flexDirection: 'row' }]}>
          {outs.map((e) => {
            const r = branchRank(e.label)
            return (
              <View key={e.id} style={[styles.answer, wide && { flex: 1 }]}>
                <Button
                  label={e.label || title(byId.get(e.to))}
                  icon={r === 0 ? 'check' : r === 1 ? 'x' : 'arrow-right'}
                  variant={r === 0 ? 'primary' : r === 1 ? 'ink' : 'soft'}
                  size="lg"
                  full
                  onPress={() => go(e)}
                />
                <Text style={styles.answerTo} numberOfLines={1}>Then: {title(byId.get(e.to))}</Text>
              </View>
            )
          })}
        </View>
      )}
    </View>
  )

  const stepBody = cur && !cur.kind && (() => {
    if (cur.size === 'small') {
      return (
        <>
          <Text style={styles.kicker}>{kicker(cur)}</Text>
          <Text style={styles.title}>{cur.title}</Text>
          <Pressable onPress={() => updateStep(flow.id, cur.id, { checked: !cur.checked })} style={[styles.row, { marginTop: S.xl }]}>
            <View style={[styles.check, cur.checked && styles.checkOn]}>
              {cur.checked && <Icon name="check" size={16} color="#fff" strokeWidth={3} />}
            </View>
            <Text style={[styles.rowText, cur.checked && styles.rowDone]}>Done</Text>
          </Pressable>
        </>
      )
    }
    const vis = visibleBullets(cur)
    const ticked = vis.filter((v) => cur.done?.[v.i]).length
    return (
      <>
        <View style={styles.kickerRow}>
          <Text style={styles.kicker}>{kicker(cur)}</Text>
          {vis.length > 0 && <Text style={styles.count}>{ticked} of {vis.length}</Text>}
        </View>
        <Text style={styles.title}>{cur.title}</Text>
        {cur.image && (
          <View style={{ marginTop: S.lg }}>
            <AnnotatedImage image={cur.image} annotations={cur.annotations} maxHeight={wide ? 420 : 260} />
          </View>
        )}
        {vis.length > 0 && (
          <View style={styles.list}>
            {vis.map((v, row) => {
              const key = `${path.length}:${v.i}`
              const hidden = recall && !revealed.has(key)
              const on = !!cur.done?.[v.i]
              return (
                <Pressable
                  key={v.i}
                  onPress={() => hidden ? setRevealed((r) => new Set(r).add(key)) : toggleBullet(cur, v.i)}
                  style={({ pressed }) => [styles.row, row > 0 && styles.rowRule, pressed && { opacity: 0.7 }]}
                >
                  <View style={[styles.check, on && styles.checkOn]}>
                    {on && <Icon name="check" size={16} color="#fff" strokeWidth={3} />}
                  </View>
                  {hidden ? (
                    <View style={styles.veil}><Icon name="eye" size={16} color={C.faint} /><Text style={styles.veilText}>Tap to reveal</Text></View>
                  ) : (
                    <Text style={[styles.rowText, on && styles.rowDone]}>{v.text}</Text>
                  )}
                </Pressable>
              )
            })}
          </View>
        )}
        {!!cur.note && (
          <View style={styles.note}>
            <Text style={styles.noteLabel}>Note</Text>
            <Text style={styles.noteText}>{cur.note}</Text>
          </View>
        )}
      </>
    )
  })()

  const footer = !done && cur && (
    <View style={styles.footer}>
      {!isChoice && outs[0]?.label ? (
        <View style={styles.when}>
          <Icon name="link" size={15} color={C.muted} />
          <Text style={styles.whenText} numberOfLines={2}>{outs[0].label}</Text>
        </View>
      ) : null}
      <View style={styles.footerRow}>
        <Button label="Back" icon="arrow-left" variant="soft" size="lg" disabled={path.length <= 1} onPress={back} />
        {!isChoice && (
          outs.length === 1
            ? <Button label="Next" iconRight="arrow-right" size="lg" onPress={() => go(outs[0])} style={{ flex: 1 }} />
            : <Button label="Finish" iconRight="check" size="lg" onPress={() => setFinished(true)} style={{ flex: 1 }} />
        )}
      </View>
      {Platform.OS === 'web' && wide && (
        <Text style={styles.hint}>{isChoice ? '← back · Y / N to answer' : '← back · → or Enter for next'}</Text>
      )}
    </View>
  )

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <IconButton icon="chevron-left" label="Back" variant="ghost" size={40} onPress={() => router.back()} />
          <View style={{ flex: 1 }}>
            <Text style={styles.headTitle} numberOfLines={1}>{flow.title}</Text>
            <Text style={styles.headSub} numberOfLines={1}>
              {visitedSteps} step{visitedSteps === 1 ? '' : 's'}{answered ? ` · ${answered} answered` : ''}
            </Text>
          </View>
          <Button label="Recall" icon={recall ? 'eye-off' : 'eye'} variant={recall ? 'ink' : 'soft'} size="sm" onPress={() => { setRecall((r) => !r); setRevealed(new Set()) }} />
          <Button label="Board" icon="grid" variant="soft" size="sm" onPress={() => router.push(`/flow/${flow.id}/board`)} />
        </View>

        {steps.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.title}>Nothing to present yet</Text>
            <Text style={styles.muted}>Add a few steps on the board first.</Text>
            <Button label="Open the board" icon="grid" onPress={() => router.push(`/flow/${flow.id}/board`)} />
          </View>
        ) : (
          <View style={{ flex: 1, flexDirection: 'row' }}>
            {wide && <ScrollView style={styles.side} contentContainerStyle={{ padding: S.xl }}>{trail}</ScrollView>}
            <View style={{ flex: 1 }}>
              {!wide && path.length > 1 && crumbs}
              <ScrollView contentContainerStyle={[styles.stage, done || isChoice ? styles.stageCentre : null]}>
                <Animated.View
                  style={{
                    width: '100%', maxWidth: 720,
                    opacity: anim,
                    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
                  }}
                >
                  {done ? complete : isChoice ? choice : stepBody}
                </Animated.View>
              </ScrollView>
              {footer}
            </View>
          </View>
        )}
      </SafeAreaView>
    </>
  )
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: S.md, padding: S.xl },
  muted: { color: C.muted, fontSize: F.body, lineHeight: 22 },
  hint: { color: C.faint, fontSize: F.tiny, fontWeight: '600', textAlign: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: S.sm,
    paddingHorizontal: S.md, paddingVertical: S.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border, backgroundColor: C.bg2,
  },
  headTitle: { color: C.text, fontSize: F.h3, fontWeight: '700', letterSpacing: -0.3 },
  headSub: { color: C.muted, fontSize: F.small },

  side: { width: 280, flexGrow: 0, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: C.border, backgroundColor: C.bg2 },
  trail: {},
  trailHead: { color: C.muted, fontSize: F.small, fontWeight: '600', marginBottom: S.md },
  trailRow: { flexDirection: 'row', gap: S.md },
  trailRail: { width: 14, alignItems: 'center' },
  trailDot: { width: 12, height: 12, borderRadius: 6, marginTop: 3 },
  trailDotDone: { backgroundColor: C.accent + '55' },
  trailDotNow: { backgroundColor: C.accent, shadowColor: C.accent, shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  trailDotDiamond: { borderRadius: 2, transform: [{ rotate: '45deg' }], width: 10, height: 10, marginTop: 4 },
  trailLine: { flex: 1, width: 2, backgroundColor: C.border, marginTop: 4 },
  trailText: { color: C.muted, fontSize: F.body, lineHeight: 20 },
  trailChoice: {
    alignSelf: 'flex-start', marginTop: 4, color: C.text, fontSize: F.tiny, fontWeight: '700',
    backgroundColor: SOFT, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden',
  },

  crumbs: { gap: 6, paddingHorizontal: S.lg, paddingVertical: S.sm },
  crumb: { backgroundColor: SOFT, borderRadius: 999, paddingHorizontal: 12, height: 30, justifyContent: 'center', maxWidth: 220 },
  crumbNow: { backgroundColor: C.text },
  crumbText: { color: C.muted, fontSize: F.small, fontWeight: '600' },

  stage: { flexGrow: 1, alignItems: 'center', paddingHorizontal: S.xl, paddingTop: S.xxl, paddingBottom: S.xl },
  stageCentre: { justifyContent: 'center' },

  kickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { color: C.accent, fontSize: F.small, fontWeight: '700', marginBottom: S.sm },
  count: { color: C.muted, fontSize: F.small, fontWeight: '600', marginBottom: S.sm },
  title: { color: C.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.7, lineHeight: 36 },

  list: { marginTop: S.xl, backgroundColor: C.bg2, borderRadius: 18, paddingHorizontal: S.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 58, paddingVertical: S.sm },
  rowRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  rowText: { color: C.text, fontSize: 18, lineHeight: 25, flex: 1, letterSpacing: -0.2 },
  rowDone: { color: C.faint },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#C9D0DC', alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: C.accent, borderColor: C.accent },
  veil: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: S.sm, backgroundColor: SOFT, borderRadius: 10, height: 34, paddingHorizontal: S.md },
  veilText: { color: C.faint, fontSize: F.body, fontWeight: '600' },

  note: { marginTop: S.lg, backgroundColor: SOFT, borderRadius: 16, padding: S.lg, gap: 4 },
  noteLabel: { color: C.text, fontSize: F.small, fontWeight: '700' },
  noteText: { color: C.text, fontSize: F.body, lineHeight: 22 },

  diamondBadge: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: S.lg },
  answers: { alignSelf: 'stretch', gap: S.md, marginTop: S.xxl, maxWidth: 520, width: '100%', marginHorizontal: 'auto' as any },
  answer: { gap: 6 },
  answerTo: { color: C.faint, fontSize: F.small, textAlign: 'center' },

  complete: { alignItems: 'center' },
  completeBadge: { width: 88, height: 88, borderRadius: 44, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: S.lg },
  completeActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: S.sm, marginTop: S.xl },

  footer: {
    gap: S.sm, paddingHorizontal: S.lg, paddingTop: S.md, paddingBottom: S.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, backgroundColor: C.bg2,
  },
  footerRow: { flexDirection: 'row', gap: S.sm, width: '100%', maxWidth: 720, alignSelf: 'center' },
  when: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', maxWidth: 720 },
  whenText: { color: C.muted, fontSize: F.small, fontWeight: '600' },
})
