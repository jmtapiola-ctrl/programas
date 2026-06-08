// Editor de planes cerrados (feature edición de planes cerrados, Hito 1).
//
// Botón "Editar plan" en la vista de un plan cerrado. Al abrir, entra en modo
// edición (POST narrativa/generar), muestra la PROSA narrada del plan y un chat
// para pedir cambios en lenguaje natural ("son 250/semana, no 1000/mes"). Los
// cambios se acumulan en la prosa (scratchpad) — NO tocan el plan estructurado.
//
// La "Coordinación" (reconcile narrativa→estructura) llega en el Hito 2; acá se
// muestra deshabilitada con su explicación.

'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import { ReconcileModal } from './ReconcileModal'
import type { ReconcileChangeset } from '@/lib/types'

interface Props {
  planId: string
  editableInicial: boolean
}

export function EditorPlanCerrado({ planId }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [prosa, setProsa] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [ultimoCambio, setUltimoCambio] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [coordinando, setCoordinando] = useState(false)
  const [changeset, setChangeset] = useState<ReconcileChangeset | null>(null)
  const [versionActual, setVersionActual] = useState<string | null>(null)

  async function abrir() {
    setMounted(true)
    setAbierto(true)
    setCargando(true)
    setError(null)
    try {
      const res = await fetch(`/api/planes-estrategicos/${planId}/narrativa/generar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      setProsa(data.narrativa?.prosa ?? '')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCargando(false)
    }
  }

  async function enviar() {
    const m = mensaje.trim()
    if (!m || enviando) return
    setEnviando(true)
    setError(null)
    try {
      const res = await fetch(`/api/planes-estrategicos/${planId}/narrativa/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mensaje: m }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      setProsa(data.narrativa?.prosa ?? prosa)
      setUltimoCambio(data.resumen_cambio || 'Cambio aplicado a la narrativa.')
      setMensaje('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setEnviando(false)
    }
  }

  async function coordinar() {
    if (coordinando) return
    setCoordinando(true)
    setError(null)
    try {
      const res = await fetch(`/api/planes-estrategicos/${planId}/reconcile/start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      setChangeset(data.changeset)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCoordinando(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="rounded-lg bg-blue-700 hover:bg-blue-600 text-white text-[13px] font-medium px-4 py-2 transition-colors"
      >
        Editar plan ✎
      </button>

      {mounted && abierto && createPortal(
        <div className="font-sans text-white fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !enviando && setAbierto(false)} />
          <div className="relative bg-gray-900 border border-gray-600 rounded-lg shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col ring-1 ring-white/5">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between gap-4 flex-shrink-0">
              <div>
                <h2 className="text-[15px] font-semibold text-white">Editar plan — versión narrada</h2>
                <p className="text-[12px] text-gray-400 mt-0.5">
                  Pedí cambios en lenguaje natural. Se acumulan en esta narrativa; el plan estructurado no se toca todavía.
                </p>
              </div>
              <button onClick={() => setAbierto(false)} className="text-gray-400 hover:text-white text-xl leading-none px-2">×</button>
            </div>

            {/* Body: prosa */}
            <div className="overflow-y-auto flex-1 px-6 py-4">
              {cargando ? (
                <p className="text-[13px] text-gray-400">Generando la versión narrada del plan…</p>
              ) : (
                <div className="text-[14px] leading-relaxed text-gray-100 space-y-3
                  [&_h1]:text-[20px] [&_h1]:font-bold [&_h1]:text-white [&_h1]:mt-4 [&_h1]:mb-2
                  [&_h2]:text-[17px] [&_h2]:font-semibold [&_h2]:text-white [&_h2]:mt-4 [&_h2]:mb-1.5
                  [&_h3]:text-[15px] [&_h3]:font-semibold [&_h3]:text-gray-200 [&_h3]:mt-3 [&_h3]:mb-1
                  [&_p]:my-2 [&_strong]:text-white [&_strong]:font-semibold
                  [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1 [&_li]:text-gray-100">
                  <ReactMarkdown>{prosa}</ReactMarkdown>
                </div>
              )}
            </div>

            {/* Footer: chat + coordinar */}
            <div className="px-6 py-4 border-t border-gray-700 flex-shrink-0 space-y-2">
              {ultimoCambio && (
                <p className="text-[12px] text-emerald-300">✓ {ultimoCambio}</p>
              )}
              {error && (
                <p className="text-[12px] text-red-400">{error}</p>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={mensaje}
                  onChange={(e) => setMensaje(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
                  disabled={cargando || enviando}
                  placeholder='Ej: "son 250 por semana, no 1000 por mes"'
                  className="flex-1 text-[13px] text-gray-100 bg-gray-800 border border-gray-600 rounded px-3 py-2 focus:border-blue-500 focus:outline-none disabled:opacity-50"
                />
                <button
                  onClick={enviar}
                  disabled={cargando || enviando || !mensaje.trim()}
                  className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-[13px] font-medium px-4 py-2 rounded transition-colors"
                >
                  {enviando ? 'Aplicando…' : 'Pedir cambio'}
                </button>
              </div>
              <div className="flex items-center justify-between gap-3 pt-1">
                <p className="text-[11px] text-gray-500">
                  {versionActual ? `Versión activa: ${versionActual}. ` : ''}
                  Coordinar compara la narrativa con el plan estructurado y propone los cambios a métricas, criterios, etc.
                </p>
                <button
                  type="button"
                  onClick={coordinar}
                  disabled={cargando || coordinando}
                  title="Compara la narrativa con la estructura y propone cambios"
                  className="bg-purple-700 hover:bg-purple-600 disabled:bg-gray-800 disabled:text-gray-500 text-white text-[12px] px-3 py-1.5 rounded transition-colors"
                >
                  {coordinando ? 'Analizando…' : 'Coordinar →'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {changeset && (
        <ReconcileModal
          planId={planId}
          changeset={changeset}
          onCerrar={() => setChangeset(null)}
          onAplicado={(prosaNueva, version) => {
            if (prosaNueva) setProsa(prosaNueva)
            if (version) setVersionActual(version)
            setUltimoCambio(`Coordinado — nueva versión ${version || ''} creada.`)
            setChangeset(null)
          }}
        />
      )}
    </>
  )
}
