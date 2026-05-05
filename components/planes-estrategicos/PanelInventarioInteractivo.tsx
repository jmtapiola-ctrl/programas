'use client'

// Shell del Panel Interactivo de Fichas (Fase D Chunk A).
// Recibe la pregunta actual sin respuesta_estructurada + el inventario.
// Switch sobre modo_interaccion → renderiza el sub-componente correspondiente.
// Footer: respeta restriccion_minima/maxima del modelo (Ajuste 2 de Juan).

import { useState, useEffect } from 'react'
import type { MovimientoPE, PalancaQAPE, EstresQAPE, RespuestaEstructurada } from '@/lib/types'
import { ModoSeleccionUnica, buildRespuesta_seleccionUnica, isCompleto_seleccionUnica } from './fichas/ModoSeleccionUnica'
import { ModoSeleccionMultipleRanked, buildRespuesta_seleccionRanked, isCompleto_seleccionRanked } from './fichas/ModoSeleccionMultipleRanked'
import { ModoAgrupacionPares, buildRespuesta_agrupacionPares, isCompleto_agrupacionPares } from './fichas/ModoAgrupacionPares'
import { ModoSecuenciacion, buildRespuesta_secuenciacion, isCompleto_secuenciacion } from './fichas/ModoSecuenciacion'
import { ModoMarcadoSimple, buildRespuesta_marcadoSimple, isCompleto_marcadoSimple } from './fichas/ModoMarcadoSimple'

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
}

export function PanelInventarioInteractivo({ pregunta, movimientos, onConfirmar, saving }: Props) {
  // Filtrar movimientos quitados — no se muestran en el panel.
  const movsActivos = movimientos.filter(m => m.estado_usuario !== 'quitado')

  // Si la pregunta NO tiene modo de interacción (caso edge Ajuste 4), el padre
  // no debería renderizar este componente. Defensiva: log + return null.
  if (!pregunta.modo_interaccion) {
    console.warn('[PanelInventarioInteractivo] pregunta sin modo_interaccion — no se renderiza panel.')
    return null
  }

  const modo = pregunta.modo_interaccion
  const campos = pregunta.campos_a_mostrar ?? ['nombre', 'que_resuelve', 'banda_ancha', 'dueno']

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

  // Hidratar state desde respuesta_estructurada si ya existe (ej. al volver
  // a sesión con respuesta ya persistida — no debería pasar normalmente
  // porque el padre solo nos pasa preguntas sin respuesta, pero defensivo).
  useEffect(() => {
    const re = pregunta.respuesta_estructurada
    if (!re) return
    if (re.modo === 'seleccion_unica') setSeleccionUnica(re.movimiento_id)
    if (re.modo === 'seleccion_multiple_ranked') {
      const sorted = [...re.ranking].sort((a, b) => a.posicion - b.posicion)
      setRanking(sorted.map(r => r.movimiento_id))
    }
    if (re.modo === 'agrupacion_pares') setPares(re.pares)
    if (re.modo === 'secuenciacion') setFases(re.fases)
    if (re.modo === 'marcado_simple') setMarcados(re.marcados)
  }, [pregunta.respuesta_estructurada])

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
      {/* Header */}
      <header className="flex-shrink-0 border-b border-sidebar-border px-4 py-3 bg-sidebar/30">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-1">
          Panel interactivo · {pregunta.id}
        </p>
        <p className="text-[14px] text-foreground leading-snug font-medium">{pregunta.pregunta}</p>
        {pregunta.instruccion_panel && (
          <p className="mt-2 text-[12px] text-amber-300 italic leading-relaxed">
            💡 {pregunta.instruccion_panel}
          </p>
        )}
        <div className="mt-2 flex items-center gap-2 text-[10px]">
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

      {/* Cuerpo: el componente de modo */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {modo === 'seleccion_unica' && (
          <ModoSeleccionUnica
            movimientos={movsActivos}
            campos={campos}
            seleccionado={seleccionUnica}
            onChange={setSeleccionUnica}
          />
        )}
        {modo === 'seleccion_multiple_ranked' && (
          <ModoSeleccionMultipleRanked
            movimientos={movsActivos}
            campos={campos}
            ranking={ranking}
            onChange={setRanking}
            restriccionMinima={min}
            restriccionMaxima={max}
          />
        )}
        {modo === 'agrupacion_pares' && (
          <ModoAgrupacionPares
            movimientos={movsActivos}
            campos={campos}
            pares={pares}
            onChange={setPares}
          />
        )}
        {modo === 'secuenciacion' && (
          <ModoSecuenciacion
            movimientos={movsActivos}
            campos={campos}
            fases={fases}
            onChange={setFases}
          />
        )}
        {modo === 'marcado_simple' && (
          <ModoMarcadoSimple
            movimientos={movsActivos}
            campos={campos}
            marcados={marcados}
            onChange={setMarcados}
            restriccionMaxima={max}
          />
        )}
      </div>

      {/* Footer */}
      <footer className="flex-shrink-0 border-t border-sidebar-border px-4 py-3 flex items-center justify-between gap-3 bg-sidebar/30">
        <p className="text-[12px] text-muted-foreground">{resumen}</p>
        <button
          onClick={handleConfirmar}
          disabled={!completo || saving}
          className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Guardando…' : 'Confirmar selección →'}
        </button>
      </footer>
    </div>
  )
}
