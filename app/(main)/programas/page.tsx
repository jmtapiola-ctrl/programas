import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getProgramas, getUsuarios, getObjetivos } from '@/lib/airtable'
import { ProgramaCard } from '@/components/programas/ProgramaCard'
import Link from 'next/link'
import type { Usuario, Objetivo } from '@/lib/types'

const ORDEN_ESTADO_PROGRAMA: Record<string, number> = {
  'Activo': 0, 'Borrador': 1, 'Completado': 2, 'Archivado': 3
}
const ESTADOS_PROBLEMA = ['Incumplido', 'Rechazado', 'Modificación solicitada']

export default async function ProgramasPage() {
  const session = await getServerSession(authOptions)
  const isEjecutivo = (session?.user as any)?.role === 'Ejecutivo'
  if (!isEjecutivo) redirect('/')

  let programas: Awaited<ReturnType<typeof getProgramas>> = []
  let usuarios: Usuario[] = []
  let todosObjetivos: Objetivo[] = []
  let error = ''

  try {
    [programas, usuarios, todosObjetivos] = await Promise.all([getProgramas(), getUsuarios(), getObjetivos()])
  } catch (e: any) {
    error = e.message
  }

  const usuariosMap = Object.fromEntries(usuarios.map(u => [u.id, u]))
  const programasOrdenados = [...programas].sort((a, b) =>
    (ORDEN_ESTADO_PROGRAMA[a.estado] ?? 9) - (ORDEN_ESTADO_PROGRAMA[b.estado] ?? 9)
  )

  // Build map of objetivos problemáticos por programa
  const conAlertas = new Set<string>()
  for (const obj of todosObjetivos) {
    if (ESTADOS_PROBLEMA.includes(obj.estado)) {
      for (const pid of obj.programaIds) {
        conAlertas.add(pid)
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Programas</h1>
          <p className="text-gray-400 text-sm mt-1">{programas.length} programa{programas.length !== 1 ? 's' : ''}</p>
        </div>
        <Link
          href="/programas/nuevo"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuevo Programa
        </Link>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded p-3 text-sm text-red-300">
          Error al cargar: {error}
        </div>
      )}

      {programas.length === 0 && !error ? (
        <div className="text-center py-16 text-gray-500">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p>No hay programas. Creá el primero.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {programasOrdenados.map(p => (
            <ProgramaCard
              key={p.id}
              programa={p}
              responsables={p.responsableIds.map(id => usuariosMap[id]).filter(Boolean)}
              objetivosCount={p.objetivoIds.length}
              tieneAlertas={conAlertas.has(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
