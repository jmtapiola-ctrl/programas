'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/Button'
import { Input, Textarea, Select } from '@/components/ui/Input'
import { Tooltip } from '@/components/ui/Tooltip'
import { TOOLTIP_TIPOS, getTomorrow } from '@/lib/types'
import type { Usuario, Programa } from '@/lib/types'

export default function NuevoObjetivoPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const programaIdParam = searchParams.get('programaId') ?? ''
  const { data: session } = useSession()
  const userId = (session?.user as any)?.id as string | undefined

  const [loading, setLoading] = useState(false)
  const [validando, setValidando] = useState(false)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [programas, setProgramas] = useState<Programa[]>([])
  const [doignessError, setDoignessError] = useState('')
  const [erroresGemini, setErroresGemini] = useState<{ principio: string; descripcion: string }[]>([])
  const [sugerenciaGemini, setSugerenciaGemini] = useState<string | null>(null)
  const [textSugerencia, setTextSugerencia] = useState('')
  const [form, setForm] = useState({
    nombre: '',
    tipo: 'Operativo',
    programaId: programaIdParam,
    responsableId: '',
    aprobadorId: '',
    estado: 'No iniciado' as const,
    fechaLimite: getTomorrow(),
    descripcionDoingness: '',
    esRepetible: false,
    orden: '',
    notas: '',
  })

  useEffect(() => {
    Promise.all([
      fetch('/api/airtable/tblXhgSBuh0f1BNPV').then(r => r.json()),
      fetch('/api/airtable/tbld952MAM0ApHqT0').then(r => r.json()),
    ]).then(([ud, pd]) => {
      setUsuarios((ud.records ?? []).map((r: any) => ({
        id: r.id,
        nombre: r.fields['Nombre'] ?? '',
        email: r.fields['Email'] ?? '',
        rol: r.fields['Rol']?.name ?? r.fields['Rol'] ?? 'Operador',
        activo: r.fields['Activo'] ?? false,
      })).filter((u: Usuario) => u.activo))
      const ps = (pd.records ?? []).map((r: any) => ({
        id: r.id,
        nombre: r.fields['Nombre'] ?? '',
        estado: r.fields['Estado']?.name ?? r.fields['Estado'] ?? 'Borrador',
        responsableIds: r.fields['Responsable'] ?? [],
        aprobadorId: (r.fields['Aprobador'] ?? [])[0] as string | undefined,
        objetivoIds: r.fields['Objetivos'] ?? [],
      }))
      setProgramas(ps)
      // Pre-select program's aprobador
      if (programaIdParam) {
        const prog = ps.find((p: any) => p.id === programaIdParam)
        if (prog?.aprobadorId) {
          setForm(f => ({ ...f, aprobadorId: f.aprobadorId || prog.aprobadorId! }))
        }
      }
    }).catch(() => {})
  }, [])

  async function doSave(descripcionFinal: string) {
    setLoading(true)
    const estadoFinal = (form.responsableId && form.responsableId !== userId) ? 'Asignado' : 'No iniciado'
    const fields: Record<string, any> = {
      'Nombre': form.nombre,
      'Tipo': form.tipo,
      'Estado': estadoFinal,
      'Es Repetible': form.esRepetible,
    }
    if (form.programaId) fields['Programa'] = [form.programaId]
    if (form.responsableId) fields['Responsable'] = [form.responsableId]
    if (form.aprobadorId) fields['Aprobador'] = [form.aprobadorId]
    if (form.fechaLimite) fields['Fecha Limite'] = form.fechaLimite
    if (descripcionFinal) fields['Descripcion Doingness'] = descripcionFinal
    if (form.orden) fields['Orden'] = parseInt(form.orden)
    if (form.notas) fields['Notas'] = form.notas
    const res = await fetch('/api/airtable/tbl9ljCeFDMeCsbAT', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    })
    setLoading(false)
    if (res.ok) {
      const data = await res.json()
      router.push(`/objetivos/${data.id}`)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!form.descripcionDoingness.trim()) {
      setDoignessError('Un objetivo sin doingness no es un objetivo. Describí la acción concreta que lo completa.')
      return
    }
    setDoignessError('')

    // Validar con Gemini antes de guardar
    setValidando(true)
    try {
      const validRes = await fetch('/api/validar-objetivo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: form.nombre, descripcionDoingness: form.descripcionDoingness, tipo: form.tipo }),
      })
      const validData = await validRes.json()
      if (!validData.valido) {
        setErroresGemini(validData.errores ?? [])
        setValidando(false)
        return
      }
      // CASO B: válido con sugerencia
      if (validData.sugerencia) {
        setSugerenciaGemini(validData.sugerencia)
        setTextSugerencia(`${form.descripcionDoingness}\n----\n${validData.sugerencia}`)
        setValidando(false)
        return
      }
    } catch {}
    setErroresGemini([])
    setValidando(false)

    // CASO C: válido sin sugerencia → guardar directo
    await doSave(form.descripcionDoingness)
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Nuevo Objetivo</h1>
        <p className="text-muted-foreground text-sm mt-1">Todo objetivo debe ser terminable, realizable y completable</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-card border border-border rounded-lg p-6 space-y-5">
        <Input
          label="Nombre del Objetivo *"
          value={form.nombre}
          onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
          placeholder="Ej: Completar informe mensual"
          required
        />

        <div>
          <label className="text-muted-foreground text-xs font-medium mb-1 block">Descripción de Doingness *</label>
          <textarea
            value={form.descripcionDoingness}
            onChange={e => {
              setForm(f => ({ ...f, descripcionDoingness: e.target.value }))
              if (e.target.value.trim()) setDoignessError('')
            }}
            rows={4}
            placeholder={"¿Cuándo está HECHO este objetivo?\nDescribí la acción concreta y terminable."}
            className="bg-transparent border border-input text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 rounded-md px-3 py-2 text-sm w-full"
          />
          {doignessError && (
            <p className="text-red-400 text-xs mt-1">{doignessError}</p>
          )}
          {erroresGemini.length > 0 && (
            <div className="mt-2 p-3 bg-red-900/30 border border-red-700/50 rounded-md space-y-2">
              <p className="text-red-300 text-xs font-semibold">El objetivo no cumple los principios de la Serie:</p>
              {erroresGemini.map((err, i) => (
                <div key={i}>
                  <p className="text-red-300 text-xs font-medium">{err.principio}</p>
                  <p className="text-muted-foreground text-xs">{err.descripcion}</p>
                </div>
              ))}
            </div>
          )}
          {sugerenciaGemini && (
            <div className="mt-2 p-3 bg-yellow-900/30 border border-yellow-700/50 rounded-md space-y-2">
              <p className="text-yellow-300 text-xs font-semibold">💡 Gemini sugiere una versión más precisa</p>
              <p className="text-muted-foreground text-xs">Editá libremente. Podés usar el original, la sugerencia, o combinar ambos.</p>
              <textarea
                value={textSugerencia}
                onChange={e => setTextSugerencia(e.target.value)}
                rows={6}
                className="bg-transparent border border-yellow-700/50 text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 rounded-md px-3 py-2 text-sm w-full"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setForm(f => ({ ...f, descripcionDoingness: textSugerencia }))
                    setSugerenciaGemini(null)
                    doSave(textSugerencia)
                  }}
                  className="px-3 py-1.5 text-xs bg-yellow-700 hover:bg-yellow-600 text-white rounded-md transition-colors"
                >
                  Usar este texto
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSugerenciaGemini(null)
                    doSave(form.descripcionDoingness)
                  }}
                  className="px-3 py-1.5 text-xs bg-muted hover:bg-accent text-foreground rounded-md transition-colors"
                >
                  Ignorar sugerencia
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <label className="text-muted-foreground text-xs font-medium">Tipo</label>
              <Tooltip texto={TOOLTIP_TIPOS[form.tipo] ?? 'Seleccioná un tipo para ver su definición.'} />
            </div>
            <select
              value={form.tipo}
              onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
              className="bg-transparent border border-input text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 rounded-md px-3 py-2 text-sm w-full"
            >
              <option>Primario</option>
              <option>Vital</option>
              <option>Condicional</option>
              <option>Operativo</option>
              <option>Producción</option>
              <option>Mayor</option>
            </select>
          </div>

          <Select
            label="Estado"
            value={form.estado}
            onChange={e => setForm(f => ({ ...f, estado: e.target.value as any }))}
          >
            <option>No iniciado</option>
            <option>Asignado</option>
            <option>En curso</option>
            <option>Completado</option>
            <option>Incumplido</option>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {programaIdParam ? (
            <div>
              <label className="text-muted-foreground text-xs font-medium mb-1 block">Programa</label>
              <div className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-muted-foreground text-sm">
                {programas.find(p => p.id === programaIdParam)?.nombre ?? programaIdParam}
              </div>
            </div>
          ) : (
            <Select
              label="Programa"
              value={form.programaId}
              onChange={e => setForm(f => ({ ...f, programaId: e.target.value }))}
            >
              <option value="">Sin programa</option>
              {programas.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </Select>
          )}

          <div>
            <Select
              label="Responsable"
              value={form.responsableId}
              onChange={e => setForm(f => ({ ...f, responsableId: e.target.value }))}
            >
              <option value="">Sin asignar</option>
              {usuarios.map(u => (
                <option key={u.id} value={u.id}>{u.nombre}</option>
              ))}
            </Select>
            {form.responsableId && form.responsableId !== userId && (
              <p className="text-xs text-muted-foreground mt-1">
                Este objetivo se asignará en estado &apos;Asignado&apos;. El responsable deberá aceptarlo antes de poder iniciarlo.
              </p>
            )}
          </div>
        </div>

        {usuarios.filter(u => u.rol === 'Ejecutivo').length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <label className="text-muted-foreground text-xs font-medium">Aprobador (opcional)</label>
            </div>
            <select
              value={form.aprobadorId}
              onChange={e => setForm(f => ({ ...f, aprobadorId: e.target.value }))}
              className="bg-transparent border border-input text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 rounded-md px-3 py-2 text-sm w-full"
            >
              <option value="">Sin asignar (usa el del programa)</option>
              {usuarios.filter(u => u.rol === 'Ejecutivo').map(u => (
                <option key={u.id} value={u.id}>{u.nombre}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">Si no se asigna, se usa el aprobador del programa.</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Fecha Límite"
            type="date"
            value={form.fechaLimite}
            onChange={e => setForm(f => ({ ...f, fechaLimite: e.target.value }))}
          />
          <Input
            label="Orden"
            type="number"
            value={form.orden}
            onChange={e => setForm(f => ({ ...f, orden: e.target.value }))}
            placeholder="1, 2, 3..."
          />
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="esRepetible"
            checked={form.esRepetible}
            onChange={e => setForm(f => ({ ...f, esRepetible: e.target.checked }))}
            className="w-4 h-4 rounded border-border bg-card text-blue-600 focus-visible:ring-2"
          />
          <label htmlFor="esRepetible" className="text-sm text-muted-foreground">
            Es Repetible (al cumplirse vuelve a Pendiente)
          </label>
        </div>

        <Textarea
          label="Notas"
          value={form.notas}
          onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
          placeholder="Notas adicionales..."
        />

        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={loading || validando}>
            {validando ? 'Validando objetivo...' : 'Crear Objetivo'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push(programaIdParam ? `/programas/${programaIdParam}` : '/programas')}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  )
}
