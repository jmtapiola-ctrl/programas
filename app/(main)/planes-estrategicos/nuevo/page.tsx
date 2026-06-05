'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { BTN_CTA, BTN_SECONDARY } from '@/components/ui/button-styles'
import type { PlanEstrategico } from '@/lib/types'

export default function NuevoPlanPage() {
  const router = useRouter()
  const [tipo, setTipo] = useState<'Sr' | 'Jr' | null>(null)
  const [planesSr, setPlanesSr] = useState<PlanEstrategico[]>([])
  const [planSrId, setPlanSrId] = useState('')
  const [nombre, setNombre] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingPlanesSr, setLoadingPlanesSr] = useState(false)

  useEffect(() => {
    if (tipo === 'Jr') {
      setLoadingPlanesSr(true)
      fetch('/api/planes-estrategicos')
        .then(r => r.json())
        .then(data => {
          const completados = (data.planes ?? []).filter(
            (p: PlanEstrategico) => p.tipo === 'Sr' && p.estado === 'Completado'
          )
          setPlanesSr(completados)
        })
        .finally(() => setLoadingPlanesSr(false))
    }
  }, [tipo])

  async function handleComenzar() {
    if (!tipo) return
    if (!nombre.trim()) return
    if (tipo === 'Jr' && !planSrId) return
    setLoading(true)
    try {
      const planSr = planesSr.find(p => p.id === planSrId)
      const res = await fetch('/api/planes-estrategicos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo,
          nombre: nombre.trim(),
          plan_sr_id: planSrId || undefined,
          plan_sr_nombre: planSr?.nombre,
        }),
      })
      if (!res.ok) throw new Error('Error creando plan')
      const { plan } = await res.json()
      router.push(`/planes-estrategicos/${plan.id}/entrevista`)
    } catch {
      setLoading(false)
    }
  }

  const puedeComenzar = !!tipo && nombre.trim().length > 0 && (tipo === 'Sr' || !!planSrId)
  const sinPlanesSr = tipo === 'Jr' && !loadingPlanesSr && planesSr.length === 0

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-foreground mb-1">Nuevo Plan Estratégico</h1>
        <p className="text-[13px] text-muted-foreground">
          Primero, decime qué tipo de plan vas a construir.
        </p>
      </div>

      <div className="space-y-3 mb-8">
        <OpcionTipo
          seleccionado={tipo === 'Sr'}
          onClick={() => { setTipo('Sr'); setPlanSrId('') }}
          titulo="Plan Estratégico Sr"
          descripcion="Plan de toda la organización o de una unidad de negocio que no tiene un plan mayor por encima. Este plan define la dirección — no se alinea a otro."
        />
        <OpcionTipo
          seleccionado={tipo === 'Jr'}
          onClick={() => setTipo('Jr')}
          titulo="Plan Estratégico Jr"
          descripcion="Plan de un área, división o departamento que tiene que alinearse con un Plan Sr existente. Por ejemplo, el plan de Compras es Jr porque depende del plan general de la organización."
        />
      </div>

      {tipo === 'Jr' && (
        <div className="mb-8">
          <label className="block text-[13px] font-medium text-foreground mb-2">
            ¿A qué Plan Sr se alinea este plan?
          </label>

          {loadingPlanesSr && (
            <p className="text-[13px] text-muted-foreground">Cargando planes Sr...</p>
          )}

          {sinPlanesSr && (
            <div className="rounded-xl border border-yellow-800 bg-yellow-950/40 px-4 py-3">
              <p className="text-[13px] text-yellow-300 font-medium mb-1">
                No hay planes Sr disponibles
              </p>
              <p className="text-[12px] text-yellow-400/80">
                Sin un Plan Sr no se puede hacer un Plan Jr que dependa de él.
                Primero hay que crear el plan mayor.
              </p>
            </div>
          )}

          {!loadingPlanesSr && planesSr.length > 0 && (
            <select
              value={planSrId}
              onChange={e => setPlanSrId(e.target.value)}
              className="w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">— Seleccioná el Plan Sr —</option>
              {planesSr.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Nombre del plan — requerido. Aparece solo después de elegir tipo (y
          Plan Sr si es Jr) para no abrumar el form con todo de entrada. */}
      {tipo && (tipo === 'Sr' || planSrId) && (
        <div className="mb-8">
          <label className="block text-[13px] font-medium text-foreground mb-2">
            Nombre del plan <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="Ej: Plan Sr Terravinci 2026, Plan Jr Compras Q3, ..."
            autoFocus
            className="w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <p className="mt-1 text-[12px] text-muted-foreground">
            Lo podés editar después desde el header del wizard. Sugerencia: poné algo descriptivo (área + año, o área + foco) para distinguirlo fácil en el listado.
          </p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => router.back()}
          className={BTN_SECONDARY}
        >
          Cancelar
        </button>
        <button
          onClick={handleComenzar}
          disabled={!puedeComenzar || loading || sinPlanesSr}
          className={BTN_CTA}
        >
          {loading ? 'Iniciando...' : 'Comenzar entrevista'}
        </button>
      </div>
    </div>
  )
}

function OpcionTipo({
  seleccionado,
  onClick,
  titulo,
  descripcion,
}: {
  seleccionado: boolean
  onClick: () => void
  titulo: string
  descripcion: string
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border px-5 py-4 transition-colors ${
        seleccionado
          ? 'border-primary bg-primary/10'
          : 'border-sidebar-border bg-sidebar/50 hover:bg-accent/40'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex-shrink-0 h-4 w-4 rounded-full border-2 transition-colors ${
          seleccionado ? 'border-primary bg-primary' : 'border-muted-foreground/50'
        }`} />
        <div>
          <p className="text-[13px] font-semibold text-foreground mb-1">{titulo}</p>
          <p className="text-[12px] text-muted-foreground leading-relaxed">{descripcion}</p>
        </div>
      </div>
    </button>
  )
}
