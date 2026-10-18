import { useState } from 'react'
import { View, Text, ScrollView, Pressable, Modal, StyleSheet, Alert, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useFlows } from '@/store/useFlows'
import { useLayout } from '@/lib/responsive'
import { Button, Field, Pill, IconButton } from '@/components/ui'
import { seedExampleFlow } from '@/lib/seed'
import { useConfirm } from '@/components/Confirm'
import { stepNumbers } from '@/lib/flowGeometry'
import { C, R, S, F } from '@/theme'

export default function Library() {
  const router = useRouter()
  const flows = useFlows((s) => s.flows)
  const createFlow = useFlows((s) => s.createFlow)
  const deleteFlow = useFlows((s) => s.deleteFlow)
  const duplicateFlow = useFlows((s) => s.duplicateFlow)
  const { cols, wide } = useLayout()
  const { ask, sheet } = useConfirm()

  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')

  const startCreate = () => {
    const id = createFlow({ title: title || 'Untitled flow', category })
    setCreating(false)
    setTitle('')
    setCategory('')
    router.push(`/flow/${id}/edit`)
  }

  const confirmDelete = (id: string, name: string) => {
    ask({ title: `Delete "${name}"?`, message: "The whole flow goes for good. This can't be undone.", action: 'Delete flow', onConfirm: () => deleteFlow(id) })
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: wide ? S.xxl : S.lg, paddingBottom: 64, maxWidth: 1200, width: '100%', alignSelf: 'center' }}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.brand}>FlowDeck</Text>
            <Text style={styles.tagline}>Build clean, visual SOP checklists & study flows.</Text>
          </View>
          {flows.length > 0 && (
            <Button label="Example" icon="play" variant="soft" onPress={() => router.push(`/flow/${seedExampleFlow()}/board`)} />
          )}
          <Button label="New flow" icon="+" onPress={() => setCreating(true)} />
        </View>

        {flows.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🛩️</Text>
            <Text style={styles.emptyTitle}>No flows yet</Text>
            <Text style={styles.emptyBody}>
              Create a flow for a procedure — engine start, emergency descent, a clinical SOP — then add
              steps with bullet points and annotated screenshots.
            </Text>
            <View style={{ flexDirection: 'row', gap: S.sm, marginTop: S.lg, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Button label="Create your first flow" icon="+" onPress={() => setCreating(true)} />
              <Button label="Load A320 example" variant="ghost" onPress={() => router.push(`/flow/${seedExampleFlow()}/board`)} />
            </View>
          </View>
        ) : (
          <View style={[styles.grid, { gap: S.lg }]}>
            {flows.map((f) => {
              const accent = f.accent || C.accent
              return (
                <Pressable
                  key={f.id}
                  onPress={() => router.push(`/flow/${f.id}/board`)}
                  style={({ pressed }) => [
                    styles.card,
                    { flexBasis: `${100 / cols}%`, maxWidth: `${100 / cols}%`, opacity: pressed ? 0.9 : 1 },
                  ]}
                >
                  <View style={[styles.cardStripe, { backgroundColor: accent }]} />
                  <View style={{ padding: S.lg, gap: S.sm }}>
                    {!!f.category && <Pill text={f.category} color={accent} />}
                    <Text style={styles.cardTitle} numberOfLines={2}>{f.title}</Text>
                    {!!f.description && (
                      <Text style={styles.cardDesc} numberOfLines={2}>{f.description}</Text>
                    )}
                    <Text style={styles.cardMeta}>
                      {(() => {
                        const n = Object.keys(stepNumbers(f.steps)).length
                        const c = f.steps.filter((st) => st.kind === 'decision').length
                        return `${n} step${n === 1 ? '' : 's'}${c ? ` · ${c} condition${c === 1 ? '' : 's'}` : ''}`
                      })()}
                    </Text>
                    <View style={styles.cardActions}>
                      <IconButton icon="▸" size={34} onPress={() => router.push(`/flow/${f.id}`)} />
                      <IconButton icon="✎" size={34} onPress={() => router.push(`/flow/${f.id}/edit`)} />
                      <IconButton icon="⧉" size={34} onPress={() => { const nid = duplicateFlow(f.id); if (nid) router.push(`/flow/${nid}/edit`) }} />
                      <IconButton icon="🗑" size={34} onPress={() => confirmDelete(f.id, f.title)} />
                    </View>
                  </View>
                </Pressable>
              )
            })}
          </View>
        )}
      </ScrollView>

      {sheet}
      <Modal visible={creating} transparent animationType="fade" onRequestClose={() => setCreating(false)}>
        <Pressable style={styles.backdrop} onPress={() => setCreating(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>New flow</Text>
            <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Engine Start (A320)" autoFocus />
            <Field label="Category" value={category} onChangeText={setCategory} placeholder="e.g. A320 Type Rating" />
            <View style={{ flexDirection: 'row', gap: S.sm, marginTop: S.sm }}>
              <Button label="Cancel" variant="ghost" onPress={() => setCreating(false)} style={{ flex: 1 }} />
              <Button label="Create" onPress={startCreate} style={{ flex: 1 }} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: S.md, marginBottom: S.xl },
  brand: { color: C.text, fontSize: F.h1, fontWeight: '900', letterSpacing: -0.5 },
  tagline: { color: C.muted, fontSize: F.small, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  card: {
    backgroundColor: C.bg2,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  cardStripe: { height: 5, width: '100%' },
  cardTitle: { color: C.text, fontSize: F.h3, fontWeight: '800' },
  cardDesc: { color: C.muted, fontSize: F.small },
  cardMeta: { color: C.faint, fontSize: F.tiny, fontWeight: '700', marginTop: 2 },
  cardActions: { flexDirection: 'row', gap: S.sm, marginTop: S.sm },
  empty: { alignItems: 'center', gap: S.sm, paddingVertical: 64, paddingHorizontal: S.lg, maxWidth: 480, alignSelf: 'center' },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { color: C.text, fontSize: F.h2, fontWeight: '800' },
  emptyBody: { color: C.muted, fontSize: F.body, textAlign: 'center', lineHeight: 22 },
  backdrop: { flex: 1, backgroundColor: '#000a', justifyContent: 'center', alignItems: 'center', padding: S.lg },
  sheet: { width: '100%', maxWidth: 440, backgroundColor: C.bg2, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.xl, gap: S.md },
  sheetTitle: { color: C.text, fontSize: F.h2, fontWeight: '800', marginBottom: S.xs },
})
