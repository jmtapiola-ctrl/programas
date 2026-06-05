import { getEntrevistaPE, getPlanEstrategico } from '@/lib/airtable'

async function main() {
  const PLAN_ID = 'recFMWxoE5gTQQrf7'
  const ent = await getEntrevistaPE(PLAN_ID)
  if (!ent) throw new Error('Entrevista no encontrada')

  console.log('═'.repeat(72))
  console.log('ENTREVISTA — campos relevantes')
  console.log('═'.repeat(72))
  console.log(`paso_actual: ${ent.paso_actual}`)
  console.log(`sub_bloque_actual: ${ent.sub_bloque_actual}`)
  console.log(`sub_estado_paso: ${ent.sub_estado_paso}`)
  console.log(`turnos_sin_panel_consecutivos: ${ent.turnos_sin_panel_consecutivos}`)
  console.log(`retries_panel_update_acumulados: ${ent.retries_panel_update_acumulados}`)
  console.log(`ultimo_panel_update_ok: ${ent.ultimo_panel_update_ok}`)
  console.log(`panel_update_resumido?: ${(ent as any).panel_update_resumido ? `SÍ (${((ent as any).panel_update_resumido?.length ?? 0)} chars)` : 'NO'}`)

  // panel_update_resumido podría tener los supuestos si el bloque entró
  const resumido = (ent as any).panel_update_resumido
  if (resumido && typeof resumido === 'string' && resumido.length > 0) {
    try {
      const parsed = JSON.parse(resumido)
      console.log(`\nKeys del PANEL_UPDATE resumido: ${Object.keys(parsed).join(', ')}`)
      const sup = parsed?.plan?.preparativos?.supuestos_exogenos
      if (sup) {
        console.log(`✓ supuestos_exogenos: ${sup.length} items`)
        for (const s of sup.slice(0, 3)) {
          console.log(`  - ${s.descripcion?.slice(0, 80)} (tipo=${s.tipo})`)
        }
      } else {
        console.log(`❌ No hay plan.preparativos.supuestos_exogenos en resumido.`)
        if (parsed.plan) console.log(`plan keys: ${Object.keys(parsed.plan).join(', ')}`)
      }
    } catch (e: any) {
      console.log(`❌ resumido no parsea: ${e.message}`)
    }
  }

  console.log('\n' + '═'.repeat(72))
  console.log('PLAN — estado de preparativos')
  console.log('═'.repeat(72))
  const plan = await getPlanEstrategico(PLAN_ID)
  console.log(`plan.plan?: ${plan.plan ? 'SÍ' : 'NO'}`)
  if (plan.plan) {
    console.log(`plan.plan keys: ${Object.keys(plan.plan).join(', ')}`)
    console.log(`plan.plan.preparativos:`, JSON.stringify(plan.plan.preparativos, null, 2)?.slice(0, 500))
  }
}

main().catch(e => { console.error(e); process.exit(1) })
