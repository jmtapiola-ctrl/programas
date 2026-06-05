import { getEntrevistaPE, getTurnosPE } from '@/lib/airtable'

async function main() {
  const PLAN_ID = 'recFMWxoE5gTQQrf7'
  const ent = await getEntrevistaPE(PLAN_ID)
  if (!ent) throw new Error('Entrevista no encontrada')
  const turnos = await getTurnosPE(ent.id!)
  const snap3 = turnos.find(t => t.rol === 'snapshot' && t.paso === 3)
  if (!snap3) { console.log('Sin snapshot paso=3'); return }

  console.log(`Snapshot paso=3: airtableId=${(snap3 as any)._airtableId}`)
  console.log(`Timestamp: ${(snap3 as any).timestamp}`)
  console.log(`Length: ${(snap3.contenido ?? '').length} chars`)

  // Parsear el snapshot y ver qué hay
  try {
    const parsed = JSON.parse(snap3.contenido ?? '')
    console.log(`\nKeys top-level: ${Object.keys(parsed).join(', ')}`)
    if (parsed.plan) {
      console.log(`plan keys: ${Object.keys(parsed.plan).join(', ')}`)
      if (parsed.plan.inventario) console.log(`  inventario.movimientos: ${parsed.plan.inventario.movimientos?.length ?? 0}`)
      if (parsed.plan.palancas) console.log(`  palancas.preguntas_principal: ${parsed.plan.palancas.preguntas_principal?.length ?? 0}`)
      if (parsed.plan.borrador) console.log(`  borrador.iteraciones: ${parsed.plan.borrador.iteraciones?.length ?? 0}`)
      if (parsed.plan.estres) console.log(`  estres.preguntas: ${parsed.plan.estres.preguntas?.length ?? 0}`)
      if (parsed.plan.curado) console.log(`  curado: ${parsed.plan.curado.contexto ? 'shape antiguo con contexto' : (parsed.plan.curado.versiones ? `${parsed.plan.curado.versiones.length} versiones` : 'shape raro')}`)
    }
  } catch (e: any) {
    console.log(`\nNo parsea como JSON: ${e.message}`)
    console.log(`Primeros 400 chars:`)
    console.log(snap3.contenido?.slice(0, 400))
  }
}

main().catch(e => { console.error(e); process.exit(1) })
