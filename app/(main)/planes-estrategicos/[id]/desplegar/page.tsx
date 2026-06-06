'use client'

// Wizard de Despliegue del Plan Jr (Fase 3 del sistema Sr→Jr).
//
// Flow (3 sub-pasos):
//   1. revisar: muestra datos del Jr (nombre, dueño, movs heredados) read-only
//      para que el Sr/Admin verifique antes de pedir contexto.
//   2. proponer + editar: POST a /proponer-contexto-curado → Opus genera los 5
//      campos del contexto curado (contexto, propósito, criterios, métricas,
//      supuestos) → cada uno se edita en su propio MarkdownEditor → el Sr/Admin
//      aprueba campo por campo. Cada campo tiene su propio ↻ "regenerar".
//   3. resultado: success — el Jr pasó a 'Listo para compartir'.
//
// Aprobación: solo en sesión (no se persiste). Gate duro: "Confirmar despliegue"
// se habilita cuando los 5 campos están aprobados. Editar un campo aprobado lo
// vuelve a "no aprobado" (la edición invalida la aprobación previa).
//
// El [id] es el del Plan Jr (no del Sr). El endpoint /proponer-contexto-curado
// resuelve la línea correspondiente buscando por plan_jr_id en el Sr.

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import MarkdownEditor from '@/components/planes-estrategicos/MarkdownEditor'
import { BTN_CTA, BTN_SECONDARY_SM } from '@/components/ui/button-styles'
import { CONTEXTO_CURADO_CAMPOS } from '@/lib/types'
import type { MovimientoPE, PlanEstrategico, ContextoCuradoJr } from '@/lib/types'

type SubPaso = 'cargando' | 'revisar' | 'proponiendo' | 'editar' | 'confirmando' | 'resultado'
type CampoKey = keyof ContextoCuradoJr

const CAMPOS_VACIOS: ContextoCuradoJr = {
  contexto: '', proposito: '', criterios_exito: '', metricas: '', supuestos: '',
}

interface PlanJrCargado {
  plan: PlanEstrategico
  movsHeredados: MovimientoPE[]
  duenoEmail: string
}

export default function DesplegarJrPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const planJrId = params?.id

  const [subPaso, setSubPaso] = useState<SubPaso>('cargando')
  const [planJr, setPlanJr] = useState<PlanJrCargado | null>(null)
  const [campos, setCampos] = useState<ContextoCuradoJr>(CAMPOS_VACIOS)
  const [aprobados, setAprobados] = useState<Record<string, boolean>>({})
  const [regenerando, setRegenerando] = useState<CampoKey | null>(null)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [errorAccion, setErrorAccion] = useState<string | null>(null)

  // Cargar Plan Jr al mount.
  useEffect(() => {
    if (!planJrId) return
    let abortado = false

    async function cargar() {
      try {
        const res = await fetch(`/api/planes-estrategicos/${planJrId}`)
        const data = await res.json()
        if (abortado) return
        if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)

        const plan: PlanEstrategico = data.plan
        if (plan.tipo !== 'Jr') {
          throw new Error('Este plan no es un Jr — no se puede desplegar acá.')
        }
        if (plan.estado !== 'Pendiente despliegue') {
          throw new Error(`El Jr está en estado "${plan.estado}". El wizard de despliegue solo aplica a "Pendiente despliegue".`)
        }
        if (!plan.plan_sr_id) {
          throw new Error('El Jr no tiene plan_sr_id asociado.')
        }

        // Cargar Sr para resolver línea + movs heredados.
        const resSr = await fetch(`/api/planes-estrategicos/${plan.plan_sr_id}`)
        const dataSr = await resSr.json()
        if (abortado) return
        if (!resSr.ok) throw new Error(dataSr?.error ?? `HTTP ${resSr.status}`)

        const planSr: PlanEstrategico = dataSr.plan
        const linea = planSr.lineas_jr?.find(l => l.plan_jr_id === planJrId)
        if (!linea) {
          throw new Error('Línea Jr no encontrada en el Sr — desconsistencia.')
        }
        const idsHeredados = new Set(linea.movimientos_ids)
        const movsHeredados = (planSr.plan?.inventario?.movimientos ?? []).filter(m => idsHeredados.has(m.id))

        setPlanJr({
          plan,
          movsHeredados,
          duenoEmail: plan.dueno_jr_email ?? linea.dueno_jr_email,
        })
        setSubPaso('revisar')
      } catch (e) {
        if (!abortado) {
          setErrorCarga(e instanceof Error ? e.message : String(e))
        }
      }
    }
    cargar()
    return () => { abortado = true }
  }, [planJrId])

  async function pedirPropuestaContexto() {
    if (!planJrId) return
    setSubPaso('proponiendo')
    setErrorAccion(null)
    try {
      const res = await fetch(`/api/planes-estrategicos/${planJrId}/proponer-contexto-curado`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorAccion(data?.error ?? `HTTP ${res.status}`)
        setSubPaso('revisar')
        return
      }
      setCampos({ ...CAMPOS_VACIOS, ...(data.contexto_curado ?? {}) })
      setAprobados({}) // todos sin aprobar al regenerar todo
      setSubPaso('editar')
    } catch (e) {
      setErrorAccion(e instanceof Error ? e.message : String(e))
      setSubPaso('revisar')
    }
  }

  async function regenerarTodo() {
    if (!confirm('Esto descarta TODO lo editado y vuelve a pedir los 5 campos a la IA. ¿Continuar?')) return
    await pedirPropuestaContexto()
  }

  async function regenerarCampo(key: CampoKey) {
    if (!planJrId || regenerando) return
    setRegenerando(key)
    setErrorAccion(null)
    try {
      const res = await fetch(`/api/planes-estrategicos/${planJrId}/proponer-contexto-curado?campo=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valores_actuales: campos }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorAccion(data?.error ?? `HTTP ${res.status}`)
        return
      }
      setCampos(prev => ({ ...prev, [key]: data.valor ?? '' }))
      setAprobados(prev => ({ ...prev, [key]: false })) // regenerar invalida la aprobación
    } catch (e) {
      setErrorAccion(e instanceof Error ? e.message : String(e))
    } finally {
      setRegenerando(null)
    }
  }

  function editarCampo(key: CampoKey, valor: string) {
    setCampos(prev => ({ ...prev, [key]: valor }))
    // Editar invalida la aprobación previa.
    setAprobados(prev => (prev[key] ? { ...prev, [key]: false } : prev))
  }

  function toggleAprobado(key: CampoKey) {
    setAprobados(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const todosAprobados = CONTEXTO_CURADO_CAMPOS.every(
    c => aprobados[c.key] && (campos[c.key]?.trim().length ?? 0) > 0,
  )
  const cantAprobados = CONTEXTO_CURADO_CAMPOS.filter(c => aprobados[c.key]).length

  async function confirmarDespliegue() {
    if (!planJrId || !todosAprobados) return
    setSubPaso('confirmando')
    setErrorAccion(null)
    try {
      const res = await fetch(`/api/planes-estrategicos/${planJrId}/confirmar-despliegue-jr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contexto_curado: campos }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorAccion(data?.error ?? `HTTP ${res.status}`)
        setSubPaso('editar')
        return
      }
      setSubPaso('resultado')
    } catch (e) {
      setErrorAccion(e instanceof Error ? e.message : String(e))
      setSubPaso('editar')
    }
  }

  // ─── Render según sub-paso ─────────────────────────────────────────────

  if (errorCarga) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <header className="mb-6">
          <h1 className="text-[20px] font-bold text-foreground">Desplegar Plan Jr</h1>
        </header>
        <div className="rounded-lg border border-red-700/40 bg-red-950/30 px-4 py-3">
          <p className="text-[13px] text-red-200"><span className="font-semibold">Error:</span> {errorCarga}</p>
        </div>
        <div className="mt-4">
          <Link href="/planes-estrategicos" className="text-[13px] text-muted-foreground hover:text-foreground underline">
            ← Volver al listado
          </Link>
        </div>
      </div>
    )
  }

  if (subPaso === 'cargando') {
    return <Loader titulo="Cargando datos del Jr…" detalle="Resolviendo movimientos heredados desde el Plan Sr." />
  }

  if (subPaso === 'proponiendo') {
    return <Loader titulo="La IA está escribiendo el contexto curado…" detalle="El modelo lee propósito + situación + movs heredados y genera los 5 campos que va a ver el dueño Jr. Tarda 60-90s." />
  }

  if (subPaso === 'confirmando') {
    return <Loader titulo="Confirmando despliegue…" detalle="Persistiendo contexto + snapshot de movs en Airtable." />
  }

  if (!planJr) return null

  const linea = planJr.plan

  if (subPaso === 'resultado') {
    return (
      <div className="p-8 max-w-3xl mx-auto space-y-5">
        <header>
          <h1 className="text-[20px] font-bold text-foreground">Plan Jr desplegado ✓</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            <span className="font-semibold text-foreground">{linea.nombre}</span> está en estado <span className="font-semibold text-purple-300">"Listo para compartir"</span>. Volvé al listado y usá el botón "Compartir →" para copiar el link y mandárselo al dueño Jr.
          </p>
        </header>
        <div className="flex gap-2">
          <Link
            href="/planes-estrategicos"
            className={BTN_CTA}
          >
            Ir al listado de planes →
          </Link>
        </div>
      </div>
    )
  }

  // Sub-paso 'revisar': muestra datos del Jr + botón "Proponer contexto".
  if (subPaso === 'revisar') {
    return (
      <div className="p-8 max-w-3xl mx-auto space-y-5">
        <header>
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-[20px] font-bold text-foreground">Desplegar Plan Jr</h1>
            <Link href="/planes-estrategicos" className="text-[12px] text-muted-foreground hover:text-foreground underline">
              ← Cancelar
            </Link>
          </div>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Paso 1 de 2: revisá los datos del Jr y los movimientos heredados. Si todo está OK, pedile a la IA que proponga el contexto curado que va a leer el dueño Jr.
          </p>
        </header>

        {/* Resumen del Jr */}
        <section className="rounded-lg border border-sidebar-border bg-sidebar/30 px-4 py-3 space-y-3">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Plan Jr</p>
            <p className="text-[14px] font-semibold text-foreground">{linea.nombre}</p>
            {linea.plan_sr_nombre && (
              <p className="text-[12px] text-muted-foreground">Derivado de: {linea.plan_sr_nombre}</p>
            )}
          </div>
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Dueño formal</p>
            <p className="text-[13px] text-foreground">{planJr.duenoEmail}</p>
          </div>
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Movimientos heredados ({planJr.movsHeredados.length})
            </p>
            <ul className="text-[13px] text-foreground/90 space-y-0.5">
              {planJr.movsHeredados.map(m => (
                <li key={m.id}>
                  <span className="font-mono text-muted-foreground">{m.id}</span>{' '}
                  <span>{m.nombre}</span>
                  {m.dueno_es_vacante && (
                    <span className="ml-2 text-[12px] text-amber-300">[vacante]</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {errorAccion && (
          <section className="rounded-lg border border-red-700/40 bg-red-950/30 px-4 py-3">
            <p className="text-[13px] text-red-200"><span className="font-semibold">Error:</span> {errorAccion}</p>
          </section>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={pedirPropuestaContexto}
            className={BTN_CTA}
          >
            Proponer contexto con La IA →
          </button>
        </div>
      </div>
    )
  }

  // Sub-paso 'editar': 5 bloques editor + aprobar, footer con gate de confirmar.
  return (
    <div className="p-8 max-w-6xl mx-auto space-y-5">
      <header>
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-[20px] font-bold text-foreground">Desplegar Plan Jr · {linea.nombre}</h1>
          <Link href="/planes-estrategicos" className="text-[12px] text-muted-foreground hover:text-foreground underline">
            ← Cancelar
          </Link>
        </div>
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          Paso 2 de 2: La IA propuso el contexto que va a ver el dueño Jr, dividido en 5 campos. Revisá y editá cada uno, regenerá los que no te cierren, y <span className="font-semibold text-foreground">aprobá los 5</span> para poder confirmar el despliegue.
        </p>
      </header>

      {errorAccion && (
        <section className="rounded-lg border border-red-700/40 bg-red-950/30 px-4 py-3">
          <p className="text-[13px] text-red-200"><span className="font-semibold">Error:</span> {errorAccion}</p>
        </section>
      )}

      {CONTEXTO_CURADO_CAMPOS.map((campo) => {
        const key = campo.key as CampoKey
        const aprobado = !!aprobados[key]
        const vacio = (campos[key]?.trim().length ?? 0) === 0
        const regen = regenerando === key
        return (
          <section
            key={key}
            className={`rounded-lg border ${aprobado ? 'border-emerald-700/50' : 'border-sidebar-border'} bg-sidebar/10`}
          >
            <div className="flex items-center justify-between gap-3 border-b border-sidebar-border px-4 py-2.5">
              <div className="flex items-center gap-2">
                <h2 className="text-[14px] font-semibold text-foreground">{campo.label}</h2>
                {aprobado && (
                  <span className="rounded-full border border-emerald-700/50 bg-emerald-950/40 px-2 py-0.5 text-[12px] font-medium text-emerald-300">
                    ✓ Aprobado
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => regenerarCampo(key)}
                  disabled={regen || !!regenerando}
                  className={BTN_SECONDARY_SM}
                >
                  {regen ? '↻ Regenerando…' : '↻ Regenerar'}
                </button>
                <button
                  type="button"
                  onClick={() => toggleAprobado(key)}
                  disabled={vacio}
                  className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    aprobado
                      ? 'border border-emerald-700/50 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-950/60'
                      : 'bg-emerald-700 text-emerald-50 hover:bg-emerald-600'
                  }`}
                >
                  {aprobado ? 'Desaprobar' : 'Aprobar'}
                </button>
              </div>
            </div>
            <div className="p-3">
              <MarkdownEditor
                value={campos[key] ?? ''}
                onChange={(v) => editarCampo(key, v)}
                rows={campo.key === 'contexto' ? 14 : 8}
                disabled={regen}
              />
            </div>
          </section>
        )
      })}

      <section className="sticky bottom-4 rounded-lg border border-sidebar-border bg-background/95 backdrop-blur-sm px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={regenerarTodo}
            disabled={!!regenerando}
            className={BTN_SECONDARY_SM}
          >
            ↻ Regenerar todo
          </button>
          <div className="text-[12px] text-muted-foreground">
            {cantAprobados}/{CONTEXTO_CURADO_CAMPOS.length} campos aprobados
          </div>
        </div>
        <button
          type="button"
          onClick={confirmarDespliegue}
          disabled={!todosAprobados}
          title={todosAprobados ? '' : 'Aprobá los 5 campos para confirmar.'}
          className={BTN_CTA}
        >
          Confirmar despliegue →
        </button>
      </section>
    </div>
  )
}

function Loader({ titulo, detalle }: { titulo: string; detalle: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="max-w-md text-center space-y-3">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-[14px] font-semibold text-foreground">{titulo}</p>
        <p className="text-[13px] text-muted-foreground leading-relaxed">{detalle}</p>
      </div>
    </div>
  )
}
