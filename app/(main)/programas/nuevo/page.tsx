'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input, Textarea, Select } from '@/components/ui/Input'
import { Tooltip } from '@/components/ui/Tooltip'
import type { Usuario } from '@/lib/types'

export default function NuevoProgramaPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [form, setForm] = useState({
    nombre: '',
    situacion: '',
    proposito: '',
    descripcion: '',
    objetivoMayor: '',
    estado: 'Borrador' as const,
    responsableId: '',
    aprobadorId: '',
    fechaInicio: new Date().toISOString().split('T')[0],
    fechaObjetivo: '',
    notas: '',
  })

  useEffect(() => {
    fetch('/api/airtable/tblXhgSBuh0f1BNPV')
      .then(r => r.json())
      .then(d => {
        const users = (d.records ?? []).map((r: any) => ({
          id: r.id,
          nombre: r.fields['Nombre'] ?? '',
          email: r.fields['Email'] ?? '',
          rol: r.fields['Rol']?.name ?? r.fields['Rol'] ?? 'Operador',
          activo: r.fields['Activo'] ?? false,
        }))
        setUsuarios(users.filter((u: Usuario) => u.activo))
      })
      .catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const fields: Record<string, any> = {
      'Nombre': form.nombre,
      'Estado': form.estado,
    }
    if (form.situacion) fields['Situacion'] = form.situacion
    if (form.proposito) fields['Proposito'] = form.proposito
    if (form.descripcion) fields['Descripcion'] = form.descripcion
    if (form.objetivoMayor) fields['Objetivo Mayor'] = form.objetivoMayor
    if (form.responsableId) fields['Responsable'] = [form.responsableId]
    if (form.aprobadorId) fields['Aprobador'] = [form.aprobadorId]
    if (form.fechaInicio) fields['Fecha Inicio'] = form.fechaInicio
    if (form.fechaObjetivo) fields['Fecha Objetivo'] = form.fechaObjetivo
    if (form.notas) fields['Notas'] = form.notas

    const res = await fetch('/api/airtable/tbld952MAM0ApHqT0', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    })

    setLoading(false)
    if (res.ok) {
      const data = await res.json()
      router.push(`/programas/${data.id}`)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Nuevo Programa</h1>
        <p className="text-muted-foreground text-sm mt-1">Creá un nuevo programa de objetivos</p>
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
            onChange={e => setForm(f => ({ ...f, proposito: e.target.value }))}
            rows={3}
            placeholder="Los propósitos tienen que ejecutarse. Son algo que HACER."
            className="bg-transparent border border-input text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 rounded-md px-3 py-2 text-sm w-full"
          />
          <p className="text-xs text-muted-foreground mt-1">Los propósitos tienen que ejecutarse. Son algo que HACER.</p>
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
          <p className="text-xs text-muted-foreground mt-1">Usuario que aprueba los cumplimientos de los objetivos de este programa.</p>
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
          <Button type="submit" loading={loading}>Crear Programa</Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>Cancelar</Button>
        </div>
      </form>
    </div>
  )
}
