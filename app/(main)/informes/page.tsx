import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getObjetivos, getCumplimientos, getUsuarios, getProgramas } from '@/lib/airtable'
import { AprobacionesPendientes } from '@/components/informes/AprobacionesPendientes'
import { Badge } from '@/components/ui/Badge'
import Link from 'next/link'
import type { Objetivo, Cumplimiento, Usuario } from '@/lib/types'
import { isVencido, puedeVerTodo } from '@/lib/types'

export default async function InformesPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  const rol = (session?.user as any)?.role as string
  const isEjecutivo = rol === 'Ejecutivo'
  const tieneAcceso = puedeVerTodo(rol as any)
  if (!tieneAcceso) redirect('/dashboard')
  const userId = (session?.user as any)?.id as string

  let objetivos: Objetivo[] = []
  let cumplimientos: Cumplimiento[] = []
  let usuarios: Usuario[] = []
  let programas: Awaited<ReturnType<typeof getProgramas>> = []

  try {
    ;[objetivos, cumplimientos, usuarios, programas] = await Promise.all([
      getObjetivos(),
      getCumplimientos(),
      getUsuarios(),
      getProgramas(),
    ])
  } catch {}

  // Cumplimientos donde el aprobador efectivo es el userId actual
  const misCumplimientosPendientes = tieneAcceso ? cumplimientos.filter(c => {
    if (c.aprobado || c.rechazado) return false
    const obj = objetivos.find(o => c.objetivoIds.includes(o.id))
    if (!obj) return false
    const prog = programas.find(p => obj.programaIds.includes(p.id))
    const aprobadorEfectivo = obj.aprobadorId ?? prog?.aprobadorId
    return aprobadorEfectivo === userId
  }) : []

  const objetivosMap: Record<string, Objetivo> = {}
  for (const o of objetivos) { objetivosMap[o.id] = o }

  const total = objetivos.length
  const cumplidos = objetivos.filter(o => o.estado === 'Completado').length
  const incumplidos = objetivos.filter(o => o.estado === 'Incumplido').length
  const enCurso = objetivos.filter(o => o.estado === 'En curso').length
  const pendientes = objetivos.filter(o => o.estado === 'No iniciado' || o.estado === 'Asignado').length
  const porcentajeCumplimiento = total > 0 ? Math.round((cumplidos / total) * 100) : 0

  const porTipo = ['Primario', 'Vital', 'Condicional', 'Operativo', 'Producción', 'Mayor'].map(tipo => ({
    tipo,
    total: objetivos.filter(o => o.tipo === tipo).length,
    cumplidos: objetivos.filter(o => o.tipo === tipo && o.estado === 'Completado').length,
    incumplidos: objetivos.filter(o => o.tipo === tipo && o.estado === 'Incumplido').length,
  }))

  const vencidos = objetivos
    .filter(o => isVencido(o))
    .map(o => {
      const diasVencido = o.fechaLimite
        ? Math.floor((new Date().getTime() - new Date(o.fechaLimite).getTime()) / (1000 * 60 * 60 * 24))
        : 0
      return { ...o, diasVencido }
    })
    .sort((a, b) => b.diasVencido - a.diasVencido)

  const usuariosMap = Object.fromEntries(usuarios.map(u => [u.id, u]))


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Informes</h1>
        <p className="text-gray-400 text-sm mt-1">Resumen del estado de objetivos y programas</p>
      </div>

      {/* Stats generales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
          <p className="text-gray-400 text-sm">Total Objetivos</p>
          <p className="text-3xl font-bold text-white mt-1">{total}</p>
        </div>
        <div className="bg-green-900/20 border border-green-800/40 rounded-lg p-5">
          <p className="text-green-400 text-sm">Cumplidos</p>
          <p className="text-3xl font-bold text-white mt-1">{cumplidos}</p>
          <p className="text-green-500 text-xs mt-1">{porcentajeCumplimiento}%</p>
        </div>
        <div className="bg-red-900/20 border border-red-800/40 rounded-lg p-5">
          <p className="text-red-400 text-sm">Incumplidos</p>
          <p className="text-3xl font-bold text-white mt-1">{incumplidos}</p>
        </div>
        <div className="bg-blue-900/20 border border-blue-800/40 rounded-lg p-5">
          <p className="text-blue-400 text-sm">En Curso</p>
          <p className="text-3xl font-bold text-white mt-1">{enCurso}</p>
          <p className="text-gray-500 text-xs mt-1">{pendientes} pendientes</p>
        </div>
      </div>

      {/* Barra de progreso general */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-100">Progreso General</h2>
          <span className="text-gray-400 text-sm">{porcentajeCumplimiento}% completado</span>
        </div>
        <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
          <div className="h-full bg-green-600 rounded-full transition-all" style={{ width: `${porcentajeCumplimiento}%` }} />
        </div>
        <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-600 inline-block" />Cumplidos: {cumplidos}</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-600 inline-block" />En curso: {enCurso}</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-600 inline-block" />Incumplidos: {incumplidos}</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-600 inline-block" />Pendientes: {pendientes}</span>
        </div>
      </div>

      {/* Por tipo */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
        <h2 className="font-semibold text-gray-100 mb-4">Por Tipo de Objetivo</h2>
        <div className="space-y-3">
          {porTipo.filter(g => g.total > 0).map(grupo => (
            <div key={grupo.tipo}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-gray-300">{grupo.tipo}</span>
                <span className="text-gray-500">{grupo.cumplidos}/{grupo.total}</span>
              </div>
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full"
                  style={{ width: grupo.total > 0 ? `${Math.round((grupo.cumplidos / grupo.total) * 100)}%` : '0%' }}
                />
              </div>
              {grupo.incumplidos > 0 && (
                <p className="text-xs text-red-400 mt-0.5">{grupo.incumplidos} incumplido{grupo.incumplidos > 1 ? 's' : ''}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Cumplimientos pendientes de mi aprobación */}
      {misCumplimientosPendientes.length > 0 && (
        <AprobacionesPendientes
          cumplimientos={misCumplimientosPendientes}
          objetivosMap={objetivosMap}
          userId={userId}
        />
      )}

      {/* Objetivos vencidos */}
      {vencidos.length > 0 && (
        <div className="bg-gray-800 border border-red-800/40 rounded-lg p-5">
          <h2 className="font-semibold text-red-300 mb-4">Objetivos Vencidos ({vencidos.length})</h2>
          <div className="space-y-2">
            {vencidos.map(o => (
              <div key={o.id} className="flex items-center justify-between gap-4 bg-gray-700/50 rounded-lg p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Badge tipo={o.tipo} />
                  <Link href={`/objetivos/${o.id}`} className="text-gray-200 text-sm hover:text-blue-400 truncate">
                    {o.nombre}
                  </Link>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 text-xs text-gray-400">
                  {usuariosMap[o.responsableId] && (
                    <span>{usuariosMap[o.responsableId].nombre}</span>
                  )}
                  <span className="text-red-400 font-medium">{o.diasVencido}d vencido</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Usuarios */}
      {isEjecutivo && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
          <h2 className="font-semibold text-gray-100 mb-4">Equipo ({usuarios.filter(u => u.activo).length} activos)</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {usuarios.filter(u => u.activo).map(u => {
              const objsUsuario = objetivos.filter(o => o.responsableId === u.id)
              const cumplidosU = objsUsuario.filter(o => o.estado === 'Completado').length
              return (
                <div key={u.id} className="bg-gray-700/50 rounded-lg p-3">
                  <p className="text-gray-200 font-medium text-sm">{u.nombre}</p>
                  <p className="text-gray-500 text-xs">{u.rol}</p>
                  <p className="text-gray-400 text-xs mt-1">{cumplidosU}/{objsUsuario.length} obj. cumplidos</p>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
