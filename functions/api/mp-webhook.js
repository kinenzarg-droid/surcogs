// Cloudflare Pages Function — webhook de Mercado Pago: al aprobarse el pago,
// marca como pagadas TODAS las órdenes de la compra y los discos como vendidos.
//
// Una compra puede tener discos de VARIOS vendedores: el comprador paga una
// sola vez y la plata entra a SURCOGS. Por eso todo lo que sigue (paquetes,
// avisos, mails) se hace agrupado por vendedor, que es la unidad de entrega.
import { notificar } from "./_notificar.js";
import { avisoAdmin } from "./_avisoAdmin.js";

export async function onRequest({ request, env }) {
  const SUPA = env.SUPABASE_URL;
  const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  const ok = new Response("ok", { status: 200 }); // siempre 200 para que MP no reintente infinito

  try {
    const url = new URL(request.url);
    const purchaseId = url.searchParams.get("purchase") || null;
    const orderId = url.searchParams.get("order") || null; // compat con órdenes viejas
    const body = await request.json().catch(() => ({}));
    const paymentId = body?.data?.id || url.searchParams.get("data.id");
    if ((!purchaseId && !orderId) || !paymentId) return ok;

    // Órdenes de la compra. Traemos también los datos del comprador porque más
    // abajo se usan para armar los paquetes.
    const filtro = purchaseId ? `purchase_id=eq.${purchaseId}` : `id=eq.${orderId}`;
    const ords = await sel(env, "orders",
      `${filtro}&select=id,seller_id,record_id,status,amount,fee,monto_vendedor,shipping_cost,` +
      `buyer_name,buyer_phone,buyer_addr,buyer_zona,buyer_localidad,buyer_email`);
    if (!ords.length) return ok;
    if (ords.every((o) => o.status === "pagada")) return ok;

    // El cobro es centralizado: la plata entra a la cuenta de SURCOGS, así que
    // el pago se consulta con NUESTRO token, no con uno del vendedor.
    const MP = env.MP_ACCESS_TOKEN;
    if (!MP) return ok;

    // Consultar el pago real en MP (nunca confiar solo en el webhook)
    const pay = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${MP}` },
    }).then((r) => r.json());

    const refEsperada = purchaseId || String(ords[0].id);
    if (pay.status !== "approved" || String(pay.external_reference) !== refEsperada) return ok;

    await fetch(`${SUPA}/rest/v1/orders?${filtro}`, {
      method: "PATCH", headers: hdrs(KEY),
      body: JSON.stringify({ status: "pagada", mp_payment_id: String(paymentId), pagado_at: new Date().toISOString() }),
    });
    const recordIds = [...new Set(ords.map((o) => o.record_id))];
    await fetch(`${SUPA}/rest/v1/records?id=in.(${recordIds.join(",")})`, {
      method: "PATCH", headers: hdrs(KEY),
      body: JSON.stringify({ status: "vendido" }),
    });

    // ---- Agrupar por vendedor ----
    const sellerIds = [...new Set(ords.map((o) => o.seller_id))];
    const [perfiles, discos] = await Promise.all([
      sel(env, "profiles", `id=in.(${sellerIds.join(",")})&select=id,name,whatsapp,direccion,zona,localidad`),
      sel(env, "records", `id=in.(${recordIds.join(",")})&select=id,artist,title,format`),
    ]);
    const P = Object.fromEntries(perfiles.map((x) => [x.id, x]));
    const R = Object.fromEntries(discos.map((x) => [x.id, x]));
    const grupos = {};
    for (const o of ords) {
      const g = (grupos[o.seller_id] = grupos[o.seller_id] || { ords: [], discos: [], monto: 0 });
      g.ords.push(o);
      if (R[o.record_id]) g.discos.push(R[o.record_id]);
      g.monto += Number(o.monto_vendedor ?? (o.amount - o.fee)) + Number(o.shipping_cost || 0);
    }

    // ---- Un paquete por vendedor ----
    try {
      const yaExiste = await sel(env, "shipments", `purchase_id=eq.${refEsperada}&select=seller_id`);
      const hechos = new Set(yaExiste.map((s) => s.seller_id));
      for (const [sellerId, g] of Object.entries(grupos)) {
        if (hechos.has(sellerId)) continue;
        const v = P[sellerId] || {};
        const o = g.ords[0];
        await fetch(`${SUPA}/rest/v1/shipments`, {
          method: "POST", headers: hdrs(KEY),
          body: JSON.stringify({
            purchase_id: refEsperada, seller_id: sellerId,
            code: "SC-" + Math.random().toString(36).slice(2, 6).toUpperCase(),
            token: crypto.randomUUID().replace(/-/g, ""),
            seller_name: v.name, seller_phone: v.whatsapp, seller_addr: v.direccion,
            seller_zona: [v.zona, v.localidad].filter(Boolean).join(" · "),
            buyer_name: o.buyer_name, buyer_phone: o.buyer_phone, buyer_addr: o.buyer_addr,
            buyer_zona: o.buyer_zona, buyer_localidad: o.buyer_localidad, buyer_email: o.buyer_email,
            detalle: `${g.discos.length} vinilo${g.discos.length > 1 ? "s" : ""} — ` +
              g.discos.map((d) => `${d.artist} – ${d.title}`).join(", "),
            monto_vendedor: g.monto,
          }),
        });
      }
    } catch (_) { /* si falla, el paquete se puede crear a mano */ }

    // ---- Avisar a cada vendedor ----
    for (const [sellerId, g] of Object.entries(grupos)) {
      const lista = g.discos.map((d) => `• ${d.artist} – ${d.title}`).join("<br>");
      await notificar(env, {
        user_id: sellerId,
        tipo: "venta",
        titulo: g.discos.length > 1 ? `¡Vendiste ${g.discos.length} discos!` : "¡Vendiste un disco!",
        detalle: "Coordiná la entrega con el comprador. Cobrás cuando confirme que lo recibió.",
        link: "/cuenta.html#ventas",
      });
      if (!env.RESEND_API_KEY) continue;
      try {
        const vendedor = await fetch(`${SUPA}/auth/v1/admin/users/${sellerId}`, { headers: hdrs(KEY) })
          .then((r) => (r.ok ? r.json() : null));
        if (!vendedor?.email) continue;
        await enviar(env, vendedor.email, "🎉 ¡Vendiste en SURCOGS!", `
          <h2>¡Felicitaciones, vendiste!</h2>
          <p>${lista}</p>
          <p>El pago ya está confirmado y guardado por SURCOGS.</p>
          <p><b>Comprador:</b> ${g.ords[0].buyer_email || "no dejó email"}<br>
          Escribile hoy para coordinar la entrega: punto de encuentro o envío.</p>
          <p style="color:#555;font-size:13px">🚚 <b>SURCOGS Express.</b> Si vos y el comprador
          están en AMBA, respondé este mail y lo coordinamos: pasamos a retirar el disco por tu
          casa y lo entregamos. No tenés que ir hasta el correo.</p>
          <p style="color:#555;font-size:13px">💰 <b>Cuándo cobrás.</b> Te transferimos a tu alias
          dentro de las 48hs hábiles de que el comprador confirme que recibió el disco, o a los
          10 días del envío si no hay reclamo. Recibís tu precio completo: las comisiones las paga
          el comprador. Revisá que tengas tu alias cargado en Mi cuenta.</p>
          <p style="color:#555;font-size:13px">📦 <b>Cómo embalar el vinilo:</b></p>
          <ul style="color:#555;font-size:13px;margin:0 0 12px;padding-left:18px">
            <li><b>Sacá el vinilo de la tapa</b> y ponelo en su funda interna por fuera de la tapa:
            si el paquete recibe un golpe, el disco no rasga la funda ni la tapa (el clásico "seam split").</li>
            <li>Juntá tapa y disco y envolvelos en papel o film.</li>
            <li>Metelo <b>entre dos planchas de cartón rígido</b> más grandes que el disco,
            bien ajustado con cinta: adentro no tiene que moverse nada si lo sacudís.</li>
            <li>Reforzá las <b>cuatro esquinas</b> con cartón extra o cinta de papel.</li>
            <li>Escribí <b>"FRÁGIL — NO DOBLAR"</b> en las dos caras.</li>
          </ul>
          <p><a href="${env.SITE_URL}/cuenta.html" style="background:#ff5500;color:#fff;padding:10px 18px;border-radius:5px;text-decoration:none">Ver mi panel</a></p>`);
      } catch (_) { /* un mail que falla no rompe la venta */ }
    }

    // ---- Mail al comprador: uno solo, con todo lo que compró ----
    if (env.RESEND_API_KEY && ords[0].buyer_email) {
      try {
        const [primera] = await sel(env, "orders", `id=eq.${ords[0].id}&select=rating_token`);
        const link = `${env.SITE_URL}/r.html?o=${ords[0].id}&t=${primera?.rating_token || ""}`;
        const todo = Object.values(R).map((d) => `• ${d.artist} – ${d.title}`).join("<br>");
        await enviar(env, ords[0].buyer_email, "Tu compra en SURCOGS está confirmada", `
          <h2>¡Gracias por tu compra!</h2>
          <p>${todo}</p>
          <p>${sellerIds.length > 1
            ? `Tus discos son de <b>${sellerIds.length} vendedores</b>, así que vas a coordinar
               una entrega con cada uno. Los datos de todos están en Mis compras.`
            : "El vendedor ya está avisado y te va a escribir para coordinar la entrega."}</p>
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
            <b>antes</b> de confirmar y lo resolvemos.</p>`);
      } catch (_) { /* idem */ }
    }

    // ---- Aviso a SURCOGS con el desglose de lo que hay que transferir ----
    await avisoAdmin(env, refEsperada);

    return ok;
  } catch {
    return ok;
  }
}

const enviar = (env, to, subject, html) =>
  fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "SURCOGS <ventas@surcogs.com.ar>",
      to: [to], subject,
      html: `<div style="font-family:sans-serif;max-width:520px">${html}
        <p style="color:#999;font-size:12px">SURCOGS · Vinilos de mano en mano</p></div>`,
    }),
  }).catch(() => {});

const hdrs = (KEY) => ({
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
});
const sel = async (env, tabla, q) => {
  try {
    const j = await fetch(`${env.SUPABASE_URL}/rest/v1/${tabla}?${q}`,
      { headers: hdrs(env.SUPABASE_SERVICE_ROLE_KEY) }).then((r) => r.json());
    return Array.isArray(j) ? j : [];
  } catch (_) { return []; }
};
