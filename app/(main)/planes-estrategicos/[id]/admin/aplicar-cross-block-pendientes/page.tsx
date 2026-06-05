'use client'

// Página admin: aplica los cross-block changes APROBADOS uno por uno,
// permitiendo al user elegir el campo destino con un dropdown cuando el
// locator automático falló (caso típico cuando el reviewer parafrasea
// el "qué dice actualmente" en lugar de citar literal).

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface CrossBlockPendiente {
  id: string
  bloque_afectado: number
  seccion_afectada: string
  severidad: 'Alta' | 'Media' | 'Baja'
  que_dice_actualmente: string
  texto_a_aplicar: string
  fue_editado_por_user: boolean
}

interface CampoEditable {
  path: string
  label: string
  value: string
}

const SEVERIDAD_BG: Record<string, string> = {
  Alta: 'bg-red-900/40 border-red-700 text-red-200',
  Media: 'bg-yellow-900/40 border-yellow-700 text-yellow-200',
  Baja: 'bg-blue-900/40 border-blue-700 text-blue-200',
}

// Estado por cross-block.
interface CrossBlockState {
  selectedPath: string
  editableTexto: string
  applying: boolean
  applied: boolean
  error: string | null
  mostrarTodosCampos: boolean    // toggle para sacar el filtro por bloque
  pathSugerido: string            // auto-suggest basado en seccion_afectada
}

// Heurística para sugerir el campo más probable dado el bloque + sección.
// Tokeniza ambos lados y matchea por palabras compartidas. Devuelve el path
// con mejor score, o '' si no encuentra ninguno razonable.
function suggestPath(bloque: number, seccion: string, campos: CampoEditable[]): string {
  const candidatos = filtrarCamposPorBloque(campos, bloque)
  if (candidatos.length === 0) return ''
  const tokensSeccion = tokenize(seccion)
  if (tokensSeccion.size === 0) return candidatos[0].path  // fallback al primero

  let bestPath = ''
  let bestScore = 0
  for (const c of candidatos) {
    const tokensLabel = tokenize(c.label)
    let score = 0
    for (const t of tokensSeccion) {
      if (tokensLabel.has(t)) score++
    }
    if (score > bestScore) {
      bestScore = score
      bestPath = c.path
    }
  }
  return bestScore > 0 ? bestPath : ''
}

const STOP_WORDS = new Set(['de', 'la', 'el', 'los', 'las', 'una', 'un', 'y', 'o', 'a', 'al', 'del', 'en', 'por', 'para', 'con', 'sin', 'que', 'es', 'lo', 'su', 'sus', 'mi', 'tu', 'se', 'no', 'si', 'ya', 'le', 'me', 'te'])

function tokenize(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')  // sacar acentos
      .replace(/[^\w\s]/g, ' ')                          // sacar puntuación
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w)),
  )
}

function filtrarCamposPorBloque(campos: CampoEditable[], bloque: number): CampoEditable[] {
  if (bloque === 1) return campos.filter(c => c.path.startsWith('proposito.'))
  if (bloque === 2) return campos.filter(c => c.path.startsWith('situacion.'))
  return campos
}

// Agrupa los campos en categorías para optgroup. Mantiene orden de aparición.
function agruparCampos(campos: CampoEditable[]): Array<{ grupo: string; items: CampoEditable[] }> {
  const grupos = new Map<string, CampoEditable[]>()
  function add(grupo: string, c: CampoEditable) {
    const arr = grupos.get(grupo) ?? []
    arr.push(c)
    grupos.set(grupo, arr)
  }
  for (const c of campos) {
    if (c.path === 'proposito.escena') add('Propósito · Texto principal', c)
    else if (c.path === 'proposito.horizonte' || c.path === 'proposito.estabilidad') add('Propósito · Texto principal', c)
    else if (c.path.startsWith('proposito.metricas')) add('Propósito · Métricas', c)
    else if (c.path.startsWith('proposito.fuera')) add('Propósito · Fuera de scope', c)
    else if (c.path === 'situacion.desvio_principal' || c.path === 'situacion.desvio_cuantificado' || c.path === 'situacion.causa_raiz') add('Situación · Desvío y causa', c)
    else if (c.path.startsWith('situacion.consecuencia')) add('Situación · Consecuencias de no actuar', c)
    else if (c.path.startsWith('situacion.recursos') || c.path === 'situacion.intentos_previos') add('Situación · Recursos e intentos', c)
    else if (c.path.startsWith('situacion.desvios_secundarios')) add('Situación · Desvíos secundarios', c)
    else if (c.path.startsWith('situacion.resistencias')) add('Situación · Resistencias y amenazas', c)
    else add('Otros', c)
  }
  return Array.from(grupos.entries()).map(([grupo, items]) => ({ grupo, items }))
}

export default function AplicarCrossBlockPendientesPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id

  const [pendientes, setPendientes] = useState<CrossBlockPendiente[] | null>(null)
  const [campos, setCampos] = useState<CampoEditable[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [estados, setEstados] = useState<Record<string, CrossBlockState>>({})

  useEffect(() => {
    if (!id) return
    let abortado = false
    Promise.all([
      fetch(`/api/planes-estrategicos/${id}/admin/aplicar-cross-block-pendientes`).then(r => r.json()),
      fetch(`/api/planes-estrategicos/${id}/admin/aplicar-cross-block-pendientes/campos`).then(r => r.json()),
    ])
      .then(([cbData, camposData]) => {
        if (abortado) return
        if (!cbData?.ok) { setLoadError(cbData?.error ?? 'Error desconocido'); return }
        if (!camposData?.ok) { setLoadError(camposData?.error ?? 'Error desconocido'); return }
        const cbs: CrossBlockPendiente[] = cbData.cross_block_aprobados ?? []
        const cs: CampoEditable[] = camposData.campos ?? []
        setPendientes(cbs)
        setCampos(cs)
        // Inicializar estado por cross-block con campo sugerido auto-resuelto
        // contra seccion_afectada. Si el suggest no convence al user, puede
        // toggle "mostrar todos los campos" y elegir.
        const init: Record<string, CrossBlockState> = {}
        for (const cb of cbs) {
          const sugerido = suggestPath(cb.bloque_afectado, cb.seccion_afectada, cs)
          init[cb.id] = {
            selectedPath: sugerido,
            editableTexto: cb.texto_a_aplicar,
            applying: false,
            applied: false,
            error: null,
            mostrarTodosCampos: false,
            pathSugerido: sugerido,
          }
        }
        setEstados(init)
      })
      .catch(e => {
        if (!abortado) setLoadError(`Error cargando: ${e?.message ?? String(e)}`)
      })
    return () => { abortado = true }
  }, [id])

  function getCampoValue(path: string): string {
    return campos?.find(c => c.path === path)?.value ?? ''
  }

  function updateEstado(cbId: string, patch: Partial<CrossBlockState>) {
    setEstados(prev => ({ ...prev, [cbId]: { ...prev[cbId], ...patch } }))
  }

  async function aplicarUno(cb: CrossBlockPendiente) {
    const est = estados[cb.id]
    if (!est || est.applying || est.applied) return
    if (!est.selectedPath) {
      updateEstado(cb.id, { error: 'Elegí un campo destino del dropdown.' })
      return
    }
    if (!est.editableTexto.trim()) {
      updateEstado(cb.id, { error: 'El texto a aplicar no puede estar vacío.' })
      return
    }
    updateEstado(cb.id, { applying: true, error: null })
    try {
      const res = await fetch(`/api/planes-estrategicos/${id}/admin/aplicar-cross-block-pendientes/aplicar-uno`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_path: est.selectedPath,
          texto_a_aplicar: est.editableTexto.trim(),
          cross_block_meta: {
            id: cb.id,
            bloque_afectado: cb.bloque_afectado,
            seccion_afectada: cb.seccion_afectada,
            severidad: cb.severidad,
            texto_previo_reviewer: cb.que_dice_actualmente,
          },
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        updateEstado(cb.id, { applying: false, error: data?.error ?? `HTTP ${res.status}` })
        return
      }
      // Actualizar el campo en local state para que el dropdown refleje el nuevo valor.
      setCampos(prev => prev?.map(c => c.path === est.selectedPath ? { ...c, value: data.valor_nuevo } : c) ?? null)
      updateEstado(cb.id, { applying: false, applied: true })
    } catch (e) {
      updateEstado(cb.id, { applying: false, error: e instanceof Error ? e.message : String(e) })
    }
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-4xl mx-auto">
          <p className="text-[14px] text-red-300">{loadError}</p>
        </div>
      </div>
    )
  }
  if (!pendientes || !campos) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-4xl mx-auto">
          <p className="text-[13px] text-muted-foreground">Cargando…</p>
        </div>
      </div>
    )
  }

  const aplicadosCount = Object.values(estados).filter(e => e.applied).length

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-5">
        <header className="space-y-2">
          <h1 className="text-[20px] font-bold text-foreground">Aplicar cross-block manualmente</h1>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            El locator automático falló para estos {pendientes.length} cross-block (el reviewer parafraseó el "qué dice actualmente" en lugar de citarlo literal). Para cada uno: elegí el campo destino del dropdown, ajustá el texto a aplicar si querés, y dale "Aplicar". Cada apply persiste un warning retroactivo en el audit trail.
          </p>
          <p className="text-[12px] text-emerald-300">
            Aplicados: <span className="font-mono font-semibold">{aplicadosCount}</span> de <span className="font-mono font-semibold">{pendientes.length}</span>
          </p>
        </header>

        <section className="space-y-4">
          {pendientes.map(cb => {
            const est = estados[cb.id]
            if (!est) return null
            const valorActualDelCampo = est.selectedPath ? getCampoValue(est.selectedPath) : ''
            return (
              <div
                key={cb.id}
                className={`rounded-lg border px-4 py-3 space-y-3 ${
                  est.applied
                    ? 'border-emerald-700/40 bg-emerald-950/15'
                    : 'border-purple-700/40 bg-purple-950/15'
                }`}
              >
                {/* Header con metadata */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded ${SEVERIDAD_BG[cb.severidad]}`}>
                    {cb.severidad}
                  </span>
                  <span className="text-[12px] text-purple-300 uppercase font-semibold">
                    Bloque {cb.bloque_afectado} · {cb.seccion_afectada}
                  </span>
                  <span className="text-[11px] text-gray-600 font-mono">{cb.id}</span>
                  {cb.fue_editado_por_user && (
                    <span className="text-[10px] text-purple-300 italic">editado por vos</span>
                  )}
                  {est.applied && (
                    <span className="text-[11px] text-emerald-300 font-semibold ml-auto">✓ aplicado</span>
                  )}
                </div>

                {/* Lo que cita el reviewer */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80 mb-1">
                    Lo que el reviewer cita (puede ser paráfrasis)
                  </p>
                  <p className="text-[12px] text-foreground/80 leading-relaxed whitespace-pre-wrap rounded border border-sidebar-border bg-background/40 px-3 py-2 line-clamp-4">
                    {cb.que_dice_actualmente}
                  </p>
                </div>

                {/* Dropdown de campos — filtrado por bloque por default,
                    agrupado por sección con optgroup. Si la sugerencia no
                    convence, toggle "ver todos los campos" muestra el plan
                    entero. */}
                <div>
                  <div className="flex items-baseline justify-between gap-2 mb-1 flex-wrap">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-amber-300/90">
                      Campo destino del plan
                      {est.pathSugerido && est.selectedPath === est.pathSugerido && (
                        <span className="ml-2 text-[10px] text-amber-200/80 normal-case font-normal italic">(sugerido por sección "{cb.seccion_afectada.slice(0, 40)}")</span>
                      )}
                    </label>
                    <button
                      type="button"
                      onClick={() => updateEstado(cb.id, { mostrarTodosCampos: !est.mostrarTodosCampos })}
                      disabled={est.applied}
                      className="text-[11px] text-amber-200/70 hover:text-amber-100 underline disabled:opacity-50"
                    >
                      {est.mostrarTodosCampos
                        ? `← Solo Bloque ${cb.bloque_afectado}`
                        : 'Ver todos los campos →'}
                    </button>
                  </div>
                  <select
                    value={est.selectedPath}
                    onChange={e => updateEstado(cb.id, { selectedPath: e.target.value, error: null })}
                    disabled={est.applied}
                    className="w-full rounded border border-amber-700/40 bg-amber-950/20 px-3 py-2 text-[12px] text-amber-50 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
                  >
                    <option value="">— Elegí el campo del plan donde aplicar —</option>
                    {agruparCampos(
                      est.mostrarTodosCampos
                        ? campos
                        : filtrarCamposPorBloque(campos, cb.bloque_afectado),
                    ).map(g => (
                      <optgroup key={g.grupo} label={g.grupo}>
                        {g.items.map(c => (
                          <option key={c.path} value={c.path}>
                            {c.label}{c.path === est.pathSugerido ? '  ★ sugerido' : ''}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                {/* Valor actual del campo seleccionado */}
                {est.selectedPath && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80 mb-1">
                      Valor actual de "{est.selectedPath}"
                    </p>
                    <p className="text-[12px] text-foreground/70 leading-relaxed whitespace-pre-wrap rounded border border-sidebar-border bg-background/40 px-3 py-2 italic">
                      {valorActualDelCampo || '(vacío)'}
                    </p>
                  </div>
                )}

                {/* Texto a aplicar (editable) */}
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-emerald-300/90 mb-1">
                    Texto a aplicar (editable)
                  </label>
                  <textarea
                    value={est.editableTexto}
                    onChange={e => updateEstado(cb.id, { editableTexto: e.target.value, error: null })}
                    rows={4}
                    disabled={est.applied}
                    className="w-full resize-y rounded border border-emerald-700/40 bg-emerald-950/20 px-3 py-2 text-[12px] text-emerald-50 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                  />
                </div>

                {/* Acciones */}
                {!est.applied && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => aplicarUno(cb)}
                      disabled={est.applying || !est.selectedPath || !est.editableTexto.trim()}
                      className="rounded-md bg-emerald-700 hover:bg-emerald-600 px-4 py-2 text-[13px] font-semibold text-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {est.applying ? 'Aplicando…' : 'Aplicar este cambio'}
                    </button>
                    {est.error && (
                      <p className="text-[12px] text-red-300">{est.error}</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </section>

        {aplicadosCount > 0 && (
          <section className="rounded-lg border border-emerald-700/40 bg-emerald-950/20 px-4 py-3">
            <p className="text-[13px] text-emerald-200">
              <span className="font-semibold">✓</span> {aplicadosCount} cambio{aplicadosCount === 1 ? '' : 's'} aplicado{aplicadosCount === 1 ? '' : 's'}. Andá a <code>/vista</code> para verificar.
            </p>
          </section>
        )}
      </div>
    </div>
  )
}
