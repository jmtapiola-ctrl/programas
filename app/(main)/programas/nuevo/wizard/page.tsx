'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Usuario } from '@/lib/types'
import { WIZARD_INITIAL_STATE, type WizardState, type ObjetivoWizard } from './types'
import { Step1Situacion } from './steps/Step1Situacion'
import { Step2Proposito } from './steps/Step2Proposito'
import { Step3Organizacion } from './steps/Step3Organizacion'
import { Step4Condicionales } from './steps/Step4Condicionales'
import { Step5Primarios } from './steps/Step5Primarios'
import { Step6Vitales } from './steps/Step6Vitales'
import { Step7OperativosProduccion } from './steps/Step7OperativosProduccion'
import { StepRevision } from './steps/StepRevision'

const TABLA_OBJETIVOS = 'tbl9ljCeFDMeCsbAT'

const STEP_LABELS = [
  'Situación', 'Propósito', 'Organización',
  'Condicionales', 'Primarios', 'Vitales',
  'Operativos', 'Revisión',
]

function ProgressBar({ paso }: { paso: number }) {
  return (
    <div className="flex items-center gap-1 mb-8">
      {STEP_LABELS.map((label, i) => {
        const n = i + 1
        const done = n < paso
        const current = n === paso
        return (
          <div key={n} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-colors',
                done ? 'bg-primary text-primary-foreground' :
                current ? 'bg-primary/20 text-primary border-2 border-primary' :
                'bg-muted text-muted-foreground'
              )}>
                {done ? <Check className="h-3 w-3" /> : n}
              </div>
              <span className={cn(
                'text-[10px] whitespace-nowrap hidden sm:block',
                current ? 'text-foreground font-medium' : 'text-muted-foreground'
              )}>
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div className={cn('h-px w-4 sm:w-8 mx-1 mb-4 transition-colors', done ? 'bg-primary' : 'bg-border')} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function ContextPanel({ situacion, proposito }: { situacion: string; proposito: string }) {
  if (!situacion && !proposito) return null
  return (
    <div className="w-64 flex-shrink-0 space-y-4">
      <div className="sticky top-6 space-y-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contexto del programa</p>
        {situacion && (
          <div className="rounded-md border border-orange-800/30 bg-orange-900/10 p-3 space-y-1">
            <p className="text-[10px] font-medium text-orange-400 uppercase tracking-wider">Situación</p>
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-6">{situacion}</p>
          </div>
        )}
        {proposito && (
          <div className="rounded-md border border-blue-800/30 bg-blue-900/10 p-3 space-y-1">
            <p className="text-[10px] font-medium text-blue-400 uppercase tracking-wider">Propósito</p>
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-6">{proposito}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Save helpers ─────────────────────────────────────────────────────────────

async function wizardPost(data: Record<string, any>) {
  const res = await fetch('/api/wizard-save-programa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`Save failed: ${res.status}`)
  return res.json()
}

async function wizardPatch(id: string, data: Record<string, any>) {
  const res = await fetch(`/api/wizard-save-programa?id=${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`Patch failed: ${res.status}`)
  return res.json()
}

async function airtablePost(table: string, fields: Record<string, any>) {
  const res = await fetch(`/api/airtable/${table}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) throw new Error(`Airtable POST failed: ${res.status}`)
  return res.json()
}

async function airtablePatch(table: string, id: string, fields: Record<string, any>) {
  const res = await fetch(`/api/airtable/${table}?id=${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) throw new Error(`Airtable PATCH failed: ${res.status}`)
  return res.json()
}

async function airtableDelete(table: string, id: string) {
  await fetch(`/api/airtable/${table}?id=${id}`, { method: 'DELETE' })
}

async function saveObjetivos(
  programaId: string,
  tipo: string,
  objetivos: ObjetivoWizard[],
  existingIds: string[]
): Promise<ObjetivoWizard[]> {
  const currentIds = new Set(objetivos.filter(o => o.airtableId).map(o => o.airtableId!))
  for (const id of existingIds) {
    if (!currentIds.has(id)) await airtableDelete(TABLA_OBJETIVOS, id)
  }

  const validos = objetivos.filter(o => o.nombre.trim())
  const saved = await Promise.all(
    validos.map(async (obj, i): Promise<ObjetivoWizard> => {
      const fields: Record<string, any> = {
        'Nombre': obj.nombre,
        'Tipo': tipo,
        'Descripcion Doingness': obj.descripcionDoingness,
        'Programa': [programaId],
        'Estado': 'No iniciado',
        'Es Repetible': obj.esRepetible,
        'Orden': i,
      }
      if (obj.responsableId) fields['Responsable'] = [obj.responsableId]
      if (obj.aprobadorId) fields['Aprobador'] = [obj.aprobadorId]
      if (obj.fechaLimite) fields['Fecha Limite'] = obj.fechaLimite
      if (obj.notas) fields['Notas'] = obj.notas

      if (obj.airtableId) {
        await airtablePatch(TABLA_OBJETIVOS, obj.airtableId, fields)
        return obj
      } else {
        const data = await airtablePost(TABLA_OBJETIVOS, fields)
        return { ...obj, airtableId: data.id }
      }
    })
  )
  return saved
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function WizardPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const programaIdParam = searchParams.get('programaId')

  const [state, setState] = useState<WizardState>(() => ({
    ...WIZARD_INITIAL_STATE,
    fechaInicio: new Date().toISOString().split('T')[0],
  }))
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!!programaIdParam)
  const [estadoGuardado, setEstadoGuardado] = useState<'idle' | 'guardando' | 'guardado'>('idle')

  const [existingIds, setExistingIds] = useState<Record<string, string[]>>({
    Condicional: [], Primario: [], Vital: [], Operativo: [], 'Producción': [], Mayor: [],
  })

  // Load usuarios
  useEffect(() => {
    fetch(`/api/airtable/tblXhgSBuh0f1BNPV`)
      .then(r => r.json())
      .then(data => {
        const us = (data.records ?? []).map((r: any) => ({
          id: r.id,
          nombre: r.fields['Nombre'] ?? '',
          email: r.fields['Email'] ?? '',
          rol: r.fields['Rol']?.name ?? r.fields['Rol'] ?? 'Operador',
          activo: r.fields['Activo'] ?? false,
        })).filter((u: Usuario) => u.activo)
        setUsuarios(us)
      })
      .catch(() => {})
  }, [])

  // Load existing program if resuming
  useEffect(() => {
    if (!programaIdParam) return
    setLoading(true)
    fetch(`/api/wizard-load?programaId=${programaIdParam}`)
      .then(r => r.json())
      .then(({ programa, objetivos }) => {
        if (!programa) return

        const makeWizardObjetivos = (tipo: string): ObjetivoWizard[] =>
          objetivos
            .filter((o: any) => o.tipo === tipo)
            .sort((a: any, b: any) => (a.orden ?? 0) - (b.orden ?? 0))
            .map((o: any): ObjetivoWizard => ({
              tempId: Math.random().toString(36).slice(2),
              airtableId: o.id,
              nombre: o.nombre,
              descripcionDoingness: o.descripcionDoingness,
              responsableId: o.responsableId,
              aprobadorId: o.aprobadorId ?? '',
              fechaLimite: o.fechaLimite ?? '',
              esRepetible: o.esRepetible,
            }))

        const cond = makeWizardObjetivos('Condicional')
        const prim = makeWizardObjetivos('Primario')
        const vit = makeWizardObjetivos('Vital')
        const oper = makeWizardObjetivos('Operativo')
        const prod = makeWizardObjetivos('Producción')
        const mayor = makeWizardObjetivos('Mayor')

        setExistingIds({
          Condicional: cond.filter(o => o.airtableId).map(o => o.airtableId!),
          Primario: prim.filter(o => o.airtableId).map(o => o.airtableId!),
          Vital: vit.filter(o => o.airtableId).map(o => o.airtableId!),
          Operativo: oper.filter(o => o.airtableId).map(o => o.airtableId!),
          'Producción': prod.filter(o => o.airtableId).map(o => o.airtableId!),
          Mayor: mayor.filter(o => o.airtableId).map(o => o.airtableId!),
        })

        // Detect step to resume at based on how far the program progressed
        const isBorrador = !programa.nombre || programa.nombre.startsWith('Borrador -')
        let paso: number

        if (isBorrador && !programa.proposito) {
          paso = 1
        } else if (isBorrador) {
          paso = 2
        } else if (!cond.length && !prim.length && !vit.length && !oper.length && !prod.length) {
          paso = 3
        } else {
          paso = 4
          if (cond.length > 0) paso = 5
          if (prim.length > 0) paso = 6
          if (vit.length > 0) paso = 7
          if (oper.length > 0 || prod.length > 0) paso = 8
        }

        setState({
          programaId: programaIdParam,
          paso,
          situacion: programa.situacion ?? '',
          proposito: programa.proposito ?? '',
          nombre: programa.nombre ?? '',
          objetivoMayor: programa.objetivoMayor ?? '',
          responsableId: programa.responsableIds?.[0] ?? '',
          aprobadorId: programa.aprobadorId ?? '',
          fechaInicio: programa.fechaInicio ?? '',
          fechaObjetivo: programa.fechaObjetivo ?? '',
          objetivosCondicionales: cond,
          objetivosPrimarios: prim,
          objetivosVitales: vit,
          objetivosOperativos: oper,
          objetivosProduccion: prod,
          objetivosMayores: mayor,
        })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [programaIdParam])

  const update = useCallback((partial: Partial<WizardState>) => {
    setState(s => ({ ...s, ...partial }))
  }, [])

  function advance() { setState(s => ({ ...s, paso: s.paso + 1 })) }
  function goBack() { setState(s => ({ ...s, paso: Math.max(1, s.paso - 1) })) }

  function iniciarGuardado() {
    setSaving(true)
    setEstadoGuardado('guardando')
  }

  function finalizarGuardado() {
    setEstadoGuardado('guardado')
    setTimeout(() => setEstadoGuardado('idle'), 2000)
  }

  // ─── Step handlers ──────────────────────────────────────────────────────────

  const handleNext1 = useCallback(async () => {
    iniciarGuardado()
    try {
      if (state.programaId) {
        await wizardPatch(state.programaId, { situacion: state.situacion })
        advance()
      } else {
        const nombre = `Borrador - ${new Date().toLocaleDateString('es-AR')}`
        const data = await wizardPost({ nombre, situacion: state.situacion, estado: 'Borrador' })
        setState(s => ({ ...s, programaId: data.id, paso: 2 }))
      }
      finalizarGuardado()
    } catch (e) {
      console.error(e)
      setEstadoGuardado('idle')
    } finally {
      setSaving(false)
    }
  }, [state.programaId, state.situacion])

  const handleNext2 = useCallback(async () => {
    if (!state.programaId) { advance(); return }
    iniciarGuardado()
    try {
      await wizardPatch(state.programaId, { proposito: state.proposito })
      advance()
      finalizarGuardado()
    } catch (e) {
      console.error(e)
      setEstadoGuardado('idle')
      advance()
    } finally {
      setSaving(false)
    }
  }, [state.programaId, state.proposito])

  const handleNext3 = useCallback(async () => {
    iniciarGuardado()
    try {
      const programaData = {
        nombre: state.nombre,
        situacion: state.situacion,
        proposito: state.proposito,
        objetivoMayor: state.objetivoMayor || undefined,
        responsableIds: state.responsableId ? [state.responsableId] : [],
        aprobadorId: state.aprobadorId || undefined,
        fechaInicio: state.fechaInicio || undefined,
        fechaObjetivo: state.fechaObjetivo || undefined,
        estado: 'Borrador' as const,
      }
      if (state.programaId) {
        await wizardPatch(state.programaId, programaData)
        advance()
      } else {
        const data = await wizardPost(programaData)
        setState(s => ({ ...s, programaId: data.id, paso: 4 }))
      }
      finalizarGuardado()
    } catch (e) {
      console.error(e)
      setEstadoGuardado('idle')
    } finally {
      setSaving(false)
    }
  }, [state])

  const handleNext4 = useCallback(async () => {
    if (!state.programaId) return
    iniciarGuardado()
    try {
      const saved = await saveObjetivos(state.programaId, 'Condicional', state.objetivosCondicionales, existingIds.Condicional)
      setState(s => ({ ...s, objetivosCondicionales: saved, paso: 5 }))
      setExistingIds(e => ({ ...e, Condicional: saved.filter(o => o.airtableId).map(o => o.airtableId!) }))
      finalizarGuardado()
    } catch (e) { console.error(e); setEstadoGuardado('idle') } finally { setSaving(false) }
  }, [state, existingIds])

  const handleNext5 = useCallback(async () => {
    if (!state.programaId) return
    iniciarGuardado()
    try {
      const saved = await saveObjetivos(state.programaId, 'Primario', state.objetivosPrimarios, existingIds.Primario)
      setState(s => ({ ...s, objetivosPrimarios: saved, paso: 6 }))
      setExistingIds(e => ({ ...e, Primario: saved.filter(o => o.airtableId).map(o => o.airtableId!) }))
      finalizarGuardado()
    } catch (e) { console.error(e); setEstadoGuardado('idle') } finally { setSaving(false) }
  }, [state, existingIds])

  const handleNext6 = useCallback(async () => {
    if (!state.programaId) return
    iniciarGuardado()
    try {
      const saved = await saveObjetivos(state.programaId, 'Vital', state.objetivosVitales, existingIds.Vital)
      setState(s => ({ ...s, objetivosVitales: saved, paso: 7 }))
      setExistingIds(e => ({ ...e, Vital: saved.filter(o => o.airtableId).map(o => o.airtableId!) }))
      finalizarGuardado()
    } catch (e) { console.error(e); setEstadoGuardado('idle') } finally { setSaving(false) }
  }, [state, existingIds])

  const handleNext7 = useCallback(async () => {
    if (!state.programaId) return
    iniciarGuardado()
    try {
      const [savedOper, savedProd] = await Promise.all([
        saveObjetivos(state.programaId, 'Operativo', state.objetivosOperativos, existingIds.Operativo),
        saveObjetivos(state.programaId, 'Producción', state.objetivosProduccion, existingIds['Producción']),
      ])
      setState(s => ({ ...s, objetivosOperativos: savedOper, objetivosProduccion: savedProd, paso: 8 }))
      setExistingIds(e => ({
        ...e,
        Operativo: savedOper.filter(o => o.airtableId).map(o => o.airtableId!),
        'Producción': savedProd.filter(o => o.airtableId).map(o => o.airtableId!),
      }))
      finalizarGuardado()
    } catch (e) { console.error(e); setEstadoGuardado('idle') } finally { setSaving(false) }
  }, [state, existingIds])

  const handleFinalize = useCallback(async (estadoFinal: 'Borrador' | 'Activo') => {
    if (!state.programaId) return
    iniciarGuardado()
    try {
      await wizardPatch(state.programaId, { estado: estadoFinal })
      router.push(`/programas/${state.programaId}`)
    } catch (e) { console.error(e); setEstadoGuardado('idle') } finally { setSaving(false) }
  }, [state.programaId, router])

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
        Cargando programa...
      </div>
    )
  }

  const showContextPanel = state.paso >= 3

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-foreground">Nuevo Programa — Wizard</h1>
        <button
          type="button"
          onClick={() => router.push('/programas')}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancelar
        </button>
      </div>

      <ProgressBar paso={state.paso} />

      <div className={cn('flex gap-8', showContextPanel ? 'items-start' : '')}>
        <div className="flex-1 min-w-0">
          {state.paso === 1 && (
            <Step1Situacion
              situacion={state.situacion}
              onChange={v => update({ situacion: v })}
              onNext={handleNext1}
              saving={saving}
            />
          )}
          {state.paso === 2 && (
            <Step2Proposito
              situacion={state.situacion}
              proposito={state.proposito}
              onChange={v => update({ proposito: v })}
              onNext={handleNext2}
              onBack={goBack}
              saving={saving}
            />
          )}
          {state.paso === 3 && (
            <Step3Organizacion
              situacion={state.situacion}
              proposito={state.proposito}
              nombre={state.nombre}
              objetivoMayor={state.objetivoMayor}
              responsableId={state.responsableId}
              aprobadorId={state.aprobadorId}
              fechaInicio={state.fechaInicio}
              fechaObjetivo={state.fechaObjetivo}
              usuarios={usuarios}
              onChange={partial => update(partial as Partial<WizardState>)}
              onNext={handleNext3}
              onBack={goBack}
              saving={saving}
            />
          )}
          {state.paso === 4 && (
            <Step4Condicionales
              objetivos={state.objetivosCondicionales}
              onChange={obs => update({ objetivosCondicionales: obs })}
              usuarios={usuarios}
              defaultFechaLimite={state.fechaObjetivo}
              defaultResponsableId={state.responsableId}
              defaultAprobadorId={state.aprobadorId}
              onNext={handleNext4}
              onBack={goBack}
              saving={saving}
            />
          )}
          {state.paso === 5 && (
            <Step5Primarios
              objetivos={state.objetivosPrimarios}
              onChange={obs => update({ objetivosPrimarios: obs })}
              usuarios={usuarios}
              defaultFechaLimite={state.fechaObjetivo}
              defaultResponsableId={state.responsableId}
              defaultAprobadorId={state.aprobadorId}
              onNext={handleNext5}
              onBack={goBack}
              saving={saving}
            />
          )}
          {state.paso === 6 && (
            <Step6Vitales
              objetivos={state.objetivosVitales}
              onChange={obs => update({ objetivosVitales: obs })}
              usuarios={usuarios}
              defaultFechaLimite={state.fechaObjetivo}
              defaultResponsableId={state.responsableId}
              defaultAprobadorId={state.aprobadorId}
              onNext={handleNext6}
              onBack={goBack}
              saving={saving}
            />
          )}
          {state.paso === 7 && (
            <Step7OperativosProduccion
              operativos={state.objetivosOperativos}
              produccion={state.objetivosProduccion}
              onChangeOperativos={obs => update({ objetivosOperativos: obs })}
              onChangeProduccion={obs => update({ objetivosProduccion: obs })}
              usuarios={usuarios}
              defaultFechaLimite={state.fechaObjetivo}
              defaultResponsableId={state.responsableId}
              defaultAprobadorId={state.aprobadorId}
              onNext={handleNext7}
              onBack={goBack}
              saving={saving}
            />
          )}
          {state.paso === 8 && (
            <StepRevision
              state={state}
              usuarios={usuarios}
              onFinalize={handleFinalize}
              onBack={goBack}
              saving={saving}
            />
          )}
        </div>

        {showContextPanel && (
          <ContextPanel situacion={state.situacion} proposito={state.proposito} />
        )}
      </div>

      {/* Indicador de guardado */}
      {estadoGuardado !== 'idle' && (
        <div className="fixed bottom-4 right-4 text-xs text-muted-foreground flex items-center gap-1.5 bg-background border border-border rounded-md px-3 py-2 shadow-md z-50">
          {estadoGuardado === 'guardando'
            ? <><Loader2 className="w-3 h-3 animate-spin" /> Guardando...</>
            : <><Check className="w-3 h-3 text-green-500" /> Guardado</>
          }
        </div>
      )}
    </div>
  )
}
