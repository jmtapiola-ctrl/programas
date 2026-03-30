import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getProgramas, getProgramasVisiblesParaUsuario, getUsuarios, getObjetivos } from '@/lib/airtable'
import { ProgramaCard } from '@/components/programas/ProgramaCard'
import Link from 'next/link'
import { puedeVerTodo, puedeCrearProgramas } from '@/lib/types'
import type { Usuario, Objetivo } from '@/lib/types'
import { NuevoProgramaButton } from '@/components/programas/NuevoProgramaButton'

const ORDEN_ESTADO_PROGRAMA: Record<string, number> = {
  'Activo': 0, 'Borrador': 1, 'Completado': 2, 'Archivado': 3
}
const ESTADOS_PROBLEMA = ['Incumplido', 'Rechazado', 'Modificación solicitada']

export default async function ProgramasPage() {
  const session = await getServerSession(authOptions)
  const rol = (session?.user as any)?.role as string
  const userId = (session?.user as any)?.id as string

  if (!rol) redirect('/')

  const verTodo = puedeVerTodo(rol as any)
  const puedeCrear = puedeCrearProgramas(rol as any)

  let programas: Awaited<ReturnType<typeof getProgramas>> = []
  let usuarios: Usuario[] = []
  let todosObjetivos: Objetivo[] = []
  let error = ''

  try {
    if (verTodo) {
      ;[programas, usuarios, todosObjetivos] = await Promise.all([
        getProgramas(),
        getUsuarios(),
        getObjetivos(),
      ])
    } else {
      // Operador: solo programas donde está asignado o tiene objetivos
      ;[programas, usuarios] = await Promise.all([
        getProgramasVisiblesParaUsuario(userId),
        getUsuarios(),
      ])
    }
  } catch (e: any) {
    error = e.message
  }

  const usuariosMap = Object.fromEntries(usuarios.map(u => [u.id, u]))
  const programasOrdenados = [...programas].sort((a, b) =>
    (ORDEN_ESTADO_PROGRAMA[a.estado] ?? 9) - (ORDEN_ESTADO_PROGRAMA[b.estado] ?? 9)
  )

  // Split into borradores and active/rest
  const borradores = programasOrdenados.filter(p => p.estado === 'Borrador')
  const activos = programasOrdenados.filter(p => p.estado !== 'Borrador')

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
          <h1 className="text-2xl font-bold text-foreground">Programas</h1>
          <p className="text-muted-foreground text-sm mt-1">{programas.length} programa{programas.length !== 1 ? 's' : ''}</p>
        </div>
        {puedeCrear && <NuevoProgramaButton />}
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded p-3 text-sm text-red-300">
          Error al cargar: {error}
        </div>
      )}

      {/* Borradores section */}
      {puedeCrear && borradores.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <span>📝</span> Borradores ({borradores.length})
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {borradores.map(p => (
              <div key={p.id} className="bg-card border border-dashed border-border rounded-lg p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{p.nombre}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Borrador · {p.objetivoIds.length} objetivo{p.objetivoIds.length !== 1 ? 's' : ''}</p>
                </div>
                <Link
                  href={`/programas/nuevo/wizard?programaId=${p.id}`}
                  className="px-3 py-1.5 text-xs font-medium bg-muted hover:bg-accent text-foreground rounded-md transition-colors whitespace-nowrap"
                >
                  Continuar wizard →
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {programas.length === 0 && !error ? (
        <div className="text-center py-16 text-muted-foreground">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p>No hay programas asignados.</p>
        </div>
      ) : activos.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {activos.map(p => (
            <ProgramaCard
              key={p.id}
              programa={p}
              responsables={p.responsableIds.map(id => usuariosMap[id]).filter(Boolean)}
              objetivosCount={p.objetivoIds.length}
              tieneAlertas={conAlertas.has(p.id)}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
