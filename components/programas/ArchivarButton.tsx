'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  programaId: string
  estadoActual: string
}

export function ArchivarButton({ programaId, estadoActual }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmando, setConfirmando] = useState(false)

  const estaArchivado = estadoActual === 'Archivado'

  async function cambiarEstado(nuevoEstado: string) {
    const res = await fetch(`/api/programas/${programaId}/estado`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: nuevoEstado }),
    })
    if (!res.ok) {
      alert('Error al actualizar el estado del programa.')
      return
    }
    startTransition(() => {
      router.refresh()
    })
  }

  if (estaArchivado) {
    return (
      <button
        onClick={() => cambiarEstado('Activo')}
        disabled={isPending}
        className="px-3 py-1.5 text-sm bg-muted hover:bg-accent text-foreground border border-border rounded-md transition-colors disabled:opacity-50 flex items-center gap-1.5"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12M10 12v4m4-4v4" />
        </svg>
        {isPending ? 'Desarchivando…' : 'Desarchivar'}
      </button>
    )
  }

  if (confirmando) {
    return (
      <div className="flex items-center gap-2 bg-card border border-border rounded-md px-3 py-1.5">
        <span className="text-sm text-muted-foreground">
          ¿Archivar programa?
        </span>
        <button
          onClick={() => {
            setConfirmando(false)
            cambiarEstado('Archivado')
          }}
          disabled={isPending}
          className="text-sm text-red-400 hover:text-red-300 font-medium disabled:opacity-50"
        >
          Confirmar
        </button>
        <button
          onClick={() => setConfirmando(false)}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Cancelar
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirmando(true)}
      disabled={isPending}
      className="px-3 py-1.5 text-sm bg-muted hover:bg-accent text-foreground border border-border rounded-md transition-colors disabled:opacity-50 flex items-center gap-1.5"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12" />
      </svg>
      {isPending ? 'Archivando…' : 'Archivar'}
    </button>
  )
}
