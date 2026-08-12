// Panel del courier y confirmación por QR.
// GET  /api/courier?k=CLAVE            → jornada (retiros y entregas pendientes)
// GET  /api/courier?e=TOKEN            → datos de un paquete (al escanear el QR)
// POST /api/courier {token, accion}    → accion: "retirado" | "entregado"

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const k = u.searchParams.get("k");
  const e = u.searchParams.get("e");

  if (e) {
    const s = await sel(env, `token=eq.${e}&select=*`);
    if (!s.length) return json({ error: "Paquete no encontrado" }, 404);
    return json({ envio: limpio(s[0]) });
  }

  if (k && k === env.COURIER_KEY) {
    const s = await sel(env, `estado=in.(pendiente,retirado)&select=*&order=created_at.asc`);
    return json({
      retiros: s.filter((x) => x.estado === "pendiente").map(limpio),
      entregas: s.filter((x) => x.estado === "retirado").map(limpio),
    });
  }
  return json({ error: "Sin acceso" }, 403);
}

export async function onRequestPost({ request, env }) {
  const b = await request.json().catch(() => ({}));

  if (b.token && ["retirado", "entregado"].includes(b.accion)) {
    const s = await sel(env, `token=eq.${b.token}&select=*`);
    if (!s.length) return json({ error: "Paquete no encontrado" }, 404);
    const campo = b.accion === "retirado" ? "picked_at" : "delivered_at";
    await patch(env, `token=eq.${b.token}`, { estado: b.accion, [campo]: new Date().toISOString() });
    return json({ ok: true, estado: b.accion, code: s[0].code });
  }

  if (b.k && b.k === env.ADMIN_KEY && b.liquidar) {
    await patch(env, `id=eq.${b.liquidar}`, {
      estado: "liquidado",
      liquidado_at: new Date().toISOString(),
    });
    return json({ ok: true });
  }
  return json({ error: "Sin acceso" }, 403);
}

const H = (env) => ({
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
});
const sel = (env, q) =>
  fetch(`${env.SUPABASE_URL}/rest/v1/shipments?${q}`, { headers: H(env) }).then((r) => r.json());
const patch = (env, q, body) =>
  fetch(`${env.SUPABASE_URL}/rest/v1/shipments?${q}`, {
    method: "PATCH", headers: H(env), body: JSON.stringify(body),
  });
const limpio = (s) => ({
  id: s.id, code: s.code, token: s.token, estado: s.estado, detalle: s.detalle,
  seller_name: s.seller_name, seller_addr: s.seller_addr, seller_zona: s.seller_zona,
  seller_phone: s.seller_phone, buyer_name: s.buyer_name, buyer_addr: s.buyer_addr,
  buyer_zona: s.buyer_zona, buyer_localidad: s.buyer_localidad, buyer_phone: s.buyer_phone,
  picked_at: s.picked_at, delivered_at: s.delivered_at,
});
const json = (b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
