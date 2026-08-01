// Cloudflare Pages Function — métricas del negocio, solo para el admin.
// Requiere env ADMIN_USER_ID (el UUID del usuario dueño de SURCOGS).
export async function onRequestGet({ request, env }) {
  const SUPA = env.SUPABASE_URL;
  const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

  // Solo el admin puede ver esto
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "No autorizado" }, 401);
  const u = await fetch(`${SUPA}/auth/v1/user`, {
    headers: { apikey: KEY, Authorization: auth },
  });
  if (!u.ok) return json({ error: "Sesión inválida" }, 401);
  const user = await u.json();
  if (!env.ADMIN_USER_ID || user.id !== env.ADMIN_USER_ID) {
    return json({ error: "Solo el administrador puede ver las métricas" }, 403);
  }

  // Traer datos (escala MVP: todo en memoria)
  const [orders, ratings, records] = await Promise.all([
    fetch(`${SUPA}/rest/v1/orders?select=id,fee,amount,status,created_at,buyer_email,seller_id`, { headers: hdrs(KEY) }).then(r => r.json()),
    fetch(`${SUPA}/rest/v1/ratings?select=order_id,stars,created_at`, { headers: hdrs(KEY) }).then(r => r.json()),
    fetch(`${SUPA}/rest/v1/records?select=id,status,created_at,seller_id`, { headers: hdrs(KEY) }).then(r => r.json()),
  ]);

  const ahora = new Date();
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString();
  const hace30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const hace60 = new Date(Date.now() - 60 * 86400000).toISOString();

  const pagadas = orders.filter(o => o.status === "pagada");
  const pagadasMes = pagadas.filter(o => o.created_at >= inicioMes);
  const ratingPorOrden = Object.fromEntries(ratings.map(r => [r.order_id, r.stars]));

  // ⭐ Norte: ventas felices del mes (pagadas + calificadas 4-5)
  const felicesMes = pagadasMes.filter(o => (ratingPorOrden[o.id] || 0) >= 4).length;

  // Liquidez: de los discos publicados en los últimos 60 días, % vendidos
  const publicados60 = records.filter(r => r.created_at >= hace60);
  const vendidos60 = publicados60.filter(r => r.status === "vendido");

  // Vendedores activos: con 3+ discos publicados
  const porVendedor = {};
  records.forEach(r => { porVendedor[r.seller_id] = (porVendedor[r.seller_id] || 0) + 1; });
  const vendedoresActivos = Object.values(porVendedor).filter(n => n >= 3).length;

  const compradores = new Set(pagadas.map(o => o.buyer_email).filter(Boolean));
  const compradoresRepetidos = [...pagadas.reduce((m, o) => {
    if (o.buyer_email) m.set(o.buyer_email, (m.get(o.buyer_email) || 0) + 1);
    return m;
  }, new Map()).values()].filter(n => n > 1).length;

  const avgStars = ratings.length
    ? (ratings.reduce((s, r) => s + r.stars, 0) / ratings.length) : null;

  return json({
    norte: {
      ventasFelicesMes: felicesMes,
      ventasPagadasMes: pagadasMes.length,
      calificadasPendientes: pagadasMes.length - pagadasMes.filter(o => ratingPorOrden[o.id]).length,
    },
    soporte: {
      liquidez60: publicados60.length ? Math.round((vendidos60.length / publicados60.length) * 100) : null,
      publicados60: publicados60.length,
      vendidos60: vendidos60.length,
      vendedoresActivos,
      vendedoresTotales: Object.keys(porVendedor).length,
      discosDisponibles: records.filter(r => r.status === "disponible").length,
      publicadosUlt30: records.filter(r => r.created_at >= hace30).length,
      compradoresUnicos: compradores.size,
      compradoresRepetidos,
      ratingPromedio: avgStars ? Number(avgStars.toFixed(2)) : null,
      totalCalificaciones: ratings.length,
    },
    plata: {
      comisionMes: pagadasMes.reduce((s, o) => s + (o.fee || 0), 0),
      comisionTotal: pagadas.reduce((s, o) => s + (o.fee || 0), 0),
      gmvMes: pagadasMes.reduce((s, o) => s + (o.amount || 0), 0),
      ventasTotales: pagadas.length,
    },
  });
}

const hdrs = (KEY) => ({
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
});
const json = (b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
