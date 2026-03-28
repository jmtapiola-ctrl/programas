'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Input'
import type { Objetivo, Cumplimiento, Usuario } from '@/lib/types'

function mapObjetivo(r: any): Objetivo {
  return {
    id: r.id,
    nombre: r.fields['Nombre'] ?? '',
    tipo: r.fields['Tipo']?.name ?? r.fields['Tipo'] ?? 'Operativo',
    programaIds: r.fields['Programa'] ?? [],
    responsableIds: r.fields['Responsable'] ?? [],
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

export default function ObjetivoDetailPage({ params }: { params: { id: string } }) {
  const { data: session } = useSession()
  const isEjecutivo = (session?.user as any)?.role === 'Ejecutivo'
  const userId = (session?.user as any)?.id

  const [objetivo, setObjetivo] = useState<Objetivo | null>(null)
  const [cumplimientos, setCumplimientos] = useState<Cumplimiento[]>([])
  const [responsables, setResponsables] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [modalCumplir, setModalCumplir] = useState(false)
  const [descripcionCumplimiento, setDescripcionCumplimiento] = useState('')
  const [savingCumplimiento, setSavingCumplimiento] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [objRes, cumRes] = await Promise.all([
        fetch(`/api/airtable/tbl9ljCeFDMeCsbAT/${params.id}`),
        fetch(`/api/airtable/tblTbB0eYz3xsdyNk?filterByFormula=${encodeURIComponent(`FIND("${params.id}", ARRAYJOIN({Objetivo}))`)}`)
      ])
      const objData = await objRes.json()
      const cumData = await cumRes.json()

      const obj = mapObjetivo(objData)
      setObjetivo(obj)

      setCumplimientos((cumData.records ?? []).map((r: any): Cumplimiento => ({
        id: r.id,
        cumplimiento: r.fields['Cumplimiento'],
        objetivoIds: r.fields['Objetivo'] ?? [],
        reportadoPorIds: r.fields['Reportado Por'] ?? [],
        fecha: r.fields['Fecha'],
        descripcionCumplimiento: r.fields['Descripcion del Cumplimiento'],
        aprobado: r.fields['Aprobado'] ?? false,
      })))

      if (obj.responsableIds.length > 0) {
        const usersRes = await fetch('/api/airtable/tblXhgSBuh0f1BNPV')
        const usersData = await usersRes.json()
        const allUsers: Usuario[] = (usersData.records ?? []).map((r: any) => ({
          id: r.id,
          nombre: r.fields['Nombre'] ?? '',
          email: r.fields['Email'] ?? '',
          rol: r.fields['Rol']?.name ?? r.fields['Rol'] ?? 'Staff',
          activo: r.fields['Activo'] ?? false,
        }))
        setResponsables(allUsers.filter(u => obj.responsableIds.includes(u.id)))
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [params.id])

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

    // Cambiar estado: si es repetible vuelve a Pendiente, sino pasa a Cumplido
    const nuevoEstado = objetivo.esRepetible ? 'Pendiente' : 'Cumplido'
    await fetch(`/api/airtable/tbl9ljCeFDMeCsbAT/${objetivo.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { 'Estado': nuevoEstado } }),
    })

    setSavingCumplimiento(false)
    setModalCumplir(false)
    setDescripcionCumplimiento('')
    await load()
  }

  async function handleAprobarCumplimiento(cumId: string, aprobado: boolean) {
    await fetch(`/api/airtable/tblTbB0eYz3xsdyNk/${cumId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { 'Aprobado': aprobado } }),
    })
    await load()
  }

  if (loading) return <div className="text-gray-400 py-8">Cargando...</div>
  if (!objetivo) return <div className="text-gray-400 py-8">Objetivo no encontrado.</div>

  const isPrimarioIncumplido = objetivo.tipo === 'Primario' && objetivo.estado === 'Incumplido'

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
            <Badge estadoObjetivo={objetivo.estado} />
            {objetivo.esRepetible && (
              <span className="text-xs text-gray-400 bg-gray-800 border border-gray-700 px-2 py-0.5 rounded">Repetible</span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-white">{objetivo.nombre}</h1>
          {responsables.length > 0 && (
            <p className="text-gray-400 text-sm mt-1">Responsable: {responsables.map(r => r.nombre).join(', ')}</p>
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

      {isPrimarioIncumplido && (
        <div className="bg-red-950/40 border border-red-700 rounded-lg p-4 text-sm text-red-300">
          ⚠ Objetivo Primario Incumplido — esto rompe la cadena del programa.
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
              <div key={c.id} className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-gray-500">{c.fecha ?? '—'}</span>
                      {c.aprobado ? (
                        <span className="text-xs text-green-400 bg-green-900/30 border border-green-800 px-1.5 py-0.5 rounded">Aprobado</span>
                      ) : (
                        <span className="text-xs text-yellow-400 bg-yellow-900/30 border border-yellow-800 px-1.5 py-0.5 rounded">Pendiente aprobación</span>
                      )}
                    </div>
                    {c.descripcionCumplimiento && (
                      <p className="text-gray-300 text-sm">{c.descripcionCumplimiento}</p>
                    )}
                  </div>
                  {isEjecutivo && !c.aprobado && (
                    <Button size="sm" variant="ghost" onClick={() => handleAprobarCumplimiento(c.id, true)}>
                      Aprobar
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
    </div>
  )
}
