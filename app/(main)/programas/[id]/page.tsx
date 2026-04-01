import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPrograma, getObjetivos, getUsuarios } from '@/lib/airtable'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import { ObjetivosOrdenables } from '@/components/programas/ObjetivosOrdenables'
import { ArchivarButton } from '@/components/programas/ArchivarButton'
import { ModalResumenEjecutivo } from '@/components/programas/ModalResumenEjecutivo'
import { sortObjetivos, puedeVerTodo, esOficialDelPrograma, esObjetivoEjecutable } from '@/lib/types'
import type { Usuario, Rol } from '@/lib/types'

const ESTADOS_PROBLEMA = ['Incumplido', 'Rechazado', 'Modificación solicitada'] as const

function formatFecha(iso?: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}-${m}-${y.slice(2)}`
}

export default async function ProgramaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const rol = (session?.user as any)?.role as string
  const isEjecutivo = rol === 'Ejecutivo'
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
  const vitales = sortedObjetivos.filter(o => o.tipo === 'Vital')
  const ejecutables = sortedObjetivos.filter(o => esObjetivoEjecutable(o.tipo))
  const responsables = programa.responsableIds.map(rid => usuariosMap[rid]).filter(Boolean)
  const aprobador = programa.aprobadorId ? usuariosMap[programa.aprobadorId] : undefined

  const esOficial = userId != null && esOficialDelPrograma(userId, programa)
  const puedeAgregarObjetivo = isEjecutivo || esOficial
  const puedeEditar = isEjecutivo || esOficial
  const puedeVerScore = puedeVerTodo(rol as Rol) || esOficial
  const puedeVerResumen = puedeVerTodo(rol as Rol) || esOficial

  // Score de calidad del programa (máx 6)
  const scoreItems = [
    { label: 'Tiene Situación definida', ok: !!programa.situacion },
    { label: 'Tiene Propósito definido', ok: !!programa.proposito },
    { label: 'Tiene Objetivo Mayor definido', ok: !!programa.objetivoMayor },
    { label: 'Tiene Aprobador asignado', ok: !!programa.aprobadorId },
    { label: 'Todos los objetivos tienen Responsable', ok: ejecutables.length > 0 && ejecutables.every(o => !!o.responsableId) },
    { label: 'Tiene al menos un Vital definido', ok: vitales.length > 0 },
  ]
  const score = scoreItems.filter(i => i.ok).length
  const scoreColor = score === 6
    ? 'bg-green-900/40 border-green-600 text-green-300'
    : score >= 4
    ? 'bg-yellow-900/40 border-yellow-600 text-yellow-300'
    : 'bg-red-900/40 border-red-700 text-red-300'
  const scoreLabel = score === 6 ? 'Programa completo ✓' : `${score}/6 completo`

  const problematicos = sortedObjetivos.filter(o =>
    o.tipo === 'Primario' &&
    (ESTADOS_PROBLEMA as readonly string[]).includes(o.estado)
  )
  const hayIncumplido = problematicos.some(o => o.estado === 'Incumplido')

  const completados = ejecutables.filter(o => o.estado === 'Completado').length

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-muted-foreground flex items-center gap-2">
        <Link href="/programas" className="hover:text-foreground">Programas</Link>
        <span>/</span>
        <span className="text-foreground">{programa.nombre}</span>
      </nav>

      {/* Header — dos columnas */}
      <div className="flex items-start justify-between gap-6">
        {/* Columna izquierda */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <Badge estadoPrograma={programa.estado} />
            {puedeVerScore && (
              <div className="relative group cursor-help inline-flex">
                <span className={`text-xs font-medium px-2 py-0.5 rounded border ${scoreColor}`}>
                  {scoreLabel}
                </span>
                <div className="absolute left-0 top-full mt-1 z-50 w-64 bg-background border border-border rounded-lg p-3 shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
                  <p className="font-semibold text-foreground mb-2 text-xs">Calidad del programa</p>
                  {scoreItems.map((item, i) => (
                    <p key={i} className={`flex items-center gap-1.5 text-xs py-0.5 ${item.ok ? 'text-green-400' : 'text-muted-foreground'}`}>
                      <span>{item.ok ? '✓' : '✗'}</span>
                      <span>{item.label}</span>
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
          <h1 className="text-2xl font-bold text-foreground">{programa.nombre}</h1>
          {responsables.length > 0 && (
            <p className="text-muted-foreground text-sm mt-1">
              Responsable: {responsables.map((r: any) => r.nombre).join(', ')}
            </p>
          )}
          {aprobador && (
            <p className="text-muted-foreground text-xs mt-0.5">Aprobador: {aprobador.nombre}</p>
          )}
        </div>

        {/* Columna derecha */}
        <div className="flex-shrink-0 flex flex-col items-end gap-3">
          {/* Botones */}
          <div className="flex gap-2 flex-wrap justify-end">
            {puedeVerResumen && (
              <ModalResumenEjecutivo
                programaId={id}
                resumenInicial={programa.resumenEjecutivo}
              />
            )}
            {puedeEditar && programa.estado !== 'Archivado' && (
              <Link
                href={`/programas/${id}/editar`}
                className="px-3 py-1.5 text-sm bg-muted hover:bg-accent text-foreground border border-border rounded-md transition-colors"
              >
                Editar
              </Link>
            )}
            {puedeAgregarObjetivo && programa.estado !== 'Archivado' && (
              <Link
                href={`/objetivos/nuevo?programaId=${id}`}
                className="px-3 py-1.5 text-sm bg-muted hover:bg-accent text-foreground border border-border rounded-md transition-colors"
              >
                + Objetivo
              </Link>
            )}
            {puedeEditar && (
              <ArchivarButton programaId={id} estadoActual={programa.estado} />
            )}
          </div>

          {/* Mini-card de fechas */}
          {(programa.fechaInicio || programa.fechaObjetivo) && (
            <div className="bg-card border border-border rounded-md px-3 py-2 text-xs space-y-1 min-w-[130px]">
              {programa.fechaInicio && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground uppercase tracking-wider">Inicio</span>
                  <span className="text-foreground font-mono">{formatFecha(programa.fechaInicio)}</span>
                </div>
              )}
              {programa.fechaObjetivo && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground uppercase tracking-wider">Fin</span>
                  <span className="text-foreground font-mono">{formatFecha(programa.fechaObjetivo)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Banner de programa archivado */}
      {programa.estado === 'Archivado' && (
        <div className="rounded-lg border border-border bg-muted/50 p-4 text-sm text-muted-foreground flex items-center justify-between gap-4">
          <span>🗄 Este programa está archivado. No aparece en el dashboard ni en el inbox.</span>
          <ArchivarButton programaId={id} estadoActual={programa.estado} />
        </div>
      )}

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

      {/* Situación / Propósito / Objetivo Mayor / Descripción */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {programa.situacion ? (
          <div className="md:col-span-3 bg-orange-900/20 border border-orange-800/40 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs text-orange-400 font-medium uppercase tracking-wider">Situación</p>
            </div>
            <p className="text-foreground">{programa.situacion}</p>
          </div>
        ) : puedeEditar ? (
          <div className="md:col-span-3 bg-card/50 border border-border border-dashed rounded-lg p-4 flex items-center justify-between">
            <p className="text-muted-foreground text-sm">Sin situación definida</p>
            <Link href={`/programas/${id}/editar`} className="text-blue-400 hover:text-blue-300 text-sm">
              Editar programa →
            </Link>
          </div>
        ) : null}
        {programa.proposito ? (
          <div className="md:col-span-3 bg-blue-900/20 border border-blue-800/40 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs text-blue-400 font-medium uppercase tracking-wider">Propósito</p>
              <Tooltip texto="Los propósitos tienen que ejecutarse. Son algo que HACER." />
            </div>
            <p className="text-foreground">{programa.proposito}</p>
          </div>
        ) : puedeEditar ? (
          <div className="md:col-span-3 bg-card/50 border border-border border-dashed rounded-lg p-4 flex items-center justify-between">
            <p className="text-muted-foreground text-sm">Sin propósito definido</p>
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
            <p className="text-foreground">{programa.objetivoMayor}</p>
          </div>
        )}
        {programa.descripcion && (
          <div className="md:col-span-3 bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground font-medium mb-1 uppercase tracking-wider">Descripción</p>
            <p className="text-muted-foreground text-sm">{programa.descripcion}</p>
          </div>
        )}
      </div>

      {/* Vitales — principios de funcionamiento */}
      {vitales.length > 0 && (
        <div className="rounded-lg border border-yellow-700/40 bg-yellow-900/10 p-4 space-y-2">
          <p className="text-xs font-semibold text-yellow-400 uppercase tracking-wider">
            Objetivos Vitales ({vitales.length})
          </p>
          <p className="text-xs text-muted-foreground">Condiciones permanentes de funcionamiento. No son tareas — son lo que no puede omitirse.</p>
          <ul className="space-y-1 mt-2">
            {vitales.map(v => (
              <li key={v.id} className="flex items-start gap-2 text-sm text-foreground">
                <span className="text-yellow-500 flex-shrink-0 mt-0.5">◆</span>
                <Link href={`/objetivos/${v.id}`} className="hover:text-yellow-300 transition-colors">
                  {v.nombre}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Encabezado de sección Objetivos */}
      <div className="flex items-center gap-2">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
          Objetivos ({completados}/{ejecutables.length} completados)
        </p>
      </div>

      {/* Objetivos por tipo */}
      {ejecutables.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>Este programa no tiene objetivos aún.</p>
          {puedeAgregarObjetivo && (
            <Link href={`/objetivos/nuevo?programaId=${id}`} className="mt-2 inline-block text-blue-400 hover:text-blue-300 text-sm">
              Agregar primer objetivo →
            </Link>
          )}
        </div>
      ) : (
        <ObjetivosOrdenables
          objetivosIniciales={ejecutables}
          usuariosMap={usuariosMap}
          puedeReordenar={isEjecutivo || esOficial}
        />
      )}
    </div>
  )
}
