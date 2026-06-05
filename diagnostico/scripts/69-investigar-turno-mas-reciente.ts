import { getEntrevistaPE, getTurnosPE } from '@/lib/airtable'

async function main() {
  const PLAN_ID = 'recFMWxoE5gTQQrf7'
  const ent = await getEntrevistaPE(PLAN_ID)
  if (!ent) throw new Error('Entrevista no encontrada')
  const turnos = await getTurnosPE(ent.id!)

  // Últimos 8 turnos para ver contexto
  const ultimos = turnos.slice(-8)
  console.log(`\nÚltimos 8 turnos:`)
  for (const t of ultimos) {
    const ts = (t as any).timestamp ? new Date((t as any).timestamp).toLocaleString('es-AR') : '?'
    const contenido = t.contenido ?? ''
    const hasBlock = /<!--\s*PANEL_UPDATE\s*-->/.test(contenido) && /<!--\s*\/PANEL_UPDATE\s*-->/.test(contenido)
    const flag = hasBlock ? '✓ PANEL_UPDATE' : (t.rol === 'model' ? '❌ SIN PANEL_UPDATE' : '')
    console.log(`  [${ts}] rol=${t.rol} paso=${t.paso} len=${contenido.length} ${flag}`)
  }

  // Último turno modelo
  const ultimoModelo = [...turnos].reverse().find(t => t.rol === 'model')
  if (!ultimoModelo) { console.log('Sin turnos modelo'); return }

  const contenido = ultimoModelo.contenido ?? ''
  const ts = (ultimoModelo as any).timestamp ? new Date((ultimoModelo as any).timestamp).toLocaleString('es-AR') : '?'

  console.log(`\n${'═'.repeat(72)}`)
  console.log(`ÚLTIMO TURNO MODELO`)
  console.log('═'.repeat(72))
  console.log(`Timestamp: ${ts}`)
  console.log(`Paso: ${ultimoModelo.paso}`)
  console.log(`Length: ${contenido.length} chars (~${Math.ceil(contenido.length / 4)} tokens)`)

  const blockOpen = contenido.indexOf('<!--PANEL_UPDATE-->')
  const blockClose = contenido.indexOf('<!--/PANEL_UPDATE-->')
  console.log(`\n¿Tiene <!--PANEL_UPDATE-->? ${blockOpen >= 0 ? `SÍ (pos ${blockOpen})` : '❌ NO'}`)
  console.log(`¿Tiene <!--/PANEL_UPDATE-->? ${blockClose >= 0 ? `SÍ (pos ${blockClose})` : '❌ NO'}`)

  if (blockOpen >= 0 && blockClose < 0) {
    console.log(`\n⚠ Hay apertura pero NO cierre — TRUNCADO. El modelo se quedó sin max_tokens antes de cerrar el bloque.`)
    console.log(`Tail del contenido (últimos 500 chars):`)
    console.log(contenido.slice(-500))
  }

  console.log(`\n── HEAD del contenido (primeros 600 chars) ──`)
  console.log(contenido.slice(0, 600))
  console.log(`\n── TAIL del contenido (últimos 800 chars) ──`)
  console.log(contenido.slice(-800))
}

main().catch(e => { console.error(e); process.exit(1) })
