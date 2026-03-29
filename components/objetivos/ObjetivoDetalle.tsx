'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Input'
import { Select } from '@/components/ui/Input'
import type { Objetivo, Cumplimiento, LogEvento, Usuario, Programa } from '@/lib/types'
import { TOOLTIP_TIPOS, isVencido, CAUSAS_DESATORAMIENTO } from '@/lib/types'

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

// Colores para los tipos de evento del log
const EVENTO_COLOR: Record<string, string> = {
  'Aceptado': 'bg-gray-700 text-gray-300 border-gray-600',
  'Iniciado': 'bg-blue-900 text-blue-200 border-blue-700',
  'Cumplimiento Reportado': 'bg-cyan-900 text-cyan-200 border-cyan-700',
  'Cumplimiento Aprobado': 'bg-green-900 text-green-200 border-green-700',
  'Cumplimiento Rechazado por Aprobador': 'bg-red-900 text-red-200 border-red-700',
  'Reabierto': 'bg-yellow-900 text-yellow-200 border-yellow-700',
  'Clarificación Solicitada': 'bg-orange-800 text-orange-200 border-orange-600',
  'Clarificación Respondida': 'bg-orange-900 text-orange-200 border-orange-700',
  'Objetivo Rechazado': 'bg-orange-950 text-orange-300 border-orange-800',
  'Modificación Solicitada': 'bg-purple-800 text-purple-200 border-purple-600',
  'Modificación Aprobada': 'bg-purple-900 text-purple-200 border-purple-700',
  'Modificación Rechazada': 'bg-pink-900 text-pink-200 border-pink-700',
  'Incumplido Declarado': 'bg-red-950 text-red-300 border-red-800',
  'Reasignado': 'bg-gray-800 text-gray-300 border-gray-600',
  'Cancelado': 'bg-red-950 text-red-300 border-red-800',
  'Desatoramiento': 'bg-yellow-950 text-yellow-200 border-yellow-800',
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
  const [, startTransition] = useTransition()
  const router = useRouter()

  const esAprobador = userId === aprobadorEfectivo
  const esResponsable = userId === objetivo.responsableId
  const estadosTerminales = ['Completado', 'Cancelado', 'Incumplido']
  const vencido = isVencido(objetivo)
  const isCriticoIncumplido = (objetivo.tipo === 'Primario' || objetivo.tipo === 'Vital') && objetivo.estado === 'Incumplido'

  // Pending cumplimiento (the most recent one awaiting approval)
  const cumplimientoPendiente = cumplimientos.find(c => !c.aprobado && !c.rechazado)

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
      startTransition(() => {
        router.refresh()
      })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setPending(false)
      setModalActivo(null)
      setTextoModal('')
      setTexto2Modal('')
    }
  }

  function abrirModal(nombre: string) {
    setTextoModal('')
    setTexto2Modal('')
    setModalActivo(nombre)
  }

  // Historia: combinar log + cumplimientos, ordenados cronológicamente
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

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          {objetivo.programaIds.length > 0 && (
            <Link
              href={`/programas/${objetivo.programaIds[0]}`}
              className="text-gray-400 hover:text-gray-200 text-sm mb-2 inline-block"
            >
              ← {programa?.nombre ?? 'Programa'}
            </Link>
          )}
          <div className="flex items-center gap-2 mb-2">
            <Badge tipo={objetivo.tipo} />
            {TOOLTIP_TIPOS[objetivo.tipo] && (
              <Tooltip texto={TOOLTIP_TIPOS[objetivo.tipo]} />
            )}
            <Badge estadoObjetivo={objetivo.estado} />
            {objetivo.esRepetible && (
              <span className="text-xs text-gray-400 bg-gray-800 border border-gray-700 px-2 py-0.5 rounded">
                Repetible
              </span>
            )}
            {vencido && (
              <span className="text-xs text-red-400 bg-red-950/40 border border-red-700 px-2 py-0.5 rounded">
                Vencido
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-white">{objetivo.nombre}</h1>
          {objetivo.responsableId && usuariosMap[objetivo.responsableId] && (
            <p className="text-gray-400 text-sm mt-1">
              Responsable: {usuariosMap[objetivo.responsableId].nombre}
            </p>
          )}
          {aprobadorEfectivo && usuariosMap[aprobadorEfectivo] && (
            <p className="text-gray-500 text-xs mt-0.5">
              Aprobador: {usuariosMap[aprobadorEfectivo].nombre}
            </p>
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

      {/* Detalles */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-5 space-y-4">
        {objetivo.descripcionDoingness && (
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">
              Descripción / Doingness
            </p>
            <p className="text-gray-200">{objetivo.descripcionDoingness}</p>
          </div>
        )}
        <div className="grid grid-cols-3 gap-4 text-sm">
          {objetivo.fechaLimite && (
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wider mb-0.5">Fecha Límite</p>
              <p className={vencido ? 'text-red-400 font-medium' : 'text-gray-300'}>
                {objetivo.fechaLimite}
              </p>
            </div>
          )}
          {objetivo.fechaInicioReal && (
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wider mb-0.5">Inicio Real</p>
              <p className="text-gray-300">{objetivo.fechaInicioReal.split('T')[0]}</p>
            </div>
          )}
          {objetivo.orden !== undefined && (
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wider mb-0.5">Orden</p>
              <p className="text-gray-300">{objetivo.orden}</p>
            </div>
          )}
          <div>
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-0.5">Cumplimientos</p>
            <p className="text-gray-300">{cumplimientos.length}</p>
          </div>
        </div>
        {objetivo.notas && (
          <div className="border-t border-gray-700 pt-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">Notas</p>
            <p className="text-gray-300 text-sm">{objetivo.notas}</p>
          </div>
        )}
      </div>

      {/* Acciones */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Acciones</h2>
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

          {/* Ejecutivo/Aprobador: responder clarificación (cuando hay log con clarificación solicitada) */}
          {(isEjecutivo || esAprobador) && log.some(e => e.tipoEvento === 'Clarificación Solicitada') && (
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

          {/* Aprobador/Ejecutivo: Modificación solicitada */}
          {objetivo.estado === 'Modificación solicitada' && (isEjecutivo || esAprobador) && (
            <>
              <Button size="sm" loading={pending} onClick={() => abrirModal('aprobar_modificacion')}>
                Aprobar Modificación
              </Button>
              <Button size="sm" variant="danger" onClick={() => abrirModal('rechazar_modificacion')}>
                Rechazar Modificación
              </Button>
            </>
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

          {/* Desatorar: siempre disponible para ejecutivo/aprobador si está en curso o vencido */}
          {(isEjecutivo || esAprobador) &&
            !estadosTerminales.includes(objetivo.estado) &&
            (objetivo.estado === 'En curso' || vencido) && (
              <Button size="sm" variant="ghost" onClick={() => abrirModal('desatorar')}>
                Desatorar
              </Button>
            )}
        </div>
      </div>

      {/* Historia */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-3">Historia</h2>
        {historia.length === 0 ? (
          <p className="text-gray-500 text-sm">Sin actividad registrada.</p>
        ) : (
          <div className="space-y-2">
            {historia.map(item => {
              if (item.tipo === 'log') {
                const e = item.item
                const colorClass = EVENTO_COLOR[e.tipoEvento] ?? 'bg-gray-800 text-gray-300 border-gray-600'
                const usuario = e.usuarioId ? usuariosMap[e.usuarioId] : undefined
                return (
                  <div key={`log-${e.id}`} className={`border rounded-lg p-3 ${colorClass}`}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${colorClass}`}>
                        {e.tipoEvento}
                      </span>
                      <span className="text-xs opacity-60">
                        {e.fechaYHora ? new Date(e.fechaYHora).toLocaleString('es-AR') : '—'}
                        {usuario ? ` · ${usuario.nombre}` : ''}
                      </span>
                    </div>
                    {e.notas && (
                      <p className="text-xs mt-1 whitespace-pre-wrap opacity-80">{e.notas}</p>
                    )}
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
          <p className="text-gray-400 text-sm">Describí qué necesitás clarificar sobre este objetivo.</p>
          <Textarea
            label="Texto de clarificación"
            value={textoModal}
            onChange={e => setTextoModal(e.target.value)}
            placeholder="¿Qué necesitás saber o clarificar?"
            rows={4}
          />
          <div className="flex gap-3">
            <Button
              loading={pending}
              disabled={!textoModal.trim()}
              onClick={() => ejecutarAccion('pedir_clarificacion', { texto: textoModal })}
            >
              Enviar
            </Button>
            <Button variant="secondary" onClick={() => setModalActivo(null)}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      {/* Responder Clarificación */}
      <Modal open={modalActivo === 'responder_clarificacion'} onClose={() => setModalActivo(null)} title="Responder Clarificación">
        <div className="space-y-4">
          <p className="text-gray-400 text-sm">Escribí tu respuesta a la solicitud de clarificación.</p>
          <Textarea
            label="Respuesta"
            value={textoModal}
            onChange={e => setTextoModal(e.target.value)}
            placeholder="Tu respuesta..."
            rows={4}
          />
          <div className="flex gap-3">
            <Button
              loading={pending}
              disabled={!textoModal.trim()}
              onClick={() => ejecutarAccion('responder_clarificacion', { texto: textoModal })}
            >
              Responder
            </Button>
            <Button variant="secondary" onClick={() => setModalActivo(null)}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      {/* Reportar Cumplimiento */}
      <Modal open={modalActivo === 'reportar_cumplimiento'} onClose={() => setModalActivo(null)} title="Reportar Cumplimiento">
        <div className="space-y-4">
          <p className="text-gray-400 text-sm">Describí qué hiciste para cumplir este objetivo.</p>
          <Textarea
            label="Descripción del cumplimiento"
            value={textoModal}
            onChange={e => setTextoModal(e.target.value)}
            placeholder="Describí las acciones realizadas..."
            rows={4}
          />
          <div className="flex gap-3">
            <Button
              loading={pending}
              disabled={!textoModal.trim()}
              onClick={() => ejecutarAccion('reportar_cumplimiento', { descripcion: textoModal })}
            >
              Confirmar Cumplimiento
            </Button>
            <Button variant="secondary" onClick={() => setModalActivo(null)}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      {/* Rechazar Cumplimiento */}
      <Modal open={modalActivo === 'rechazar_cumplimiento'} onClose={() => setModalActivo(null)} title="Rechazar Cumplimiento">
        <div className="space-y-4">
          <p className="text-gray-400 text-sm">Indicá el motivo del rechazo. El objetivo volverá a "En curso".</p>
          <Textarea
            label="Motivo de rechazo"
            value={textoModal}
            onChange={e => setTextoModal(e.target.value)}
            placeholder="Explicá qué falta o qué está mal..."
            rows={3}
          />
          <div className="flex gap-3">
            <Button
              loading={pending}
              disabled={!textoModal.trim()}
              onClick={() => ejecutarAccion('rechazar_cumplimiento', {
                cumplimientoId: cumplimientoSeleccionado,
                motivo: textoModal,
              })}
              className="bg-red-800 hover:bg-red-700 text-white border-red-700"
            >
              Confirmar Rechazo
            </Button>
            <Button variant="secondary" onClick={() => setModalActivo(null)}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      {/* Rechazar Objetivo */}
      <Modal open={modalActivo === 'rechazar_objetivo'} onClose={() => setModalActivo(null)} title="Rechazar Objetivo">
        <div className="space-y-4">
          <p className="text-gray-400 text-sm">Indicá el motivo por el cual rechazás este objetivo.</p>
          <Textarea
            label="Motivo"
            value={textoModal}
            onChange={e => setTextoModal(e.target.value)}
            placeholder="Explicá el motivo del rechazo..."
            rows={3}
          />
          <div className="flex gap-3">
            <Button
              loading={pending}
              disabled={!textoModal.trim()}
              onClick={() => ejecutarAccion('rechazar_objetivo', { motivo: textoModal })}
              className="bg-red-800 hover:bg-red-700 text-white border-red-700"
            >
              Rechazar Objetivo
            </Button>
            <Button variant="secondary" onClick={() => setModalActivo(null)}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      {/* Solicitar Modificación */}
      <Modal open={modalActivo === 'solicitar_modificacion'} onClose={() => setModalActivo(null)} title="Solicitar Modificación">
        <div className="space-y-4">
          <p className="text-gray-400 text-sm">Indicá la justificación y la propuesta de cambio.</p>
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
          <div className="flex gap-3">
            <Button
              loading={pending}
              disabled={!textoModal.trim() || !texto2Modal.trim()}
              onClick={() => ejecutarAccion('solicitar_modificacion', {
                justificacion: textoModal,
                propuesta: texto2Modal,
              })}
            >
              Enviar Solicitud
            </Button>
            <Button variant="secondary" onClick={() => setModalActivo(null)}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      {/* Aprobar Modificación */}
      <Modal open={modalActivo === 'aprobar_modificacion'} onClose={() => setModalActivo(null)} title="Aprobar Modificación">
        <div className="space-y-4">
          <p className="text-gray-400 text-sm">¿Confirmás la aprobación de la modificación solicitada? El objetivo volverá al estado anterior.</p>
          <div className="flex gap-3">
            <Button
              loading={pending}
              onClick={() => ejecutarAccion('aprobar_modificacion', { estadoAnterior: 'En curso' })}
            >
              Confirmar Aprobación
            </Button>
            <Button variant="secondary" onClick={() => setModalActivo(null)}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      {/* Rechazar Modificación */}
      <Modal open={modalActivo === 'rechazar_modificacion'} onClose={() => setModalActivo(null)} title="Rechazar Modificación">
        <div className="space-y-4">
          <p className="text-gray-400 text-sm">Indicá el motivo del rechazo. El objetivo volverá al estado anterior.</p>
          <Textarea
            label="Motivo"
            value={textoModal}
            onChange={e => setTextoModal(e.target.value)}
            placeholder="Motivo del rechazo..."
            rows={3}
          />
          <div className="flex gap-3">
            <Button
              loading={pending}
              disabled={!textoModal.trim()}
              onClick={() => ejecutarAccion('rechazar_modificacion', {
                motivo: textoModal,
                estadoAnterior: 'En curso',
              })}
            >
              Rechazar Modificación
            </Button>
            <Button variant="secondary" onClick={() => setModalActivo(null)}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      {/* Declarar Incumplido */}
      <Modal open={modalActivo === 'declarar_incumplido'} onClose={() => setModalActivo(null)} title="Declarar Incumplido">
        <div className="space-y-4">
          <p className="text-gray-400 text-sm">Indicá el motivo. Opcionalmente podés reasignar a otro responsable.</p>
          <Textarea
            label="Motivo"
            value={textoModal}
            onChange={e => setTextoModal(e.target.value)}
            placeholder="¿Por qué se declara incumplido?"
            rows={3}
          />
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
            <Button
              loading={pending}
              disabled={!textoModal.trim()}
              onClick={() => ejecutarAccion('declarar_incumplido', {
                motivo: textoModal,
                nuevoResponsableId: usuarioSeleccionado || undefined,
              })}
              className="bg-red-800 hover:bg-red-700 text-white border-red-700"
            >
              Declarar Incumplido
            </Button>
            <Button variant="secondary" onClick={() => setModalActivo(null)}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      {/* Cancelar Objetivo */}
      <Modal open={modalActivo === 'cancelar'} onClose={() => setModalActivo(null)} title="Cancelar Objetivo">
        <div className="space-y-4">
          <p className="text-gray-400 text-sm">¿Estás seguro de que querés cancelar este objetivo? Esta acción no se puede deshacer.</p>
          <Textarea
            label="Motivo"
            value={textoModal}
            onChange={e => setTextoModal(e.target.value)}
            placeholder="Motivo de la cancelación..."
            rows={3}
          />
          <div className="flex gap-3">
            <Button
              loading={pending}
              disabled={!textoModal.trim()}
              onClick={() => ejecutarAccion('cancelar', { motivo: textoModal })}
              className="bg-red-800 hover:bg-red-700 text-white border-red-700"
            >
              Cancelar Objetivo
            </Button>
            <Button variant="secondary" onClick={() => setModalActivo(null)}>Volver</Button>
          </div>
        </div>
      </Modal>

      {/* Desatorar */}
      <Modal open={modalActivo === 'desatorar'} onClose={() => setModalActivo(null)} title="Desatoramiento">
        <div className="space-y-4">
          <p className="text-gray-400 text-sm">Identificá la causa del paro y definí la acción correctiva.</p>
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
          <div className="flex gap-3">
            <Button
              loading={pending}
              disabled={!textoModal.trim()}
              onClick={() => ejecutarAccion('desatorar', {
                causa: causeDesatoramiento,
                accionCorrectiva: textoModal,
              })}
            >
              Registrar Desatoramiento
            </Button>
            <Button variant="secondary" onClick={() => setModalActivo(null)}>Cancelar</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
