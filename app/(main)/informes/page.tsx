import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getObjetivos, getCumplimientos, getProgramas, getUsuarios } from '@/lib/airtable'
import type { Objetivo, Cumplimiento, Usuario } from '@/lib/types'

export default async function InformesPage() {
  const session = await getServerSession(authOptions)
  const isEjecutivo = (session?.user as any)?.role === 'Ejecutivo'

  let objetivos: Objetivo[] = []
  let cumplimientos: Cumplimiento[] = []
  let usuarios: Usuario[] = []
  let programaCount = 0

  try {
    ;[objetivos, cumplimientos, usuarios] = await Promise.all([
      getObjetivos(),
      getCumplimientos(),
      getUsuarios(),
    ])
    if (isEjecutivo) {
      const programas = await getProgramas()
      programaCount = programas.length
    }
  } catch {}

  const total = objetivos.length
  const cumplidos = objetivos.filter(o => o.estado === 'Cumplido').length
  const incumplidos = objetivos.filter(o => o.estado === 'Incumplido').length
  const enCurso = objetivos.filter(o => o.estado === 'En curso').length
  const pendientes = objetivos.filter(o => o.estado === 'Pendiente').length
  const porcentajeCumplimiento = total > 0 ? Math.round((cumplidos / total) * 100) : 0

  const porTipo = ['Primario', 'Condicional', 'Operativo', 'Producción', 'Mayor'].map(tipo => ({
    tipo,
    total: objetivos.filter(o => o.tipo === tipo).length,
    cumplidos: objetivos.filter(o => o.tipo === tipo && o.estado === 'Cumplido').length,
    incumplidos: objetivos.filter(o => o.tipo === tipo && o.estado === 'Incumplido').length,
  }))

  const cumplimientosPendientesAprobacion = cumplimientos.filter(c => !c.aprobado)

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

      {/* Cumplimientos pendientes aprobación */}
      {isEjecutivo && cumplimientosPendientesAprobacion.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
          <h2 className="font-semibold text-gray-100 mb-4">
            Cumplimientos Pendientes de Aprobación ({cumplimientosPendientesAprobacion.length})
          </h2>
          <div className="space-y-2">
            {cumplimientosPendientesAprobacion.slice(0, 10).map(c => (
              <div key={c.id} className="flex items-start justify-between bg-gray-700/50 rounded p-3 text-sm">
                <div>
                  <p className="text-gray-400 text-xs">{c.fecha ?? '—'}</p>
                  {c.descripcionCumplimiento && (
                    <p className="text-gray-200 mt-0.5 line-clamp-2">{c.descripcionCumplimiento}</p>
                  )}
                </div>
                <span className="text-yellow-400 text-xs flex-shrink-0 ml-3">Pendiente</span>
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
              const objsUsuario = objetivos.filter(o => o.responsableIds.includes(u.id))
              const cumplidosU = objsUsuario.filter(o => o.estado === 'Cumplido').length
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
