'use client'

// Wizard de Creación de Planes Jr (Fase 2 del sistema Sr→Jr).
//
// Flow (3 sub-pasos):
//   1. Loading LLM: POST a /sugerir-lineas-jr → Opus tarda 60-90s → devuelve
//      array de líneas con movs asignados.
//   2. Revisión y edición: el user edita líneas (nombre, descripción, movs,
//      dueño nombre + email). Puede agregar líneas vacías o eliminar líneas.
//   3. Confirmación + resultado: POST a /crear-lineas-jr → crea Users + Plans
//      Jr en cascada → muestra resumen con passwords temporales.
//
// Validaciones del frontend (espejo de las del backend):
//   - Cobertura 100% de movimientos activos del Sr.
//   - Cada línea tiene >= 1 mov + dueño con email válido + nombre.
//   - Mínimo 3 líneas.

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import type { LineaJrPersistida, MovimientoPE, PlanEstrategico } from '@/lib/types'

type SubPaso = 'cargando' | 'revisar' | 'aplicando' | 'resultado'

interface ResultadoApply {
  plans_jr_creados: number
  usuarios_creados: number
  passwords_temporales: Array<{ email: string; nombre: string; password_plano: string }>
}

export default function CrearJrPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const planId = params?.id

  const [subPaso, setSubPaso] = useState<SubPaso>('cargando')
  const [lineas, setLineas] = useState<LineaJrPersistida[]>([])
  const [movsActivos, setMovsActivos] = useState<MovimientoPE[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [errorAplicar, setErrorAplicar] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ResultadoApply | null>(null)

  // Cargar movs activos del Sr + invocar LLM al mount.
  useEffect(() => {
    if (!planId) return
    let abortado = false

    async function cargar() {
      try {
        // 1. Cargar Plan Sr para obtener movs activos.
        const resPlan = await fetch(`/api/planes-estrategicos/${planId}`)
        const dataPlan = await resPlan.json()
        if (!resPlan.ok) throw new Error(dataPlan?.error ?? `HTTP ${resPlan.status}`)
        const plan: PlanEstrategico = dataPlan.plan
        const movs = (plan.plan?.inventario?.movimientos ?? []).filter(m => m.estado_usuario !== 'quitado')
        if (abortado) return
        setMovsActivos(movs)

        // 2. Disparar LLM.
        const resLLM = await fetch(`/api/planes-estrategicos/${planId}/sugerir-lineas-jr`, {
          method: 'POST',
        })
        const dataLLM = await resLLM.json()
        if (abortado) return
        if (!resLLM.ok) throw new Error(dataLLM?.error ?? `HTTP ${resLLM.status}`)
        setLineas(dataLLM.lineas ?? [])
        setWarnings(dataLLM.warnings ?? [])
        setSubPaso('revisar')
      } catch (e) {
        if (!abortado) {
          setErrorCarga(e instanceof Error ? e.message : String(e))
        }
      }
    }
    cargar()
    return () => { abortado = true }
  }, [planId])

  // Cobertura: cuántos movs están asignados a alguna línea.
  const movsAsignadosIds = new Set<string>()
  for (const l of lineas) {
    for (const m of l.movimientos_ids) movsAsignadosIds.add(m)
  }
  const movsSinAsignar = movsActivos.filter(m => !movsAsignadosIds.has(m.id))
  const coberturaCompleta = movsSinAsignar.length === 0 && movsActivos.length > 0
  const lineasValidas = lineas.length >= 3 && lineas.every(l =>
    l.nombre.trim().length > 0 &&
    l.movimientos_ids.length > 0 &&
    l.dueno_jr_email.trim().length > 0 &&
    l.dueno_jr_nombre.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(l.dueno_jr_email.trim()),
  )
  const puedeConfirmar = coberturaCompleta && lineasValidas

  function actualizarLinea(idx: number, patch: Partial<LineaJrPersistida>) {
    setLineas(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l))
  }

  function eliminarLinea(idx: number) {
    setLineas(prev => prev.filter((_, i) => i !== idx))
  }

  function agregarLineaVacia() {
    setLineas(prev => [...prev, {
      id: `linea-nueva-${Date.now()}`,
      nombre: '',
      descripcion: '',
      movimientos_ids: [],
      dueno_jr_email: '',
      dueno_jr_nombre: '',
      estado: 'borrador',
    }])
  }

  async function confirmar() {
    if (!planId || !puedeConfirmar) return
    setSubPaso('aplicando')
    setErrorAplicar(null)
    try {
      const res = await fetch(`/api/planes-estrategicos/${planId}/crear-lineas-jr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineas }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorAplicar(data?.error ?? `HTTP ${res.status}`)
        setSubPaso('revisar')
        return
      }
      setResultado({
        plans_jr_creados: data.plans_jr_creados,
        usuarios_creados: data.usuarios_creados,
        passwords_temporales: data.passwords_temporales ?? [],
      })
      setSubPaso('resultado')
    } catch (e) {
      setErrorAplicar(e instanceof Error ? e.message : String(e))
      setSubPaso('revisar')
    }
  }

  // ─── Render según sub-paso ─────────────────────────────────────────────

  if (errorCarga) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <header className="mb-6">
          <h1 className="text-[20px] font-bold text-foreground">Crear Planes Jr</h1>
        </header>
        <div className="rounded-lg border border-red-700/40 bg-red-950/30 px-4 py-3">
          <p className="text-[13px] text-red-200"><span className="font-semibold">Error cargando:</span> {errorCarga}</p>
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
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-3">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-[14px] font-semibold text-foreground">Analizando el Plan Sr…</p>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            El modelo está leyendo el propósito, situación, inventario completo y curado para sugerir líneas Jr temáticas. Tarda 60-90s.
          </p>
        </div>
      </div>
    )
  }

  if (subPaso === 'aplicando') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-3">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-[14px] font-semibold text-foreground">Creando Planes Jr…</p>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Creando usuarios + planes en Airtable. Tarda 10-30s según cantidad de líneas.
          </p>
        </div>
      </div>
    )
  }

  if (subPaso === 'resultado' && resultado) {
    return (
      <div className="p-8 max-w-3xl mx-auto space-y-5">
        <header>
          <h1 className="text-[20px] font-bold text-foreground">Planes Jr creados ✓</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Se crearon {resultado.plans_jr_creados} Plan{resultado.plans_jr_creados === 1 ? '' : 'es'} Jr en estado "Pendiente despliegue" y {resultado.usuarios_creados} usuario{resultado.usuarios_creados === 1 ? '' : 's'} nuevo{resultado.usuarios_creados === 1 ? '' : 's'}.
          </p>
        </header>

        {resultado.passwords_temporales.length > 0 && (
          <section className="rounded-lg border border-amber-700/40 bg-amber-950/30 px-4 py-3 space-y-3">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wider text-amber-300 mb-1">
                ⚠ Passwords temporales — GUARDÁ ESTOS DATOS AHORA
              </p>
              <p className="text-[12px] text-amber-200/80 leading-relaxed">
                Estos passwords solo se muestran <strong>una vez</strong>. Compartí cada uno con su dueño respectivo por mail/WhatsApp por separado. Después no se pueden recuperar (están hasheados).
              </p>
            </div>
            <ul className="space-y-2">
              {resultado.passwords_temporales.map((p, i) => (
                <li key={i} className="rounded border border-amber-700/50 bg-amber-950/50 px-3 py-2 text-[13px]">
                  <p className="text-amber-100"><span className="font-semibold">{p.nombre}</span> <span className="text-amber-300/80">({p.email})</span></p>
                  <p className="mt-1 text-amber-50 font-mono text-[14px] tracking-wide">{p.password_plano}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex gap-2">
          <Link
            href="/planes-estrategicos"
            className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Ir al listado de planes →
          </Link>
        </div>
      </div>
    )
  }

  // Sub-paso "revisar" — el caso principal.
  return (
    <div className="p-8 max-w-4xl mx-auto space-y-5">
      <header>
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-[20px] font-bold text-foreground">Crear Planes Jr</h1>
          <Link href="/planes-estrategicos" className="text-[12px] text-muted-foreground hover:text-foreground underline">
            ← Cancelar
          </Link>
        </div>
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          El modelo propuso {lineas.length} líneas temáticas para los {movsActivos.length} movs del inventario. Revisalas, ajustá si querés, y asigná dueño a cada una.
        </p>
      </header>

      {/* Resumen de cobertura */}
      <section className="rounded-lg border border-sidebar-border bg-sidebar/30 px-4 py-3 flex items-center justify-between flex-wrap gap-3">
        <div className="text-[13px] text-foreground">
          <span className={coberturaCompleta ? 'text-emerald-300' : 'text-amber-300'}>
            Cobertura: <span className="font-mono font-semibold">{movsAsignadosIds.size} / {movsActivos.length}</span> mov(s) asignados
          </span>
          {!coberturaCompleta && (
            <span className="ml-3 text-[12px] text-muted-foreground">
              Sin asignar: {movsSinAsignar.map(m => m.id).join(', ')}
            </span>
          )}
        </div>
        <div className="text-[12px] text-muted-foreground">
          {lineas.length} línea{lineas.length === 1 ? '' : 's'} (mínimo 3)
        </div>
      </section>

      {warnings.length > 0 && (
        <section className="rounded-lg border border-amber-700/40 bg-amber-950/20 px-4 py-3">
          <p className="text-[12px] font-semibold text-amber-300 mb-1">Avisos del modelo:</p>
          <ul className="text-[12px] text-amber-200/85 space-y-1">
            {warnings.map((w, i) => <li key={i}>· {w}</li>)}
          </ul>
        </section>
      )}

      {errorAplicar && (
        <section className="rounded-lg border border-red-700/40 bg-red-950/30 px-4 py-3">
          <p className="text-[13px] text-red-200"><span className="font-semibold">Error al confirmar:</span> {errorAplicar}</p>
        </section>
      )}

      {/* Líneas editables */}
      <section className="space-y-4">
        {lineas.map((linea, idx) => (
          <LineaSlot
            key={linea.id}
            linea={linea}
            movsActivos={movsActivos}
            movsAsignadosOtrasLineas={Array.from(movsAsignadosIds).filter(id => !linea.movimientos_ids.includes(id))}
            onUpdate={patch => actualizarLinea(idx, patch)}
            onDelete={() => eliminarLinea(idx)}
            puedeEliminar={lineas.length > 3}
          />
        ))}
        <button
          type="button"
          onClick={agregarLineaVacia}
          className="w-full rounded-lg border-2 border-dashed border-sidebar-border hover:border-primary/50 px-4 py-3 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
        >
          + Agregar línea vacía
        </button>
      </section>

      {/* Footer con botón confirmar */}
      <section className="sticky bottom-4 rounded-lg border border-sidebar-border bg-background/95 backdrop-blur-sm px-4 py-3 flex items-center justify-between gap-3">
        <div className="text-[12px] text-muted-foreground">
          {puedeConfirmar
            ? 'Todas las líneas tienen dueño y cobertura completa.'
            : !coberturaCompleta
              ? `Faltan asignar ${movsSinAsignar.length} mov(s) a alguna línea.`
              : lineas.length < 3
                ? `Necesitás al menos 3 líneas (tenés ${lineas.length}).`
                : 'Faltan datos en alguna línea (nombre / dueño / email válido).'}
        </div>
        <button
          type="button"
          onClick={confirmar}
          disabled={!puedeConfirmar}
          className="rounded-lg bg-primary px-5 py-2 text-[13px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Confirmar y crear {lineas.length} Plan{lineas.length === 1 ? '' : 'es'} Jr
        </button>
      </section>
    </div>
  )
}

// ─── LineaSlot: card editable de una línea Jr ──────────────────────────────

function LineaSlot({
  linea,
  movsActivos,
  movsAsignadosOtrasLineas,
  onUpdate,
  onDelete,
  puedeEliminar,
}: {
  linea: LineaJrPersistida
  movsActivos: MovimientoPE[]
  movsAsignadosOtrasLineas: string[]
  onUpdate: (patch: Partial<LineaJrPersistida>) => void
  onDelete: () => void
  puedeEliminar: boolean
}) {
  const [agregandoMov, setAgregandoMov] = useState(false)

  // Movs disponibles para agregar a esta línea = movs activos NO asignados a
  // ninguna otra línea Y no asignados ya a esta línea.
  const disponiblesPool = new Set(movsAsignadosOtrasLineas)
  const yaEnEstaLinea = new Set(linea.movimientos_ids)
  const movsDisponibles = movsActivos.filter(m => !disponiblesPool.has(m.id) && !yaEnEstaLinea.has(m.id))

  function quitarMov(movId: string) {
    onUpdate({ movimientos_ids: linea.movimientos_ids.filter(id => id !== movId) })
  }

  function agregarMov(movId: string) {
    onUpdate({ movimientos_ids: [...linea.movimientos_ids, movId] })
    setAgregandoMov(false)
  }

  // Resolver nombre de un mov por ID para mostrarlo en la lista.
  const nombrePorId = new Map(movsActivos.map(m => [m.id, m.nombre]))
  const movInvalido = (id: string) => !nombrePorId.has(id)

  return (
    <div className="rounded-lg border border-sidebar-border bg-sidebar/30 px-4 py-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-2">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Nombre</label>
            <input
              type="text"
              value={linea.nombre}
              onChange={e => onUpdate({ nombre: e.target.value })}
              placeholder="Ej: Demanda, Oferta, Personas, …"
              className="w-full rounded border border-sidebar-border bg-background px-2 py-1 text-[14px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Descripción</label>
            <textarea
              value={linea.descripcion}
              onChange={e => onUpdate({ descripcion: e.target.value })}
              rows={2}
              placeholder="Qué cubre esta línea operativamente y cómo se distingue de las otras."
              className="w-full rounded border border-sidebar-border bg-background px-2 py-1 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y"
            />
          </div>
        </div>
        {puedeEliminar && (
          <button
            type="button"
            onClick={onDelete}
            title="Eliminar esta línea"
            className="flex-shrink-0 rounded border border-red-900/40 text-red-400/70 hover:text-red-300 hover:bg-red-950/30 px-2 py-1 text-[12px] transition-colors"
          >
            🗑
          </button>
        )}
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          Movimientos asignados ({linea.movimientos_ids.length})
        </p>
        <ul className="space-y-1">
          {linea.movimientos_ids.map(movId => (
            <li key={movId} className="flex items-center gap-2 text-[13px]">
              <span className="font-mono text-[12px] text-muted-foreground">{movId}</span>
              <span className={`flex-1 truncate ${movInvalido(movId) ? 'text-red-400 italic' : 'text-foreground/85'}`}>
                {nombrePorId.get(movId) ?? '(mov no encontrado en inventario)'}
              </span>
              <button
                type="button"
                onClick={() => quitarMov(movId)}
                title="Quitar de esta línea"
                className="text-muted-foreground hover:text-red-400 text-[14px] leading-none"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        {!agregandoMov ? (
          <button
            type="button"
            onClick={() => setAgregandoMov(true)}
            disabled={movsDisponibles.length === 0}
            className="mt-2 text-[12px] text-primary hover:text-primary/80 underline disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
          >
            + Agregar movimiento {movsDisponibles.length === 0 ? '(no hay disponibles)' : ''}
          </button>
        ) : (
          <div className="mt-2 rounded border border-primary/30 bg-primary/5 px-2 py-2 space-y-1 max-h-48 overflow-y-auto">
            {movsDisponibles.length === 0 ? (
              <p className="text-[12px] text-muted-foreground italic">No hay movs disponibles para agregar.</p>
            ) : (
              <>
                {movsDisponibles.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => agregarMov(m.id)}
                    className="w-full text-left flex items-center gap-2 rounded px-2 py-1 text-[13px] hover:bg-primary/10 transition-colors"
                  >
                    <span className="font-mono text-[12px] text-muted-foreground">{m.id}</span>
                    <span className="flex-1 truncate">{m.nombre}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setAgregandoMov(false)}
                  className="w-full text-center text-[11px] text-muted-foreground hover:text-foreground py-1"
                >
                  Cerrar selector
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-sidebar-border/60">
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Dueño del Plan Jr — Nombre
          </label>
          <input
            type="text"
            value={linea.dueno_jr_nombre}
            onChange={e => onUpdate({ dueno_jr_nombre: e.target.value })}
            placeholder="Ej: Caro Carozza"
            className="w-full rounded border border-sidebar-border bg-background px-2 py-1 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Dueño — Email
          </label>
          <input
            type="email"
            value={linea.dueno_jr_email}
            onChange={e => onUpdate({ dueno_jr_email: e.target.value })}
            placeholder="carozza@terravinci.com"
            className="w-full rounded border border-sidebar-border bg-background px-2 py-1 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>
    </div>
  )
}
