// Modal de coordinación (reconcile) — feature edición de planes cerrados, Hito 2.
//
// Muestra el changeset detectado (narrativa vs estructura) como cards: las
// aplicables con Aprobar / Editar / Ignorar; las fuera de alcance como
// informativas (no se aplican en V1). Al confirmar, postea los aprobados a
// reconcile/apply y avisa al padre.
//
// Reusa el patrón visual de las cards de auditoría (HallazgoCrossBlockCard) sin
// acoplar su máquina de persistencia (/decision) — acá las decisiones viven en
// estado local hasta que el usuario aplica.

'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReconcileChange, ReconcileChangeset } from '@/lib/types'

type Estado = 'pending' | 'aprobado' | 'ignorado'

interface Props {
  planId: string
  changeset: ReconcileChangeset
  onAplicado: (narrativaProsa: string | null, version: string) => void
  onCerrar: () => void
}

const SEV_BG: Record<string, string> = {
  Alta: 'bg-red-900/40 border-red-700 text-red-200',
  Media: 'bg-yellow-900/40 border-yellow-700 text-yellow-200',
  Baja: 'bg-blue-900/40 border-blue-700 text-blue-200',
}

export function ReconcileModal({ planId, changeset, onAplicado, onCerrar }: Props) {
  const aplicables = changeset.changes.filter(c => !c.fuera_de_alcance)
  const fueraDeAlcance = changeset.changes.filter(c => c.fuera_de_alcance)

  // Estado por cambio: decisión + texto (editable) del cambio_propuesto.
  const [estados, setEstados] = useState<Record<string, Estado>>(
    () => Object.fromEntries(aplicables.map(c => [c.id, 'pending' as Estado])),
  )
  const [textos, setTextos] = useState<Record<string, string>>(
    () => Object.fromEntries(aplicables.map(c => [c.id, c.cambio_propuesto])),
  )
  const [editando, setEditando] = useState<Record<string, boolean>>({})
  const [aplicando, setAplicando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pendientes = aplicables.filter(c => estados[c.id] === 'pending').length
  const aprobados = aplicables.filter(c => estados[c.id] === 'aprobado').length

  async function aplicar() {
    if (aplicando) return
    const changesAprobados: ReconcileChange[] = aplicables
      .filter(c => estados[c.id] === 'aprobado')
      .map(c => ({ ...c, cambio_propuesto: textos[c.id] ?? c.cambio_propuesto }))
    if (changesAprobados.length === 0) { setError('No aprobaste ningún cambio.'); return }
    setAplicando(true); setError(null)
    try {
      const res = await fetch(`/api/planes-estrategicos/${planId}/reconcile/apply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ changes: changesAprobados }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      onAplicado(data.narrativa?.prosa ?? null, data.version ?? '')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setAplicando(false)
    }
  }

  return createPortal(
    <div className="font-sans text-white fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !aplicando && onCerrar()} />
      <div className="relative bg-gray-900 border border-gray-600 rounded-lg shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col ring-1 ring-white/5">
        <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between gap-4 flex-shrink-0">
          <div>
            <h2 className="text-[15px] font-semibold text-white">Coordinar con el plan estructurado</h2>
            <p className="text-[12px] text-gray-400 mt-0.5">
              {changeset.meta.aplicables} cambio(s) aplicable(s){changeset.meta.fuera_de_alcance > 0 ? ` · ${changeset.meta.fuera_de_alcance} fuera de alcance` : ''}. Aprobá los que correspondan.
            </p>
          </div>
          <button onClick={onCerrar} className="text-gray-400 hover:text-white text-xl leading-none px-2">×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-3">
          {aplicables.length === 0 && (
            <p className="text-[13px] text-gray-400 text-center py-6">No se detectaron divergencias aplicables entre la narrativa y la estructura.</p>
          )}

          {aplicables.map(c => {
            const estado = estados[c.id]
            return (
              <div key={c.id} className={`rounded-lg p-4 space-y-3 ${estado === 'pending' ? 'bg-gray-800/50 border-2 border-yellow-600/60' : 'bg-gray-800/50 border border-gray-700'}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[12px] font-bold uppercase px-2 py-0.5 rounded ${SEV_BG[c.severidad] ?? SEV_BG.Media}`}>{c.severidad}</span>
                  <span className="text-[12px] text-purple-300 uppercase font-semibold">{c.surface}</span>
                  <span className="text-[12px] text-gray-600 font-mono">{c.id}</span>
                  {estado === 'aprobado' && <span className="text-[12px] text-green-400 font-semibold ml-auto">✓ aprobado</span>}
                  {estado === 'ignorado' && <span className="text-[12px] text-gray-500 font-semibold ml-auto">✗ ignorado</span>}
                </div>
                <div>
                  <p className="text-[12px] text-gray-200 uppercase tracking-wide font-medium mb-1">Dice la estructura</p>
                  <blockquote className="text-[13px] text-gray-100 bg-gray-900/60 border-l-2 border-gray-500 rounded-r px-3 py-2">{c.que_dice_estructura}</blockquote>
                </div>
                <div>
                  <p className="text-[12px] text-gray-200 uppercase tracking-wide font-medium mb-1">Dice la narrativa editada</p>
                  <blockquote className="text-[13px] text-gray-100 italic bg-gray-900/60 border-l-2 border-amber-600/60 rounded-r px-3 py-2">{c.que_dice_narrativa}</blockquote>
                </div>
                <div>
                  <p className="text-[12px] text-gray-200 uppercase tracking-wide font-medium mb-1">Cambio propuesto a la estructura</p>
                  {editando[c.id] ? (
                    <textarea value={textos[c.id]} onChange={e => setTextos(t => ({ ...t, [c.id]: e.target.value }))} rows={3}
                      className="w-full text-[13px] text-gray-100 bg-gray-900 border border-gray-600 rounded px-3 py-2 focus:border-purple-500 focus:outline-none" />
                  ) : (
                    <p className="text-[13px] text-purple-100 bg-purple-950/40 border-l-2 border-purple-500 rounded-r px-3 py-2 whitespace-pre-wrap">{textos[c.id]}</p>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => setEstados(s => ({ ...s, [c.id]: 'aprobado' }))} className="bg-green-700 hover:bg-green-600 text-white text-[13px] font-medium py-1.5 px-3 rounded">Aprobar</button>
                  <button onClick={() => setEditando(e => ({ ...e, [c.id]: !e[c.id] }))} className="bg-gray-700 hover:bg-gray-600 text-gray-200 text-[13px] py-1.5 px-3 rounded">{editando[c.id] ? 'Listo' : 'Editar'}</button>
                  <button onClick={() => setEstados(s => ({ ...s, [c.id]: 'ignorado' }))} className="bg-gray-700 hover:bg-gray-600 text-gray-400 text-[13px] py-1.5 px-3 rounded">Ignorar</button>
                </div>
              </div>
            )
          })}

          {fueraDeAlcance.length > 0 && (
            <div className="mt-4">
              <p className="text-[12px] uppercase tracking-wider text-gray-400 font-semibold border-b border-gray-700 pb-2 mb-2">
                Fuera de alcance ({fueraDeAlcance.length}) — detectados pero no aplicables en esta versión
              </p>
              {fueraDeAlcance.map(c => (
                <div key={c.id} className="rounded-lg p-3 mb-2 bg-gray-800/30 border border-gray-700/60">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] text-gray-400 uppercase font-semibold">{c.surface}</span>
                    <span className="text-[11px] text-gray-600 font-mono">{c.id}</span>
                  </div>
                  <p className="text-[12px] text-gray-300">{c.que_dice_narrativa || c.cambio_propuesto}</p>
                  <p className="text-[11px] text-gray-500 mt-1">Toca inventario / dependencias / Gantt — se editará cuando esa parte del feature esté disponible.</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-700 flex-shrink-0 space-y-2">
          {error && <p className="text-[12px] text-red-400">{error}</p>}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] text-gray-500">{aprobados} aprobado(s){pendientes > 0 ? ` · ${pendientes} sin decidir` : ''}</p>
            <button onClick={aplicar} disabled={aplicando || aprobados === 0}
              className={`py-2 px-4 rounded text-[13px] font-semibold transition-colors ${aprobados > 0 && !aplicando ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-gray-800 text-gray-500 cursor-not-allowed'}`}>
              {aplicando ? 'Aplicando y versionando…' : `Aplicar ${aprobados} cambio(s) → nueva versión`}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
