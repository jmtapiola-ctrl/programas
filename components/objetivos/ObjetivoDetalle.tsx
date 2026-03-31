'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Textarea, Select } from '@/components/ui/Input'
import { Temporizadores } from '@/components/ui/Temporizadores'
import type { Objetivo, Cumplimiento, LogEvento, Usuario, Programa } from '@/lib/types'
import { TOOLTIP_TIPOS, isVencido, CAUSAS_DESATORAMIENTO, esOficialDelPrograma } from '@/lib/types'

interface Props {
  objetivo: Objetivo
  programa: Programa | null
  cumplimientos: Cumplimiento[]
  log: LogEvento[]
  usuariosMap: Record<string, Usuario>
  userId: string
  isEjecutivo: boolean
  aprobadorEfectivo: string | undefined
}

const EVENTO_COLOR_NEUTRO = 'bg-card border-border text-muted-foreground'

function parsearNotasModificacion(notas: string) {
  const justIdx = notas.indexOf('Justificación:')
  const propIdx = notas.indexOf('Propuesta:')
  const justificacion = justIdx >= 0
    ? notas.slice(justIdx + 'Justificación:'.length, propIdx >= 0 ? propIdx : undefined).trim()
    : ''
  const propuesta = propIdx >= 0
    ? notas.slice(propIdx + 'Propuesta:'.length).trim()
    : ''
  return { justificacion, propuesta }
}

export function ObjetivoDetalle({
  objetivo,
  programa,
  cumplimientos,
  log,
  usuariosMap,
  userId,
  isEjecutivo,
  aprobadorEfectivo,
}: Props) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modalActivo, setModalActivo] = useState<string | null>(null)
  const [textoModal, setTextoModal] = useState('')
  const [texto2Modal, setTexto2Modal] = useState('')
  const [cumplimientoSeleccionado, setCumplimientoSeleccionado] = useState<string | null>(null)
  const [causeDesatoramiento, setCauseDesatoramiento] = useState<string>(CAUSAS_DESATORAMIENTO[0])
  const [usuarioSeleccionado, setUsuarioSeleccionado] = useState('')
  // Modification modal state
  const [textoFinalMod, setTextoFinalMod] = useState('')
  const [rechazandoMod, setRechazandoMod] = useState(false)
  const [motivoRechazoMod, setMotivoRechazoMod] = useState('')
  // Rechazo de objetivo modal state
  const [respuestaRechazo, setRespuestaRechazo] = useState('')
  // Edit mode state
  const [modoEdicion, setModoEdicion] = useState(false)
  const [problemaGemini, setProblemaGemini] = useState<string | null>(null)
  const [reescrituraGemini, setReescrituraGemini] = useState<string | null>(null)
  const [sugerenciaGemini, setSugerenciaGemini] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    nombre: objetivo.nombre,
    tipo: objetivo.tipo as string,
    descripcionDoingness: objetivo.descripcionDoingness,
    fechaLimite: objetivo.fechaLimite ?? '',
    responsableId: objetivo.responsableId,
    aprobadorId: objetivo.aprobadorId ?? programa?.aprobadorId ?? '',
    esRepetible: objetivo.esRepetible,
    notas: objetivo.notas ?? '',
  })
  const [, startTransition] = useTransition()
  const router = useRouter()

  const esAprobador = userId === aprobadorEfectivo
  const esResponsable = userId === objetivo.responsableId
  const puedeEditar = isEjecutivo || (programa ? esOficialDelPrograma(userId, programa) : false)
  const estadosTerminales = ['Completado', 'Cancelado', 'Incumplido']
  const vencido = isVencido(objetivo)
  const isCriticoIncumplido = (objetivo.tipo === 'Primario' || objetivo.tipo === 'Vital') && objetivo.estado === 'Incumplido'

  const cumplimientoPendiente = cumplimientos.find(c => !c.aprobado && !c.rechazado)

  // Last modification request from log
  const ultimaModSolicitada = [...log].reverse().find(e => e.tipoEvento === 'Modificación Solicitada')
  // Last objective rejection from log
  const ultimoRechazo = [...log].reverse().find(e => e.tipoEvento === 'Objetivo Rechazado')

  // Clarificación pendiente: hay al menos una solicitada y la última de clarificación no es una respuesta
  const eventosClari = log
    .filter(e => e.tipoEvento === 'Clarificación Solicitada' || e.tipoEvento === 'Clarificación Respondida')
    .sort((a, b) => new Date(a.fechaYHora ?? '').getTime() - new Date(b.fechaYHora ?? '').getTime())
  const hayClarificacionPendiente =
    eventosClari.length > 0 &&
    eventosClari[eventosClari.length - 1].tipoEvento === 'Clarificación Solicitada'

  async function ejecutarAccion(accion: string, datos?: Record<string, any>) {
    setPending(true)
    try {
      const res = await fetch(`/api/objetivos/${objetivo.id}/accion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion, datos }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Error desconocido')
        return
      }
      setError(null)
      startTransition(() => { router.refresh() })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setPending(false)
      setModalActivo(null)
      setTextoModal('')
      setTexto2Modal('')
      setTextoFinalMod('')
      setRechazandoMod(false)
      setMotivoRechazoMod('')
      setRespuestaRechazo('')
    }
  }

  function abrirModal(nombre: string) {
    setTextoModal('')
    setTexto2Modal('')
    setError(null)
    setModalActivo(nombre)
  }

  function abrirModalVerModificacion() {
    const propuesta = ultimaModSolicitada?.notas
      ? parsearNotasModificacion(ultimaModSolicitada.notas).propuesta
      : ''
    setTextoFinalMod(propuesta)
    setRechazandoMod(false)
    setMotivoRechazoMod('')
    setError(null)
    setModalActivo('ver_modificacion')
  }

  function entrarModoEdicion() {
    setEditForm({
      nombre: objetivo.nombre,
      tipo: objetivo.tipo,
      descripcionDoingness: objetivo.descripcionDoingness,
      fechaLimite: objetivo.fechaLimite ?? '',
      responsableId: objetivo.responsableId,
      aprobadorId: objetivo.aprobadorId ?? programa?.aprobadorId ?? '',
      esRepetible: objetivo.esRepetible,
      notas: objetivo.notas ?? '',
    })
    setError(null)
    setProblemaGemini(null)
    setReescrituraGemini(null)
    setSugerenciaGemini(null)
    setModoEdicion(true)
  }

  async function doGuardar(descripcionFinal: string) {
    try {
      const res = await fetch(`/api/objetivos/${objetivo.id}/accion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'editar_objetivo', datos: { ...editForm, descripcionDoingness: descripcionFinal } }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error desconocido'); return }
      setModoEdicion(false)
      startTransition(() => { router.refresh() })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setPending(false)
    }
  }

  async function guardarEdicion() {
    if (!editForm.nombre.trim()) { setError('El nombre no puede estar vacío'); return }
    if (!editForm.descripcionDoingness.trim()) { setError('La descripción no puede estar vacía'); return }
    setPending(true)
    setError(null)
    // Si ya hay feedback visible, el usuario eligió guardar igual
    if (problemaGemini || sugerenciaGemini) {
      await doGuardar(editForm.descripcionDoingness)
      return
    }
    setProblemaGemini(null)
    setReescrituraGemini(null)
    setSugerenciaGemini(null)
    // Validar con Gemini antes de guardar
    try {
      const validRes = await fetch('/api/validar-objetivo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: editForm.nombre, descripcionDoingness: editForm.descripcionDoingness, tipo: editForm.tipo }),
      })
      const validData = await validRes.json()
      if (!validData.valido && validData.problema) {
        setProblemaGemini(validData.problema)
        setReescrituraGemini(validData.reescritura ?? null)
        setPending(false)
        return
      }
      if (validData.sugerencia) {
        setSugerenciaGemini(validData.sugerencia)
        setPending(false)
        return
      }
    } catch {}
    await doGuardar(editForm.descripcionDoingness)
  }

  // Historia: log + cumplimientos ordenados cronológicamente
  type HistoriaItem =
    | { tipo: 'log'; item: LogEvento; fecha: string }
    | { tipo: 'cumplimiento'; item: Cumplimiento; fecha: string }

  const historia: HistoriaItem[] = [
    ...log.map(e => ({ tipo: 'log' as const, item: e, fecha: e.fechaYHora ?? '' })),
    ...cumplimientos.map(c => ({ tipo: 'cumplimiento' as const, item: c, fecha: c.fecha ?? '' })),
  ].sort((a, b) => {
    if (!a.fecha) return 1
    if (!b.fecha) return -1
    return a.fecha.localeCompare(b.fecha)
  })

  const allUsuarios = Object.values(usuariosMap)

  function renderNotasEvento(e: LogEvento) {
    if (!e.notas) return null
    const notas = e.notas

    if (e.tipoEvento === 'Modificación Solicitada') {
      const { justificacion, propuesta } = parsearNotasModificacion(notas)
      return (
        <div className="text-xs mt-2 space-y-2 opacity-90">
          {justificacion && (
            <p><span className="font-semibold text-purple-300">Justificación:</span> {justificacion}</p>
          )}
          {propuesta && (
            <div>
              <p className="font-semibold text-purple-300 mb-1">Propuesta:</p>
              <div className="bg-purple-950/50 border border-purple-700/40 rounded p-2 text-purple-100 whitespace-pre-wrap">
                {propuesta}
              </div>
            </div>
          )}
          {!justificacion && !propuesta && <p className="whitespace-pre-wrap">{notas}</p>}
        </div>
      )
    }

    if (e.tipoEvento === 'Modificación Aprobada') {
      const textoFinal = notas.startsWith('Texto final:')
        ? notas.slice('Texto final:'.length).trim()
        : notas
      return (
        <div className="text-xs mt-2 opacity-90">
          <p className="font-semibold text-purple-300 mb-1">Texto final aprobado:</p>
          <div className="bg-green-950/50 border border-green-700/40 rounded p-2 text-green-100 whitespace-pre-wrap">
            {textoFinal}
          </div>
        </div>
      )
    }

    if (e.tipoEvento === 'Modificación Rechazada') {
      const motivo = notas.startsWith('Motivo:')
        ? notas.slice('Motivo:'.length).trim()
        : notas
      return (
        <div className="text-xs mt-2 opacity-90">
          <span className="font-semibold text-pink-300">Motivo:</span>{' '}
          <span>{motivo}</span>
        </div>
      )
    }

    if (e.tipoEvento === 'Objetivo Rechazado') {
      return (
        <div className="text-xs mt-2 opacity-90">
          <span className="font-semibold text-orange-300">Motivo:</span>{' '}
          <span>{notas}</span>
        </div>
      )
    }

    if (e.tipoEvento === 'Rechazo Aprobado' || e.tipoEvento === 'Rechazo Rechazado') {
      return (
        <div className="text-xs mt-2 opacity-90">
          <span className="font-semibold">Respuesta:</span>{' '}
          <span>{notas}</span>
        </div>
      )
    }

    if (e.tipoEvento === 'Desatoramiento') {
      const causaIdx = notas.indexOf('Causa:')
      const accionIdx = notas.indexOf('Acción correctiva:')
      const causa = causaIdx >= 0
        ? notas.slice(causaIdx + 'Causa:'.length, accionIdx >= 0 ? accionIdx : undefined).trim()
        : ''
      const accion = accionIdx >= 0
        ? notas.slice(accionIdx + 'Acción correctiva:'.length).trim()
        : ''
      return (
        <div className="text-xs mt-2 space-y-1 opacity-80">
          {causa && <p><span className="font-semibold">Causa:</span> {causa}</p>}
          {accion && <p><span className="font-semibold">Acción correctiva:</span> {accion}</p>}
          {!causa && !accion && <p className="whitespace-pre-wrap">{notas}</p>}
        </div>
      )
    }

    if (e.tipoEvento === 'Objetivo Editado') {
      const lineas = notas.split('\n').filter(l => l.trim())
      return (
        <div className="text-xs mt-2 space-y-1 opacity-90">
          {lineas.map((linea, i) => {
            const arrowIdx = linea.indexOf(' → ')
            const colonIdx = linea.indexOf(': ')
            if (arrowIdx < 0 || colonIdx < 0) return <p key={i} className="whitespace-pre-wrap">{linea}</p>
            const campo = linea.slice(0, colonIdx)
            const rest = linea.slice(colonIdx + 2)
            const restArrow = rest.indexOf(' → ')
            const anterior = restArrow >= 0 ? rest.slice(0, restArrow) : rest
            const nuevo = restArrow >= 0 ? rest.slice(restArrow + 3) : ''
            return (
              <p key={i}>
                <span className="font-semibold text-muted-foreground">{campo}: </span>
                <span className="line-through text-muted-foreground">{anterior}</span>
                {nuevo && (
                  <>
                    <span className="text-muted-foreground"> → </span>
                    <span className="text-foreground">{nuevo}</span>
                  </>
                )}
              </p>
            )
          })}
        </div>
      )
    }

    return <p className="text-xs mt-1 whitespace-pre-wrap opacity-80">{notas}</p>
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Breadcrumb */}
      <nav className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
        <Link href="/programas" className="hover:text-foreground">Programas</Link>
        {programa && (
          <>
            <span>/</span>
            <Link href={`/programas/${programa.id}`} className="hover:text-foreground">{programa.nombre}</Link>
          </>
        )}
        <span>/</span>
        <span className="text-foreground">{objetivo.nombre}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge tipo={objetivo.tipo} />
            {TOOLTIP_TIPOS[objetivo.tipo] && (
              <Tooltip texto={TOOLTIP_TIPOS[objetivo.tipo]} />
            )}
            <Badge estadoObjetivo={objetivo.estado} />
            {objetivo.esRepetible && (
              <span className="text-xs text-muted-foreground bg-card border border-border px-2 py-0.5 rounded">
                Repetible
              </span>
            )}
            {vencido && (
              <span className="text-xs text-red-400 bg-red-950/40 border border-red-700 px-2 py-0.5 rounded">
                Vencido
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-foreground">{objetivo.nombre}</h1>
          {objetivo.responsableId && usuariosMap[objetivo.responsableId] && (
            <p className="text-muted-foreground text-sm mt-1">
              Responsable: {usuariosMap[objetivo.responsableId].nombre}
            </p>
          )}
          {aprobadorEfectivo && usuariosMap[aprobadorEfectivo] && (
            <p className="text-muted-foreground text-xs mt-0.5">
              Aprobador: {usuariosMap[aprobadorEfectivo].nombre}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <Temporizadores
            fechaInicioReal={objetivo.fechaInicioReal}
            fechaLimite={objetivo.fechaLimite}
            estado={objetivo.estado}
          />
          {puedeEditar && !modoEdicion && (
            <Button size="sm" variant="secondary" onClick={entrarModoEdicion}>
              ✏ Editar objetivo
            </Button>
          )}
        </div>
      </div>

      {/* Alerta crítica */}
      {isCriticoIncumplido && (
        <div className="bg-red-950/40 border border-red-700 rounded-lg p-4 text-sm text-red-300">
          Objetivo {objetivo.tipo} Incumplido — esto rompe la cadena del programa.
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-950/40 border border-red-700 rounded-lg p-3 text-sm text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 ml-4">✕</button>
        </div>
      )}

      {/* Detalles / Edición inline */}
      {modoEdicion ? (
        <div className="bg-card border border-blue-700/50 rounded-lg p-5 space-y-4">
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Editando objetivo</p>
          <Input
            label="Nombre"
            value={editForm.nombre}
            onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))}
          />
          <Select
            label="Tipo"
            value={editForm.tipo}
            onChange={e => setEditForm(f => ({ ...f, tipo: e.target.value }))}
          >
            {['Primario', 'Vital', 'Condicional', 'Operativo', 'Producción', 'Mayor'].map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
          <Textarea
            label="Descripción / Doingness"
            value={editForm.descripcionDoingness}
            onChange={e => setEditForm(f => ({ ...f, descripcionDoingness: e.target.value }))}
            rows={4}
          />
          {problemaGemini && (
            <div className="p-3 bg-red-900/20 border border-red-700/40 rounded-md space-y-2">
              <p className="text-red-300 text-xs flex items-start gap-1.5">
                <span className="flex-shrink-0">✗</span>
                {problemaGemini}
              </p>
              {reescrituraGemini && (
                <div className="flex items-start justify-between gap-3">
                  <p className="text-muted-foreground text-xs italic">"{reescrituraGemini}"</p>
                  <button
                    type="button"
                    onClick={() => {
                      setEditForm(f => ({ ...f, descripcionDoingness: reescrituraGemini }))
                      setProblemaGemini(null)
                      setReescrituraGemini(null)
                    }}
                    className="text-xs font-medium text-red-300 hover:text-red-200 whitespace-nowrap transition-colors flex-shrink-0"
                  >
                    Usar →
                  </button>
                </div>
              )}
            </div>
          )}
          {sugerenciaGemini && (
            <div className="p-3 bg-yellow-900/20 border border-yellow-700/40 rounded-md space-y-2">
              <p className="text-yellow-300 text-xs flex items-center gap-1.5">
                <span>💡</span> Se puede mejorar:
              </p>
              <div className="flex items-start justify-between gap-3">
                <p className="text-muted-foreground text-xs italic">"{sugerenciaGemini}"</p>
                <button
                  type="button"
                  onClick={() => {
                    setEditForm(f => ({ ...f, descripcionDoingness: sugerenciaGemini }))
                    setSugerenciaGemini(null)
                    setPending(true)
                    doGuardar(sugerenciaGemini)
                  }}
                  className="text-xs font-medium text-yellow-300 hover:text-yellow-200 whitespace-nowrap transition-colors flex-shrink-0"
                >
                  Usar →
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSugerenciaGemini(null)
                  setPending(true)
                  doGuardar(editForm.descripcionDoingness)
                }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Ignorar
              </button>
            </div>
          )}
          <Input
            label="Fecha Límite"
            type="date"
            value={editForm.fechaLimite}
            onChange={e => setEditForm(f => ({ ...f, fechaLimite: e.target.value }))}
          />
          <Select
            label="Responsable"
            value={editForm.responsableId}
            onChange={e => setEditForm(f => ({ ...f, responsableId: e.target.value }))}
          >
            <option value="">— Sin asignar —</option>
            {allUsuarios.filter(u => u.activo).map(u => (
              <option key={u.id} value={u.id}>{u.nombre}</option>
            ))}
          </Select>
          <Select
            label="Aprobador (opcional)"
            value={editForm.aprobadorId}
            onChange={e => setEditForm(f => ({ ...f, aprobadorId: e.target.value }))}
          >
            <option value="">— Sin aprobador específico —</option>
            {allUsuarios.filter(u => u.activo).map(u => (
              <option key={u.id} value={u.id}>{u.nombre}</option>
            ))}
          </Select>
          <div className="flex items-center gap-3">
            <input
              id="esRepetible"
              type="checkbox"
              checked={editForm.esRepetible}
              onChange={e => setEditForm(f => ({ ...f, esRepetible: e.target.checked }))}
              className="w-4 h-4 rounded border-border bg-background text-blue-500 focus-visible:ring-2"
            />
            <label htmlFor="esRepetible" className="text-sm text-muted-foreground">Es repetible</label>
          </div>
          <Textarea
            label="Notas (opcional)"
            value={editForm.notas}
            onChange={e => setEditForm(f => ({ ...f, notas: e.target.value }))}
            rows={3}
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3 pt-1">
            <Button loading={pending} onClick={guardarEdicion}>
              {pending ? 'Validando objetivo...' : 'Guardar cambios'}
            </Button>
            <Button variant="secondary" onClick={() => { setModoEdicion(false); setError(null); setProblemaGemini(null); setReescrituraGemini(null); setSugerenciaGemini(null) }}>Cancelar</Button>
          </div>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg p-5 space-y-4">
          {objetivo.descripcionDoingness && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">
                Descripción / Doingness
              </p>
              <p className="text-foreground whitespace-pre-wrap">{objetivo.descripcionDoingness}</p>
            </div>
          )}
          <div className="grid grid-cols-3 gap-4 text-sm">
            {objetivo.fechaLimite && (
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider mb-0.5">Fecha Límite</p>
                <p className={vencido ? 'text-red-400 font-medium' : 'text-muted-foreground'}>
                  {objetivo.fechaLimite}
                </p>
              </div>
            )}
            {objetivo.fechaInicioReal && (
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider mb-0.5">Inicio Real</p>
                <p className="text-muted-foreground">{objetivo.fechaInicioReal.split('T')[0]}</p>
              </div>
            )}
            {objetivo.orden !== undefined && (
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider mb-0.5">Orden</p>
                <p className="text-muted-foreground">{objetivo.orden}</p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wider mb-0.5">Cumplimientos</p>
              <p className="text-muted-foreground">{cumplimientos.length}</p>
            </div>
          </div>
          {objetivo.notas && (
            <div className="border-t border-border pt-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">Notas</p>
              <p className="text-muted-foreground text-sm">{objetivo.notas}</p>
            </div>
          )}
        </div>
      )}

      {/* Acciones */}
      {(() => {
        const esEjecutivoOAprobador = isEjecutivo || esAprobador
        const accionesDisponibles =
          (objetivo.estado === 'Asignado' && esResponsable) ||
          (esEjecutivoOAprobador && hayClarificacionPendiente) ||
          (objetivo.estado === 'No iniciado' && esResponsable) ||
          (objetivo.estado === 'En curso' && esResponsable) ||
          (objetivo.estado === 'Completado pendiente' && esAprobador && !esResponsable && !!cumplimientoPendiente) ||
          (objetivo.estado === 'Modificación solicitada' && esEjecutivoOAprobador) ||
          (objetivo.estado === 'Rechazado' && esEjecutivoOAprobador) ||
          (esEjecutivoOAprobador && !estadosTerminales.includes(objetivo.estado))
        if (!accionesDisponibles) return null
        return (
      <div className="bg-card/50 border border-border rounded-lg p-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Acciones</h2>
        <div className="flex flex-wrap gap-2">

          {/* Responsable: Asignado */}
          {objetivo.estado === 'Asignado' && esResponsable && (
            <>
              <Button size="sm" loading={pending} onClick={() => ejecutarAccion('aceptar')}>
                Aceptar
              </Button>
              <Button size="sm" variant="secondary" onClick={() => abrirModal('pedir_clarificacion')}>
                Pedir Clarificación
              </Button>
              <Button size="sm" variant="danger" onClick={() => abrirModal('rechazar_objetivo')}>
                Rechazar Objetivo
              </Button>
            </>
          )}

          {/* Ejecutivo/Aprobador: responder clarificación solo si hay una pendiente */}
          {(isEjecutivo || esAprobador) && hayClarificacionPendiente && (
            <Button size="sm" variant="secondary" onClick={() => abrirModal('responder_clarificacion')}>
              Responder Clarificación
            </Button>
          )}

          {/* Responsable: No iniciado */}
          {objetivo.estado === 'No iniciado' && esResponsable && (
            <>
              <Button size="sm" loading={pending} onClick={() => ejecutarAccion('iniciar')}>
                Iniciar
              </Button>
              <Button size="sm" variant="secondary" onClick={() => abrirModal('solicitar_modificacion')}>
                Solicitar Modificación
              </Button>
              <Button size="sm" variant="danger" onClick={() => abrirModal('rechazar_objetivo')}>
                Rechazar Objetivo
              </Button>
            </>
          )}

          {/* Responsable: En curso */}
          {objetivo.estado === 'En curso' && esResponsable && (
            <>
              <Button size="sm" onClick={() => abrirModal('reportar_cumplimiento')}>
                Reportar Cumplimiento
              </Button>
              <Button size="sm" variant="secondary" onClick={() => abrirModal('solicitar_modificacion')}>
                Solicitar Modificación
              </Button>
              <Button size="sm" variant="danger" onClick={() => abrirModal('rechazar_objetivo')}>
                Rechazar Objetivo
              </Button>
            </>
          )}

          {/* Aprobador: Completado pendiente */}
          {objetivo.estado === 'Completado pendiente' && esAprobador && !esResponsable && cumplimientoPendiente && (
            <>
              <Button
                size="sm"
                loading={pending}
                onClick={() => ejecutarAccion('aprobar_cumplimiento', { cumplimientoId: cumplimientoPendiente.id })}
              >
                Aprobar Cumplimiento
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  setCumplimientoSeleccionado(cumplimientoPendiente.id)
                  abrirModal('rechazar_cumplimiento')
                }}
              >
                Rechazar Cumplimiento
              </Button>
            </>
          )}

          {/* Aprobador/Ejecutivo: Modificación solicitada — único botón unificado */}
          {objetivo.estado === 'Modificación solicitada' && (isEjecutivo || esAprobador) && (
            <Button size="sm" variant="secondary" onClick={abrirModalVerModificacion}>
              Ver modificación solicitada
            </Button>
          )}

          {/* Ejecutivo/Aprobador: Objetivo rechazado */}
          {objetivo.estado === 'Rechazado' && (isEjecutivo || esAprobador) && (
            <Button size="sm" variant="secondary" onClick={() => {
              setRespuestaRechazo('')
              setError(null)
              setModalActivo('ver_rechazo')
            }}>
              Ver rechazo
            </Button>
          )}

          {/* Ejecutivo/Aprobador: acciones globales */}
          {(isEjecutivo || esAprobador) && !estadosTerminales.includes(objetivo.estado) && (
            <>
              <Button size="sm" variant="danger" onClick={() => abrirModal('declarar_incumplido')}>
                Declarar Incumplido
              </Button>
              <Button size="sm" variant="secondary" onClick={() => abrirModal('cancelar')}>
                Cancelar Objetivo
              </Button>
            </>
          )}

          {/* Desatorar */}
          {(isEjecutivo || esAprobador) &&
            !estadosTerminales.includes(objetivo.estado) &&
            (objetivo.estado === 'En curso' || vencido) && (
              <Button size="sm" variant="ghost" onClick={() => abrirModal('desatorar')}>
                Desatorar
              </Button>
            )}
        </div>
      </div>
        )
      })()}

      {/* Historia */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">Historia</h2>
        {historia.length === 0 ? (
          <p className="text-muted-foreground text-sm">Sin actividad registrada.</p>
        ) : (
          <div className="space-y-2">
            {historia.map(item => {
              if (item.tipo === 'log') {
                const e = item.item
                const usuario = e.usuarioId ? usuariosMap[e.usuarioId] : undefined
                return (
                  <div key={`log-${e.id}`} className={`border rounded-lg p-3 ${EVENTO_COLOR_NEUTRO}`}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${EVENTO_COLOR_NEUTRO}`}>
                        {e.tipoEvento}
                      </span>
                      <span className="text-xs opacity-60">
                        {e.fechaYHora ? new Date(e.fechaYHora).toLocaleString('es-AR') : '—'}
                        {usuario ? ` · ${usuario.nombre}` : ''}
                      </span>
                    </div>
                    {renderNotasEvento(e)}
                  </div>
                )
              } else {
                const c = item.item
                const reporter = c.reportadoPorId ? usuariosMap[c.reportadoPorId] : undefined
                const approver = c.aprobadoPorId ? usuariosMap[c.aprobadoPorId] : undefined
                return (
                  <div
                    key={`cum-${c.id}`}
                    className={`border rounded-lg p-3 ${
                      c.rechazado
                        ? 'bg-red-900/20 border-red-800 text-red-200'
                        : c.aprobado
                        ? 'bg-green-900/20 border-green-800 text-green-200'
                        : 'bg-cyan-900/20 border-cyan-800 text-cyan-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-semibold">
                        {c.rechazado ? 'Cumplimiento Rechazado' : c.aprobado ? 'Cumplimiento Aprobado' : 'Cumplimiento Pendiente'}
                      </span>
                      <span className="text-xs opacity-60">
                        {c.fecha ?? '—'}
                        {reporter ? ` · ${reporter.nombre}` : ''}
                      </span>
                    </div>
                    {c.descripcionCumplimiento && (
                      <p className="text-xs mt-1 opacity-80">{c.descripcionCumplimiento}</p>
                    )}
                    {c.rechazado && c.motivoRechazo && (
                      <p className="text-xs mt-1 italic opacity-70">Motivo: {c.motivoRechazo}</p>
                    )}
                    {c.aprobado && approver && (
                      <p className="text-xs mt-1 opacity-60">Aprobado por: {approver.nombre}</p>
                    )}
                  </div>
                )
              }
            })}
          </div>
        )}
      </div>

      {/* ── MODALES ── */}

      {/* Pedir Clarificación */}
      <Modal open={modalActivo === 'pedir_clarificacion'} onClose={() => setModalActivo(null)} title="Pedir Clarificación">
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">Describí qué necesitás clarificar sobre este objetivo.</p>
          <Textarea
            label="Texto de clarificación"
            value={textoModal}
            onChange={e => setTextoModal(e.target.value)}
            placeholder="¿Qué necesitás saber o clarificar?"
            rows={4}
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3">
            <Button loading={pending} disabled={!textoModal.trim()}
              onClick={() => ejecutarAccion('pedir_clarificacion', { texto: textoModal })}>
              Enviar
            </Button>
            <Button variant="secondary" onClick={() => setModalActivo(null)}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      {/* Responder Clarificación */}
      <Modal open={modalActivo === 'responder_clarificacion'} onClose={() => setModalActivo(null)} title="Responder Clarificación">
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">Escribí tu respuesta a la solicitud de clarificación.</p>
          <Textarea
            label="Respuesta"
            value={textoModal}
            onChange={e => setTextoModal(e.target.value)}
            placeholder="Tu respuesta..."
            rows={4}
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3">
            <Button loading={pending} disabled={!textoModal.trim()}
              onClick={() => ejecutarAccion('responder_clarificacion', { texto: textoModal })}>
              Responder
            </Button>
            <Button variant="secondary" onClick={() => setModalActivo(null)}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      {/* Reportar Cumplimiento */}
      <Modal open={modalActivo === 'reportar_cumplimiento'} onClose={() => setModalActivo(null)} title="Reportar Cumplimiento">
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">Describí qué hiciste para cumplir este objetivo.</p>
          <Textarea
            label="Descripción del cumplimiento"
            value={textoModal}
            onChange={e => setTextoModal(e.target.value)}
            placeholder="Describí las acciones realizadas..."
            rows={4}
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3">
            <Button loading={pending} disabled={!textoModal.trim()}
              onClick={() => ejecutarAccion('reportar_cumplimiento', { descripcion: textoModal })}>
              Confirmar Cumplimiento
            </Button>
            <Button variant="secondary" onClick={() => setModalActivo(null)}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      {/* Rechazar Cumplimiento */}
      <Modal open={modalActivo === 'rechazar_cumplimiento'} onClose={() => setModalActivo(null)} title="Rechazar Cumplimiento">
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">Indicá el motivo del rechazo. El objetivo volverá a "En curso".</p>
          <Textarea
            label="Motivo de rechazo"
            value={textoModal}
            onChange={e => setTextoModal(e.target.value)}
            placeholder="Explicá qué falta o qué está mal..."
            rows={3}
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3">
            <Button loading={pending} disabled={!textoModal.trim()}
              onClick={() => ejecutarAccion('rechazar_cumplimiento', {
                cumplimientoId: cumplimientoSeleccionado,
                motivo: textoModal,
              })}
              className="bg-red-800 hover:bg-red-700 text-white border-red-700">
              Confirmar Rechazo
            </Button>
            <Button variant="secondary" onClick={() => setModalActivo(null)}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      {/* Rechazar Objetivo */}
      <Modal open={modalActivo === 'rechazar_objetivo'} onClose={() => setModalActivo(null)} title="Rechazar Objetivo">
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">Indicá el motivo por el cual rechazás este objetivo.</p>
          <Textarea
            label="Motivo"
            value={textoModal}
            onChange={e => setTextoModal(e.target.value)}
            placeholder="Explicá el motivo del rechazo..."
            rows={3}
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3">
            <Button loading={pending} disabled={!textoModal.trim()}
              onClick={() => ejecutarAccion('rechazar_objetivo', { motivo: textoModal })}
              className="bg-red-800 hover:bg-red-700 text-white border-red-700">
              Rechazar Objetivo
            </Button>
            <Button variant="secondary" onClick={() => setModalActivo(null)}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      {/* Solicitar Modificación */}
      <Modal open={modalActivo === 'solicitar_modificacion'} onClose={() => setModalActivo(null)} title="Solicitar Modificación">
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">Indicá la justificación y la propuesta de cambio.</p>
          <Textarea
            label="Justificación"
            value={textoModal}
            onChange={e => setTextoModal(e.target.value)}
            placeholder="¿Por qué necesitás modificar este objetivo?"
            rows={3}
          />
          <Textarea
            label="Propuesta de cambio"
            value={texto2Modal}
            onChange={e => setTexto2Modal(e.target.value)}
            placeholder="¿Qué cambio proponés?"
            rows={3}
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3">
            <Button loading={pending} disabled={!textoModal.trim() || !texto2Modal.trim()}
              onClick={() => ejecutarAccion('solicitar_modificacion', {
                justificacion: textoModal,
                propuesta: texto2Modal,
              })}>
              Enviar Solicitud
            </Button>
            <Button variant="secondary" onClick={() => setModalActivo(null)}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      {/* Ver modificación solicitada (unifica Aprobar + Rechazar) */}
      <Modal open={modalActivo === 'ver_modificacion'} onClose={() => setModalActivo(null)} title="Modificación solicitada">
        <div className="space-y-5">
          {/* Solicitud del responsable (solo lectura) */}
          {ultimaModSolicitada?.notas ? (() => {
            const { justificacion, propuesta } = parsearNotasModificacion(ultimaModSolicitada.notas)
            return (
              <div className="bg-background border border-border rounded-lg p-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Solicitud del responsable</p>
                {justificacion && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Justificación</p>
                    <p className="text-sm text-foreground">{justificacion}</p>
                  </div>
                )}
                {propuesta && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Propuesta</p>
                    <p className="text-sm text-foreground bg-purple-950/30 border border-purple-800/30 rounded p-2">{propuesta}</p>
                  </div>
                )}
              </div>
            )
          })() : (
            <p className="text-muted-foreground text-sm">No se encontró la solicitud de modificación en el historial.</p>
          )}

          {/* Textarea con texto final editable */}
          <Textarea
            label="Texto final del objetivo"
            value={textoFinalMod}
            onChange={e => setTextoFinalMod(e.target.value)}
            placeholder="Editá el texto final que quedará como doingness del objetivo..."
            rows={4}
          />

          {/* Sub-formulario de rechazo */}
          {rechazandoMod && (
            <div className="bg-red-950/20 border border-red-800/40 rounded-lg p-4 space-y-3">
              <p className="text-sm text-red-300 font-medium">Rechazar modificación</p>
              <Textarea
                label="Motivo del rechazo"
                value={motivoRechazoMod}
                onChange={e => setMotivoRechazoMod(e.target.value)}
                placeholder="Explicá por qué rechazás esta solicitud..."
                rows={3}
              />
              <div className="flex gap-2">
                <Button
                  loading={pending}
                  disabled={!motivoRechazoMod.trim()}
                  onClick={() => ejecutarAccion('rechazar_modificacion', {
                    motivo: motivoRechazoMod,
                    estadoAnterior: 'En curso',
                  })}
                  className="bg-red-800 hover:bg-red-700 text-white border-red-700"
                >
                  Confirmar rechazo
                </Button>
                <Button variant="secondary" onClick={() => setRechazandoMod(false)}>Cancelar</Button>
              </div>
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          {!rechazandoMod && (
            <div className="flex gap-3">
              <Button
                loading={pending}
                disabled={!textoFinalMod.trim()}
                onClick={() => ejecutarAccion('aprobar_modificacion', {
                  textoFinal: textoFinalMod,
                  estadoAnterior: 'En curso',
                })}
              >
                Aceptar modificación
              </Button>
              <Button
                variant="danger"
                onClick={() => setRechazandoMod(true)}
              >
                Rechazar modificación
              </Button>
              <Button variant="secondary" onClick={() => setModalActivo(null)}>Cancelar</Button>
            </div>
          )}
        </div>
      </Modal>

      {/* Declarar Incumplido */}
      <Modal open={modalActivo === 'declarar_incumplido'} onClose={() => setModalActivo(null)} title="Declarar Incumplido">
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">Indicá el motivo. Opcionalmente podés reasignar a otro responsable.</p>
          <Textarea
            label="Motivo"
            value={textoModal}
            onChange={e => setTextoModal(e.target.value)}
            placeholder="¿Por qué se declara incumplido?"
            rows={3}
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          {allUsuarios.length > 0 && (
            <Select
              label="Reasignar a (opcional)"
              value={usuarioSeleccionado}
              onChange={e => setUsuarioSeleccionado(e.target.value)}
            >
              <option value="">— Sin reasignar —</option>
              {allUsuarios
                .filter(u => u.id !== objetivo.responsableId && u.activo)
                .map(u => (
                  <option key={u.id} value={u.id}>{u.nombre}</option>
                ))}
            </Select>
          )}
          <div className="flex gap-3">
            <Button loading={pending} disabled={!textoModal.trim()}
              onClick={() => ejecutarAccion('declarar_incumplido', {
                motivo: textoModal,
                nuevoResponsableId: usuarioSeleccionado || undefined,
              })}
              className="bg-red-800 hover:bg-red-700 text-white border-red-700">
              Declarar Incumplido
            </Button>
            <Button variant="secondary" onClick={() => setModalActivo(null)}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      {/* Cancelar Objetivo */}
      <Modal open={modalActivo === 'cancelar'} onClose={() => setModalActivo(null)} title="Cancelar Objetivo">
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">¿Estás seguro de que querés cancelar este objetivo? Esta acción no se puede deshacer.</p>
          <Textarea
            label="Motivo"
            value={textoModal}
            onChange={e => setTextoModal(e.target.value)}
            placeholder="Motivo de la cancelación..."
            rows={3}
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3">
            <Button loading={pending} disabled={!textoModal.trim()}
              onClick={() => ejecutarAccion('cancelar', { motivo: textoModal })}
              className="bg-red-800 hover:bg-red-700 text-white border-red-700">
              Cancelar Objetivo
            </Button>
            <Button variant="secondary" onClick={() => setModalActivo(null)}>Volver</Button>
          </div>
        </div>
      </Modal>

      {/* Ver rechazo */}
      <Modal open={modalActivo === 'ver_rechazo'} onClose={() => setModalActivo(null)} title="Rechazo del objetivo">
        <div className="space-y-5">
          {/* Motivo del responsable (solo lectura) */}
          <div className="bg-background border border-orange-800/40 rounded-lg p-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Rechazo reportado por {objetivo.responsableId && usuariosMap[objetivo.responsableId]
                ? usuariosMap[objetivo.responsableId].nombre
                : 'el responsable'}
            </p>
            {ultimoRechazo?.notas ? (
              <p className="text-sm text-orange-200">{ultimoRechazo.notas}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Sin motivo registrado.</p>
            )}
          </div>

          <Textarea
            label="Tu respuesta"
            value={respuestaRechazo}
            onChange={e => setRespuestaRechazo(e.target.value)}
            placeholder="Explicá tu decisión al responsable..."
            rows={4}
          />

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-3">
            <Button
              loading={pending}
              disabled={!respuestaRechazo.trim()}
              onClick={() => ejecutarAccion('aceptar_rechazo', { motivo: respuestaRechazo })}
              className="bg-red-800 hover:bg-red-700 text-white border-red-700"
            >
              Aceptar rechazo
            </Button>
            <Button
              loading={pending}
              disabled={!respuestaRechazo.trim()}
              onClick={() => ejecutarAccion('rechazar_rechazo', { motivo: respuestaRechazo })}
            >
              Rechazar el rechazo
            </Button>
            <Button variant="secondary" onClick={() => setModalActivo(null)}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      {/* Desatorar */}
      <Modal open={modalActivo === 'desatorar'} onClose={() => setModalActivo(null)} title="Desatoramiento">
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">Identificá la causa del paro y definí la acción correctiva.</p>
          <Select
            label="Causa del desatoramiento"
            value={causeDesatoramiento}
            onChange={e => setCauseDesatoramiento(e.target.value)}
          >
            {CAUSAS_DESATORAMIENTO.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
          <Textarea
            label="Acción correctiva"
            value={textoModal}
            onChange={e => setTextoModal(e.target.value)}
            placeholder="¿Qué acción vas a tomar para resolver el paro?"
            rows={3}
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3">
            <Button loading={pending} disabled={!textoModal.trim()}
              onClick={() => ejecutarAccion('desatorar', {
                causa: causeDesatoramiento,
                accionCorrectiva: textoModal,
              })}>
              Registrar Desatoramiento
            </Button>
            <Button variant="secondary" onClick={() => setModalActivo(null)}>Cancelar</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
