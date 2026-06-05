// GET /api/planes-estrategicos/[id]/admin/aplicar-cross-block-pendientes/campos
//
// Devuelve los campos editables del plan (propósito + situación) con sus
// valores actuales, en formato consumible por un dropdown del frontend.
// Necesario cuando el locator automático de cross-block fallа y el user
// tiene que elegir manualmente dónde aplicar.

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPlanEstrategico } from '@/lib/airtable'

interface CampoEditable {
  path: string         // ej: "proposito.escena" o "proposito.metricas[3].valor_objetivo"
  label: string        // ej: "Propósito · Métrica 4 · Valor objetivo"
  value: string        // texto actual del campo
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id: planId } = await params

  const plan = await getPlanEstrategico(planId).catch(() => null)
  if (!plan) return NextResponse.json({ error: 'Plan no encontrado' }, { status: 404 })

  const campos: CampoEditable[] = []

  // Propósito
  const p = plan.proposito
  if (p) {
    campos.push({ path: 'proposito.escena', label: 'Propósito · Escena (lugar de llegada)', value: p.escena ?? '' })
    campos.push({ path: 'proposito.horizonte', label: 'Propósito · Horizonte', value: p.horizonte ?? '' })
    campos.push({ path: 'proposito.estabilidad', label: 'Propósito · Estabilidad', value: p.estabilidad ?? '' })
    for (let i = 0; i < (p.metricas?.length ?? 0); i++) {
      const m = p.metricas[i]
      campos.push({
        path: `proposito.metricas[${i}].valor_objetivo`,
        label: `Propósito · Métrica ${i + 1} (${m.metrica.slice(0, 50)}) · Valor objetivo`,
        value: m.valor_objetivo ?? '',
      })
      campos.push({
        path: `proposito.metricas[${i}].valor_actual`,
        label: `Propósito · Métrica ${i + 1} (${m.metrica.slice(0, 50)}) · Valor actual`,
        value: m.valor_actual ?? '',
      })
    }
    for (let i = 0; i < (p.fuera?.length ?? 0); i++) {
      campos.push({
        path: `proposito.fuera[${i}].item`,
        label: `Propósito · Fuera de scope ${i + 1} · Item`,
        value: p.fuera[i].item ?? '',
      })
      campos.push({
        path: `proposito.fuera[${i}].razon`,
        label: `Propósito · Fuera de scope ${i + 1} · Razón`,
        value: p.fuera[i].razon ?? '',
      })
    }
  }

  // Situación
  const s = plan.situacion
  if (s) {
    campos.push({ path: 'situacion.desvio_principal', label: 'Situación · Desvío principal', value: s.desvio_principal ?? '' })
    campos.push({ path: 'situacion.desvio_cuantificado', label: 'Situación · Desvío cuantificado', value: s.desvio_cuantificado ?? '' })
    campos.push({ path: 'situacion.causa_raiz', label: 'Situación · Causa raíz', value: s.causa_raiz ?? '' })
    campos.push({ path: 'situacion.consecuencia_6m', label: 'Situación · Consecuencias en 6m', value: s.consecuencia_6m ?? '' })
    campos.push({ path: 'situacion.consecuencia_12m', label: 'Situación · Consecuencias en 12m', value: s.consecuencia_12m ?? '' })
    campos.push({ path: 'situacion.recursos_actuales', label: 'Situación · Recursos actuales', value: s.recursos_actuales ?? '' })
    campos.push({ path: 'situacion.recursos_faltantes', label: 'Situación · Recursos faltantes', value: s.recursos_faltantes ?? '' })
    campos.push({ path: 'situacion.intentos_previos', label: 'Situación · Intentos previos', value: s.intentos_previos ?? '' })
    for (let i = 0; i < (s.desvios_secundarios?.length ?? 0); i++) {
      campos.push({
        path: `situacion.desvios_secundarios[${i}].descripcion`,
        label: `Situación · Desvío secundario ${i + 1} · Descripción`,
        value: s.desvios_secundarios[i].descripcion ?? '',
      })
      campos.push({
        path: `situacion.desvios_secundarios[${i}].datos`,
        label: `Situación · Desvío secundario ${i + 1} · Datos`,
        value: s.desvios_secundarios[i].datos ?? '',
      })
    }
    for (let i = 0; i < (s.resistencias?.length ?? 0); i++) {
      campos.push({
        path: `situacion.resistencias[${i}].descripcion`,
        label: `Situación · Resistencia ${i + 1} (${s.resistencias[i].actor.slice(0, 40)}) · Descripción`,
        value: s.resistencias[i].descripcion ?? '',
      })
      campos.push({
        path: `situacion.resistencias[${i}].mitigacion`,
        label: `Situación · Resistencia ${i + 1} · Mitigación`,
        value: s.resistencias[i].mitigacion ?? '',
      })
    }
  }

  return NextResponse.json({ ok: true, campos })
}
