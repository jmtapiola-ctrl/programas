'use client'

// Modal de revisión de inventario por categoría (Sub-bloque 3.A del Paso 3).
//
// UX: el usuario revisa los movimientos del inventario UNA categoría a la vez.
// Para cada movimiento: Aceptar / Editar / Quitar. Persistencia inmediata vía
// PATCH /paso3/inventario/decision.
//
// Header: contador "Categoría X de N · Y de Z movimientos procesados".
// Footer: botón "Cerrar categoría y avanzar" se habilita cuando todos los
// movimientos de la categoría tienen decisión (no quedan en 'pendiente').
// Al cerrar última categoría: "Cerrar Inventario y avanzar a 3.B".

import { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { InventarioPE, MovimientoPE, DAGPlanPE, PlanEstrategico, PropositorPE, PreparativosPE } from '@/lib/types'
import { RenombrarBrechasModal } from './RenombrarBrechasModal'
import { MovimientoFormModal } from './MovimientoFormModal'
import { PropuestaDAGModal, type DependenciaPropuesta } from './PropuestaDAGModal'
import { DAGSecuenciacion, computeLayers, computeBandLayout, BAND_WIDTH } from './DAGSecuenciacion'
import { BTN_CTA, BTN_CTA_SM } from '@/components/ui/button-styles'

interface Props {
  planId: string
  plan: PlanEstrategico
  inventario: InventarioPE
  onInventarioUpdate: (inv: InventarioPE) => void
  // Notifica al parent que el propósito cambió (cuando el user renombra
  // una brecha en el modal inicial). Opcional.
  onPropositoUpdate?: (proposito: PropositorPE) => void
  // Notifica al parent que plan.preparativos cambió (cuando se setea
  // brechas_revisadas=true tras el auto-open inicial). Opcional.
  onPreparativosUpdate?: (preparativos: PreparativosPE) => void
  onCerrarInventario: () => void  // dispara cierre formal de 3.A
  // Cierra el modal y vuelve a la entrevista SIN cerrar formalmente 3.A. Lo
  // hecho ya está persistido por acción (API), así que no se pierde nada.
  onSalir?: () => void
  // Vista inicial al montar el modal. Default 'preview'. Pasar 'secuenciacion'
  // para abrir directo en 3.A.6 (caso retroactivo desde 3.B/3.C/3.D).
  vistaInicial?: 'preview' | 'review' | 'validacion' | 'secuenciacion'
  // Modo retroactivo: usuario abre el modal POST-cierre formal de 3.A
  // (ya está en 3.B+). El footer de la vista 'secuenciacion' muestra solo
  // "Cerrar" en lugar de "Cerrar Inventario y avanzar a 3.B" — el cierre
  // formal ya ocurrió en su momento.
  modoRetroactivo?: boolean
}

export function InventarioCategoria({ planId, plan, inventario, onInventarioUpdate, onPropositoUpdate, onPreparativosUpdate, onCerrarInventario, onSalir, vistaInicial, modoRetroactivo }: Props) {
  // Categorías únicas detectadas en orden de aparición
  const categorias = useMemo(() => {
    const seen = new Set<string>()
    const ordered: string[] = []
    for (const m of inventario.movimientos) {
      if (!seen.has(m.categoria)) {
        seen.add(m.categoria)
        ordered.push(m.categoria)
      }
    }
    return ordered
  }, [inventario.movimientos])

  // Categorías vacías que el usuario creó desde la vista general para mover movs
  // existentes hacia ellas (sin agregar un mov nuevo). Existen solo como drop
  // target en la UI hasta que un mov cae adentro (ahí pasan a ser "reales" y se
  // filtran de esta lista). No se persisten — una categoría sin movs no existe
  // en el modelo (se deriva de los movs).
  const [categoriasVacias, setCategoriasVacias] = useState<string[]>([])
  const categoriasMostradas = useMemo(
    () => [...categorias, ...categoriasVacias.filter(c => !categorias.includes(c))],
    [categorias, categoriasVacias],
  )

  function agregarCategoriaVacia() {
    const nombre = window.prompt('Nombre de la nueva categoría (después arrastrá movimientos existentes hacia ella):')?.trim()
    if (!nombre) return
    if (categorias.includes(nombre) || categoriasVacias.includes(nombre)) {
      setError(`La categoría "${nombre}" ya existe.`)
      return
    }
    setCategoriasVacias(prev => [...prev, nombre])
  }

  // Vista: 3 modos del modal de inventario.
  //   'preview'    = pantalla inicial con índice de categorías + nombres de movs
  //                  + renombrar/crear/mover categorías + DnD.
  //   'review'     = revisión categoría-por-categoría (Aceptar/Editar/Quitar).
  //   'validacion' = pantalla final pre-cierre: brechas (métricas del propósito)
  //                  con los movs cross-categoría que las atacan + SI/NO por brecha.
  //                  Habilita "Cerrar Inventario y avanzar a 3.B →" solo si TODAS
  //                  las brechas validadas en SI.
  // Default 'preview' salvo que el caller indique otra vista inicial (ej.
  // 'secuenciacion' para el botón retroactivo del header).
  const [vista, setVista] = useState<'preview' | 'review' | 'validacion' | 'secuenciacion'>(vistaInicial ?? 'preview')
  // Validación SI/NO por brecha (modo validacion). In-memory. Se resetea cada
  // vez que se entra al modo validacion — semántica de "fresh look".
  const [brechasValidadas, setBrechasValidadas] = useState<Record<string, boolean>>({})
  // Flag para mostrar "← Volver a validación" en el header del modo review
  // cuando el user navegó desde el modo validacion.
  const [vinoDeValidacion, setVinoDeValidacion] = useState(false)
  const [categoriaIdx, setCategoriaIdx] = useState(0)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Modal para renombrar brechas (proposito.metricas[].metrica). Accesible
  // desde el header de cualquier vista del modal de inventario. El server
  // hace la cascada a brechas_atacadas[] y criterio_exito.por_metrica[].
  const [renombrarAbierto, setRenombrarAbierto] = useState(false)
  // Modal unificado de movimiento (editar o agregar). Reemplazó al inline edit
  // de MovimientoCard y al NuevoMovimientoForm. Mismo modal usado desde la
  // vista review de categorías y desde la vista validacion por brecha.
  // `desdeSecuenciacion=true` indica que el modal se abrió desde 3.A.6 (botón
  // "✎ Ver detalle" del canvas). Eso habilita los campos de deps en el form.
  // Default false → form sin deps (modo clásico en 3.A.1-3.A.5).
  type MovFormState =
    | { mode: 'editar'; movimiento: MovimientoPE; desdeSecuenciacion?: boolean }
    | { mode: 'agregar'; categoriaInicial?: string; brechaInicial?: string }
    | null
  const [movFormModal, setMovFormModal] = useState<MovFormState>(null)
  // Estado del rename inline de categoría: { editando: bool, draft: string, saving: bool }
  const [renombre, setRenombre] = useState<{ editando: boolean; draft: string; saving: boolean }>({
    editando: false, draft: '', saving: false,
  })
  // Modal de confirmación al mover el último mov de una categoría (esto la "vacía"
  // y, como las categorías se derivan de los movs, la elimina del listado).
  const [confirmacionVaciado, setConfirmacionVaciado] = useState<{
    movId: string
    movNombre: string
    categoriaOrigen: string
    categoriaDestino: string
  } | null>(null)

  // Modal de confirmación antes de cerrar la categoría (pregunta de cierre
  // necesario-suficiente sobre la brecha de la categoría).
  const [mostrandoConfirmacion, setMostrandoConfirmacion] = useState(false)
  // Vista 'secuenciacion' (sub-bloque 3.A.6) — estado del flow de propuesta
  // del DAG completo por Opus. Opus devuelve una lista plana de dependencias;
  // el user revisa el DAG visual en PropuestaDAGModal.
  const [propuestaDAG, setPropuestaDAG] = useState<
    | null
    | { status: 'inferring' }
    | { status: 'ready'; dependencias: DependenciaPropuesta[]; costoUsd: number; latenciaMs: number }
  >(null)
  const [movSeleccionadoSecu, setMovSeleccionadoSecu] = useState<string | null>(null)

  // ─── DAG del plan (3.A.6) ────────────────────────────────────────────────
  // El cliente mantiene un "borrador" local del DAG. Cada mutación (drag de
  // nodos, agregar/quitar movs del stock) marca dagDirty=true y un debounce
  // auto-persiste vía PATCH /paso3/dag/posiciones. El DAG se inicializa desde
  // inventario.dag — si el plan aún no aceptó la propuesta de Opus, queda null.
  const [dagLocal, setDagLocal] = useState<DAGPlanPE | null>(inventario.dag ?? null)
  const [dagDirty, setDagDirty] = useState(false)
  // Sync dagLocal cuando cambia el inventario externamente (ej. acepta propuesta).
  useEffect(() => {
    setDagLocal(inventario.dag ?? null)
  }, [inventario.dag])

  // Auto-add de movs huérfanos: si el user agregó movs en 3.A.1-3.A.5 después
  // de aceptar el DAG, los detectamos al entrar a 3.A.6 y los agregamos al
  // canvas en una columna a la derecha del DAG existente. Cero fricción — el
  // user los arrastra a donde quiera y conecta deps manualmente. Solo aplica
  // cuando ya hay DAG (en empty state, "Proponer dependencias" los integra).
  useEffect(() => {
    if (!dagLocal) return
    const enDag = new Set(dagLocal.movs.map(m => m.mov_id))
    const huerfanos = inventario.movimientos.filter(
      m => m.estado_usuario !== 'quitado' && !enDag.has(m.id),
    )
    if (huerfanos.length === 0) return
    const maxX = dagLocal.movs.length > 0
      ? Math.max(...dagLocal.movs.map(m => m.x))
      : 0
    const nuevos = huerfanos.map((m, i) => ({
      mov_id: m.id,
      x: maxX + 300,
      y: i * 100,
    }))
    setDagLocal({ ...dagLocal, movs: [...dagLocal.movs, ...nuevos] })
    setDagDirty(true)
  }, [dagLocal, inventario.movimientos])

  if (categorias.length === 0) {
    return (
      <ModalShell onClose={() => {}} onSalir={onSalir}>
        <p className="text-[19px] text-muted-foreground">El inventario no tiene categorías. Algo salió mal en la generación.</p>
      </ModalShell>
    )
  }

  const categoriaActual = categorias[categoriaIdx]
  const movsCategoria = inventario.movimientos
    .filter(m => m.categoria === categoriaActual)
    .slice()
    .sort(sortByImpactoDesc)
  // "Procesado" = aceptado o quitado. Un movimiento en estado 'editado' o
  // 'pendiente' NO cuenta — el usuario debe aceptar (o quitar) explícitamente
  // cada uno antes de poder cerrar la categoría.
  const procesados = movsCategoria.filter(m => m.estado_usuario === 'aceptado' || m.estado_usuario === 'quitado').length
  const totalCat = movsCategoria.length
  const todosProcesados = procesados === totalCat
  const esUltimaCategoria = categoriaIdx === categorias.length - 1

  // Estado de procesamiento POR CADA categoría — usado para:
  //   - Habilitar "Siguiente" solo si la próxima ya está toda procesada.
  //   - Renderar el strip de dots de progreso debajo del título.
  // 'completa' = todos los movs aceptados o quitados.
  // 'parcial' = al menos uno procesado y al menos uno sin procesar.
  // 'pendiente' = ninguno procesado todavía.
  type EstadoCat = 'completa' | 'parcial' | 'pendiente'
  const estadoPorCategoria: { cat: string; estado: EstadoCat; total: number; procesados: number }[] = useMemo(() => {
    return categorias.map(cat => {
      const movs = inventario.movimientos.filter(m => m.categoria === cat)
      const proc = movs.filter(m => m.estado_usuario === 'aceptado' || m.estado_usuario === 'quitado').length
      const estado: EstadoCat = movs.length === 0
        ? 'pendiente'
        : proc === movs.length ? 'completa' : proc === 0 ? 'pendiente' : 'parcial'
      return { cat, estado, total: movs.length, procesados: proc }
    })
  }, [categorias, inventario.movimientos])

  const haySinProcesar = estadoPorCategoria.some(e => e.estado !== 'completa')
  const siguienteProcesada = !esUltimaCategoria && estadoPorCategoria[categoriaIdx + 1]?.estado === 'completa'

  // Brecha de la categoría — primera métrica del propósito que matchee la categoría (heurística simple)
  const propMetricas = plan.proposito?.metricas ?? []

  async function aplicarDecision(movimientoId: string, estado: 'aceptado' | 'editado' | 'quitado', patch?: Partial<MovimientoPE>) {
    setSavingId(movimientoId)
    setError(null)
    try {
      const res = await fetch(`/api/planes-estrategicos/${planId}/paso3/inventario/decision`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movimiento_id: movimientoId, estado, patch }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      onInventarioUpdate(data.inventario_actualizado)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingId(null)
    }
  }

  // ─── Vista 'secuenciacion' (3.A.6) — handlers ─────────────────────────────

  // Dispara Opus para que proponga el DAG completo (lista plana de deps).
  // Llamado desde "🧠 Proponer DAG completo con Opus".
  async function dispatchProponerDAG() {
    setPropuestaDAG({ status: 'inferring' })
    setError(null)
    try {
      const res = await fetch(`/api/planes-estrategicos/${planId}/paso3/dag/inferir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      setPropuestaDAG({
        status: 'ready',
        dependencias: data.dependencias,
        costoUsd: data.costo_usd,
        latenciaMs: data.latencia_ms,
      })
    } catch (e) {
      setError(`Falló la propuesta del DAG: ${e instanceof Error ? e.message : String(e)}`)
      setPropuestaDAG(null)
    }
  }

  // Check si agregar la precondición desde→hacia crearía un ciclo. La nueva
  // edge va de desde a hacia (desde es precondición de hacia). Para detectar
  // ciclo, buscamos un camino existente hacia → ... → desde (forward, siguiendo
  // desbloquea). Si existe, agregar desde→hacia cierra un loop.
  // Importante: NO confundir con "desde es ancestro de hacia" — eso es un
  // edge transitivo válido (atajo con tipo distinto), no un ciclo.
  function wouldCreateCycle(desde: string, hacia: string): boolean {
    if (desde === hacia) return true
    const visitados = new Set<string>()
    const cola: string[] = [hacia]
    while (cola.length) {
      const cur = cola.shift()!
      if (cur === desde) return true
      if (visitados.has(cur)) continue
      visitados.add(cur)
      const mov = inventario.movimientos.find(m => m.id === cur)
      // Skip quitados — no participan del DAG activo. Sus refs son huérfanas.
      if (!mov || mov.estado_usuario === 'quitado') continue
      for (const next of mov.desbloquea ?? []) cola.push(next)
    }
    return false
  }

  // Drag-to-connect: crear precondición desde→hacia en el DAG.
  async function aplicarCrearPrecondicion(desde: string, hacia: string) {
    if (wouldCreateCycle(desde, hacia)) {
      setError(`No se aplicó: la conexión ${desde} → ${hacia} crearía un ciclo en las dependencias.`)
      setTimeout(() => setError(null), 5000)
      return
    }
    const target = inventario.movimientos.find(m => m.id === hacia)
    if (!target) return
    const nuevasPrecond = [...(target.precondiciones ?? [])]
    if (nuevasPrecond.includes(desde)) return // ya existe
    nuevasPrecond.push(desde)
    await aplicarDecision(hacia, 'editado', { precondiciones: nuevasPrecond })
  }

  // Eliminar precondición desde→hacia (Delete sobre un edge del DAG).
  async function aplicarQuitarPrecondicion(desde: string, hacia: string) {
    const target = inventario.movimientos.find(m => m.id === hacia)
    if (!target) return
    const nuevasPrecond = (target.precondiciones ?? []).filter(p => p !== desde)
    // También limpiamos precondiciones_tipo[desde] si existía.
    const nuevoTipo = { ...(target.precondiciones_tipo ?? {}) }
    delete nuevoTipo[desde]
    await aplicarDecision(hacia, 'editado', {
      precondiciones: nuevasPrecond,
      precondiciones_tipo: Object.keys(nuevoTipo).length > 0 ? nuevoTipo : undefined,
    })
  }

  // Cambiar tipo y lag de una precondición específica (per-edge). Lag se
  // limpia (ausente) cuando tipo='sugerida' o lag=0.
  async function aplicarCambiarTipoEdge(desde: string, hacia: string, tipo: 'sugerida' | 'ff' | 'fs' | 'continuo', lagMeses: number) {
    const target = inventario.movimientos.find(m => m.id === hacia)
    if (!target) return
    const nuevoTipo = { ...(target.precondiciones_tipo ?? {}), [desde]: tipo }
    const nuevoLag = { ...(target.precondiciones_lag_meses ?? {}) }
    const lag = Math.max(0, Math.floor(lagMeses ?? 0))
    if (tipo !== 'sugerida' && lag > 0) {
      nuevoLag[desde] = lag
    } else {
      delete nuevoLag[desde]
    }
    await aplicarDecision(hacia, 'editado', {
      precondiciones_tipo: nuevoTipo,
      precondiciones_lag_meses: Object.keys(nuevoLag).length > 0 ? nuevoLag : undefined,
    })
  }

  // Editar razonamiento de una precondición específica (per-edge).
  // Si razonamiento es vacío/whitespace, borramos la entry del map.
  async function aplicarEditarRazonamientoEdge(desde: string, hacia: string, razonamiento: string) {
    const target = inventario.movimientos.find(m => m.id === hacia)
    if (!target) return
    const nuevoRaz = { ...(target.precondiciones_razonamiento ?? {}) }
    const limpio = razonamiento.trim()
    if (limpio) {
      nuevoRaz[desde] = limpio
    } else {
      delete nuevoRaz[desde]
    }
    await aplicarDecision(hacia, 'editado', {
      precondiciones_razonamiento: Object.keys(nuevoRaz).length > 0 ? nuevoRaz : undefined,
    })
  }

  // Toggle del flag "deps validadas" del mov. Bookkeeping del user en 3.A.6.
  // Se persiste vía aplicarDecision (PATCH /paso3/inventario/decision).
  async function aplicarToggleValidado(movId: string, validado: boolean) {
    await aplicarDecision(movId, 'editado', { deps_validadas: validado })
  }

  // Auto-acomodar en grilla 2D: X = longest-path layer (capa topológica),
  // Y = top de la banda de su categoría + offset por posición en celda. Las
  // alturas de banda son DINÁMICAS — cada categoría tiene la altura justa
  // para acomodar su max cell count (vía computeBandLayout). Cero overlap
  // garantizado.
  function aplicarAutoAcomodar() {
    if (!dagLocal) return
    if (!window.confirm('Esto reorganiza los nodos del diagrama en la grilla (X = fases según dependencias, Y = categorías del inventario). Tus posiciones manuales se pierden. ¿Continuar?')) return
    const movsActivos = inventario.movimientos.filter(m => m.estado_usuario !== 'quitado')
    const layers = computeLayers(movsActivos)
    const layout = computeBandLayout(movsActivos)
    const NODE_W_LOCAL = 240
    const NODE_H_LOCAL = 76
    const INTRA_GAP = 8
    const PADDING = 12
    // Agrupar por celda (cat + layer) para distribución intra-celda.
    const grupoCelda = new Map<string, MovimientoPE[]>()
    for (const m of movsActivos) {
      const layer = layers.get(m.id) ?? 0
      const key = `${m.categoria}||${layer}`
      const arr = grupoCelda.get(key) ?? []
      arr.push(m)
      grupoCelda.set(key, arr)
    }
    // Sort intra-celda por id para estabilidad.
    for (const arr of grupoCelda.values()) arr.sort((a, b) => a.id.localeCompare(b.id))
    // Lookup: movId → posición en la celda.
    const intraIdx = new Map<string, number>()
    for (const arr of grupoCelda.values()) {
      arr.forEach((m, i) => intraIdx.set(m.id, i))
    }
    const newMovs = dagLocal.movs.map(dm => {
      const m = movsActivos.find(mm => mm.id === dm.mov_id)
      if (!m) return dm  // mov no activo (raro) → no tocar
      const layer = layers.get(dm.mov_id) ?? 0
      const band = layout.bandPorCat.get(m.categoria)
      if (!band) return dm
      // X: centro de la franja layer.
      const snappedCenter = layer * BAND_WIDTH + BAND_WIDTH / 2
      const snappedX = snappedCenter - NODE_W_LOCAL / 2
      // Y: yStart de la banda + padding + offset por posición en celda.
      const idx = intraIdx.get(dm.mov_id) ?? 0
      const intraOffset = idx * (NODE_H_LOCAL + INTRA_GAP)
      const newY = band.yStart + PADDING + intraOffset
      return { ...dm, x: snappedX, y: newY }
    })
    setDagLocal({ ...dagLocal, movs: newMovs })
    setDagDirty(true)
  }

  // ─── Handlers del DAG (3.A.6) ─────────────────────────────────────────
  // Las mutaciones (drag de nodos, agregar/quitar del stock) actualizan el
  // state local y un debounce auto-persiste al server — sin botón Guardar
  // manual. Si el dag no existía todavía (null), lo creamos.
  function moverNodoEnDAG(movId: string, x: number, y: number) {
    setDagLocal(prev => prev
      ? { ...prev, movs: prev.movs.map(m => m.mov_id === movId ? { ...m, x, y } : m) }
      : prev
    )
    setDagDirty(true)
  }

  // Auto-save con debounce: cada vez que dagDirty=true, esperamos 1.2s de
  // quietud y persistimos. No mostramos indicador visual — silencioso.
  useEffect(() => {
    if (!dagDirty || !dagLocal) return
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/planes-estrategicos/${planId}/paso3/dag/posiciones`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ movs: dagLocal.movs }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
        onInventarioUpdate(data.inventario_actualizado)
        setDagDirty(false)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    }, 1200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dagDirty, dagLocal])

  // Handler central del modal de movimientos (editar y agregar). Reusado en
  // las 3 vistas (preview, review, validacion). Las deps del mov nuevo NO se
  // infieren acá — el user las define después en 3.A.6 (DAG canvas).
  function handleMovFormSuccess(invActualizado: InventarioPE, _idNuevo?: string) {
    onInventarioUpdate(invActualizado)
    setMovFormModal(null)
  }

  // Mover un movimiento a otra categoría. Si es el último mov de su categoría
  // origen, primero abre un modal de confirmación (la categoría queda vacía y
  // desaparece del listado). Sin confirmación si la categoría origen tiene
  // otros movs.
  async function aplicarMover(movId: string, categoriaDestino: string) {
    setError(null)
    try {
      const res = await fetch(`/api/planes-estrategicos/${planId}/paso3/inventario/decision`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          movimiento_id: movId,
          // Preservamos estado_usuario actual — el endpoint lo requiere para
          // single-mov mode.
          estado: inventario.movimientos.find(m => m.id === movId)?.estado_usuario ?? 'pendiente',
          patch: { categoria: categoriaDestino },
        }),
      })
      const rawText = await res.text()
      let data: any
      try { data = rawText ? JSON.parse(rawText) : {} } catch { throw new Error(`Server error ${res.status}: ${rawText.slice(0, 200)}`) }
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      onInventarioUpdate(data.inventario_actualizado)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function intentarMover(movId: string, categoriaDestino: string) {
    const mov = inventario.movimientos.find(m => m.id === movId)
    if (!mov || mov.categoria === categoriaDestino) return
    const origen = mov.categoria
    const movsEnOrigen = inventario.movimientos.filter(m => m.categoria === origen)
    if (movsEnOrigen.length === 1) {
      // Es el último — pedir confirmación.
      setConfirmacionVaciado({
        movId,
        movNombre: mov.nombre,
        categoriaOrigen: origen,
        categoriaDestino,
      })
      return
    }
    // No es el último → mover directo.
    aplicarMover(movId, categoriaDestino)
  }

  // Renombrar categoría completa — PATCH al endpoint con modo 4 (renombrar_categoria).
  // Actualiza categoria en TODOS los movimientos de esta categoría + el resumen.
  async function handleRenombrarCategoria() {
    const nueva = renombre.draft.trim()
    if (!nueva || nueva === categoriaActual) {
      setRenombre({ editando: false, draft: '', saving: false })
      return
    }
    setRenombre(r => ({ ...r, saving: true }))
    try {
      const res = await fetch(`/api/planes-estrategicos/${planId}/paso3/inventario/decision`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ renombrar_categoria: { vieja: categoriaActual, nueva } }),
      })
      const rawText = await res.text()
      let data: any
      try { data = rawText ? JSON.parse(rawText) : {} } catch { throw new Error(`Server error ${res.status}: ${rawText.slice(0, 200)}`) }
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      onInventarioUpdate(data.inventario_actualizado)
      setRenombre({ editando: false, draft: '', saving: false })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setRenombre(r => ({ ...r, saving: false }))
    }
  }

  async function cerrarCategoriaYAvanzar() {
    // Persist resumen + avanzar
    const aceptados = movsCategoria.filter(m => m.estado_usuario === 'aceptado').length
    const editados = movsCategoria.filter(m => m.estado_usuario === 'editado').length
    const quitados = movsCategoria.filter(m => m.estado_usuario === 'quitado').length
    try {
      const res = await fetch(`/api/planes-estrategicos/${planId}/paso3/inventario/decision`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoria: categoriaActual, aceptados, editados, quitados }),
      })
      // Defensa contra respuestas no-JSON (ej: HTML del 500 de Next): leer el
      // body como texto y solo después intentar parsear como JSON. Sin esto,
      // res.json() crashea con "unexpected character at line 1 column 1"
      // ocultando el error real del server.
      const rawText = await res.text()
      let data: any
      try {
        data = rawText ? JSON.parse(rawText) : {}
      } catch {
        throw new Error(`Server error ${res.status} (response no-JSON): ${rawText.slice(0, 300)}`)
      }
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}: ${rawText.slice(0, 200)}`)
      onInventarioUpdate(data.inventario_actualizado)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return
    }
    if (esUltimaCategoria) {
      // Última categoría: NO cerramos directo. Pasamos al modo 'validacion'
      // (pantalla final pre-cierre por brecha) donde el user confirma cada
      // brecha individualmente. El cierre real ocurre en el botón final de
      // ese modo.
      setVinoDeValidacion(false)
      setVista('validacion')
    } else {
      setCategoriaIdx(idx => idx + 1)
    }
  }

  // Vista preview: pantalla inicial con categorías + nombres de movimientos,
  // Reset de la validación cada vez que se entra al modo 'validacion' —
  // semántica fresh look: si el user editó algo y vuelve a validación,
  // arranca de cero el repaso brecha por brecha.
  useEffect(() => {
    if (vista === 'validacion') {
      setBrechasValidadas({})
    }
  }, [vista])

  // Auto-open del modal de renombrar brechas la PRIMERA vez que se entra a 3.A.
  // Gate: plan.preparativos.brechas_revisadas (persistente en Airtable). Una vez
  // marcado en true, las brechas NO se vuelven a poder renombrar desde el
  // inventario — el modal solo es accesible en este único momento.
  // Fire-and-forget el POST: si falla, el modal igual se abre y la próxima
  // entrada repetirá el flow (degradación aceptable).
  const hayBrechas = (plan.proposito?.metricas?.length ?? 0) > 0
  const yaRevisado = plan.plan?.preparativos?.brechas_revisadas === true
  useEffect(() => {
    if (!hayBrechas || yaRevisado || renombrarAbierto) return
    setRenombrarAbierto(true)
    fetch(`/api/planes-estrategicos/${planId}/paso3/brechas-revisadas`, { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        if (data?.ok && data.preparativos_actualizado && onPreparativosUpdate) {
          onPreparativosUpdate(data.preparativos_actualizado)
        }
      })
      .catch(() => {/* tolerar fallo de red */})
    // Disparar solo cuando cambian las precondiciones del gate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hayBrechas, yaRevisado, planId])

  const modalRenombrar = renombrarAbierto && plan.proposito ? (
    <RenombrarBrechasModal
      brechas={plan.proposito.metricas}
      planId={planId}
      onSuccess={({ proposito_actualizado, inventario_actualizado }) => {
        if (inventario_actualizado) onInventarioUpdate(inventario_actualizado)
        if (onPropositoUpdate) onPropositoUpdate(proposito_actualizado)
        setRenombrarAbierto(false)
      }}
      onCerrar={() => setRenombrarAbierto(false)}
    />
  ) : null

  // Modal unificado para editar/agregar movimiento. Reusa el mismo flow
  // desde la vista review (categoría) y la vista validacion (brecha).
  // Mountado una sola vez, accesible vía createPortal. Se renderiza en
  // cada return junto al ModalShell.
  // Cuando el modal está en modo editar, computamos si el mov aparece en
  // outputs downstream ya generados (borrador iteraciones o curado versiones).
  // Si sí, el botón "Eliminar" muestra warning extra en el confirm. Defensive
  // chequeo de existencia — el plan puede no tener borrador/curado todavía.
  const referenciadoEnDownstream = (() => {
    if (!movFormModal || movFormModal.mode !== 'editar') return false
    const movId = movFormModal.movimiento.id
    const planoP3 = plan.plan
    if (!planoP3) return false
    // Borrador: cada iteración tiene secuencia_movimientos[].movimientos: string[]
    const borrador = (planoP3 as any).borrador
    const iteraciones: any[] = borrador?.iteraciones ?? []
    for (const it of iteraciones) {
      const secs: any[] = it?.secuencia_movimientos ?? []
      for (const f of secs) {
        if (Array.isArray(f?.movimientos) && f.movimientos.includes(movId)) return true
      }
    }
    // Curado: cada versión tiene secuencia_movimientos[].movimientos_completos: MovimientoPE[]
    const curado = (planoP3 as any).curado
    const versiones: any[] = curado?.versiones ?? []
    for (const v of versiones) {
      const secs: any[] = v?.secuencia_movimientos ?? []
      for (const f of secs) {
        const movs: any[] = f?.movimientos_completos ?? []
        if (movs.some((m: any) => m?.id === movId)) return true
      }
    }
    return false
  })()

  const movFormModalJsx = movFormModal ? (
    <MovimientoFormModal
      {...movFormModal}
      planId={planId}
      categorias={categorias}
      metricasProposito={plan.proposito?.metricas ?? []}
      mostrarDeps={movFormModal.mode === 'editar' && movFormModal.desdeSecuenciacion === true}
      allMovimientos={inventario.movimientos}
      duenosExistentes={inventario.movimientos
        .filter(m => m.estado_usuario !== 'quitado')
        .map(m => m.dueno)}
      referenciadoEnDownstream={referenciadoEnDownstream}
      onSuccess={(inv, idNuevo) => handleMovFormSuccess(inv, idNuevo)}
      onCerrar={() => setMovFormModal(null)}
    />
  ) : null

  // Loading overlay + modal de revisión del DAG propuesto por Opus.
  // Se monta en todas las vistas (sigue activo si el user navega mientras
  // Opus piensa, aunque típicamente queda en la vista 'secuenciacion').
  const propuestaDAGJsx = (
    <>
      {propuestaDAG?.status === 'inferring' && <PropuestaDAGLoadingOverlay />}
      {propuestaDAG?.status === 'ready' && (
        <PropuestaDAGModal
          dependencias={propuestaDAG.dependencias}
          inventario={inventario}
          planId={planId}
          costoUsd={propuestaDAG.costoUsd}
          latenciaMs={propuestaDAG.latenciaMs}
          onSuccess={(invActualizado) => {
            onInventarioUpdate(invActualizado)
            setPropuestaDAG(null)
          }}
          onCerrar={() => setPropuestaDAG(null)}
        />
      )}
    </>
  )

  // permite renombrar categorías antes de empezar la revisión categoría-por-
  // categoría. Click "Empezar revisión" → toggle a vista='review'.
  if (vista === 'preview') {
    return (
      <>
      <ModalShell onClose={() => {}} onSalir={onSalir}>
        <header className="flex-shrink-0 border-b border-sidebar-border px-6 py-4">
          <p className="text-[15px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Sub-bloque 3.A · Inventario · Vista general
          </p>
          <h2 className="mt-1 text-[25px] font-semibold text-foreground">
            {categorias.length} categorías · {inventario.movimientos.length} movimientos
          </h2>
          <p className="mt-1 text-[14px] text-muted-foreground leading-relaxed">
            Editá cada movimiento (✎), aceptalo o quitalo, reorganizá categorías (arrastrando) o agregá lo que falte. Cuando termines, pasá a validar las brechas.
          </p>
          {hayBrechas && (
            <button
              onClick={() => setRenombrarAbierto(true)}
              className="mt-2 text-[13px] font-medium text-primary hover:underline"
              title="Reabrir el editor de nombres de las métricas/brechas del propósito"
            >
              ✎ Renombrar métricas / brechas
            </button>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {categoriasMostradas.map(cat => {
            const movs = inventario.movimientos
              .filter(m => m.categoria === cat)
              .slice()
              .sort(sortByImpactoDesc)
            // Brechas declaradas por los movs (campo brechas_atacadas). Filtramos
            // las métricas del propósito que estén en ese set para mantener el
            // orden canónico del Paso 1.
            const brechasSet = new Set(brechasDeCategoria(movs))
            const metricasBrecha = (plan.proposito?.metricas ?? []).filter((m: any) => brechasSet.has(m.metrica))
            const movsSinBrecha = movs.filter(m => !m.brechas_atacadas?.length).length
            return (
              <PreviewCategoria
                key={cat}
                categoria={cat}
                movimientos={movs}
                metricasBrecha={metricasBrecha.map((m: any) => m.metrica)}
                movsSinBrecha={movsSinBrecha}
                onMover={intentarMover}
                onEditar={(m) => setMovFormModal({ mode: 'editar', movimiento: m })}
                onDecision={(movId, estado) => aplicarDecision(movId, estado)}
                savingId={savingId}
                onRenombrar={async (nueva) => {
                  if (!nueva || nueva === cat) return
                  try {
                    const res = await fetch(`/api/planes-estrategicos/${planId}/paso3/inventario/decision`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ renombrar_categoria: { vieja: cat, nueva } }),
                    })
                    const rawText = await res.text()
                    let data: any
                    try { data = rawText ? JSON.parse(rawText) : {} } catch { throw new Error(`Server error ${res.status}: ${rawText.slice(0, 200)}`) }
                    if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
                    onInventarioUpdate(data.inventario_actualizado)
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e))
                  }
                }}
              />
            )
          })}
          {/* Dos acciones separadas:
              - "+ Categoría": crea una categoría vacía (drop target) para mover
                movs existentes, sin pedir un mov nuevo.
              - "+ Movimiento": abre el modal de agregar (mov completo, puede
                crear su categoría adentro). */}
          <div className="flex gap-3">
            <button
              onClick={agregarCategoriaVacia}
              className="flex-1 rounded-lg border-2 border-dashed border-sidebar-border bg-sidebar/20 px-4 py-3 text-[14px] font-semibold text-muted-foreground hover:bg-accent/40 hover:text-foreground hover:border-primary/40 transition-colors"
            >
              + Categoría (para reorganizar)
            </button>
            <button
              onClick={() => setMovFormModal({ mode: 'agregar' })}
              className="flex-1 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-[14px] font-semibold text-foreground hover:bg-primary/10 hover:border-primary/60 transition-colors"
            >
              + Movimiento
            </button>
          </div>

          {error && (
            <div className="rounded-lg border border-red-700 bg-red-950/50 px-4 py-3 text-[14px] text-red-200">
              {error}
            </div>
          )}
        </div>

        <footer className="flex-shrink-0 border-t border-sidebar-border px-6 py-3 flex items-center justify-end gap-3">
          <button
            onClick={() => setVista('review')}
            className={BTN_CTA}
          >
            {inventario.movimientos.every(m => m.estado_usuario === 'pendiente')
              ? 'Empezar revisión →'
              : 'Continuar revisión →'}
          </button>
        </footer>
      </ModalShell>
      {modalRenombrar}
      {movFormModalJsx}
      {propuestaDAGJsx}
      </>
    )
  }

  // ─── Modo 'validacion' ───────────────────────────────────────────────────
  // Pantalla final pre-cierre: brechas (métricas del propósito) con los movs
  // cross-categoría que las atacan + SI/NO por brecha. Habilita "Cerrar
  // Inventario y avanzar a 3.B →" solo si todas las brechas en SI.
  if (vista === 'validacion') {
    const metricas = plan.proposito?.metricas ?? []
    const totalBrechas = metricas.length
    const totalValidadas = metricas.filter(m => brechasValidadas[m.metrica]).length
    const todasValidadas = totalBrechas > 0 && totalValidadas === totalBrechas
    return (
      <>
      <ModalShell onClose={() => {}} onSalir={onSalir}>
        <header className="flex-shrink-0 border-b border-sidebar-border px-6 py-4">
          <p className="text-[15px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Sub-bloque 3.A · Inventario · Validación por brecha
          </p>
          <h2 className="mt-1 text-[22px] font-semibold text-foreground">
            ¿El conjunto de movimientos elimina cada brecha?
          </h2>
          <p className="mt-1 text-[14px] text-muted-foreground leading-relaxed">
            Repasá brecha por brecha. Click sobre un movimiento para editarlo, o agregá uno nuevo que ataque esa brecha.
          </p>
          <p className="mt-2 text-[13px] text-muted-foreground">
            <strong className="text-foreground">{totalValidadas} de {totalBrechas}</strong> brechas validadas
          </p>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {metricas.map((m: any) => {
            const movsBrecha = inventario.movimientos
              .filter(mov => mov.estado_usuario !== 'quitado')
              .filter(mov => mov.brechas_atacadas?.includes(m.metrica))
              .slice()
              .sort(sortByImpactoDesc)
            const validada = brechasValidadas[m.metrica] === true
            return (
              <BrechaSeccion
                key={m.metrica}
                brecha={m}
                movs={movsBrecha}
                validada={validada}
                onSi={() => setBrechasValidadas(prev => ({ ...prev, [m.metrica]: !prev[m.metrica] }))}
                onClickMov={(mov) => setMovFormModal({ mode: 'editar', movimiento: mov })}
                onAgregarParaBrecha={(brechaName) => setMovFormModal({ mode: 'agregar', brechaInicial: brechaName })}
              />
            )
          })}
          {totalBrechas === 0 && (
            <p className="text-[14px] italic text-muted-foreground">
              No hay métricas del propósito declaradas. Volvé al Paso 1 para definirlas antes de cerrar el inventario.
            </p>
          )}
        </div>

        <footer className="flex-shrink-0 border-t border-sidebar-border px-6 py-3 flex items-center justify-between gap-3">
          <button
            onClick={() => setVista('review')}
            className="rounded-lg border border-sidebar-border px-3 py-2 text-[13px] font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-colors"
          >
            ← Volver a categorías
          </button>
          <button
            onClick={() => setVista('secuenciacion')}
            disabled={!todasValidadas}
            title={todasValidadas ? 'Avanzar al paso de secuenciación (3.A.6) — trabajar dependencias' : 'Marcá SÍ en todas las brechas para habilitar el paso siguiente'}
            className={BTN_CTA}
          >
            Avanzar a Secuenciación →
          </button>
        </footer>
      </ModalShell>
      {modalRenombrar}
      {movFormModalJsx}
      {propuestaDAGJsx}
      </>
    )
  }

  // ─── Modo 'secuenciacion' (Sub-bloque 3.A.6) — DAG del plan ─────────────
  // UN solo DAG por plan: canvas a la izquierda + stock de movs a la derecha.
  // El DAG (entidad persistida en inventario.dag) guarda qué movs aparecen
  // en el canvas y sus posiciones. Las conexiones (precondiciones) se
  // persisten en mov.precondiciones[] vía /paso3/inventario/decision.
  if (vista === 'secuenciacion') {
    const movsActivos = inventario.movimientos
      .filter(m => m.estado_usuario !== 'quitado')
      .slice()
      .sort(sortByImpactoDesc)

    return (
      <>
      <ModalShell onClose={() => {}} wide>
        <header className="flex-shrink-0 border-b border-sidebar-border px-6 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-shrink-0 min-w-0">
            <p className="text-[14px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Sub-bloque 3.A.6 · Secuenciación
            </p>
            {(() => {
              const totalActivos = movsActivos.length
              const validados = movsActivos.filter(m => m.deps_validadas === true).length
              return (
                <span
                  className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground/90"
                  title="Movimientos con dependencias validadas por vos."
                >
                  <span className={`inline-block h-2 w-2 rounded-full ${validados === totalActivos && totalActivos > 0 ? 'bg-green-500' : 'bg-green-500/40'}`} />
                  <span><strong className="text-foreground">{validados}</strong>/{totalActivos} validados</span>
                </span>
              )
            })()}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!modoRetroactivo && (
              <button
                onClick={() => setVista('validacion')}
                className="rounded-md border border-sidebar-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-colors"
              >
                ← Volver a validación
              </button>
            )}
            <button
              onClick={aplicarAutoAcomodar}
              disabled={!dagLocal}
              title="Reorganiza horizontalmente los nodos en franjas según sus dependencias (longest-path). Preserva las posiciones verticales que vos hayas armado."
              className="rounded-md border border-sidebar-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              🔄 Auto-acomodar
            </button>
            <button
              onClick={dispatchProponerDAG}
              disabled={propuestaDAG?.status === 'inferring'}
              title="La AI analiza todo el inventario y propone las dependencias entre los movimientos. ~60-120s."
              className="rounded-md bg-amber-600 px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              🧠 Proponer dependencias
            </button>
            <button
              onClick={() => {
                if (dagDirty && !window.confirm('Tenés cambios sin guardar. ¿Cerrar igual?')) return
                onCerrarInventario()
              }}
              className={BTN_CTA_SM}
            >
              {modoRetroactivo ? 'Cerrar' : 'Cerrar y avanzar a 3.B →'}
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-hidden px-2 py-2">
          {/* CANVAS full-width — sin panel lateral. Movs nuevos agregados en
              sub-bloques anteriores se auto-añaden al canvas como huérfanos
              vía useEffect (más arriba). */}
          <div className="h-full overflow-hidden rounded-lg border border-sidebar-border bg-sidebar/10 relative">
            {dagLocal ? (
              <DAGSecuenciacion
                movsACanvas={dagLocal.movs}
                todosLosMovs={inventario.movimientos}
                movSeleccionadoId={movSeleccionadoSecu}
                onSeleccionar={(id) => setMovSeleccionadoSecu(id)}
                onAgregarMov={() => {}}
                onMoverNodo={moverNodoEnDAG}
                onCrearPrecondicion={(desde, hacia) => void aplicarCrearPrecondicion(desde, hacia)}
                onQuitarPrecondicion={(desde, hacia) => void aplicarQuitarPrecondicion(desde, hacia)}
                onCambiarTipoEdge={(desde, hacia, tipo, lagMeses) => void aplicarCambiarTipoEdge(desde, hacia, tipo, lagMeses)}
                onEditarRazonamientoEdge={(desde, hacia, razonamiento) => void aplicarEditarRazonamientoEdge(desde, hacia, razonamiento)}
                onVerDetalle={(id) => {
                  const m = inventario.movimientos.find(m => m.id === id)
                  if (m) setMovFormModal({ mode: 'editar', movimiento: m, desdeSecuenciacion: true })
                }}
                onToggleValidado={(id, validado) => void aplicarToggleValidado(id, validado)}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center p-8">
                <div className="max-w-md text-center rounded-xl border border-sidebar-border bg-sidebar/30 px-8 py-10 shadow-xl">
                  <div className="text-[40px] mb-3">🧠</div>
                  <h3 className="text-[18px] font-semibold text-foreground mb-2">
                    Empezá por proponer las dependencias
                  </h3>
                  <p className="text-[13px] text-muted-foreground leading-relaxed mb-6">
                    La AI va a analizar tus {movsActivos.length} movimientos y proponer cómo se conectan entre sí. Después vas a editar el resultado como vos quieras.
                  </p>
                  <button
                    onClick={dispatchProponerDAG}
                    disabled={propuestaDAG?.status === 'inferring'}
                    className="rounded-lg bg-amber-600 px-5 py-2.5 text-[14px] font-bold text-white shadow-md hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    🧠 Proponer dependencias
                  </button>
                  <p className="text-[12px] text-muted-foreground/80 mt-3">
                    ~60-120s
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="flex-shrink-0 mx-6 mb-2 rounded-lg border border-red-700 bg-red-950/50 px-4 py-2 text-[13px] text-red-200">
            <p>{error}</p>
          </div>
        )}
      </ModalShell>
      {modalRenombrar}
      {movFormModalJsx}
      {propuestaDAGJsx}
      </>
    )
  }

  return (
    <>
    <ModalShell onClose={() => {}} onSalir={onSalir}>
      <header className="flex-shrink-0 border-b border-sidebar-border px-6 py-4">
        <div className="flex items-center gap-3 flex-wrap">
          {vinoDeValidacion && (
            <button
              onClick={() => { setVinoDeValidacion(false); setVista('validacion') }}
              className="text-[12px] font-medium text-amber-400 hover:underline"
              title="Volver a la pantalla de validación por brecha"
            >
              ← Volver a validación
            </button>
          )}
          <button
            onClick={() => setVista('preview')}
            className="text-[12px] font-medium text-primary hover:underline"
            title="Volver a la vista general de categorías"
          >
            ← Vista general
          </button>
          <p className="text-[15px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Sub-bloque 3.A · Inventario · Categoría {categoriaIdx + 1} de {categorias.length}
          </p>
          {haySinProcesar && (
            <span
              className="inline-block h-2 w-2 rounded-full bg-red-500"
              title="Hay categorías con movimientos sin procesar — no podés cerrar el inventario hasta resolverlas todas"
            />
          )}
        </div>
        {/* Strip de dots de progreso — uno por categoría, color según estado.
            Click en un dot navega directamente a esa categoría. */}
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          {estadoPorCategoria.map((e, i) => {
            const colorClase =
              e.estado === 'completa' ? 'bg-green-600' :
              e.estado === 'parcial' ? 'bg-yellow-500' :
              'bg-muted-foreground/30'
            const esActual = i === categoriaIdx
            return (
              <button
                key={e.cat}
                type="button"
                onClick={() => setCategoriaIdx(i)}
                title={`${e.cat} — ${e.estado} (${e.procesados}/${e.total} procesados)`}
                className={`h-3 w-3 rounded-full transition-all ${colorClase} ${esActual ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-110' : 'hover:scale-110'}`}
              />
            )
          })}
        </div>
        {renombre.editando ? (
          <div className="mt-1 flex items-center gap-2">
            <input
              type="text"
              value={renombre.draft}
              onChange={e => setRenombre(r => ({ ...r, draft: e.target.value }))}
              onKeyDown={e => {
                if (e.key === 'Enter') handleRenombrarCategoria()
                if (e.key === 'Escape') setRenombre({ editando: false, draft: '', saving: false })
              }}
              autoFocus
              disabled={renombre.saving}
              className="flex-1 rounded-md border border-blue-700 bg-blue-950/30 px-2 py-1 text-[22px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-40"
            />
            <button
              onClick={handleRenombrarCategoria}
              disabled={renombre.saving || !renombre.draft.trim() || renombre.draft.trim() === categoriaActual}
              className="rounded-md bg-blue-700 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {renombre.saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              onClick={() => setRenombre({ editando: false, draft: '', saving: false })}
              disabled={renombre.saving}
              className="rounded-md border border-sidebar-border px-3 py-1.5 text-[13px] hover:bg-accent/50 disabled:opacity-40"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <div className="mt-1 flex items-baseline gap-3">
            <h2 className="text-[25px] font-semibold text-foreground">{categoriaActual}</h2>
            <button
              onClick={() => setRenombre({ editando: true, draft: categoriaActual, saving: false })}
              className="text-[12px] font-medium text-primary hover:underline"
              title={`Renombrar categoría (afecta a los ${totalCat} movimientos de esta categoría)`}
            >
              ✎ Renombrar
            </button>
          </div>
        )}
        <p className="mt-1 text-[16px] text-muted-foreground">
          {procesados} de {totalCat} movimientos procesados
        </p>
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-sidebar-border">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${totalCat > 0 ? (procesados / totalCat) * 100 : 0}%` }}
          />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {/* Brecha de la categoría — sección Brecha mencionada en el cuestionario 3.A */}
        {propMetricas.length > 0 && (
          <BrechaCategoria proposito={plan.proposito} situacion={plan.situacion} movimientosCategoria={movsCategoria} />
        )}

        {/* Movimientos */}
        <section>
          <h3 className="text-[17px] font-semibold uppercase tracking-wide text-muted-foreground/80 mb-2">
            Movimientos propuestos ({totalCat})
          </h3>
          <div className="space-y-3">
            {movsCategoria.map(m => (
              <MovimientoCard
                key={m.id}
                movimiento={m}
                saving={savingId === m.id}
                onAceptar={() => aplicarDecision(m.id, 'aceptado')}
                onAbrirModal={() => setMovFormModal({ mode: 'editar', movimiento: m })}
                onQuitar={() => aplicarDecision(m.id, 'quitado')}
              />
            ))}

            {/* Agregar movimiento custom — abre MovimientoFormModal en modo
                agregar con la categoría actual pre-seleccionada. */}
            <div className="space-y-2">
              <button
                onClick={() => setMovFormModal({ mode: 'agregar', categoriaInicial: categoriaActual })}
                className="w-full rounded-lg border-2 border-dashed border-red-700 bg-red-950/20 px-4 pt-4 pb-2 text-[18px] font-semibold text-red-300 hover:bg-red-900/40 hover:border-red-500 hover:text-red-100 transition-colors flex flex-col items-center gap-1"
              >
                <span>+ AGREGAR MOVIMIENTO</span>
                <span className="text-[12px] font-normal opacity-80">(Nuevo movimiento que achica la brecha)</span>
              </button>
              <p className="text-[15px] text-foreground text-center px-4 leading-relaxed">
                Agregá tantos movimientos como creas necesarios hasta que sientas que son SUFICIENTES para eliminar la brecha enunciada arriba.
              </p>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-red-700 bg-red-950/50 px-4 py-3 text-[17px] text-red-200">
            <p className="font-semibold mb-1">Error</p>
            <p>{error}</p>
          </div>
        )}

        {/* Footer no-sticky: aparece recién cuando el user llega al final de
            la lista de movimientos. Antes era sticky (flex-shrink-0 fuera del
            scroll) pero eso tapaba contenido y daba sensación de presión para
            avanzar. Ahora el botón "Cerrar categoría y avanzar" es la última
            cosa que ve después de revisar todos los movs. */}
        <footer className="border-t border-sidebar-border pt-3 mt-2 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[15px] text-muted-foreground">
            {todosProcesados
              ? '✓ Todos aceptados o quitados'
              : `Faltan decidir ${totalCat - procesados} movimiento${(totalCat - procesados) === 1 ? '' : 's'} (aceptar o quitar)`}
          </p>
          <div className="flex items-center gap-2">
            {/* Volver a categoría anterior — solo visible si no es la primera. */}
            {categoriaIdx > 0 && (
              <button
                onClick={() => setCategoriaIdx(idx => Math.max(0, idx - 1))}
                className="rounded-lg border border-sidebar-border px-3 py-2 text-[13px] font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-colors"
                title={`Volver a la categoría anterior (${categorias[categoriaIdx - 1] ?? ''})`}
              >
                ← Volver
              </button>
            )}
            {/* Siguiente categoría — solo habilitado si la próxima ya está toda
                procesada. Permite navegar entre categorías ya cerradas sin
                re-procesar. Si la próxima tiene movs pendientes, el usuario debe
                usar "Cerrar categoría y avanzar" (que valida todos procesados). */}
            {!esUltimaCategoria && siguienteProcesada && (
              <button
                onClick={() => setCategoriaIdx(idx => Math.min(categorias.length - 1, idx + 1))}
                className="rounded-lg border border-sidebar-border px-3 py-2 text-[13px] font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-colors"
                title={`Avanzar a la siguiente categoría ya procesada (${categorias[categoriaIdx + 1] ?? ''})`}
              >
                Siguiente →
              </button>
            )}
            <button
              onClick={() => setMostrandoConfirmacion(true)}
              disabled={!todosProcesados}
              className={BTN_CTA}
            >
              {esUltimaCategoria ? 'Validar brechas →' : 'Cerrar categoría y avanzar →'}
            </button>
          </div>
        </footer>
      </div>

      {/* Confirmación de vaciado al mover el último mov de una categoría.
          Como las categorías se derivan, vaciar = eliminar. Pedimos OK explícito. */}
      {confirmacionVaciado && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sans"
          onClick={() => setConfirmacionVaciado(null)}
        >
          <div
            className="flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-amber-700/60 bg-background shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <header className="border-b border-sidebar-border px-5 py-4">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-amber-400/90">Eliminar categoría</p>
              <h3 className="mt-2 text-[16px] font-semibold text-foreground leading-snug">
                "{confirmacionVaciado.categoriaOrigen}" va a quedar vacía y se eliminará del listado.
              </h3>
              <p className="mt-2 text-[13px] text-muted-foreground leading-relaxed">
                Estás moviendo "{confirmacionVaciado.movNombre}" (el único movimiento de la categoría) a "{confirmacionVaciado.categoriaDestino}". ¿Continuar?
              </p>
            </header>
            <footer className="flex items-center justify-end gap-2 border-t border-sidebar-border px-5 py-3 bg-sidebar/30">
              <button
                onClick={() => setConfirmacionVaciado(null)}
                className="rounded-md border border-sidebar-border px-3 py-2 text-[13px] hover:bg-accent/50"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  const c = confirmacionVaciado
                  setConfirmacionVaciado(null)
                  await aplicarMover(c.movId, c.categoriaDestino)
                }}
                className="rounded-lg bg-amber-600 px-4 py-2 text-[13px] font-bold text-white hover:bg-amber-500 transition-colors"
              >
                Sí, mover y eliminar categoría
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Confirmación necesario/suficiente — fuerza al usuario a parar y
          chequear que los movs aceptados de esta categoría son SUFICIENTES
          para cerrar la brecha enunciada arriba. Es el último gate antes de
          avanzar (o cerrar el inventario entero si es la última categoría). */}
      {mostrandoConfirmacion && (() => {
        const movsKeep = movsCategoria.filter(m => m.estado_usuario !== 'quitado')
        const brechasSet = new Set(brechasDeCategoria(movsKeep))
        const brechas = (plan.proposito?.metricas ?? [])
          .filter((m: any) => brechasSet.has(m.metrica))
          .map((m: any) => m.metrica as string)
        return (
          <ConfirmacionCerrarCategoria
            categoria={categoriaActual}
            esUltimaCategoria={esUltimaCategoria}
            movsKeep={movsKeep}
            brechas={brechas}
            onSiSeguir={async () => {
              setMostrandoConfirmacion(false)
              await cerrarCategoriaYAvanzar()
            }}
            onRevisar={() => setMostrandoConfirmacion(false)}
          />
        )
      })()}
    </ModalShell>
    {modalRenombrar}
    {movFormModalJsx}
    {propuestaDAGJsx}
    </>
  )
}

// Preview de una categoría en la vista general inicial. Header con nombre +
// botón inline "✎ Renombrar" + lista de nombres de movimientos.
function PreviewCategoria({
  categoria,
  movimientos,
  metricasBrecha,
  movsSinBrecha,
  onRenombrar,
  onMover,
  onEditar,
  onDecision,
  savingId,
}: {
  categoria: string
  movimientos: MovimientoPE[]
  // Nombres de las métricas del propósito que esta categoría intenta cerrar
  // (unión del campo brechas_atacadas declarado en los movs).
  metricasBrecha: string[]
  // Cantidad de movs en esta categoría que NO declaran brechas todavía
  // (movs viejos pre-migración, o nuevos sin completar). Si >0, mostramos
  // warning para que el usuario los edite.
  movsSinBrecha: number
  onRenombrar: (nueva: string) => Promise<void> | void
  // Callback al soltar un mov en ESTA categoría (DnD destino). El padre
  // verifica que la categoría origen sea distinta + maneja el warning
  // de "último mov de la categoría origen".
  onMover: (movId: string, categoriaDestino: string) => void
  // Acciones por movimiento desde la vista general (edición no escondida):
  onEditar: (mov: MovimientoPE) => void
  onDecision: (movId: string, estado: 'aceptado' | 'quitado') => void
  savingId: string | null
}) {
  const [editando, setEditando] = useState(false)
  const [draft, setDraft] = useState(categoria)
  const [saving, setSaving] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  async function handleSave() {
    if (!draft.trim() || draft.trim() === categoria) {
      setEditando(false)
      return
    }
    setSaving(true)
    try {
      await onRenombrar(draft.trim())
      setEditando(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (!dragOver) setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const movId = e.dataTransfer.getData('text/plain')
        if (movId) onMover(movId, categoria)
      }}
      className={`rounded-lg border px-4 py-3 transition-colors ${
        dragOver ? 'border-primary bg-primary/10 ring-2 ring-primary/40' : 'border-sidebar-border bg-sidebar/30'
      }`}
    >
      <div className="flex items-baseline gap-3 mb-2">
        {editando ? (
          <>
            <input
              type="text"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSave()
                if (e.key === 'Escape') { setDraft(categoria); setEditando(false) }
              }}
              autoFocus
              disabled={saving}
              className="flex-1 rounded-md border border-blue-700 bg-blue-950/30 px-2 py-1 text-[18px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-40"
            />
            <button
              onClick={handleSave}
              disabled={saving || !draft.trim() || draft.trim() === categoria}
              className="rounded-md bg-blue-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-blue-600 disabled:opacity-40"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              onClick={() => { setDraft(categoria); setEditando(false) }}
              disabled={saving}
              className="rounded-md border border-sidebar-border px-3 py-1.5 text-[12px] hover:bg-accent/50 disabled:opacity-40"
            >
              Cancelar
            </button>
          </>
        ) : (
          <>
            <h3 className="text-[18px] font-semibold text-foreground">{categoria}</h3>
            <span className="text-[12px] text-muted-foreground">({movimientos.length} {movimientos.length === 1 ? 'movimiento' : 'movimientos'})</span>
            <button
              onClick={() => { setDraft(categoria); setEditando(true) }}
              className="text-[12px] font-medium text-primary hover:underline"
              title="Renombrar categoría"
            >
              ✎ Renombrar
            </button>
          </>
        )}
      </div>
      {movimientos.length === 0 ? (
        <p className="text-[13px] italic text-muted-foreground/80 py-2">
          Categoría vacía — arrastrá movimientos existentes acá para reorganizarlos. Si no le movés ninguno, no se guarda.
        </p>
      ) : (
      <>
      {/* Brechas que cierra esta categoría — unión declarativa de
          brechas_atacadas de sus movs. */}
      {metricasBrecha.length > 0 ? (
        <p className="text-[13px] text-amber-300/90 mb-2 leading-snug">
          <span className="font-semibold uppercase tracking-wider text-amber-400/90 text-[12px]">Brecha que cierra:</span>{' '}
          {metricasBrecha.map((m, i) => `${i + 1}) ${m}`).join(' · ')}
        </p>
      ) : (
        <p className="text-[12px] italic text-amber-200/70 mb-2">
          Ningún movimiento de esta categoría declara brechas todavía — editá cada movimiento para asignar al menos 1 métrica del propósito.
        </p>
      )}
      {movsSinBrecha > 0 && metricasBrecha.length > 0 && (
        <p className="text-[12px] italic text-amber-300/70 mb-2">
          ⚠ {movsSinBrecha} de {movimientos.length} movimientos no declaran brechas — editalos para completar.
        </p>
      )}
      <ul className="space-y-1.5 pl-2">
        {movimientos.map(m => {
          const colorImpacto = colorImpactoClass(m.impacto)
          const saving = savingId === m.id
          const quitado = m.estado_usuario === 'quitado'
          const decidido = m.estado_usuario === 'aceptado' || m.estado_usuario === 'editado'
          return (
            <li
              key={m.id}
              draggable={!saving}
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', m.id)
                e.dataTransfer.effectAllowed = 'move'
              }}
              className={`group/mov flex items-center gap-2 text-[14px] cursor-grab active:cursor-grabbing rounded-md px-1.5 py-1 -mx-1.5 hover:bg-foreground/5 ${quitado ? 'opacity-45' : ''}`}
              title="Arrastrar a otra categoría para mover"
            >
              <span className="text-muted-foreground/50 select-none text-[14px]" aria-hidden>⠿</span>
              <span className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${colorImpacto}`} title={`Impacto: ${m.impacto ?? '(sin declarar)'}`} />
              <span className="font-mono text-[13px] text-muted-foreground/70">{m.id}</span>
              <span className={`flex-1 min-w-0 truncate text-foreground/95 ${quitado ? 'line-through' : ''}`}>{m.nombre}</span>
              {/* Estado + acciones por movimiento (edición no escondida) */}
              {decidido && <span className="flex-shrink-0 text-[12px] font-semibold text-emerald-400" title={m.estado_usuario === 'editado' ? 'Editado' : 'Aceptado'}>✓</span>}
              {quitado && <span className="flex-shrink-0 text-[12px] text-muted-foreground">quitado</span>}
              <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover/mov:opacity-100 focus-within:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => onEditar(m)}
                  disabled={saving}
                  title="Editar todos los campos de este movimiento"
                  className="rounded border border-sidebar-border px-1.5 py-0.5 text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent/50 disabled:opacity-40"
                >
                  ✎ Editar
                </button>
                {!decidido && !quitado && (
                  <button
                    type="button"
                    onClick={() => onDecision(m.id, 'aceptado')}
                    disabled={saving}
                    title="Aceptar este movimiento tal cual"
                    className="rounded border border-emerald-700/50 bg-emerald-950/30 px-1.5 py-0.5 text-[12px] text-emerald-300 hover:bg-emerald-950/60 disabled:opacity-40"
                  >
                    ✓ Aceptar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDecision(m.id, quitado ? 'aceptado' : 'quitado')}
                  disabled={saving}
                  title={quitado ? 'Reincorporar este movimiento' : 'Quitar este movimiento del plan'}
                  className="rounded border border-red-900/40 px-1.5 py-0.5 text-[12px] text-red-400/80 hover:text-red-300 hover:bg-red-950/30 disabled:opacity-40"
                >
                  {quitado ? '↩ Reincorporar' : '✕ Quitar'}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      </>
      )}
    </section>
  )
}

// Sección de una brecha en el modo 'validacion' del modal de inventario.
// Lista los movs cross-categoría que atacan esta brecha. Cada mov es
// clickeable y abre el MovimientoFormModal para editar. El footer tiene
// un botón "SI, brecha cubierta" y "+ Agregar movimiento que ataque esta
// brecha" (abre el modal en modo agregar con la brecha pre-marcada).
function BrechaSeccion({
  brecha,
  movs,
  validada,
  onSi,
  onClickMov,
  onAgregarParaBrecha,
}: {
  brecha: { metrica: string; valor_objetivo: string; valor_actual: string }
  movs: MovimientoPE[]
  validada: boolean
  onSi: () => void
  onClickMov: (mov: MovimientoPE) => void
  onAgregarParaBrecha: (brecha: string) => void
}) {
  const sinMovs = movs.length === 0
  const colorBorde =
    validada ? 'border-green-700/60 bg-green-950/20' :
    sinMovs ? 'border-red-700/60 bg-red-950/20' :
    'border-amber-700/60 bg-amber-950/10'
  return (
    <section className={`rounded-lg border-2 ${colorBorde} px-4 py-3 space-y-2 transition-colors`}>
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-wider text-amber-400/90">Brecha</p>
        <h3 className="text-[16px] font-semibold text-foreground mt-0.5">{brecha.metrica}</h3>
        <p className="text-[12px] text-muted-foreground mt-0.5">
          <span className="font-mono uppercase tracking-wider">Hoy:</span> {brecha.valor_actual || '(sin baseline)'}
          {' · '}
          <span className="font-mono uppercase tracking-wider">Target:</span> {brecha.valor_objetivo || '(sin target)'}
        </p>
      </div>

      {sinMovs ? (
        <p className="text-[13px] italic text-red-300/90">
          ⚠ Ningún movimiento ataca esta brecha. Agregá uno con el botón de abajo.
        </p>
      ) : (
        <ul className="space-y-1 pl-2">
          {movs.map(mov => (
            <li key={mov.id}>
              <button
                onClick={() => onClickMov(mov)}
                className="w-full flex items-center gap-2 text-[13px] text-left rounded-md px-1.5 py-1 -mx-1.5 hover:bg-foreground/5 transition-colors cursor-pointer"
                title="Click para editar este movimiento"
              >
                <span className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${colorImpactoClass(mov.impacto)}`} title={`Impacto: ${mov.impacto ?? '(sin declarar)'}`} />
                <span className="font-mono text-[12px] text-muted-foreground/70">{mov.id}</span>
                <span className="text-foreground/95 flex-1">{mov.nombre}</span>
                <span className="text-[11px] text-muted-foreground/60 italic">({mov.categoria})</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="pt-2 border-t border-sidebar-border/40 space-y-2">
        <button
          onClick={() => onAgregarParaBrecha(brecha.metrica)}
          className="w-full rounded-md border-2 border-dashed border-amber-700/60 bg-amber-950/10 px-3 py-2 text-[13px] font-medium text-amber-300 hover:bg-amber-900/30 hover:border-amber-500 hover:text-amber-100 transition-colors"
        >
          + Agregar movimiento que ataque esta brecha
        </button>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] font-medium text-foreground">
            ¿Con estos movimientos elimino la brecha?
          </p>
          <button
            onClick={onSi}
            disabled={sinMovs}
            title={validada ? 'Click para desmarcar' : 'Marcar brecha como cubierta'}
            className={`rounded-md px-3 py-1.5 text-[13px] font-semibold transition-all ${
              validada
                ? 'bg-green-700 text-white ring-2 ring-green-400/40 shadow-inner hover:bg-green-600 active:scale-[0.97] cursor-pointer'
                : sinMovs
                  ? 'bg-green-900/30 text-green-300/40 cursor-not-allowed'
                  : 'bg-green-700/70 text-white hover:bg-green-600 active:scale-[0.97]'
            }`}
          >
            {validada ? '✓ SÍ, brecha cubierta' : 'SÍ, brecha cubierta'}
          </button>
        </div>
      </div>
    </section>
  )
}

// Modal de confirmación previa al cierre de categoría / inventario. Fuerza
// al usuario a chequear que los movimientos aceptados son necesarios y
// suficientes para eliminar la brecha de la categoría.
function ConfirmacionCerrarCategoria({
  categoria,
  esUltimaCategoria,
  movsKeep,
  brechas,
  onSiSeguir,
  onRevisar,
}: {
  categoria: string
  esUltimaCategoria: boolean
  // Movs que quedaron en la categoría (aceptados + editados, excluye quitados).
  movsKeep: MovimientoPE[]
  // Métricas del propósito atacadas por algún mov de la categoría.
  brechas: string[]
  onSiSeguir: () => void
  onRevisar: () => void
}) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sans"
      onClick={onRevisar}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-sidebar-border bg-background shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <header className="border-b border-sidebar-border px-5 py-4">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-amber-400/90">
            Confirmación · {categoria}
          </p>
          <h3 className="mt-2 text-[18px] font-semibold text-foreground leading-snug">
            ¿Estos movimientos <span className="text-amber-300">ELIMINAN</span> o <span className="text-amber-300">ACHICAN MUCHO</span> las brechas?
          </h3>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <section>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-amber-400/90 mb-1.5">
              Brechas
            </p>
            {brechas.length === 0 ? (
              <p className="text-[13px] italic text-red-300/90">
                ⚠ Ningún movimiento de esta categoría declara una brecha del propósito.
              </p>
            ) : (
              <ol className="space-y-1 pl-5 list-decimal marker:text-muted-foreground/60">
                {brechas.map(b => (
                  <li key={b} className="text-[14px] text-foreground/95">{b}</li>
                ))}
              </ol>
            )}
          </section>
          <section>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-amber-400/90 mb-1.5">
              Movimientos
            </p>
            {movsKeep.length === 0 ? (
              <p className="text-[13px] italic text-red-300/90">
                ⚠ Ningún movimiento queda en pie en esta categoría.
              </p>
            ) : (
              <ol className="space-y-1 pl-5 list-decimal marker:text-muted-foreground/60">
                {movsKeep.map(m => (
                  <li key={m.id} className="text-[14px] text-foreground/95">{m.nombre}</li>
                ))}
              </ol>
            )}
          </section>
          <p className="text-[12px] text-muted-foreground leading-relaxed border-t border-sidebar-border/60 pt-3">
            Una vez confirmado, {esUltimaCategoria ? 'pasamos a la pantalla de validación final por brecha — vas a repasar cada brecha del propósito antes del cierre formal del inventario.' : 'avanzamos a la siguiente categoría.'} Si más adelante te das cuenta que falta algo, vas a tener que volver atrás.
          </p>
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-sidebar-border px-5 py-4 bg-sidebar/30">
          <button
            onClick={onRevisar}
            className="rounded-lg bg-amber-500 px-4 py-2 text-[14px] font-bold text-amber-950 shadow-md hover:bg-amber-400 hover:shadow-lg active:scale-[0.98] transition-all"
          >
            No, prefiero revisar/agregar movimientos
          </button>
          <button
            onClick={onSiSeguir}
            className={BTN_CTA}
          >
            Sí, seguir →
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

// Loading overlay para la propuesta del DAG de Opus (3.A.6).
// Opus identifica todas las dependencias del inventario. Latencia esperada
// 60-120s según tamaño del inventario.
function PropuestaDAGLoadingOverlay() {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm font-sans">
      <div className="rounded-xl border border-sidebar-border bg-background px-8 py-6 shadow-2xl text-center space-y-3">
        <div className="flex justify-center">
          <span className="inline-flex gap-1 items-center">
            <span className="animate-bounce delay-0 h-2 w-2 rounded-full bg-amber-500" />
            <span className="animate-bounce delay-150 h-2 w-2 rounded-full bg-amber-500" />
            <span className="animate-bounce delay-300 h-2 w-2 rounded-full bg-amber-500" />
          </span>
        </div>
        <p className="text-[15px] font-semibold text-foreground">Analizando dependencias del plan completo…</p>
        <p className="text-[12px] text-muted-foreground max-w-xs">
          Opus está identificando todas las dependencias entre los movimientos del inventario. Tarda 60-120s.
        </p>
      </div>
    </div>,
    document.body,
  )
}

// Brechas que ataca una categoría = unión del campo brechas_atacadas de todos
// sus movimientos. Source-of-truth declarativa (declarada por el modelo en la
// generación inicial + editable por el usuario después). Reemplaza la heurística
// vieja de matching textual contra ataca_desvio (frágil).
function brechasDeCategoria(movs: MovimientoPE[]): string[] {
  const set = new Set<string>()
  for (const m of movs) {
    for (const b of m.brechas_atacadas ?? []) set.add(b)
  }
  return Array.from(set)
}

// Orden canónico de movs dentro de una categoría / brecha:
//   1º por IMPACTO (alta → media → baja) — qué tanto mueve la aguja.
//   2º por ESFUERZO (baja → media → alta) — dentro del mismo impacto, primero
//      los más baratos de ejecutar (mejor relación impacto/esfuerzo arriba).
// Default 'media' si el mov es viejo y no tiene impacto declarado.
const ordenImpacto: Record<string, number> = { alta: 0, media: 1, baja: 2 }
const ordenEsfuerzo: Record<string, number> = { baja: 0, media: 1, alta: 2 }
function sortByImpactoDesc(a: MovimientoPE, b: MovimientoPE): number {
  const di = (ordenImpacto[a.impacto ?? 'media'] ?? 99) - (ordenImpacto[b.impacto ?? 'media'] ?? 99)
  if (di !== 0) return di
  return (ordenEsfuerzo[a.costo_banda_ancha] ?? 99) - (ordenEsfuerzo[b.costo_banda_ancha] ?? 99)
}

// Color del dot que acompaña a cada mov en las listas (PreviewCategoria,
// BrechaSeccion). Antes reflejaba esfuerzo (rojo/amarillo/verde), pero el
// orden de la lista ya transmite esa info — el dot ahora refleja IMPACTO,
// que es lo que importa para priorizar visualmente.
// Rojo se reserva para errores reales (movs sin brecha, brechas no cubiertas).
export function colorImpactoClass(impacto: MovimientoPE['impacto']): string {
  if (impacto === 'alta')  return 'bg-green-500'
  if (impacto === 'media') return 'bg-yellow-500'
  if (impacto === 'baja')  return 'bg-slate-500'
  return 'bg-slate-700' // sin impacto declarado
}

// Multi-select de chips para MOVIMIENTOS (relaciones de dependencia).
// Filtros aplicados al dropdown:
//   - Excluye self (no podés depender de vos mismo).
//   - Excluye movs 'quitado' (no se puede depender de algo desechado).
//   - Excluye los ya seleccionados en el OTRO campo (mutual exclusion entre
//     precondiciones y desbloquea — son inversos exactos).
// Usado en edit form inline (MovimientoCard) + NuevoMovimientoForm + ModalAgregarMovimiento.
export function MovimientosMultiSelect({ label, hint, movimientos, movActualId, seleccionados, excluirIds, onToggle }: {
  label: string
  hint: string
  movimientos: MovimientoPE[]
  movActualId: string | null  // null cuando es un mov nuevo (no excluye nada por self)
  seleccionados: string[]
  excluirIds: string[]
  onToggle: (movId: string) => void
}) {
  const opciones = movimientos.filter(m =>
    m.id !== movActualId &&
    m.estado_usuario !== 'quitado' &&
    !excluirIds.includes(m.id)
  )
  return (
    <div className="space-y-1">
      <label className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground/80">
        {label}
      </label>
      <p className="text-[12px] text-muted-foreground/70 italic">{hint}</p>
      <div className="flex flex-wrap gap-1.5 mt-1 max-h-[180px] overflow-y-auto p-1 border border-sidebar-border/40 rounded-md bg-background/40">
        {opciones.length === 0 ? (
          <p className="text-[12px] italic text-muted-foreground/60 px-2 py-1">Sin movimientos disponibles.</p>
        ) : opciones.map(m => {
          const selected = seleccionados.includes(m.id)
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onToggle(m.id)}
              className={`rounded-full px-2.5 py-0.5 text-[12px] font-medium transition-colors ${
                selected
                  ? 'bg-blue-700/70 text-blue-50 border border-blue-500/60'
                  : 'border border-sidebar-border text-muted-foreground hover:bg-accent/40 hover:text-foreground'
              }`}
              title={m.nombre}
            >
              {selected ? '✓ ' : ''}<span className="font-mono">{m.id}</span> — {m.nombre.slice(0, 50)}{m.nombre.length > 50 ? '…' : ''}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Multi-select de chips para brechas (métricas del propósito). Toggle por click.
// Usado en edit form inline + ModalAgregar inline + ModalEditarMovimiento.
export function BrechasMultiSelect({ metricas, seleccionadas, onToggle, error }: {
  metricas: { metrica: string }[]
  seleccionadas: string[]
  onToggle: (metrica: string) => void
  error?: boolean
}) {
  // Plan Jr: el propósito se hereda y no hay métricas estructuradas → no se
  // muestra el selector de brechas (no se exige, el cap valida cobertura).
  if (metricas.length === 0) return null
  return (
    <div className="space-y-1">
      <label className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground/80">
        Brecha <span className="text-red-400">*</span>
      </label>
      <p className="text-[12px] text-muted-foreground/70 italic">
        Elegí al menos 1 brecha del Propósito que este movimiento mueva (aunque sea parcialmente). Podés elegir varias.
      </p>
      <div className="flex flex-wrap gap-1.5 mt-1">
        {metricas.map(m => {
          const selected = seleccionadas.includes(m.metrica)
          return (
            <button
              key={m.metrica}
              type="button"
              onClick={() => onToggle(m.metrica)}
              className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
                selected
                  ? 'bg-amber-700/60 text-amber-100 border border-amber-600/60'
                  : 'border border-sidebar-border text-muted-foreground hover:bg-accent/40 hover:text-foreground'
              }`}
            >
              {selected ? '✓ ' : ''}{m.metrica}
            </button>
          )
        })}
      </div>
      {error && (
        <p className="text-[12px] text-red-400 italic mt-1">Tenés que elegir al menos 1 brecha para guardar.</p>
      )}
    </div>
  )
}

function BrechaCategoria({ proposito, situacion, movimientosCategoria }: { proposito?: any; situacion?: any; movimientosCategoria: MovimientoPE[] }) {
  if (!proposito?.metricas?.length) return null
  // Brechas declaradas por los movs (campo brechas_atacadas). Filtramos las
  // métricas del propósito que estén en ese set para mantener el orden canónico.
  const brechasSet = new Set(brechasDeCategoria(movimientosCategoria))
  const metricasRelevantes = proposito.metricas.filter((m: any) => brechasSet.has(m.metrica))
  const sinBrechas = metricasRelevantes.length === 0
  const movsSinBrechas = movimientosCategoria.filter(m => !m.brechas_atacadas?.length).length
  return (
    <details
      open
      className="rounded-xl border-2 border-amber-700/70 bg-gradient-to-br from-amber-950/40 to-amber-900/10 px-5 py-4 shadow-lg"
    >
      <summary className="cursor-pointer text-[18px] font-bold uppercase tracking-wide text-amber-300 flex items-center gap-2">
        <span className="text-[22px]">🎯</span>
        <span>Brecha a cerrar con esta categoría</span>
      </summary>
      <p className="mt-2 text-[13px] text-amber-200/80 italic leading-relaxed">
        Este es el norte de la categoría. Cada movimiento que aceptes o agregues tiene que contribuir a cerrar esta brecha.
      </p>
      <div className="mt-4 space-y-3">
        {metricasRelevantes.map((m: any, i: number) => (
          <div key={i} className="rounded-lg bg-background/40 border border-amber-800/40 px-3 py-2">
            <p className="text-[16px] font-semibold text-foreground">{m.metrica}</p>
            <div className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[14px]">
              <span className="font-mono text-[12px] uppercase tracking-wider text-amber-400/80">Hoy</span>
              <span className="text-foreground/90">{m.valor_actual || '(sin baseline)'}</span>
              <span className="font-mono text-[12px] uppercase tracking-wider text-green-400/80">Meta</span>
              <span className="text-foreground/90">{m.valor_objetivo}</span>
            </div>
          </div>
        ))}
        {sinBrechas && (
          <p className="text-[13px] italic text-amber-200/70">
            Ningún movimiento de esta categoría declara brechas todavía. Editá cada uno para asignar al menos 1 métrica del propósito.
          </p>
        )}
        {!sinBrechas && movsSinBrechas > 0 && (
          <p className="text-[12px] italic text-amber-300/70">
            ⚠ {movsSinBrechas} de {movimientosCategoria.length} movimientos no declaran brechas — editalos para completar.
          </p>
        )}
        {situacion?.desvio_principal && (
          <div className="rounded-lg bg-background/30 border border-amber-800/30 px-3 py-2">
            <p className="text-[12px] font-mono uppercase tracking-wider text-amber-400/80 mb-1">Desvío principal</p>
            <p className="text-[14px] text-foreground/90 leading-snug">{situacion.desvio_principal}</p>
          </div>
        )}
      </div>
    </details>
  )
}

// Card display-only de un movimiento dentro de una categoría (review view).
// El edit inline fue reemplazado por MovimientoFormModal: cualquier click en el
// cuerpo de la card (o en el botón ✎) abre el modal. Aceptar/Quitar siguen
// como botones inline (operaciones rápidas sin editar el form completo).
function MovimientoCard({
  movimiento,
  saving,
  onAceptar,
  onAbrirModal,
  onQuitar,
}: {
  movimiento: MovimientoPE
  saving: boolean
  onAceptar: () => void
  onAbrirModal: () => void
  onQuitar: () => void
}) {
  const estado = movimiento.estado_usuario
  const colorEstado =
    estado === 'aceptado' ? 'border-green-700/50 bg-green-950/20' :
    estado === 'editado' ? 'border-blue-700/50 bg-blue-950/20' :
    estado === 'quitado' ? 'border-gray-700/50 bg-gray-950/30 opacity-50' :
    'border-sidebar-border bg-sidebar/30'

  return (
    <div className={`rounded-lg border ${colorEstado} px-4 py-3`}>
      {/* Header + cuerpo: clickeable para abrir el modal de edición. Excluye
          la barra de botones (Aceptar/Editar/Quitar) que tienen su propio
          handler. Cursor pointer da affordance visual. */}
      <div
        role="button"
        tabIndex={0}
        onClick={onAbrirModal}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrirModal() } }}
        className="cursor-pointer rounded-md -mx-1 px-1 py-0.5 hover:bg-foreground/5 transition-colors"
        title="Click para editar todos los campos"
      >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-mono text-[15px] text-muted-foreground/70">{movimiento.id}</span>
            {/* Esfuerzo (alto=rojo, malo si es alto) */}
            <span className="text-[12px] text-muted-foreground/80">Esfuerzo:</span>
            <span className={`rounded-full px-2 py-0.5 text-[13px] font-semibold uppercase tracking-wider ${
              movimiento.costo_banda_ancha === 'alta' ? 'bg-red-950/50 text-red-300 border border-red-800/50' :
              movimiento.costo_banda_ancha === 'media' ? 'bg-yellow-950/50 text-yellow-300 border border-yellow-800/50' :
              'bg-green-950/50 text-green-300 border border-green-800/50'
            }`}>
              {movimiento.costo_banda_ancha}
            </span>
            {/* Impacto (alto=verde, bueno si es alto) */}
            <span className="text-[12px] text-muted-foreground/80">+ Impacto:</span>
            {movimiento.impacto ? (
              <span className={`rounded-full px-2 py-0.5 text-[13px] font-semibold uppercase tracking-wider ${
                movimiento.impacto === 'alta' ? 'bg-green-950/50 text-green-300 border border-green-800/50' :
                movimiento.impacto === 'media' ? 'bg-yellow-950/50 text-yellow-300 border border-yellow-800/50' :
                'bg-red-950/50 text-red-300 border border-red-800/50'
              }`}>
                {movimiento.impacto}
              </span>
            ) : (
              <span className="rounded-full px-2 py-0.5 text-[12px] italic text-muted-foreground/60 border border-dashed border-sidebar-border">
                sin definir
              </span>
            )}
            {estado !== 'pendiente' && (
              <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[13px] uppercase tracking-wider text-foreground/70">
                {estado}
              </span>
            )}
          </div>
          <h4 className="text-[15px] font-semibold text-foreground">{movimiento.nombre}</h4>
        </div>
      </div>

      <div className="mt-2 space-y-1.5 text-[13px]">
        {movimiento.descripcion && (
          <Linea label="Descripción" valor={movimiento.descripcion} />
        )}
        <Linea label="Qué resuelve" valor={movimiento.que_resuelve} />
        {(movimiento.brechas_atacadas?.length ?? 0) > 0 && (
          <p className="leading-snug">
            <span className="text-[12px] uppercase tracking-wider text-muted-foreground/70 mr-2">Brechas:</span>
            <span className="inline-flex flex-wrap gap-1 align-middle">
              {movimiento.brechas_atacadas!.map(b => (
                <span key={b} className="rounded-full bg-amber-900/40 text-amber-200 border border-amber-700/40 px-2 py-0.5 text-[12px]">{b}</span>
              ))}
            </span>
          </p>
        )}
        <Linea label="Dueño" valor={movimiento.dueno} />
        {movimiento.duracion_meses_ejecucion !== undefined ? (
          <Linea label="Duración" valor={`${movimiento.duracion_meses_ejecucion} ${movimiento.duracion_meses_ejecucion === 1 ? 'mes' : 'meses'}`} />
        ) : movimiento.ventana_temporal ? (
          <Linea label="Ventana (legacy)" valor={`${movimiento.ventana_temporal.arranca} → ${movimiento.ventana_temporal.termina}`} />
        ) : (
          <Linea label="Duración" valor="⚠️ Sin duración — completar" />
        )}
        <Linea label="Costo US$" valor={`$${movimiento.costo_monetario.rango_min_usd.toLocaleString()} - $${movimiento.costo_monetario.rango_max_usd.toLocaleString()}${movimiento.costo_monetario.nota ? ` · ${movimiento.costo_monetario.nota}` : ''}`} />
        <Linea label="Criterio éxito" valor={movimiento.criterio_exito} />
      </div>
      </div>

      {/* Botones disponibles según estado actual:
          - Aceptar: si estado=='aceptado' queda visible como "Aceptado ✓"
            apagado (feedback visual claro de que ya se aplicó).
          - Quitar: oculto si ya está quitado (no tiene sentido re-quitar).
          - Editar: abre el MovimientoFormModal (mismo que clickear el cuerpo).
          El badge arriba indica el estado actual. */}
      <div className="mt-3 pt-3 border-t border-sidebar-border flex gap-2 justify-end">
        {estado === 'aceptado' ? (
          <button
            disabled
            aria-label="Aceptado"
            className="rounded-md bg-green-900/40 border border-green-700/40 px-3 py-1 text-[13px] font-semibold text-green-300/70 cursor-not-allowed"
          >
            ✓ Aceptado
          </button>
        ) : (
          <button
            onClick={onAceptar}
            disabled={saving}
            className="rounded-md bg-green-700 px-3 py-1 text-[13px] font-semibold text-white hover:bg-green-600 disabled:opacity-40 transition-colors"
          >
            ✓ Aceptar
          </button>
        )}
        <button
          onClick={onAbrirModal}
          disabled={saving}
          className={`rounded-md px-3 py-1 text-[13px] font-semibold text-white hover:bg-blue-600 disabled:opacity-40 transition-colors ${
            estado === 'editado' ? 'bg-blue-600 ring-2 ring-blue-400/40' : 'bg-blue-700'
          }`}
        >
          ✎ Editar
        </button>
        {estado !== 'quitado' && (
          <button
            onClick={onQuitar}
            disabled={saving}
            className="rounded-md border border-sidebar-border px-3 py-1 text-[13px] text-muted-foreground hover:bg-accent/50 disabled:opacity-40 transition-colors"
          >
            ✕ Quitar
          </button>
        )}
      </div>
    </div>
  )
}

function Linea({ label, valor }: { label: string; valor: string }) {
  return (
    <p className="leading-snug">
      <span className="text-[12px] uppercase tracking-wider text-muted-foreground/70 mr-2">{label}:</span>
      <span className="text-foreground/90">{valor}</span>
    </p>
  )
}

function Field({ label, value, onChange, multiline }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean }) {
  return (
    <div className="space-y-1">
      <label className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground/80">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-sidebar-border bg-background px-2 py-1.5 text-[14px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full rounded-md border border-sidebar-border bg-background px-2 py-1.5 text-[14px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
      )}
    </div>
  )
}


// Modal con createPortal para escapar cascada CSS de pe-vista-root.
// onSalir (opcional): si se pasa, renderiza un botón "✕ Cerrar" arriba a la
// derecha que devuelve a la entrevista sin cerrar formalmente el inventario
// (lo hecho ya está persistido por acción vía API — no se pierde nada).
function ModalShell({ children, onClose, onSalir, wide }: { children: React.ReactNode; onClose: () => void; onSalir?: () => void; wide?: boolean }) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 font-sans"
      onClick={onClose}
    >
      <div
        className={`relative flex h-[90vh] max-h-[900px] w-full ${wide ? 'max-w-[95vw]' : 'max-w-3xl'} flex-col overflow-hidden rounded-xl border border-sidebar-border bg-background shadow-2xl`}
        onClick={e => e.stopPropagation()}
      >
        {onSalir && (
          <button
            type="button"
            onClick={onSalir}
            title="Cerrar y volver a la entrevista — no perdés lo que hiciste"
            className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-lg border border-sidebar-border bg-background/80 px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
          >
            ✕ Cerrar
          </button>
        )}
        {children}
      </div>
    </div>,
    document.body,
  )
}
