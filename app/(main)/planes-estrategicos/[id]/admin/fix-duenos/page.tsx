'use client'

// Página temporal de admin: aplica los 4 cambios al inventario del Plan Sr
// directamente vía el endpoint /paso3/inventario/decision, bypaseando al
// modelo. Útil cuando el modelo verbaliza cambios al inventario pero no
// emite plan.inventario en su PANEL_UPDATE y los cambios se pierden.
//
// Cambios hardcoded (Bloque B del usuario):
//   M-22 → Santi Tosco
//   M-18 → Lu Arraga
//   M-31 → Jugador estrella POZO (vacante)
//   M-33 → Franco Guglielmone

import { useState } from 'react'
import { useParams } from 'next/navigation'

type Resultado = { movId: string; ok: boolean; mensaje: string }

const CAMBIOS = [
  { movimiento_id: 'M-22', patch: { dueno: 'Santi Tosco', dueno_es_vacante: false } },
  { movimiento_id: 'M-18', patch: { dueno: 'Lu Arraga', dueno_es_vacante: false } },
  { movimiento_id: 'M-31', patch: { dueno: 'Jugador estrella POZO (vacante)', dueno_es_vacante: true } },
  { movimiento_id: 'M-33', patch: { dueno: 'Franco Guglielmone', dueno_es_vacante: false } },
]

export default function FixDuenosPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const [running, setRunning] = useState(false)
  const [resultados, setResultados] = useState<Resultado[]>([])

  async function aplicar() {
    if (!id || running) return
    setRunning(true)
    setResultados([])
    const acc: Resultado[] = []
    for (const c of CAMBIOS) {
      try {
        const res = await fetch(`/api/planes-estrategicos/${id}/paso3/inventario/decision`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...c, estado: 'editado' }),
        })
        const data = await res.json().catch(() => null)
        acc.push({
          movId: c.movimiento_id,
          ok: res.ok,
          mensaje: res.ok ? `OK · dueño actualizado a "${c.patch.dueno}"` : (data?.error ?? `HTTP ${res.status}`),
        })
      } catch (e) {
        acc.push({
          movId: c.movimiento_id,
          ok: false,
          mensaje: e instanceof Error ? e.message : String(e),
        })
      }
      setResultados([...acc])
    }
    setRunning(false)
  }

  const todoOk = resultados.length === CAMBIOS.length && resultados.every(r => r.ok)

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-2xl mx-auto space-y-5">
        <header className="space-y-2">
          <h1 className="text-[20px] font-bold text-foreground">Fix dueños del inventario</h1>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Página temporal: aplica los 4 cambios al inventario directamente, sin pasar por el modelo. Usar si el chat verbalizó cambios pero no los persistió.
          </p>
        </header>

        <section className="rounded-lg border border-sidebar-border bg-sidebar/30 px-4 py-3">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Cambios a aplicar
          </p>
          <ul className="space-y-1.5 text-[13px] text-foreground/90">
            {CAMBIOS.map(c => (
              <li key={c.movimiento_id} className="flex items-baseline gap-2">
                <span className="font-mono text-[12px] text-muted-foreground/80">{c.movimiento_id}</span>
                <span>→ dueño: <span className="font-semibold">{c.patch.dueno}</span></span>
                {c.patch.dueno_es_vacante && (
                  <span className="text-[11px] text-amber-300/80 italic">(marcado como vacante)</span>
                )}
              </li>
            ))}
          </ul>
        </section>

        <button
          onClick={aplicar}
          disabled={running}
          className="rounded-lg bg-primary px-5 py-2.5 text-[14px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {running ? 'Aplicando…' : 'Aplicar los 4 cambios'}
        </button>

        {resultados.length > 0 && (
          <section className="rounded-lg border border-sidebar-border bg-sidebar/30 px-4 py-3">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Resultados
            </p>
            <ul className="space-y-1.5 text-[13px]">
              {resultados.map(r => (
                <li key={r.movId} className={`flex items-baseline gap-2 ${r.ok ? 'text-green-300' : 'text-red-300'}`}>
                  <span>{r.ok ? '✓' : '✗'}</span>
                  <span className="font-mono text-[12px] opacity-80">{r.movId}</span>
                  <span className="text-[12px]">{r.mensaje}</span>
                </li>
              ))}
            </ul>
            {todoOk && (
              <p className="mt-3 text-[12px] text-green-300/90 leading-relaxed">
                Todo OK. Volvé a la entrevista, regenerá el curado y las fichas de M-22, M-18, M-31, M-33 deberían mostrar los dueños correctos.
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
