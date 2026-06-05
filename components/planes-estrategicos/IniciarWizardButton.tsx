'use client'

// Botón CTA de la vista /inicio del Plan Jr (Fase 6). Dos modos:
//   - estado 'Listo para compartir': "Iniciar wizard →" → POST /marcar-iniciado-jr
//     (transiciona a 'En entrevista' + siembra el Paso 1) → navega a /entrevista.
//   - estado 'En entrevista': "Continuar wizard →" → navega directo a /entrevista.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BTN_CTA } from '@/components/ui/button-styles'

interface Props {
  planId: string
  estado: string
}

export default function IniciarWizardButton({ planId, estado }: Props) {
  const router = useRouter()
  const [iniciando, setIniciando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const yaIniciado = estado === 'En entrevista'

  async function iniciar() {
    if (yaIniciado) {
      router.push(`/planes-estrategicos/${planId}/entrevista`)
      return
    }
    setIniciando(true)
    setError(null)
    try {
      const res = await fetch(`/api/planes-estrategicos/${planId}/marcar-iniciado-jr`, { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? `HTTP ${res.status}`)
        setIniciando(false)
        return
      }
      router.push(`/planes-estrategicos/${planId}/entrevista`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setIniciando(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      {error && <span className="text-[12px] text-red-400">{error}</span>}
      <button
        type="button"
        onClick={iniciar}
        disabled={iniciando}
        className={BTN_CTA}
      >
        {iniciando ? 'Iniciando…' : yaIniciado ? 'Continuar wizard →' : 'Iniciar wizard →'}
      </button>
    </div>
  )
}
