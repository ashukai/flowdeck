import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Flow, Step, Annotation, Edge, BoardNote, ScriptLine } from '@/types'
import { uid } from '@/lib/id'

// Local-first: everything persists to device storage. The shape is kept
// serializable and flat so a future Supabase sync layer can diff & upsert
// whole Flow rows without migration pain.

interface FlowsState {
  flows: Flow[]
  hydrated: boolean

  // flow-level
  createFlow: (input: { title: string; category: string; description?: string }) => string
  updateFlow: (id: string, patch: Partial<Pick<Flow, 'title' | 'category' | 'description' | 'accent'>>) => void
  deleteFlow: (id: string) => void
  duplicateFlow: (id: string) => string | null
  getFlow: (id: string) => Flow | undefined

  // step-level
  addStep: (flowId: string, title?: string) => string | null
  updateStep: (flowId: string, stepId: string, patch: Partial<Omit<Step, 'id'>>) => void
  deleteStep: (flowId: string, stepId: string) => void
  moveStep: (flowId: string, stepId: string, dir: -1 | 1) => void

  // annotation-level
  setAnnotations: (flowId: string, stepId: string, annotations: Annotation[]) => void

  // whiteboard-level
  setEdges: (flowId: string, edges: Edge[]) => void
  setNotes: (flowId: string, notes: BoardNote[]) => void

  // script-level
  setScript: (flowId: string, stepId: string, script: ScriptLine[]) => void
  markLine: (flowId: string, lineId: string, got: boolean) => void
  clearDrill: (flowId: string) => void
}

function touch(flow: Flow): Flow {
  return { ...flow, updatedAt: Date.now() }
}

export const useFlows = create<FlowsState>()(
  persist(
    (set, get) => ({
      flows: [],
      hydrated: false,

      createFlow: ({ title, category, description }) => {
        const id = uid('flow_')
        const now = Date.now()
        const flow: Flow = {
          id,
          title: title.trim() || 'Untitled flow',
          category: category.trim(),
          description: description?.trim() || undefined,
          steps: [],
          createdAt: now,
          updatedAt: now,
        }
        set((s) => ({ flows: [flow, ...s.flows] }))
        return id
      },

      updateFlow: (id, patch) =>
        set((s) => ({
          flows: s.flows.map((f) => (f.id === id ? touch({ ...f, ...patch }) : f)),
        })),

      deleteFlow: (id) =>
        set((s) => ({ flows: s.flows.filter((f) => f.id !== id) })),

      duplicateFlow: (id) => {
        const src = get().flows.find((f) => f.id === id)
        if (!src) return null
        const newId = uid('flow_')
        const now = Date.now()
        const copy: Flow = {
          ...src,
          id: newId,
          title: `${src.title} (copy)`,
          createdAt: now,
          updatedAt: now,
          steps: src.steps.map((st) => ({
            ...st,
            id: uid('step_'),
            bullets: [...st.bullets],
            annotations: st.annotations.map((a) => ({ ...a, id: uid('an_') })),
          })),
        }
        set((s) => ({ flows: [copy, ...s.flows] }))
        return newId
      },

      getFlow: (id) => get().flows.find((f) => f.id === id),

      addStep: (flowId, title) => {
        const stepId = uid('step_')
        let ok = false
        set((s) => ({
          flows: s.flows.map((f) => {
            if (f.id !== flowId) return f
            ok = true
            const step: Step = {
              id: stepId,
              title: title?.trim() || `Step ${f.steps.length + 1}`,
              bullets: [],
              annotations: [],
            }
            return touch({ ...f, steps: [...f.steps, step] })
          }),
        }))
        return ok ? stepId : null
      },

      updateStep: (flowId, stepId, patch) =>
        set((s) => ({
          flows: s.flows.map((f) =>
            f.id !== flowId
              ? f
              : touch({
                  ...f,
                  steps: f.steps.map((st) => (st.id === stepId ? { ...st, ...patch } : st)),
                })
          ),
        })),

      deleteStep: (flowId, stepId) =>
        set((s) => ({
          flows: s.flows.map((f) =>
            f.id !== flowId ? f : touch({ ...f, steps: f.steps.filter((st) => st.id !== stepId) })
          ),
        })),

      moveStep: (flowId, stepId, dir) =>
        set((s) => ({
          flows: s.flows.map((f) => {
            if (f.id !== flowId) return f
            const i = f.steps.findIndex((st) => st.id === stepId)
            const j = i + dir
            if (i < 0 || j < 0 || j >= f.steps.length) return f
            const steps = [...f.steps]
            ;[steps[i], steps[j]] = [steps[j], steps[i]]
            return touch({ ...f, steps })
          }),
        })),

      setAnnotations: (flowId, stepId, annotations) =>
        set((s) => ({
          flows: s.flows.map((f) =>
            f.id !== flowId
              ? f
              : touch({
                  ...f,
                  steps: f.steps.map((st) => (st.id === stepId ? { ...st, annotations } : st)),
                })
          ),
        })),

      setEdges: (flowId, edges) =>
        set((s) => ({
          flows: s.flows.map((f) => (f.id === flowId ? touch({ ...f, edges }) : f)),
        })),

      setNotes: (flowId, notes) =>
        set((s) => ({
          flows: s.flows.map((f) => (f.id === flowId ? touch({ ...f, notes }) : f)),
        })),

      setScript: (flowId, stepId, script) =>
        set((s) => ({
          flows: s.flows.map((f) =>
            f.id !== flowId ? f : touch({ ...f, steps: f.steps.map((st) => (st.id === stepId ? { ...st, script } : st)) })
          ),
        })),

      markLine: (flowId, lineId, got) =>
        set((s) => ({
          flows: s.flows.map((f) => {
            if (f.id !== flowId) return f
            const prev = f.drill?.[lineId] ?? { got: 0, miss: 0 }
            const next = got ? { ...prev, got: prev.got + 1 } : { ...prev, miss: prev.miss + 1 }
            return { ...f, drill: { ...(f.drill ?? {}), [lineId]: next } }
          }),
        })),

      clearDrill: (flowId) =>
        set((s) => ({ flows: s.flows.map((f) => (f.id === flowId ? { ...f, drill: {} } : f)) })),
    }),
    {
      name: 'flowdeck.flows.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ flows: s.flows }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true
      },
    }
  )
)
