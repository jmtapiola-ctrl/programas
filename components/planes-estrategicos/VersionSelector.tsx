// Selector de versiones del plan (F5 — historial). Permite ver versiones
// anteriores (preview read-only via ?version=) y restaurar una (la vuelve activa
// creando una versión nueva). Vive en el header de /vista.

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface VersionItem {
  numero: string
  resumen: string
  creada_en: string
  trigger: string
}

interface Props {
  planId: string
  versiones: VersionItem[]
  activa: string
  viendo: string
}

const TRIGGER_LABEL: Record<string, string> = {
  cierre: 'cierre', reconcile: 'edición', edicion_directa: 'edición directa', restauracion: 'restauración',
}

export function VersionSelector({ planId, versiones, activa, viendo }: Props) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [restaurando, setRestaurando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ordenadas = [...versiones].reverse() // más nueva primero
  const esActual = viendo === activa

  function irA(numero: string) {
    setAbierto(false)
    if (numero === activa) router.push(`/planes-estrategicos/${planId}/vista`)
    else router.push(`/planes-estrategicos/${planId}/vista?version=${encodeURIComponent(numero)}`)
  }

  async function restaurar() {
    if (restaurando) return
    if (!confirm(`¿Restaurar la versión ${viendo}? Se vuelve la versión activa del plan (creando una versión nueva). El contenido actual queda guardado en su versión.`)) return
    setRestaurando(true); setError(null)
    try {
      const res = await fetch(`/api/planes-estrategicos/${planId}/versiones/restaurar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ numero: viendo }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      router.push(`/planes-estrategicos/${planId}/vista`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setRestaurando(false)
    }
  }

  return (
    <span className="relative inline-flex items-center gap-2">
      <button
        onClick={() => setAbierto(o => !o)}
        className="rounded-lg border border-sidebar-border bg-sidebar/50 text-[13px] text-foreground px-3 py-2 hover:bg-accent/40 transition-colors"
      >
        Versión: <strong>{viendo}</strong>{esActual ? ' (actual)' : ''} ▾
      </button>

      {!esActual && (
        <button
          onClick={restaurar}
          disabled={restaurando}
          className="rounded-lg bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white text-[13px] font-medium px-3 py-2 transition-colors"
        >
          {restaurando ? 'Restaurando…' : `Restaurar ${viendo}`}
        </button>
      )}

      {abierto && (
        <div className="absolute top-full left-0 mt-1 z-20 w-80 max-h-80 overflow-y-auto rounded-lg border border-sidebar-border bg-background shadow-2xl">
          {ordenadas.map(v => (
            <button
              key={v.numero}
              onClick={() => irA(v.numero)}
              className={`block w-full text-left px-3 py-2 border-b border-sidebar-border/60 hover:bg-accent/40 transition-colors ${v.numero === viendo ? 'bg-accent/30' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-foreground">{v.numero}{v.numero === activa ? ' · actual' : ''}</span>
                <span className="text-[11px] text-muted-foreground">{TRIGGER_LABEL[v.trigger] ?? v.trigger}</span>
              </div>
              <p className="text-[11px] text-muted-foreground truncate">{v.resumen}</p>
              <p className="text-[10px] text-muted-foreground/70">{fmt(v.creada_en)}</p>
            </button>
          ))}
        </div>
      )}

      {error && <span className="text-[12px] text-red-400">{error}</span>}
    </span>
  )
}

function fmt(iso: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return iso }
}
