'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Cumplimiento, Objetivo } from '@/lib/types'

interface AprobacionesSectionProps {
  cumplimientosPendientes: Cumplimiento[]
  objetivosMap: Record<string, Objetivo>
  userId: string
}

export function AprobacionesSection({ cumplimientosPendientes, objetivosMap, userId }: AprobacionesSectionProps) {
  const [aprobando, setAprobando] = useState<string | null>(null)
  const [rechazando, setRechazando] = useState<string | null>(null)
  const [motivoRechazo, setMotivoRechazo] = useState('')
  const [cumIdRechazar, setCumIdRechazar] = useState<string | null>(null)
  const [procesados, setProcesados] = useState<Set<string>>(new Set())

  const pendientes = cumplimientosPendientes.filter(c => !procesados.has(c.id))

  async function handleAprobar(c: Cumplimiento) {
    const obj = objetivosMap[c.objetivoIds[0]]
    if (!obj) return
    setAprobando(c.id)
    await fetch(`/api/airtable/tblTbB0eYz3xsdyNk/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { 'Aprobado': true, 'Aprobado por': [userId] } }),
    })
    const nuevoEstado: Objetivo['estado'] = obj.esRepetible ? 'No iniciado' : 'Completado'
    await fetch(`/api/airtable/tbl9ljCeFDMeCsbAT/${obj.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { 'Estado': nuevoEstado } }),
    })
    setAprobando(null)
    setProcesados(prev => new Set([...prev, c.id]))
  }

  async function handleRechazar() {
    if (!cumIdRechazar || !motivoRechazo.trim()) return
    const c = pendientes.find(x => x.id === cumIdRechazar)
    const obj = c ? objetivosMap[c.objetivoIds[0]] : null
    setRechazando(cumIdRechazar)
    await fetch(`/api/airtable/tblTbB0eYz3xsdyNk/${cumIdRechazar}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { 'Rechazado': true, 'Motivo rechazo': motivoRechazo } }),
    })
    if (obj) {
      await fetch(`/api/airtable/tbl9ljCeFDMeCsbAT/${obj.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { 'Estado': 'En curso' } }),
      })
    }
    setRechazando(null)
    setCumIdRechazar(null)
    setMotivoRechazo('')
    setProcesados(prev => new Set([...prev, cumIdRechazar]))
  }

  if (pendientes.length === 0) return null

  return (
    <div className="bg-gray-800 border border-yellow-700/40 rounded-lg p-5">
      <h2 className="font-semibold text-gray-100 mb-3 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />
        Pendientes de mi aprobación
        <span className="text-xs text-yellow-400 font-normal">({pendientes.length})</span>
      </h2>
      <div className="space-y-3">
        {pendientes.slice(0, 8).map(c => {
          const obj = objetivosMap[c.objetivoIds[0]]
          const isProcessing = aprobando === c.id || rechazando === c.id
          return (
            <div key={c.id} className="bg-gray-700/50 rounded-lg p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {obj && (
                    <Link href={`/objetivos/${obj.id}`} className="text-sm text-blue-400 hover:text-blue-300 font-medium line-clamp-1">
                      {obj.nombre}
                    </Link>
                  )}
                  <p className="text-xs text-gray-500 mt-0.5">{c.fecha ?? '—'}</p>
                  {c.descripcionCumplimiento && (
                    <p className="text-gray-300 text-sm mt-1 line-clamp-2">{c.descripcionCumplimiento}</p>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    disabled={isProcessing}
                    onClick={() => handleAprobar(c)}
                    className="px-2 py-1 text-xs bg-green-800 hover:bg-green-700 text-green-200 border border-green-700 rounded disabled:opacity-50"
                  >
                    {aprobando === c.id ? '...' : 'Aprobar'}
                  </button>
                  <button
                    disabled={isProcessing}
                    onClick={() => setCumIdRechazar(c.id)}
                    className="px-2 py-1 text-xs bg-red-900/40 hover:bg-red-800/60 text-red-300 border border-red-700/60 rounded disabled:opacity-50"
                  >
                    Rechazar
                  </button>
                </div>
              </div>
              {cumIdRechazar === c.id && (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={motivoRechazo}
                    onChange={e => setMotivoRechazo(e.target.value)}
                    placeholder="Motivo de rechazo..."
                    rows={2}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-gray-100 text-xs placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                  />
                  <div className="flex gap-2">
                    <button
                      disabled={!motivoRechazo.trim() || rechazando === c.id}
                      onClick={handleRechazar}
                      className="px-2 py-1 text-xs bg-red-800 hover:bg-red-700 text-white border border-red-700 rounded disabled:opacity-50"
                    >
                      {rechazando === c.id ? '...' : 'Confirmar rechazo'}
                    </button>
                    <button
                      onClick={() => { setCumIdRechazar(null); setMotivoRechazo('') }}
                      className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 border border-gray-600 rounded"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
