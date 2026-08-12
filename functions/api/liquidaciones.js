// Panel privado de liquidaciones (solo con la clave de admin).
// GET  /api/liquidaciones?k=CLAVE  → envíos entregados sin liquidar + en curso + historial
// POST /api/liquidaciones {k, id}  → marca liquidado (después de transferirle al vendedor)

export async function onRequestGet({ request, env }) {
  const k = new URL(request.url).searchParams.get("k");
  if (k !== env.ADMIN_KEY) return json({ error: "Sin acceso" }, 403);
  const pendientes = await sel(env, "estado=eq.entregado&select=*&order=delivered_at.asc");
  const listos = await sel(env, "estado=eq.liquidado&select=*&order=liquidado_at.desc&limit=20");
  const enCurso = await sel(env, "estado=in.(pendiente,retirado)&select=*&order=created_at.asc");
  return json({ pendientes, listos, enCurso });
}

export async function onRequestPost({ request, env }) {
  const b = await request.json().catch(() => ({}));
  if (b.k !== env.ADMIN_KEY) return json({ error: "Sin acceso" }, 403);
  if (!b.id) return json({ error: "Falta el envío" }, 400);
  await fetch(`${env.SUPABASE_URL}/rest/v1/shipments?id=eq.${b.id}`, {
    method: "PATCH", headers: H(env),
    body: JSON.stringify({ estado: "liquidado", liquidado_at: new Date().toISOString() }),
  });
  return json({ ok: true });
}

const H = (env) => ({
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
});
const sel = (env, q) =>
  fetch(`${env.SUPABASE_URL}/rest/v1/shipments?${q}`, { headers: H(env) }).then((r) => r.json());
const json = (b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
