'use client'

// Card del listado de planes. Client porque maneja modal de eliminar.
//
// Lógica del CTA principal:
//   - paso_actual >= 4 → plan completado → botón "Ver plan" → /vista.
//   - paso_actual < 4 → plan en construcción → botón "Continuar" → /entrevista.
//
// Eliminar: botón discreto a la izquierda del CTA principal. Click → modal
// que pide código de seguridad. El código se valida server-side (el frontend
// solo lo envía, NO lo conoce).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BTN_CTA, BTN_CTA_SHAPE } from '@/components/ui/button-styles'
import type { PlanEstrategico } from '@/lib/types'

interface Props {
  plan: PlanEstrategico
  pasoActual: number
  // Si true, la card se muestra como header read-only sin acciones. Usado en
  // listado para mostrar Sr de un Plan Jr viewer (que solo ve referencia del
  // padre) o Jr hermanos (que no son suyos).
  soloLectura?: boolean
  // Si true, el viewer ES el dueño formal de este Jr. En estados de Plan Jr
  // (Listo para compartir / En entrevista / Completado) el CTA principal va
  // a "Abrir plan →" → /inicio en vez de Compartir (que es para Sr/Admin).
  vistaDuenoJr?: boolean
}

const ESTADO_COLOR: Record<string, string> = {
  'Borrador': 'bg-gray-700 text-gray-300 border-gray-600',
  'En entrevista': 'bg-blue-900 text-blue-200 border-blue-700',
  'Pendiente despliegue': 'bg-amber-900 text-amber-200 border-amber-700',
  'Listo para compartir': 'bg-purple-900 text-purple-200 border-purple-700',
  'Completado': 'bg-green-900 text-green-200 border-green-700',
  'Archivado': 'bg-gray-800 text-gray-400 border-gray-700',
}

export function PlanCard({ plan, pasoActual, soloLectura, vistaDuenoJr }: Props) {
  const router = useRouter()
  const [modalAbierto, setModalAbierto] = useState(false)

  // Derivar estado mostrado:
  //   - Si el plan está en estado intermedio del flow Sr→Jr (Pendiente
  //     despliegue / Listo para compartir), usamos directamente plan.estado.
  //   - Si tiene paso_actual >= 4, está completado.
  //   - Sino, se infiere de plan.estado (Borrador o En entrevista).
  const completado = pasoActual >= 4
  let estadoMostrado: string
  if (plan.estado === 'Pendiente despliegue' || plan.estado === 'Listo para compartir') {
    estadoMostrado = plan.estado
  } else if (completado) {
    estadoMostrado = 'Completado'
  } else {
    estadoMostrado = plan.estado === 'Borrador' ? 'Borrador' : 'En entrevista'
  }
  const color = ESTADO_COLOR[estadoMostrado] ?? ESTADO_COLOR['Borrador']

  // CTA principal según estado y tipo de plan:
  //   - Sr completado sin lineas_jr → "Crear Planes Jr" (lila) + "Ver plan →" (verde).
  //   - Sr completado con lineas_jr ya creadas → "Ver plan".
  //   - Plan completado → "Ver plan" (verde).
  //   - Jr en Pendiente despliegue → "Desplegar" (amber, Sr/Admin only).
  //   - Jr en Listo para compartir → "Compartir →" (purple, Sr/Admin) o "Abrir plan →" (Jr owner).
  //   - Jr en En entrevista, Jr owner → "Abrir plan →" (azul, va a /inicio hasta que Fase 6 implemente el wizard).
  //   - Plan en construcción → "Continuar" (primary).
  const tieneLineasJr = (plan.lineas_jr?.length ?? 0) > 0
  const mostrarCrearJr = plan.tipo === 'Sr' && completado && !tieneLineasJr
  const mostrarDesplegar = plan.tipo === 'Jr' && plan.estado === 'Pendiente despliegue' && !vistaDuenoJr
  const mostrarCompartir = plan.tipo === 'Jr' && plan.estado === 'Listo para compartir' && !vistaDuenoJr
  const mostrarAbrirJr = plan.tipo === 'Jr' && vistaDuenoJr && (plan.estado === 'Listo para compartir' || plan.estado === 'En entrevista')

  return (
    <>
      <div className={`flex items-center justify-between rounded-xl border px-5 py-4 ${
        soloLectura
          ? 'border-sidebar-border/50 bg-sidebar/20'
          : 'border-sidebar-border bg-sidebar/50'
      }`}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-1">
            <span className={`rounded-full border px-2 py-0.5 text-[12px] font-semibold ${
              plan.tipo === 'Sr'
                ? 'bg-purple-900 text-purple-200 border-purple-700'
                : 'bg-blue-900 text-blue-200 border-blue-700'
            }`}>
              Plan {plan.tipo}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[12px] font-semibold ${color}`}>
              {estadoMostrado}
            </span>
            {soloLectura && (
              <span className="text-[11px] text-muted-foreground italic">(read-only)</span>
            )}
          </div>
          <p className={`text-[14px] font-medium truncate ${soloLectura ? 'text-foreground/70' : 'text-foreground'}`}>
            {plan.nombre}
          </p>
          {plan.area && (
            <p className="text-[12px] text-muted-foreground">{plan.area}</p>
          )}
          {plan.tipo === 'Jr' && plan.dueno_jr_email && (
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Dueño: {plan.dueno_jr_email}
            </p>
          )}
        </div>

        <div className="flex-shrink-0 ml-4 flex items-center gap-2">
          {/* Acciones solo cuando NO es soloLectura. */}
          {!soloLectura && (
            <>
              <button
                type="button"
                onClick={() => setModalAbierto(true)}
                title="Eliminar plan"
                className="rounded-lg border border-red-900/40 text-red-400/70 hover:text-red-300 hover:bg-red-950/30 px-2 py-1.5 text-[12px] transition-colors"
              >
                🗑
              </button>
              {mostrarCrearJr ? (
                <>
                  <Link
                    href={`/planes-estrategicos/${plan.id}/crear-jr`}
                    className={`${BTN_CTA_SHAPE} bg-purple-700 text-purple-50 hover:bg-purple-600`}
                  >
                    Crear Planes Jr
                  </Link>
                  <Link
                    href={`/planes-estrategicos/${plan.id}/vista`}
                    className={`${BTN_CTA_SHAPE} bg-emerald-700 text-emerald-50 hover:bg-emerald-600`}
                  >
                    Ver plan →
                  </Link>
                </>
              ) : mostrarDesplegar ? (
                <Link
                  href={`/planes-estrategicos/${plan.id}/desplegar`}
                  className={`${BTN_CTA_SHAPE} bg-amber-700 text-amber-50 hover:bg-amber-600`}
                >
                  Desplegar
                </Link>
              ) : mostrarCompartir ? (
                <BotonCompartir planId={plan.id} />
              ) : mostrarAbrirJr ? (
                <Link
                  href={`/planes-estrategicos/${plan.id}/inicio`}
                  className={`${BTN_CTA_SHAPE} bg-blue-700 text-blue-50 hover:bg-blue-600`}
                >
                  Abrir plan →
                </Link>
              ) : completado ? (
                <Link
                  href={`/planes-estrategicos/${plan.id}/vista`}
                  className={`${BTN_CTA_SHAPE} bg-emerald-700 text-emerald-50 hover:bg-emerald-600`}
                >
                  Ver plan →
                </Link>
              ) : (
                <Link
                  href={`/planes-estrategicos/${plan.id}/entrevista`}
                  className={BTN_CTA}
                >
                  Continuar
                </Link>
              )}
            </>
          )}
        </div>
      </div>

      {modalAbierto && (
        <ModalEliminar
          plan={plan}
          onClose={() => setModalAbierto(false)}
          onEliminado={() => {
            setModalAbierto(false)
            router.refresh()
          }}
        />
      )}
    </>
  )
}

// Botón "Compartir →" — copia al portapapeles el link de inicio del Jr para
// el dueño. El dueño Jr loguea con su email + password temporal y entra a
// /planes-estrategicos/[id]/inicio (página que se implementa en Fase 4).
function BotonCompartir({ planId }: { planId: string }) {
  const [copiado, setCopiado] = useState(false)

  function copiar() {
    const url = `${window.location.origin}/planes-estrategicos/${planId}/inicio`
    navigator.clipboard.writeText(url).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    })
  }

  return (
    <button
      type="button"
      onClick={copiar}
      title="Copiar link de inicio del Jr al portapapeles"
      className={`${BTN_CTA_SHAPE} bg-purple-700 text-purple-50 hover:bg-purple-600`}
    >
      {copiado ? '✓ Copiado' : 'Compartir →'}
    </button>
  )
}

function ModalEliminar({
  plan,
  onClose,
  onEliminado,
}: {
  plan: PlanEstrategico
  onClose: () => void
  onEliminado: () => void
}) {
  const [codigo, setCodigo] = useState('')
  const [eliminando, setEliminando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function eliminar() {
    if (!codigo.trim()) {
      setError('Tipeá el código de seguridad para eliminar.')
      return
    }
    setEliminando(true)
    setError(null)
    try {
      const res = await fetch(`/api/planes-estrategicos/${plan.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: codigo.trim() }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? `HTTP ${res.status}`)
        setEliminando(false)
        return
      }
      onEliminado()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setEliminando(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={() => !eliminando && onClose()}
    >
      <div
        className="bg-background border-2 border-red-900/60 rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div>
          <p className="text-[12px] uppercase tracking-wider text-red-400 font-semibold mb-1">
            Acción irreversible
          </p>
          <h2 className="text-[16px] font-bold text-foreground">
            Eliminar plan
          </h2>
        </div>

        <p className="text-[13px] text-muted-foreground leading-relaxed">
          Vas a eliminar <span className="font-semibold text-foreground">"{plan.nombre}"</span> y todo su contenido: la entrevista, todos los turnos del chat y el plan completo. <span className="text-red-300 font-semibold">No hay forma de revertir esto.</span>
        </p>

        <div>
          <label className="block text-[12px] font-semibold uppercase tracking-wider text-foreground mb-1.5">
            Código de seguridad
          </label>
          <input
            type="password"
            value={codigo}
            onChange={e => { setCodigo(e.target.value); setError(null) }}
            placeholder="Tipeá el código"
            autoFocus
            disabled={eliminando}
            className="w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-red-500"
          />
          {error && (
            <p className="mt-1 text-[12px] text-red-400">{error}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={eliminando}
            className="rounded-lg border border-sidebar-border px-4 py-2 text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={eliminar}
            disabled={eliminando || !codigo.trim()}
            className="rounded-lg bg-red-700 hover:bg-red-600 px-4 py-2 text-[13px] font-bold text-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {eliminando ? 'Eliminando…' : 'Eliminar definitivamente'}
          </button>
        </div>
      </div>
    </div>
  )
}
