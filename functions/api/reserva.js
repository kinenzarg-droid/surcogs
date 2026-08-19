// Cloudflare Pages Function — compra por TRANSFERENCIA con 10% de descuento.
//
// Reserva los discos por 24hs (salen del catálogo), crea las órdenes en estado
// "reservado" y devuelve el texto listo para abrir el WhatsApp de SURCOGS.
// Si en 24hs no se concreta, la reserva vence y los discos vuelven al catálogo.
const RECARGO = 0.15;
const DTO = 0.10;
const HORAS_RESERVA = 24;

export async function onRequestPost({ request, env }) {
  const SUPA = env.SUPABASE_URL;
  const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  const WA = (env.WHATSAPP_SURCOGS || "").replace(/\D/g, ""); // ej: 5491122334455

  // 1) Liberar reservas vencidas antes que nada
  await fetch(
    `${SUPA}/rest/v1/records?status=eq.reservado&reservado_hasta=lt.${new Date().toISOString()}`,
    { method: "PATCH", headers: hdrs(KEY), body: JSON.stringify({ status: "disponible", reservado_hasta: null }) }
  ).catch(() => {});

  const body = await request.json().catch(() => ({}));
  const ids = body.record_ids?.length ? body.record_ids : (body.record_id ? [body.record_id] : []);
  if (!ids.length || ids.length > 20) return json({ error: "Falta el disco" }, 400);

  // Quién compró, sacado de la sesión (no de lo que manda el navegador)
  const buyer_id = await quienEs(request, env);
  const datosEnvio = {
    buyer_id,
    buyer_email: body.buyer_email || null,
    buyer_name: body.buyer_name || null,
    buyer_phone: body.buyer_phone || null,
    buyer_addr: body.buyer_addr || null,
    buyer_localidad: body.buyer_localidad || null,
    buyer_zona: body.buyer_zona || null,
    buyer_cp: body.buyer_cp || null,
  };

  const recs = await fetch(
    `${SUPA}/rest/v1/records?id=in.(${ids.join(",")})&select=*`,
    { headers: hdrs(KEY) }
  ).then((r) => r.json());
  if (!Array.isArray(recs) || recs.length !== ids.length) {
    return json({ error: "Algún disco del carrito ya no existe" }, 404);
  }
  if (recs.some((r) => r.status !== "disponible")) {
    return json({ error: "Algún disco del carrito ya no está disponible" }, 409);
  }
  // El carrito puede tener discos de varios vendedores: la plata entra a
  // SURCOGS, así que es una sola transferencia.

  // 2) Precios con descuento
  const purchaseId = crypto.randomUUID();
  const hasta = new Date(Date.now() + HORAS_RESERVA * 3600 * 1000).toISOString();
  const codigo = "SC-" + purchaseId.slice(0, 4).toUpperCase();
  const ordenes = [];
  let total = 0;
  for (const rec of recs) {
    const conDto = Math.round(Math.round(rec.price * (1 + RECARGO)) * (1 - DTO));
    total += conDto;
    ordenes.push({
      record_id: rec.id,
      seller_id: rec.seller_id,
      amount: conDto,
      fee: conDto - rec.price,
      monto_vendedor: rec.price,
      metodo_pago: "transferencia",
      status: "reservado",
      purchase_id: purchaseId,
      ...datosEnvio,
    });
  }
  // Un envío por vendedor (el más caro de sus discos): cada uno despacha aparte
  const porVendedor = {};
  recs.forEach((r) => { (porVendedor[r.seller_id] = porVendedor[r.seller_id] || []).push(r); });
  let costoEnvio = 0;
  for (const [sid, susDiscos] of Object.entries(porVendedor)) {
    const costos = susDiscos
      .filter((r) => r.shipping_mode === "fijo" && r.shipping_cost > 0)
      .map((r) => r.shipping_cost);
    if (!costos.length) continue;
    const e = Math.max(...costos);
    costoEnvio += e;
    total += e;
    const suOrden = ordenes.find((o) => o.seller_id === sid);
    if (suOrden) suOrden.shipping_cost = e;
  }

  // 3) Reservar los discos y crear las órdenes
  await fetch(`${SUPA}/rest/v1/records?id=in.(${ids.join(",")})`, {
    method: "PATCH",
    headers: hdrs(KEY),
    body: JSON.stringify({ status: "reservado", reservado_hasta: hasta }),
  });
  const ins = await fetch(`${SUPA}/rest/v1/orders`, {
    method: "POST",
    headers: { ...hdrs(KEY), Prefer: "return=representation" },
    body: JSON.stringify(ordenes),
  }).then((r) => r.json());
  if (!Array.isArray(ins) || !ins.length) {
    // rollback de la reserva
    await fetch(`${SUPA}/rest/v1/records?id=in.(${ids.join(",")})`, {
      method: "PATCH", headers: hdrs(KEY),
      body: JSON.stringify({ status: "disponible", reservado_hasta: null }),
    });
    return json({ error: "No se pudo reservar" }, 500);
  }

  // 4) Mensaje de WhatsApp
  const lista = recs.map((r) => `• ${r.artist} – ${r.title}`).join("\n");
  const msg =
    `Hola SURCOGS! Quiero hacer esta compra con el 10% de descuento pagando por transferencia.\n\n` +
    `${lista}\n\n` +
    (costoEnvio > 0 ? `Envío: $${miles(costoEnvio)}\n` : "") +
    `Total con descuento: $${miles(total)}\n` +
    `Código de compra: ${codigo}` +
    (datosEnvio.buyer_name ? `\nA nombre de: ${datosEnvio.buyer_name}` : "");

  return json({
    codigo,
    total,
    reservado_hasta: hasta,
    wa: `https://wa.me/${WA}?text=${encodeURIComponent(msg)}`,
  });
}

// Devuelve el id del usuario logueado, o null si compra sin cuenta.
async function quienEs(request, env) {
  const jwt = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  try {
    const u = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${jwt}` },
    }).then((r) => (r.ok ? r.json() : null));
    return u?.id || null;
  } catch (_) { return null; }
}

const miles = (n) => Number(n).toLocaleString("es-AR");
const hdrs = (KEY) => ({
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
});
const json = (b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
