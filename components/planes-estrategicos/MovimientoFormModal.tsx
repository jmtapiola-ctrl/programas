'use client'

// Modal unificado para editar o agregar movimientos del inventario (Sub-bloque 3.A).
//
// Reemplaza al edit-form inline de MovimientoCard y al NuevoMovimientoForm
// inline. Misma ficha en TODO el wizard — un solo lugar donde vive la lógica
// de captura de campos.
//
// Llamado desde:
//   - Categorías review: click sobre un mov (editar) o "+ Agregar movimiento" (agregar).
//   - Brechas validacion: click sobre un mov (editar) o "+ Agregar movimiento que ataque esta brecha" (agregar).
//
// Backend hits:
//   - editar: PATCH /paso3/inventario/decision con { movimiento_id, estado: 'editado', patch }.
//   - agregar: PATCH /paso3/inventario/decision con { agregar: { categoria, movimiento } }.
//
// Las dependencias (precondiciones, desbloquea, tipo_dependencia) por default
// NO se editan acá — viven en sub-bloque 3.A.6 (Secuenciación) vía el DAG
// canvas. Excepción: cuando el modal se abre desde el canvas 3.A.6 (botón
// "✎ Ver detalle"), el parent pasa `mostrarDeps={true}` y aparece la sección
// DepsEditor con tag chips + buscador + popover de tipo/razonamiento.

import { BTN_CTA, BTN_CTA_SM } from '@/components/ui/button-styles'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { InventarioPE, MovimientoPE } from '@/lib/types'
import { normalizeDepTipoEdge } from '@/lib/types'
import { BrechasMultiSelect } from './InventarioCategoria'

type EditarProps = {
  mode: 'editar'
  movimiento: MovimientoPE
}

type AgregarProps = {
  mode: 'agregar'
  categoriaInicial?: string
  brechaInicial?: string
}

type Props = (EditarProps | AgregarProps) & {
  planId: string
  categorias: string[]                            // categorías existentes en el inventario
  metricasProposito: { metrica: string }[]        // para BrechasMultiSelect
  // Mostrar la sección de edición de deps (precondiciones + desbloquea).
  // Solo pasada como true desde 3.A.6 vía el botón "✎ Ver detalle". En el
  // resto de las vistas queda undefined/false y los campos no aparecen.
  // Aplica solo en modo editar (ignored si mode='agregar').
  mostrarDeps?: boolean
  // Inventario completo (movimientos), requerido cuando mostrarDeps=true para
  // poblar el buscador y resolver tipo/razon de edges salientes (desbloquea).
  allMovimientos?: MovimientoPE[]
  // Si true, el botón "Eliminar movimiento" muestra warning extra porque el
  // mov aparece referenciado en borrador (3.C) o curado (3.E) generado. El
  // parent computa esto y lo pasa para que el modal lo sume al confirm.
  referenciadoEnDownstream?: boolean
  // Lista de dueños ya existentes en el inventario (strings únicos). El campo
  // "Dueño" usa esta lista para autocompletar y prevenir variantes duplicadas
  // del mismo nombre (ej: "Lu" vs "Lucas Mercado"). Si no se pasa, el campo
  // sigue siendo input plano (back-compat).
  duenosExistentes?: string[]
  // Para editar, idNuevo viene undefined; para agregar, se setea al id asignado
  // por el server al nuevo movimiento.
  onSuccess: (inv: InventarioPE, idNuevo?: string) => void
  onCerrar: () => void
}

// Edge "en draft" dentro del form: nos olvidamos del array crudo del schema
// y trabajamos con objetos {movId, tipo, razon, lag} para que el chip se renderee
// directo sin lookups extra.
interface EdgeDraft {
  movId: string
  tipo: 'sugerida' | 'ff' | 'fs' | 'continuo'
  razonamiento: string
  // Lag por edge en meses. Aplica a FS/FF/continuo (default 0); ignorado para 'sugerida'.
  lagMeses: number
}

export function MovimientoFormModal(props: Props) {
  if (typeof document === 'undefined') return null
  return createPortal(<Contenido {...props} />, document.body)
}

function Contenido(props: Props) {
  const { planId, categorias, metricasProposito, onCerrar, mostrarDeps, allMovimientos, referenciadoEnDownstream } = props
  const esEditar = props.mode === 'editar'
  const movInicial = esEditar ? props.movimiento : undefined
  // Sección de deps SOLO se habilita en editar + mostrarDeps=true + inventario disponible.
  const habilitarDeps = !!(esEditar && mostrarDeps && allMovimientos && movInicial)

  const hoy = new Date()
  const enTresMeses = new Date(hoy.getFullYear(), hoy.getMonth() + 3, 1)
  const fmtYM = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

  // ─── State del form ───────────────────────────────────────────────────────
  const [nombre, setNombre] = useState(movInicial?.nombre ?? '')
  const [categoriaSel, setCategoriaSel] = useState<string>(
    esEditar ? props.movimiento.categoria : (props.categoriaInicial ?? ''),
  )
  // Estado de "crear nueva categoría": cuando es null, el dropdown se muestra
  // normal; cuando es string, se reemplaza el dropdown por un input para
  // capturar el nombre nuevo. Al confirmar, la categoría nueva pasa a
  // categoriaSel y se persiste sola al guardar el mov.
  const [nuevaCategoriaDraft, setNuevaCategoriaDraft] = useState<string | null>(null)
  const [brechas, setBrechas] = useState<string[]>(
    movInicial?.brechas_atacadas ?? (!esEditar && props.brechaInicial ? [props.brechaInicial] : []),
  )
  const [showBrechasError, setShowBrechasError] = useState(false)
  const [descripcion, setDescripcion] = useState(movInicial?.descripcion ?? '')
  const [queResuelve, setQueResuelve] = useState(movInicial?.que_resuelve ?? '')
  const [dueno, setDueno] = useState(movInicial?.dueno ?? '')
  // Vacancia: el "dueño" es un puesto a cubrir, no una persona concreta.
  // Heurística display: si dueno legacy contiene "vacancia"/"vacante" y el flag
  // explícito no está seteado, pre-cargamos el checkbox como marcado para que
  // el user pueda confirmar la conversión a estructurado al guardar.
  const heuristicaVacante = useMemo(() => {
    if (movInicial?.dueno_es_vacante !== undefined) return movInicial.dueno_es_vacante
    const d = (movInicial?.dueno ?? '').toLowerCase()
    return /vacanc|vacante/.test(d)
  }, [movInicial])
  const [duenoEsVacante, setDuenoEsVacante] = useState<boolean>(heuristicaVacante)
  const [duenoSemanasCobertura, setDuenoSemanasCobertura] = useState<string>(
    movInicial?.dueno_semanas_cobertura !== undefined
      ? String(movInicial.dueno_semanas_cobertura)
      : '8',
  )
  const [criterio, setCriterio] = useState(movInicial?.criterio_exito ?? '')
  // Duración estimada del mov en meses (input real del user). El cronograma
  // (arranca/termina) se computa via CPM en P-4. Default 3 para movs nuevos.
  const [duracionMeses, setDuracionMeses] = useState<string>(
    movInicial?.duracion_meses_ejecucion !== undefined
      ? String(movInicial.duracion_meses_ejecucion)
      : '3',
  )
  const [costoMin, setCostoMin] = useState(String(movInicial?.costo_monetario?.rango_min_usd ?? 0))
  const [costoMax, setCostoMax] = useState(String(movInicial?.costo_monetario?.rango_max_usd ?? 0))
  const [costoNota, setCostoNota] = useState(movInicial?.costo_monetario?.nota ?? '')
  const [bandaAncha, setBandaAncha] = useState<'baja' | 'media' | 'alta'>(movInicial?.costo_banda_ancha ?? 'media')
  const [impacto, setImpacto] = useState<'baja' | 'media' | 'alta'>(movInicial?.impacto ?? 'media')

  // ─── State de deps (solo si habilitarDeps) ──────────────────────────────
  // Inicialización de precondsLocal: tomar movInicial.precondiciones + tipo/razon.
  // Inicialización de desbloqueaLocal: iterar movInicial.desbloquea y para cada
  // target Y, mirar Y.precondiciones_tipo[movInicial.id] y Y.precondiciones_razonamiento[movInicial.id]
  // para reflejar el lado en el que viven esos campos.
  const [precondsLocal, setPrecondsLocal] = useState<EdgeDraft[]>(() => {
    if (!habilitarDeps || !movInicial) return []
    return (movInicial.precondiciones ?? []).map(precId => ({
      movId: precId,
      tipo: normalizeDepTipoEdge(movInicial.precondiciones_tipo?.[precId]),
      razonamiento: movInicial.precondiciones_razonamiento?.[precId] ?? '',
      lagMeses: Math.max(0, Math.floor(movInicial.precondiciones_lag_meses?.[precId] ?? 0)),
    }))
  })
  const [desbloqueaLocal, setDesbloqueaLocal] = useState<EdgeDraft[]>(() => {
    if (!habilitarDeps || !movInicial || !allMovimientos) return []
    return (movInicial.desbloquea ?? []).map(targetId => {
      const target = allMovimientos.find(m => m.id === targetId)
      return {
        movId: targetId,
        tipo: normalizeDepTipoEdge(target?.precondiciones_tipo?.[movInicial.id]),
        razonamiento: target?.precondiciones_razonamiento?.[movInicial.id] ?? '',
        lagMeses: Math.max(0, Math.floor(target?.precondiciones_lag_meses?.[movInicial.id] ?? 0)),
      }
    })
  })

  const [saving, setSaving] = useState(false)
  const [errorServer, setErrorServer] = useState<string | null>(null)
  // Cuál chip tiene su popover abierto, identificado por ('pre'|'des', movId).
  // Solo uno abierto a la vez. null = ninguno.
  const [edgePopoverAbierto, setEdgePopoverAbierto] = useState<{ lista: 'pre' | 'des'; movId: string } | null>(null)
  // Error transitorio mostrado en la sección de deps (ej: "crearía un ciclo").
  // Se limpia al próximo cambio exitoso.
  const [depsError, setDepsError] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !saving) onCerrar() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCerrar, saving])

  // Mapa desbloqueaByMov reflejando el estado actual (form working + inventario)
  // — usado para cycle-check al agregar un edge. Para el mov actual usamos el
  // working state local; para los demás, el committed state del inventario.
  const desbloqueaByMov = useMemo(() => {
    const map = new Map<string, string[]>()
    if (!habilitarDeps || !allMovimientos || !movInicial) return map
    for (const m of allMovimientos) {
      if (m.id === movInicial.id) {
        map.set(m.id, desbloqueaLocal.map(e => e.movId))
      } else {
        map.set(m.id, [...(m.desbloquea ?? [])])
      }
    }
    return map
  }, [habilitarDeps, allMovimientos, movInicial, desbloqueaLocal])

  // Cycle-check pure function: arranca en `hacia` y camina forward via desbloqueaByMov.
  // Si llega a `desde`, agregar la nueva edge desde→hacia cerraría un ciclo.
  function cycleWouldExist(desde: string, hacia: string): boolean {
    if (desde === hacia) return true
    const visited = new Set<string>()
    const queue: string[] = [hacia]
    while (queue.length) {
      const cur = queue.shift()!
      if (cur === desde) return true
      if (visited.has(cur)) continue
      visited.add(cur)
      for (const n of desbloqueaByMov.get(cur) ?? []) queue.push(n)
    }
    return false
  }

  // ─── Mutaciones de deps locales ──────────────────────────────────────────
  // "pre" = precondiciones (edge X → mov_actual). cycle desde=X, hacia=mov_actual.
  // "des" = desbloquea (edge mov_actual → Y). cycle desde=mov_actual, hacia=Y.
  function agregarPrecondicion(precId: string) {
    if (!movInicial) return
    if (precondsLocal.some(e => e.movId === precId)) return
    if (cycleWouldExist(precId, movInicial.id)) {
      setDepsError(`Agregar ${precId} crearía un ciclo en las dependencias.`)
      setTimeout(() => setDepsError(null), 4000)
      return
    }
    setPrecondsLocal(prev => [...prev, { movId: precId, tipo: 'sugerida', razonamiento: '', lagMeses: 0 }])
    setDepsError(null)
  }
  function agregarDesbloquea(targetId: string) {
    if (!movInicial) return
    if (desbloqueaLocal.some(e => e.movId === targetId)) return
    if (cycleWouldExist(movInicial.id, targetId)) {
      setDepsError(`Agregar ${targetId} crearía un ciclo en las dependencias.`)
      setTimeout(() => setDepsError(null), 4000)
      return
    }
    setDesbloqueaLocal(prev => [...prev, { movId: targetId, tipo: 'sugerida', razonamiento: '', lagMeses: 0 }])
    setDepsError(null)
  }
  function quitarPrecondicion(movId: string) {
    setPrecondsLocal(prev => prev.filter(e => e.movId !== movId))
  }
  function quitarDesbloquea(movId: string) {
    setDesbloqueaLocal(prev => prev.filter(e => e.movId !== movId))
  }
  function actualizarEdge(lista: 'pre' | 'des', movId: string, patch: Partial<EdgeDraft>) {
    const setter = lista === 'pre' ? setPrecondsLocal : setDesbloqueaLocal
    setter(prev => prev.map(e => e.movId === movId ? { ...e, ...patch } : e))
  }

  // ─── Validaciones ────────────────────────────────────────────────────────
  const categoriaFinal = nuevaCategoriaDraft !== null ? nuevaCategoriaDraft.trim() : categoriaSel.trim()
  const duracionValida = (() => {
    const n = parseInt(duracionMeses, 10)
    return Number.isFinite(n) && n >= 1 && n <= 36
  })()
  const requiredAgregar = !esEditar
    ? Boolean(nombre.trim() && queResuelve.trim() && dueno.trim() && criterio.trim() && duracionValida)
    : true
  const camposOk = Boolean(
    nombre.trim() &&
    categoriaFinal &&
    // Brecha obligatoria SOLO si hay métricas del propósito disponibles. En un
    // Plan Jr las métricas se heredan (no estructuradas) y metricasProposito
    // viene vacío → no se exige brecha (la cobertura la valida el cap).
    (metricasProposito.length === 0 || brechas.length > 0) &&
    requiredAgregar,
  )

  // ─── Acciones ────────────────────────────────────────────────────────────
  async function handleGuardar() {
    if (!camposOk) {
      if (metricasProposito.length > 0 && brechas.length === 0) setShowBrechasError(true)
      return
    }
    setSaving(true)
    setErrorServer(null)

    try {
      if (esEditar) {
        const semanasParsed = parseInt(duenoSemanasCobertura, 10)
        const patch: Partial<MovimientoPE> = {
          nombre: nombre.trim(),
          categoria: categoriaFinal,
          brechas_atacadas: brechas,
          descripcion: descripcion,
          que_resuelve: queResuelve,
          dueno: dueno,
          dueno_es_vacante: duenoEsVacante,
          dueno_semanas_cobertura: duenoEsVacante && Number.isFinite(semanasParsed) && semanasParsed > 0
            ? semanasParsed
            : undefined,
          criterio_exito: criterio,
          duracion_meses_ejecucion: (() => {
            const n = parseInt(duracionMeses, 10)
            return Number.isFinite(n) && n >= 1 ? n : undefined
          })(),
          costo_monetario: {
            rango_min_usd: parseFloat(costoMin) || 0,
            rango_max_usd: parseFloat(costoMax) || 0,
            ...(costoNota.trim() ? { nota: costoNota.trim() } : {}),
          },
          costo_banda_ancha: bandaAncha,
          impacto,
        }
        // Si la sección de deps está habilitada, agregamos las precondiciones
        // y desbloquea al patch. Server auto-mirrors arrays a los movs target.
        // Después de la PATCH del mov actual, hacemos PATCHes adicionales a los
        // targets de desbloquea para setear su precondiciones_tipo y
        // precondiciones_razonamiento (estos campos viven en el target, no en
        // el mov actual). Los targets de PRECONDICIONES no requieren extra
        // PATCH porque tipo/razon viven en el mov actual y van en el patch.
        if (habilitarDeps) {
          const precondTipo: { [k: string]: 'sugerida' | 'ff' | 'fs' | 'continuo' } = {}
          const precondRazon: { [k: string]: string } = {}
          const precondLag: { [k: string]: number } = {}
          for (const e of precondsLocal) {
            precondTipo[e.movId] = e.tipo
            if (e.razonamiento.trim()) precondRazon[e.movId] = e.razonamiento.trim()
            // Solo emitir lag si > 0 y tipo no-sugerida (lag no aplica a sugerida).
            const lag = Math.max(0, Math.floor(e.lagMeses ?? 0))
            if (lag > 0 && e.tipo !== 'sugerida') precondLag[e.movId] = lag
          }
          patch.precondiciones = precondsLocal.map(e => e.movId)
          patch.desbloquea = desbloqueaLocal.map(e => e.movId)
          patch.precondiciones_tipo = Object.keys(precondTipo).length > 0 ? precondTipo : undefined
          patch.precondiciones_razonamiento = Object.keys(precondRazon).length > 0 ? precondRazon : undefined
          patch.precondiciones_lag_meses = Object.keys(precondLag).length > 0 ? precondLag : undefined
          // Si hay precondiciones, tipo_dependencia legacy global sube a 'sugerida' default.
          if (precondsLocal.length > 0) {
            patch.tipo_dependencia = patch.tipo_dependencia ?? 'sugerida'
          } else {
            patch.tipo_dependencia = 'ninguna'
          }
        }
        const res = await fetch(`/api/planes-estrategicos/${planId}/paso3/inventario/decision`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ movimiento_id: props.movimiento.id, estado: 'editado', patch }),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          setErrorServer(data?.error || `Error ${res.status}`)
          setSaving(false)
          return
        }
        // Paso 2: si hay deps habilitadas, PATCHes adicionales por target de
        // desbloquea para setear tipo/razon (viven en target.precondiciones_*).
        let inventarioActual: InventarioPE = data.inventario_actualizado
        if (habilitarDeps && movInicial) {
          for (const e of desbloqueaLocal) {
            const target = inventarioActual.movimientos.find(m => m.id === e.movId)
            if (!target) continue
            const nuevoTipo = { ...(target.precondiciones_tipo ?? {}), [movInicial.id]: e.tipo }
            const nuevoRaz = { ...(target.precondiciones_razonamiento ?? {}) }
            if (e.razonamiento.trim()) nuevoRaz[movInicial.id] = e.razonamiento.trim()
            else delete nuevoRaz[movInicial.id]
            // Sync lag en el target (lag vive en target.precondiciones_lag_meses[movInicial.id]).
            const nuevoLag = { ...(target.precondiciones_lag_meses ?? {}) }
            const lag = Math.max(0, Math.floor(e.lagMeses ?? 0))
            if (lag > 0 && e.tipo !== 'sugerida') nuevoLag[movInicial.id] = lag
            else delete nuevoLag[movInicial.id]
            const targetPatch: Partial<MovimientoPE> = {
              precondiciones_tipo: nuevoTipo,
              precondiciones_razonamiento: Object.keys(nuevoRaz).length > 0 ? nuevoRaz : undefined,
              precondiciones_lag_meses: Object.keys(nuevoLag).length > 0 ? nuevoLag : undefined,
            }
            const r2 = await fetch(`/api/planes-estrategicos/${planId}/paso3/inventario/decision`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ movimiento_id: target.id, estado: target.estado_usuario, patch: targetPatch }),
            })
            const d2 = await r2.json().catch(() => null)
            if (r2.ok && d2?.inventario_actualizado) inventarioActual = d2.inventario_actualizado
            // Si falla, seguimos al siguiente — partial failure es aceptable v1.
          }
          // Cleanup defensive: targets que TENIAN entry en su precondiciones_tipo[movInicial.id]
          // pero ya no están en desbloqueaLocal (se borró la edge). Quitar la entry.
          const desbloqueaIds = new Set(desbloqueaLocal.map(e => e.movId))
          const desbloqueaOriginalIds = movInicial.desbloquea ?? []
          const removidos = desbloqueaOriginalIds.filter(id => !desbloqueaIds.has(id))
          for (const targetId of removidos) {
            const target = inventarioActual.movimientos.find(m => m.id === targetId)
            if (!target) continue
            const tipoMap = { ...(target.precondiciones_tipo ?? {}) }
            const razMap = { ...(target.precondiciones_razonamiento ?? {}) }
            const lagMap = { ...(target.precondiciones_lag_meses ?? {}) }
            delete tipoMap[movInicial.id]
            delete razMap[movInicial.id]
            delete lagMap[movInicial.id]
            const targetPatch: Partial<MovimientoPE> = {
              precondiciones_tipo: Object.keys(tipoMap).length > 0 ? tipoMap : undefined,
              precondiciones_razonamiento: Object.keys(razMap).length > 0 ? razMap : undefined,
              precondiciones_lag_meses: Object.keys(lagMap).length > 0 ? lagMap : undefined,
            }
            const r3 = await fetch(`/api/planes-estrategicos/${planId}/paso3/inventario/decision`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ movimiento_id: target.id, estado: target.estado_usuario, patch: targetPatch }),
            })
            const d3 = await r3.json().catch(() => null)
            if (r3.ok && d3?.inventario_actualizado) inventarioActual = d3.inventario_actualizado
          }
        }
        props.onSuccess(inventarioActual)
        onCerrar()
      } else {
        const semanasParsedAgregar = parseInt(duenoSemanasCobertura, 10)
        const nuevoMov: Omit<MovimientoPE, 'id' | 'estado_usuario'> = {
          categoria: categoriaFinal,
          nombre: nombre.trim(),
          descripcion: descripcion.trim(),
          que_resuelve: queResuelve.trim(),
          dueno: dueno.trim(),
          dueno_es_vacante: duenoEsVacante || undefined,
          dueno_semanas_cobertura: duenoEsVacante && Number.isFinite(semanasParsedAgregar) && semanasParsedAgregar > 0
            ? semanasParsedAgregar
            : undefined,
          criterio_exito: criterio.trim(),
          duracion_meses_ejecucion: (() => {
            const n = parseInt(duracionMeses, 10)
            return Number.isFinite(n) && n >= 1 ? n : undefined
          })(),
          costo_monetario: {
            rango_min_usd: parseFloat(costoMin) || 0,
            rango_max_usd: parseFloat(costoMax) || 0,
            ...(costoNota.trim() ? { nota: costoNota.trim() } : {}),
          },
          costo_banda_ancha: bandaAncha,
          impacto,
          brechas_atacadas: brechas,
          // Las deps se resuelven después en 3.A.6 (DAG canvas). Movs nuevos
          // arrancan independientes.
          tipo_dependencia: 'ninguna',
          precondiciones: [],
          desbloquea: [],
        }
        const res = await fetch(`/api/planes-estrategicos/${planId}/paso3/inventario/decision`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agregar: { categoria: categoriaFinal, movimiento: nuevoMov } }),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          setErrorServer(data?.error || `Error ${res.status}`)
          setSaving(false)
          return
        }
        const invActualizado: InventarioPE = data.inventario_actualizado
        // El nuevo mov se identifica por categoria + nombre. Tomamos el último
        // de ese match (server asigna ids incrementales y appendea al final).
        const recien = [...invActualizado.movimientos]
          .reverse()
          .find(m => m.categoria === categoriaFinal && m.nombre === nuevoMov.nombre)
        const idNuevo = recien?.id ?? ''
        props.onSuccess(invActualizado, idNuevo)
        onCerrar()
      }
    } catch (e: any) {
      setErrorServer(e?.message || 'Error de red')
      setSaving(false)
    }
  }

  // ─── Eliminar movimiento (soft delete + cleanup en cascada) ──────────────
  // Marca el mov como estado_usuario='quitado' y vacía sus arrays de deps.
  // El server auto-mirrors al vaciar precondiciones/desbloquea, quitando las
  // refs en los movs vecinos. Después limpiamos defensivamente los maps de
  // tipo/razon en los movs que tenían a este como precondición (auto-mirror
  // no toca esos maps). Cierra el modal al terminar.
  async function handleEliminar() {
    if (!esEditar || !movInicial) return
    const lineaWarning = referenciadoEnDownstream
      ? '\n\n⚠ Este movimiento aparece referenciado en el borrador (3.C) o curado (3.E) generado. Eliminarlo puede generar inconsistencias narrativas en esos pasos.'
      : ''
    const ok = window.confirm(
      `¿Eliminar el movimiento ${movInicial.id} "${movInicial.nombre}"?\n\n` +
      `Se va a quitar del inventario. Otros movimientos que dependían de él pierden esa conexión.${lineaWarning}\n\n` +
      `La acción es reversible: podés rehabilitarlo desde el botón "Aceptar" en la revisión por categoría (3.A.2).`,
    )
    if (!ok) return
    setSaving(true)
    setErrorServer(null)
    try {
      // PATCH 1: el target. Vaciamos arrays + marcamos quitado. El server
      // auto-mirrors: por cada mov en oldDesbloquea, removerá target de su
      // precondiciones (lado entrante); por cada mov en oldPrecondiciones,
      // removerá target de su desbloquea (lado saliente).
      const targetIdsAfectadosPorDesbloquea = movInicial.desbloquea ?? []
      const res = await fetch(`/api/planes-estrategicos/${planId}/paso3/inventario/decision`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          movimiento_id: movInicial.id,
          estado: 'quitado',
          patch: {
            precondiciones: [],
            desbloquea: [],
            precondiciones_tipo: undefined,
            precondiciones_razonamiento: undefined,
            tipo_dependencia: 'ninguna',
          },
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setErrorServer(data?.error || `Error ${res.status}`)
        setSaving(false)
        return
      }
      let inventarioActual: InventarioPE = data.inventario_actualizado
      // PATCH 2..N: limpiar maps huérfanos en los movs que tenían a target
      // como precondición (no se auto-mirror). El auto-mirror del paso 1 ya
      // quitó target de target.precondiciones de cada uno, pero los maps
      // de tipo/razon en esos movs todavía referencian target. Los limpiamos.
      for (const yId of targetIdsAfectadosPorDesbloquea) {
        const y = inventarioActual.movimientos.find(m => m.id === yId)
        if (!y) continue
        const tipoMap = { ...(y.precondiciones_tipo ?? {}) }
        const razMap = { ...(y.precondiciones_razonamiento ?? {}) }
        if (tipoMap[movInicial.id] === undefined && razMap[movInicial.id] === undefined) continue
        delete tipoMap[movInicial.id]
        delete razMap[movInicial.id]
        const r2 = await fetch(`/api/planes-estrategicos/${planId}/paso3/inventario/decision`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            movimiento_id: y.id,
            estado: y.estado_usuario,
            patch: {
              precondiciones_tipo: Object.keys(tipoMap).length > 0 ? tipoMap : undefined,
              precondiciones_razonamiento: Object.keys(razMap).length > 0 ? razMap : undefined,
            },
          }),
        })
        const d2 = await r2.json().catch(() => null)
        if (r2.ok && d2?.inventario_actualizado) inventarioActual = d2.inventario_actualizado
        // Si alguno falla, seguimos (partial cleanup aceptable v1).
      }
      props.onSuccess(inventarioActual)
      onCerrar()
    } catch (e: any) {
      setErrorServer(e?.message || 'Error de red al eliminar')
      setSaving(false)
    }
  }

  const titulo = esEditar
    ? `Editar movimiento — ${props.movimiento.id}`
    : 'Nuevo movimiento'

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sans"
      onClick={() => !saving && onCerrar()}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-sidebar-border bg-background shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex-shrink-0 border-b border-sidebar-border px-6 py-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Sub-bloque 3.A · Inventario
            </p>
            <h2 className="mt-1 text-[18px] font-semibold text-foreground">{titulo}</h2>
            {esEditar && (
              <p className="mt-1 text-[12px] text-muted-foreground">
                Cambios persisten inmediatamente al guardar. Estado pasa a "editado".
              </p>
            )}
          </div>
          <button
            onClick={onCerrar}
            disabled={saving}
            aria-label="Cerrar"
            className="rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 p-1 text-[16px] leading-none disabled:opacity-40"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {/* 1. Nombre */}
          <Field label="Nombre *" value={nombre} onChange={setNombre} />

          {/* 2. Categoría — dropdown o input "crear nueva" */}
          <div className="space-y-1">
            <label className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground/80">
              Categoría *
            </label>
            {nuevaCategoriaDraft !== null ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={nuevaCategoriaDraft}
                  onChange={(e) => setNuevaCategoriaDraft(e.target.value)}
                  placeholder="Nombre de la nueva categoría"
                  className="flex-1 rounded-md border border-sidebar-border bg-background px-3 py-2 text-[14px] text-foreground focus:border-primary focus:outline-none"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => {
                    const v = nuevaCategoriaDraft.trim()
                    if (!v) return
                    setCategoriaSel(v)
                    setNuevaCategoriaDraft(null)
                  }}
                  disabled={!nuevaCategoriaDraft.trim()}
                  className={BTN_CTA_SM}
                >
                  Usar
                </button>
                <button
                  type="button"
                  onClick={() => setNuevaCategoriaDraft(null)}
                  className="rounded-md border border-sidebar-border px-3 py-2 text-[13px] text-muted-foreground hover:bg-accent/50"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <select
                value={categoriaSel}
                onChange={(e) => {
                  if (e.target.value === '__nueva__') {
                    setNuevaCategoriaDraft('')
                  } else {
                    setCategoriaSel(e.target.value)
                  }
                }}
                className="w-full rounded-md border border-sidebar-border bg-background px-3 py-2 text-[14px] text-foreground focus:border-primary focus:outline-none"
              >
                <option value="" disabled>— Elegí una categoría —</option>
                {categorias.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
                {/* Si la categoría ya seleccionada no está en el dropdown (ej. recién creada) */}
                {categoriaSel && !categorias.includes(categoriaSel) && (
                  <option value={categoriaSel}>{categoriaSel} (nueva)</option>
                )}
                <option value="__nueva__">+ Crear nueva categoría…</option>
              </select>
            )}
          </div>

          {/* 3. Brechas */}
          <BrechasMultiSelect
            metricas={metricasProposito}
            seleccionadas={brechas}
            onToggle={(m) => {
              setBrechas(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])
              setShowBrechasError(false)
            }}
            error={showBrechasError}
          />

          {/* 4. Descripción */}
          <Field label="Descripción" value={descripcion} onChange={setDescripcion} multiline />

          {/* 5. Qué resuelve */}
          <Field label={esEditar ? 'Qué resuelve' : 'Qué resuelve *'} value={queResuelve} onChange={setQueResuelve} multiline />

          {/* 6. Dueño */}
          <DuenoComboboxField
            label={esEditar ? 'Dueño' : 'Dueño *'}
            value={dueno}
            onChange={setDueno}
            existentes={props.duenosExistentes ?? []}
            movId={movInicial?.id}
          />
          <div className="space-y-2 -mt-1 pl-1">
            <label className="flex items-center gap-2 cursor-pointer text-[13px] text-foreground/85">
              <input
                type="checkbox"
                checked={duenoEsVacante}
                onChange={(e) => setDuenoEsVacante(e.target.checked)}
                className="w-4 h-4 accent-amber-500 cursor-pointer"
              />
              <span>
                <strong>El puesto está vacante</strong> (hay que cubrirlo antes de arrancar el movimiento)
              </span>
            </label>
            {duenoEsVacante && (
              <div className="ml-6 flex items-center gap-2">
                <label className="text-[12px] text-muted-foreground">
                  Semanas estimadas para cubrirlo:
                </label>
                <input
                  type="number"
                  min={1}
                  max={52}
                  step={1}
                  value={duenoSemanasCobertura}
                  onChange={(e) => setDuenoSemanasCobertura(e.target.value)}
                  className="w-20 rounded-md border border-sidebar-border bg-background px-2 py-1 text-[13px] text-foreground focus:border-primary focus:outline-none"
                />
                <span className="text-[11px] text-muted-foreground/70">
                  ≈ {(() => {
                    const n = parseInt(duenoSemanasCobertura, 10)
                    if (!Number.isFinite(n) || n <= 0) return '?'
                    const meses = (n / 4.33).toFixed(1)
                    return `${meses} ${meses === '1.0' ? 'mes' : 'meses'}`
                  })()}
                </span>
              </div>
            )}
          </div>

          {/* 7. Criterio de éxito */}
          <Field label={esEditar ? 'Criterio de éxito' : 'Criterio de éxito *'} value={criterio} onChange={setCriterio} multiline />

          {/* 8. Duración estimada (el cronograma arranca/termina lo computa el
              sistema en P-4 vía CPM con esta duración + deps + vacancia). */}
          <div className="space-y-1">
            <label className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground/80">
              Duración estimada de ejecución{esEditar ? '' : ' *'}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={36}
                step={1}
                value={duracionMeses}
                onChange={(e) => setDuracionMeses(e.target.value)}
                className="w-24 rounded-md border border-sidebar-border bg-background px-3 py-2 text-[14px] text-foreground focus:border-primary focus:outline-none"
              />
              <span className="text-[13px] text-muted-foreground">
                meses {(() => {
                  const n = parseInt(duracionMeses, 10)
                  if (!Number.isFinite(n) || n <= 0) return ''
                  return n === 1 ? '(≈ 4 sem)' : `(≈ ${Math.round(n * 4.33)} sem)`
                })()}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground/70 leading-snug">
              Cuántos meses te toma EJECUTAR el movimiento, sin contar el tiempo de cubrir la vacancia (si el dueño es vacante, eso se suma aparte). El cronograma (cuándo arranca/termina) se calcula en P-4 según las dependencias y vacancias.
            </p>
          </div>

          {/* 9. Costo */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Costo US$ mín" value={costoMin} onChange={setCostoMin} />
            <Field label="Costo US$ máx" value={costoMax} onChange={setCostoMax} />
          </div>
          <Field label="Costo · nota (opcional)" value={costoNota} onChange={setCostoNota} />

          {/* 10. Esfuerzo + Impacto */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground/80">Esfuerzo (global)</label>
              <div className="inline-flex rounded-md border border-sidebar-border bg-background">
                {(['baja', 'media', 'alta'] as const).map((opt, i) => {
                  const selected = bandaAncha === opt
                  const colorActivo =
                    opt === 'alta'  ? 'bg-red-900/60 text-red-200' :
                    opt === 'media' ? 'bg-yellow-900/60 text-yellow-200' :
                                       'bg-green-900/60 text-green-200'
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setBandaAncha(opt)}
                      className={`px-3 py-1.5 text-[13px] font-medium transition-colors ${
                        selected ? colorActivo : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                      } ${i > 0 ? 'border-l border-sidebar-border' : ''} first:rounded-l-md last:rounded-r-md`}
                    >
                      {opt.charAt(0).toUpperCase() + opt.slice(1)}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground/80">Impacto</label>
              <div className="inline-flex rounded-md border border-sidebar-border bg-background">
                {(['baja', 'media', 'alta'] as const).map((opt, i) => {
                  const selected = impacto === opt
                  // Color inverso al esfuerzo: alto impacto = verde (bueno).
                  const colorActivo =
                    opt === 'alta'  ? 'bg-green-900/60 text-green-200' :
                    opt === 'media' ? 'bg-yellow-900/60 text-yellow-200' :
                                       'bg-red-900/60 text-red-200'
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setImpacto(opt)}
                      className={`px-3 py-1.5 text-[13px] font-medium transition-colors ${
                        selected ? colorActivo : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                      } ${i > 0 ? 'border-l border-sidebar-border' : ''} first:rounded-l-md last:rounded-r-md`}
                    >
                      {opt.charAt(0).toUpperCase() + opt.slice(1)}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {habilitarDeps && movInicial && allMovimientos && (
            <div className="space-y-3 border-t border-sidebar-border pt-4 mt-2">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-wider text-amber-400/90 mb-0.5">
                  Dependencias
                </p>
                <p className="text-[12px] text-muted-foreground/80">
                  Mismas conexiones que el canvas del 3.A.6. Agregar/quitar acá actualiza las flechas del diagrama.
                </p>
              </div>
              {depsError && (
                <div className="rounded-md border border-red-700 bg-red-950/40 px-3 py-1.5 text-[12px] text-red-200">
                  ⚠ {depsError}
                </div>
              )}
              <DepsSection
                titulo="Depende de"
                hint="Movs que tienen que terminar ANTES de este."
                lista={precondsLocal}
                otroLado={desbloqueaLocal}
                movActualId={movInicial.id}
                allMovimientos={allMovimientos}
                popoverAbierto={edgePopoverAbierto?.lista === 'pre' ? edgePopoverAbierto.movId : null}
                onAbrirPopover={(movId) => setEdgePopoverAbierto({ lista: 'pre', movId })}
                onCerrarPopover={() => setEdgePopoverAbierto(null)}
                onAgregar={agregarPrecondicion}
                onQuitar={quitarPrecondicion}
                onActualizarEdge={(movId, patch) => actualizarEdge('pre', movId, patch)}
                cycleCheck={(otherId) => cycleWouldExist(otherId, movInicial.id)}
              />
              <DepsSection
                titulo="Desbloquea"
                hint="Movs que se facilitan/habilitan cuando este TERMINE."
                lista={desbloqueaLocal}
                otroLado={precondsLocal}
                movActualId={movInicial.id}
                allMovimientos={allMovimientos}
                popoverAbierto={edgePopoverAbierto?.lista === 'des' ? edgePopoverAbierto.movId : null}
                onAbrirPopover={(movId) => setEdgePopoverAbierto({ lista: 'des', movId })}
                onCerrarPopover={() => setEdgePopoverAbierto(null)}
                onAgregar={agregarDesbloquea}
                onQuitar={quitarDesbloquea}
                onActualizarEdge={(movId, patch) => actualizarEdge('des', movId, patch)}
                cycleCheck={(otherId) => cycleWouldExist(movInicial.id, otherId)}
              />
            </div>
          )}

        </div>

        <footer className="flex-shrink-0 border-t border-sidebar-border px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {esEditar && (
              <button
                onClick={handleEliminar}
                disabled={saving}
                title="Marcar el movimiento como quitado del inventario. Reversible desde la revisión por categoría."
                className="rounded-md border border-red-800/60 bg-red-950/30 px-3 py-1.5 text-[12px] font-medium text-red-300 hover:bg-red-900/40 hover:text-red-100 hover:border-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                🗑 Eliminar movimiento
              </button>
            )}
            <div className="text-[13px] text-muted-foreground">
              {errorServer ? (
                <span className="text-red-300">⚠ {errorServer}</span>
              ) : !camposOk ? (
                <span className="text-yellow-400">
                  {brechas.length === 0
                    ? 'Falta declarar al menos 1 brecha'
                    : !categoriaFinal
                      ? 'Falta elegir o crear la categoría'
                      : 'Completá todos los campos requeridos (*)'}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onCerrar}
              disabled={saving}
              className="rounded-md px-3 py-2 text-[13px] text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              onClick={handleGuardar}
              disabled={!camposOk || saving}
              className={BTN_CTA}
            >
              {saving
                ? 'Guardando…'
                : esEditar ? 'Guardar cambios' : 'Agregar movimiento'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

// ─── Field component (mismo shape que el de InventarioCategoria) ─────────────

function Field({ label, value, onChange, multiline }: {
  label: string
  value: string
  onChange: (v: string) => void
  multiline?: boolean
}) {
  return (
    <div className="space-y-1">
      <label className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground/80">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-sidebar-border bg-background px-3 py-2 text-[14px] text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-sidebar-border bg-background px-3 py-2 text-[14px] text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
        />
      )}
    </div>
  )
}

// Field con combobox: sugiere dueños ya existentes en el inventario al tipear.
// Previene variantes duplicadas (ej: si ya existe "Lucas Mercado", al tipear
// "Lu" aparece como sugerencia y un click la autocompleta). Permite escribir
// uno nuevo (no fuerza a elegir de la lista).
function DuenoComboboxField({ label, value, onChange, existentes, movId }: {
  label: string
  value: string
  onChange: (v: string) => void
  existentes: string[]
  movId?: string  // si existe, filtramos el dueño actual del mov para no auto-sugerirse a sí mismo
}) {
  const [open, setOpen] = useState(false)
  // Lista ordenada de dueños únicos en el inventario. Excluimos string vacío.
  // movId no se usa directamente — el dueño actual del mov sí queremos en la lista
  // para que el user pueda volver a él fácilmente si lo borra y se arrepiente.
  const opciones = useMemo(() => {
    const set = new Set<string>()
    for (const d of existentes) {
      const trimmed = d.trim()
      if (trimmed) set.add(trimmed)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [existentes])

  const filtradas = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) return opciones
    return opciones.filter(o => o.toLowerCase().includes(q))
  }, [opciones, value])

  // Sugerencia exacta ya presente: si el value matchea (case-insensitive) una
  // opción existente, no mostramos sugerencias (evita ruido visual).
  const hayMatchExacto = useMemo(() => {
    const q = value.trim().toLowerCase()
    return opciones.some(o => o.toLowerCase() === q)
  }, [opciones, value])

  function elegir(opcion: string) {
    onChange(opcion)
    setOpen(false)
  }

  return (
    <div className="space-y-1 relative">
      <label className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground/80">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}  // delay para permitir click en sugerencia
        placeholder={opciones.length > 0 ? 'Empezá a tipear o elegí de la lista…' : ''}
        className="w-full rounded-md border border-sidebar-border bg-background px-3 py-2 text-[14px] text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
      />
      {open && filtradas.length > 0 && !hayMatchExacto && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto rounded-md border border-sidebar-border bg-background shadow-lg">
          {filtradas.slice(0, 10).map(opcion => (
            <button
              key={opcion}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); elegir(opcion) }}
              className="block w-full text-left px-3 py-1.5 text-[13px] text-foreground hover:bg-accent/60 transition-colors"
            >
              {opcion}
            </button>
          ))}
          {filtradas.length > 10 && (
            <div className="px-3 py-1 text-[11px] text-muted-foreground border-t border-sidebar-border">
              +{filtradas.length - 10} más — seguí tipeando para filtrar
            </div>
          )}
        </div>
      )}
      {opciones.length > 0 && !hayMatchExacto && value.trim().length > 0 && (
        <p className="text-[11px] text-muted-foreground/70 mt-0.5">
          Tip: si "{value.trim()}" es la misma persona que una existente, elegí la existente para no duplicar.
        </p>
      )}
    </div>
  )
}

// ─── Sub-componentes: editor de dependencias ─────────────────────────────────
// Una sección renderea una de las dos listas (precondiciones o desbloquea).
// Mismas mecánicas para ambas: chips de movs + buscador + popover por chip.

function DepsSection({
  titulo,
  hint,
  lista,
  otroLado,
  movActualId,
  allMovimientos,
  popoverAbierto,
  onAbrirPopover,
  onCerrarPopover,
  onAgregar,
  onQuitar,
  onActualizarEdge,
  cycleCheck,
}: {
  titulo: string
  hint: string
  lista: EdgeDraft[]
  otroLado: EdgeDraft[]
  movActualId: string
  allMovimientos: MovimientoPE[]
  popoverAbierto: string | null
  onAbrirPopover: (movId: string) => void
  onCerrarPopover: () => void
  onAgregar: (movId: string) => void
  onQuitar: (movId: string) => void
  onActualizarEdge: (movId: string, patch: Partial<EdgeDraft>) => void
  cycleCheck: (otherId: string) => boolean
}) {
  const idsExcluidos = new Set<string>([
    movActualId,
    ...lista.map(e => e.movId),
    ...otroLado.map(e => e.movId),
  ])
  return (
    <div className="space-y-2">
      <div>
        <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground/80">
          {titulo}
        </p>
        <p className="text-[12px] text-muted-foreground/70 italic">{hint}</p>
      </div>
      <div className="flex flex-wrap gap-1.5 min-h-[2rem] p-1.5 rounded-md border border-sidebar-border/40 bg-background/40">
        {lista.length === 0 && (
          <p className="text-[12px] italic text-muted-foreground/60 px-2 py-1">
            Sin movimientos seleccionados.
          </p>
        )}
        {lista.map(edge => {
          const mov = allMovimientos.find(m => m.id === edge.movId)
          return (
            <EdgeChip
              key={edge.movId}
              edge={edge}
              nombre={mov?.nombre ?? '(?)'}
              popoverAbierto={popoverAbierto === edge.movId}
              onAbrirPopover={() => onAbrirPopover(edge.movId)}
              onCerrarPopover={onCerrarPopover}
              onQuitar={() => onQuitar(edge.movId)}
              onActualizar={(patch) => onActualizarEdge(edge.movId, patch)}
            />
          )
        })}
      </div>
      <BuscadorMovs
        allMovimientos={allMovimientos}
        idsExcluidos={idsExcluidos}
        cycleCheck={cycleCheck}
        onAgregar={onAgregar}
      />
    </div>
  )
}

function EdgeChip({
  edge,
  nombre,
  popoverAbierto,
  onAbrirPopover,
  onCerrarPopover,
  onQuitar,
  onActualizar,
}: {
  edge: EdgeDraft
  nombre: string
  popoverAbierto: boolean
  onAbrirPopover: () => void
  onCerrarPopover: () => void
  onQuitar: () => void
  onActualizar: (patch: Partial<EdgeDraft>) => void
}) {
  const chipStyle = edge.tipo === 'fs'
    ? 'bg-purple-700 text-purple-100 border border-purple-400/50 hover:bg-purple-600'
    : edge.tipo === 'ff'
      ? 'bg-purple-800/80 text-purple-100 border border-purple-500/50 hover:bg-purple-700/80'
      : edge.tipo === 'continuo'
        ? 'bg-violet-700 text-violet-50 border border-violet-300/60 hover:bg-violet-600'
        : 'bg-sidebar text-purple-200 border border-purple-500/50 hover:bg-purple-950'
  const chipBase = edge.tipo === 'fs' ? 'FS' : edge.tipo === 'ff' ? 'FF' : edge.tipo === 'continuo' ? 'Cont' : 'Sug'
  const chipLag = edge.tipo !== 'sugerida' && (edge.lagMeses ?? 0) > 0 ? `+${edge.lagMeses}` : ''
  const chipLabel = `${chipBase}${chipLag}`
  return (
    <div className="relative inline-flex items-center gap-1.5 rounded-md border border-sidebar-border bg-background/80 pl-2 pr-1 py-1 text-[12px] max-w-[320px]">
      <span className="font-mono text-muted-foreground/80 flex-shrink-0">{edge.movId}</span>
      <span className="truncate">{nombre}</span>
      <button
        type="button"
        onClick={onAbrirPopover}
        title={edge.razonamiento ? `Razonamiento: ${edge.razonamiento}` : 'Click para editar tipo o razonamiento'}
        className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[12px] font-bold uppercase tracking-wider transition-colors ${chipStyle}`}
      >
        {chipLabel}
      </button>
      <button
        type="button"
        onClick={onQuitar}
        aria-label="Quitar dependencia"
        title="Quitar"
        className="flex-shrink-0 text-muted-foreground/70 hover:text-red-300 hover:bg-red-950/40 rounded px-1 text-[12px] leading-none"
      >
        ×
      </button>
      {popoverAbierto && (
        <EdgePopover
          edge={edge}
          onActualizar={onActualizar}
          onCerrar={onCerrarPopover}
        />
      )}
    </div>
  )
}

function EdgePopover({
  edge,
  onActualizar,
  onCerrar,
}: {
  edge: EdgeDraft
  onActualizar: (patch: Partial<EdgeDraft>) => void
  onCerrar: () => void
}) {
  const [tipoDraft, setTipoDraft] = useState(edge.tipo)
  const [razonDraft, setRazonDraft] = useState(edge.razonamiento)
  const [lagDraft, setLagDraft] = useState<number>(edge.lagMeses ?? 0)
  return (
    <div
      className="absolute left-0 top-full mt-1.5 z-30 w-[280px] rounded-lg border border-sidebar-border bg-background shadow-2xl p-2 space-y-2"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setTipoDraft('sugerida')}
          title="Solo orden ideal. No empuja el schedule."
          className={`w-full rounded-md px-2 py-1.5 text-left text-[12px] transition-colors ${
            tipoDraft === 'sugerida'
              ? 'bg-purple-950/80 text-purple-100 border border-purple-500'
              : 'border border-sidebar-border text-muted-foreground hover:bg-accent/40'
          }`}
        >
          <div className="font-bold uppercase tracking-wider">Sugerida</div>
          <div className="text-[11px] font-normal opacity-80">Solo orden ideal · no condiciona el schedule</div>
        </button>
        <button
          type="button"
          onClick={() => setTipoDraft('ff')}
          title="Finish-to-Finish: A debe terminar para que B pueda CERRAR. B puede arrancar en paralelo."
          className={`w-full rounded-md px-2 py-1.5 text-left text-[12px] transition-colors ${
            tipoDraft === 'ff'
              ? 'bg-purple-800/80 text-purple-100 border border-purple-500'
              : 'border border-sidebar-border text-muted-foreground hover:bg-accent/40'
          }`}
        >
          <div className="font-bold uppercase tracking-wider">FF — Finish to Finish</div>
          <div className="text-[11px] font-normal opacity-80">A debe terminar para que B pueda CERRAR (B puede arrancar en paralelo)</div>
        </button>
        <button
          type="button"
          onClick={() => setTipoDraft('fs')}
          title="Finish-to-Start: A debe terminar para que B pueda ARRANCAR. Estricto."
          className={`w-full rounded-md px-2 py-1.5 text-left text-[12px] transition-colors ${
            tipoDraft === 'fs'
              ? 'bg-purple-700 text-purple-100 border border-purple-400'
              : 'border border-sidebar-border text-muted-foreground hover:bg-accent/40'
          }`}
        >
          <div className="font-bold uppercase tracking-wider">FS — Finish to Start</div>
          <div className="text-[11px] font-normal opacity-80">A debe terminar para que B pueda ARRANCAR (estricto)</div>
        </button>
        <button
          type="button"
          onClick={() => setTipoDraft('continuo')}
          title="Continuo: B arranca y cierra N meses después que A. Útil para flujos paralelos desfasados (mientras A genera, B implementa al ritmo)."
          className={`w-full rounded-md px-2 py-1.5 text-left text-[12px] transition-colors ${
            tipoDraft === 'continuo'
              ? 'bg-violet-700 text-violet-50 border border-violet-300'
              : 'border border-sidebar-border text-muted-foreground hover:bg-accent/40'
          }`}
        >
          <div className="font-bold uppercase tracking-wider">Continuo — Paralelo desfasado</div>
          <div className="text-[11px] font-normal opacity-80">B trails A · arranque y cierre con lag</div>
        </button>
      </div>
      {tipoDraft !== 'sugerida' && (
        <div className="flex items-center gap-2 pt-1">
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground/80">
            Lag (meses)
          </label>
          <input
            type="number"
            min={0}
            step={1}
            value={lagDraft}
            onChange={(e) => setLagDraft(Number(e.target.value) || 0)}
            className="w-16 rounded-md border border-sidebar-border bg-background px-2 py-1 text-[12px] text-foreground focus:border-primary focus:outline-none"
          />
        </div>
      )}
      <textarea
        value={razonDraft}
        onChange={(e) => setRazonDraft(e.target.value)}
        rows={3}
        placeholder="Razonamiento de la dependencia (opcional)…"
        className="w-full rounded-md border border-sidebar-border bg-background px-2 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
      />
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={onCerrar}
          className="rounded-md px-2 py-1 text-[12px] text-muted-foreground hover:bg-accent/50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => {
            const lagAEmitir = tipoDraft === 'sugerida' ? 0 : Math.max(0, Math.floor(lagDraft))
            onActualizar({ tipo: tipoDraft, razonamiento: razonDraft, lagMeses: lagAEmitir })
            onCerrar()
          }}
          className={BTN_CTA_SM}
        >
          Guardar
        </button>
      </div>
    </div>
  )
}

function BuscadorMovs({
  allMovimientos,
  idsExcluidos,
  cycleCheck,
  onAgregar,
}: {
  allMovimientos: MovimientoPE[]
  idsExcluidos: Set<string>
  cycleCheck: (otherId: string) => boolean
  onAgregar: (movId: string) => void
}) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const candidatos = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allMovimientos
      .filter(m =>
        m.estado_usuario !== 'quitado' &&
        !idsExcluidos.has(m.id) &&
        (q === '' || m.id.toLowerCase().includes(q) || m.nombre.toLowerCase().includes(q)),
      )
      .slice(0, 8)
  }, [query, allMovimientos, idsExcluidos])

  // Cuando el input está focuseado, trackeamos su rect en viewport coords para
  // posicionar el dropdown vía portal a document.body. Eso evita que el footer
  // del modal (sticky bottom) o el overflow-y-auto del scroll container lo
  // clipeen. Re-computamos en scroll/resize.
  useEffect(() => {
    if (!focused || !inputRef.current) return
    const updateRect = () => {
      if (inputRef.current) setRect(inputRef.current.getBoundingClientRect())
    }
    updateRect()
    // Listener en fase capture: agarra scrolls de cualquier ancestor (modal,
    // body) — sino el dropdown queda desincronizado al scrollear el form.
    window.addEventListener('scroll', updateRect, true)
    window.addEventListener('resize', updateRect)
    return () => {
      window.removeEventListener('scroll', updateRect, true)
      window.removeEventListener('resize', updateRect)
    }
  }, [focused])

  // Decidir si el dropdown va abajo (default) o arriba (si no entra abajo).
  // Heurística: si la altura disponible debajo del input es menor que la del
  // dropdown estimado (~210px), lo flip-eamos hacia arriba.
  const DROPDOWN_HEIGHT_EST = 210
  const flipUp = !!rect && (window.innerHeight - rect.bottom < DROPDOWN_HEIGHT_EST) && (rect.top > DROPDOWN_HEIGHT_EST)

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 200)}
        placeholder="🔍 Buscar movimiento por ID o nombre…"
        className="w-full rounded-md border border-sidebar-border bg-background px-2 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
      />
      {focused && candidatos.length > 0 && rect && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed',
            top: flipUp ? Math.max(8, rect.top - DROPDOWN_HEIGHT_EST - 4) : rect.bottom + 4,
            left: rect.left,
            width: rect.width,
            maxHeight: DROPDOWN_HEIGHT_EST,
            zIndex: 1000,
          }}
          className="overflow-y-auto rounded-md border border-sidebar-border bg-background shadow-xl"
        >
          {candidatos.map(m => {
            const ciclo = cycleCheck(m.id)
            return (
              <button
                key={m.id}
                type="button"
                disabled={ciclo}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onAgregar(m.id); setQuery('') }}
                title={ciclo ? 'Agregar este mov crearía un ciclo' : undefined}
                className={`w-full text-left px-2 py-1.5 text-[12px] transition-colors ${
                  ciclo
                    ? 'opacity-40 cursor-not-allowed text-muted-foreground'
                    : 'hover:bg-accent/50 text-foreground'
                }`}
              >
                <span className="font-mono text-muted-foreground/80">{m.id}</span>{' '}
                {m.nombre}
                {ciclo && <span className="ml-2 text-[12px] text-red-400/80">· ciclo</span>}
              </button>
            )
          })}
        </div>,
        document.body,
      )}
    </div>
  )
}
