import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getProgramas, getObjetivos, getObjetivosByResponsable, getPlanesDB } from '@/lib/airtable'
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
  const userId = (session?.user as any)?.id

  let programas: Awaited<ReturnType<typeof getProgramas>> = []
  let objetivos: Objetivo[] = []
  let misObjetivos: Objetivo[] = []
  let misPlanesHoy: Awaited<ReturnType<typeof getPlanesDB>> = []

  const hoy = new Date().toISOString().split('T')[0]

  try {
    if (isEjecutivo) {
      programas = await getProgramas()
      objetivos = await getObjetivos()
    } else {
      // Staff: load their objectives and today's plan
      misObjetivos = await getObjetivosByResponsable(userId)
      const todosPlanes = await getPlanesDB(userId)
      misPlanesHoy = todosPlanes.filter(pb =>
        pb.fecha === hoy && (pb.estado === 'Activo' || pb.estado === 'Borrador')
      )
    }
  } catch {
    // Muestra UI vacía si Airtable no está configurado
  }

  const programasActivos = programas.filter(p => p.estado === 'Activo')
  const objetivosPendientes = objetivos.filter(o => o.estado === 'Pendiente' || o.estado === 'En curso')
  const objetivosCumplidos = objetivos.filter(o => o.estado === 'Cumplido')
  const objetivosIncumplidos = objetivos.filter(o => o.estado === 'Incumplido')
  const criticos = objetivos.filter(o => (o.tipo === 'Primario' || o.tipo === 'Vital') && o.estado === 'Incumplido')

  // Programas en riesgo (Ejecutivo): objetivos con fecha vencida
  const objetivosEnRiesgo = objetivos.filter(o =>
    o.fechaLimite && o.fechaLimite < hoy &&
    (o.estado === 'Pendiente' || o.estado === 'En curso')
  )
  const programaIdsEnRiesgo = new Set(objetivosEnRiesgo.flatMap(o => o.programaIds))
  const programasEnRiesgo = programas.filter(p => programaIdsEnRiesgo.has(p.id))

  // Staff: objetivos pendientes/en curso
  const misObjetivosPendientes = misObjetivos.filter(o => o.estado === 'Pendiente' || o.estado === 'En curso')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">Bienvenido, {session?.user?.name}</p>
      </div>

      {/* VISTA STAFF */}
      {!isEjecutivo && (
        <>
          {/* PB de hoy */}
          {misPlanesHoy.length > 0 ? (
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
              <h2 className="font-semibold text-gray-100 mb-3">Tu Plan de Batalla de hoy</h2>
              <div className="space-y-2">
                {misPlanesHoy.map(pb => (
                  <Link
                    key={pb.id}
                    href={`/plan-de-batalla/${pb.id}`}
                    className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0 hover:text-blue-400 transition-colors"
                  >
                    <span className="text-gray-200 font-medium">{pb.titulo}</span>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      <Badge estadoPB={pb.estado} />
                      <span className="text-gray-500 text-sm">{pb.objetivosIncluidosIds.length} obj.</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-blue-900/20 border border-blue-700/40 rounded-lg p-6 text-center">
              <p className="text-blue-300 font-medium mb-3">No tenés un Plan de Batalla para hoy</p>
              <Link
                href="/plan-de-batalla/nuevo"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Crear Plan de Batalla para hoy
              </Link>
            </div>
          )}

          {/* Mis objetivos */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-100">Mis Objetivos Pendientes</h2>
              <span className="text-sm text-gray-400">{misObjetivosPendientes.length} objetivos</span>
            </div>
            {misObjetivosPendientes.length === 0 ? (
              <p className="text-gray-500 text-sm">Sin objetivos pendientes asignados.</p>
            ) : (
              <div className="space-y-2">
                {misObjetivosPendientes.slice(0, 8).map(o => (
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
        </>
      )}

      {/* VISTA EJECUTIVO */}
      {isEjecutivo && (
        <>
          {/* Alertas */}
          {criticos.length > 0 && (
            <div className="bg-red-950/40 border border-red-700 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="text-red-300 font-medium">
                    {criticos.length} Objetivo{criticos.length > 1 ? 's' : ''} Crítico{criticos.length > 1 ? 's' : ''} Incumplido{criticos.length > 1 ? 's' : ''}
                  </p>
                  <p className="text-red-400 text-sm mt-0.5">Los objetivos Primarios y Vitales incumplidos rompen la cadena del programa.</p>
                  <div className="mt-2 space-y-1">
                    {criticos.slice(0, 3).map(o => (
                      <Link key={o.id} href={`/objetivos/${o.id}`} className="block text-sm text-red-300 hover:text-red-200 underline">
                        [{o.tipo}] {o.nombre}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Programas Activos" value={programasActivos.length} sub={`${programas.length} total`} />
            <StatCard label="Objetivos Pendientes" value={objetivosPendientes.length} />
            <StatCard label="Cumplidos" value={objetivosCumplidos.length} />
            <StatCard label="Incumplidos" value={objetivosIncumplidos.length} />
          </div>

          {/* Accesos rápidos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

          {/* Programas en riesgo */}
          {programasEnRiesgo.length > 0 && (
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
              <h2 className="font-semibold text-gray-100 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-orange-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>Programas en riesgo</span>
                <span className="text-xs text-orange-400 font-normal">({programasEnRiesgo.length} con objetivos vencidos)</span>
              </h2>
              <div className="space-y-2">
                {programasEnRiesgo.slice(0, 5).map(p => {
                  const objVencidos = objetivosEnRiesgo.filter(o => o.programaIds.includes(p.id))
                  return (
                    <Link key={p.id} href={`/programas/${p.id}`} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0 hover:text-blue-400 transition-colors">
                      <span className="text-sm text-gray-200">{p.nombre}</span>
                      <span className="text-xs text-orange-400 flex-shrink-0 ml-2">{objVencidos.length} obj. vencido{objVencidos.length !== 1 ? 's' : ''}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
