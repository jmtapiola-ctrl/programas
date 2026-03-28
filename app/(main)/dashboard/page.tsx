import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getProgramas } from '@/lib/airtable'
import { getObjetivos } from '@/lib/airtable'
import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import type { Objetivo } from '@/lib/types'

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
      <p className="text-gray-400 text-sm">{label}</p>
      <p className="text-3xl font-bold text-white mt-1">{value}</p>
      {sub && <p className="text-gray-500 text-xs mt-1">{sub}</p>}
    </div>
  )
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  const isEjecutivo = (session?.user as any)?.role === 'Ejecutivo'

  let programas: Awaited<ReturnType<typeof getProgramas>> = []
  let objetivos: Objetivo[] = []

  try {
    if (isEjecutivo) {
      programas = await getProgramas()
      objetivos = await getObjetivos()
    } else {
      objetivos = await getObjetivos()
    }
  } catch {
    // Muestra UI vacía si Airtable no está configurado
  }

  const programasActivos = programas.filter(p => p.estado === 'Activo')
  const objetivosPendientes = objetivos.filter(o => o.estado === 'Pendiente' || o.estado === 'En curso')
  const objetivosCumplidos = objetivos.filter(o => o.estado === 'Cumplido')
  const objetivosIncumplidos = objetivos.filter(o => o.estado === 'Incumplido')
  const primariosCriticos = objetivos.filter(o => o.tipo === 'Primario' && o.estado === 'Incumplido')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">Bienvenido, {session?.user?.name}</p>
      </div>

      {/* Alertas */}
      {primariosCriticos.length > 0 && (
        <div className="bg-red-950/40 border border-red-700 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="text-red-300 font-medium">
                {primariosCriticos.length} Objetivo{primariosCriticos.length > 1 ? 's' : ''} Primario{primariosCriticos.length > 1 ? 's' : ''} Incumplido{primariosCriticos.length > 1 ? 's' : ''}
              </p>
              <p className="text-red-400 text-sm mt-0.5">Los objetivos primarios incumplidos rompen la cadena del programa.</p>
              <div className="mt-2 space-y-1">
                {primariosCriticos.slice(0, 3).map(o => (
                  <Link key={o.id} href={`/objetivos/${o.id}`} className="block text-sm text-red-300 hover:text-red-200 underline">
                    {o.nombre}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isEjecutivo && <StatCard label="Programas Activos" value={programasActivos.length} sub={`${programas.length} total`} />}
        <StatCard label="Objetivos Pendientes" value={objetivosPendientes.length} />
        <StatCard label="Cumplidos" value={objetivosCumplidos.length} />
        <StatCard label="Incumplidos" value={objetivosIncumplidos.length} />
      </div>

      {/* Accesos rápidos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isEjecutivo && (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-100">Programas Activos</h2>
              <Link href="/programas" className="text-sm text-blue-400 hover:text-blue-300">Ver todos</Link>
            </div>
            {programasActivos.length === 0 ? (
              <p className="text-gray-500 text-sm">Sin programas activos.</p>
            ) : (
              <div className="space-y-2">
                {programasActivos.slice(0, 5).map(p => (
                  <Link key={p.id} href={`/programas/${p.id}`} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0 hover:text-blue-400 transition-colors">
                    <span className="text-sm text-gray-200">{p.nombre}</span>
                    <Badge estadoPrograma={p.estado} />
                  </Link>
                ))}
              </div>
            )}
            <Link href="/programas/nuevo" className="mt-4 inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nuevo programa
            </Link>
          </div>
        )}

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-100">Objetivos Recientes</h2>
            <Link href="/plan-de-batalla" className="text-sm text-blue-400 hover:text-blue-300">Plan de batalla</Link>
          </div>
          {objetivosPendientes.length === 0 ? (
            <p className="text-gray-500 text-sm">Sin objetivos pendientes.</p>
          ) : (
            <div className="space-y-2">
              {objetivosPendientes.slice(0, 5).map(o => (
                <Link key={o.id} href={`/objetivos/${o.id}`} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0 hover:text-blue-400 transition-colors">
                  <span className="text-sm text-gray-200 line-clamp-1">{o.nombre}</span>
                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                    <Badge tipo={o.tipo} />
                    <Badge estadoObjetivo={o.estado} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
