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
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [programas, setProgramas] = useState<Programa[]>([])
  const [doignessError, setDoignessError] = useState('')
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
        rol: r.fields['Rol']?.name ?? r.fields['Rol'] ?? 'Staff',
        activo: r.fields['Activo'] ?? false,
      })).filter((u: Usuario) => u.activo))
      setProgramas((pd.records ?? []).map((r: any) => ({
        id: r.id,
        nombre: r.fields['Nombre'] ?? '',
        estado: r.fields['Estado']?.name ?? r.fields['Estado'] ?? 'Borrador',
        responsableIds: r.fields['Responsable'] ?? [],
        objetivoIds: r.fields['Objetivos'] ?? [],
      })))
    }).catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!form.descripcionDoingness.trim()) {
      setDoignessError('Un objetivo sin doingness no es un objetivo. Describí la acción concreta que lo completa.')
      return
    }
    setDoignessError('')
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
    if (form.descripcionDoingness) fields['Descripcion Doingness'] = form.descripcionDoingness
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

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Nuevo Objetivo</h1>
        <p className="text-gray-400 text-sm mt-1">Todo objetivo debe ser terminable, realizable y completable</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-5">
        <Input
          label="Nombre del Objetivo *"
          value={form.nombre}
          onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
          placeholder="Ej: Completar informe mensual"
          required
        />

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Descripción de Doingness *</label>
          <textarea
            value={form.descripcionDoingness}
            onChange={e => {
              setForm(f => ({ ...f, descripcionDoingness: e.target.value }))
              if (e.target.value.trim()) setDoignessError('')
            }}
            rows={4}
            placeholder={"¿Cuándo está HECHO este objetivo?\nDescribí la acción concreta y terminable."}
            className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
          {doignessError && (
            <p className="text-red-400 text-xs mt-1">{doignessError}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <label className="block text-sm font-medium text-gray-300">Tipo</label>
              <Tooltip texto={TOOLTIP_TIPOS[form.tipo] ?? 'Seleccioná un tipo para ver su definición.'} />
            </div>
            <select
              value={form.tipo}
              onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
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
              <label className="block text-sm font-medium text-gray-300 mb-1">Programa</label>
              <div className="w-full bg-gray-700/50 border border-gray-600 rounded-md px-3 py-2 text-gray-400 text-sm">
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
              <p className="text-xs text-gray-500 mt-1">
                Este objetivo se asignará en estado &apos;Asignado&apos;. El responsable deberá aceptarlo antes de poder iniciarlo.
              </p>
            )}
          </div>
        </div>

        {usuarios.filter(u => u.rol === 'Ejecutivo').length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <label className="block text-sm font-medium text-gray-300">Aprobador (opcional)</label>
            </div>
            <select
              value={form.aprobadorId}
              onChange={e => setForm(f => ({ ...f, aprobadorId: e.target.value }))}
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            >
              <option value="">Sin asignar (usa el del programa)</option>
              {usuarios.filter(u => u.rol === 'Ejecutivo').map(u => (
                <option key={u.id} value={u.id}>{u.nombre}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">Si no se asigna, se usa el aprobador del programa.</p>
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
            className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="esRepetible" className="text-sm text-gray-300">
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
          <Button type="submit" loading={loading}>Crear Objetivo</Button>
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
