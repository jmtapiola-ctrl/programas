// Investigación: el panel del wizard muestra Situación vieja aunque Airtable
// dice que está actualizada con los 4 ajustes del audit Paso 2.
//
// Hipótesis a chequear:
//   1. plan.situacion activo en Airtable ¿tiene los ajustes o no?
//   2. ¿Existen turnos rol='snapshot' del Paso 2 con un resumen viejo y el
//      panel lo está leyendo en lugar del campo activo?
//   3. ¿El reviewer turno con snapshotPreApply tiene la versión PRE-ajustes,
//      y eso confunde a alguna vista?

import { getPlanEstrategico, getEntrevistaPE, getTurnosPE, getReviewerTurnos } from '@/lib/airtable'

async function main() {
  const PLAN_ID = 'recFMWxoE5gTQQrf7'
  const plan = await getPlanEstrategico(PLAN_ID)
  const ent = await getEntrevistaPE(PLAN_ID)
  if (!ent) throw new Error('Entrevista no encontrada')

  console.log('═'.repeat(72))
  console.log('1) CAMPO ACTIVO plan.situacion en Airtable (fetchOne directo)')
  console.log('═'.repeat(72))
  const s = plan.situacion
  const marcadores = {
    'arranca con "Desvío principal compuesto"': s?.desvio_principal?.startsWith('Desvío principal compuesto:'),
    'desvio_cuantificado contiene "Hoy: 1 macrozona con stock pleno"': s?.desvio_cuantificado?.includes('Hoy: 1 macrozona con stock pleno'),
    'recursos_actuales contiene "Santi Tosco"': s?.recursos_actuales?.includes('Santi Tosco'),
    'recursos_actuales contiene "Studio Terravinci"': s?.recursos_actuales?.includes('Studio Terravinci'),
    'recursos_actuales contiene "Lu (Oficina Fundador"': s?.recursos_actuales?.includes('Lu (Oficina Fundador'),
    'recursos_faltantes contiene "Director/a de Marca Más Dueños"': s?.recursos_faltantes?.includes('Director/a de Marca Más Dueños'),
    'consecuencia_6m contiene "Quema masiva de leads"': s?.consecuencia_6m?.includes('Quema masiva de leads'),
    'consecuencia_12m contiene "1.200-1.500 unidades"': s?.consecuencia_12m?.includes('1.200-1.500 unidades'),
  }
  for (const [marker, found] of Object.entries(marcadores)) {
    console.log(`  ${found ? '✓' : '❌'} ${marker}`)
  }
  console.log(`\n  Longitudes (chars):`)
  console.log(`    desvio_principal: ${s?.desvio_principal?.length ?? 0}`)
  console.log(`    desvio_cuantificado: ${s?.desvio_cuantificado?.length ?? 0}`)
  console.log(`    recursos_actuales: ${s?.recursos_actuales?.length ?? 0}`)
  console.log(`    recursos_faltantes: ${s?.recursos_faltantes?.length ?? 0}`)
  console.log(`    consecuencia_6m: ${s?.consecuencia_6m?.length ?? 0}`)
  console.log(`    consecuencia_12m: ${s?.consecuencia_12m?.length ?? 0}`)

  console.log('\n' + '═'.repeat(72))
  console.log('2) SNAPSHOTS rol="snapshot" del Paso 2 en Turnos_PE')
  console.log('═'.repeat(72))
  const turnos = await getTurnosPE(ent.id!)
  const snapshots2 = turnos.filter(t => t.rol === 'snapshot' && t.paso === 2)
  console.log(`Turnos rol=snapshot paso=2: ${snapshots2.length}`)
  for (const sn of snapshots2) {
    const contenido = sn.contenido ?? ''
    console.log(`\n  Snapshot turno (indice=${(sn as any).indice ?? '?'}):`)
    console.log(`    contenido len: ${contenido.length} chars`)
    console.log(`    preview: "${contenido.slice(0, 300).replace(/\s+/g, ' ')}..."`)
    // Intentar parsear si es JSON
    try {
      const parsed = JSON.parse(contenido)
      console.log(`    ✓ parsea como JSON. Keys:`, Object.keys(parsed))
      if (parsed.situacion) {
        const ss = parsed.situacion
        console.log(`    snapshot.situacion.desvio_cuantificado contiene "Hoy: 1 macrozona": ${ss.desvio_cuantificado?.includes('Hoy: 1 macrozona') ? '✓' : '❌'}`)
        console.log(`    snapshot.situacion.recursos_actuales contiene "Santi Tosco": ${ss.recursos_actuales?.includes('Santi Tosco') ? '✓' : '❌'}`)
        console.log(`    snapshot.situacion.recursos_actuales len: ${ss.recursos_actuales?.length ?? 0}`)
      }
    } catch {
      console.log(`    ⚠ NO parsea como JSON — quizás es markdown plano.`)
    }
  }

  console.log('\n' + '═'.repeat(72))
  console.log('3) REVIEWER TURNO Paso 2 — snapshotPreApply (estado PRE-ajustes)')
  console.log('═'.repeat(72))
  const rev = await getReviewerTurnos(ent.id!, 2)
  for (const r of rev) {
    console.log(`\nAirtable ID: ${r.airtableId}`)
    if (r.snapshotPreApply) {
      const pre = r.snapshotPreApply
      if (pre.situacion) {
        const preS = pre.situacion
        console.log(`  snapshotPreApply.situacion (estado ANTES de aplicar decisiones):`)
        console.log(`    desvio_cuantificado contiene "Hoy: 1 macrozona": ${preS.desvio_cuantificado?.includes('Hoy: 1 macrozona') ? '✓' : '❌'}`)
        console.log(`    recursos_actuales contiene "Santi Tosco": ${preS.recursos_actuales?.includes('Santi Tosco') ? '✓' : '❌'}`)
        console.log(`    recursos_actuales len: ${preS.recursos_actuales?.length ?? 0}`)
        console.log(`    desvio_principal preview: "${preS.desvio_principal?.slice(0, 200)}..."`)
      }
    } else {
      console.log('  Sin snapshotPreApply.')
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
