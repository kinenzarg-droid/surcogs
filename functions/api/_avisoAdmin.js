// Aviso a SURCOGS ni bien se confirma una compra.
//
// La plata entra toda a la cuenta de SURCOGS, así que este mail es la hoja de
// ruta de lo que hay que transferirle después a cada vendedor: sus discos, el
// monto y su alias. Sirve igual para Mercado Pago y para transferencia.
//
// OJO: es informativo, no una orden de pago. Al vendedor se le transfiere
// cuando el comprador confirma la entrega, o a los 10 días. El mail lo aclara
// para que nadie pague antes de tiempo y pierda la protección.
const pesos = (n) => "$" + Number(n || 0).toLocaleString("es-AR");

export async function avisoAdmin(env, purchaseId) {
  if (!env.RESEND_API_KEY || !env.ADMIN_EMAIL || !purchaseId) return;
  try {
    const H = {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    };
    const sel = async (t, q) => {
      const j = await fetch(`${env.SUPABASE_URL}/rest/v1/${t}?${q}`, { headers: H })
        .then((r) => r.json());
      return Array.isArray(j) ? j : [];
    };

    const ords = await sel("orders",
      `purchase_id=eq.${purchaseId}&select=id,seller_id,record_id,amount,fee,monto_vendedor,` +
      `shipping_cost,metodo_pago,buyer_name,buyer_email,buyer_phone,buyer_addr,buyer_zona,buyer_localidad,buyer_cp`);
    if (!ords.length) return;

    const sellerIds = [...new Set(ords.map((o) => o.seller_id))];
    const recordIds = [...new Set(ords.map((o) => o.record_id))];
    const [perfiles, discos] = await Promise.all([
      sel("profiles", `id=in.(${sellerIds.join(",")})&select=id,name,alias,titular,whatsapp`),
      sel("records", `id=in.(${recordIds.join(",")})&select=id,artist,title`),
    ]);
    const P = Object.fromEntries(perfiles.map((x) => [x.id, x]));
    const R = Object.fromEntries(discos.map((x) => [x.id, x]));

    // Un bloque por vendedor: es la unidad de transferencia
    const grupos = {};
    for (const o of ords) {
      const g = (grupos[o.seller_id] = grupos[o.seller_id] || { p: P[o.seller_id] || {}, filas: [], total: 0, envio: 0 });
      const d = R[o.record_id] || {};
      g.filas.push(`${d.artist ?? "?"} – ${d.title ?? "?"}`);
      g.total += Number(o.monto_vendedor || 0);
      g.envio += Number(o.shipping_cost || 0);
    }

    const o0 = ords[0];
    let totalTransferir = 0;
    const bloques = Object.values(grupos).map((g) => {
      const aPagar = g.total + g.envio;
      totalTransferir += aPagar;
      const alias = g.p.alias
        ? `<b style="font-family:monospace;font-size:15px">${g.p.alias}</b>`
        : `<b style="color:#c00">⚠ NO CARGÓ SU ALIAS — pedírselo antes de transferir</b>`;
      return `
        <div style="border:1px solid #ddd;border-radius:8px;padding:14px;margin:0 0 12px">
          <div style="font-size:16px;font-weight:bold">${g.p.name || "Vendedor"}</div>
          <div style="color:#555;font-size:13px;margin:8px 0">
            ${g.filas.map((f) => "• " + f).join("<br>")}
          </div>
          <table style="font-size:14px;border-collapse:collapse">
            <tr><td style="padding:2px 12px 2px 0">Discos</td><td><b>${pesos(g.total)}</b></td></tr>
            ${g.envio ? `<tr><td style="padding:2px 12px 2px 0">Envío</td><td><b>${pesos(g.envio)}</b></td></tr>` : ""}
            <tr><td style="padding:6px 12px 2px 0;border-top:1px solid #eee">A transferirle</td>
                <td style="border-top:1px solid #eee;padding-top:6px"><b style="font-size:17px">${pesos(aPagar)}</b></td></tr>
          </table>
          <div style="margin-top:9px;font-size:13px">Alias: ${alias}
            ${g.p.titular ? `<br>Titular: ${g.p.titular}` : ""}
            ${g.p.whatsapp ? `<br>WhatsApp: ${g.p.whatsapp}` : ""}</div>
        </div>`;
    });

    const cobrado = ords.reduce((s, o) => s + Number(o.amount || 0) + Number(o.shipping_cost || 0), 0);
    const asunto = `💰 Venta ${pesos(cobrado)} — transferir ${pesos(totalTransferir)} a ` +
      `${bloques.length} vendedor${bloques.length > 1 ? "es" : ""}`;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "SURCOGS <ventas@surcogs.com.ar>",
        to: [env.ADMIN_EMAIL],
        subject: asunto,
        html: `<div style="font-family:sans-serif;max-width:600px">
          <h2 style="margin-bottom:2px">Compra confirmada</h2>
          <p style="color:#666;margin:0 0 16px;font-size:13px">
            Código ${String(purchaseId).slice(0, 8).toUpperCase()} ·
            pagó por ${o0.metodo_pago === "transferencia" ? "transferencia" : "Mercado Pago"}</p>

          <div style="background:#fff8f4;border-left:3px solid #ff5500;padding:12px 14px;margin-bottom:18px">
            <b>Entró ${pesos(cobrado)}.</b> Hay que transferir <b>${pesos(totalTransferir)}</b> en total.<br>
            <span style="color:#555;font-size:13px">Todavía no transfieras: se le paga a cada vendedor
            cuando el comprador confirme que recibió, o a los 10 días. Este mail es para que sepas
            cuánto vas a tener que mover.</span>
          </div>

          <h3 style="font-size:15px;margin-bottom:10px">A quién le tenés que transferir</h3>
          ${bloques.join("")}

          <h3 style="font-size:15px;margin:18px 0 6px">Comprador</h3>
          <div style="font-size:13.5px;color:#444;line-height:1.6">
            ${o0.buyer_name || "sin nombre"}<br>
            ${o0.buyer_email || "sin email"}${o0.buyer_phone ? " · " + o0.buyer_phone : ""}<br>
            ${[o0.buyer_addr, o0.buyer_localidad, o0.buyer_zona, o0.buyer_cp].filter(Boolean).join(", ") || "sin dirección"}
          </div>

          <p style="margin:22px 0 0"><a href="${env.SITE_URL}/liquidaciones.html"
            style="background:#ff5500;color:#fff;padding:11px 20px;border-radius:5px;text-decoration:none">
            Abrir el panel de liquidaciones</a></p>
        </div>`,
      }),
    }).catch(() => {});
  } catch (_) {
    // Un aviso que falla nunca puede romper una venta
  }
}
