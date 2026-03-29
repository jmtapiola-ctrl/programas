import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPrograma, getObjetivos, getUsuarios } from '@/lib/airtable'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import { ObjetivoCard } from '@/components/objetivos/ObjetivoCard'
import { sortObjetivos } from '@/lib/types'
import type { TipoObjetivo, Usuario } from '@/lib/types'

const TIPO_GRUPOS: TipoObjetivo[] = ['Primario', 'Vital', 'Condicional', 'Operativo', 'Producción', 'Mayor']
const ESTADOS_PROBLEMA = ['Incumplido', 'Rechazado', 'Modificación solicitada'] as const

export default async function ProgramaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const isEjecutivo = (session?.user as any)?.role === 'Ejecutivo'
  const userId = (session?.user as any)?.id as string | undefined

  let programa: Awaited<ReturnType<typeof getPrograma>>
  try {
    programa = await getPrograma(id)
  } catch {
    notFound()
  }

  const [objetivos, usuarios] = await Promise.all([
    getObjetivos(id),
    getUsuarios(),
  ])

  const usuariosMap = Object.fromEntries(usuarios.map((u: Usuario) => [u.id, u]))
  const sortedObjetivos = sortObjetivos(objetivos)
  const responsables = programa.responsableIds.map(rid => usuariosMap[rid]).filter(Boolean)
  const aprobador = programa.aprobadorId ? usuariosMap[programa.aprobadorId] : undefined

  const puedeAgregarObjetivo = isEjecutivo || (userId != null && programa.responsableIds.includes(userId))

  const problematicos = sortedObjetivos.filter(o =>
    (o.tipo === 'Primario' || o.tipo === 'Vital') &&
    (ESTADOS_PROBLEMA as readonly string[]).includes(o.estado)
  )
  const hayIncumplido = problematicos.some(o => o.estado === 'Incumplido')

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 flex items-center gap-2">
        <Link href="/programas" className="hover:text-gray-300">Programas</Link>
        <span>/</span>
        <span className="text-gray-300">{programa.nombre}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Badge estadoPrograma={programa.estado} />
          </div>
          <h1 className="text-2xl font-bold text-white">{programa.nombre}</h1>
          {responsables.length > 0 && (
            <p className="text-gray-400 text-sm mt-1">Responsable: {responsables.map((r: any) => r.nombre).join(', ')}</p>
          )}
          {aprobador && (
            <p className="text-gray-500 text-xs mt-0.5">Aprobador: {aprobador.nombre}</p>
          )}
        </div>
        {puedeAgregarObjetivo && (
          <div className="flex gap-2 flex-shrink-0">
            <Link
              href={`/objetivos/nuevo?programaId=${id}`}
              className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 border border-gray-600 rounded-md transition-colors"
            >
              + Objetivo
            </Link>
          </div>
        )}
      </div>

      {/* Banner de alerta de problemas */}
      {problematicos.length > 0 && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 text-red-200">
          <p className="font-semibold mb-2">⚠ Objetivos con problemas detectados</p>
          <ul className="space-y-1">
            {problematicos.map(o => (
              <li key={o.id} className="text-sm">
                ⚠ Objetivo {o.tipo} con problema: <strong>{o.nombre}</strong>
                {' '}<span className="text-red-300">({o.estado})</span>
              </li>
            ))}
          </ul>
          {hayIncumplido && (
            <p className="mt-2 text-sm text-red-300 font-medium">
              Los demás objetivos de este programa no pueden avanzar hasta que se resuelva.
            </p>
          )}
        </div>
      )}

      {/* Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {programa.proposito ? (
          <div className="md:col-span-3 bg-blue-900/20 border border-blue-800/40 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs text-blue-400 font-medium uppercase tracking-wider">Propósito</p>
              <Tooltip texto="Los propósitos tienen que ejecutarse. Son algo que HACER." />
            </div>
            <p className="text-gray-200">{programa.proposito}</p>
          </div>
        ) : isEjecutivo ? (
          <div className="md:col-span-3 bg-gray-800/50 border border-gray-700 border-dashed rounded-lg p-4 flex items-center justify-between">
            <p className="text-gray-500 text-sm">Sin propósito definido</p>
            <Link href={`/programas/${id}/editar`} className="text-blue-400 hover:text-blue-300 text-sm">
              Editar programa →
            </Link>
          </div>
        ) : null}
        {programa.objetivoMayor && (
          <div className="md:col-span-3 bg-purple-900/20 border border-purple-800/40 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs text-purple-400 font-medium uppercase tracking-wider">Objetivo Mayor</p>
              <Tooltip texto={'El propósito general deseable que se acomete. Esto es muy general, como "llegar a ser auditor".'} />
            </div>
            <p className="text-gray-200">{programa.objetivoMayor}</p>
          </div>
        )}
        {programa.descripcion && (
          <div className="md:col-span-2 bg-gray-800 border border-gray-700 rounded-lg p-4">
            <p className="text-xs text-gray-500 font-medium mb-1 uppercase tracking-wider">Descripción</p>
            <p className="text-gray-300 text-sm">{programa.descripcion}</p>
          </div>
        )}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-2">
          {programa.fechaInicio && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Inicio</p>
              <p className="text-gray-300 text-sm">{programa.fechaInicio}</p>
            </div>
          )}
          {programa.fechaObjetivo && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Fecha Objetivo</p>
              <p className="text-gray-300 text-sm">{programa.fechaObjetivo}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider">Objetivos</p>
            <p className="text-gray-300 text-sm">{objetivos.length}</p>
          </div>
        </div>
      </div>

      {/* Objetivos por tipo */}
      {TIPO_GRUPOS.map(tipo => {
        const grupo = sortedObjetivos.filter(o => o.tipo === tipo)
        if (grupo.length === 0) return null
        return (
          <div key={tipo}>
            <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Badge tipo={tipo} />
              {tipo} ({grupo.length})
            </h2>
            <div className="space-y-2">
              {grupo.map(obj => (
                <ObjetivoCard
                  key={obj.id}
                  objetivo={obj}
                  responsable={usuariosMap[obj.responsableId]}
                  cumplimientosRecientes={0}
                />
              ))}
            </div>
          </div>
        )
      })}

      {objetivos.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p>Este programa no tiene objetivos aún.</p>
          {puedeAgregarObjetivo && (
            <Link href={`/objetivos/nuevo?programaId=${id}`} className="mt-2 inline-block text-blue-400 hover:text-blue-300 text-sm">
              Agregar primer objetivo →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
