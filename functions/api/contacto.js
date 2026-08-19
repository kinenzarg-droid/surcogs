// Cloudflare Pages Function — datos de contacto del vendedor para el comprador.
//
// Solo se entregan si la compra está PAGADA. Antes de eso no hay ningún motivo
// para exponer el mail y el teléfono de nadie.
//
// Dos formas de pedirlos, las dos válidas:
//   { order_id, token }   → con el rating_token de la compra (vuelta del pago)
//   { order_ids: [...] }  → con la sesión del comprador (Mi cuenta)
//
// Devuelve un grupo por vendedor con sus discos, porque una compra puede tener
// discos de varios vendedores y el comprador necesita saber qué le pide a quién.
const PAGADAS = ["pagada", "enviado", "entregado"];

export async function onRequestPost({ request, env }) {
  const SUPA = env.SUPABASE_URL;
  const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  const b = await request.json().catch(() => ({}));

  let ordenes = [];

  if (b.order_id && b.token) {
    // Vuelta del pago: el token viene en la URL, no hace falta sesión
    const [o] = await sel(env, "orders",
      `id=eq.${b.order_id}&rating_token=eq.${b.token}&select=purchase_id,status`);
    if (!o) return json({ error: "Link inválido" }, 403);
    if (!PAGADAS.includes(o.status)) return json({ error: "El pago todavía se está confirmando" }, 409);
    ordenes = await sel(env, "orders",
      `purchase_id=eq.${o.purchase_id}&select=id,seller_id,record_id,status`);
  } else if (Array.isArray(b.order_ids) && b.order_ids.length) {
    // Mi cuenta: el comprador se identifica con su sesión
    const yo = await quienEs(request, env);
    if (!yo) return json({ error: "Iniciá sesión" }, 401);
    const ids = b.order_ids.slice(0, 50).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
    if (!ids.length) return json({ grupos: [] });
    ordenes = await sel(env, "orders",
      `id=in.(${ids.join(",")})&select=id,seller_id,record_id,status,buyer_id,buyer_email`);
    // Que sean realmente compras suyas
    ordenes = ordenes.filter((o) =>
      (o.buyer_id === yo.id || (yo.email && o.buyer_email === yo.email)) &&
      PAGADAS.includes(o.status));
  } else {
    return json({ error: "Faltan datos" }, 400);
  }

  if (!ordenes.length) return json({ grupos: [] });

  // Vendedores y discos de esas órdenes
  const sellerIds = [...new Set(ordenes.map((o) => o.seller_id))];
  const recordIds = [...new Set(ordenes.map((o) => o.record_id))];
  const [perfiles, discos] = await Promise.all([
    sel(env, "profiles", `id=in.(${sellerIds.join(",")})&select=id,name,whatsapp,zona,localidad`),
    sel(env, "records", `id=in.(${recordIds.join(",")})&select=id,artist,title`),
  ]);
  // El mail vive en las cuentas, no en el perfil
  const mails = {};
  await Promise.all(sellerIds.map(async (id) => {
    try {
      const u = await fetch(`${SUPA}/auth/v1/admin/users/${id}`, { headers: hdrs(KEY) })
        .then((r) => (r.ok ? r.json() : null));
      if (u?.email) mails[id] = u.email;
    } catch (_) { /* si falla, el comprador igual tiene el WhatsApp */ }
  }));

  const porId = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));
  const P = porId(perfiles || []), R = porId(discos || []);
  const grupos = {};
  for (const o of ordenes) {
    const g = (grupos[o.seller_id] = grupos[o.seller_id] || {
      seller_id: o.seller_id,
      nombre: P[o.seller_id]?.name || "Vendedor",
      email: mails[o.seller_id] || null,
      whatsapp: P[o.seller_id]?.whatsapp || null,
      zona: [P[o.seller_id]?.zona, P[o.seller_id]?.localidad].filter(Boolean).join(" · ") || null,
      discos: [],
    });
    const d = R[o.record_id];
    if (d) g.discos.push(`${d.artist} – ${d.title}`);
  }
  return json({ grupos: Object.values(grupos) });
}

async function quienEs(request, env) {
  const jwt = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  try {
    return await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${jwt}` },
    }).then((r) => (r.ok ? r.json() : null));
  } catch (_) { return null; }
}

const hdrs = (KEY) => ({
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
});
const sel = (env, tabla, q) =>
  fetch(`${env.SUPABASE_URL}/rest/v1/${tabla}?${q}`, { headers: hdrs(env.SUPABASE_SERVICE_ROLE_KEY) })
    .then((r) => r.json());
const json = (b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
