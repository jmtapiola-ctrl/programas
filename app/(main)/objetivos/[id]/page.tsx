'use client'

import { useState, useEffect, useCallback, use } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Input'
import type { Objetivo, Cumplimiento, Usuario, Programa } from '@/lib/types'

const DEFINICIONES_TIPO: Record<string, string> = {
  'Primario': 'Los objetivos del tipo de organización, de personal y de comunicaciones. Estos deben mantenerse.',
  'Vital': 'Por definición, un objetivo VITAL es algo que debe hacerse para funcionar en medida alguna.',
  'Condicional': 'Aquellos que se establecen como O BIEN… O, para averiguar información o si un proyecto puede hacerse, o dónde o a quién.',
  'Operativo': 'Aquellos que establecen direcciones y acciones o un calendario de eventos e itinerario.',
  'Producción': 'Aquellos que establecen cantidades como estadísticas.',
  'Mayor': 'La aspiración general y amplia, que posiblemente abarca un período de tiempo largo y aproximado.',
}

function mapObjetivo(r: any): Objetivo {
  return {
    id: r.id,
    nombre: r.fields['Nombre'] ?? '',
    tipo: r.fields['Tipo']?.name ?? r.fields['Tipo'] ?? 'Operativo',
    programaIds: r.fields['Programa'] ?? [],
    responsableId: (r.fields['Responsable'] ?? [])[0] ?? '',
    aprobadorId: r.fields['Aprobador']?.[0] ?? undefined,
    estado: r.fields['Estado']?.name ?? r.fields['Estado'] ?? 'Pendiente',
    fechaLimite: r.fields['Fecha Limite'],
    descripcionDoingness: r.fields['Descripcion Doingness'],
    esRepetible: r.fields['Es Repetible'] ?? false,
    orden: r.fields['Orden'],
    notas: r.fields['Notas'],
    pbIds: r.fields['PB'] ?? [],
    cumplimientoIds: r.fields['Cumplimientos'] ?? [],
  }
}

export default function ObjetivoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: session } = useSession()
  const isEjecutivo = (session?.user as any)?.role === 'Ejecutivo'
  const userId = (session?.user as any)?.id

  const [objetivo, setObjetivo] = useState<Objetivo | null>(null)
  const [programa, setPrograma] = useState<Programa | null>(null)
  const [cumplimientos, setCumplimientos] = useState<Cumplimiento[]>([])
  const [responsable, setResponsable] = useState<Usuario | null>(null)
  const [loading, setLoading] = useState(true)
  const [modalCumplir, setModalCumplir] = useState(false)
  const [descripcionCumplimiento, setDescripcionCumplimiento] = useState('')
  const [savingCumplimiento, setSavingCumplimiento] = useState(false)
  const [editandoCumplimiento, setEditandoCumplimiento] = useState<Cumplimiento | null>(null)
  const [editTexto, setEditTexto] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [modalRechazar, setModalRechazar] = useState(false)
  const [motivoRechazo, setMotivoRechazo] = useState('')
  const [savingRechazo, setSavingRechazo] = useState(false)
  const [cumplimientoARechazar, setCumplimientoARechazar] = useState<Cumplimiento | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [objRes, cumRes] = await Promise.all([
        fetch(`/api/airtable/tbl9ljCeFDMeCsbAT/${id}`),
        fetch(`/api/airtable/tblTbB0eYz3xsdyNk?sort%5B0%5D%5Bfield%5D=fld8GA6aFyu09Ofp5&sort%5B0%5D%5Bdirection%5D=desc`),
      ])

      if (!objRes.ok) {
        setLoading(false)
        return
      }

      const objData = await objRes.json()
      const cumData = await cumRes.json()

      if (!objData || !objData.id) {
        setLoading(false)
        return
      }

      const obj = mapObjetivo(objData)
      setObjetivo(obj)

      // Cargar programa si corresponde
      if (obj.programaIds[0]) {
        const progRes = await fetch(`/api/airtable/tbld952MAM0ApHqT0/${obj.programaIds[0]}`)
        if (progRes.ok) {
          const progData = await progRes.json()
          if (progData?.id) {
            setPrograma({
              id: progData.id,
              nombre: progData.fields['Nombre'] ?? '',
              proposito: progData.fields['Proposito'],
              descripcion: progData.fields['Descripcion'],
              objetivoMayor: progData.fields['Objetivo Mayor'],
              estado: progData.fields['Estado']?.name ?? progData.fields['Estado'] ?? 'Borrador',
              responsableIds: progData.fields['Responsable'] ?? [],
              aprobadorId: progData.fields['Aprobador']?.[0] ?? undefined,
              fechaInicio: progData.fields['Fecha Inicio'],
              fechaObjetivo: progData.fields['Fecha Objetivo'],
              notas: progData.fields['Notas'],
              objetivoIds: progData.fields['Objetivos'] ?? [],
            })
          }
        }
      }

      const todoCums: Cumplimiento[] = (cumData.records ?? []).map((r: any): Cumplimiento => ({
        id: r.id,
        cumplimiento: r.fields['Cumplimiento'],
        objetivoIds: r.fields['Objetivo'] ?? [],
        reportadoPorIds: r.fields['Reportado Por'] ?? [],
        fecha: r.fields['Fecha'],
        descripcionCumplimiento: r.fields['Descripcion del Cumplimiento'],
        aprobado: r.fields['Aprobado'] ?? false,
        aprobadoPorId: r.fields['Aprobado por']?.[0] ?? undefined,
        rechazado: r.fields['Rechazado'] ?? false,
        motivoRechazo: r.fields['Motivo rechazo'],
      }))
      setCumplimientos(todoCums.filter(c => c.objetivoIds.includes(id)))

      if (obj.responsableId) {
        const usersRes = await fetch('/api/airtable/tblXhgSBuh0f1BNPV')
        const usersData = await usersRes.json()
        const allUsers: Usuario[] = (usersData.records ?? []).map((r: any) => ({
          id: r.id,
          nombre: r.fields['Nombre'] ?? '',
          email: r.fields['Email'] ?? '',
          rol: r.fields['Rol']?.name ?? r.fields['Rol'] ?? 'Staff',
          activo: r.fields['Activo'] ?? false,
        }))
        setResponsable(allUsers.find(u => u.id === obj.responsableId) ?? null)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  async function handleCambiarEstado(nuevoEstado: Objetivo['estado']) {
    if (!objetivo) return
    await fetch(`/api/airtable/tbl9ljCeFDMeCsbAT/${objetivo.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { 'Estado': nuevoEstado } }),
    })
    await load()
  }

  async function handleCumplir() {
    if (!objetivo || !userId) return
    setSavingCumplimiento(true)

    // Crear cumplimiento
    await fetch('/api/airtable/tblTbB0eYz3xsdyNk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          'Objetivo': [objetivo.id],
          'Reportado Por': [userId],
          'Fecha': new Date().toISOString().split('T')[0],
          'Descripcion del Cumplimiento': descripcionCumplimiento,
        }
      }),
    })

    // Si no hay aprobador efectivo, cambiar estado directamente
    const aprobadorEfectivo = objetivo.aprobadorId ?? programa?.aprobadorId
    if (!aprobadorEfectivo) {
      const nuevoEstado = objetivo.esRepetible ? 'Pendiente' : 'Cumplido'
      await fetch(`/api/airtable/tbl9ljCeFDMeCsbAT/${objetivo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { 'Estado': nuevoEstado } }),
      })
      setObjetivo(prev => prev ? { ...prev, estado: nuevoEstado as Objetivo['estado'] } : null)
    }

    setSavingCumplimiento(false)
    setModalCumplir(false)
    setDescripcionCumplimiento('')
    await load()
  }

  async function handleAprobarCumplimiento(cumId: string) {
    if (!objetivo || !userId) return
    await fetch(`/api/airtable/tblTbB0eYz3xsdyNk/${cumId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { 'Aprobado': true, 'Aprobado por': [userId] } }),
    })

    // Cambiar estado del objetivo
    const nuevoEstado = objetivo.esRepetible ? 'Pendiente' : 'Cumplido'
    await fetch(`/api/airtable/tbl9ljCeFDMeCsbAT/${objetivo.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { 'Estado': nuevoEstado } }),
    })

    await load()
  }

  async function handleRechazar() {
    if (!cumplimientoARechazar || !motivoRechazo.trim() || !objetivo) return
    setSavingRechazo(true)

    // Marcar cumplimiento como rechazado
    await fetch(`/api/airtable/tblTbB0eYz3xsdyNk/${cumplimientoARechazar.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { 'Rechazado': true, 'Motivo rechazo': motivoRechazo } })
    })

    // Volver objetivo a "En curso"
    await fetch(`/api/airtable/tbl9ljCeFDMeCsbAT/${objetivo.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { 'Estado': 'En curso' } })
    })

    setSavingRechazo(false)
    setModalRechazar(false)
    setMotivoRechazo('')
    setCumplimientoARechazar(null)
    setObjetivo(prev => prev ? { ...prev, estado: 'En curso' } : null)
    await load()
  }

  function abrirEditarCumplimiento(c: Cumplimiento) {
    setEditandoCumplimiento(c)
    setEditTexto(c.descripcionCumplimiento ?? '')
  }

  async function handleGuardarEdit() {
    if (!editandoCumplimiento) return
    setSavingEdit(true)
    await fetch(`/api/airtable/tblTbB0eYz3xsdyNk/${editandoCumplimiento.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { 'Descripcion del Cumplimiento': editTexto } }),
    })
    setSavingEdit(false)
    setEditandoCumplimiento(null)
    setEditTexto('')
    await load()
  }

  if (loading) return <div className="text-gray-400 py-8">Cargando...</div>
  if (!objetivo) return <div className="text-gray-400 py-8">Objetivo no encontrado.</div>

  const isCriticoIncumplido = (objetivo.tipo === 'Primario' || objetivo.tipo === 'Vital') && objetivo.estado === 'Incumplido'
  const aprobadorEfectivo = objetivo.aprobadorId ?? programa?.aprobadorId
  const puedeAprobar = isEjecutivo && aprobadorEfectivo === userId && objetivo.responsableId !== userId

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          {objetivo.programaIds.length > 0 && (
            <Link href={`/programas/${objetivo.programaIds[0]}`} className="text-gray-400 hover:text-gray-200 text-sm mb-2 inline-block">← Programa</Link>
          )}
          <div className="flex items-center gap-2 mb-2">
            <Badge tipo={objetivo.tipo} />
            {DEFINICIONES_TIPO[objetivo.tipo] && (
              <Tooltip texto={DEFINICIONES_TIPO[objetivo.tipo]} />
            )}
            <Badge estadoObjetivo={objetivo.estado} />
            {objetivo.esRepetible && (
              <span className="text-xs text-gray-400 bg-gray-800 border border-gray-700 px-2 py-0.5 rounded">Repetible</span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-white">{objetivo.nombre}</h1>
          {responsable && (
            <p className="text-gray-400 text-sm mt-1">Responsable: {responsable.nombre}</p>
          )}
        </div>

        <div className="flex gap-2 flex-shrink-0">
          {objetivo.estado !== 'Cumplido' && (
            <Button size="sm" onClick={() => setModalCumplir(true)}>
              Reportar Cumplimiento
            </Button>
          )}
          {isEjecutivo && (
            <div className="flex gap-1">
              {objetivo.estado === 'Pendiente' && (
                <Button size="sm" variant="secondary" onClick={() => handleCambiarEstado('En curso')}>Iniciar</Button>
              )}
              {objetivo.estado === 'Incumplido' && (
                <Button size="sm" variant="secondary" onClick={() => handleCambiarEstado('Pendiente')}>Reactivar</Button>
              )}
            </div>
          )}
        </div>
      </div>

      {isCriticoIncumplido && (
        <div className="bg-red-950/40 border border-red-700 rounded-lg p-4 text-sm text-red-300">
          ⚠ Objetivo {objetivo.tipo} Incumplido — esto rompe la cadena del programa.
        </div>
      )}

      {/* Detalles */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-5 space-y-4">
        {objetivo.descripcionDoingness && (
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">Descripción / Doingness</p>
            <p className="text-gray-200">{objetivo.descripcionDoingness}</p>
          </div>
        )}
        <div className="grid grid-cols-3 gap-4 text-sm">
          {objetivo.fechaLimite && (
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wider mb-0.5">Fecha Límite</p>
              <p className="text-gray-300">{objetivo.fechaLimite}</p>
            </div>
          )}
          {objetivo.orden !== undefined && (
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wider mb-0.5">Orden</p>
              <p className="text-gray-300">{objetivo.orden}</p>
            </div>
          )}
          <div>
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-0.5">Cumplimientos</p>
            <p className="text-gray-300">{cumplimientos.length}</p>
          </div>
        </div>
        {objetivo.notas && (
          <div className="border-t border-gray-700 pt-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">Notas</p>
            <p className="text-gray-300 text-sm">{objetivo.notas}</p>
          </div>
        )}
      </div>

      {/* Historial de cumplimientos */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-3">Historial de Cumplimientos</h2>
        {cumplimientos.length === 0 ? (
          <p className="text-gray-500 text-sm">Sin cumplimientos registrados.</p>
        ) : (
          <div className="space-y-2">
            {cumplimientos.map(c => (
              <div key={c.id} className={`bg-gray-800 border rounded-lg p-4 ${c.rechazado ? 'border-red-800/60' : 'border-gray-700'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-gray-500">{c.fecha ?? '—'}</span>
                      {c.rechazado ? (
                        <span className="text-xs text-red-400 bg-red-900/30 border border-red-800 px-1.5 py-0.5 rounded">Rechazado</span>
                      ) : c.aprobado ? (
                        <span className="text-xs text-green-400 bg-green-900/30 border border-green-800 px-1.5 py-0.5 rounded">Aprobado</span>
                      ) : (
                        <span className="text-xs text-yellow-400 bg-yellow-900/30 border border-yellow-800 px-1.5 py-0.5 rounded">Pendiente aprobación</span>
                      )}
                    </div>
                    {c.descripcionCumplimiento && (
                      <p className="text-gray-300 text-sm">{c.descripcionCumplimiento}</p>
                    )}
                    {c.rechazado && c.motivoRechazo && (
                      <p className="text-red-400 text-xs mt-1 italic">Motivo rechazo: {c.motivoRechazo}</p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => abrirEditarCumplimiento(c)}>
                      Editar
                    </Button>
                    {puedeAprobar && !c.aprobado && !c.rechazado && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => handleAprobarCumplimiento(c.id)}>
                          Aprobar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setCumplimientoARechazar(c); setModalRechazar(true) }}
                          className="text-red-400 hover:text-red-300"
                        >
                          Rechazar
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal editar cumplimiento */}
      <Modal open={!!editandoCumplimiento} onClose={() => setEditandoCumplimiento(null)} title="Editar Cumplimiento">
        <div className="space-y-4">
          <Textarea
            label="Descripción del cumplimiento"
            value={editTexto}
            onChange={e => setEditTexto(e.target.value)}
            placeholder="Describí las acciones realizadas..."
            rows={4}
          />
          <div className="flex gap-3">
            <Button loading={savingEdit} onClick={handleGuardarEdit}>Guardar</Button>
            <Button variant="secondary" onClick={() => setEditandoCumplimiento(null)}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      {/* Modal cumplir */}
      <Modal open={modalCumplir} onClose={() => setModalCumplir(false)} title="Reportar Cumplimiento">
        <div className="space-y-4">
          <p className="text-gray-400 text-sm">Describí qué hiciste para cumplir este objetivo:</p>
          <Textarea
            label="Descripción del cumplimiento"
            value={descripcionCumplimiento}
            onChange={e => setDescripcionCumplimiento(e.target.value)}
            placeholder="Describí las acciones realizadas..."
            rows={4}
          />
          <div className="flex gap-3">
            <Button loading={savingCumplimiento} onClick={handleCumplir}>Confirmar Cumplimiento</Button>
            <Button variant="secondary" onClick={() => setModalCumplir(false)}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      {/* Modal rechazar cumplimiento */}
      <Modal open={modalRechazar} onClose={() => setModalRechazar(false)} title="Rechazar Cumplimiento">
        <div className="space-y-4">
          <p className="text-gray-400 text-sm">Indicá el motivo del rechazo. El objetivo volverá a "En curso".</p>
          <Textarea
            label="Motivo de rechazo"
            value={motivoRechazo}
            onChange={e => setMotivoRechazo(e.target.value)}
            placeholder="Explicá qué falta o qué está mal..."
            rows={3}
          />
          <div className="flex gap-3">
            <Button
              loading={savingRechazo}
              onClick={handleRechazar}
              disabled={!motivoRechazo.trim()}
              className="bg-red-800 hover:bg-red-700 text-white border-red-700"
            >
              Confirmar Rechazo
            </Button>
            <Button variant="secondary" onClick={() => setModalRechazar(false)}>Cancelar</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
