// Unit test sin red de lib/draft-mov-apply.ts + impacto CPM.
// Correr: npx tsx diagnostico/scripts/107-mov-apply-unit.ts
import { aplicarMovCambios } from '../../lib/draft-mov-apply'
import { computeSchedule } from '../../lib/computeSchedule'
import type { InventarioPE, MovimientoPE, DraftMovCambio } from '../../lib/types'

let pass = 0, fail = 0
function check(n: string, cond: boolean, extra?: string) { if (cond) { pass++; console.log(`  ✓ ${n}`) } else { fail++; console.error(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`) } }

function inv(): InventarioPE {
  const m = (id: string, o: Partial<MovimientoPE>): MovimientoPE => ({ id, categoria: 'c', nombre: id, que_resuelve: '', costo_banda_ancha: 'media', costo_monetario: { rango_min_usd: 0, rango_max_usd: 1 }, precondiciones: [], desbloquea: [], tipo_dependencia: 'ninguna', dueno: 'A', criterio_exito: '', estado_usuario: 'aceptado', duracion_meses_ejecucion: 2, ...o } as MovimientoPE)
  return { movimientos: [m('M-1', { nombre: 'Uno', brechas_atacadas: ['ventas'] }), m('M-2', { nombre: 'Dos' }), m('M-3', { nombre: 'Tres' })], resumenes_categoria: [], generado_en: '' } as InventarioPE
}
const ch = (o: Partial<DraftMovCambio>): DraftMovCambio => ({ id: 'MV', mov_id: 'M-1', ...o } as DraftMovCambio)

// 1. Campo nombre.
{ const r = aplicarMovCambios(inv(), [ch({ campo: 'nombre', valor_nuevo: 'Uno Nuevo' })]); check('1 nombre', r.aplicados === 1 && r.inventario.movimientos[0].nombre === 'Uno Nuevo') }
// 2. brechas_atacadas array.
{ const r = aplicarMovCambios(inv(), [ch({ campo: 'brechas_atacadas', valor_nuevo: ['a', 'b'] })]); check('2 brechas array', JSON.stringify(r.inventario.movimientos[0].brechas_atacadas) === JSON.stringify(['a', 'b'])) }
// 3. brechas_atacadas desde string con separador.
{ const r = aplicarMovCambios(inv(), [ch({ campo: 'brechas_atacadas', valor_nuevo: 'x | y , z' })]); check('3 brechas string', JSON.stringify(r.inventario.movimientos[0].brechas_atacadas) === JSON.stringify(['x', 'y', 'z'])) }
// 4. duracion number.
{ const r = aplicarMovCambios(inv(), [ch({ campo: 'duracion_meses_ejecucion', valor_nuevo: 5 })]); check('4 duracion', r.inventario.movimientos[0].duracion_meses_ejecucion === 5) }
// 5. banda inválida → no aplica.
{ const r = aplicarMovCambios(inv(), [ch({ campo: 'costo_banda_ancha', valor_nuevo: 'gigante' })]); check('5 banda inválida', r.aplicados === 0 && r.noAplicados === 1) }
// 6. dep agregar: M-2 depende de M-1 (fs lag 1) → reverse desbloquea.
{ const r = aplicarMovCambios(inv(), [ch({ mov_id: 'M-2', dep: { accion: 'agregar', desde: 'M-1', tipo: 'fs', lag_meses: 1 } })]); const m2 = r.inventario.movimientos.find(m => m.id === 'M-2')!; const m1 = r.inventario.movimientos.find(m => m.id === 'M-1')!
  check('6 dep agregada', m2.precondiciones.includes('M-1') && m2.precondiciones_tipo!['M-1'] === 'fs' && m2.precondiciones_lag_meses!['M-1'] === 1)
  check('6 reverse desbloquea', m1.desbloquea.includes('M-2')) }
// 7. dep quitar: limpia ambos lados.
{ const base = inv(); base.movimientos[1].precondiciones = ['M-1']; base.movimientos[1].precondiciones_tipo = { 'M-1': 'fs' }; base.movimientos[0].desbloquea = ['M-2']
  const r = aplicarMovCambios(base, [ch({ mov_id: 'M-2', dep: { accion: 'quitar', desde: 'M-1' } })]); const m2 = r.inventario.movimientos.find(m => m.id === 'M-2')!; const m1 = r.inventario.movimientos.find(m => m.id === 'M-1')!
  check('7 dep quitada', !m2.precondiciones.includes('M-1') && !m1.desbloquea.includes('M-2')) }
// 8. mov inexistente / auto-dep → warnings.
{ const r = aplicarMovCambios(inv(), [ch({ mov_id: 'M-9', campo: 'nombre', valor_nuevo: 'x' }), ch({ mov_id: 'M-1', dep: { accion: 'agregar', desde: 'M-1' } })]); check('8 inválidos', r.aplicados === 0 && r.noAplicados === 2 && r.warnings.length === 2) }
// 9. no muta original.
{ const o = inv(); aplicarMovCambios(o, [ch({ campo: 'nombre', valor_nuevo: 'ZZZ' })]); check('9 original intacto', o.movimientos[0].nombre === 'Uno') }
// 10. CPM: agregar FS lag empuja el cierre.
{ const r = aplicarMovCambios(inv(), [ch({ mov_id: 'M-2', dep: { accion: 'agregar', desde: 'M-1', tipo: 'fs', lag_meses: 0 } })])
  const base = computeSchedule(inv().movimientos as any); const nuevo = computeSchedule(r.inventario.movimientos as any)
  const m2base = base.get('M-2')!; const m2new = nuevo.get('M-2')!
  check('10 CPM empuja M-2', m2new.arranca.getTime() > m2base.arranca.getTime(), `${m2base.arrancaYM} → ${m2new.arrancaYM}`) }

console.log(`\n${pass}/${pass + fail} checks verde.`)
process.exit(fail === 0 ? 0 : 1)
