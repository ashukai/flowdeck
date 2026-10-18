import { useEffect, useState } from 'react'
import { View, Text, ScrollView, Pressable, StyleSheet, Alert, Platform } from 'react-native'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { useFlows } from '@/store/useFlows'
import { useLayout } from '@/lib/responsive'
import { Button, Field, IconButton } from '@/components/ui'
import { AnnotatedImage, Tool } from '@/components/AnnotatedImage'
import { Annotation } from '@/types'
import { C, R, S, F, ANNOT_COLORS } from '@/theme'

const TOOLS: { tool: Tool; icon: string; label: string }[] = [
  { tool: 'select', icon: '✥', label: 'Move' },
  { tool: 'arrow', icon: '↗', label: 'Arrow' },
  { tool: 'rect', icon: '▭', label: 'Box' },
  { tool: 'oval', icon: '◯', label: 'Oval' },
  { tool: 'pin', icon: '●', label: 'Pin' },
  { tool: 'text', icon: 'T', label: 'Text' },
]

export default function StepEditor() {
  const { id, stepId } = useLocalSearchParams<{ id: string; stepId: string }>()
  const router = useRouter()
  const { wide } = useLayout()

  const flow = useFlows((s) => s.flows.find((f) => f.id === id))
  const step = flow?.steps.find((st) => st.id === stepId)
  const updateStep = useFlows((s) => s.updateStep)
  const setAnnotations = useFlows((s) => s.setAnnotations)

  const [tool, setTool] = useState<Tool>('arrow')
  const [color, setColor] = useState<string>(ANNOT_COLORS[0])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // A fresh step opens with one empty bullet ready to type into; empty
  // bullets are pruned when leaving so an untouched step keeps just its title.
  useEffect(() => {
    if (!flow || !step) return
    if (step.bullets.length === 0) updateStep(flow.id, step.id, { bullets: [''] })
    const flowId = flow.id
    const sid = step.id
    return () => {
      const s = useFlows.getState()
      const f = s.flows.find((x) => x.id === flowId)
      const st = f?.steps.find((x) => x.id === sid)
      if (!st) return
      const keep = st.bullets.map((b, i) => ({ b, d: st.done?.[i] ?? false })).filter((x) => x.b.trim().length > 0)
      if (keep.length !== st.bullets.length) {
        s.updateStep(flowId, sid, { bullets: keep.map((x) => x.b), done: keep.map((x) => x.d) })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!flow || !step) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: C.muted }}>Step not found.</Text>
        <Button label="Back" variant="ghost" onPress={() => router.back()} />
      </View>
    )
  }

  const selected = step.annotations.find((a) => a.id === selectedId) || null

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to add a screenshot.')
      return
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.9,
    })
    if (res.canceled) return
    const a = res.assets[0]
    updateStep(flow.id, step.id, {
      image: { uri: a.uri, width: a.width ?? 1600, height: a.height ?? 900 },
    })
  }

  const removeImage = () => {
    updateStep(flow.id, step.id, { image: undefined, annotations: [] })
    setSelectedId(null)
  }

  // bullets
  const setBullet = (i: number, v: string) => {
    const next = [...step.bullets]
    next[i] = v
    updateStep(flow.id, step.id, { bullets: next })
  }
  const addBullet = () => updateStep(flow.id, step.id, { bullets: [...step.bullets, ''] })
  const removeBullet = (i: number) =>
    updateStep(flow.id, step.id, {
      bullets: step.bullets.filter((_, j) => j !== i),
      done: (step.done ?? []).filter((_, j) => j !== i),
    })

  const onAnnotations = (next: Annotation[]) => setAnnotations(flow.id, step.id, next)
  const updateSelected = (patch: Partial<Annotation>) => {
    if (!selected) return
    onAnnotations(step.annotations.map((a) => (a.id === selected.id ? { ...a, ...patch } : a)))
  }
  const deleteSelected = () => {
    if (!selected) return
    onAnnotations(step.annotations.filter((a) => a.id !== selected.id))
    setSelectedId(null)
  }

  const ImagePanel = (
    <View style={{ gap: S.md }}>
      {step.image ? (
        <>
          <AnnotatedImage
            image={step.image}
            annotations={step.annotations}
            editable
            tool={tool}
            color={color}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onChange={onAnnotations}
            maxHeight={wide ? 520 : undefined}
          />

          {/* Tool row */}
          <View style={styles.toolRow}>
            {TOOLS.map((t) => (
              <Pressable
                key={t.tool}
                onPress={() => { setTool(t.tool); if (t.tool !== 'select') setSelectedId(null) }}
                style={[styles.tool, tool === t.tool && styles.toolActive]}
              >
                <Text style={[styles.toolIcon, tool === t.tool && { color: C.accent }]}>{t.icon}</Text>
                <Text style={[styles.toolLabel, tool === t.tool && { color: C.accent }]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Color row */}
          <View style={styles.colorRow}>
            {ANNOT_COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => { setColor(c); if (selected) updateSelected({ color: c }) }}
                style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchActive]}
              />
            ))}
          </View>

          {/* Selection editor */}
          {selected ? (
            <View style={styles.selBox}>
              {(selected.kind === 'text' || selected.kind === 'pin') && (
                <Field
                  label={selected.kind === 'text' ? 'Label text' : 'Pin note (optional)'}
                  value={selected.text ?? ''}
                  onChangeText={(t) => updateSelected({ text: t })}
                  placeholder="Type here"
                />
              )}
              <View style={{ flexDirection: 'row', gap: S.sm }}>
                <Button label="Delete mark" variant="danger" icon="🗑" onPress={deleteSelected} style={{ flex: 1 }} />
                <Button label="Deselect" variant="ghost" onPress={() => setSelectedId(null)} style={{ flex: 1 }} />
              </View>
            </View>
          ) : (
            <Text style={styles.hint}>
              {tool === 'select'
                ? 'Tap a mark to select, then drag to move it.'
                : tool === 'pin' || tool === 'text'
                ? `Tap on the image to drop a ${tool}.`
                : `Drag on the image to draw a ${tool}.`}
            </Text>
          )}

          <View style={{ flexDirection: 'row', gap: S.sm }}>
            <Button label="Replace image" variant="ghost" icon="⟳" onPress={pickImage} style={{ flex: 1 }} />
            <Button label="Remove" variant="ghost" icon="✕" onPress={removeImage} style={{ flex: 1 }} />
          </View>
        </>
      ) : (
        <Pressable onPress={pickImage} style={styles.dropzone}>
          <Text style={{ fontSize: 34 }}>🖼️</Text>
          <Text style={styles.dropTitle}>Add a screenshot</Text>
          <Text style={styles.dropBody}>Then draw arrows, boxes, pins and text on top.</Text>
        </Pressable>
      )}
    </View>
  )

  const TextPanel = (
    <View style={{ gap: S.md }}>
      <Field label="Step title" value={step.title} onChangeText={(t) => updateStep(flow.id, step.id, { title: t })} placeholder="Step title" />

      <View style={{ gap: S.xs }}>
        <Text style={styles.fieldLabel}>Bullet points</Text>
        {step.bullets.map((b, i) => (
          <View key={i} style={styles.bulletRow}>
            <Text style={styles.bulletDot}>•</Text>
            <View style={{ flex: 1 }}>
              <Field
                value={b}
                onChangeText={(v) => setBullet(i, v)}
                placeholder={`Point ${i + 1}`}
                autoFocus={step.bullets.length === 1 && b === ''}
              />
            </View>
            <IconButton icon="✕" size={38} onPress={() => removeBullet(i)} />
          </View>
        ))}
        <Button label="Add bullet" icon="+" variant="soft" onPress={addBullet} />
      </View>

      <Field label="Note (callout)" value={step.note ?? ''} onChangeText={(t) => updateStep(flow.id, step.id, { note: t })} placeholder="Optional highlighted note" multiline />
    </View>
  )

  return (
    <>
      <Stack.Screen options={{ title: step.title || 'Step' }} />
      <ScrollView contentContainerStyle={{ padding: wide ? S.xl : S.lg, paddingBottom: 80, maxWidth: 1100, width: '100%', alignSelf: 'center' }}>
        {wide ? (
          <View style={{ flexDirection: 'row', gap: S.xl, alignItems: 'flex-start' }}>
            <View style={{ flex: 1.2 }}>{ImagePanel}</View>
            <View style={{ flex: 1 }}>{TextPanel}</View>
          </View>
        ) : (
          <View style={{ gap: S.xl }}>
            {ImagePanel}
            {TextPanel}
          </View>
        )}
      </ScrollView>
    </>
  )
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: S.md },
  fieldLabel: { color: C.muted, fontSize: F.small, fontWeight: '600' },
  toolRow: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
  tool: {
    alignItems: 'center', gap: 2, paddingVertical: S.sm, paddingHorizontal: S.md,
    borderRadius: R.sm, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg3, minWidth: 62,
  },
  toolActive: { borderColor: C.accent, backgroundColor: C.accentSoft },
  toolIcon: { color: C.text, fontSize: 18, fontWeight: '800' },
  toolLabel: { color: C.muted, fontSize: F.tiny, fontWeight: '700' },
  colorRow: { flexDirection: 'row', gap: S.sm, flexWrap: 'wrap' },
  swatch: { width: 30, height: 30, borderRadius: 999, borderWidth: 2, borderColor: C.border },
  swatchActive: { borderColor: C.text, transform: [{ scale: 1.15 }] },
  selBox: { gap: S.sm, backgroundColor: C.bg2, borderRadius: R.md, borderWidth: 1, borderColor: C.border, padding: S.md },
  hint: { color: C.faint, fontSize: F.small, fontStyle: 'italic', textAlign: 'center' },
  dropzone: {
    alignItems: 'center', justifyContent: 'center', gap: S.xs,
    paddingVertical: 56, borderRadius: R.lg, borderWidth: 2, borderColor: C.border, borderStyle: 'dashed', backgroundColor: C.bg2,
  },
  dropTitle: { color: C.text, fontSize: F.h3, fontWeight: '800' },
  dropBody: { color: C.muted, fontSize: F.small },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  bulletDot: { color: C.accent, fontSize: 20, fontWeight: '800' },
})
