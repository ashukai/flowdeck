import { ReactNode, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { Button } from '@/components/ui'
import { C, S, F } from '@/theme'

// One in-app confirmation sheet for every platform. The browser's confirm()
// is ugly, and hosted pages switch it off entirely (it returns false), so
// deletes must never depend on it.
type Ask = { title: string; message?: string; action: string; onConfirm: () => void }

export function useConfirm(): { ask: (a: Ask) => void; sheet: ReactNode } {
  const [pending, setPending] = useState<Ask | null>(null)
  const close = () => setPending(null)
  const sheet = (
    <Modal visible={!!pending} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{pending?.title}</Text>
          {pending?.message ? <Text style={styles.message}>{pending.message}</Text> : null}
          <View style={styles.row}>
            <Button label="Cancel" variant="soft" onPress={close} style={{ flex: 1 }} />
            <Button
              label={pending?.action ?? 'Delete'}
              icon="trash"
              variant="danger"
              onPress={() => { const p = pending; close(); p?.onConfirm() }}
              style={{ flex: 1 }}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
  return { ask: setPending, sheet }
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#1B213066', justifyContent: 'center', alignItems: 'center', padding: S.lg },
  sheet: { width: '100%', maxWidth: 400, backgroundColor: C.bg2, borderRadius: 20, padding: S.xl, gap: S.sm },
  title: { color: C.text, fontSize: F.h3, fontWeight: '700', letterSpacing: -0.3 },
  message: { color: C.muted, fontSize: F.body, lineHeight: 21 },
  row: { flexDirection: 'row', gap: S.sm, marginTop: S.md },
})
