'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { TablaObjetivosWizard } from '@/components/programas/TablaObjetivosWizard'
import type { ObjetivoWizard } from '../types'
import type { Usuario } from '@/lib/types'

interface AnálisisResultado {
  secuenciaOk: boolean
  observaciones: string | null
  gapsDetectados: { entre: string; descripcion: string; despuesDeIndice: number }[] | null
  posiblesOmisiones: { entre: string; advertencia: string }[] | null
  sugerenciasAdicionales: string[] | null
}

interface Props {
  operativos: ObjetivoWizard[]
  onChange: (obs: ObjetivoWizard[]) => void
  usuarios: Usuario[]
  defaultFechaLimite?: string
  defaultResponsableId?: string
  defaultAprobadorId?: string
  proposito?: string
  objetivoMayor?: string
  onNext: () => Promise<void>
  onBack: () => void
  saving?: boolean
}

export function Step6Operativos({ operativos, onChange, usuarios, defaultFechaLimite, defaultResponsableId, defaultAprobadorId, proposito, objetivoMayor, onNext, onBack, saving }: Props) {
  const [analizando, setAnalizando] = useState(false)
  const [analisis, setAnalisis] = useState<AnálisisResultado | null>(null)

  function insertarDespuesDeIndice(indice: number) {
    const nuevo: ObjetivoWizard = {
      tempId: Math.random().toString(36).slice(2),
      nombre: '',
      descripcionDoingness: '',
      responsableId: defaultResponsableId ?? '',
      aprobadorId: defaultAprobadorId ?? '',
      fechaLimite: '',
      esRepetible: false,
    }
    const arr = [...operativos]
    arr.splice(indice + 1, 0, nuevo)
    onChange(arr)
    setAnalisis(null)
  }

  function agregarSugerido(nombre: string) {
    const nuevo: ObjetivoWizard = {
      tempId: Math.random().toString(36).slice(2),
      nombre,
      descripcionDoingness: '',
      responsableId: defaultResponsableId ?? '',
      aprobadorId: defaultAprobadorId ?? '',
      fechaLimite: '',
      esRepetible: false,
    }
    onChange([...operativos, nuevo])
    setAnalisis(null)
  }

  async function analizarSecuencia() {
    const validos = operativos.filter(o => o.nombre.trim())
    if (validos.length < 2) return
    setAnalizando(true)
    setAnalisis(null)
    try {
      const res = await fetch('/api/wizard-validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paso: 'analizar_secuencia',
          contenido: '',
          contexto: {
            proposito: proposito ?? '',
            objetivoMayor: objetivoMayor ?? '',
            objetivos: validos.map(o => ({
              nombre: o.nombre,
              doingness: o.descripcionDoingness,
              modo: o.modo ?? 'Secuencial',
            })),
          },
        }),
      })
      const data = await res.json()
      setAnalisis(data)
    } catch {}
    setAnalizando(false)
  }

  const validosCount = operativos.filter(o => o.nombre.trim()).length

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Paso 6 de 8</p>
        <h2 className="text-xl font-bold text-foreground">Objetivos Operativos</h2>
      </div>

      <blockquote className="border-l-2 border-orange-500 pl-4 space-y-1">
        <p className="text-sm text-muted-foreground italic">
          "Las acciones concretas con dirección y fechas.
          Si alguna depende de una condición previa
          ('si no encontrás X, hacé Y'), marcala como
          condicional con el checkbox."
        </p>
      </blockquote>

      <div className="space-y-2">
        <p className="text-sm text-foreground font-medium">¿Qué acciones concretas necesitás ejecutar? ¿Cuál es el itinerario?</p>
        <div className="text-xs text-muted-foreground/60 space-y-1 bg-muted/30 rounded-md px-3 py-2">
          <p>Ejemplos:</p>
          <p>· "Encontrar la pescadería más cercana" <span className="text-muted-foreground">(no condicional)</span></p>
          <p>· "Si no hay pescaderías a 5 cuadras, encontrar la carnicería más cercana" <span className="text-muted-foreground">(condicional ✓)</span></p>
          <p>· "Capacitar a todo el equipo en el nuevo proceso antes del lunes"</p>
        </div>
      </div>

      <TablaObjetivosWizard
        tipo="Operativo"
        objetivos={operativos}
        onChange={obs => { onChange(obs); setAnalisis(null) }}
        usuarios={usuarios}
        programaFechaObjetivo={defaultFechaLimite}
        defaultResponsableId={defaultResponsableId}
        defaultAprobadorId={defaultAprobadorId}
      />

      {/* Analizar secuencia */}
      {validosCount >= 2 && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={analizarSecuencia}
            disabled={analizando}
            className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border/50 rounded-md hover:bg-accent/30 transition-colors disabled:opacity-50"
          >
            {analizando ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <span>✦</span>
            )}
            Analizar secuencia
          </button>

          {analisis && (
            <div className="space-y-3">
              {analisis.secuenciaOk && !analisis.gapsDetectados?.length && !analisis.posiblesOmisiones?.length ? (
                <p className="text-sm text-green-400 flex items-center gap-1.5">
                  <span>✓</span> La secuencia tiene lógica.
                </p>
              ) : (
                <>
                  {analisis.observaciones && (
                    <div className="rounded-md border border-yellow-600/40 bg-yellow-900/10 p-3">
                      <p className="text-sm text-yellow-200">{analisis.observaciones}</p>
                    </div>
                  )}

                  {analisis.gapsDetectados && analisis.gapsDetectados.length > 0 && (
                    <div className="rounded-md border border-red-500/30 bg-red-900/10 p-3 space-y-2">
                      <p className="text-xs font-semibold text-red-300 uppercase tracking-wider">Gaps detectados:</p>
                      {analisis.gapsDetectados.map((gap, i) => (
                        <div key={i} className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-muted-foreground mb-0.5">Entre {gap.entre}:</p>
                            <p className="text-sm text-red-200">{gap.descripcion}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => insertarDespuesDeIndice(gap.despuesDeIndice ?? 0)}
                            className="flex-shrink-0 text-xs text-red-300 hover:text-red-200 border border-red-500/30 rounded px-2 py-0.5 transition-colors"
                          >
                            + Agregar aquí
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {analisis.posiblesOmisiones && analisis.posiblesOmisiones.length > 0 && (
                    <div className="rounded-md border border-orange-600/40 bg-orange-900/10 p-3 space-y-2">
                      <p className="text-xs font-semibold text-orange-300 uppercase tracking-wider">Posibles omisiones:</p>
                      {analisis.posiblesOmisiones.map((omision, i) => (
                        <p key={i} className="text-xs text-orange-200/80">⚠ Entre {omision.entre}: {omision.advertencia}</p>
                      ))}
                    </div>
                  )}
                </>
              )}

              {analisis.sugerenciasAdicionales && analisis.sugerenciasAdicionales.length > 0 && (
                <div className="rounded-md border border-blue-700/40 bg-blue-900/10 p-3 space-y-2">
                  <p className="text-xs font-semibold text-blue-300 uppercase tracking-wider">¿Falta alguno de estos?</p>
                  {analisis.sugerenciasAdicionales.map((sug, i) => (
                    <div key={i} className="flex items-center justify-between gap-2">
                      <p className="text-sm text-blue-200">{sug}</p>
                      <button
                        type="button"
                        onClick={() => agregarSugerido(sug)}
                        className="flex-shrink-0 text-xs text-blue-300 hover:text-blue-200 border border-blue-700/40 rounded px-2 py-0.5 transition-colors"
                      >
                        + Agregar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button type="button" onClick={onBack} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          ← Atrás
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Guardando...' : 'Continuar →'}
        </button>
      </div>
    </div>
  )
}
