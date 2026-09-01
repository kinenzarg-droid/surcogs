// Cloudflare Pages Function — checkout de Mercado Pago CENTRALIZADO en SURCOGS.
//
// Modelo: el comprador paga a la cuenta de SURCOGS. Mercado Pago descuenta su
// comisión, el resto queda en SURCOGS y se le transfiere al vendedor por alias
// cuando el comprador confirma la entrega (o a los 10 días sin reclamo).
//
// records.price = lo que RECIBE el vendedor, siempre intacto.
// El comprador paga ese precio + 15%. El envío NO paga comisión.
const RECARGO = 0.15;

export async function onRequestPost({ request, env }) {
  const SUPA = env.SUPABASE_URL;
  const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  const SITE = env.SITE_URL;
  const MP = env.MP_ACCESS_TOKEN; // token de la cuenta de MP de SURCOGS
  if (!MP) return json({ error: "Falta configurar el cobro" }, 500);

  const body = await request.json().catch(() => ({}));
  const ids = body.record_ids?.length ? body.record_ids : (body.record_id ? [body.record_id] : []);
  const buyer_email = body.buyer_email || null;
  // Quién compró. Se saca de la sesión, nunca de lo que manda el navegador,
  // porque si no cualquiera podría hacerse pasar por otro.
  const buyer_id = await quienEs(request, env);
  // Cómo eligió recibirlo el comprador, por vendedor. Si no vino nada, queda
  // en null y se trata como "a coordinar", que es lo que se hacía antes.
  const entregas = (body.entregas && typeof body.entregas === "object") ? body.entregas : {};
  const entregaDe = (sellerId) =>
    ["coordinar", "correo"].includes(entregas[sellerId]) ? entregas[sellerId] : null;

  const datosEnvio = {
    buyer_name: body.buyer_name || null,
    buyer_phone: body.buyer_phone || null,
    buyer_addr: body.buyer_addr || null,
    buyer_localidad: body.buyer_localidad || null,
    buyer_zona: body.buyer_zona || null,
    buyer_cp: body.buyer_cp || null,
  };
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
  // El carrito puede tener discos de varios vendedores: como la plata entra a
  // SURCOGS y no a cada uno, el comprador paga una sola vez.

  // Precios: el vendedor cobra su neto; el comprador paga +15%
  const purchaseId = crypto.randomUUID();
  const items = [], ordenes = [];
  let feeTotal = 0;
  for (const rec of recs) {
    const precioFinal = Math.round(rec.price * (1 + RECARGO));
    feeTotal += precioFinal - rec.price;
    items.push({
      title: `${rec.artist} – ${rec.title} (vinilo)`,
      quantity: 1,
      unit_price: precioFinal,
      currency_id: "ARS",
    });
    ordenes.push({
      record_id: rec.id,
      seller_id: rec.seller_id,
      buyer_email,
      buyer_id,
      amount: precioFinal,
      fee: precioFinal - rec.price,
      monto_vendedor: rec.price,
      metodo_pago: "mercadopago",
      purchase_id: purchaseId,
      entrega: entregaDe(rec.seller_id),
      ...datosEnvio,
    });
  }

  // Envío: UNO POR VENDEDOR (el más caro de sus discos), porque cada uno
  // despacha por su cuenta. Va completo al vendedor y sin recargo: SURCOGS
  // no comisiona el envío.
  const porVendedor = {};
  recs.forEach((r) => { (porVendedor[r.seller_id] = porVendedor[r.seller_id] || []).push(r); });
  for (const [sellerId, susDiscos] of Object.entries(porVendedor)) {
    const costos = susDiscos
      .filter((r) => r.shipping_mode === "fijo" && r.shipping_cost > 0)
      .map((r) => r.shipping_cost);
    if (!costos.length) continue;
    const costoEnvio = Math.max(...costos);
    items.push({ title: "Envío", quantity: 1, unit_price: costoEnvio, currency_id: "ARS" });
    // se carga en una sola orden de ese vendedor, para no contarlo dos veces
    const suOrden = ordenes.find((o) => o.seller_id === sellerId);
    if (suOrden) suOrden.shipping_cost = costoEnvio;
  }

  // Crear las órdenes (una por disco, agrupadas por purchase_id)
  const ins = await fetch(`${SUPA}/rest/v1/orders`, {
    method: "POST",
    headers: { ...hdrs(KEY), Prefer: "return=representation" },
    body: JSON.stringify(ordenes),
  }).then((r) => r.json());
  if (!Array.isArray(ins) || !ins.length) return json({ error: "No se pudo crear la orden" }, 500);
  const primera = ins[0];

  // Preferencia de pago contra la cuenta de SURCOGS (sin split)
  const pref = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: { Authorization: `Bearer ${MP}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      items,
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

const hdrs = (KEY) => ({
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
});
const json = (b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
