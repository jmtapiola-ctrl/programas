'use client'

// Shell del Panel Interactivo de Fichas (Fase D Chunk A).
// Recibe la pregunta actual sin respuesta_estructurada + el inventario.
// Switch sobre modo_interaccion → renderiza el sub-componente correspondiente.
// Footer: respeta restriccion_minima/maxima del modelo (Ajuste 2 de Juan).

import { BTN_CTA } from '@/components/ui/button-styles'
import { useState, useEffect } from 'react'
import type { MovimientoPE, PalancaQAPE, EstresQAPE, RespuestaEstructurada, InventarioPE } from '@/lib/types'
import { ModoSeleccionUnica, buildRespuesta_seleccionUnica, isCompleto_seleccionUnica } from './fichas/ModoSeleccionUnica'
import { ModoSeleccionMultipleRanked, buildRespuesta_seleccionRanked, isCompleto_seleccionRanked } from './fichas/ModoSeleccionMultipleRanked'
import { ModoAgrupacionPares, buildRespuesta_agrupacionPares, isCompleto_agrupacionPares } from './fichas/ModoAgrupacionPares'
import { ModoSecuenciacion, buildRespuesta_secuenciacion, isCompleto_secuenciacion } from './fichas/ModoSecuenciacion'
import { FasesCanvasP4 } from './FasesCanvasP4'
import { ModoMarcadoSimple, buildRespuesta_marcadoSimple, isCompleto_marcadoSimple } from './fichas/ModoMarcadoSimple'
import type { GestionInventario } from './fichas/FichaMovimiento'

type Pregunta = PalancaQAPE | EstresQAPE

interface Props {
  pregunta: Pregunta
  // Inventario de movimientos del Paso 3.A. Filtra los quitados — el panel
  // solo muestra movimientos vivos del plan.
  movimientos: MovimientoPE[]
  // Callback cuando el usuario clickea "Confirmar selección":
  // recibe la respuesta_estructurada serializada según el modo.
  // El padre se encarga de PATCH /respuesta-estructurada y bloqueo del panel.
  onConfirmar: (respuesta: RespuestaEstructurada) => void
  // saving: el padre lo setea en true mientras hace el PATCH.
  saving?: boolean
  // Mejora 2 — gestión de inventario durante 3.B/3.C/3.D.
  // Si el padre pasa `gestion`, las fichas muestran botones overlay Editar/Quitar
  // y badges NUEVO/MODIFICADO. Si pasa `onAgregarMovimiento`, el header muestra
  // un botón "+ Agregar movimiento". Ambos son opcionales (back-compat).
  gestion?: GestionInventario
  onAgregarMovimiento?: () => void
  // planId requerido cuando la pregunta usa el canvas DAG (P-4) para hacer
  // la llamada al endpoint de sugerencias. Opcional para mantener back-compat.
  planId?: string
  // Callback que recibe el inventario actualizado cuando un sub-feature del
  // panel muta el inventario (ej: unificación de dueños en P-4). El parent
  // lo usa para hacer setPlan con el nuevo inventario.
  onInventarioUpdate?: (inv: InventarioPE) => void
  // Trigger del MovimientoFormModal en modo editar para un mov del canvas
  // P-4. El parent (entrevista/page.tsx) maneja el state del modal.
  onVerDetalleMov?: (movId: string) => void
  // Firma del set de dueños revisada por última vez en P-4 (UnificarDuenos).
  // Solo se usa en P-4 — el canvas la consume para skipear el modal cuando
  // el set actual coincide con el último revisado.
  duenosRevisadosSignature?: string
}

export function PanelInventarioInteractivo({ pregunta, movimientos, onConfirmar, saving, gestion, onAgregarMovimiento, planId, onInventarioUpdate, onVerDetalleMov, duenosRevisadosSignature }: Props) {
  // Filtrar movimientos quitados — no se muestran en el panel.
  const movsActivos = movimientos.filter(m => m.estado_usuario !== 'quitado')

  // Modo efectivo de la pregunta. Caso normal: viene de modo_interaccion
  // emitido por el modelo cuando creó la pregunta. Caso recuperación: si el
  // modelo re-emitió la pregunta con la misma id y sin metadata del panel
  // (bug histórico de mergePalancas pre-fix), modo_interaccion puede estar
  // perdido pero respuesta_estructurada.modo sobrevive — lo usamos como
  // fallback para que el panel se siga renderizando con los marcados del user.
  const modo = pregunta.modo_interaccion ?? pregunta.respuesta_estructurada?.modo
  if (!modo) {
    console.warn('[PanelInventarioInteractivo] pregunta sin modo_interaccion ni respuesta_estructurada — no se renderiza panel.')
    return null
  }

  // Override de campos_a_mostrar emitido por el modelo: el usuario pidió
  // panel uniforme y compacto — solo nombre + chip de impacto en TODAS las
  // fichas (no solo las seleccionadas). Aplica a 3.B y 3.D igualmente.
  // Se ignora pregunta.campos_a_mostrar a propósito.
  const campos: typeof pregunta.campos_a_mostrar = ['nombre', 'impacto']

  // Buscador del panel — filtra fichas por nombre (case-insensitive substring).
  // Aplica a TODOS los modos. Sticky en el header del scroll area para que
  // siga visible cuando el user scrollea entre muchos movs.
  const [filtro, setFiltro] = useState('')
  const movsFiltrados = filtro.trim()
    ? movsActivos.filter(m => {
        const q = filtro.trim().toLowerCase()
        return m.nombre.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
      })
    : movsActivos

  // State local de la respuesta-en-construcción según el modo
  const [seleccionUnica, setSeleccionUnica] = useState<string | null>(null)
  const [ranking, setRanking] = useState<string[]>([])
  const [pares, setPares] = useState<Array<{ desde: string; hacia: string }>>([])
  const [fases, setFases] = useState<Array<{ fase: string; movimientos: string[] }>>([])
  const [marcados, setMarcados] = useState<string[]>([])

  // Reset state cuando cambia la pregunta (el modelo emitió una nueva)
  useEffect(() => {
    setSeleccionUnica(null)
    setRanking([])
    setPares([])
    setFases([])
    setMarcados([])
  }, [pregunta.id])

  // Hidratar state desde respuesta_estructurada si ya existe, o pre-cargar
  // desde el inventario si la pregunta es de agrupacion_pares y no hay
  // respuesta guardada todavía (las precondiciones declaradas en 3.A.6 son
  // pares válidos: B.precondiciones[A] ≡ par A→B).
  useEffect(() => {
    const re = pregunta.respuesta_estructurada
    if (re) {
      if (re.modo === 'seleccion_unica') setSeleccionUnica(re.movimiento_id)
      if (re.modo === 'seleccion_multiple_ranked') {
        const sorted = [...re.ranking].sort((a, b) => a.posicion - b.posicion)
        setRanking(sorted.map(r => r.movimiento_id))
      }
      if (re.modo === 'agrupacion_pares') setPares(re.pares)
      if (re.modo === 'secuenciacion') setFases(re.fases)
      if (re.modo === 'marcado_simple') setMarcados(re.marcados)
    } else if (modo === 'agrupacion_pares') {
      // Sin respuesta previa Y modo de pares: pre-cargar desde precondiciones
      // del inventario. El usuario arranca con todo lo declarado en 3.A.6.
      const inicial: Array<{ desde: string; hacia: string }> = []
      const idsActivos = new Set(movsActivos.map(m => m.id))
      for (const mov of movsActivos) {
        for (const precondId of mov.precondiciones ?? []) {
          if (idsActivos.has(precondId)) {
            inicial.push({ desde: precondId, hacia: mov.id })
          }
        }
      }
      setPares(inicial)
    }
    // pregunta.id es la dependencia real — al cambiar de pregunta, re-hidrata.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pregunta.respuesta_estructurada, pregunta.id, modo])

  // Calcular si está completo según el modo + restricciones
  const min = pregunta.restriccion_minima
  const max = pregunta.restriccion_maxima
  let completo = false
  let resumen = ''
  switch (modo) {
    case 'seleccion_unica':
      completo = isCompleto_seleccionUnica(seleccionUnica)
      resumen = completo ? `Elegiste ${seleccionUnica}` : 'Elegí 1 ficha'
      break
    case 'seleccion_multiple_ranked':
      completo = isCompleto_seleccionRanked(ranking, min, max)
      resumen = completo
        ? `Ranked ${ranking.length}${max ? `/${max}` : ''}`
        : `Faltan ${(min ?? 1) - ranking.length} ficha(s)`
      break
    case 'agrupacion_pares':
      completo = isCompleto_agrupacionPares(pares, min, max)
      resumen = completo ? `${pares.length} par(es) creado(s)` : 'Creá al menos 1 par'
      break
    case 'secuenciacion':
      completo = isCompleto_secuenciacion(fases, movsActivos)
      resumen = completo ? 'Todos los movimientos clasificados' : 'Asigná todos los movimientos a una fase'
      break
    case 'marcado_simple':
      completo = isCompleto_marcadoSimple(marcados, min, max)
      resumen = `${marcados.length} marcado(s)`
      break
  }

  function handleConfirmar() {
    let resp: RespuestaEstructurada | null = null
    switch (modo) {
      case 'seleccion_unica':
        resp = buildRespuesta_seleccionUnica(seleccionUnica)
        break
      case 'seleccion_multiple_ranked':
        resp = buildRespuesta_seleccionRanked(ranking)
        break
      case 'agrupacion_pares':
        resp = buildRespuesta_agrupacionPares(pares)
        break
      case 'secuenciacion':
        resp = buildRespuesta_secuenciacion(fases)
        break
      case 'marcado_simple':
        resp = buildRespuesta_marcadoSimple(marcados)
        break
    }
    if (resp) onConfirmar(resp)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header + cuerpo van DENTRO del mismo overflow-y-auto: cuando el user
          hace scroll para ver más movs, la pregunta scrollea con ellos y
          libera espacio vertical. Solo el footer queda sticky. */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <header className="mb-3 pb-3 border-b border-sidebar-border">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-1">
                Panel interactivo · {pregunta.id}
              </p>
              <p className="text-[14px] text-foreground leading-snug font-medium">{pregunta.pregunta}</p>
            </div>
            {/* Botón "+ Agregar movimiento" — solo si el padre lo habilitó (Mejora 2). */}
            {onAgregarMovimiento && (
              <button
                type="button"
                onClick={onAgregarMovimiento}
                title="Agregar un movimiento al inventario"
                className="flex-shrink-0 rounded-lg border border-emerald-700/70 bg-emerald-950/30 hover:bg-emerald-900/50 px-2.5 py-1 text-[12px] font-semibold text-emerald-200 hover:text-emerald-50 transition-colors"
              >
                + Agregar mov.
              </button>
            )}
          </div>
          {pregunta.instruccion_panel && (
            <p className="mt-2 text-[12px] text-amber-300 italic leading-relaxed">
              💡 {pregunta.instruccion_panel}
            </p>
          )}
          <div className="mt-2 flex items-center gap-2 text-[12px]">
            <span className="rounded-full bg-blue-950/50 border border-blue-800/50 px-2 py-0.5 uppercase tracking-wider text-blue-300">
              modo: {modo.replace(/_/g, ' ')}
            </span>
            {(min !== undefined || max !== undefined) && (
              <span className="text-muted-foreground">
                {min !== undefined && max !== undefined && min === max && `exacto: ${min}`}
                {min !== undefined && max !== undefined && min !== max && `min ${min} · max ${max}`}
                {min !== undefined && max === undefined && `min ${min}`}
                {min === undefined && max !== undefined && `max ${max}`}
              </span>
            )}
          </div>
        </header>

        {/* Buscador sticky — filtra los movs visibles en el modo. */}
        <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-background border-b border-sidebar-border/40 mb-3">
          <div className="relative">
            <input
              type="text"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="🔍 Buscar movimientos por nombre o id…"
              className="w-full rounded-md border border-sidebar-border bg-sidebar/30 px-3 py-1.5 pr-12 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary"
            />
            {filtro && (
              <button
                onClick={() => setFiltro('')}
                aria-label="Limpiar filtro"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-[12px] px-1"
              >
                ✕
              </button>
            )}
          </div>
          {filtro.trim() && (
            <p className="text-[11px] text-muted-foreground mt-1">
              Mostrando <strong className="text-foreground">{movsFiltrados.length}</strong> de {movsActivos.length} movimientos
            </p>
          )}
        </div>

        {/* Cuerpo: el componente de modo (recibe movs filtrados) */}
        {modo === 'seleccion_unica' && (
          <ModoSeleccionUnica
            movimientos={movsFiltrados}
            campos={campos}
            seleccionado={seleccionUnica}
            onChange={setSeleccionUnica}
            gestion={gestion}
          />
        )}
        {modo === 'seleccion_multiple_ranked' && (
          <ModoSeleccionMultipleRanked
            movimientos={movsFiltrados}
            campos={campos}
            ranking={ranking}
            onChange={setRanking}
            restriccionMinima={min}
            restriccionMaxima={max}
            gestion={gestion}
          />
        )}
        {modo === 'agrupacion_pares' && (
          <ModoAgrupacionPares
            movimientos={movsFiltrados}
            todosLosMovimientos={movsActivos}
            campos={campos}
            pares={pares}
            onChange={setPares}
            gestion={gestion}
          />
        )}
        {modo === 'secuenciacion' && (
          // P-4 (pregunta principal 4 del 3.B): reutiliza el canvas DAG del
          // 3.A.6 con Y = fases temporales (Q2/Q3/Q4) y sugerencia AI.
          // Otras preguntas con modo='secuenciacion' siguen usando el
          // drag-drop de columnas clásico.
          pregunta.id === 'P-4' && planId ? (
            <FasesCanvasP4
              movimientos={movsActivos}
              fases={fases}
              onChange={setFases}
              planId={planId}
              pregunta={pregunta}
              duenosRevisadosSignature={duenosRevisadosSignature}
              onInventarioUpdate={onInventarioUpdate}
              onVerDetalleMov={onVerDetalleMov}
            />
          ) : (
            <ModoSecuenciacion
              movimientos={movsFiltrados}
              campos={campos}
              fases={fases}
              onChange={setFases}
              gestion={gestion}
            />
          )
        )}
        {modo === 'marcado_simple' && (
          <ModoMarcadoSimple
            movimientos={movsFiltrados}
            campos={campos}
            marcados={marcados}
            onChange={setMarcados}
            restriccionMaxima={max}
            gestion={gestion}
          />
        )}
      </div>

      {/* Footer.
          Si pregunta.respuesta_estructurada ya existe, el user ya confirmó al
          menos una vez. El botón cambia a "Actualizar selección" para indicar
          que un click va a sobreescribir lo persistido. Mejora 1 — Juan pidió
          que el panel persista post-Confirmar y permita cambios. */}
      <footer className="flex-shrink-0 border-t border-sidebar-border px-4 py-3 flex items-center justify-between gap-3 bg-sidebar/30">
        <div className="flex flex-col gap-0.5 min-w-0">
          <p className="text-[12px] text-muted-foreground truncate">{resumen}</p>
          {pregunta.respuesta_estructurada && (
            <p className="text-[12px] text-green-400/80 italic">✓ Ya guardado · podés cambiar y re-confirmar</p>
          )}
        </div>
        <button
          onClick={handleConfirmar}
          disabled={!completo || saving}
          className={`${BTN_CTA} flex-shrink-0`}
        >
          {saving
            ? 'Guardando…'
            : pregunta.respuesta_estructurada
              ? 'Actualizar selección →'
              : 'Confirmar selección →'}
        </button>
      </footer>
    </div>
  )
}
