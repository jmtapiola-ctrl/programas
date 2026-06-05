// Cleanup one-off: borra el campo huérfano `cadenas_secuenciacion` del JSON
// `plan.inventario` en todos los planes. Se ejecuta una sola vez después del
// refactor multi-cadena → un DAG único por plan.
//
// `cadenas_secuenciacion` ya no está en el schema TypeScript (InventarioPE)
// pero los planes existentes (Plan Sr y otros) lo siguen teniendo en el JSON
// persistido en Airtable. Este script lo elimina para que no quede basura.
//
// Uso:
//   npx tsx --env-file=.env.local diagnostico/scripts/85-borrar-cadenas-secuenciacion.ts          (dry-run)
//   npx tsx --env-file=.env.local diagnostico/scripts/85-borrar-cadenas-secuenciacion.ts --apply  (mutación)

import { getPlanesEstrategicos, updatePlanEstrategico } from '@/lib/airtable'
import type { PlanoPE } from '@/lib/types'

const APPLY = process.argv.includes('--apply')

async function main() {
  console.log(`[cleanup] modo: ${APPLY ? 'APPLY (mutación a Airtable)' : 'DRY-RUN (solo lista)'}`)

  // Pasamos rol='Ejecutivo' para que la helper devuelva TODOS los planes sin
  // filtro de permisos (queremos limpiar todo el universo).
  const planes = await getPlanesEstrategicos('', 'Ejecutivo')
  console.log(`[cleanup] ${planes.length} planes encontrados.\n`)

  const conCadenas: Array<{
    id: string
    nombre: string
    countCadenas: number
    tieneDag: boolean
    plano: PlanoPE
  }> = []

  for (const p of planes) {
    const inv: any = p.plan?.inventario
    if (!inv) continue
    const cadenas = inv.cadenas_secuenciacion
    if (cadenas === undefined) continue
    conCadenas.push({
      id: p.id,
      nombre: p.nombre,
      countCadenas: Array.isArray(cadenas) ? cadenas.length : -1,
      tieneDag: inv.dag !== undefined && inv.dag !== null,
      plano: p.plan!,
    })
  }

  if (conCadenas.length === 0) {
    console.log('[cleanup] ✓ Ningún plan tiene cadenas_secuenciacion. Nada que limpiar.')
    return
  }

  console.log(`[cleanup] Planes con cadenas_secuenciacion (${conCadenas.length}):\n`)
  for (const c of conCadenas) {
    console.log(`  ${c.id}  "${c.nombre}"  · cadenas: ${c.countCadenas}  · dag: ${c.tieneDag ? '✓ sí' : '— no'}`)
  }
  console.log('')

  if (!APPLY) {
    console.log('[cleanup] DRY-RUN — no se modificó nada. Re-ejecutar con --apply para borrar.')
    return
  }

  console.log('[cleanup] Aplicando mutación...\n')
  for (const c of conCadenas) {
    const invNuevo = { ...c.plano.inventario } as any
    delete invNuevo.cadenas_secuenciacion
    const planoNuevo: PlanoPE = { ...c.plano, inventario: invNuevo }
    try {
      await updatePlanEstrategico(c.id, { plan: planoNuevo })
      console.log(`  ✓ ${c.id} "${c.nombre}" — cadenas_secuenciacion borrado`)
    } catch (e) {
      console.error(`  ✗ ${c.id} "${c.nombre}" — falló:`, e instanceof Error ? e.message : e)
    }
  }
  console.log('\n[cleanup] ✓ Done.')
}

main().catch(e => { console.error('[cleanup] FATAL:', e); process.exit(1) })
