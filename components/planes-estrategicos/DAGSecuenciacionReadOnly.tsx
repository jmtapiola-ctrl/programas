'use client'

// Wrapper read-only de DAGSecuenciacion para embeber en la vista de prestigio
// del plan (/planes-estrategicos/[id]/vista).
//
// Toma el inventario activo (movs) y calcula posiciones x/y vía dagre layout
// (mismo patrón que PropuestaDAGModal). Pasa todos los handlers de mutación
// como no-op + readOnly=true → el componente renderea el DAG pero no permite
// drag, edición de edges, ni selección persistente.

import { useMemo, useState } from 'react'
import dagre from 'dagre'
import type { InventarioPE, DAGMovPE } from '@/lib/types'
import { DAGSecuenciacion } from './DAGSecuenciacion'
import { FullscreenWrapper } from './FullscreenWrapper'

// Mismas constantes que DAGSecuenciacion.tsx / PropuestaDAGModal.tsx.
const NODE_W = 240
const NODE_H = 76

interface Props {
  inventario: InventarioPE
  // Alto del contenedor en CSS (ej: '600px'). Default 600px.
  height?: string
}

export function DAGSecuenciacionReadOnly({ inventario, height = '600px' }: Props) {
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null)

  const movsActivos = useMemo(
    () => inventario.movimientos.filter(m => m.estado_usuario !== 'quitado'),
    [inventario.movimientos],
  )

  // Layout vía dagre — mismas constantes que el resto del wizard.
  const movsACanvas: DAGMovPE[] = useMemo(() => {
    const g = new dagre.graphlib.Graph()
    g.setDefaultEdgeLabel(() => ({}))
    g.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 130, marginx: 30, marginy: 30 })
    movsActivos.forEach(m => g.setNode(m.id, { width: NODE_W, height: NODE_H }))
    for (const m of movsActivos) {
      for (const precId of m.precondiciones ?? []) {
        g.setEdge(precId, m.id)
      }
    }
    dagre.layout(g)
    return movsActivos.map(m => {
      const pos = g.node(m.id)
      return {
        mov_id: m.id,
        x: (pos?.x ?? 0) - NODE_W / 2,
        y: (pos?.y ?? 0) - NODE_H / 2,
      }
    })
  }, [movsActivos])

  if (movsActivos.length === 0) {
    return (
      <p className="empty">El inventario aún no tiene movimientos activos para graficar.</p>
    )
  }

  // Contenedor light explícito: el DAG usa Tailwind classes que resuelven a las
  // CSS vars del tema (--background, --foreground, etc). El documento /vista es
  // light, así que dejamos que las vars resuelvan al :root (light mode default)
  // y forzamos en el wrapper fondo blanco + texto oscuro para máximo contraste.
  return (
    <FullscreenWrapper defaultHeight={height} expandLabel="Pantalla completa">
      {(h) => (
        <div
          style={{
            height: h,
            width: '100%',
            border: '1px solid #d4d4cf',
            borderRadius: 8,
            overflow: 'hidden',
            background: '#ffffff',
            color: '#1a1a1a',
            // Forzar CSS vars del tema light dentro del wrapper, por si el
            // ancestro global de la app tiene `.dark`.
            ['--background' as any]: '#ffffff',
            ['--foreground' as any]: '#1a1a1a',
            ['--card' as any]: '#fafafa',
            ['--card-foreground' as any]: '#1a1a1a',
            ['--popover' as any]: '#ffffff',
            ['--popover-foreground' as any]: '#1a1a1a',
            ['--muted' as any]: '#f1f1ee',
            ['--muted-foreground' as any]: '#5a5a55',
            ['--border' as any]: '#d4d4cf',
            ['--sidebar-border' as any]: '#d4d4cf',
            ['--accent' as any]: '#ebebe2',
            ['--accent-foreground' as any]: '#1a1a1a',
          }}
        >
          <DAGSecuenciacion
            movsACanvas={movsACanvas}
            todosLosMovs={movsActivos}
            movSeleccionadoId={seleccionadoId}
            onSeleccionar={setSeleccionadoId}
            onAgregarMov={() => {}}
            onMoverNodo={() => {}}
            onCrearPrecondicion={() => {}}
            onQuitarPrecondicion={() => {}}
            onCambiarTipoEdge={() => {}}
            readOnly
            hideCategoria
          />
        </div>
      )}
    </FullscreenWrapper>
  )
}
