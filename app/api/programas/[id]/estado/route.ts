import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPrograma, updatePrograma } from '@/lib/airtable'
import type { EstadoPrograma } from '@/lib/types'

const ESTADOS_VALIDOS: EstadoPrograma[] = ['Borrador', 'Activo', 'Completado', 'Archivado']

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id } = await params
  const rol = (session.user as any)?.role as string
  const userId = (session.user as any)?.id as string

  const body = await req.json()
  const { estado } = body as { estado: string }

  if (!ESTADOS_VALIDOS.includes(estado as EstadoPrograma)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
  }

  // Verificar que el programa existe y que el usuario tiene permiso
  let programa
  try {
    programa = await getPrograma(id)
  } catch {
    return NextResponse.json({ error: 'Programa no encontrado' }, { status: 404 })
  }

  const esEjecutivo = rol === 'Ejecutivo'
  const esResponsable = programa.responsableIds.includes(userId)
  if (!esEjecutivo && !esResponsable) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  await updatePrograma(id, { estado: estado as EstadoPrograma })
  return NextResponse.json({ ok: true })
}
