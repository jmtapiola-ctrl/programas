'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Programa, Usuario } from '@/lib/types'

interface Props {
  programas: Programa[]
  usuariosMap: Record<string, Usuario>
}

export function ArchivadosSection({ programas, usuariosMap }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  if (programas.length === 0) return null

  async function desarchivar(id: string) {
    const res = await fetch(`/api/programas/${id}/estado`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: 'Activo' }),
    })
    if (!res.ok) { alert('Error al desarchivar.'); return }
    startTransition(() => router.refresh())
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => setAbierto(v => !v)}
        className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>🗄 Archivados ({programas.length})</span>
        <svg
          className={`w-4 h-4 transition-transform ${abierto ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {abierto && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {programas.map(p => {
            const responsables = p.responsableIds.map(id => usuariosMap[id]).filter(Boolean)
            return (
              <div key={p.id} className="bg-card border border-border rounded-lg p-4 opacity-70 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground border border-border">
                      Archivado
                    </span>
                  </div>
                  <Link href={`/programas/${p.id}`} className="text-sm font-medium text-foreground hover:text-blue-400 line-clamp-1">
                    {p.nombre}
                  </Link>
                  {responsables.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">{responsables.map(r => r.nombre).join(', ')}</p>
                  )}
                </div>
                <button
                  onClick={() => desarchivar(p.id)}
                  disabled={isPending}
                  className="px-2.5 py-1 text-xs bg-muted hover:bg-accent text-foreground border border-border rounded-md transition-colors whitespace-nowrap disabled:opacity-50 flex-shrink-0"
                >
                  Desarchivar
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
