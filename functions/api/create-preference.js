// Cloudflare Pages Function — checkout de Mercado Pago con split de comisión.
// Soporta un disco o un carrito (varios discos del MISMO vendedor).
// records.price = lo que RECIBE el vendedor. El precio del comprador suma:
//  - reserva para Mercado Pago (8%, con colchón: si MP cobra más, sale de SURCOGS)
//  - comisión SURCOGS (10% desde la primera venta)
const COMISION = 0.10;
const RESERVA_MP = 0.08;

export async function onRequestPost({ request, env }) {
  const SUPA = env.SUPABASE_URL;
  const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  const SITE = env.SITE_URL;

  const body = await request.json().catch(() => ({}));
  const ids = body.record_ids?.length ? body.record_ids : (body.record_id ? [body.record_id] : []);
  const buyer_email = body.buyer_email || null;
  if (!ids.length || ids.length > 20) return json({ error: "Falta el disco" }, 400);

  // Traer todos los discos
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
  const sellerId = recs[0].seller_id;
  if (recs.some((r) => r.seller_id !== sellerId)) {
    return json({ error: "El carrito solo puede tener discos de un mismo vendedor" }, 400);
  }

  // Token de MP del vendedor
  const toks = await fetch(
    `${SUPA}/rest/v1/mp_tokens?user_id=eq.${sellerId}&select=access_token`,
    { headers: hdrs(KEY) }
  ).then((r) => r.json());
  if (!toks.length) return json({ error: "El vendedor todavía no activó el pago online" }, 409);

  // Precios: el vendedor recibe su neto; SURCOGS absorbe si MP cuesta más que la reserva
  const purchaseId = crypto.randomUUID();
  let items = [], ordenes = [], feeTotal = 0;
  for (const rec of recs) {
    const precioFinal = Math.round(rec.price / (1 - RESERVA_MP - COMISION));
    const fee = precioFinal - rec.price - Math.round(precioFinal * RESERVA_MP);
    feeTotal += Math.max(fee, 0);
    items.push({
      title: `${rec.artist} – ${rec.title} (vinilo)`,
      quantity: 1,
      unit_price: precioFinal,
      currency_id: "ARS",
    });
    ordenes.push({
      record_id: rec.id,
      seller_id: sellerId,
      buyer_email,
      amount: precioFinal,
      fee: Math.max(fee, 0),
      purchase_id: purchaseId,
    });
  }

  // Envío: un solo cargo por compra (el más caro del grupo) que va completo al vendedor.
  // Se engrosa solo por la reserva de MP: SURCOGS no cobra comisión sobre el envío.
  const costosEnvio = recs
    .filter((r) => r.shipping_mode === "fijo" && r.shipping_cost > 0)
    .map((r) => r.shipping_cost);
  const envio = costosEnvio.length ? Math.max(...costosEnvio) : 0;
  if (envio > 0) {
    items.push({
      title: "Envío",
      quantity: 1,
      unit_price: Math.round(envio / (1 - RESERVA_MP)),
      currency_id: "ARS",
    });
  }

  // Crear las órdenes (una por disco, agrupadas por purchase_id)
  const ins = await fetch(`${SUPA}/rest/v1/orders`, {
    method: "POST",
    headers: { ...hdrs(KEY), Prefer: "return=representation" },
    body: JSON.stringify(ordenes),
  }).then((r) => r.json());
  if (!Array.isArray(ins) || !ins.length) return json({ error: "No se pudo crear la orden" }, 500);
  const primera = ins[0];

  // Preferencia de pago con el token DEL VENDEDOR + comisión total para SURCOGS
  const pref = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${toks[0].access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      items,
      marketplace_fee: feeTotal,
      statement_descriptor: "SURCOGS",
      payer: buyer_email ? { email: buyer_email } : undefined,
      external_reference: purchaseId,
      back_urls: {
        success: `${SITE}/disco.html?id=${recs[0].id}&pago=ok&order=${primera.id}&rt=${primera.rating_token}`,
        failure: `${SITE}/disco.html?id=${recs[0].id}&pago=error`,
        pending: `${SITE}/disco.html?id=${recs[0].id}&pago=ok&order=${primera.id}&rt=${primera.rating_token}`,
      },
      auto_return: "approved",
      notification_url: `${SITE}/api/mp-webhook?purchase=${purchaseId}`,
    }),
  }).then((r) => r.json());

  if (!pref.init_point) {
    return json({ error: pref.message || "Mercado Pago rechazó la operación" }, 502);
  }
  return json({ init_point: pref.init_point, fee: feeTotal });
}

const hdrs = (KEY) => ({
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
});
const json = (b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
