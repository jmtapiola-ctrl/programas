import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getProgramas, getObjetivos, getObjetivosByResponsable, getPlanesDB, getUsuariosByIds } from '@/lib/airtable'
import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { AprobacionesSection } from '@/components/dashboard/AprobacionesSection'
import { isVencido, getAprobadorEfectivo, sortObjetivos } from '@/lib/types'
import type { Objetivo, Programa, EstadoObjetivo } from '@/lib/types'

function StatCard({ label, value, sub, href }: { label: string; value: number | string; sub?: string; href?: string }) {
  const inner = (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-5 hover:border-gray-600 transition-colors">
      <p className="text-gray-400 text-sm">{label}</p>
      <p className="text-3xl font-bold text-white mt-1">{value}</p>
      {sub && <p className="text-gray-500 text-xs mt-1">{sub}</p>}
    </div>
  )
  if (href) return <Link href={href}>{inner}</Link>
  return inner
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  const isEjecutivo = (session?.user as any)?.role === 'Ejecutivo'
  const userId = (session?.user as any)?.id as string

  const hoy = new Date().toISOString().split('T')[0]

  if (!isEjecutivo) {
    // ── STAFF ──────────────────────────────────────────────────────────────
    let misObjetivos: Objetivo[] = []
    let planes: Awaited<ReturnType<typeof getPlanesDB>> = []

    try {
      ;[misObjetivos, planes] = await Promise.all([
        getObjetivosByResponsable(userId),
        getPlanesDB(userId),
      ])
    } catch {}

    const pbHoy = planes.find(pb => pb.fecha === hoy && (pb.estado === 'Activo' || pb.estado === 'Borrador'))

    const estadosActivos: EstadoObjetivo[] = ['Asignado', 'No iniciado', 'En curso', 'Completado pendiente']
    const misActivos = misObjetivos
      .filter(o => estadosActivos.includes(o.estado))
      .sort((a, b) => {
        const aVencido = isVencido(a) ? 0 : 1
        const bVencido = isVencido(b) ? 0 : 1
        if (aVencido !== bVencido) return aVencido - bVencido
        return (a.fechaLimite ?? '9999') < (b.fechaLimite ?? '9999') ? -1 : 1
      })

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">Bienvenido, {session?.user?.name}</p>
        </div>

        {/* PB de hoy */}
        {pbHoy ? (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
            <h2 className="font-semibold text-gray-100 mb-3">Tu Plan de Batalla de hoy</h2>
            <Link
              href={`/plan-de-batalla/${pbHoy.id}`}
              className="flex items-center justify-between py-2 hover:text-blue-400 transition-colors"
            >
              <span className="text-gray-200 font-medium">{pbHoy.titulo}</span>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <Badge estadoPB={pbHoy.estado} />
                <span className="text-gray-500 text-sm">{pbHoy.objetivosIncluidosIds.length} obj.</span>
              </div>
            </Link>
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

        {/* Mis objetivos activos */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-100">Mis Objetivos Activos</h2>
            <span className="text-sm text-gray-400">{misActivos.length} objetivos</span>
          </div>
          {misActivos.length === 0 ? (
            <p className="text-gray-500 text-sm">Sin objetivos activos asignados.</p>
          ) : (
            <div className="space-y-2">
              {misActivos.slice(0, 10).map(o => (
                <Link key={o.id} href={`/objetivos/${o.id}`} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0 hover:text-blue-400 transition-colors">
                  <span className="text-sm text-gray-200 line-clamp-1 flex-1 mr-2">{o.nombre}</span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Badge tipo={o.tipo} />
                    <Badge estadoObjetivo={o.estado} />
                    {isVencido(o) && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-600 text-white">
                        Vencido
                      </span>
                    )}
                    {o.fechaLimite && (
                      <span className="text-xs text-gray-500">{o.fechaLimite}</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── EJECUTIVO ──────────────────────────────────────────────────────────────
  let programas: Programa[] = []
  let todosObjetivos: Objetivo[] = []

  try {
    ;[programas, todosObjetivos] = await Promise.all([
      getProgramas(),
      getObjetivos(),
    ])
  } catch {}

  const programasActivos = programas.filter(p => p.estado === 'Activo')
  const objetivosEnCurso = todosObjetivos.filter(o => o.estado === 'En curso')
  const objetivosVencidos = todosObjetivos.filter(o => isVencido(o))

  // Pendientes de mi aprobación (estado Completado pendiente donde soy aprobador efectivo)
  const pendientesAprobacion = todosObjetivos.filter(o => {
    if (o.estado !== 'Completado pendiente') return false
    const prog = programas.find(p => o.programaIds.includes(p.id))
    const aprobEfectivo = prog ? getAprobadorEfectivo(o, prog) : o.aprobadorId
    return aprobEfectivo === userId
  })

  // Programas en riesgo: tienen objetivos incumplidos/rechazados/vencidos
  const estadosProblema = ['Incumplido', 'Rechazado', 'Modificación solicitada']
  const programasEnRiesgo = programas.filter(p =>
    todosObjetivos.some(o =>
      o.programaIds.includes(p.id) &&
      (estadosProblema.includes(o.estado) || isVencido(o))
    )
  )

  // Próximos a vencer en 7 días
  const en7dias = new Date()
  en7dias.setDate(en7dias.getDate() + 7)
  const en7diasStr = en7dias.toISOString().split('T')[0]
  const proximosVencer = todosObjetivos
    .filter(o =>
      (o.estado === 'En curso' || o.estado === 'No iniciado') &&
      o.fechaLimite && o.fechaLimite >= hoy && o.fechaLimite <= en7diasStr
    )
    .sort((a, b) => (a.fechaLimite ?? '') < (b.fechaLimite ?? '') ? -1 : 1)
    .slice(0, 5)

  // Alerta críticos
  const criticos = todosObjetivos.filter(o =>
    (o.tipo === 'Primario' || o.tipo === 'Vital') && o.estado === 'Incumplido'
  )

  // Resolver nombres para listas
  const idsNecesarios = [...new Set([
    ...pendientesAprobacion.map(o => o.responsableId),
    ...proximosVencer.map(o => o.responsableId),
  ].filter(Boolean))] as string[]

  let usuariosMap: Record<string, { nombre: string }> = {}
  try {
    usuariosMap = await getUsuariosByIds(idsNecesarios)
  } catch {}

  // Mapa de objetivos para AprobacionesSection (legacy cumplimientos mode not used here)
  const objetivosMap: Record<string, Objetivo> = {}
  for (const o of todosObjetivos) { objetivosMap[o.id] = o }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">Bienvenido, {session?.user?.name}</p>
      </div>

      {/* Alerta críticos */}
      {criticos.length > 0 && (
        <div className="bg-red-950/40 border border-red-700 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="text-red-300 font-medium">
                {criticos.length} Objetivo{criticos.length > 1 ? 's' : ''} Primario/Vital Incumplido{criticos.length > 1 ? 's' : ''}
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

      {/* Stats de 4 tarjetas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Programas Activos"
          value={programasActivos.length}
          sub={`${programas.length} total`}
          href="/programas"
        />
        <StatCard
          label="Objetivos En Curso"
          value={objetivosEnCurso.length}
        />
        <StatCard
          label="Vencidos"
          value={objetivosVencidos.length}
          sub={objetivosVencidos.length > 0 ? 'Requieren atención' : undefined}
        />
        <StatCard
          label="Pendientes Aprobación"
          value={pendientesAprobacion.length}
          sub={pendientesAprobacion.length > 0 ? 'Esperando tu revisión' : undefined}
        />
      </div>

      {/* Pendientes de mi aprobación */}
      {pendientesAprobacion.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
          <h2 className="font-semibold text-gray-100 mb-3">Pendientes de mi aprobación</h2>
          <div className="space-y-2">
            {pendientesAprobacion.slice(0, 8).map(o => (
              <Link key={o.id} href={`/objetivos/${o.id}`} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0 hover:text-blue-400 transition-colors">
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-gray-200 line-clamp-1">{o.nombre}</span>
                  {usuariosMap[o.responsableId] && (
                    <span className="text-xs text-gray-500 block">{usuariosMap[o.responsableId].nombre}</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                  <Badge tipo={o.tipo} />
                  <Badge estadoObjetivo={o.estado} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Programas en riesgo */}
      {programasEnRiesgo.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
          <h2 className="font-semibold text-gray-100 mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-orange-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span>Programas en riesgo</span>
            <span className="text-xs text-orange-400 font-normal">({programasEnRiesgo.length})</span>
          </h2>
          <div className="space-y-2">
            {programasEnRiesgo.slice(0, 6).map(p => {
              const objProblema = todosObjetivos.filter(o =>
                o.programaIds.includes(p.id) &&
                (estadosProblema.includes(o.estado) || isVencido(o))
              )
              return (
                <Link key={p.id} href={`/programas/${p.id}`} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0 hover:text-blue-400 transition-colors">
                  <span className="text-sm text-gray-200">{p.nombre}</span>
                  <span className="text-xs text-orange-400 flex-shrink-0 ml-2">{objProblema.length} problema{objProblema.length !== 1 ? 's' : ''}</span>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Próximos a vencer */}
      {proximosVencer.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
          <h2 className="font-semibold text-gray-100 mb-3">Próximos a vencer (7 días)</h2>
          <div className="space-y-2">
            {proximosVencer.map(o => (
              <Link key={o.id} href={`/objetivos/${o.id}`} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0 hover:text-blue-400 transition-colors">
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-gray-200 line-clamp-1">{o.nombre}</span>
                  {usuariosMap[o.responsableId] && (
                    <span className="text-xs text-gray-500 block">{usuariosMap[o.responsableId].nombre}</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                  <Badge estadoObjetivo={o.estado} />
                  <span className="text-xs text-gray-400">{o.fechaLimite}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Programas activos */}
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
            <h2 className="font-semibold text-gray-100">Objetivos En Curso</h2>
            <Link href="/plan-de-batalla" className="text-sm text-blue-400 hover:text-blue-300">Plan de batalla</Link>
          </div>
          {objetivosEnCurso.length === 0 ? (
            <p className="text-gray-500 text-sm">Sin objetivos en curso.</p>
          ) : (
            <div className="space-y-2">
              {objetivosEnCurso.slice(0, 5).map(o => (
                <Link key={o.id} href={`/objetivos/${o.id}`} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0 hover:text-blue-400 transition-colors">
                  <span className="text-sm text-gray-200 line-clamp-1 flex-1 mr-2">{o.nombre}</span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Badge tipo={o.tipo} />
                    {isVencido(o) && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-600 text-white">
                        Vencido
                      </span>
                    )}
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
