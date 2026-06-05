// Glosario de siglas y conceptos del wizard PE — para la vista de prestigio
// del plan (/planes-estrategicos/[id]/vista).
//
// Razón: los ejecutivos que leen el plan por primera vez no conocen la
// metodología interna del wizard (P-N, V-N, E-N, sub-bloques, FS/FF, etc).
// Sin glosario el plan suena críptico. El glosario va al principio del
// documento para que el lector lo tenga de referencia mientras lee el resto.
//
// Scope: SOLO siglas/conceptos del PROCESO de elaboración del plan. NO se
// listan siglas del dominio del negocio del usuario (PAI, POZO, JMT, CABA,
// GBA, dueños, etc.) — esas el lector las conoce mejor que nadie.
//
// Server Component — sin estado, sin interactividad.

interface EntradaGlosario {
  termino: string
  significado: string
  // ejemplo opcional para clarificar
  ejemplo?: string
}

// Lista fija. Si el wizard agrega nuevas convenciones, se agregan acá.
const ENTRADAS: { categoria: string; items: EntradaGlosario[] }[] = [
  {
    categoria: 'Pasos del plan',
    items: [
      { termino: 'Paso 1 — Propósito', significado: 'Lugar al que queremos llegar: escena ideal, métricas, qué queda afuera, horizonte temporal.' },
      { termino: 'Paso 2 — Situación', significado: 'Distancia entre dónde estamos y el Propósito: desvío principal, causa raíz, recursos, resistencias, consecuencias de no actuar.' },
      { termino: 'Paso 3 — Plan', significado: 'Estrategia para cerrar la distancia. Se subdivide en 6 sub-bloques (3.0 a 3.E) para llegar a un plan final curado.' },
      { termino: 'Sub-bloques 3.0 a 3.E', significado: '3.0 Preparativos · 3.A Inventario de movimientos · 3.B Palancas · 3.C Borrador · 3.D Estrés de realidad · 3.E Plan curado (versión final).' },
    ],
  },
  {
    categoria: 'Elementos del plan',
    items: [
      { termino: 'Movimiento (M-1, M-2, …)', significado: 'Cada acción concreta que el plan ejecuta. Tiene un dueño, una categoría, y opcionalmente precondiciones y desbloqueos.', ejemplo: 'M-5 = "Comprar las tierras en todas las macrozonas"' },
      { termino: 'Componente del desvío (componente A, B, …)', significado: 'Cuando el desvío principal se divide en partes independientes, cada parte es un componente. Permite atacar el desvío en pedazos.' },
      { termino: 'Palanca', significado: 'Movimiento que, si se mueve primero, destraba muchos otros. El sub-bloque 3.B identifica las palancas máximas.' },
      { termino: 'Vacancia', significado: 'Puesto al que el plan le asigna responsabilidad pero que todavía no está cubierto por una persona específica. Cada vacancia tiene una "cobertura" (semanas estimadas para contratarla).' },
    ],
  },
  {
    categoria: 'Preguntas y validaciones del proceso',
    items: [
      { termino: 'Pregunta principal (P-1, P-2, …)', significado: 'Pregunta que el wizard hace al usuario dentro de un sub-bloque para elicitar contenido nuevo (ej: P-1 en 3.B = "¿cuál es el movimiento que más destraba?").' },
      { termino: 'Validador (V-1, V-2, …)', significado: 'Pregunta de validación cruzada que el wizard hace para asegurarse de que la lógica del plan resiste contraejemplos.' },
      { termino: 'Ajuste de estrés (E-1, E-2, …)', significado: 'Cambio aceptado al plan tras una pregunta de estrés del sub-bloque 3.D. Cada E-N tiene una respuesta del usuario y una mutación al borrador.' },
    ],
  },
  {
    categoria: 'Dependencias entre movimientos',
    items: [
      { termino: 'Precondición / desbloqueo', significado: 'Si M-A es precondición de M-B, M-B no puede empezar (o terminar) hasta que M-A cumpla cierta etapa. M-A "desbloquea" a M-B.' },
      { termino: 'FS (Finish-to-Start)', significado: 'El más típico. M-B arranca cuando M-A termina. Si M-A se atrasa, M-B se atrasa.' },
      { termino: 'FF (Finish-to-Finish)', significado: 'M-A y M-B pueden correr en paralelo, pero M-B no termina hasta que M-A termina.' },
      { termino: 'Continuo (con lag)', significado: 'M-B necesita que M-A haya estado corriendo durante N meses para arrancar (ej: necesito 3 meses de awareness antes de blitzear).' },
      { termino: 'Sugerida', significado: 'Dependencia blanda — sería ideal pero no es bloqueante. Útil para hints sin frenar la ejecución.' },
    ],
  },
  {
    categoria: 'Cronograma',
    items: [
      { termino: 'Q1 / Q2 / Q3 / Q4', significado: 'Cuatrimestres del año. Q1 = ene-mar, Q2 = abr-jun, Q3 = jul-sep, Q4 = oct-dic.' },
      { termino: 'Fase', significado: 'Agrupación temporal de movimientos en el sub-bloque 3.C (borrador) y 3.E (curado). Cada fase tiene un Q de inicio y una razón de secuencia.' },
    ],
  },
  {
    categoria: 'Supuestos y criterios',
    items: [
      { termino: 'Supuesto exógeno', significado: 'Hipótesis sobre algo fuera del control del equipo del plan (macro, regulación, terceros). Si se rompe, parte del plan se cae.' },
      { termino: 'Probabilidad · Impacto', significado: 'Cada supuesto se califica con probabilidad (alta/media/baja) e impacto (alto/medio/bajo, favorable o desfavorable) si se rompe.' },
      { termino: 'Estrategia: bet / hedge / aceptar', significado: 'Bet = apostamos a que se cumple, sin plan B. Hedge = preparamos amortiguación por si falla. Aceptar = no podemos hacer nada, asumimos el riesgo.' },
      { termino: 'Criterio pleno / mínimo / path mínimo', significado: 'Pleno = el éxito completo del plan. Mínimo = el peor resultado aceptable. Path mínimo = los movimientos SÍ O SÍ para alcanzar el mínimo.' },
    ],
  },
]

export function GlosarioVista() {
  return (
    <section className="pe-vista-glosario">
      <h2 id="glosario">Glosario del plan</h2>
      <p className="pe-vista-glosario-intro">
        Este glosario aclara las convenciones del wizard con las que se elaboró el plan. NO incluye siglas del dominio del negocio (PAI, POZO, JMT, etc.) — esas se conocen del contexto del equipo.
      </p>

      {ENTRADAS.map(grupo => (
        <div key={grupo.categoria} className="pe-vista-glosario-grupo">
          <h3 className="pe-vista-glosario-grupo-titulo">{grupo.categoria}</h3>
          <dl className="pe-vista-glosario-dl">
            {grupo.items.map(entry => (
              <div key={entry.termino} className="pe-vista-glosario-entry">
                <dt>{entry.termino}</dt>
                <dd>
                  {entry.significado}
                  {entry.ejemplo && <span className="pe-vista-glosario-ej"> {entry.ejemplo}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </section>
  )
}
