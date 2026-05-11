// Lectura del plan.situacion del Plan Sr para verificar persistencia de
// cambios aplicados durante el audit del Paso 2.

import { getPlanEstrategico, getReviewerTurnos, getEntrevistaPE } from '@/lib/airtable'

async function main() {
  const PLAN_ID = 'recFMWxoE5gTQQrf7'
  const plan = await getPlanEstrategico(PLAN_ID)
  const ent = await getEntrevistaPE(PLAN_ID)
  if (!ent) throw new Error('Entrevista no encontrada')

  console.log('=== plan.situacion (estado actual persistido) ===\n')
  const s = plan.situacion
  if (!s) { console.log('VACÍO'); return }
  console.log(`desvio_principal: "${s.desvio_principal}"`)
  console.log(`\ndesvio_cuantificado: "${s.desvio_cuantificado}"`)
  console.log(`\ncausa_raiz: "${s.causa_raiz}"`)
  console.log(`\nconsecuencia_6m: "${s.consecuencia_6m}"`)
  console.log(`\nconsecuencia_12m: "${s.consecuencia_12m}"`)
  console.log(`\nrecursos_actuales: "${s.recursos_actuales}"`)
  console.log(`\nrecursos_faltantes: "${s.recursos_faltantes}"`)
  console.log(`\nintentos_previos: "${s.intentos_previos}"`)
  console.log(`\ndesvios_secundarios: ${s.desvios_secundarios?.length ?? 0} items`)
  for (const d of s.desvios_secundarios ?? []) {
    console.log(`  · ${d.descripcion}: ${d.datos}`)
  }
  console.log(`\nresistencias: ${s.resistencias?.length ?? 0} items`)
  for (const r of s.resistencias ?? []) {
    console.log(`  · [${r.tipo}/${r.criticidad}] actor=${r.actor}: ${r.descripcion}`)
  }

  console.log('\n=== REVIEWER TURNO PASO 2 (audit + decisiones aplicadas) ===')
  const rev = await getReviewerTurnos(ent.id!, 2)
  for (const r of rev) {
    console.log(`\nAirtable ID: ${r.airtableId}`)
    console.log(`Decisiones registradas: ${r.decisiones?.length ?? 0}`)
    if (r.decisiones?.length) {
      for (const d of r.decisiones) {
        console.log(`  - hallazgo=${d.hallazgo_id} tipo=${d.tipo} decision=${d.decision}${d.texto_editado ? ` texto_editado="${d.texto_editado.slice(0, 100)}..."` : ''}`)
      }
    }
    console.log(`Snapshot pre-apply: ${r.snapshotPreApply ? 'PRESENTE' : 'AUSENTE'}`)
    if (r.snapshotPreApply?.situacion) {
      console.log(`  snapshot.situacion.desvio_cuantificado (ANTES de apply): "${r.snapshotPreApply.situacion.desvio_cuantificado?.slice(0, 200)}..."`)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
