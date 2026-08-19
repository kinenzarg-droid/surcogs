// Cloudflare Pages Function — resumen del panel de admin.
// Responde solo lo que necesita atención hoy, no estadísticas.
// Se autentica con la sesión del admin (ADMIN_USER_ID), no con clave en la URL.
const PAGADAS = ["pagada", "enviado", "entregado"];
const DIAS_LIBERACION = 10;

export async function onRequestGet({ request, env }) {
  const SUPA = env.SUPABASE_URL;
  const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "No autorizado" }, 401);
  const u = await fetch(`${SUPA}/auth/v1/user`, { headers: { apikey: KEY, Authorization: auth } });
  if (!u.ok) return json({ error: "Sesión inválida" }, 401);
  const user = await u.json();
  if (!env.ADMIN_USER_ID || user.id !== env.ADMIN_USER_ID) {
    return json({ error: "Solo el administrador entra acá" }, 403);
  }

  const [orders, records, perfiles] = await Promise.all([
    sel(env, "orders", "select=id,seller_id,status,amount,fee,monto_vendedor,shipping_cost," +
      "metodo_pago,pagado_at,entregado_at,liquidado_at,created_at,purchase_id"),
    sel(env, "records", "select=id,status,seller_id,audio_url,tracks"),
    sel(env, "profiles", "select=id,name,alias"),
  ]);

  const ahora = Date.now();
  const liberable = (o) => {
    if (o.entregado_at) return true;
    if (!o.pagado_at) return false;
    return new Date(o.pagado_at).getTime() + DIAS_LIBERACION * 86400000 <= ahora;
  };
  const aTransferir = (o) => Number(o.monto_vendedor || 0) + Number(o.shipping_cost || 0);

  const pagadasSinLiquidar = orders.filter((o) => PAGADAS.includes(o.status) && !o.liquidado_at);
  const paraTransferir = pagadasSinLiquidar.filter(liberable);
  const esperando = pagadasSinLiquidar.filter((o) => !liberable(o));
  const porCobrar = orders.filter((o) => o.metodo_pago === "transferencia" && o.status === "reservado");

  // Vendedores que tienen discos publicados pero no cargaron dónde cobrar:
  // si venden hoy, no les podés transferir.
  const conStock = new Set(records.filter((r) => r.status === "disponible").map((r) => r.seller_id));
  const sinAlias = perfiles
    .filter((p) => conStock.has(p.id) && !(p.alias || "").trim())
    .map((p) => ({ id: p.id, name: p.name || "sin nombre" }));

  // Discos sin ningún audio cargado: se venden bastante peor
  const sinAudio = records.filter((r) =>
    r.status === "disponible" &&
    !(r.audio_url || "").trim() &&
    !(Array.isArray(r.tracks) && r.tracks.some((t) => (t?.audio_url || "").trim()))
  ).length;

  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const delMes = orders.filter((o) => PAGADAS.includes(o.status) &&
    new Date(o.pagado_at || o.created_at).getTime() >= inicioMes);

  const suma = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
  const compras = (arr) => new Set(arr.map((o) => o.purchase_id || o.id)).size;

  return json({
    paraTransferir: { compras: compras(paraTransferir), monto: suma(paraTransferir, aTransferir) },
    esperando:      { compras: compras(esperando),      monto: suma(esperando, aTransferir) },
    porCobrar:      { compras: compras(porCobrar),      monto: suma(porCobrar, (o) => Number(o.amount || 0) + Number(o.shipping_cost || 0)) },
    sinAlias,
    catalogo: {
      disponibles: records.filter((r) => r.status === "disponible").length,
      vendidos: records.filter((r) => r.status === "vendido").length,
      sinAudio,
      vendedores: conStock.size,
    },
    mes: { ventas: compras(delMes), comision: suma(delMes, (o) => Number(o.fee || 0)) },
  });
}

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
const json = (b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
