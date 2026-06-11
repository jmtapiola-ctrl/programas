// Backfill: congela las ventanas CPM reales del Sr + rol crítico en el
// movs_heredados_snapshot de los Jr ya desplegados (que se congeló sin ventanas).
// Idempotente. Dry-run por defecto; --apply para escribir.
import { getPlanesEstrategicos, getPlanEstrategico, updatePlanEstrategico } from '../../lib/airtable'
import { congelarExpectativasSr } from '../../lib/sr-expectativas'
async function main() {
  const apply = process.argv.includes('--apply')
  const planes = await getPlanesEstrategicos('', 'Admin', '')
  let tocados = 0, ok = 0
  for (const p of planes) {
    if (p.tipo !== 'Jr' || !p.plan_sr_id || !(p.movs_heredados_snapshot?.length)) continue
    tocados++
    const yaCongelado = p.movs_heredados_snapshot.some((m: any) => m.ventana_temporal || m.sr_desbloquea_total != null)
    const sr = await getPlanEstrategico(p.plan_sr_id).catch(() => null)
    const srInv = sr?.plan?.inventario?.movimientos ?? []
    if (srInv.length === 0) { console.log(`  ✗ ${p.id} ${p.nombre} — Sr sin inventario, salteo`); continue }
    const enriquecido = congelarExpectativasSr(p.movs_heredados_snapshot, srInv)
    const conVentana = enriquecido.filter((m: any) => m.ventana_temporal).length
    const maxDesb = enriquecido.reduce((mx: number, m: any) => Math.max(mx, m.sr_desbloquea_total ?? 0), 0)
    console.log(`  ${apply ? '+' : '·'} ${p.id} ${p.nombre} | movs=${enriquecido.length} conVentana=${conVentana} maxDesbloquea=${maxDesb} ${yaCongelado ? '(ya tenía algo)' : ''}`)
    enriquecido.forEach((m: any) => console.log(`      ${m.id} ventana=${m.ventana_temporal ? m.ventana_temporal.arranca+'→'+m.ventana_temporal.termina : 'NONE'} sr_desbloquea=${m.sr_desbloquea_total ?? '?'}`))
    if (apply) { await updatePlanEstrategico(p.id, { movs_heredados_snapshot: enriquecido }); ok++ }
  }
  console.log(`\nJr con snapshot: ${tocados} | ${apply ? `actualizados: ${ok}` : 'DRY-RUN (pasar --apply)'}`)
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
