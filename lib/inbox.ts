import { getObjetivos, getProgramas, getAllLogEventos } from './airtable'
import { isVencido, getAprobadorEfectivo } from './types'
import type { Objetivo, LogEvento } from './types'

export interface InboxItem {
  id: string
  tipo:
    | 'cumplimiento_pendiente'
    | 'cumplimiento_rechazado'
    | 'clarificacion_solicitada'
    | 'clarificacion_respondida'
    | 'modificacion_pendiente'
    | 'modificacion_rechazada'
    | 'modificacion_aprobada'
    | 'rechazo_pendiente'
    | 'asignacion_pendiente'
    | 'rechazo_rechazado'
    | 'vencido'
    | 'sin_movimiento'
    | 'primario_caido'
  prioridad: 'alta' | 'media' | 'baja'
  objetivoId: string
  objetivoNombre: string
  programaNombre: string
  descripcion: string
  fechaEvento?: string
  accionUrl: string
}

export async function calcularInbox(
  userId: string,
  rol: string
): Promise<{ items: InboxItem[]; total: number }> {
  const [objetivos, programas, logEventos] = await Promise.all([
    getObjetivos(),
    getProgramas(),
    getAllLogEventos(),
  ])

  const programasMap = Object.fromEntries(programas.map((p) => [p.id, p]))
  const programasArchivadosIds = new Set(programas.filter(p => p.estado === 'Archivado').map(p => p.id))

  // Excluir objetivos cuyos programas están archivados
  const objetivosActivos = objetivos.filter(o =>
    !o.programaIds.some(pid => programasArchivadosIds.has(pid))
  )

  // Group log events by objetivoId, sorted desc by date
  const logPorObjetivo: Record<string, LogEvento[]> = {}
  for (const evt of logEventos) {
    for (const objId of evt.objetivoIds) {
      if (!logPorObjetivo[objId]) logPorObjetivo[objId] = []
      logPorObjetivo[objId].push(evt)
    }
  }
  for (const objId of Object.keys(logPorObjetivo)) {
    logPorObjetivo[objId].sort((a, b) => {
      const da = a.fechaYHora ? new Date(a.fechaYHora).getTime() : 0
      const db = b.fechaYHora ? new Date(b.fechaYHora).getTime() : 0
      return db - da
    })
  }

  function getProgramaNombre(objetivo: Objetivo): string {
    const progId = objetivo.programaIds[0]
    return progId ? (programasMap[progId]?.nombre ?? 'Sin programa') : 'Sin programa'
  }

  function getAprobador(objetivo: Objetivo): string | undefined {
    const progId = objetivo.programaIds[0]
    const prog = progId ? programasMap[progId] : undefined
    if (!prog) return objetivo.aprobadorId
    return getAprobadorEfectivo(objetivo, prog)
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const in7Days = new Date(today)
  in7Days.setDate(in7Days.getDate() + 7)
  const hace7Dias = new Date(today)
  hace7Dias.setDate(hace7Dias.getDate() - 7)

  const items: InboxItem[] = []
  const rolNorm = rol.toLowerCase()
  const esOperador = rolNorm === 'operador' || rolNorm === 'staff'
  const esEjecutivo = rolNorm === 'ejecutivo'
  const esPM = rolNorm === 'program manager'

  // ─── OPERADOR ──────────────────────────────────────────────────────────────
  if (esOperador) {
    for (const obj of objetivosActivos) {
      if (obj.responsableId !== userId) continue
      const logs = logPorObjetivo[obj.id] ?? []
      const ultimoLog = logs[0]
      const progNombre = getProgramaNombre(obj)

      if (obj.estado === 'Asignado') {
        items.push({
          id: `${obj.id}_asignacion`,
          tipo: 'asignacion_pendiente',
          prioridad: 'alta',
          objetivoId: obj.id,
          objetivoNombre: obj.nombre,
          programaNombre: progNombre,
          descripcion: 'Te fue asignado este objetivo. Aceptalo para comenzar.',
          fechaEvento: obj.fechaLimite,
          accionUrl: `/objetivos/${obj.id}`,
        })
      }

    }
  }

  // ─── EJECUTIVO ─────────────────────────────────────────────────────────────
  if (esEjecutivo) {
    for (const obj of objetivosActivos) {
      const aprobadorEfectivo = getAprobador(obj)
      if (aprobadorEfectivo !== userId) continue

      const progNombre = getProgramaNombre(obj)
      const logs = logPorObjetivo[obj.id] ?? []
      const ultimoLog = logs[0]

      if (obj.estado === 'Completado pendiente') {
        items.push({
          id: `${obj.id}_cumplimiento_pendiente`,
          tipo: 'cumplimiento_pendiente',
          prioridad: 'alta',
          objetivoId: obj.id,
          objetivoNombre: obj.nombre,
          programaNombre: progNombre,
          descripcion: 'Hay un cumplimiento reportado esperando tu aprobación.',
          fechaEvento: obj.fechaCumplimientoReportado,
          accionUrl: `/objetivos/${obj.id}`,
        })
      }

      // Check last clarification-specific event (not overall last event)
      const logsClari = logs.filter(
        e => e.tipoEvento === 'Clarificación Solicitada' || e.tipoEvento === 'Clarificación Respondida'
      )
      // logs is already sorted desc (newest first), so logsClari[0] is the most recent clarification event
      if (logsClari[0]?.tipoEvento === 'Clarificación Solicitada') {
        items.push({
          id: `${obj.id}_clarificacion_solicitada`,
          tipo: 'clarificacion_solicitada',
          prioridad: 'alta',
          objetivoId: obj.id,
          objetivoNombre: obj.nombre,
          programaNombre: progNombre,
          descripcion: 'El responsable solicita una clarificación sobre este objetivo.',
          fechaEvento: logsClari[0].fechaYHora,
          accionUrl: `/objetivos/${obj.id}`,
        })
      }

      if (obj.estado === 'Modificación solicitada') {
        items.push({
          id: `${obj.id}_modificacion_pendiente`,
          tipo: 'modificacion_pendiente',
          prioridad: 'media',
          objetivoId: obj.id,
          objetivoNombre: obj.nombre,
          programaNombre: progNombre,
          descripcion: 'El responsable solicitó una modificación del objetivo.',
          fechaEvento: ultimoLog?.fechaYHora,
          accionUrl: `/objetivos/${obj.id}`,
        })
      }

      if (obj.estado === 'Rechazado') {
        items.push({
          id: `${obj.id}_rechazo_pendiente`,
          tipo: 'rechazo_pendiente',
          prioridad: 'alta',
          objetivoId: obj.id,
          objetivoNombre: obj.nombre,
          programaNombre: progNombre,
          descripcion: 'El responsable rechazó este objetivo. Requiere resolución.',
          fechaEvento: ultimoLog?.fechaYHora,
          accionUrl: `/objetivos/${obj.id}`,
        })
      }
    }
  }

  // ─── PROGRAM MANAGER ───────────────────────────────────────────────────────
  if (esPM) {
    for (const obj of objetivosActivos) {
      if (isVencido(obj)) {
        items.push({
          id: `${obj.id}_vencido`,
          tipo: 'vencido',
          prioridad: 'baja',
          objetivoId: obj.id,
          objetivoNombre: obj.nombre,
          programaNombre: getProgramaNombre(obj),
          descripcion: `Vencido el ${obj.fechaLimite}`,
          fechaEvento: obj.fechaLimite,
          accionUrl: `/objetivos/${obj.id}`,
        })
      }
    }

    const programasConProblemas = new Set<string>()
    for (const obj of objetivosActivos) {
      if (
        (obj.tipo === 'Primario' || obj.tipo === 'Vital') &&
        obj.estado === 'Incumplido'
      ) {
        const progId = obj.programaIds[0]
        if (progId && !programasConProblemas.has(progId)) {
          programasConProblemas.add(progId)
          const prog = programasMap[progId]
          items.push({
            id: `${progId}_primario_caido`,
            tipo: 'primario_caido',
            prioridad: 'media',
            objetivoId: obj.id,
            objetivoNombre: obj.nombre,
            programaNombre: prog?.nombre ?? 'Sin programa',
            descripcion: `Objetivo ${obj.tipo} incumplido bloquea el programa.`,
            fechaEvento: obj.fechaLimite,
            accionUrl: `/programas/${progId}`,
          })
        }
      }
    }

    for (const obj of objetivosActivos) {
      if (obj.estado !== 'En curso' || !obj.fechaLimite) continue
      if (new Date(obj.fechaLimite) > in7Days) continue
      const logs = logPorObjetivo[obj.id] ?? []
      const ultimoEvento = logs[0]
      const sinMovimiento =
        !ultimoEvento || new Date(ultimoEvento.fechaYHora ?? 0) < hace7Dias
      if (sinMovimiento) {
        items.push({
          id: `${obj.id}_sin_movimiento`,
          tipo: 'sin_movimiento',
          prioridad: 'baja',
          objetivoId: obj.id,
          objetivoNombre: obj.nombre,
          programaNombre: getProgramaNombre(obj),
          descripcion: `Sin movimiento en 7+ días y vence el ${obj.fechaLimite}`,
          fechaEvento: obj.fechaLimite,
          accionUrl: `/objetivos/${obj.id}`,
        })
      }
    }
  }

  // ─── EN RADAR (todos los roles) ─────────────────────────────────────────────
  if (!esPM) {
    for (const obj of objetivosActivos) {
      if (obj.responsableId !== userId) continue

      if (isVencido(obj)) {
        const existe = items.some((i) => i.objetivoId === obj.id && i.tipo === 'vencido')
        if (!existe) {
          items.push({
            id: `${obj.id}_vencido`,
            tipo: 'vencido',
            prioridad: 'baja',
            objetivoId: obj.id,
            objetivoNombre: obj.nombre,
            programaNombre: getProgramaNombre(obj),
            descripcion: `Vencido el ${obj.fechaLimite}`,
            fechaEvento: obj.fechaLimite,
            accionUrl: `/objetivos/${obj.id}`,
          })
        }
      }

      if (obj.estado === 'En curso' && obj.fechaLimite) {
        if (new Date(obj.fechaLimite) <= in7Days) {
          const logs = logPorObjetivo[obj.id] ?? []
          const ultimoEvento = logs[0]
          const sinMovimiento =
            !ultimoEvento || new Date(ultimoEvento.fechaYHora ?? 0) < hace7Dias
          if (sinMovimiento) {
            const existe = items.some(
              (i) => i.objetivoId === obj.id && i.tipo === 'sin_movimiento'
            )
            if (!existe) {
              items.push({
                id: `${obj.id}_sin_movimiento`,
                tipo: 'sin_movimiento',
                prioridad: 'baja',
                objetivoId: obj.id,
                objetivoNombre: obj.nombre,
                programaNombre: getProgramaNombre(obj),
                descripcion: `Sin movimiento y vence el ${obj.fechaLimite}`,
                fechaEvento: obj.fechaLimite,
                accionUrl: `/objetivos/${obj.id}`,
              })
            }
          }
        }
      }
    }
  }

  // ─── EVENTOS QUE LE LLEGAN AL RESPONSABLE (todos los roles) ──────────────────
  const estadosTerminales = ['Completado', 'Cancelado', 'Incumplido']
  for (const obj of objetivosActivos) {
    if (obj.responsableId !== userId) continue
    if (estadosTerminales.includes(obj.estado)) continue

    const logs = logPorObjetivo[obj.id] ?? []
    const ultimoLog = logs[0]
    if (!ultimoLog) continue

    const progNombre = getProgramaNombre(obj)
    const fechaEvt = ultimoLog.fechaYHora

    // 1. Cumplimiento rechazado por el aprobador
    if (ultimoLog.tipoEvento === 'Cumplimiento Rechazado por Aprobador') {
      const existe = items.some((i) => i.id === `${obj.id}_cumplimiento_rechazado`)
      if (!existe) {
        items.push({
          id: `${obj.id}_cumplimiento_rechazado`,
          tipo: 'cumplimiento_rechazado',
          prioridad: 'alta',
          objetivoId: obj.id,
          objetivoNombre: obj.nombre,
          programaNombre: progNombre,
          descripcion: 'Tu cumplimiento fue rechazado. Revisá el motivo y volvé a reportar.',
          fechaEvento: fechaEvt,
          accionUrl: `/objetivos/${obj.id}`,
        })
      }
    }

    // 2. Rechazo rechazado por el ejecutivo
    if (ultimoLog.tipoEvento === 'Rechazo Rechazado') {
      const existe = items.some((i) => i.id === `${obj.id}_rechazo_rechazado`)
      if (!existe) {
        items.push({
          id: `${obj.id}_rechazo_rechazado`,
          tipo: 'rechazo_rechazado',
          prioridad: 'alta',
          objetivoId: obj.id,
          objetivoNombre: obj.nombre,
          programaNombre: progNombre,
          descripcion: 'Tu solicitud de rechazo no fue aceptada. El objetivo continúa en curso.',
          fechaEvento: fechaEvt,
          accionUrl: `/objetivos/${obj.id}`,
        })
      }
    }

    // 3. Modificación rechazada
    if (ultimoLog.tipoEvento === 'Modificación Rechazada') {
      const existe = items.some((i) => i.id === `${obj.id}_modificacion_rechazada`)
      if (!existe) {
        items.push({
          id: `${obj.id}_modificacion_rechazada`,
          tipo: 'modificacion_rechazada',
          prioridad: 'alta',
          objetivoId: obj.id,
          objetivoNombre: obj.nombre,
          programaNombre: progNombre,
          descripcion: 'Tu solicitud de modificación fue rechazada. Revisá el motivo.',
          fechaEvento: fechaEvt,
          accionUrl: `/objetivos/${obj.id}`,
        })
      }
    }

    // 4. Modificación aprobada
    if (ultimoLog.tipoEvento === 'Modificación Aprobada') {
      const existe = items.some((i) => i.id === `${obj.id}_modificacion_aprobada`)
      if (!existe) {
        items.push({
          id: `${obj.id}_modificacion_aprobada`,
          tipo: 'modificacion_aprobada',
          prioridad: 'media',
          objetivoId: obj.id,
          objetivoNombre: obj.nombre,
          programaNombre: progNombre,
          descripcion: 'Tu solicitud de modificación fue aprobada. El doingness fue actualizado.',
          fechaEvento: fechaEvt,
          accionUrl: `/objetivos/${obj.id}`,
        })
      }
    }

    // 5. Clarificación respondida (buscar el último evento de clarificación)
    const ultimaClari = logs.find(
      (e) => e.tipoEvento === 'Clarificación Respondida' || e.tipoEvento === 'Clarificación Solicitada'
    )
    if (ultimaClari?.tipoEvento === 'Clarificación Respondida') {
      const existe = items.some((i) => i.id === `${obj.id}_clarificacion_respondida`)
      if (!existe) {
        items.push({
          id: `${obj.id}_clarificacion_respondida`,
          tipo: 'clarificacion_respondida',
          prioridad: 'alta',
          objetivoId: obj.id,
          objetivoNombre: obj.nombre,
          programaNombre: progNombre,
          descripcion: 'Recibiste una respuesta a tu clarificación. Ya podés proceder con el objetivo.',
          fechaEvento: ultimaClari.fechaYHora,
          accionUrl: `/objetivos/${obj.id}`,
        })
      }
    }
  }

  // Sort: alta → media → baja, then fechaEvento desc
  const ordenPrioridad: Record<string, number> = { alta: 0, media: 1, baja: 2 }
  items.sort((a, b) => {
    const po = ordenPrioridad[a.prioridad] - ordenPrioridad[b.prioridad]
    if (po !== 0) return po
    const da = a.fechaEvento ? new Date(a.fechaEvento).getTime() : 0
    const db = b.fechaEvento ? new Date(b.fechaEvento).getTime() : 0
    return db - da
  })

  return { items, total: items.length }
}
