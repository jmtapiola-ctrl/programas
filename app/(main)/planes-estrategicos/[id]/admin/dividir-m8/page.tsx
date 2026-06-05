'use client'

// Página admin para dividir M-8 en dos movs (Bloque D del usuario):
//   - M-8 reformulado como SOLO anteproyecto.
//   - M-8B nuevo: ejecución impecable de las 11 obras 2026 (all-time-high).
//
// Hace dos calls al endpoint /paso3/inventario/decision:
//   1. PATCH M-8 (modo single, estado='editado', patch={nombre, que_resuelve}).
//   2. POST agregar M-8B (modo 'agregar' con shape MovimientoPE completo).
//
// Es escape hatch para cuando el modelo verbaliza pero no emite plan.inventario.

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

// Shape parcial: solo los campos que vamos a editar/poblar.
interface MovActual {
  id: string
  nombre: string
  que_resuelve: string
  categoria: string
  dueno?: string
  dueno_es_vacante?: boolean
  dueno_semanas_cobertura?: number
  brechas_atacadas?: string[]
  impacto?: 'alta' | 'media' | 'baja'
  costo_banda_ancha?: string
  duracion_meses_ejecucion?: number
  precondiciones?: string[]
}

export default function DividirM8Page() {
  const params = useParams<{ id: string }>()
  const id = params?.id

  const [m8Actual, setM8Actual] = useState<MovActual | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Form: edición de M-8 (anteproyecto).
  const [m8Nombre, setM8Nombre] = useState('')
  const [m8QueResuelve, setM8QueResuelve] = useState('')

  // Form: nuevo mov M-8B (ejecución obras).
  const [m8bNombre, setM8bNombre] = useState('Ejecución impecable de las 11 obras 2026 (all-time-high)')
  const [m8bQueResuelve, setM8bQueResuelve] = useState(
    'Ejecutar las 11 obras de 2026 sin fallas significativas. El volumen es el all-time-high de obras ejecutándose en paralelo y cualquier falla (atrasos, problemas constructivos, reclamos masivos) daña la confianza del segmento — riesgo reputacional que arrastra al resto del plan estratégico. Aunque la escala fuerte de obra viene en 2027-2028, la ejecución impecable de las 11 obras de 2026 es condición de continuidad.',
  )
  const [m8bCategoria, setM8bCategoria] = useState('')
  const [m8bDueno, setM8bDueno] = useState('')
  const [m8bDuenoEsVacante, setM8bDuenoEsVacante] = useState(false)
  const [m8bDuenoSemanas, setM8bDuenoSemanas] = useState(0)
  const [m8bDuracion, setM8bDuracion] = useState(9)
  const [m8bImpacto, setM8bImpacto] = useState<'alta' | 'media' | 'baja'>('alta')
  const [m8bCostoBanda, setM8bCostoBanda] = useState<'alta' | 'media' | 'baja'>('alta')
  const [m8bPrecondicionM8, setM8bPrecondicionM8] = useState(true)

  const [running, setRunning] = useState(false)
  const [resultados, setResultados] = useState<Array<{ paso: string; ok: boolean; mensaje: string }>>([])

  // Cargar M-8 actual del inventario para pre-poblar.
  useEffect(() => {
    if (!id) return
    let abortado = false
    fetch(`/api/planes-estrategicos/${id}/admin/get-inventario`)
      .then(r => r.json())
      .then(data => {
        if (abortado) return
        if (!data?.ok) {
          setLoadError(data?.error ?? 'No se pudo cargar el inventario.')
          return
        }
        const inv = data.inventario
        const movs = (inv?.movimientos ?? []) as MovActual[]
        const m8 = movs.find(m => m.id === 'M-8')
        if (!m8) {
          setLoadError('No se encontró M-8 en el inventario.')
          return
        }
        setM8Actual(m8)
        setM8Nombre(m8.nombre)
        setM8QueResuelve(m8.que_resuelve)
        setM8bCategoria(m8.categoria)
        setM8bDueno(m8.dueno ?? '')
      })
      .catch(e => {
        if (!abortado) setLoadError(`Error cargando inventario: ${e?.message ?? String(e)}`)
      })
    return () => { abortado = true }
  }, [id])

  async function aplicar() {
    if (!id || running || !m8Actual) return
    setRunning(true)
    setResultados([])
    const acc: Array<{ paso: string; ok: boolean; mensaje: string }> = []

    // Paso 1: PATCH M-8 con cambios narrativos al alcance (solo anteproyecto).
    try {
      const patch: Partial<MovActual> = {}
      if (m8Nombre.trim() !== m8Actual.nombre) patch.nombre = m8Nombre.trim()
      if (m8QueResuelve.trim() !== m8Actual.que_resuelve) patch.que_resuelve = m8QueResuelve.trim()
      if (Object.keys(patch).length > 0) {
        const res = await fetch(`/api/planes-estrategicos/${id}/paso3/inventario/decision`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            movimiento_id: 'M-8',
            estado: 'editado',
            patch,
          }),
        })
        const data = await res.json().catch(() => null)
        acc.push({
          paso: 'Editar M-8',
          ok: res.ok,
          mensaje: res.ok ? 'M-8 actualizado (alcance reformulado a anteproyecto)' : (data?.error ?? `HTTP ${res.status}`),
        })
      } else {
        acc.push({ paso: 'Editar M-8', ok: true, mensaje: 'Sin cambios (nombre/que_resuelve idénticos al actual)' })
      }
      setResultados([...acc])
    } catch (e) {
      acc.push({ paso: 'Editar M-8', ok: false, mensaje: e instanceof Error ? e.message : String(e) })
      setResultados([...acc])
    }

    // Paso 2: Crear M-8B vía modo 'agregar'.
    try {
      const movimientoNuevo = {
        categoria: m8bCategoria.trim() || m8Actual.categoria,
        nombre: m8bNombre.trim(),
        que_resuelve: m8bQueResuelve.trim(),
        dueno: m8bDueno.trim(),
        dueno_es_vacante: m8bDuenoEsVacante,
        ...(m8bDuenoEsVacante && m8bDuenoSemanas > 0 ? { dueno_semanas_cobertura: m8bDuenoSemanas } : {}),
        impacto: m8bImpacto,
        costo_banda_ancha: m8bCostoBanda,
        costo_monetario: { rango_min_usd: 0, rango_max_usd: 0 },
        duracion_meses_ejecucion: m8bDuracion,
        precondiciones: m8bPrecondicionM8 ? ['M-8'] : [],
        desbloquea: [],
        tipo_dependencia: 'sugerida' as const,
        brechas_atacadas: m8Actual.brechas_atacadas ?? [],
      }
      const res = await fetch(`/api/planes-estrategicos/${id}/paso3/inventario/decision`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agregar: { categoria: movimientoNuevo.categoria, movimiento: movimientoNuevo },
        }),
      })
      const data = await res.json().catch(() => null)
      acc.push({
        paso: 'Crear M-8B',
        ok: res.ok,
        mensaje: res.ok
          ? `Movimiento agregado con ID: ${data?.inventario_actualizado?.movimientos?.slice(-1)?.[0]?.id ?? '(ver inventario)'}`
          : (data?.error ?? `HTTP ${res.status}`),
      })
      setResultados([...acc])
    } catch (e) {
      acc.push({ paso: 'Crear M-8B', ok: false, mensaje: e instanceof Error ? e.message : String(e) })
      setResultados([...acc])
    }

    setRunning(false)
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-3xl mx-auto">
          <p className="text-[14px] text-red-300">{loadError}</p>
        </div>
      </div>
    )
  }
  if (!m8Actual) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-3xl mx-auto">
          <p className="text-[13px] text-muted-foreground">Cargando M-8 del inventario…</p>
        </div>
      </div>
    )
  }

  const todoOk = resultados.length === 2 && resultados.every(r => r.ok)

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-3xl mx-auto space-y-5">
        <header className="space-y-2">
          <h1 className="text-[20px] font-bold text-foreground">Dividir M-8 — Bloque D</h1>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            M-8 se reformula como SOLO anteproyecto, y se crea M-8B (o el ID que asigne el server) para "Ejecución impecable de las 11 obras 2026". Edita los campos abajo y aplicá.
          </p>
        </header>

        {/* ─── Editar M-8 ───────────────────────────────────────────────── */}
        <section className="rounded-lg border border-sidebar-border bg-sidebar/30 px-4 py-3 space-y-3">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/80">
            Paso 1: Reformular M-8 (acortar alcance a anteproyecto)
          </p>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80 mb-1">Nombre</label>
            <input
              value={m8Nombre}
              onChange={e => setM8Nombre(e.target.value)}
              className="w-full rounded border border-sidebar-border bg-background/40 px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80 mb-1">Qué resuelve</label>
            <textarea
              value={m8QueResuelve}
              onChange={e => setM8QueResuelve(e.target.value)}
              rows={3}
              className="w-full resize-y rounded border border-sidebar-border bg-background/40 px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </section>

        {/* ─── Crear M-8B ───────────────────────────────────────────────── */}
        <section className="rounded-lg border border-amber-700/40 bg-amber-950/15 px-4 py-3 space-y-3">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-amber-300/90">
            Paso 2: Crear nuevo movimiento (Ejecución obras 2026)
          </p>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-amber-200/80 mb-1">Nombre del nuevo mov</label>
            <input
              value={m8bNombre}
              onChange={e => setM8bNombre(e.target.value)}
              className="w-full rounded border border-amber-700/40 bg-amber-950/20 px-3 py-2 text-[13px] text-amber-50 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-amber-200/80 mb-1">Qué resuelve</label>
            <textarea
              value={m8bQueResuelve}
              onChange={e => setM8bQueResuelve(e.target.value)}
              rows={5}
              className="w-full resize-y rounded border border-amber-700/40 bg-amber-950/20 px-3 py-2 text-[13px] text-amber-50 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-amber-200/80 mb-1">Categoría</label>
              <input
                value={m8bCategoria}
                onChange={e => setM8bCategoria(e.target.value)}
                placeholder={m8Actual.categoria}
                className="w-full rounded border border-amber-700/40 bg-amber-950/20 px-3 py-2 text-[13px] text-amber-50 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-amber-200/80 mb-1">Duración (meses)</label>
              <input
                type="number"
                min={1}
                max={24}
                value={m8bDuracion}
                onChange={e => setM8bDuracion(parseInt(e.target.value, 10) || 1)}
                className="w-full rounded border border-amber-700/40 bg-amber-950/20 px-3 py-2 text-[13px] text-amber-50 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-amber-200/80 mb-1">Dueño</label>
            <input
              value={m8bDueno}
              onChange={e => setM8bDueno(e.target.value)}
              placeholder="Ej: Equipo de Obras, o nombre del director"
              className="w-full rounded border border-amber-700/40 bg-amber-950/20 px-3 py-2 text-[13px] text-amber-50 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-[12px] text-amber-100">
              <input
                type="checkbox"
                checked={m8bDuenoEsVacante}
                onChange={e => setM8bDuenoEsVacante(e.target.checked)}
              />
              Dueño es vacancia
            </label>
            {m8bDuenoEsVacante && (
              <div className="flex items-center gap-2 text-[12px] text-amber-100">
                <span>Sem. cobertura:</span>
                <input
                  type="number"
                  min={1}
                  max={52}
                  value={m8bDuenoSemanas}
                  onChange={e => setM8bDuenoSemanas(parseInt(e.target.value, 10) || 0)}
                  className="w-20 rounded border border-amber-700/40 bg-amber-950/20 px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-amber-200/80 mb-1">Impacto</label>
              <select
                value={m8bImpacto}
                onChange={e => setM8bImpacto(e.target.value as 'alta' | 'media' | 'baja')}
                className="w-full rounded border border-amber-700/40 bg-amber-950/20 px-3 py-2 text-[13px] text-amber-50 focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-amber-200/80 mb-1">Esfuerzo (costo banda ancha)</label>
              <select
                value={m8bCostoBanda}
                onChange={e => setM8bCostoBanda(e.target.value as 'alta' | 'media' | 'baja')}
                className="w-full rounded border border-amber-700/40 bg-amber-950/20 px-3 py-2 text-[13px] text-amber-50 focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-[12px] text-amber-100">
            <input
              type="checkbox"
              checked={m8bPrecondicionM8}
              onChange={e => setM8bPrecondicionM8(e.target.checked)}
            />
            Agregar M-8 como precondición de M-8B (anteproyecto → ejecución)
          </label>
        </section>

        <button
          onClick={aplicar}
          disabled={running || !m8bNombre.trim() || !m8bQueResuelve.trim()}
          className="rounded-lg bg-primary px-5 py-2.5 text-[14px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {running ? 'Aplicando…' : 'Aplicar (editar M-8 + crear M-8B)'}
        </button>

        {resultados.length > 0 && (
          <section className="rounded-lg border border-sidebar-border bg-sidebar/30 px-4 py-3 space-y-1.5">
            {resultados.map((r, i) => (
              <p key={i} className={`text-[13px] ${r.ok ? 'text-green-300' : 'text-red-300'}`}>
                <span className="font-semibold mr-2">{r.ok ? '✓' : '✗'}</span>
                <span className="font-mono text-[11px] mr-2">{r.paso}</span>
                {r.mensaje}
              </p>
            ))}
            {todoOk && (
              <p className="mt-2 text-[12px] text-green-300/90 leading-relaxed">
                Todo OK. Volvé a la entrevista para verificar M-8 reformulado + M-8B nuevo en el inventario. Después regenerá el curado para que la nueva versión incluya el cambio.
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
