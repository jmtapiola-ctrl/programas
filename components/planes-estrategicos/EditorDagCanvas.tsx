// Canvas de dependencias EDITABLE sobre el borrador (F4 — edición directa).
// Reusa DAGSecuenciacion (el mismo del wizard 3.A.6) pero rutea sus callbacks a
// draft/inventario-directo en vez del plan vivo. Permite arrastrar nodos y
// editar dependencias (crear/quitar/cambiar tipo+lag) directamente.

'use client'

import { useRef, useState } from 'react'
import { DAGSecuenciacion } from './DAGSecuenciacion'
import type { PlanDraft, MovimientoPE, DAGMovPE, DraftMovCambio } from '@/lib/types'

interface Props {
  planId: string
  draft: PlanDraft
  onDraftActualizado: (draft: PlanDraft, cierre: string | null) => void
}

export function EditorDagCanvas({ planId, draft, onDraftActualizado }: Props) {
  const movsActivos: MovimientoPE[] = (draft.inventario?.movimientos ?? []).filter(m => m.estado_usuario !== 'quitado')
  const dagMovs: DAGMovPE[] = draft.inventario?.dag?.movs ?? []
  const [seleccionado, setSeleccionado] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const posBufferRef = useRef<Record<string, { x: number; y: number }>>({})
  const posTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function patch(body: any) {
    const res = await fetch(`/api/planes-estrategicos/${planId}/draft/inventario-directo`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const data = await res.json()
    if (res.ok && data.draft) onDraftActualizado(data.draft, data.cierre ?? null)
    return data
  }

  // Posiciones: se bufferean y se persisten con debounce (drag genera muchos).
  function flushPosiciones() {
    const posiciones = posBufferRef.current
    posBufferRef.current = {}
    if (Object.keys(posiciones).length === 0) return
    void patch({ posiciones })
  }
  function onMoverNodo(movId: string, x: number, y: number) {
    posBufferRef.current[movId] = { x, y }
    if (posTimerRef.current) clearTimeout(posTimerRef.current)
    posTimerRef.current = setTimeout(flushPosiciones, 600)
  }

  async function aplicarDep(cambio: DraftMovCambio) {
    setGuardando(true)
    try { await patch({ mov_cambios: [cambio] }) } finally { setGuardando(false) }
  }

  // onCrearPrecondicion(desde, hacia): "desde" es precondición de "hacia".
  // En nuestro modelo: mov_id = hacia (dependiente), dep.desde = desde.
  function onCrearPrecondicion(desde: string, hacia: string) {
    void aplicarDep({ id: 'dir', mov_id: hacia, dep: { accion: 'agregar', desde, tipo: 'fs', lag_meses: 0 } })
  }
  function onQuitarPrecondicion(desde: string, hacia: string) {
    void aplicarDep({ id: 'dir', mov_id: hacia, dep: { accion: 'quitar', desde } })
  }
  function onCambiarTipoEdge(desde: string, hacia: string, tipo: 'sugerida' | 'ff' | 'fs' | 'continuo', lagMeses: number) {
    void aplicarDep({ id: 'dir', mov_id: hacia, dep: { accion: 'editar', desde, tipo, lag_meses: lagMeses } })
  }

  if (dagMovs.length === 0) {
    return <p className="text-[13px] text-muted-foreground p-4">Este plan no tiene un mapa de dependencias generado, así que no se puede editar en canvas. Podés editar las dependencias por chat.</p>
  }

  return (
    <div className="relative h-full">
      {guardando && <div className="absolute top-2 right-2 z-10 text-[11px] text-blue-300 bg-gray-900/80 px-2 py-1 rounded">guardando…</div>}
      <DAGSecuenciacion
        movsACanvas={dagMovs}
        todosLosMovs={movsActivos}
        movSeleccionadoId={seleccionado}
        onSeleccionar={setSeleccionado}
        onAgregarMov={() => { /* agregar movs no soportado en edición de plan cerrado */ }}
        onMoverNodo={onMoverNodo}
        onCrearPrecondicion={onCrearPrecondicion}
        onQuitarPrecondicion={onQuitarPrecondicion}
        onCambiarTipoEdge={onCambiarTipoEdge}
      />
    </div>
  )
}
