import { getEntrevistaPE, getPlanEstrategico, getTurnosPE } from '@/lib/airtable'

async function main() {
  const PLAN_ID = 'recFMWxoE5gTQQrf7'
  const ent = await getEntrevistaPE(PLAN_ID)
  if (!ent) throw new Error('Entrevista no encontrada')

  console.log('═'.repeat(72))
  console.log('ENTREVISTA — estado')
  console.log('═'.repeat(72))
  console.log(`paso_actual: ${ent.paso_actual}`)
  console.log(`sub_bloque_actual: ${ent.sub_bloque_actual}`)
  console.log(`sub_estado_paso: ${ent.sub_estado_paso}`)

  const plan = await getPlanEstrategico(PLAN_ID)
  console.log('\n' + '═'.repeat(72))
  console.log('PLAN.PLAN — qué sub-bloques tienen contenido REAL')
  console.log('═'.repeat(72))
  console.log(`preparativos: ${plan.plan?.preparativos ? 'SÍ' : 'NO'}`)
  if (plan.plan?.preparativos) {
    console.log(`  areas_afectadas: ${plan.plan.preparativos.areas_afectadas?.length ?? 0}`)
    console.log(`  supuestos_exogenos: ${plan.plan.preparativos.supuestos_exogenos?.length ?? 0}`)
    console.log(`  priorizacion_inicial.desvio_elegido: "${plan.plan.preparativos.priorizacion_inicial?.desvio_elegido?.slice(0, 60) ?? ''}"`)
    console.log(`  criterio_exito.por_metrica: ${plan.plan.preparativos.criterio_exito?.por_metrica?.length ?? 0} (con minimo lleno: ${plan.plan.preparativos.criterio_exito?.por_metrica?.filter(c => c.minimo?.trim()).length ?? 0})`)
    console.log(`  criterio_exito.zona_fracaso: "${plan.plan.preparativos.criterio_exito?.zona_fracaso?.slice(0, 60) ?? '(vacía)'}"`)
  }
  console.log(`\ninventario: ${plan.plan?.inventario ? `SÍ (${plan.plan.inventario.movimientos?.length ?? 0} movs)` : '❌ NO'}`)
  console.log(`palancas: ${plan.plan?.palancas ? `SÍ (${plan.plan.palancas.preguntas_principal?.length ?? 0} principal, ${plan.plan.palancas.preguntas_validador?.length ?? 0} validador)` : '❌ NO'}`)
  console.log(`borrador: ${plan.plan?.borrador ? `SÍ (${plan.plan.borrador.iteraciones?.length ?? 0} iteraciones)` : '❌ NO'}`)
  console.log(`estres: ${plan.plan?.estres ? `SÍ (${plan.plan.estres.preguntas?.length ?? 0} preguntas)` : '❌ NO'}`)
  console.log(`curado: ${plan.plan?.curado ? `SÍ (${plan.plan.curado.versiones?.length ?? 0} versiones)` : '❌ NO'}`)

  // Buscar snapshots
  const turnos = await getTurnosPE(ent.id!)
  const snapshots = turnos.filter(t => t.rol === 'snapshot')
  console.log('\n' + '═'.repeat(72))
  console.log(`SNAPSHOTS (rol=snapshot): ${snapshots.length}`)
  console.log('═'.repeat(72))
  for (const s of snapshots) {
    const ts = (s as any).timestamp ? new Date((s as any).timestamp).toLocaleString('es-AR') : '?'
    console.log(`\n[${ts}] paso=${s.paso} len=${(s.contenido ?? '').length}`)
    console.log(`Preview: ${(s.contenido ?? '').slice(0, 200).replace(/\n/g, ' ')}...`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
