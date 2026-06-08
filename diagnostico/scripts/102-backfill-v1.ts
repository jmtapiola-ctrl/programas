// Backfill de la baseline V1 para planes YA cerrados (feature edición de planes
// cerrados). Idempotente. Dry-run por defecto; pasar --apply para escribir.
// "Cerrado" = estado 'Completado' O entrevista.paso_actual >= 4.
import { getPlanesEstrategicos, getEntrevistaPE, getPlanVersiones, createPlanVersion, updatePlanEstrategico } from '../../lib/airtable'
import { denormalizarPlanVersionSnapshot, siguienteNumeroVersion } from '../../lib/version-persistence'

async function main() {
  const apply = process.argv.includes('--apply')
  // Admin view: todos los planes.
  const planes = await getPlanesEstrategicos('', 'Admin', '')
  let cerrados = 0, creados = 0, yaTenian = 0
  for (const p of planes) {
    let cerrado = p.estado === 'Completado'
    if (!cerrado) {
      const ent = await getEntrevistaPE(p.id).catch(() => null)
      if ((ent?.paso_actual ?? 0) >= 4) cerrado = true
    }
    if (!cerrado) continue
    cerrados++
    const versiones = await getPlanVersiones(p.id)
    if (versiones.length > 0) { yaTenian++; console.log(`  = ${p.id} ${p.nombre} — ya tiene ${versiones.length} versión(es)`); continue }
    const numero = siguienteNumeroVersion(versiones)
    if (apply) {
      await createPlanVersion({ planId: p.id, numero, trigger: 'cierre', creadaPor: 'backfill', resumenCambio: 'Baseline retroactiva — plan ya estaba cerrado.', snapshot: denormalizarPlanVersionSnapshot(p) })
      await updatePlanEstrategico(p.id, { version_activa_label: numero })
      creados++
      console.log(`  + ${p.id} ${p.nombre} — creada ${numero}`)
    } else {
      console.log(`  · ${p.id} ${p.nombre} — crearía ${numero} (dry-run)`)
    }
  }
  console.log(`\nPlanes cerrados: ${cerrados} | ya tenían versión: ${yaTenian} | ${apply ? 'creadas' : 'a crear'}: ${apply ? creados : cerrados - yaTenian}`)
  console.log(apply ? 'APLICADO.' : 'DRY-RUN. Pasar --apply para escribir.')
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
