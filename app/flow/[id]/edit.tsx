import { View, Text, ScrollView, Pressable, StyleSheet, Alert, Platform } from 'react-native'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { Image } from 'expo-image'
import { useFlows } from '@/store/useFlows'
import { useLayout } from '@/lib/responsive'
import { Button, Field, IconButton, Card } from '@/components/ui'
import { exportFlowPdf } from '@/lib/pdf'
import { canPrint } from '@/lib/hosting'
import { useConfirm } from '@/components/Confirm'
import { C, R, S, F } from '@/theme'

export default function EditFlow() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { wide } = useLayout()

  const flow = useFlows((s) => s.flows.find((f) => f.id === id))
  const updateFlow = useFlows((s) => s.updateFlow)
  const addStep = useFlows((s) => s.addStep)
  const deleteStep = useFlows((s) => s.deleteStep)
  const moveStep = useFlows((s) => s.moveStep)
  const { ask, sheet } = useConfirm()

  if (!flow) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: C.muted }}>Flow not found.</Text>
        <Button label="Back to library" variant="ghost" onPress={() => router.replace('/')} />
      </View>
    )
  }

  const removeStep = (stepId: string, title: string) => {
    ask({ title: `Delete "${title}"?`, message: 'The step and its items go for good.', action: 'Delete', onConfirm: () => deleteStep(flow.id, stepId) })
  }

  const onAddStep = () => {
    const sid = addStep(flow.id)
    if (sid) router.push(`/flow/${flow.id}/step/${sid}`)
  }

  return (
    <>
      {sheet}
      <Stack.Screen
        options={{
          title: 'Edit flow',
          headerRight: () => (
            <View style={{ flexDirection: 'row' }}>
              <Pressable onPress={() => router.push(`/flow/${flow.id}/board`)} style={{ paddingHorizontal: 8 }}>
                <Text style={{ color: C.accent, fontWeight: '700', fontSize: F.body }}>Board ▦</Text>
              </Pressable>
              <Pressable onPress={() => router.push(`/flow/${flow.id}`)} style={{ paddingHorizontal: 8 }}>
                <Text style={{ color: C.accent, fontWeight: '700', fontSize: F.body }}>Present ▸</Text>
              </Pressable>
            </View>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ padding: wide ? S.xxl : S.lg, paddingBottom: 80, maxWidth: 860, width: '100%', alignSelf: 'center', gap: S.lg }}>
        <Card style={{ gap: S.md }}>
          <Field label="Title" value={flow.title} onChangeText={(t) => updateFlow(flow.id, { title: t })} placeholder="Flow title" />
          <Field label="Category" value={flow.category} onChangeText={(t) => updateFlow(flow.id, { category: t })} placeholder="e.g. A320 Type Rating" />
          <Field label="Description" value={flow.description ?? ''} onChangeText={(t) => updateFlow(flow.id, { description: t })} placeholder="Optional summary" multiline />
        </Card>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Steps ({flow.steps.length})</Text>
          <Button label="Add step" icon="+" variant="soft" onPress={onAddStep} />
        </View>

        {flow.steps.length === 0 ? (
          <Card>
            <Text style={{ color: C.muted, textAlign: 'center' }}>No steps yet. Add your first step to begin.</Text>
          </Card>
        ) : (
          <View style={{ gap: S.sm }}>
            {flow.steps.map((step, i) => (
              <Pressable
                key={step.id}
                onPress={() => router.push(`/flow/${flow.id}/step/${step.id}`)}
                style={({ pressed }) => [styles.stepRow, { opacity: pressed ? 0.9 : 1 }]}
              >
                <View style={styles.badge}><Text style={styles.badgeText}>{i + 1}</Text></View>
                {step.image ? (
                  <Image source={{ uri: step.image.uri }} style={styles.thumb} contentFit="cover" />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty]}><Text style={{ color: C.faint, fontSize: 18 }}>▦</Text></View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepTitle} numberOfLines={1}>{step.title}</Text>
                  <Text style={styles.stepMeta}>
                    {step.bullets.filter(Boolean).length} bullet{step.bullets.filter(Boolean).length === 1 ? '' : 's'}
                    {step.annotations.length ? ` · ${step.annotations.length} marks` : ''}
                  </Text>
                </View>
                <View style={{ gap: 4 }}>
                  <IconButton icon="▲" size={30} onPress={() => moveStep(flow.id, step.id, -1)} />
                  <IconButton icon="▼" size={30} onPress={() => moveStep(flow.id, step.id, 1)} />
                </View>
                <IconButton icon="🗑" size={34} onPress={() => removeStep(step.id, step.title)} />
              </Pressable>
            ))}
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: S.sm, marginTop: S.md, flexWrap: 'wrap' }}>
          <Button label="Present flow" icon="▸" onPress={() => router.push(`/flow/${flow.id}`)} style={{ flexGrow: 1 }} />
          {canPrint && (
            <Button label="Export PDF" icon="⤓" variant="ghost" onPress={() => exportFlowPdf(flow).catch((e) => Alert.alert('Export failed', String(e)))} style={{ flexGrow: 1 }} />
          )}
        </View>
      </ScrollView>
    </>
  )
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: S.md },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: C.text, fontSize: F.h3, fontWeight: '800' },
  stepRow: {
    flexDirection: 'row', alignItems: 'center', gap: S.md,
    backgroundColor: C.bg2, borderRadius: R.md, borderWidth: 1, borderColor: C.border, padding: S.sm, paddingRight: S.md,
  },
  badge: { width: 26, height: 26, borderRadius: 999, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: F.small },
  thumb: { width: 52, height: 52, borderRadius: R.sm, backgroundColor: '#000' },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg3, borderWidth: 1, borderColor: C.border },
  stepTitle: { color: C.text, fontSize: F.body, fontWeight: '700' },
  stepMeta: { color: C.muted, fontSize: F.tiny, marginTop: 2 },
})
