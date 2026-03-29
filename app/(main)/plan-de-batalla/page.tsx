import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPlanesDB, getUsuarios } from '@/lib/airtable'
import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import type { Usuario } from '@/lib/types'

export default async function PlanesDBPage() {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id
  const isEjecutivo = (session?.user as any)?.role === 'Ejecutivo'

  let planes: Awaited<ReturnType<typeof getPlanesDB>> = []
  let usuarios: Usuario[] = []

  try {
    if (isEjecutivo) {
      [planes, usuarios] = await Promise.all([getPlanesDB(), getUsuarios()])
    } else {
      [planes, usuarios] = await Promise.all([getPlanesDB(userId), getUsuarios()])
    }
  } catch {}

  const usuariosMap = Object.fromEntries(usuarios.map(u => [u.id, u]))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white">Planes de Batalla</h1>
            <Tooltip texto="Una lista de objetivos para el día o la semana siguiente, que ayudan al avance de la planificación estratégica, y se ocupan de las acciones inmediatas y de los puntos fuera que la estorban." />
          </div>
          <p className="text-gray-400 text-sm mt-1">{planes.length} plan{planes.length !== 1 ? 'es' : ''}</p>
        </div>
        <Link
          href="/plan-de-batalla/nuevo"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuevo Plan
        </Link>
      </div>

      {planes.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p>Sin planes de batalla. Creá el primero.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {planes.map(pb => {
            const responsables = pb.responsableIds.map(id => usuariosMap[id]).filter(Boolean)
            return (
              <Link
                key={pb.id}
                href={`/plan-de-batalla/${pb.id}`}
                className="flex items-center justify-between bg-gray-800 border border-gray-700 hover:border-gray-600 rounded-lg p-4 transition-all"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge estadoPB={pb.estado} />
                    <span className="text-xs text-gray-500">{pb.periodo} · {pb.fecha ?? '—'}</span>
                  </div>
                  <p className="text-gray-100 font-medium">{pb.titulo}</p>
                  {responsables.length > 0 && (
                    <p className="text-gray-400 text-xs mt-0.5">{responsables.map((r: any) => r.nombre).join(', ')}</p>
                  )}
                </div>
                <div className="text-gray-500 text-sm flex-shrink-0">
                  {pb.objetivosIncluidosIds.length} obj.
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
