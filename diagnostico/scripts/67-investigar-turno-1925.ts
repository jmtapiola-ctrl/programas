// Buscar el turno del Plan Sr donde el modelo dijo "Tomadas. Aplico las dos
// correcciones" (timestamp ~19:25 local 2026-05-11) y ver qué emitió en
// PANEL_UPDATE — específicamente si el cambio retroactivo se aplicó o quedó
// solo en la prosa.

import { getPlanEstrategico, getEntrevistaPE, getTurnosPE } from '@/lib/airtable'

async function main() {
  const PLAN_ID = 'recFMWxoE5gTQQrf7'
  const ent = await getEntrevistaPE(PLAN_ID)
  if (!ent) throw new Error('Entrevista no encontrada')
  const turnos = await getTurnosPE(ent.id!)

  // Filtrar turnos del modelo (rol=modelo) en las últimas 2 horas + buscar matches por contenido.
  const ahora = Date.now()
  const dosHorasMs = 12 * 60 * 60 * 1000  // 12h ventana
  const recientes = turnos.filter(t => {
    if (t.rol !== 'modelo') return false
    const ts = (t as any).timestamp ? new Date((t as any).timestamp).getTime() : 0
    return (ahora - ts) < dosHorasMs
  })

  console.log(`[diag] Turnos modelo recientes (últimas 2h): ${recientes.length}`)
  for (const t of recientes) {
    const ts = new Date((t as any).timestamp!).toLocaleString('es-AR')
    const matchTomadas = t.contenido?.includes('Tomadas') || t.contenido?.includes('Aplico')
    const matchOperando = t.contenido?.includes('Operando en todas las macrozonas') || t.contenido?.includes('60 ventas/mes')
    const flag = (matchTomadas || matchOperando) ? '★' : ' '
    console.log(`  ${flag} [${ts}] indice=${(t as any).indice ?? '?'} paso=${t.paso ?? '?'} sub=${(t as any).sub_bloque ?? '?'} len=${(t.contenido ?? '').length}`)
  }

  // Encontrar el más probable: el más reciente con match "Tomadas" o "Aplico"
  const candidatos = recientes
    .filter(t => t.contenido?.includes('Tomadas') || (t.contenido?.includes('Aplico') && t.contenido?.includes('corrección')))
    .sort((a, b) => new Date(b.fecha_hora!).getTime() - new Date(a.fecha_hora!).getTime())

  if (candidatos.length === 0) {
    console.log('\n[diag] ❌ Sin candidatos por "Tomadas"/"Aplico"+"corrección". Buscando por contenido de la corrección...')
    const alt = recientes.filter(t =>
      t.contenido?.includes('Operando en todas las macrozonas') ||
      t.contenido?.includes('60 ventas/mes')
    )
    if (alt.length > 0) candidatos.push(...alt)
  }

  if (candidatos.length === 0) {
    console.log('\n[diag] ❌ No encontré ningún turno match. Listando los 5 más recientes para inspección:')
    const top5 = recientes.sort((a, b) => new Date(b.fecha_hora!).getTime() - new Date(a.fecha_hora!).getTime()).slice(0, 5)
    for (const t of top5) {
      const ts = new Date((t as any).timestamp!).toLocaleString('es-AR')
      console.log(`\n── [${ts}] indice=${(t as any).indice ?? '?'} paso=${t.paso ?? '?'} sub=${(t as any).sub_bloque ?? '?'} ──`)
      console.log(`Contenido (primeros 400 chars):`)
      console.log(`  ${(t.contenido ?? '').slice(0, 400).replace(/\n/g, '\n  ')}`)
    }
    return
  }

  // Para cada candidato, mostrar contenido completo + extraer PANEL_UPDATE
  for (const t of candidatos.slice(0, 3)) {
    const ts = new Date((t as any).timestamp!).toLocaleString('es-AR')
    console.log(`\n${'═'.repeat(72)}`)
    console.log(`CANDIDATO: [${ts}] indice=${(t as any).indice ?? '?'} paso=${t.paso ?? '?'} sub=${(t as any).sub_bloque ?? '?'}`)
    console.log(`AirtableId: ${(t as any).airtableId ?? '?'}`)
    console.log('═'.repeat(72))

    const contenido = t.contenido ?? ''
    // Encontrar el bloque PANEL_UPDATE
    const puMatch = contenido.match(/<!--\s*PANEL_UPDATE\s*-->([\s\S]*?)<!--\s*\/PANEL_UPDATE\s*-->/)
    let prosa = contenido
    let panelRaw: string | null = null
    if (puMatch) {
      panelRaw = puMatch[1].trim()
      prosa = contenido.replace(puMatch[0], '').trim()
    }

    console.log(`\n── PROSA (lo que vio el usuario) ──`)
    console.log(prosa.slice(0, 800))

    if (!panelRaw) {
      console.log(`\n── PANEL_UPDATE ──`)
      console.log(`❌ El modelo NO emitió el bloque PANEL_UPDATE. Eso explicaría que el panel no se actualice.`)
      continue
    }

    console.log(`\n── PANEL_UPDATE (raw, primeros 2000 chars) ──`)
    console.log(panelRaw.slice(0, 2000))

    // Intentar parsear
    let parsed: any = null
    try {
      parsed = JSON.parse(panelRaw)
    } catch (e: any) {
      console.log(`\n❌ PANEL_UPDATE no parsea: ${e.message}`)
      continue
    }

    console.log(`\n── ANÁLISIS ──`)
    console.log(`Keys top-level: ${Object.keys(parsed).join(', ')}`)
    console.log(`paso_actual=${parsed.paso_actual}, sub_bloque_actual=${parsed.sub_bloque_actual}`)
    console.log(`proposito emitido: ${parsed.proposito !== undefined ? 'SÍ' : 'NO (omitido por regla no-re-emitir-congelados)'}`)
    console.log(`situacion emitida: ${parsed.situacion !== undefined ? 'SÍ' : 'NO'}`)

    if (parsed.proposito?.metricas) {
      console.log(`\nproposito.metricas (${parsed.proposito.metricas.length}):`)
      for (const m of parsed.proposito.metricas) {
        const obj = typeof m === 'string' ? m : `${m.metrica} → obj=${m.valor_objetivo?.slice(0, 80)}  hoy=${m.valor_actual?.slice(0, 50)}`
        console.log(`  - ${obj}`)
      }
      const hayOperando = parsed.proposito.metricas.some((m: any) => m.valor_objetivo?.includes('todas las macrozonas'))
      const haySesentaVentas = parsed.proposito.metricas.some((m: any) => m.valor_actual?.includes('60 ventas') || m.valor_actual?.includes('60 dueños'))
      console.log(`\n  ¿Correción 1 (operando en todas las macrozonas) presente en metricas? ${hayOperando ? '✓ SÍ' : '❌ NO'}`)
      console.log(`  ¿Correción 2 (60 ventas/mes) presente en metricas? ${haySesentaVentas ? '✓ SÍ' : '❌ NO'}`)
    }

    if (parsed.cambio_retroactivo) {
      console.log(`\ncambio_retroactivo:`)
      console.log(`  detectado=${parsed.cambio_retroactivo.detectado}`)
      console.log(`  toca_material_validado=${parsed.cambio_retroactivo.toca_material_validado}`)
      console.log(`  es_estructural=${parsed.cambio_retroactivo.es_estructural}`)
      console.log(`  bloque_afectado=${parsed.cambio_retroactivo.bloque_afectado}`)
      console.log(`  texto_previo=${parsed.cambio_retroactivo.texto_previo?.slice(0, 100)}`)
      console.log(`  descripcion_cambio=${parsed.cambio_retroactivo.descripcion_cambio?.slice(0, 150)}`)
    } else {
      console.log(`\ncambio_retroactivo: ❌ NO emitido (debería estar en cada turno, aunque sea con detectado=false)`)
    }
  }

  // También mostrar el último estado del plan en Airtable
  console.log(`\n${'═'.repeat(72)}`)
  console.log(`ESTADO ACTUAL DE plan.proposito.metricas EN AIRTABLE`)
  console.log('═'.repeat(72))
  const plan = await getPlanEstrategico(PLAN_ID)
  const metricas = plan.proposito?.metricas ?? []
  console.log(`Cantidad: ${metricas.length}`)
  for (const m of metricas) {
    const obj = typeof m === 'string' ? m : `${m.metrica} → obj=${m.valor_objetivo?.slice(0, 100)}  hoy=${m.valor_actual?.slice(0, 50)}`
    console.log(`  - ${obj}`)
  }
  const hayOperando = metricas.some((m: any) => m.valor_objetivo?.includes('todas las macrozonas'))
  const haySesenta = metricas.some((m: any) => m.valor_actual?.includes('60 '))
  console.log(`\n¿Correción 1 persistida en Airtable? ${hayOperando ? '✓ SÍ' : '❌ NO'}`)
  console.log(`¿Correción 2 persistida en Airtable? ${haySesenta ? '✓ SÍ' : '❌ NO'}`)
}

main().catch(e => { console.error('[diag] FATAL:', e); process.exit(1) })
