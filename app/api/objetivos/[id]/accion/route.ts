import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  getObjetivo, updateObjetivo, getPrograma,
  createCumplimiento, updateCumplimiento, crearLogEvento,
  getUsuarios,
} from '@/lib/airtable'
import { getAprobadorEfectivo } from '@/lib/types'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const usuarioId = (session.user as any).id as string
  const rol = (session.user as any).role as string
  const isEjecutivo = rol === 'Ejecutivo'
  const isProgramManager = rol === 'Program Manager'
  const puedeSupervision = isEjecutivo || isProgramManager

  const body = await req.json()
  const { accion, datos } = body

  try {
    const objetivo = await getObjetivo(id)
    const programa = objetivo.programaIds[0]
      ? await getPrograma(objetivo.programaIds[0]).catch(() => null)
      : null
    const aprobadorEfectivo = programa
      ? getAprobadorEfectivo(objetivo, programa)
      : objetivo.aprobadorId
    const esAprobador = usuarioId === aprobadorEfectivo
    const esResponsable = usuarioId === objetivo.responsableId
    const estadosTerminales = ['Completado', 'Cancelado', 'Incumplido']

    switch (accion) {

      case 'aceptar': {
        if (objetivo.estado !== 'Asignado') return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
        if (!esResponsable) return NextResponse.json({ error: 'Solo el responsable puede aceptar' }, { status: 403 })
        await updateObjetivo(id, { estado: 'No iniciado' })
        await crearLogEvento({ objetivoId: id, tipoEvento: 'Aceptado', usuarioId })
        return NextResponse.json({ ok: true })
      }

      case 'pedir_clarificacion': {
        if (objetivo.estado !== 'Asignado') return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
        if (!esResponsable) return NextResponse.json({ error: 'Solo el responsable puede pedir clarificación' }, { status: 403 })
        if (!datos?.texto?.trim()) return NextResponse.json({ error: 'Se requiere texto de clarificación' }, { status: 400 })
        await crearLogEvento({ objetivoId: id, tipoEvento: 'Clarificación Solicitada', usuarioId, notas: datos.texto })
        return NextResponse.json({ ok: true })
      }

      case 'responder_clarificacion': {
        if (!isEjecutivo && !esAprobador) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
        if (!datos?.texto?.trim()) return NextResponse.json({ error: 'Se requiere texto de respuesta' }, { status: 400 })
        await crearLogEvento({ objetivoId: id, tipoEvento: 'Clarificación Respondida', usuarioId, notas: datos.texto })
        return NextResponse.json({ ok: true })
      }

      case 'iniciar': {
        if (objetivo.estado !== 'No iniciado') return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
        if (!esResponsable) return NextResponse.json({ error: 'Solo el responsable puede iniciar' }, { status: 403 })
        await updateObjetivo(id, { estado: 'En curso', fechaInicioReal: new Date().toISOString() })
        await crearLogEvento({ objetivoId: id, tipoEvento: 'Iniciado', usuarioId })
        return NextResponse.json({ ok: true })
      }

      case 'reportar_cumplimiento': {
        if (objetivo.estado !== 'En curso') return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
        if (!esResponsable) return NextResponse.json({ error: 'Solo el responsable puede reportar cumplimiento' }, { status: 403 })
        if (!datos?.descripcion?.trim()) return NextResponse.json({ error: 'Se requiere descripción del cumplimiento' }, { status: 400 })
        const hoy = new Date().toISOString().split('T')[0]
        await createCumplimiento({
          objetivoIds: [id],
          reportadoPorId: usuarioId,
          fecha: hoy,
          descripcionCumplimiento: datos.descripcion,
          aprobado: false,
          rechazado: false,
        })
        await updateObjetivo(id, {
          estado: 'Completado pendiente',
          fechaCumplimientoReportado: new Date().toISOString(),
        })
        await crearLogEvento({ objetivoId: id, tipoEvento: 'Cumplimiento Reportado', usuarioId, notas: datos.descripcion })
        return NextResponse.json({ ok: true })
      }

      case 'aprobar_cumplimiento': {
        if (objetivo.estado !== 'Completado pendiente') return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
        if (!esAprobador) return NextResponse.json({ error: 'Solo el aprobador puede aprobar' }, { status: 403 })
        if (esResponsable) return NextResponse.json({ error: 'El responsable no puede aprobar sus propios cumplimientos' }, { status: 403 })
        if (!datos?.cumplimientoId) return NextResponse.json({ error: 'Se requiere cumplimientoId' }, { status: 400 })
        await updateCumplimiento(datos.cumplimientoId, { aprobado: true, aprobadoPorId: usuarioId })
        const nuevoEstado = objetivo.esRepetible ? 'En curso' : 'Completado'
        await updateObjetivo(id, { estado: nuevoEstado })
        await crearLogEvento({ objetivoId: id, tipoEvento: 'Cumplimiento Aprobado', usuarioId })
        if (objetivo.esRepetible) {
          await crearLogEvento({ objetivoId: id, tipoEvento: 'Reabierto', usuarioId })
        }
        return NextResponse.json({ ok: true })
      }

      case 'rechazar_cumplimiento': {
        if (objetivo.estado !== 'Completado pendiente') return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
        if (!esAprobador) return NextResponse.json({ error: 'Solo el aprobador puede rechazar' }, { status: 403 })
        if (esResponsable) return NextResponse.json({ error: 'El responsable no puede rechazar sus propios cumplimientos' }, { status: 403 })
        if (!datos?.cumplimientoId) return NextResponse.json({ error: 'Se requiere cumplimientoId' }, { status: 400 })
        if (!datos?.motivo?.trim()) return NextResponse.json({ error: 'Se requiere motivo de rechazo' }, { status: 400 })
        await updateCumplimiento(datos.cumplimientoId, { rechazado: true, motivoRechazo: datos.motivo })
        await updateObjetivo(id, { estado: 'En curso' })
        await crearLogEvento({ objetivoId: id, tipoEvento: 'Cumplimiento Rechazado por Aprobador', usuarioId, notas: datos.motivo })
        return NextResponse.json({ ok: true })
      }

      case 'rechazar_objetivo': {
        const estadosPermitidos = ['Asignado', 'No iniciado', 'En curso']
        if (!estadosPermitidos.includes(objetivo.estado)) return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
        if (!esResponsable) return NextResponse.json({ error: 'Solo el responsable puede rechazar el objetivo' }, { status: 403 })
        if (!datos?.motivo?.trim()) return NextResponse.json({ error: 'Se requiere motivo' }, { status: 400 })
        await updateObjetivo(id, { estado: 'Rechazado' })
        await crearLogEvento({ objetivoId: id, tipoEvento: 'Objetivo Rechazado', usuarioId, notas: datos.motivo })
        return NextResponse.json({ ok: true })
      }

      case 'solicitar_modificacion': {
        const estadosPermitidos = ['No iniciado', 'En curso']
        if (!estadosPermitidos.includes(objetivo.estado)) return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
        if (!esResponsable) return NextResponse.json({ error: 'Solo el responsable puede solicitar modificación' }, { status: 403 })
        if (!datos?.justificacion?.trim() || !datos?.propuesta?.trim()) return NextResponse.json({ error: 'Se requieren justificación y propuesta' }, { status: 400 })
        await updateObjetivo(id, { estado: 'Modificación solicitada' })
        await crearLogEvento({
          objetivoId: id,
          tipoEvento: 'Modificación Solicitada',
          usuarioId,
          notas: `Justificación: ${datos.justificacion}\nPropuesta: ${datos.propuesta}`,
        })
        return NextResponse.json({ ok: true })
      }

      case 'aprobar_modificacion': {
        if (!isEjecutivo && !esAprobador) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
        if (objetivo.estado !== 'Modificación solicitada') return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
        if (!datos?.textoFinal?.trim()) return NextResponse.json({ error: 'Se requiere texto final' }, { status: 400 })
        const estadoAnterior = datos?.estadoAnterior ?? 'En curso'
        const fechaModificacion = new Date().toLocaleDateString('es-AR', {
          day: '2-digit', month: '2-digit', year: 'numeric',
        })
        const descripcionActual = objetivo.descripcionDoingness ?? ''
        const nuevaDescripcion = descripcionActual
          ? `${descripcionActual}\n\n--- MODIFICADO ${fechaModificacion} ---\n\n${datos.textoFinal.trim()}`
          : datos.textoFinal.trim()
        await updateObjetivo(id, { estado: estadoAnterior, descripcionDoingness: nuevaDescripcion })
        await crearLogEvento({
          objetivoId: id,
          tipoEvento: 'Modificación Aprobada',
          usuarioId,
          notas: `Texto final: ${datos.textoFinal.trim()}`,
        })
        return NextResponse.json({ ok: true })
      }

      case 'rechazar_modificacion': {
        if (!isEjecutivo && !esAprobador) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
        if (objetivo.estado !== 'Modificación solicitada') return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
        if (!datos?.motivo?.trim()) return NextResponse.json({ error: 'Se requiere motivo' }, { status: 400 })
        const estadoAnterior = datos?.estadoAnterior ?? 'En curso'
        await updateObjetivo(id, { estado: estadoAnterior })
        await crearLogEvento({ objetivoId: id, tipoEvento: 'Modificación Rechazada', usuarioId, notas: `Motivo: ${datos.motivo}` })
        return NextResponse.json({ ok: true })
      }

      case 'declarar_incumplido': {
        if (!puedeSupervision && !esAprobador) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
        if (estadosTerminales.includes(objetivo.estado)) return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
        if (!datos?.motivo?.trim()) return NextResponse.json({ error: 'Se requiere motivo' }, { status: 400 })
        if (datos?.nuevoResponsableId) {
          await updateObjetivo(id, { estado: 'Asignado', responsableId: datos.nuevoResponsableId })
          await crearLogEvento({ objetivoId: id, tipoEvento: 'Incumplido Declarado', usuarioId, notas: datos.motivo })
          await crearLogEvento({ objetivoId: id, tipoEvento: 'Reasignado', usuarioId, notas: 'Reasignado a nuevo responsable' })
        } else {
          await updateObjetivo(id, { estado: 'Incumplido' })
          await crearLogEvento({ objetivoId: id, tipoEvento: 'Incumplido Declarado', usuarioId, notas: datos.motivo })
        }
        return NextResponse.json({ ok: true })
      }

      case 'cancelar': {
        if (!puedeSupervision && !esAprobador) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
        if (['Completado', 'Cancelado'].includes(objetivo.estado)) return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
        if (!datos?.motivo?.trim()) return NextResponse.json({ error: 'Se requiere motivo' }, { status: 400 })
        await updateObjetivo(id, { estado: 'Cancelado' })
        await crearLogEvento({ objetivoId: id, tipoEvento: 'Cancelado', usuarioId, notas: datos.motivo })
        return NextResponse.json({ ok: true })
      }

      case 'desatorar': {
        if (!puedeSupervision && !esAprobador) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
        if (!datos?.causa?.trim() || !datos?.accionCorrectiva?.trim()) return NextResponse.json({ error: 'Se requieren causa y acción correctiva' }, { status: 400 })
        await crearLogEvento({
          objetivoId: id,
          tipoEvento: 'Desatoramiento',
          usuarioId,
          notas: `Causa: ${datos.causa}\nAcción correctiva: ${datos.accionCorrectiva}`,
        })
        return NextResponse.json({ ok: true })
      }

      default:
        return NextResponse.json({ error: `Acción desconocida: ${accion}` }, { status: 400 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
