# Vercel-readiness checklist — Fase 0.3

Fecha: 2026-05-02
Scope: `app/api/**/*.ts` + `lib/**/*.ts`

## Resumen ejecutivo

**Veredicto: GO con 1 anotación (no bloqueante para Fase 1).**

| # | Check | Estado | Bloqueante |
|---|---|---|---|
| 1 | `setTimeout`/`setInterval`/`setImmediate` post-response | ✅ OK | — |
| 2 | Promises no-awaited / `void someAsync()` | ✅ OK | — |
| 3 | `fetch`/SDK calls sin timeout | ⚠️ Anotar | NO (para feature actual) |
| 4 | Imports de `fs` en runtime path | ✅ OK | — |
| 5 | Estado compartido mutable module-level | ✅ OK | — |

---

## Detalle por check

### 1. `setTimeout` / `setInterval` / `setImmediate` post-response — ✅ OK

Pattern: `Grep "setTimeout|setInterval|setImmediate"` sobre `app/api/**` y `lib/**`.

**1 match encontrado, justificado:**

- [`app/api/planes-estrategicos/chat/route.ts:311`](../../app/api/planes-estrategicos/chat/route.ts#L311) — `await new Promise(r => setTimeout(r, delay[attempt]))` dentro de `saveWithRetry`. Es un sleep entre reintentos, completamente awaited dentro del handler. Se completa antes del response. ✅ OK.

Nada que vive después del response. ✓ Vercel-safe.

### 2. Promises no-awaited / `void someAsync()` — ✅ OK

Pattern A: `Grep "\\.catch\\(|void [a-zA-Z_]+\\("` (proxy de promises no-awaited).
Pattern B: `setImmediate` (incluido en check 1, no encontrado).

**4 matches encontrados, todos justificados (todos awaited):**

- [`lib/airtable.ts:285`](../../lib/airtable.ts#L285) — `getPrograma(id).catch(() => null)` dentro de `.map(...)` consumido por `await Promise.all(...)`. ✅
- [`lib/airtable.ts:532`](../../lib/airtable.ts#L532) — mismo pattern. ✅
- [`app/api/objetivos/[id]/accion/route.ts:32`](../../app/api/objetivos/[id]/accion/route.ts#L32) — `await getPrograma(...).catch(() => null)` explícitamente awaited. ✅
- [`app/api/planes-estrategicos/chat/route.ts:44`](../../app/api/planes-estrategicos/chat/route.ts#L44) — `await getPlanEstrategico(...).catch(() => null)` awaited. ✅

Cero patterns `void someAsync()` o promise-fire-and-forget.

### 3. `fetch` / SDK calls sin timeout — ⚠️ Anotar

**18 matches de `fetch(`**, ninguno con `signal: AbortSignal.timeout(...)`. **1 match `new Anthropic(...)`** en [`chat/route.ts:23`](../../app/api/planes-estrategicos/chat/route.ts#L23) — el SDK Anthropic maneja timeouts internamente (default ~10 min según docs).

**Implicancia Vercel:**
- En serverless con timeout de plataforma (10s Hobby, 300s Pro), si Airtable/Anthropic cuelga, el handler también, hasta que Vercel mata el request por timeout. No genera procesos zombi (positivo). Pero la UX en el browser cuelga hasta el límite de plataforma.

**Implicancia para el feature del reviewer (load-bearing):**
- La llamada a OpenAI desde dentro del SSE puede tardar ~3 min normalmente. Sin `AbortSignal.timeout(REVIEWER_TIMEOUT_MS)` explícito, una llamada degenerada cuelga hasta el cap de Vercel y el cliente queda esperando.
- **Decisión**: en `lib/openai-client.ts` (Fase 1, archivo nuevo), `AbortSignal.timeout(REVIEWER_TIMEOUT_MS=180000)` es **obligatorio**. Anotado.

**Decisión sobre el resto del codebase:**
- No bloqueante para arrancar Fase 1 del feature del reviewer.
- Mejora futura: agregar `AbortSignal.timeout(15000)` a los fetches a Airtable. Fuera de scope de este feature.

### 4. Imports de `fs` en runtime path — ✅ OK

Pattern: `Grep "from ['\"]node:fs['\"]|from ['\"]fs['\"]|require\\(['\"]fs['\"]\\)"`.

**0 matches** en `app/api/**` y `lib/**`.

Los únicos usos de `fs` están en `diagnostico/scripts/**` (scripts standalone que corren con `tsx`, fuera del runtime de Next.js). ✅ OK.

### 5. Estado compartido mutable module-level — ✅ OK

Pattern A: `Grep "^(let|var)\\s+\\w+"` (variables mutables module-level).
Pattern B: `Grep "^const\\s+\\w+\\s*[:=]\\s*(new\\s+(Map|Set|Array)|\\[|\\{)"` (consts con estructura mutable).

**0 matches en ambos patterns.**

El único `const` module-level relevante es [`chat/route.ts:23`](../../app/api/planes-estrategicos/chat/route.ts#L23) — `const anthropic = new Anthropic({...})`. Es una instancia de cliente immutable post-construct (apiKey fija), no estado mutable que se modifique entre requests. ✅ OK.

---

## Anotaciones para Fase 1

1. `lib/openai-client.ts` (nuevo) — usar `AbortSignal.timeout(REVIEWER_TIMEOUT_MS)` en cada llamada a OpenAI. **Obligatorio.**
2. (Opcional, fuera de scope) Sumar timeouts explícitos a los fetches a Airtable en `lib/airtable.ts`. Mejora futura.

## Veredicto

**GO para Fase 0.1 y Fase 0.2.** La infra existente es Vercel-compatible. El feature del reviewer se puede construir encima sin refactor previo, siempre que la nueva llamada a OpenAI tenga timeout explícito.
