import { getEntrevistaPE, getTurnosPE } from '@/lib/airtable'

async function main() {
  const PLAN_ID = 'recFMWxoE5gTQQrf7'
  const ent = await getEntrevistaPE(PLAN_ID)
  if (!ent) throw new Error('Entrevista no encontrada')
  const turnos = await getTurnosPE(ent.id!)

  const ultimos = turnos.slice(-4)
  for (const t of ultimos) {
    const ts = (t as any).timestamp ? new Date((t as any).timestamp).toLocaleString('es-AR') : '?'
    console.log(`\n${'═'.repeat(72)}`)
    console.log(`[${ts}] rol=${t.rol} paso=${t.paso} len=${(t.contenido ?? '').length}`)
    console.log('═'.repeat(72))
    console.log(t.contenido ?? '(vacío)')
  }
}

main().catch(e => { console.error(e); process.exit(1) })
