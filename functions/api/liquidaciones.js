// Panel de liquidaciones — qué le tengo que transferir a cada vendedor y
// qué compras por transferencia están esperando que yo confirme el pago.
// Solo entra el administrador, con su sesión de Supabase.
import { notificar } from "./_notificar.js";
import { avisoAdmin } from "./_avisoAdmin.js";

// Antes esto era una clave en la URL: quedaba en el historial del navegador,
// en los logs y en cualquier link que se compartiera. Ahora se valida la sesión
// contra Supabase y se compara con ADMIN_USER_ID, igual que /api/admin.
async function esAdmin(request, env) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return false;
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: auth },
  });
  if (!r.ok) return false;
  const u = await r.json().catch(() => ({}));
  return !!env.ADMIN_USER_ID && u.id === env.ADMIN_USER_ID;
}

export async function onRequestGet({ request, env }) {
  if (!(await esAdmin(request, env))) return json({ error: "Entrá con tu cuenta de administrador" }, 401);

  const pend = await sel(env, "liquidaciones_pendientes", "select=*&order=entregado_at.asc");
  const listas = await sel(env, "orders",
    "liquidado_at=not.is.null&select=id,monto_vendedor,liquidado_at,seller_id&order=liquidado_at.desc&limit=20");

  // Compras por transferencia esperando que yo confirme que entró la plata.
  // Se agrupan por purchase_id: una compra puede tener varios discos.
  const res = await sel(env, "orders",
    "metodo_pago=eq.transferencia&status=eq.reservado&select=*,records(artist,title)&order=created_at.asc");
  const porCompra = {};
  for (const o of Array.isArray(res) ? res : []) {
    const g = (porCompra[o.purchase_id] = porCompra[o.purchase_id] || {
      purchase_id: o.purchase_id, created_at: o.created_at, seller_id: o.seller_id,
      buyer_email: o.buyer_email, buyer_name: o.buyer_name,
      total: 0, discos: [],
    });
    g.total += Number(o.amount || 0) + Number(o.shipping_cost || 0);
    g.discos.push(`${o.records?.artist ?? "?"} – ${o.records?.title ?? "?"}`);
  }

  return json({
    reservas: Object.values(porCompra),
    liberables: (pend || []).filter((o) => o.liberable),
    esperando: (pend || []).filter((o) => !o.liberable),
    liquidadas: listas || [],
  });
}

export async function onRequestPost({ request, env }) {
  if (!(await esAdmin(request, env))) return json({ error: "Entrá con tu cuenta de administrador" }, 401);
  const b = await request.json().catch(() => ({}));

  // --- Confirmar que entró una transferencia ---
  if (b.purchase_id) return confirmarTransferencia(env, b.purchase_id);

  // --- Marcar que ya le transferí al vendedor ---
  if (!b.id) return json({ error: "falta la orden" }, 400);
  const [orden] = await sel(env, "orders", `id=eq.${b.id}&select=seller_id,monto_vendedor`);
  await fetch(`${env.SUPABASE_URL}/rest/v1/orders?id=eq.${b.id}`, {
    method: "PATCH",
    headers: H(env),
    body: JSON.stringify({ liquidado_at: new Date().toISOString() }),
  });
  if (orden) await notificar(env, {
    user_id: orden.seller_id,
    tipo: "pago",
    titulo: `Te transferimos $${Number(orden.monto_vendedor || 0).toLocaleString("es-AR")}`,
    detalle: "Ya salió a tu alias. Puede tardar unos minutos en impactar.",
    link: "/cuenta.html#ventas",
  });
  return json({ ok: true });
}

// Cobré por transferencia: la compra pasa a valer igual que una pagada con
// Mercado Pago. Sin esto los discos volvían al catálogo a las 24hs.
async function confirmarTransferencia(env, purchaseId) {
  const ords = await sel(env, "orders",
    `purchase_id=eq.${purchaseId}&select=id,record_id,seller_id,status,buyer_email,rating_token,monto_vendedor`);
  if (!Array.isArray(ords) || !ords.length) return json({ error: "No encontré esa compra" }, 404);
  if (ords.every((o) => o.status !== "reservado")) return json({ error: "Esa compra ya estaba confirmada" }, 409);

  const ahora = new Date().toISOString();
  await fetch(`${env.SUPABASE_URL}/rest/v1/orders?purchase_id=eq.${purchaseId}`, {
    method: "PATCH", headers: H(env),
    body: JSON.stringify({ status: "pagada", pagado_at: ahora }),
  });
  const recordIds = ords.map((o) => o.record_id).join(",");
  await fetch(`${env.SUPABASE_URL}/rest/v1/records?id=in.(${recordIds})`, {
    method: "PATCH", headers: H(env),
    body: JSON.stringify({ status: "vendido", reservado_hasta: null }),
  });

  // Una compra puede tener discos de varios vendedores: le avisamos a cada uno
  for (const sellerId of [...new Set(ords.map((o) => o.seller_id))]) {
    await notificar(env, {
      user_id: sellerId,
      tipo: "venta",
      titulo: "¡Vendiste un disco!",
      detalle: "Coordiná la entrega con el comprador. Cobrás cuando confirme que lo recibió.",
      link: "/cuenta.html#ventas",
    });
  }

  // Mismo mail que en Mercado Pago: el comprador necesita el botón "Ya lo recibí"
  if (env.RESEND_API_KEY && ords[0].buyer_email) {
    const discos = await sel(env, "records", `id=in.(${recordIds})&select=artist,title`);
    const lista = (discos || []).map((d) => `• ${d.artist} – ${d.title}`).join("<br>");
    const link = `${env.SITE_URL}/r.html?o=${ords[0].id}&t=${ords[0].rating_token || ""}`;
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "SURCOGS <ventas@surcogs.com.ar>",
        to: [ords[0].buyer_email],
        subject: "Recibimos tu transferencia — compra confirmada",
        html: `<div style="font-family:sans-serif;max-width:520px">
          <h2>¡Listo, recibimos tu transferencia!</h2>
          <p>${lista}</p>
          <p>El vendedor ya está avisado y te va a escribir para coordinar la entrega.</p>
          <p style="color:#555;font-size:13px">🚚 <b>¿Están los dos en AMBA?</b> Respondé este
            mail y coordinamos la entrega con <b>SURCOGS Express</b>: retiramos el disco por la
            casa del vendedor y te lo llevamos.</p>
          <p style="background:#f0f7f3;border-radius:6px;padding:12px 14px;color:#3c5a4a">
            🛡 <b>Tu plata está protegida.</b> El vendedor cobra recién cuando nos confirmes
            que recibiste el disco. Si en 10 días no nos decís nada y no hubo reclamo,
            se le acredita automáticamente.</p>
          <p style="margin:20px 0"><a href="${link}"
            style="background:#2ea860;color:#fff;padding:12px 22px;border-radius:5px;
            text-decoration:none;font-weight:bold">Ya lo recibí</a></p>
          <p style="color:#555;font-size:13px">¿Algún problema? Respondé este mail
            <b>antes</b> de confirmar y lo resolvemos.</p>
        </div>`,
      }),
    }).catch(() => {});
  }
  // Mismo aviso que en Mercado Pago: qué hay que transferirle a cada vendedor
  await avisoAdmin(env, purchaseId);

  return json({ ok: true, discos: ords.length });
}

const H = (env) => ({
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
});
const sel = (env, tabla, q) =>
  fetch(`${env.SUPABASE_URL}/rest/v1/${tabla}?${q}`, { headers: H(env) }).then((r) => r.json());
const json = (b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
