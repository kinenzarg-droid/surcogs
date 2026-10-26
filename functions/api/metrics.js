// Cloudflare Pages Function — métricas del negocio, solo para el admin.
// Requiere env ADMIN_USER_ID (el UUID del usuario dueño de SURCOGS).
//
// Esto se reescribió cuando SURCOGS dejó de cobrar comisión. Antes todo salía
// de la tabla de órdenes: ventas, GMV, comisión, liquidez. Con el trato
// cerrándose por WhatsApp ya no se genera ninguna orden, así que ese tablero
// marcaba cero para siempre por más que el sitio funcionara.
//
// Lo que se mide ahora es lo que de verdad pasa: cuánta gente levanta la mano
// por un disco (la consulta por WhatsApp), cuánta guarda discos para después,
// cuánta se crea cuenta, y cuánto catálogo hay para ofrecerles.
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

  const [consultas, records, profiles] = await Promise.all([
    traer(SUPA, KEY, "consultas?select=record_id,created_at"),
    traer(SUPA, KEY, "records?select=id,artist,title,status,created_at,seller_id,favs,consultas"),
    traer(SUPA, KEY, "profiles?select=id,created_at"),
  ]);

  const DIA = 86400000;
  const desde = (dias) => new Date(Date.now() - dias * DIA).toISOString();
  const hace7 = desde(7), hace14 = desde(14), hace30 = desde(30);

  // --- La métrica norte: consultas por WhatsApp ----------------------------
  const estaSemana = consultas.filter((c) => c.created_at >= hace7).length;
  const semanaPrevia = consultas.filter(
    (c) => c.created_at >= hace14 && c.created_at < hace7).length;

  // Serie de las últimas 8 semanas, de lunes a domingo. Es lo que deja ver si
  // una campaña movió la aguja o si fue un pico de un día suelto.
  const lunesDe = (f) => {
    const d = new Date(f);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  };
  const porSemana = {};
  for (let i = 7; i >= 0; i--) porSemana[lunesDe(Date.now() - i * 7 * DIA)] = 0;
  consultas.forEach((c) => {
    const k = lunesDe(c.created_at);
    if (k in porSemana) porSemana[k]++;
  });
  const serie = Object.entries(porSemana).map(([dia, n]) => ({ desde: dia, n }));

  // --- Oferta --------------------------------------------------------------
  const porVendedor = {};
  records.forEach((r) => { porVendedor[r.seller_id] = (porVendedor[r.seller_id] || 0) + 1; });

  // --- Lo que la gente quiere ----------------------------------------------
  const corto = (r) => ({
    artist: r.artist, title: r.title,
    consultas: r.consultas || 0, favs: r.favs || 0, status: r.status,
  });
  const masConsultados = [...records].filter((r) => (r.consultas || 0) > 0)
    .sort((a, b) => (b.consultas || 0) - (a.consultas || 0)).slice(0, 6).map(corto);
  const masGuardados = [...records].filter((r) => (r.favs || 0) > 0)
    .sort((a, b) => (b.favs || 0) - (a.favs || 0)).slice(0, 6).map(corto);

  // Un disco muy guardado y nunca consultado suele ser precio mal puesto: la
  // gente lo quiere pero no se anima a preguntar.
  const deseadosSinConsulta = [...records]
    .filter((r) => (r.favs || 0) > 0 && !(r.consultas || 0) && r.status === "disponible")
    .sort((a, b) => (b.favs || 0) - (a.favs || 0)).slice(0, 6).map(corto);

  return json({
    norte: {
      semana: estaSemana,
      semanaPrevia,
      mes: consultas.filter((c) => c.created_at >= hace30).length,
      total: consultas.length,
    },
    serie,
    demanda: {
      favoritos: records.reduce((s, r) => s + (r.favs || 0), 0),
      discosConConsulta: records.filter((r) => (r.consultas || 0) > 0).length,
      discosConFav: records.filter((r) => (r.favs || 0) > 0).length,
    },
    audiencia: {
      cuentas: profiles.length,
      nuevas30: profiles.filter((p) => p.created_at >= hace30).length,
    },
    oferta: {
      disponibles: records.filter((r) => r.status === "disponible").length,
      publicados30: records.filter((r) => r.created_at >= hace30).length,
      vendedores: Object.keys(porVendedor).length,
      vendedoresActivos: Object.values(porVendedor).filter((n) => n >= 3).length,
    },
    salud: {
      vendidos: records.filter((r) => r.status === "vendido").length,
      vendidos30: records.filter((r) => r.status === "vendido" && r.created_at >= hace30).length,
    },
    top: { masConsultados, masGuardados, deseadosSinConsulta },
  });
}

// PostgREST devuelve 1000 filas por pedido. Con el volumen de hoy sobra, pero
// se pagina igual para que no empiece a mentir en silencio cuando crezca.
async function traer(SUPA, KEY, consulta) {
  const salida = [];
  for (let desde = 0; ; desde += 1000) {
    const r = await fetch(`${SUPA}/rest/v1/${consulta}`, {
      headers: { ...hdrs(KEY), Range: `${desde}-${desde + 999}` },
    });
    const tanda = await r.json();
    if (!Array.isArray(tanda) || !tanda.length) break;
    salida.push(...tanda);
    if (tanda.length < 1000) break;
  }
  return salida;
}

const hdrs = (KEY) => ({
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
});
const json = (b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
