// Cloudflare Pages Function — trae los datos de un disco de Discogs
// para autocompletar el formulario de publicación.
// Acepta links de release (edición concreta) y de master (usa la edición principal):
//   https://www.discogs.com/release/1234567-Artista-Titulo
//   https://www.discogs.com/es/master/531487-Artista-Titulo
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const link = url.searchParams.get("url") || "";

  // Solo para gente logueada. Antes esto estaba abierto: cualquiera que supiera
  // la direccion podia consultar Discogs con nuestro token y dejarnos sin cuota.
  // Publicar un disco exige cuenta, asi que consultar Discogs tambien.
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) {
    return json({ error: "Entrá con tu cuenta para traer datos de Discogs" }, 401);
  }
  const quien = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: auth },
  });
  if (!quien.ok) return json({ error: "Tu sesión venció, volvé a entrar" }, 401);

  // Los datos de un disco en Discogs no cambian. Guardamos la respuesta ya
  // armada por 30 días: así consultar dos veces el mismo disco (o reintentar
  // después de un 429) no gasta ni una consulta de la cuota.
  const cache = caches.default;
  const idCache = (link.match(/(?:release|master)\/(\d+)/) || [])[0];
  const claveCache = idCache
    ? new Request(`https://cache.surcogs.local/discogs/${idCache.replace("/", "-")}`)
    : null;
  if (claveCache) {
    const guardada = await cache.match(claveCache);
    if (guardada) return guardada;
  }
  const guardar = async (respuesta) => {
    if (claveCache) {
      const copia = new Response(respuesta.clone().body, respuesta);
      copia.headers.set("Cache-Control", "public, max-age=2592000");
      await cache.put(claveCache, copia);
    }
    return respuesta;
  };

  const headers = {
    "User-Agent": "SURCOGS/1.0 +https://surcogs.com.ar",
    Accept: "application/json",
  };
  const conToken = Boolean(env.DISCOGS_TOKEN);
  if (conToken) headers.Authorization = `Discogs token=${env.DISCOGS_TOKEN}`;

  // Discogs a veces devuelve 429 aislados: reintentar una vez tras una pausa.
  // Guardamos los headers de cuota de la última respuesta para poder diagnosticar:
  // si el límite dice 25 es que Discogs NO nos está viendo como autenticados.
  let cuota = {};
  const fetchDg = async (u) => {
    let r = await fetch(u, { headers });
    // La cuota de Discogs es por minuto. Reintentamos solo si el 429 parece
    // pasajero: si Discogs ya dijo que no queda nada, insistir gasta tres
    // consultas mas para nada y empeora el problema en vez de arreglarlo.
    for (const espera of [2000, 4000]) {
      if (r.status !== 429) break;
      if (r.headers.get("X-Discogs-Ratelimit-Remaining") === "0") break;
      await new Promise((res) => setTimeout(res, espera));
      r = await fetch(u, { headers });
    }
    cuota = {
      limite: r.headers.get("X-Discogs-Ratelimit"),
      usado: r.headers.get("X-Discogs-Ratelimit-Used"),
      restante: r.headers.get("X-Discogs-Ratelimit-Remaining"),
    };
    return r;
  };
  const err429 = () => json({
    error: `Discogs está limitando las consultas${conToken ? "" : " (token no configurado)"}. Esperá un minuto y probá de nuevo.`,
    con_token: conToken,
    cuota,
  }, 429);

  // Extraer el ID: release directo, o master → su edición principal
  let releaseId = null;
  const mRel = link.match(/release\/(\d+)/);
  const mMas = link.match(/master\/(\d+)/);

  if (mRel) {
    releaseId = mRel[1];
  } else if (mMas) {
    const rm = await fetchDg(`https://api.discogs.com/masters/${mMas[1]}`);
    if (rm.status === 404) return json({ error: "No encontramos ese disco en Discogs" }, 404);
    if (rm.status === 429) return err429();
    if (!rm.ok) return json({ error: "Discogs no respondió" }, 502);
    const master = await rm.json();
    releaseId = master.main_release;
    if (!releaseId) return json({ error: "Ese master no tiene una edición principal" }, 404);
  } else {
    return json({ error: "Pegá un link de Discogs de un disco (con /release/ o /master/ en la dirección)" }, 400);
  }

  const r = await fetchDg(`https://api.discogs.com/releases/${releaseId}`);
  if (r.status === 404) return json({ error: "No encontramos ese release en Discogs" }, 404);
  if (r.status === 429) return err429();
  if (!r.ok) return json({ error: "Discogs no respondió" }, 502);
  const d = await r.json();

  // Artista(s): Discogs agrega " (2)" para desambiguar — lo limpiamos
  const artist = (d.artists || [])
    .map((a) => a.name.replace(/\s\(\d+\)$/, ""))
    .join(d.artists?.[0]?.join === "," ? ", " : " & ") || "";

  // Sello + número de catálogo
  const label = d.labels?.[0]
    ? [d.labels[0].name.replace(/\s\(\d+\)$/, ""), d.labels[0].catno].filter((x) => x && x !== "none").join(" · ")
    : "";

  // Formato: mapear a las opciones del formulario (12", 2×12", 7", 10", LP, 2×LP)
  let format = '12"';
  const f = d.formats?.[0];
  if (f) {
    const qty = Number(f.qty || 1);
    const desc = (f.descriptions || []).join(" ");
    if (/LP/i.test(desc)) format = qty > 1 ? "2×LP" : "LP";
    else if (/7"/.test(desc)) format = '7"';
    else if (/10"/.test(desc)) format = '10"';
    else format = qty > 1 ? '2×12"' : '12"';
  }

  // Discogs guarda los videos de YouTube que la comunidad le asocio al disco.
  // Los aprovechamos: buscar el audio tema por tema es la parte mas tediosa de
  // publicar, y es la razon por la que muchos discos terminan mudos.
  const norm = (s) => (s || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();

  const videos = (d.videos || [])
    .filter((v) => v.uri && /youtu/.test(v.uri))
    .map((v) => ({ uri: v.uri, title: v.title || "", n: norm(v.title) }));

  const usados = new Set();
  const audioDe = (titulo) => {
    const t = norm(titulo);
    // Titulos como "A", "B2" o "Untitled" matchean con cualquier cosa
    if (t.length < 4) return "";
    // Entre todos los que contienen el titulo, el de nombre mas corto es el mas
    // ajustado: asi "Escape" no se queda con el video de "Escape (Dub Mix)".
    const i = videos.reduce((mej, v, idx) =>
      usados.has(idx) || !v.n.includes(t) ? mej
        : mej < 0 || v.n.length < videos[mej].n.length ? idx : mej, -1);
    if (i < 0) return "";
    usados.add(i);
    return videos[i].uri;
  };

  // Tracklist tal como esta en Discogs (sin encabezados de lado)
  const tracks = (d.tracklist || [])
    .filter((t) => t.type_ !== "heading" && t.title)
    .map((t) => ({
      position: t.position || "",
      title: t.title,
      duration: t.duration || "",
      audio_url: "",
    }));

  // Dos pasadas, y el orden importa. Primero el titulo tal cual, para que los
  // temas mas especificos se lleven su video. Recien despues probamos sin el
  // parentesis final: el tracklist dice "Tema (Radio Edit)" y el video de
  // Discogs suele decir solo "Tema", asi que sin esto quedaban mudos.
  tracks.forEach((t) => { t.audio_url = audioDe(t.title); });
  tracks.forEach((t) => {
    if (t.audio_url) return;
    const base = t.title.replace(/\s*\([^)]*\)\s*$/, "");
    if (base !== t.title) t.audio_url = audioDe(base);
  });

  return guardar(json({
    artist,
    title: d.title || "",
    label,
    year: d.year || null,
    format,
    country: d.country || null,
    genres: [...(d.styles || []), ...(d.genres || [])].slice(0, 3),
    discogs_url: d.uri || link,
    from_master: Boolean(mMas),
    tracks,
    // Videos del disco que no pudimos emparejar con ningun tema (suelen ser el
    // disco entero o un mix). Se los mostramos al vendedor por si quiere usarlos.
    videos_extra: videos
      .filter((_, i) => !usados.has(i))
      .map((v) => ({ uri: v.uri, title: v.title }))
      .slice(0, 6),
  }));
}

const json = (b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
