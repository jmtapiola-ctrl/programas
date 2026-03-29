import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getObjetivo, getPrograma, getCumplimientos, getLogObjetivo, getUsuariosByIds } from '@/lib/airtable'
import { notFound } from 'next/navigation'
import { getAprobadorEfectivo } from '@/lib/types'
import { ObjetivoDetalle } from '@/components/objetivos/ObjetivoDetalle'

export default async function ObjetivoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) notFound()

  const userId = (session.user as any).id as string
  const isEjecutivo = (session.user as any).role === 'Ejecutivo'

  let objetivo
  try {
    objetivo = await getObjetivo(id)
  } catch {
    notFound()
  }

  const [programa, cumplimientos, log] = await Promise.all([
    objetivo.programaIds[0]
      ? getPrograma(objetivo.programaIds[0]).catch(() => null)
      : Promise.resolve(null),
    getCumplimientos(id),
    getLogObjetivo(id).catch(() => []),
  ])

  // Resolver todos los IDs de usuario que aparecen en la página
  const todosIds = [
    objetivo.responsableId,
    objetivo.aprobadorId,
    programa?.aprobadorId,
    ...log.map((e: any) => e.usuarioId),
    ...cumplimientos.map(c => c.reportadoPorId),
    ...cumplimientos.map(c => c.aprobadoPorId),
  ].filter((id): id is string => !!id)

  const usuariosMap = await getUsuariosByIds(todosIds)

  const aprobadorEfectivo = programa
    ? getAprobadorEfectivo(objetivo, programa)
    : objetivo.aprobadorId

  return (
    <ObjetivoDetalle
      objetivo={objetivo}
      programa={programa}
      cumplimientos={cumplimientos}
      log={log}
      usuariosMap={usuariosMap}
      userId={userId}
      isEjecutivo={isEjecutivo}
      aprobadorEfectivo={aprobadorEfectivo}
    />
  )
}
