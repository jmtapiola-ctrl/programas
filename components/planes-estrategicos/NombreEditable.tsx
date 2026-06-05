'use client'

// Componente del header del wizard que muestra el nombre del plan editable
// inline: click sobre el nombre → se transforma en input con botones ✓/✕
// para guardar/cancelar. PATCH a /api/planes-estrategicos/[id] con el nombre
// nuevo. Si falla, muestra error y conserva el nombre original.
//
// Diseño UX:
//   - Estado normal: nombre como texto + lápiz pequeño al hover.
//   - Click → input con foco automático + ✓ verde / ✕ rojo.
//   - Enter guarda. Escape cancela.
//   - Bloquea guardar si el input queda vacío.

import { useState, useRef, useEffect } from 'react'

interface Props {
  planId: string
  nombreActual: string
  onNombreActualizado: (nuevoNombre: string) => void
}

export function NombreEditable({ planId, nombreActual, onNombreActualizado }: Props) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(nombreActual)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus + select del texto al entrar a editing.
  useEffect(() => {
    if (editando && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editando])

  // Mantener valor sync con prop si cambia desde afuera (ej: por refresh).
  useEffect(() => {
    if (!editando) setValor(nombreActual)
  }, [nombreActual, editando])

  async function guardar() {
    const trimmed = valor.trim()
    if (!trimmed) {
      setError('El nombre no puede quedar vacío.')
      return
    }
    if (trimmed === nombreActual) {
      setEditando(false)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/planes-estrategicos/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: trimmed }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? `HTTP ${res.status}`)
      }
      onNombreActualizado(trimmed)
      setEditando(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  function cancelar() {
    setValor(nombreActual)
    setError(null)
    setEditando(false)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      void guardar()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelar()
    }
  }

  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => setEditando(true)}
        title="Click para editar el nombre del plan"
        className="group flex items-center gap-1.5 text-[13px] font-semibold text-foreground hover:text-primary transition-colors cursor-pointer"
      >
        <span>{nombreActual}</span>
        <span className="opacity-0 group-hover:opacity-60 text-[11px] transition-opacity">✎</span>
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          type="text"
          value={valor}
          onChange={(e) => { setValor(e.target.value); setError(null) }}
          onKeyDown={onKeyDown}
          disabled={saving}
          maxLength={200}
          className="text-[13px] font-semibold text-foreground bg-sidebar border border-primary/50 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary min-w-[280px]"
        />
        <button
          type="button"
          onClick={guardar}
          disabled={saving || !valor.trim()}
          title="Guardar (Enter)"
          className="text-emerald-400 hover:text-emerald-300 text-[14px] disabled:opacity-40 disabled:cursor-not-allowed px-1"
        >
          {saving ? '…' : '✓'}
        </button>
        <button
          type="button"
          onClick={cancelar}
          disabled={saving}
          title="Cancelar (Escape)"
          className="text-red-400 hover:text-red-300 text-[14px] disabled:opacity-40 px-1"
        >
          ✕
        </button>
      </div>
      {error && (
        <p className="text-[11px] text-red-400">{error}</p>
      )}
    </div>
  )
}
