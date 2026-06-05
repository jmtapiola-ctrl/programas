'use client'

// Render del DAG de dependencias dentro de una cadena de 3.A.6.
//
// La cadena define QUÉ movs están en el canvas y CON QUÉ posición. Las edges
// (conexiones) se derivan de mov.precondiciones: una edge A→B existe si
// AMBOS movs están en el canvas y B.precondiciones incluye A.
//
// Interacciones:
//   - Drop de un mov-id desde el stock externo (drag dataTransfer 'application/x-mov-id'
//     o text/plain) → onAgregarMov(movId, x, y).
//   - Drag de un nodo dentro del canvas → onMoverNodo(movId, x, y) on dragstop.
//   - Click en nodo → onSeleccionar(movId).
//   - Drag desde handle source de A al target de B → onCrearPrecondicion(A, B).
//   - Delete sobre edge seleccionado → onQuitarPrecondicion(source, target).

import { useMemo, useCallback, useRef, useState, useEffect } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Panel,
  ViewportPortal,
  Position,
  Handle,
  BaseEdge,
  EdgeLabelRenderer,
  MarkerType,
  getSmoothStepPath,
  useReactFlow,
  useViewport,
  type Node,
  type Edge,
  type NodeProps,
  type Connection,
  type NodeMouseHandler,
  type EdgeChange,
  type NodeChange,
  type EdgeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import type { MovimientoPE, DAGMovPE } from '@/lib/types'
import { normalizeDependenciaTipo, normalizeDepTipoEdge } from '@/lib/types'
import { colorImpactoClass } from './InventarioCategoria'

interface Props {
  movsACanvas: DAGMovPE[]                      // movs visibles + posiciones en el DAG del plan
  todosLosMovs: MovimientoPE[]                 // inventario completo (lookup)
  movSeleccionadoId: string | null
  // Acepta string para seleccionar o null para deseleccionar (click en el
  // mismo nodo o en el pane vacío).
  onSeleccionar: (movId: string | null) => void
  onAgregarMov: (movId: string, x: number, y: number) => void
  onMoverNodo: (movId: string, x: number, y: number) => void
  onCrearPrecondicion: (desde: string, hacia: string) => void
  onQuitarPrecondicion: (desde: string, hacia: string) => void
  onCambiarTipoEdge: (desde: string, hacia: string, tipo: 'sugerida' | 'ff' | 'fs' | 'continuo', lagMeses: number) => void
  onEditarRazonamientoEdge?: (desde: string, hacia: string, razonamiento: string) => void
  // Trigger para abrir el detalle del mov seleccionado (modal de edición).
  // Opcional: si no se pasa, el botón "Ver detalle" no aparece (ej: preview).
  onVerDetalle?: (movId: string) => void
  // Toggle del flag "deps validadas" del mov (bookkeeping del usuario).
  // Opcional: si no se pasa, el checkbox del nodo no aparece (ej: preview).
  onToggleValidado?: (movId: string, validado: boolean) => void
  // Override de razonamiento por edge: para el modal de preview donde el
  // razonamiento viene de Opus, no del inventario. Key: `${desde}->${hacia}`.
  razonamientosOverride?: Record<string, string>
  // Config opcional de bandas Y: si no se pasa, agrupa por m.categoria
  // (comportamiento del 3.A.6). Para usos como P-4 con eje Y = fase, se
  // pasa un bandKeyFn que mapea cada mov a su fase asignada por el user/AI.
  bandConfig?: BandConfig
  // Config opcional de bandas X (verticales). Si NO se pasa, el render de X
  // usa BAND_COUNT stripes de la grilla topológica (3.A.6). Si se pasa, las
  // bandas X se renderean como lanes labeled (xBandWidth cada una) con labels
  // sticky al TOP del canvas. Útil para Option C de P-4: X = fase temporal,
  // Y = categoría. El bandKeyFn devuelve la clave de la banda X de cada mov.
  xBandConfig?: BandConfig
  // Ancho de cada banda X en pixels. Default = BAND_WIDTH (380). Para P-4 con
  // 2 movs por fila se pasa 540 (= 2 × NODE_W + 2 × INTRA_GAP_X + padding).
  xBandWidth?: number
  // Cuántos movs entran lado-a-lado dentro de una sub-fila de la misma celda
  // (categoría × banda X). Default 1. P-4 usa 2 para reducir scroll vertical.
  // Afecta tanto la altura calculada de cada banda Y (computeBandLayout) como
  // el snap horizontal de drag.
  nodosPorFila?: number
  // Warnings por mov a renderear como badge ⚠️ en el nodo. Útil para flagear
  // inconsistencias (ej: en P-4, un mov en fase anterior a su precondicion DURA).
  // Key: movId. Value: mensaje del tooltip al hover.
  warningPorMov?: Map<string, string>
  // Tooltip extra por mov al hover, para info contextual (ej: en P-4, el
  // razonamiento de la AI sobre por qué sugirió esta fase).
  tooltipPorMov?: Map<string, string>
  // Si true, el clamp Y on-drop permite que el mov cambie de banda Y según
  // dónde lo dropeó el user. Dispara `onCambioBanda` con la nueva clave.
  // Default false: clamp duro a la banda actual del mov (3.A.6).
  permitirCambioBanda?: boolean
  // Callback cuando el user arrastra un mov a otra banda Y. Solo se llama si
  // `permitirCambioBanda=true` y la Y final cae en una banda distinta a la
  // actual. La nueva banda viene como `nuevaBanda` (la clave que devuelve
  // bandConfig.bandKeyFn). El parent decide qué hacer (actualizar state).
  onCambioBanda?: (movId: string, nuevaBanda: string) => void
  // Análogo a permitirCambioBanda pero para el eje X (lanes verticales).
  // Solo aplica si `xBandConfig` está definido. Cuando el user arrastra un mov
  // a otra lane X (ej: de Q2 a Q3 en P-4), dispara `onCambioBandaX`.
  permitirCambioBandaX?: boolean
  onCambioBandaX?: (movId: string, nuevaBanda: string) => void
  // P-4 override mode: cuando se pasa, el drag horizontal en CUALQUIER mov
  // (incluyendo los spanning) dispara este callback con la X absoluta donde el
  // user soltó el nodo. El parent convierte X → fecha (vía xToDate) y aplica
  // un arranca_override al mov. Cuando este callback está presente, NO se
  // aplica el spanning-skip ni el snap-a-banda-X — los reemplaza este flujo.
  onArrancaOverrideDrag?: (movId: string, xAbsoluto: number) => void
  // Renderer opcional para contenido extra dentro del header horizontal de
  // cada banda Y (solo aplica cuando bandConfig.topHeaderHeight > 0). Recibe
  // la clave de la banda y devuelve un ReactNode que se renderea al lado del
  // label principal (ej: badge "⏳ Vacante · 8 sem" en P-4).
  bandHeaderExtra?: (key: string) => React.ReactNode
  // Comportamiento de viewport al seleccionar un mov (click o chip externo):
  //  - 'center' (default, 3.A.6): centra el nodo en pantalla.
  //  - 'top-left' (P-4): anchorea el nodo arriba-izquierda del viewport, para
  //    que el user pueda seguir las flechas saliendo hacia derecha y abajo.
  posicionAlSeleccionar?: 'center' | 'top-left'
  // Modo preview/visualización: deshabilita interacciones (drag-to-connect,
  // mover nodos, drop, menú de edges editable). Solo lectura.
  readOnly?: boolean
  // Si true, oculta el chip de categoría del header de cada nodo. El nombre
  // pasa de line-clamp-2 a line-clamp-3 para usar el espacio liberado. Útil
  // en la vista de prestigio del plan donde la categoría es metadata interna
  // y queremos que el nombre del mov sea más legible.
  hideCategoria?: boolean
}

// Helper: determinar tipo de un edge (per-edge si existe, fallback al tipo
// global del mov target). Normaliza legacy 'dura'/'blanda' → 'ff'/'sugerida'.
function getTipoEdge(target: MovimientoPE, desdeId: string): 'sugerida' | 'ff' | 'fs' | 'continuo' {
  const perEdge = target.precondiciones_tipo?.[desdeId]
  const normalizedPerEdge = normalizeDepTipoEdge(perEdge)
  // Si el per-edge es 'sugerida' por DEFAULT (no estaba seteado), caer al global.
  if (perEdge !== undefined) return normalizedPerEdge
  // Fallback: tipo_dependencia global del mov.
  const globalNorm = normalizeDependenciaTipo(target.tipo_dependencia)
  if (globalNorm === 'ff' || globalNorm === 'fs' || globalNorm === 'continuo') return globalNorm
  return 'sugerida'
}

// Helper: obtener lag por edge en meses. Default 0 si ausente o tipo='sugerida'.
function getLagEdge(target: MovimientoPE, desdeId: string): number {
  const raw = target.precondiciones_lag_meses?.[desdeId]
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0
  return Math.max(0, Math.floor(raw))
}

// Helper: obtener razonamiento de un edge. Prioridad:
//   1. razonamientosOverride (preview de Opus).
//   2. target.precondiciones_razonamiento[desdeId] (persistido en el inventario).
//   3. '' si no hay.
function getRazonamientoEdge(
  target: MovimientoPE,
  desdeId: string,
  override?: Record<string, string>,
): string {
  if (override) {
    const key = `${desdeId}->${target.id}`
    if (override[key]) return override[key]
  }
  return target.precondiciones_razonamiento?.[desdeId] ?? ''
}

// Tamaño de nodos.
const NODE_W = 240
const NODE_H = 76

// Franjas verticales para snap-to-band. Cada franja mide BAND_WIDTH px y
// representa una columna visual donde se alinean nodos. El número total
// (BAND_COUNT) es solo el render — el snap funciona para cualquier X (incluso
// más allá de la última franja).
//
// Para usos como P-4 (2 movs por fila dentro de cada lane), pasar
// `xBandWidth` como prop con un valor mayor (ej: 540 = 2 × NODE_W + gap).
export const BAND_WIDTH = 380
const BAND_COUNT = 7

// Franjas horizontales por CATEGORÍA del inventario. Cantidad dinámica =
// cantidad de categorías únicas. Altura POR CATEGORÍA dinámica: se calcula
// del max de movs por celda (catIdx × layer) para que el auto-acomodar no
// genere overlap. Categorías con pocos movs usan MIN_BAND_HEIGHT_Y como floor.
// Resultado: matrix view 2D (X=fase, Y=área) sin overlap garantizado.
// 110 = floor que apenas acomoda 1 mov (76px) + padding (12px × 2) + breathing.
export const MIN_BAND_HEIGHT_Y = 110
// Gap vertical entre movs apilados dentro de la misma celda. 24px deja
// espacio para los badges (⚠️/🔥/✓) del nodo de abajo, que se posicionan a
// -top-2.5 (extienden ~10-12px arriba del borde superior del nodo). Con un
// gap menor, los badges se pegan al cuerpo del nodo de arriba.
const INTRA_GAP_Y = 24
// Gap horizontal entre movs apilados dentro de la misma celda (P-4 con
// nodosPorFila=2: dos movs lado-a-lado dentro de cada celda). 60px deja
// espacio para el label de la flecha entrante (BLANDA/DURA, ~35px wide
// con offset -28 desde el target) sin que pise el cuerpo del nodo previo.
export const INTRA_GAP_X = 60
// Padding interno top+bottom de cada banda Y (para que el primer/último mov
// no toque los bordes de la banda).
const PADDING_Y_BAND = 12
// Ancho del chip rotado de categoría (sticky a la izquierda del canvas).
// El texto va a -90° dentro, así que este es el ancho visible (el largo lo
// determina la altura de cada banda).
const LABEL_WIDTH_Y = 32

// Info por categoría: dónde arranca su banda Y y cuánto mide.
export interface BandInfo {
  categoria: string
  yStart: number   // top de la banda en canvas coords (cumulativo)
  height: number   // altura calculada para acomodar el max cell count
  // Espacio reservado al TOP de la banda para un header label horizontal.
  // 0 = sin header (default 3.A.6, labels rotados al margen izquierdo).
  // > 0 = header con texto horizontal (P-4 con nombres de dueños largos).
  topHeaderHeight: number
}

// Computa el orden de categorías únicas en el inventario, basado en orden de
// aparición. Igual a la lógica que usa InventarioCategoria para el preview.
// Filtra movs quitados — su categoría no participa.
export function computeCategoriasOrden(movsActivos: MovimientoPE[]): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const m of movsActivos) {
    if (m.estado_usuario === 'quitado') continue
    if (!seen.has(m.categoria)) {
      seen.add(m.categoria)
      ordered.push(m.categoria)
    }
  }
  return ordered
}

// Configuración opcional para bandas Y. Por default agrupamos por
// m.categoria (uso en 3.A.6). Otros usos (ej: P-4 con fases temporales) pueden
// pasar un bandKeyFn distinto + orden forzado + label customizado.
export interface BandConfig {
  bandKeyFn: (m: MovimientoPE) => string
  bandOrden?: string[]              // si se pasa, fuerza este orden; si no, orden de aparición
  bandLabel?: (key: string) => string   // mapeo key → label visible (default: key as-is)
  // Si > 0, cada banda Y reserva esos pixeles al TOP para un header horizontal
  // (label de la banda en texto recto, no rotado). Útil para nombres largos
  // (ej: dueños en P-4 con nombres de varias palabras). Si 0 o undefined, los
  // labels se renderean rotados al margen izquierdo (default 3.A.6).
  topHeaderHeight?: number
  // Filas EXTRA por banda más allá del cálculo nativo (ceil(count/nodosPorFila)).
  // Útil cuando hay movs que toman una fila completa propia (ej: spanning movs
  // en P-4 que cruzan múltiples fases). Cada banda incrementa su altura por
  // `extraFilas(key) * (NODE_H + INTRA_GAP_Y)`. Default 0 si no se pasa.
  extraFilas?: (key: string) => number
}

const DEFAULT_BAND_CONFIG: BandConfig = {
  bandKeyFn: (m) => m.categoria,
}

// Computa el layout completo de bandas Y con alturas dinámicas. Para cada
// banda, busca el MAX count de movs en cualquier celda (yBand × xBand). Esa
// cuenta determina la altura mínima necesaria para que el auto-acomodar no
// overlapee. Si la max es 1, la banda usa MIN_BAND_HEIGHT_Y como piso.
//
// Por default agrupa Y por categoría (m.categoria) y X por capa topológica.
// Pasando `config.bandKeyFn` se cambia la dimensión Y (ej: fase asignada por
// el user). Pasando `xKeyFn` se cambia la dimensión X (ej: en P-4 con eje X =
// fase, Y = categoría, las celdas se cuentan por (categoría, fase)).
export function computeBandLayout(
  movsActivos: MovimientoPE[],
  config: BandConfig = DEFAULT_BAND_CONFIG,
  xKeyFn?: (m: MovimientoPE) => string,
  nodosPorFila: number = 1,
): {
  bandas: BandInfo[]
  bandPorCat: Map<string, BandInfo>
  totalHeight: number
} {
  const filtered = movsActivos.filter(m => m.estado_usuario !== 'quitado')
  const layers = computeLayers(filtered)
  const effectiveXKey = xKeyFn ?? ((m: MovimientoPE) => String(layers.get(m.id) ?? 0))
  // Orden de bandas: explícito (config.bandOrden) o por orden de aparición.
  let bandKeys: string[]
  if (config.bandOrden && config.bandOrden.length > 0) {
    bandKeys = [...config.bandOrden]
    // Agregar bandas extra que aparecen en los movs pero no en bandOrden.
    const seen = new Set(bandKeys)
    for (const m of filtered) {
      const k = config.bandKeyFn(m)
      if (!seen.has(k)) { bandKeys.push(k); seen.add(k) }
    }
  } else {
    const seen = new Set<string>()
    bandKeys = []
    for (const m of filtered) {
      const k = config.bandKeyFn(m)
      if (!seen.has(k)) { bandKeys.push(k); seen.add(k) }
    }
  }
  // Count por celda (yBand, xBand).
  const cellCounts = new Map<string, number>()
  for (const m of filtered) {
    const yk = config.bandKeyFn(m)
    const xk = effectiveXKey(m)
    const key = `${yk}||${xk}`
    cellCounts.set(key, (cellCounts.get(key) ?? 0) + 1)
  }
  // Max count por banda (a lo largo de todas sus capas).
  const maxPerBand = new Map<string, number>()
  for (const [key, count] of cellCounts) {
    const bk = key.split('||')[0]
    if (count > (maxPerBand.get(bk) ?? 0)) maxPerBand.set(bk, count)
  }
  // Construir bandas con yStart cumulativo.
  const topHeaderHeight = config.topHeaderHeight ?? 0
  const extraFilasFn = config.extraFilas ?? (() => 0)
  const bandas: BandInfo[] = []
  const bandPorCat = new Map<string, BandInfo>()
  let yAcum = 0
  for (const bk of bandKeys) {
    const count = Math.max(1, maxPerBand.get(bk) ?? 1)
    // nodosPorFila: cuántos movs entran lado-a-lado en una sub-fila dentro
    // de la celda. Filas = ceil(count / nodosPorFila). Determina la altura
    // mínima requerida para que el stacking no genere overlap.
    // topHeaderHeight (si > 0) se suma al required: la banda reserva esos
    // pixeles al TOP para un header label horizontal.
    // extraFilas (si > 0) añade filas COMPLETAS por encima del cálculo
    // single-fase — útil para spanning movs que toman fila propia.
    const baseRows = Math.max(1, Math.ceil(count / Math.max(1, nodosPorFila)))
    const extraRows = Math.max(0, extraFilasFn(bk))
    const totalRows = baseRows + extraRows
    const required = topHeaderHeight + totalRows * NODE_H + (totalRows - 1) * INTRA_GAP_Y + 2 * PADDING_Y_BAND
    const height = Math.max(MIN_BAND_HEIGHT_Y, required)
    const info: BandInfo = { categoria: bk, yStart: yAcum, height, topHeaderHeight }
    bandas.push(info)
    bandPorCat.set(bk, info)
    yAcum += height
  }
  return { bandas, bandPorCat, totalHeight: yAcum }
}

// Calcula la "capa" topológica de cada mov: 0 si no tiene precondiciones,
// 1 + max(capa de precondiciones) en caso contrario. Es el longest-path
// layering — equivalente al rank que usa dagre. El resultado se usa para
// "auto-acomodar en franjas": cada mov X = capa * BAND_WIDTH (+ offset
// centrador del NODE_W). Guard de ciclos: si por algún motivo hay un ciclo
// (no debería, el frontend lo previene), un mov participante queda en capa 0.
export function computeLayers(movs: MovimientoPE[]): Map<string, number> {
  const layer = new Map<string, number>()
  const visiting = new Set<string>()
  // Solo considerar movs activos (no quitados) en la topología. Las precond
  // que referencian quitados se filtran porque no participan del DAG activo.
  const movsActivos = movs.filter(m => m.estado_usuario !== 'quitado')
  const validIds = new Set(movsActivos.map(m => m.id))
  const movById = new Map(movsActivos.map(m => [m.id, m]))
  function compute(id: string): number {
    if (layer.has(id)) return layer.get(id)!
    if (visiting.has(id)) return 0 // defensive: ciclo detectado, abortamos
    visiting.add(id)
    const m = movById.get(id)
    // Filtramos precondiciones huérfanas (apuntan a movs quitados o inexistentes).
    const precs = (m?.precondiciones ?? []).filter(p => validIds.has(p))
    let result = 0
    if (precs.length > 0) {
      const maxPrec = Math.max(...precs.map(pid => compute(pid)))
      result = maxPrec + 1
    }
    visiting.delete(id)
    layer.set(id, result)
    return result
  }
  for (const m of movsActivos) compute(m.id)
  return layer
}

type MovNodeData = {
  movimiento: MovimientoPE
  seleccionado: boolean   // este es EL nodo clickeado (foco principal)
  vecino: boolean         // conectado por al menos un edge al seleccionado
  atenuado: boolean       // hay foco activo pero este nodo no participa
  validado: boolean       // user marcó "deps_validadas" — borde verde persistente
  warning?: string        // mensaje del tooltip de warning (badge ⚠️ aparece si está set)
  tooltip?: string        // texto extra al hover (ej: razonamiento AI en P-4)
  onToggleValidado?: (validado: boolean) => void
  // Callback de edición del mov. Solo si está set se renderea el lápiz "✎" en
  // la esquina inferior-derecha del nodo (visible solo cuando el nodo está
  // seleccionado).
  onVerDetalle?: () => void
  // Ancho dinámico del nodo. Default NODE_W. Si > NODE_W, el nodo es spanning
  // (cruza múltiples fases). El contenido (id/name/badges) sigue en los
  // primeros NODE_W px; el tail tiene gradient fade.
  width?: number
  // Duración en meses (para tooltip de spanning). Solo si width > NODE_W.
  durMeses?: number
  // Si true, oculta el chip de categoría del header y libera espacio para que
  // el nombre del mov use hasta 3 líneas. Usado en la vista de prestigio del
  // plan (/vista) donde la categoría es información que el ejecutivo no
  // necesita ver en cada nodo.
  hideCategoria?: boolean
}

export function DAGSecuenciacion(props: Props) {
  return (
    <ReactFlowProvider>
      <DAGInner {...props} />
    </ReactFlowProvider>
  )
}

function DAGInner({
  movsACanvas,
  todosLosMovs,
  movSeleccionadoId,
  onSeleccionar,
  onAgregarMov,
  onMoverNodo,
  onCrearPrecondicion,
  onQuitarPrecondicion,
  onCambiarTipoEdge,
  onEditarRazonamientoEdge,
  onVerDetalle,
  onToggleValidado,
  razonamientosOverride,
  bandConfig,
  xBandConfig,
  xBandWidth,
  nodosPorFila,
  warningPorMov,
  tooltipPorMov,
  permitirCambioBanda,
  onCambioBanda,
  permitirCambioBandaX,
  onCambioBandaX,
  onArrancaOverrideDrag,
  bandHeaderExtra,
  posicionAlSeleccionar,
  readOnly,
  hideCategoria,
}: Props) {
  // Ancho efectivo de banda X (default = BAND_WIDTH = 380).
  const effectiveXBandWidth = xBandWidth ?? BAND_WIDTH
  const effectiveNodosPorFila = nodosPorFila ?? 1
  const reactFlow = useReactFlow()
  const wrapperRef = useRef<HTMLDivElement>(null)
  // Cuál edge tiene su menú abierto. null = ninguno.
  const [edgeMenuAbierto, setEdgeMenuAbierto] = useState<string | null>(null)
  // Cuál edge tiene hover activo (para tooltip + highlight transitorio).
  const [edgeHovered, setEdgeHovered] = useState<string | null>(null)
  // Cuál edge está "pinned" (highlight persistente — click en la línea para
  // pegarlo, click otra vez en la misma línea para soltarlo). Sobrevive a que
  // el mouse salga del edge, ideal para seguir trayectos largos visualmente.
  const [edgePinned, setEdgePinned] = useState<string | null>(null)
  // Tecla Espacio presionada — habilita pan temporal estilo Figma. Default
  // (sin espacio): click+drag dibuja marco de selección. Con espacio: panea.
  const [spaceHeld, setSpaceHeld] = useState(false)
  // Click fuera cierra el menú del edge.
  useEffect(() => {
    if (!edgeMenuAbierto) return
    function onDocClick() { setEdgeMenuAbierto(null) }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [edgeMenuAbierto])

  // Listeners globales de Espacio para alternar pan/selection. Guards:
  //   - No activar si el user está tipeando en input/textarea/contenteditable
  //     (sino al escribir un razonamiento con espacios se activaría el pan).
  //   - window.blur: si el user cambia de tab con Espacio apretado, el keyup
  //     no llega; reseteamos al perder foco para evitar estado pegajoso.
  useEffect(() => {
    if (readOnly) return
    function isTypingTarget(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false
      const tag = t.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== 'Space') return
      if (isTypingTarget(e.target)) return
      setSpaceHeld(prev => prev ? prev : true)
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code !== 'Space') return
      setSpaceHeld(false)
    }
    function onBlur() { setSpaceHeld(false) }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [readOnly])

  // Posicionar el viewport cuando cambia movSeleccionadoId (típicamente
  // desde un chip externo o click en nodo). Modo por defecto centra; modo
  // 'top-left' anchorea el nodo arriba-izquierda para seguir flechas que
  // van derecha/abajo (útil para Option C de P-4 con eje X = fase).
  useEffect(() => {
    if (!movSeleccionadoId) return
    const cm = movsACanvas.find(c => c.mov_id === movSeleccionadoId)
    if (!cm) return
    const z = 1
    if (posicionAlSeleccionar === 'top-left') {
      // setViewport para que (cm.x, cm.y) caiga a (PADDING, PADDING) en
      // screen space — el nodo aparece arriba-izquierda del viewport.
      const PADDING_TOP = 80   // deja espacio para los labels X (Q2/Q3/Q4)
      const PADDING_LEFT = 60  // deja espacio para los labels Y (categorías)
      reactFlow.setViewport(
        { x: PADDING_LEFT - cm.x * z, y: PADDING_TOP - cm.y * z, zoom: z },
        { duration: 400 },
      )
    } else {
      reactFlow.setCenter(cm.x + NODE_W / 2, cm.y + NODE_H / 2, { zoom: z, duration: 400 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movSeleccionadoId])

  // Orden de categorías para las franjas Y (matrix view). Cantidad de
  // franjas = cantidad de categorías únicas en el inventario activo.
  const categoriasOrden = useMemo(() => computeCategoriasOrden(todosLosMovs), [todosLosMovs])
  // Layout dinámico de las bandas Y: cada categoría tiene yStart cumulativo y
  // altura adaptada al max cell count. Memo dependiente de todosLosMovs.
  const bandLayout = useMemo(
    () => computeBandLayout(todosLosMovs, bandConfig, xBandConfig?.bandKeyFn, effectiveNodosPorFila),
    [todosLosMovs, bandConfig, xBandConfig, effectiveNodosPorFila],
  )
  // Orden explícito de bandas X cuando se pasa xBandConfig. Si NO se pasa, el
  // render de X cae al default de BAND_COUNT stripes topológicas.
  const xBandKeys = useMemo<string[]>(() => {
    if (!xBandConfig) return []
    const filtered = todosLosMovs.filter(m => m.estado_usuario !== 'quitado')
    if (xBandConfig.bandOrden && xBandConfig.bandOrden.length > 0) {
      const keys = [...xBandConfig.bandOrden]
      const seen = new Set(keys)
      for (const m of filtered) {
        const k = xBandConfig.bandKeyFn(m)
        if (!seen.has(k)) { keys.push(k); seen.add(k) }
      }
      return keys
    }
    const seen = new Set<string>()
    const keys: string[] = []
    for (const m of filtered) {
      const k = xBandConfig.bandKeyFn(m)
      if (!seen.has(k)) { keys.push(k); seen.add(k) }
    }
    return keys
  }, [xBandConfig, todosLosMovs])

  // ─── Build nodes desde movsACanvas + lookup ──────────────────────────────
  const nodes: Node<MovNodeData>[] = useMemo(() => {
    const movsMap = new Map(todosLosMovs.map(m => [m.id, m]))
    // Cuando hay un mov seleccionado, calculamos sus vecinos (movs conectados
    // por una arista entrante o saliente). El nodo seleccionado se ilumina
    // con borde amarillo intenso; los vecinos con borde amarillo sutil; los
    // demás (no conectados) quedan atenuados (opacity baja).
    const selMov = movSeleccionadoId ? movsMap.get(movSeleccionadoId) ?? null : null
    const vecinos = new Set<string>()
    if (selMov) {
      for (const p of selMov.precondiciones ?? []) vecinos.add(p)
      for (const d of selMov.desbloquea ?? []) vecinos.add(d)
    }
    const hayFoco = movSeleccionadoId !== null
    return movsACanvas
      .map(cm => {
        const mov = movsMap.get(cm.mov_id)
        if (!mov) return null
        // Filtramos quitados: no se renderean en el canvas. Su entry en
        // dag.movs queda persistida (para preservar posición si el user
        // re-acepta el mov), pero visualmente desaparece.
        if (mov.estado_usuario === 'quitado') return null
        const esSel = cm.mov_id === movSeleccionadoId
        const esVecino = vecinos.has(cm.mov_id)
        const esValidado = mov.deps_validadas === true
        return {
          id: cm.mov_id,
          type: 'movCard',
          position: { x: cm.x, y: cm.y },
          data: {
            movimiento: mov,
            seleccionado: esSel,
            vecino: esVecino,
            atenuado: hayFoco && !esSel && !esVecino,
            validado: esValidado,
            warning: warningPorMov?.get(cm.mov_id),
            tooltip: tooltipPorMov?.get(cm.mov_id),
            onToggleValidado: onToggleValidado
              ? (nuevo: boolean) => onToggleValidado(cm.mov_id, nuevo)
              : undefined,
            onVerDetalle: onVerDetalle
              ? () => onVerDetalle(cm.mov_id)
              : undefined,
            width: cm.width,
            durMeses: cm.spanInfo?.durMeses,
            hideCategoria,
          },
        } as Node<MovNodeData>
      })
      .filter((n): n is Node<MovNodeData> => n !== null)
  }, [movsACanvas, todosLosMovs, movSeleccionadoId, onToggleValidado, warningPorMov, tooltipPorMov, onVerDetalle, hideCategoria])

  // ─── Build edges desde mov.precondiciones (solo si AMBOS movs en canvas) ─
  const edges: Edge[] = useMemo(() => {
    const idsEnCanvas = new Set(movsACanvas.map(m => m.mov_id))
    const result: Edge[] = []
    // Spotlight: si hay foco activo (edge hovered, edge pinned, o un nodo
    // seleccionado), los edges no involucrados se atenúan para que el recorrido
    // activo destaque sobre el resto del DAG. Para un nodo seleccionado, todos
    // sus edges entrantes (precondiciones) y salientes (desbloquea) se iluminan.
    const anyEdgeFocused = edgeHovered !== null || edgePinned !== null || movSeleccionadoId !== null
    for (const movId of idsEnCanvas) {
      const mov = todosLosMovs.find(m => m.id === movId)
      if (!mov) continue
      // Skip edges donde el target está quitado — el nodo no se renderea, las
      // flechas tampoco deberían aparecer.
      if (mov.estado_usuario === 'quitado') continue
      for (const preId of mov.precondiciones ?? []) {
        if (!idsEnCanvas.has(preId)) continue
        // Skip si el source está quitado (defensive).
        const preMov = todosLosMovs.find(m => m.id === preId)
        if (preMov?.estado_usuario === 'quitado') continue
        const edgeId = `${preId}->${movId}`
        const tipo = getTipoEdge(mov, preId)
        const lagMeses = getLagEdge(mov, preId)
        const razonamiento = getRazonamientoEdge(mov, preId, razonamientosOverride)
        const isHovered = edgeHovered === edgeId
        const isPinned = edgePinned === edgeId
        const isNodeConnected = movSeleccionadoId !== null && (preId === movSeleccionadoId || movId === movSeleccionadoId)
        const isHighlighted = isHovered || isPinned || isNodeConnected
        const dimmed = anyEdgeFocused && !isHighlighted
        // Opacidad del edge:
        //  - 1.0: highlighted (vecino del seleccionado, hovered, o pinned).
        //  - 0.15: dimmed (hay foco activo en otro edge/nodo).
        //  - 0.22: default (sin foco) — edges muy sutiles para que las fichas
        //    sean el visual principal cuando el user está asignando fases.
        const edgeOpacity = isHighlighted ? 1 : (anyEdgeFocused ? 0.15 : 0.22)
        // Marker end (flecha): color matching el tipo del edge.
        //   sugerida: tenue (lila claro)
        //   ff:       medio (lila medio)
        //   fs:       saturado (lila intenso), flecha más grande
        //   continuo: violáceo intermedio, distinto a FF/FS.
        const arrowColor = tipo === 'fs'
          ? 'oklch(0.78 0.22 280)'
          : tipo === 'ff' ? 'oklch(0.72 0.20 280)'
          : tipo === 'continuo' ? 'oklch(0.70 0.16 295)'
          : 'oklch(0.65 0.12 280)'
        const arrowSize = tipo === 'fs' ? 22 : 18
        result.push({
          id: edgeId,
          source: preId,
          target: movId,
          type: 'tipada',
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: arrowColor,
            width: arrowSize,
            height: arrowSize,
          },
          data: {
            tipo,
            lagMeses,
            razonamiento,
            desdeId: preId,
            desdeNombre: preMov?.nombre ?? '(?)',
            hastaId: movId,
            hastaNombre: mov.nombre,
            menuAbierto: !readOnly && edgeMenuAbierto === edgeId,
            isHovered,
            isPinned,
            isHighlighted,
            dimmed,
            edgeOpacity,
            onHoverEnter: () => setEdgeHovered(edgeId),
            onHoverLeave: () => setEdgeHovered(prev => prev === edgeId ? null : prev),
            onTogglePin: () => setEdgePinned(prev => prev === edgeId ? null : edgeId),
            // Si readOnly, los toggles + edit son no-op.
            onToggleMenu: readOnly ? () => {} : () => setEdgeMenuAbierto(prev => prev === edgeId ? null : edgeId),
            onDelete: readOnly ? () => {} : () => { setEdgeMenuAbierto(null); onQuitarPrecondicion(preId, movId) },
            onCambiarTipo: readOnly
              ? () => {}
              : (t: 'sugerida' | 'ff' | 'fs' | 'continuo', lag: number) => {
                  setEdgeMenuAbierto(null)
                  onCambiarTipoEdge(preId, movId, t, lag)
                },
            onEditarRazonamiento: readOnly || !onEditarRazonamientoEdge
              ? undefined
              : (nuevo: string) => { setEdgeMenuAbierto(null); onEditarRazonamientoEdge(preId, movId, nuevo) },
            readOnly: !!readOnly,
          },
        })
      }
    }
    return result
  }, [movsACanvas, todosLosMovs, onQuitarPrecondicion, onCambiarTipoEdge, onEditarRazonamientoEdge, edgeMenuAbierto, edgeHovered, edgePinned, movSeleccionadoId, readOnly, razonamientosOverride])

  // ─── Handlers de xyflow (todos gateados por readOnly) ────────────────────
  const onConnect = useCallback((conn: Connection) => {
    if (readOnly) return
    if (!conn.source || !conn.target || conn.source === conn.target) return
    onCrearPrecondicion(conn.source, conn.target)
  }, [onCrearPrecondicion, readOnly])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    if (readOnly) return
    for (const change of changes) {
      if (change.type === 'remove') {
        const [desde, hacia] = change.id.split('->')
        if (desde && hacia) onQuitarPrecondicion(desde, hacia)
      }
    }
  }, [onQuitarPrecondicion, readOnly])

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    if (readOnly) return
    for (const change of changes) {
      if (change.type === 'position' && change.position && change.dragging === false) {
        const cmDragueado = movsACanvas.find(c => c.mov_id === change.id)
        // P-4 override mode: si el parent pasó onArrancaOverrideDrag, el drag
        // horizontal se interpreta como override de fecha. Bypasseamos el
        // snap a banda X y el spanning-skip — el parent computa la fecha vía
        // xToDate desde la posición absoluta y aplica/valida el override.
        if (onArrancaOverrideDrag) {
          // La position en xyflow es la esquina superior-izquierda del nodo.
          // Pasamos esa X cruda — el parent decide qué hacer (snap-a-mes vía
          // xToDate, validar contra piso CPM, popover de razonamiento).
          onArrancaOverrideDrag(change.id, change.position.x)
          continue
        }
        // Skip si el mov es SPANNING (width > NODE_W). Arrastrar una barra
        // de 1500px no es intuitivo — el user edita la ventana via ✎ form.
        if (cmDragueado?.width && cmDragueado.width > NODE_W) continue
        // ─── Snap X ────────────────────────────────────────────────────────
        // Si xBandConfig: snap a una de las bandas X explícitas (con
        // sub-columnas si nodosPorFila > 1), clamped al rango de keys.
        // Si NO: snap a la grilla topológica BAND_WIDTH (sin clamp por la
        // derecha — 3.A.6 default).
        const nodeCenterX = change.position.x + NODE_W / 2
        let snappedX: number
        let xDestinoKey: string | null = null
        if (xBandConfig && xBandKeys.length > 0) {
          const rawIdx = Math.floor(nodeCenterX / effectiveXBandWidth)
          const bandIdx = Math.max(0, Math.min(xBandKeys.length - 1, rawIdx))
          xDestinoKey = xBandKeys[bandIdx]
          // Sub-columna: dividimos el ancho de la banda en N sub-zonas iguales
          // según nodosPorFila. La sub-zona donde cae el centro determina el
          // subIdx final. El slot real del mov en esa sub-columna se calcula
          // del padding lateral derivado del ancho efectivo.
          const centerOffsetInBand = nodeCenterX - bandIdx * effectiveXBandWidth
          const N = effectiveNodosPorFila
          const subIdx = Math.max(0, Math.min(
            N - 1,
            Math.floor((centerOffsetInBand * N) / effectiveXBandWidth),
          ))
          const padding = (effectiveXBandWidth - N * NODE_W - (N - 1) * INTRA_GAP_X) / 2
          snappedX = bandIdx * effectiveXBandWidth + padding + subIdx * (NODE_W + INTRA_GAP_X)
        } else {
          const bandIdx = Math.max(0, Math.round((nodeCenterX - effectiveXBandWidth / 2) / effectiveXBandWidth))
          const snappedCenter = bandIdx * effectiveXBandWidth + effectiveXBandWidth / 2
          snappedX = snappedCenter - NODE_W / 2
        }
        // ─── Cambio de banda X (si aplica) + clamp Y ───────────────────────
        let clampedY = change.position.y
        const mov = todosLosMovs.find(m => m.id === change.id)
        if (mov) {
          // X-axis change-band: si xBandConfig + permitirCambioBandaX, comparamos
          // la banda destino contra la actual del mov. Si difiere, fire callback.
          if (xBandConfig && permitirCambioBandaX && xDestinoKey !== null && onCambioBandaX) {
            const xActual = xBandConfig.bandKeyFn(mov)
            if (xDestinoKey !== xActual) onCambioBandaX(change.id, xDestinoKey)
          }
          // Y-axis: idéntica lógica que antes — permitirCambioBanda (Y), o
          // clamp duro a la banda Y actual del mov.
          const keyFn = bandConfig?.bandKeyFn ?? ((m: MovimientoPE) => m.categoria)
          const bandaActualKey = keyFn(mov)
          if (permitirCambioBanda) {
            const yCenter = change.position.y + NODE_H / 2
            const bandaDestino = bandLayout.bandas.find(b =>
              yCenter >= b.yStart && yCenter < b.yStart + b.height,
            )
            if (bandaDestino) {
              if (bandaDestino.categoria !== bandaActualKey && onCambioBanda) {
                onCambioBanda(change.id, bandaDestino.categoria)
              }
              const minY = bandaDestino.yStart
              const maxY = bandaDestino.yStart + bandaDestino.height - NODE_H
              clampedY = Math.max(minY, Math.min(maxY, change.position.y))
            }
          } else {
            const band = bandLayout.bandPorCat.get(bandaActualKey)
            if (band) {
              const minY = band.yStart
              const maxY = band.yStart + band.height - NODE_H
              clampedY = Math.max(minY, Math.min(maxY, change.position.y))
            }
          }
        }
        onMoverNodo(change.id, snappedX, clampedY)
      }
    }
  }, [onMoverNodo, readOnly, todosLosMovs, movsACanvas, bandLayout, bandConfig, xBandConfig, xBandKeys, effectiveXBandWidth, effectiveNodosPorFila, permitirCambioBanda, onCambioBanda, permitirCambioBandaX, onCambioBandaX, onArrancaOverrideDrag])

  const onNodeClick: NodeMouseHandler = useCallback((_e, node) => {
    // Selección NO es mutación — habilitada también en readOnly (preview de
    // Opus). Toggle: click en el nodo ya seleccionado → deselecciona (apaga el
    // highlight de sus edges). Click en otro nodo → cambia la selección.
    onSeleccionar(node.id === movSeleccionadoId ? null : node.id)
  }, [onSeleccionar, movSeleccionadoId])

  const onPaneClick = useCallback(() => {
    // Click en el fondo vacío del canvas deselecciona el nodo activo.
    if (movSeleccionadoId) onSeleccionar(null)
  }, [onSeleccionar, movSeleccionadoId])

  // ─── Drop-from-outside (stock panel → canvas) ────────────────────────────
  const onDragOver = useCallback((e: React.DragEvent) => {
    if (readOnly) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [readOnly])

  const onDrop = useCallback((e: React.DragEvent) => {
    if (readOnly) return
    e.preventDefault()
    const movId = e.dataTransfer.getData('application/x-mov-id') || e.dataTransfer.getData('text/plain')
    if (!movId) return
    const pos = reactFlow.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    onAgregarMov(movId, pos.x - NODE_W / 2, pos.y - NODE_H / 2)
  }, [reactFlow, onAgregarMov, readOnly])

  return (
    <div
      ref={wrapperRef}
      className={`w-full h-full ${spaceHeld ? 'cursor-grab active:cursor-grabbing' : ''}`}
      style={{ minHeight: 400 }}
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onConnect={onConnect}
        onEdgesChange={onEdgesChange}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable={!readOnly}
        panOnDrag={!!readOnly}
        selectionOnDrag={!readOnly}
        panActivationKeyCode="Space"
        selectionMode={'partial' as any}
        fitView={nodes.length > 0}
        fitViewOptions={{ padding: 0.15 }}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: false,
          style: { stroke: 'oklch(0.7 0.15 280)', strokeWidth: 2 },
        }}
        minZoom={0.2}
        maxZoom={1.5}
        connectionLineStyle={{ stroke: 'oklch(0.75 0.18 280)', strokeWidth: 2, strokeDasharray: '5 5' }}
      >
        <Background gap={20} size={1} color="oklch(0.4 0.005 280)" />
        {!readOnly && (
          <ViewportPortal>
            {/* Franjas X (verticales) — shading alternado + borde derecho dashed.
                Si xBandConfig: render solo xBandKeys.length bandas (labeled).
                Si NO: render BAND_COUNT default (3.A.6 topología). */}
            {xBandConfig && xBandKeys.length > 0
              ? xBandKeys.map((k, i) => (
                  <div
                    key={`x-${k}`}
                    style={{
                      position: 'absolute',
                      left: i * effectiveXBandWidth,
                      top: -5000,
                      width: effectiveXBandWidth,
                      height: 10000,
                      backgroundColor: i % 2 === 0 ? 'oklch(0.22 0.005 280 / 0.35)' : 'transparent',
                      borderRight: '1px dashed oklch(0.4 0.005 280 / 0.35)',
                      pointerEvents: 'none',
                      zIndex: 0,
                    }}
                  />
                ))
              : Array.from({ length: BAND_COUNT }, (_, i) => (
                  <div
                    key={`x-${i}`}
                    style={{
                      position: 'absolute',
                      left: i * BAND_WIDTH,
                      top: -5000,
                      width: BAND_WIDTH,
                      height: 10000,
                      backgroundColor: i % 2 === 0 ? 'oklch(0.22 0.005 280 / 0.35)' : 'transparent',
                      borderRight: '1px dashed oklch(0.4 0.005 280 / 0.35)',
                      pointerEvents: 'none',
                      zIndex: 0,
                    }}
                  />
                ))}
            {/* Franjas Y (horizontales) por categoría — altura dinámica según
                max cell count. Solo bordes inferiores dashed para evitar
                checkerboard mess con el shading de X. */}
            {bandLayout.bandas.map(band => (
              <div
                key={`y-${band.categoria}`}
                style={{
                  position: 'absolute',
                  left: -10000,
                  top: band.yStart,
                  width: 20000,
                  height: band.height,
                  borderBottom: '1px dashed oklch(0.45 0.005 280 / 0.4)',
                  pointerEvents: 'none',
                  zIndex: 0,
                }}
              />
            ))}
          </ViewportPortal>
        )}
        {/* Labels sticky de categorías en el corner izquierdo del canvas. Tracking
            del viewport vía useViewport para alinear con cada banda Y. */}
        {!readOnly && bandLayout.bandas.length > 0 && (
          <CategoriaLabelsOverlay bandas={bandLayout.bandas} bandHeaderExtra={bandHeaderExtra} />
        )}
        {/* Labels sticky de bandas X arriba del canvas (Q2/Q3/Q4 en P-4).
            Sin gate de readOnly: si el caller pasó xBandConfig, los headers
            de cuatrimestres son parte esencial del gráfico tanto en modo
            interactivo como read-only (ej: Gantt en /vista). */}
        {xBandConfig && xBandKeys.length > 0 && (
          <XBandLabelsOverlay
            keys={xBandKeys}
            label={xBandConfig.bandLabel}
            xBandWidth={effectiveXBandWidth}
          />
        )}
        {/* Edit button (✎) ahora vive INLINE en cada nodo seleccionado
            (esquina inferior-derecha del nodo). Ver MovCardNode. */}
        <Panel position="top-right">
          <AyudaCartel readOnly={!!readOnly} />
        </Panel>
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-muted-foreground">
              <p className="text-[18px] font-semibold text-foreground/80">Canvas vacío</p>
              <p className="text-[13px] mt-1">Arrastrá movimientos desde el panel izquierdo</p>
            </div>
          </div>
        )}
      </ReactFlow>
    </div>
  )
}

// ─── Custom edge tipada: muestra "dura"/"blanda" + menú al clickear ──────────

const edgeTypes = { tipada: TipadaEdge }

type TipadaEdgeData = {
  tipo: 'sugerida' | 'ff' | 'fs' | 'continuo'
  // Lag en meses por edge. Aplica a FS/FF/continuo; ignorado para sugerida.
  // Default 0 = comportamiento clásico sin offset.
  lagMeses: number
  razonamiento: string
  // IDs y nombres de los extremos del edge — se muestran en el header del
  // tooltip de hover y del menú de edición, para que el user sepa qué movs
  // conecta esta flecha sin tener que rastrearla visualmente.
  desdeId: string
  desdeNombre: string
  hastaId: string
  hastaNombre: string
  menuAbierto: boolean
  isHovered: boolean
  isPinned: boolean
  isHighlighted: boolean
  dimmed: boolean
  // Opacidad efectiva del edge (línea + chip): full (1) si highlighted,
  // 0.15 si hay foco en otro edge, 0.22 si no hay foco activo.
  edgeOpacity: number
  onHoverEnter: () => void
  onHoverLeave: () => void
  onTogglePin: () => void
  onToggleMenu: () => void
  onDelete: () => void
  onCambiarTipo: (t: 'sugerida' | 'ff' | 'fs' | 'continuo', lagMeses: number) => void
  onEditarRazonamiento?: (nuevo: string) => void
  readOnly?: boolean
}

function TipadaEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data }: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  })
  // Posicionamos el label DURA/BLANDA cerca de la punta de la flecha (target),
  // un poco arriba de la línea de entrada. Razón: el midpoint del path cae
  // frecuentemente dentro de un nodo intermedio o cerca de otros nodos,
  // generando overlap visual y ambigüedad sobre a qué flecha pertenece el
  // tipo. Pegado al target, queda inequívocamente asociado a la flecha que
  // entra al nodo destino.
  const labelX = targetX - 26
  const labelY = targetY - 28
  const d = (data as unknown as TipadaEdgeData)
  // Estilo del path según tipo + highlight:
  //   - sugerida: dashed delgado (2px), color tenue (lila claro).
  //   - ff:       solid mediano (3px), color medio (lila medio).
  //   - fs:       solid grueso (4px), color saturado (lila intenso).
  //   - continuo: semi-dashed mediano (3px), color violáceo distinto al FF.
  //   - highlighted: stroke + brillante en cualquier tipo.
  const esFS = d.tipo === 'fs'
  const esFF = d.tipo === 'ff'
  const esContinuo = d.tipo === 'continuo'
  const baseStroke = esFS ? 'oklch(0.78 0.22 280)'
    : esFF ? 'oklch(0.72 0.20 280)'
    : esContinuo ? 'oklch(0.70 0.16 295)'
    : 'oklch(0.65 0.12 280)'
  const stroke = d.isHighlighted ? 'oklch(0.88 0.24 280)' : baseStroke
  const baseWidth = esFS ? 4 : (esFF || esContinuo) ? 3 : 2
  const strokeWidth = baseWidth + (d.isHighlighted ? 1 : 0)
  // sugerida: 6-4 dash (más espaciado).
  // continuo: 4-2 dash (más denso, lectura de "continuo").
  // ff/fs: solid.
  const strokeDasharray = esFS || esFF
    ? undefined
    : esContinuo ? '4 2' : '6 4'

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={{ stroke, strokeWidth, strokeDasharray, opacity: d.edgeOpacity, transition: 'stroke 120ms ease, stroke-width 120ms ease, opacity 150ms ease' }} />
      {/* Path invisible más grueso: detecta hover y click-to-pin. */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
        onMouseEnter={d.onHoverEnter}
        onMouseLeave={d.onHoverLeave}
        onClick={(e) => { e.stopPropagation(); d.onTogglePin() }}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-auto"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            zIndex: d.menuAbierto || d.isHighlighted ? 20 : 10,
            opacity: d.edgeOpacity,
            transition: 'opacity 150ms ease',
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseEnter={d.onHoverEnter}
          onMouseLeave={d.onHoverLeave}
        >
          {!d.menuAbierto && (
            // Pill con el tipo. Estilo por tipo: sugerida (gris tenue), ff
            // (purple mediano), fs (purple intenso), continuo (violáceo).
            // Lag > 0 se muestra como sufijo "+N" (ej "FF+1", "Cont+2").
            (() => {
              const styleByTipo: Record<string, string> = {
                sugerida: 'bg-sidebar text-purple-200/80 border border-purple-500/40',
                ff: 'bg-purple-800 text-purple-100 border border-purple-400/50',
                fs: 'bg-purple-600 text-white border border-purple-300/60',
                continuo: 'bg-violet-700 text-violet-50 border border-violet-300/60',
              }
              const labelByTipo: Record<string, string> = {
                sugerida: 'Sug',
                ff: 'FF',
                fs: 'FS',
                continuo: 'Cont',
              }
              const cls = styleByTipo[d.tipo] ?? styleByTipo.sugerida
              const baseLbl = labelByTipo[d.tipo] ?? d.tipo
              const lagSuffix = d.tipo !== 'sugerida' && d.lagMeses > 0 ? `+${d.lagMeses}` : ''
              const lbl = `${baseLbl}${lagSuffix}`
              return d.readOnly ? (
                <span className={`rounded-full px-1.5 py-0 text-[9px] font-bold uppercase shadow-md ${cls}`}>
                  {lbl}
                </span>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); d.onToggleMenu() }}
                  className={`rounded-full px-1.5 py-0 text-[9px] font-bold uppercase shadow-md transition-colors ${cls} hover:brightness-110`}
                >
                  {lbl}
                </button>
              )
            })()
          )}
          {/* Tooltip custom: aparece al hover (solo si hay razonamiento). */}
          {d.isHovered && !d.menuAbierto && d.razonamiento && (
            <RazonamientoTooltip
              texto={d.razonamiento}
              desdeId={d.desdeId}
              desdeNombre={d.desdeNombre}
              hastaId={d.hastaId}
              hastaNombre={d.hastaNombre}
            />
          )}
          {/* Menú edit: cambiar tipo + editar razonamiento + borrar. */}
          {d.menuAbierto && (
            <EdgeMenuEdit data={d} />
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

// ─── Tooltip custom (hover sobre el label) ──────────────────────────────────

function RazonamientoTooltip({ texto, desdeId, desdeNombre, hastaId, hastaNombre }: {
  texto: string
  desdeId: string
  desdeNombre: string
  hastaId: string
  hastaNombre: string
}) {
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full mb-1 pointer-events-none"
      style={{ width: 'max-content', maxWidth: 320 }}
    >
      <div className="rounded-md border border-sidebar-border bg-background shadow-2xl">
        <div className="border-b border-sidebar-border/60 px-2.5 py-1 text-[12px] text-muted-foreground/90 flex items-center gap-1.5">
          <span className="font-mono text-muted-foreground/70 flex-shrink-0">{desdeId}</span>
          <span className="truncate">{desdeNombre}</span>
          <span className="text-muted-foreground/60 flex-shrink-0">→</span>
          <span className="font-mono text-muted-foreground/70 flex-shrink-0">{hastaId}</span>
          <span className="truncate">{hastaNombre}</span>
        </div>
        <div className="px-2.5 py-1.5 text-[12px] text-foreground/95 leading-snug">
          {texto}
        </div>
      </div>
      {/* Flechita apuntando al label */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-0 translate-y-full w-0 h-0"
        style={{ borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid oklch(0.18 0.005 280)' }}
      />
    </div>
  )
}

// ─── Menú edit (click en label de edge) — popover con tipo + razonamiento + borrar ─

function EdgeMenuEdit({ data }: { data: TipadaEdgeData }) {
  // Estado local del textarea (no commit hasta que el user clickee "Guardar razonamiento").
  const [razonamientoDraft, setRazonamientoDraft] = useState(data.razonamiento)
  // Lag draft: el user lo modifica antes de commit. Inicial desde data.lagMeses.
  const [lagDraft, setLagDraft] = useState<number>(data.lagMeses ?? 0)
  // Sync si el data.razonamiento o lag cambia externamente.
  useEffect(() => { setRazonamientoDraft(data.razonamiento) }, [data.razonamiento])
  useEffect(() => { setLagDraft(data.lagMeses ?? 0) }, [data.lagMeses])
  const razonamientoSinCambios = razonamientoDraft.trim() === (data.razonamiento ?? '').trim()

  // Cambio de tipo: commit inmediato con el lag actual (draft).
  function cambiarTipo(t: 'sugerida' | 'ff' | 'fs' | 'continuo') {
    // 'sugerida' no usa lag — forzamos 0 al backend.
    const lagAEmitir = t === 'sugerida' ? 0 : Math.max(0, Math.floor(lagDraft))
    data.onCambiarTipo(t, lagAEmitir)
  }
  function aplicarLag() {
    const lag = Math.max(0, Math.floor(lagDraft))
    setLagDraft(lag)
    if (data.tipo !== 'sugerida') data.onCambiarTipo(data.tipo, lag)
  }
  const lagSinCambios = (Math.max(0, Math.floor(lagDraft)) === (data.lagMeses ?? 0))

  return (
    <div className="rounded-lg border border-sidebar-border bg-background shadow-2xl p-2 min-w-[260px] max-w-[320px] space-y-2">
      {/* Header con los movs que conecta este edge — el user sabe siempre qué
          dependencia está editando sin tener que mirar el canvas. */}
      <div className="pb-1.5 border-b border-sidebar-border/60 text-[12px] text-muted-foreground/90 flex items-center gap-1.5">
        <span className="font-mono text-muted-foreground/70 flex-shrink-0">{data.desdeId}</span>
        <span className="truncate" title={data.desdeNombre}>{data.desdeNombre}</span>
        <span className="text-muted-foreground/60 flex-shrink-0">→</span>
        <span className="font-mono text-muted-foreground/70 flex-shrink-0">{data.hastaId}</span>
        <span className="truncate" title={data.hastaNombre}>{data.hastaNombre}</span>
      </div>
      <div>
        <p className="text-[12px] uppercase tracking-wider text-muted-foreground/80 mb-1">Tipo de dependencia</p>
        <div className="flex flex-col gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); cambiarTipo('sugerida') }}
            className={`rounded px-2 py-1 text-[11px] font-semibold border text-left transition-colors ${
              data.tipo === 'sugerida'
                ? 'bg-purple-900/40 border-purple-500/60 text-purple-100'
                : 'border-sidebar-border text-muted-foreground hover:bg-accent/40'
            }`}
            title="Sugerida: solo orden ideal, sin constraint de scheduling. B puede arrancar y cerrar libremente."
          >
            <span className="font-bold">Sugerida</span>
            <span className="block text-[10px] opacity-80">orden ideal, sin constraint</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); cambiarTipo('ff') }}
            className={`rounded px-2 py-1 text-[11px] font-semibold border text-left transition-colors ${
              data.tipo === 'ff'
                ? 'bg-purple-800 border-purple-400 text-purple-100'
                : 'border-sidebar-border text-muted-foreground hover:bg-accent/40'
            }`}
            title="FF (Finish-to-Finish): A debe terminar para que B pueda cerrar. B puede arrancar en paralelo."
          >
            <span className="font-bold">FF — Finish to Finish</span>
            <span className="block text-[10px] opacity-80">B no cierra sin A · puede arrancar en paralelo</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); cambiarTipo('fs') }}
            className={`rounded px-2 py-1 text-[11px] font-semibold border text-left transition-colors ${
              data.tipo === 'fs'
                ? 'bg-purple-600 border-purple-300 text-white'
                : 'border-sidebar-border text-muted-foreground hover:bg-accent/40'
            }`}
            title="FS (Finish-to-Start): A debe terminar para que B pueda arrancar. Estricto."
          >
            <span className="font-bold">FS — Finish to Start</span>
            <span className="block text-[10px] opacity-80">B no arranca sin A · secuencial estricto</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); cambiarTipo('continuo') }}
            className={`rounded px-2 py-1 text-[11px] font-semibold border text-left transition-colors ${
              data.tipo === 'continuo'
                ? 'bg-violet-700 border-violet-300 text-violet-50'
                : 'border-sidebar-border text-muted-foreground hover:bg-accent/40'
            }`}
            title="Continuo (trailing): B arranca y cierra N meses después que A. Útil para flujos paralelos desfasados (mientras A genera, B implementa)."
          >
            <span className="font-bold">Continuo — Paralelo desfasado</span>
            <span className="block text-[10px] opacity-80">B trails A · arranque y cierre con lag</span>
          </button>
        </div>
      </div>
      {data.tipo !== 'sugerida' && (
        <div className="border-t border-sidebar-border/60 pt-2">
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground/80 mb-1">
            Lag (meses)
            <span
              className="ml-1 text-muted-foreground/60 cursor-help"
              title={
                data.tipo === 'fs' ? 'FS+lag: B arranca lag meses después que A termine.'
                : data.tipo === 'ff' ? 'FF+lag: B cierra lag meses después que A cierre.'
                : 'Continuo+lag: B arranca y cierra lag meses después que A.'
              }
            >ⓘ</span>
          </label>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={0}
              step={1}
              value={lagDraft}
              onChange={(e) => setLagDraft(Number(e.target.value) || 0)}
              onClick={(e) => e.stopPropagation()}
              className="w-16 rounded border border-sidebar-border bg-background px-2 py-1 text-[12px] text-foreground focus:border-primary focus:outline-none"
            />
            <span className="text-[11px] text-muted-foreground">{lagDraft === 1 ? 'mes' : 'meses'}</span>
            <button
              onClick={(e) => { e.stopPropagation(); aplicarLag() }}
              disabled={lagSinCambios}
              className="ml-auto rounded px-2 py-1 text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
      {data.onEditarRazonamiento && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/80 mb-1">Razonamiento</p>
          <textarea
            value={razonamientoDraft}
            onChange={(e) => setRazonamientoDraft(e.target.value)}
            placeholder="Por qué desde precondicíona hacia…"
            rows={3}
            className="w-full rounded border border-sidebar-border bg-background px-2 py-1 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none resize-y"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={(e) => { e.stopPropagation(); data.onEditarRazonamiento!(razonamientoDraft.trim()) }}
            disabled={razonamientoSinCambios}
            className="mt-1 w-full rounded px-2 py-1 text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Guardar razonamiento
          </button>
        </div>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); data.onDelete() }}
        className="w-full rounded px-2 py-1 text-[11px] font-medium border border-red-800/60 bg-red-950/30 text-red-300 hover:bg-red-900/40 transition-colors"
      >
        🗑 Borrar dependencia
      </button>
    </div>
  )
}

// ─── Custom node ─────────────────────────────────────────────────────────────

const nodeTypes = { movCard: MovCardNode }

function MovCardNode({ data }: NodeProps) {
  const d = data as unknown as MovNodeData
  const m = d.movimiento
  const seleccionado = d.seleccionado
  const vecino = d.vecino
  const atenuado = d.atenuado
  const validado = d.validado
  // Out-degree: cantidad de movs que este mov desbloquea. Threshold visual ≥3
  // marca el mov como "palanca" (linchpin) — cuello de botella aguas abajo.
  // 3-4 = amber suave, 5+ = amber intenso.
  const outDegree = m.desbloquea?.length ?? 0
  const esLinchpin = outDegree >= 3
  const esLinchpinFuerte = outDegree >= 5
  // In-degree: cantidad de movs que precondicionan a este. Threshold ≥3 marca
  // al mov como "riesgo" — punto de convergencia que necesita que TODOS los
  // anteriores estén listos antes de arrancar. 3-4 = rojo oscuro suave, 5+ =
  // rojo brillante intenso.
  const inDegree = m.precondiciones?.length ?? 0
  const esRiesgo = inDegree >= 3
  const esRiesgoFuerte = inDegree >= 5
  // Jerarquía visual del borde:
  //   1. seleccionado → borde amarillo intenso + fondo + sombra (foco activo).
  //   2. validado     → borde verde persistente (estado bookkeeping del user).
  //   3. vecino       → borde amarillo suave (conectado al seleccionado).
  //   4. linchpin     → borde amber (palanca del plan, info pasiva).
  //   5. default      → borde sidebar (sin estado especial).
  // El amarillo (selección actual) gana sobre el verde (estado persistente)
  // porque el foco transitorio es la señal más urgente — el checkbox sigue
  // marcado por su cuenta, así que el user ve que sigue validado.
  const bordeYFondo =
    seleccionado
      ? 'border-yellow-400 bg-yellow-400/15 shadow-md shadow-yellow-700/40'
      : validado
        ? 'border-green-500 bg-green-500/8'
        : vecino
          ? 'border-yellow-400/55 bg-yellow-400/5'
          : esLinchpinFuerte
            ? 'border-amber-500/70 bg-background shadow-amber-900/30 shadow-md hover:bg-accent/40'
            : 'border-sidebar-border bg-background hover:bg-accent/40'
  // Width dinámico: el ancho representa la duración del trabajo activo. Se
  // computa upstream (FasesCanvasP4) como dateToX(trabajoTermina) - dateToX(arranca),
  // con piso NODE_W para que el contenido (id, nombre, badges) entre siempre.
  const effectiveWidth = d.width && d.width > NODE_W ? d.width : NODE_W
  // Tooltip del mov: ventana del schedule (vía d.tooltip que viene calculado
  // por FasesCanvasP4) + duración si la hay.
  const tooltipFinal = (() => {
    const partes: string[] = []
    const dur = d.durMeses ?? 0
    if (dur > 0 && m.ventana_temporal) {
      const durStr = ` · ${dur} ${dur === 1 ? 'mes' : 'meses'}`
      partes.push(`${m.ventana_temporal.arranca} → ${m.ventana_temporal.termina}${durStr}`)
    }
    if (d.tooltip) partes.push(d.tooltip)
    return partes.length > 0 ? partes.join(' · ') : undefined
  })()
  return (
    // Wrapper opaco: garantiza que las líneas de edges que cruzan por detrás
    // del nodo (xyflow las renderea en una capa SVG debajo de los nodos) NO
    // se vean a través del cuerpo del nodo. Sin este wrapper, los bgs con
    // alpha (yellow/15, green/8, etc) dejan pasar las flechas y se vuelve
    // ilegible cuando hay deps cruzadas pasando por encima de otros nodos.
    <div
      className="relative rounded-lg bg-background"
      style={{ width: effectiveWidth, minHeight: NODE_H }}
    >
    {/* Handles target/source — viven en el WRAPPER (no en la inner card) para
        que el source handle (Position.Right) caiga en el borde derecho del
        SPAN. Así las flechas salientes parten del FIN temporal del mov. */}
    <Handle type="target" position={Position.Left} style={{ width: 12, height: 12, background: 'oklch(0.7 0.15 280)', border: '2px solid oklch(0.18 0.005 280)' }} />
    <Handle type="source" position={Position.Right} style={{ width: 12, height: 12, background: 'oklch(0.7 0.15 280)', border: '2px solid oklch(0.18 0.005 280)' }} />
    {/* La ficha ES la barra Gantt: ocupa todo el ancho del wrapper, que ya está
        dimensionado proporcionalmente a la duración del mov (arranca →
        trabajoTermina). No más tail separado — la duración se lee del ancho de
        la ficha misma. */}
    <div
      className={`absolute rounded-lg border-2 px-3 py-2 transition-all ${bordeYFondo} ${atenuado ? 'opacity-30' : ''}`}
      style={{ left: 0, right: 0, top: 0, bottom: 0 }}
      title={tooltipFinal}
    >
      {/* Stack izquierdo de badges: validación (✓) + riesgo (⚠️ in-degree).
          Conceptualmente "input": cosas que entran al nodo. Validación es
          bookkeeping del user. Riesgo es topología (cantidad de precondiciones). */}
      {(d.onToggleValidado || esRiesgo || d.warning) && (
        <div className="absolute -top-2.5 -left-2.5 flex items-center gap-1">
          {d.onToggleValidado && (
            <button
              onClick={(e) => { e.stopPropagation(); d.onToggleValidado!(!validado) }}
              title={validado
                ? 'Marcado: dependencias validadas. Click para desmarcar.'
                : 'Click para marcar como validado: confirmás que revisaste las dependencias de este mov.'}
              aria-label={validado ? 'Desmarcar validado' : 'Marcar como validado'}
              className={`flex items-center justify-center w-5 h-5 rounded-full border-2 text-[12px] font-bold shadow-md transition-colors cursor-pointer ${
                validado
                  ? 'bg-green-500 border-green-300 text-white hover:bg-green-400'
                  : 'bg-background border-sidebar-border text-transparent hover:border-green-500/60 hover:bg-green-500/10'
              }`}
            >
              ✓
            </button>
          )}
          {esRiesgo && (
            <span
              title={`Este movimiento depende de ${inDegree} otros. Es riesgoso: necesita que TODOS los anteriores estén listos antes de arrancar.`}
              className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[12px] font-bold shadow-md border ${
                esRiesgoFuerte
                  ? 'bg-red-600 text-red-50 border-red-300/40'
                  : 'bg-red-900/80 text-red-100 border-red-600/50'
              }`}
            >
              <span aria-hidden>⚠️</span>
              <span>{inDegree}</span>
            </span>
          )}
          {d.warning && (
            <span
              title={d.warning}
              className="flex items-center justify-center w-5 h-5 rounded-full bg-orange-500 text-white text-[12px] font-bold shadow-md border border-orange-300/40"
            >
              !
            </span>
          )}
        </div>
      )}
      {/* Badge palanca: aparece cuando out-degree ≥3. Escala visual por intensidad. */}
      {esLinchpin && (
        <span
          title={`Este movimiento desbloquea ${outDegree} otros. Es una palanca del plan.`}
          className={`absolute -top-2.5 -right-2.5 flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[12px] font-bold shadow-md border ${
            esLinchpinFuerte
              ? 'bg-amber-600 text-amber-50 border-amber-300/40'
              : 'bg-amber-900/80 text-amber-100 border-amber-600/50'
          }`}
        >
          <span aria-hidden>🔥</span>
          <span>{outDegree}</span>
        </span>
      )}
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${colorImpactoClass(m.impacto)}`} title={`Impacto: ${m.impacto ?? '(sin declarar)'}`} />
        <span className="font-mono text-[11px] text-muted-foreground/70">{m.id}</span>
        {m.arranca_override && (
          <span
            title={
              m.arranca_override_razonamiento
                ? `Movido manualmente a ${m.arranca_override} · ${m.arranca_override_razonamiento}`
                : `Movido manualmente a ${m.arranca_override} (sin razonamiento)`
            }
            className="inline-flex items-center gap-0.5 rounded px-1 py-px text-[10px] font-bold uppercase tracking-wider bg-amber-700/80 text-amber-50 border border-amber-400/40 flex-shrink-0"
          >
            ↪ Movido
          </span>
        )}
        {!d.hideCategoria && (
          <span className="text-[10px] uppercase text-muted-foreground/60 ml-auto truncate" title={m.categoria}>{m.categoria}</span>
        )}
      </div>
      <p className={`text-[12px] font-medium text-foreground leading-snug ${d.hideCategoria ? 'line-clamp-3' : 'line-clamp-2'}`}>{m.nombre}</p>
      {/* Botón ✎ Editar — solo visible cuando el nodo está seleccionado.
          Anclado a la esquina inferior-derecha del nodo, desbordando un poco
          afuera (parecido a los badges) para no comer espacio del contenido. */}
      {seleccionado && d.onVerDetalle && (
        <button
          onClick={(e) => { e.stopPropagation(); d.onVerDetalle!() }}
          title="Editar este movimiento"
          aria-label="Editar movimiento"
          className="absolute -bottom-2.5 -right-2.5 flex items-center justify-center w-7 h-7 rounded-full bg-yellow-400 hover:bg-yellow-300 text-background border-2 border-background shadow-lg text-[14px] font-bold transition-colors cursor-pointer"
        >
          ✎
        </button>
      )}
    </div>
    </div>
  )
}

// ─── Cartel de ayuda colapsable ──────────────────────────────────────────────
// Lista corta de las interacciones del canvas. Default expandido para que el
// user lo vea la primera vez; tras colapsar, queda como un botón "?" discreto.
// El estado es local (por session) — si el user lo cierra, la próxima vez que
// abra el wizard arranca expandido de nuevo. Decisión deliberada: no vale la
// pena persistir en localStorage para algo tan barato de mostrar.

function AyudaCartel({ readOnly }: { readOnly: boolean }) {
  const [abierto, setAbierto] = useState(true)

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        aria-label="Mostrar ayuda del canvas"
        title="Cómo usar el canvas"
        className="rounded-full border border-sidebar-border bg-background/90 hover:bg-accent/80 w-7 h-7 flex items-center justify-center text-[14px] font-bold text-muted-foreground hover:text-foreground shadow-md backdrop-blur-sm"
      >
        ?
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-sidebar-border bg-background/90 backdrop-blur-sm shadow-lg px-3 py-2.5 max-w-[280px]">
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/80">
          Cómo usar el canvas
        </p>
        <button
          onClick={() => setAbierto(false)}
          aria-label="Cerrar ayuda"
          className="rounded text-muted-foreground/70 hover:text-foreground hover:bg-accent/60 px-1 text-[14px] leading-none"
        >
          ×
        </button>
      </div>
      <ul className="space-y-1 text-[12px] text-foreground/85 leading-snug">
        <li>
          <span className="text-amber-300/90">Click en un movimiento</span> — ilumina sus dependencias{!readOnly && '; aparece un botón ✎ en la esquina inferior-derecha del nodo para editarlo'}.
        </li>
        <li>
          <span className="text-amber-300/90">Click en una línea</span> — la fija iluminada; click otra vez para soltarla.
        </li>
        <li>
          <span className="text-amber-300/90">Hover sobre DURA/BLANDA</span> — muestra el razonamiento del vínculo.
        </li>
        {!readOnly && (
          <li>
            <span className="text-amber-300/90">Click en DURA/BLANDA</span> — editar tipo, razonamiento o borrar.
          </li>
        )}
        <li>
          <span className="text-amber-300/90">Click en el fondo</span> — apaga la selección.
        </li>
        {!readOnly && (
          <>
            <li>
              <span className="text-amber-300/90">Click + arrastrar en zona vacía</span> — marco de selección; los movs que toque quedan agrupados. Arrastrá uno y se mueven todos juntos.
            </li>
            <li>
              <span className="text-amber-300/90">Mantené Espacio + arrastrar</span> — mover el canvas (cursor manito).
            </li>
          </>
        )}
        <li>
          <span className="text-amber-300/90 inline-flex items-center gap-1">🔥 N</span> — cantidad de movs que desbloquea (palanca / cuello de botella).
        </li>
        <li>
          <span className="text-amber-300/90 inline-flex items-center gap-1">⚠️ N</span> — cantidad de movs que lo precondicionan (riesgo: necesita varios listos antes de arrancar).
        </li>
      </ul>
    </div>
  )
}


// ─── Labels sticky de categorías (franjas Y) ─────────────────────────────────
// Vive en un Panel screen-space top-left. Cada label se posiciona según la
// banda Y correspondiente (en canvas coords) transformada al screen-space
// usando el viewport actual: screen_y = canvas_y * zoom + viewport.y.
// Así los labels SIEMPRE se ven a la izquierda del canvas, incluso si el user
// paneó lejos. Cada label muestra el nombre de la categoría — clamp por width.

function CategoriaLabelsOverlay({ bandas, bandHeaderExtra }: {
  bandas: BandInfo[]
  bandHeaderExtra?: (key: string) => React.ReactNode
}) {
  const { x: viewX, y: viewY, zoom } = useViewport()
  return (
    <Panel position="top-left" className="!pointer-events-none !m-0">
      <div className="relative" style={{ width: 0, height: 0 }}>
        {bandas.map(band => {
          const screenY = band.yStart * zoom + viewY
          const screenH = band.height * zoom
          if (band.topHeaderHeight > 0) {
            // Header horizontal: ocupa el top de la banda con el nombre en
            // texto recto (read normal). Útil para nombres largos como dueños
            // ("Lucas Mercado", "JMT y Randy"). Se trackea X del viewport
            // también para que el header siga al canvas durante panning.
            const headerScreenY = screenY
            const headerScreenH = band.topHeaderHeight * zoom
            return (
              <div
                key={band.categoria}
                style={{
                  position: 'absolute',
                  left: viewX,
                  top: headerScreenY,
                  height: headerScreenH,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  paddingLeft: 8,
                  pointerEvents: 'none',
                }}
              >
                <span
                  title={band.categoria}
                  className="inline-block px-2.5 py-1 rounded-md bg-background/95 backdrop-blur-sm border border-sidebar-border shadow-md text-[12px] font-semibold uppercase tracking-wide text-foreground/90 whitespace-nowrap"
                >
                  {band.categoria}
                </span>
                {bandHeaderExtra && bandHeaderExtra(band.categoria)}
              </div>
            )
          }
          // Modo legacy 3.A.6: chip rotado al margen izquierdo, centrado
          // verticalmente en la banda. Pre-rotación el ancho es natural; post
          // rotación se extiende vertical lo que necesite (acepta overlap con
          // bandas vecinas si nombre largo).
          return (
            <div
              key={band.categoria}
              style={{
                position: 'absolute',
                left: 0,
                top: screenY,
                width: LABEL_WIDTH_Y,
                height: screenH,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
              }}
            >
              <span
                title={band.categoria}
                style={{
                  transform: 'rotate(-90deg)',
                  transformOrigin: 'center',
                  whiteSpace: 'nowrap',
                  display: 'inline-block',
                  letterSpacing: '0.02em',
                }}
                className="px-1.5 py-0.5 rounded bg-background/95 backdrop-blur-sm border border-sidebar-border shadow-md text-[9px] font-semibold uppercase text-foreground/90"
              >
                {band.categoria}
              </span>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

// ─── Labels sticky de bandas X (top header) ──────────────────────────────────
// Análogo a CategoriaLabelsOverlay, pero para el eje X. Cada banda X es de
// BAND_WIDTH (canvas coords) → en screen coords se transforma a BAND_WIDTH*zoom.
// La posición horizontal se rastrea vía useViewport().x para que los headers
// queden siempre alineados con sus lanes incluso si el user paneó.

const X_LABEL_HEIGHT = 36

function XBandLabelsOverlay({ keys, label, xBandWidth }: {
  keys: string[]
  label?: (k: string) => string
  xBandWidth: number
}) {
  const { x: viewX, zoom } = useViewport()
  return (
    <Panel position="top-left" className="!pointer-events-none !m-0">
      <div className="relative" style={{ width: 0, height: X_LABEL_HEIGHT }}>
        {keys.map((k, i) => {
          const xStart = i * xBandWidth
          const screenX = xStart * zoom + viewX
          const screenW = xBandWidth * zoom
          return (
            <div
              key={k}
              style={{
                position: 'absolute',
                left: screenX,
                top: 8,
                width: screenW,
                height: X_LABEL_HEIGHT,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span
                title={label?.(k) ?? k}
                className="truncate px-3 py-1 rounded-md bg-background/85 backdrop-blur-sm border border-sidebar-border shadow-sm text-[13px] font-semibold uppercase tracking-wider text-foreground/85"
              >
                {label?.(k) ?? k}
              </span>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}
