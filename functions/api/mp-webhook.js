// Cloudflare Pages Function — webhook de Mercado Pago: al aprobarse el pago,
// marca como pagadas TODAS las órdenes de la compra y los discos como vendidos.
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

    // Órdenes de la compra → vendedor → su token de MP
    const filtro = purchaseId ? `purchase_id=eq.${purchaseId}` : `id=eq.${orderId}`;
    const ords = await fetch(
      `${SUPA}/rest/v1/orders?${filtro}&select=id,seller_id,record_id,status`,
      { headers: hdrs(KEY) }
    ).then((r) => r.json());
    if (!Array.isArray(ords) || !ords.length) return ok;
    if (ords.every((o) => o.status === "pagada")) return ok;

    const toks = await fetch(
      `${SUPA}/rest/v1/mp_tokens?user_id=eq.${ords[0].seller_id}&select=access_token`,
      { headers: hdrs(KEY) }
    ).then((r) => r.json());
    if (!toks.length) return ok;

    // Consultar el pago real en MP (nunca confiar solo en el webhook)
    const pay = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${toks[0].access_token}` },
    }).then((r) => r.json());

    const refEsperada = purchaseId || String(ords[0].id);
    if (pay.status === "approved" && String(pay.external_reference) === refEsperada) {
      await fetch(`${SUPA}/rest/v1/orders?${filtro}`, {
        method: "PATCH", headers: hdrs(KEY),
        body: JSON.stringify({ status: "pagada", mp_payment_id: String(paymentId), pagado_at: new Date().toISOString() }),
      });
      const recordIds = ords.map((o) => o.record_id).join(",");
      await fetch(`${SUPA}/rest/v1/records?id=in.(${recordIds})`, {
        method: "PATCH", headers: hdrs(KEY),
        body: JSON.stringify({ status: "vendido" }),
      });

      // Crear el paquete para el courier (uno por compra = uno por vendedor)
      try {
        const yaExiste = await fetch(
          `${SUPA}/rest/v1/shipments?purchase_id=eq.${refEsperada}&select=id`,
          { headers: hdrs(KEY) }
        ).then((r) => r.json());
        if (!yaExiste.length) {
          const [vend, discos] = await Promise.all([
            fetch(`${SUPA}/rest/v1/profiles?id=eq.${ords[0].seller_id}&select=name,whatsapp,direccion,zona,localidad`,
              { headers: hdrs(KEY) }).then((r) => r.json()),
            fetch(`${SUPA}/rest/v1/records?id=in.(${recordIds})&select=artist,title,format`,
              { headers: hdrs(KEY) }).then((r) => r.json()),
          ]);
          const v = vend?.[0] || {};
          const o = ords[0];
          const cod = "SC-" + Math.random().toString(36).slice(2, 6).toUpperCase();
          const detalle = `${discos.length} vinilo${discos.length > 1 ? "s" : ""} — ` +
            discos.map((d) => `${d.artist} – ${d.title}`).join(", ");
          const montoVendedor = ords.reduce((s, x) => s + (x.amount - x.fee), 0);
          await fetch(`${SUPA}/rest/v1/shipments`, {
            method: "POST", headers: hdrs(KEY),
            body: JSON.stringify({
              purchase_id: refEsperada, seller_id: o.seller_id,
              code: cod, token: crypto.randomUUID().replace(/-/g, ""),
              seller_name: v.name, seller_phone: v.whatsapp, seller_addr: v.direccion,
              seller_zona: [v.zona, v.localidad].filter(Boolean).join(" · "),
              buyer_name: o.buyer_name, buyer_phone: o.buyer_phone, buyer_addr: o.buyer_addr,
              buyer_zona: o.buyer_zona, buyer_localidad: o.buyer_localidad, buyer_email: o.buyer_email,
              detalle, monto_vendedor: montoVendedor,
            }),
          });
        }
      } catch (_) { /* si falla, el paquete se puede crear a mano */ }

      // Notificación en la campanita del vendedor
      await notificar(env, {
        user_id: ords[0].seller_id,
        tipo: "venta",
        titulo: "¡Vendiste un disco!",
        detalle: "Coordiná la entrega con el comprador. Cobrás cuando confirme que lo recibió.",
        link: "/cuenta.html#ventas",
      });

      // Avisar al vendedor por email (Resend) — si falla, no rompe nada
      if (env.RESEND_API_KEY) {
        try {
          const [vendedor, discos] = await Promise.all([
            fetch(`${SUPA}/auth/v1/admin/users/${ords[0].seller_id}`, { headers: hdrs(KEY) }).then((r) => r.json()),
            fetch(`${SUPA}/rest/v1/records?id=in.(${recordIds})&select=artist,title`, { headers: hdrs(KEY) }).then((r) => r.json()),
          ]);
          const buyer = await fetch(
            `${SUPA}/rest/v1/orders?id=eq.${ords[0].id}&select=buyer_email,rating_token`,
            { headers: hdrs(KEY) }
          ).then((r) => r.json());
          const lista = (discos || []).map((d) => `• ${d.artist} – ${d.title}`).join("<br>");
          const emailComprador = buyer?.[0]?.buyer_email || "no dejó email";

          // Mail al comprador con el link para confirmar la entrega
          if (buyer?.[0]?.buyer_email) {
            const link = `${env.SITE_URL}/r.html?o=${ords[0].id}&t=${buyer[0].rating_token || ""}`;
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from: "SURCOGS <ventas@surcogs.com.ar>",
                to: [buyer[0].buyer_email],
                subject: "Tu compra en SURCOGS está confirmada",
                html: `<div style="font-family:sans-serif;max-width:520px">
                  <h2>¡Gracias por tu compra!</h2>
                  <p>${lista}</p>
                  <p>El vendedor ya está avisado y te va a escribir para coordinar la entrega.</p>
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
          if (vendedor?.email) {
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${env.RESEND_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: "SURCOGS <ventas@surcogs.com.ar>",
                to: [vendedor.email],
                subject: "🎉 ¡Vendiste en SURCOGS!",
                html: `<div style="font-family:sans-serif;max-width:520px">
                  <h2>¡Felicitaciones, vendiste!</h2>
                  <p>${lista}</p>
                  <p>El pago ya está confirmado y guardado por SURCOGS.</p>
                  <p><b>Comprador:</b> ${emailComprador}<br>
                  Escribile hoy para coordinar la entrega: punto de encuentro o envío.</p>
                  <p style="color:#555;font-size:13px">💰 <b>Cuándo cobrás.</b> Te transferimos a tu alias
                  dentro de las 48hs hábiles de que el comprador confirme que recibió el disco, o a los
                  10 días del envío si no hay reclamo. Recibís tu precio completo: las comisiones las paga
                  el comprador. Revisá que tengas tu alias cargado en Mi cuenta.</p>
                  <p style="color:#555;font-size:13px">📦 <b>Sugerencia de envío:</b> Correo Argentino a sucursal,
                  con seguimiento. Embalado de coleccionista:</p>
                  <ul style="color:#555;font-size:13px;margin:0 0 12px;padding-left:18px">
                    <li><b>Sacá el vinilo de la tapa</b> y ponelo en su funda interna por fuera de la tapa:
                    si el paquete recibe un golpe, el disco no rasga la funda ni la tapa (el clásico "seam split").</li>
                    <li>Juntá tapa y disco y envolvelos en papel o film.</li>
                    <li>Metelo <b>entre dos planchas de cartón rígido</b> más grandes que el disco,
                    bien ajustado con cinta: adentro no tiene que moverse nada si lo sacudís.</li>
                    <li>Reforzá las <b>cuatro esquinas</b> con cartón extra o cinta de papel.</li>
                    <li>Escribí <b>"FRÁGIL — NO DOBLAR"</b> en las dos caras y pasale el
                    número de seguimiento al comprador apenas lo despaches.</li>
                  </ul>
                  <p><a href="https://surcogs.com.ar/cuenta.html" style="background:#ff5500;color:#fff;padding:10px 18px;border-radius:5px;text-decoration:none">Ver mi panel</a></p>
                  <p style="color:#999;font-size:12px">SURCOGS · Vinilos de mano en mano</p>
                </div>`,
              }),
            });
          }
        } catch {}
      }
    }
    return ok;
  } catch {
    return ok;
  }
}

const hdrs = (KEY) => ({
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
});
