'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Input, Textarea, Select } from '@/components/ui/Input'
import { Tooltip } from '@/components/ui/Tooltip'
import type { Usuario } from '@/lib/types'

export default function EditarProgramaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { data: session } = useSession()
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [propositoError, setPropositoError] = useState('')
  const [objetivosSinFecha, setObjetivosSinFecha] = useState<{ id: string; nombre: string }[]>([])
  const [form, setForm] = useState({
    nombre: '',
    situacion: '',
    proposito: '',
    descripcion: '',
    objetivoMayor: '',
    estado: 'Borrador' as 'Borrador' | 'Activo' | 'Completado' | 'Archivado',
    responsableId: '',
    aprobadorId: '',
    fechaInicio: '',
    fechaObjetivo: '',
    notas: '',
  })

  useEffect(() => {
    const role = (session?.user as any)?.role as string | undefined
    const userId = (session?.user as any)?.id as string | undefined

    Promise.all([
      fetch(`/api/airtable/tbld952MAM0ApHqT0/${id}`).then(r => r.json()),
      fetch('/api/airtable/tblXhgSBuh0f1BNPV').then(r => r.json()),
      fetch('/api/airtable/tbl9ljCeFDMeCsbAT').then(r => r.json()),
    ]).then(([progData, usersData, objsData]) => {
      const f = progData.fields ?? {}

      // Program Manager cannot edit; redirect back
      const responsableIds: string[] = f['Responsable'] ?? []
      if (role === 'Program Manager' && !responsableIds.includes(userId ?? '')) {
        router.replace(`/programas/${id}`)
        return
      }

      setForm({
        nombre: f['Nombre'] ?? '',
        situacion: f['Situacion'] ?? '',
        proposito: f['Proposito'] ?? '',
        descripcion: f['Descripcion'] ?? '',
        objetivoMayor: f['Objetivo Mayor'] ?? '',
        estado: f['Estado']?.name ?? f['Estado'] ?? 'Borrador',
        responsableId: f['Responsable']?.[0] ?? '',
        aprobadorId: f['Aprobador']?.[0] ?? '',
        fechaInicio: f['Fecha Inicio'] ?? '',
        fechaObjetivo: f['Fecha Objetivo'] ?? '',
        notas: f['Notas'] ?? '',
      })

      const users: Usuario[] = (usersData.records ?? []).map((r: any) => ({
        id: r.id,
        nombre: r.fields['Nombre'] ?? '',
        email: r.fields['Email'] ?? '',
        rol: r.fields['Rol']?.name ?? r.fields['Rol'] ?? 'Operador',
        activo: r.fields['Activo'] ?? false,
      }))
      setUsuarios(users.filter(u => u.activo))

      // Objetivos del programa sin fecha límite (para advertencia al activar)
      const programaObjetivoIds: string[] = f['Objetivos'] ?? []
      const sinFecha = (objsData.records ?? [])
        .filter((r: any) => programaObjetivoIds.includes(r.id) && !r.fields['Fecha Limite'])
        .map((r: any) => ({ id: r.id, nombre: r.fields['Nombre'] ?? r.id }))
      setObjetivosSinFecha(sinFecha)

      setLoadingData(false)
    }).catch(() => setLoadingData(false))
  }, [id, session, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPropositoError('')

    if (form.estado === 'Activo' && !form.proposito.trim()) {
      setPropositoError('Un programa sin propósito no puede activarse. Completá el campo Propósito antes de activar el programa.')
      return
    }

    setLoading(true)

    const fields: Record<string, any> = {
      'Nombre': form.nombre,
      'Estado': form.estado,
      'Situacion': form.situacion,
      'Proposito': form.proposito,
      'Descripcion': form.descripcion,
      'Objetivo Mayor': form.objetivoMayor,
      'Responsable': form.responsableId ? [form.responsableId] : [],
      'Aprobador': form.aprobadorId ? [form.aprobadorId] : [],
      'Fecha Inicio': form.fechaInicio || null,
      'Fecha Objetivo': form.fechaObjetivo || null,
      'Notas': form.notas,
    }

    const res = await fetch(`/api/airtable/tbld952MAM0ApHqT0/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    })

    setLoading(false)
    if (res.ok) {
      router.push(`/programas/${id}`)
    }
  }

  if (loadingData) {
    return <div className="text-muted-foreground py-8">Cargando...</div>
  }

  return (
    <div className="max-w-2xl space-y-6">
      <nav className="text-sm text-muted-foreground flex items-center gap-2">
        <Link href="/programas" className="hover:text-foreground">Programas</Link>
        <span>/</span>
        <Link href={`/programas/${id}`} className="hover:text-foreground">{form.nombre || id}</Link>
        <span>/</span>
        <span className="text-foreground">Editar</span>
      </nav>

      <div>
        <h1 className="text-2xl font-bold text-foreground">Editar Programa</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-card border border-border rounded-lg p-6 space-y-5">
        <Input
          label="Nombre del Programa *"
          value={form.nombre}
          onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
          placeholder="Ej: Expansión Q1 2026"
          required
        />

        <div>
          <div className="flex items-center gap-2 mb-1">
            <label className="text-muted-foreground text-xs font-medium">Situación</label>
            <Tooltip texto="El programa debe manejar situaciones verdaderas: las situaciones que reducen la producción y la prosperidad." />
          </div>
          <textarea
            value={form.situacion}
            onChange={e => setForm(f => ({ ...f, situacion: e.target.value }))}
            rows={3}
            placeholder="¿Qué situación real justifica este programa? ¿Qué problema concreto resuelve?"
            className="bg-transparent border border-input text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 rounded-md px-3 py-2 text-sm w-full"
          />
        </div>

        <div>
          <div className="flex items-center gap-2 mb-1">
            <label className="text-muted-foreground text-xs font-medium">Propósito</label>
            <Tooltip texto="Los propósitos tienen que ejecutarse. Son algo que HACER." />
          </div>
          <textarea
            value={form.proposito}
            onChange={e => {
              setForm(f => ({ ...f, proposito: e.target.value }))
              if (e.target.value.trim()) setPropositoError('')
            }}
            rows={3}
            placeholder="Los propósitos tienen que ejecutarse. Son algo que HACER."
            className={`bg-transparent border text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 rounded-md px-3 py-2 text-sm w-full ${propositoError ? 'border-red-500' : 'border-input'}`}
          />
          {propositoError && <p className="text-red-400 text-xs mt-1">{propositoError}</p>}
        </div>

        <div>
          <div className="flex items-center gap-2 mb-1">
            <label className="text-muted-foreground text-xs font-medium">Objetivo Mayor</label>
            <Tooltip texto={'El propósito general deseable que se acomete. Esto es muy general, como "llegar a ser auditor".'} />
          </div>
          <textarea
            value={form.objetivoMayor}
            onChange={e => setForm(f => ({ ...f, objetivoMayor: e.target.value }))}
            rows={3}
            placeholder="El gran objetivo que este programa debe lograr..."
            className="bg-transparent border border-input text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 rounded-md px-3 py-2 text-sm w-full"
          />
        </div>

        <Textarea
          label="Descripción"
          value={form.descripcion}
          onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
          placeholder="Descripción general del programa..."
        />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Select
              label="Estado"
              value={form.estado}
              onChange={e => setForm(f => ({ ...f, estado: e.target.value as any }))}
            >
              <option>Borrador</option>
              <option>Activo</option>
              <option>Completado</option>
              <option>Archivado</option>
            </Select>
            {form.estado === 'Activo' && objetivosSinFecha.length > 0 && (
              <div className="mt-2 p-3 bg-yellow-900/30 border border-yellow-700/50 rounded-md">
                <p className="text-yellow-300 text-xs font-medium mb-1">
                  ⚠ Hay {objetivosSinFecha.length} objetivo{objetivosSinFecha.length > 1 ? 's' : ''} sin fecha límite. Un objetivo sin fecha no tiene un ciclo claro de comenzar-cambiar-parar.
                </p>
                <ul className="text-yellow-400/80 text-xs space-y-0.5">
                  {objetivosSinFecha.map(o => (
                    <li key={o.id}>
                      <a href={`/objetivos/${o.id}`} className="hover:underline">{o.nombre}</a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

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
        </div>

        <div>
          <div className="flex items-center gap-2 mb-1">
            <label className="text-muted-foreground text-xs font-medium">Aprobador</label>
            <Tooltip texto="Usuario que aprueba los cumplimientos de los objetivos de este programa." />
          </div>
          <select
            value={form.aprobadorId}
            onChange={e => setForm(f => ({ ...f, aprobadorId: e.target.value }))}
            className="bg-transparent border border-input text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 rounded-md px-3 py-2 text-sm w-full"
          >
            <option value="">Sin asignar</option>
            {usuarios.filter(u => u.rol === 'Ejecutivo').map(u => (
              <option key={u.id} value={u.id}>{u.nombre}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Fecha Inicio"
            type="date"
            value={form.fechaInicio}
            onChange={e => setForm(f => ({ ...f, fechaInicio: e.target.value }))}
          />
          <Input
            label="Fecha Objetivo"
            type="date"
            value={form.fechaObjetivo}
            onChange={e => setForm(f => ({ ...f, fechaObjetivo: e.target.value }))}
          />
        </div>

        <Textarea
          label="Notas"
          value={form.notas}
          onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
          placeholder="Notas adicionales..."
        />

        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={loading}>Guardar Cambios</Button>
          <Button type="button" variant="secondary" onClick={() => router.push(`/programas/${id}`)}>Cancelar</Button>
        </div>
      </form>
    </div>
  )
}
