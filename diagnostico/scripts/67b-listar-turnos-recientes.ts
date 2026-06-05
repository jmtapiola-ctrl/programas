import { getEntrevistaPE, getTurnosPE, getPlanEstrategico } from '@/lib/airtable'

async function main() {
  const PLAN_ID = 'recFMWxoE5gTQQrf7'
  const ent = await getEntrevistaPE(PLAN_ID)
  if (!ent) throw new Error('Entrevista no encontrada')
  const turnos = await getTurnosPE(ent.id!)
  console.log(`Total turnos: ${turnos.length}`)
  console.log(`Roles únicos: ${[...new Set(turnos.map(t => t.rol))].join(', ')}`)

  // Últimos 15 turnos
  const ultimos = turnos.slice(-15)
  console.log(`\nÚltimos 15 turnos:`)
  for (const t of ultimos) {
    const ts = (t as any).timestamp ?? '(sin timestamp)'
    const tieneTomadas = t.contenido?.includes('Tomadas')
    const tieneAplico = t.contenido?.includes('Aplico')
    const tieneMacro = t.contenido?.includes('todas las macrozonas')
    const tiene60 = t.contenido?.includes('60 ventas') || t.contenido?.includes('60 dueños') || t.contenido?.includes('60/mes')
    const flags = [tieneTomadas && 'TOMADAS', tieneAplico && 'APLICO', tieneMacro && 'MACRO', tiene60 && '60'].filter(Boolean).join(',')
    const flagStr = flags ? `★ ${flags}` : ''
    console.log(`  i=${(t as any)._indice ?? '?'} rol=${t.rol} paso=${t.paso ?? '?'} ts=${ts} len=${(t.contenido ?? '').length} ${flagStr}`)
  }

  // Mostrar plan.proposito.metricas actual
  const plan = await getPlanEstrategico(PLAN_ID)
  console.log(`\n${'═'.repeat(72)}`)
  console.log(`plan.proposito.metricas ACTUAL en Airtable`)
  console.log('═'.repeat(72))
  const metricas = plan.proposito?.metricas ?? []
  for (const m of metricas) {
    if (typeof m === 'string') {
      console.log(`  - ${m}`)
    } else {
      console.log(`  - ${m.metrica}`)
      console.log(`    obj: ${m.valor_objetivo}`)
      console.log(`    hoy: ${m.valor_actual}`)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
