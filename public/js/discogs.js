// Trae los datos de un disco desde Discogs, pero desde el navegador del
// vendedor y no desde nuestro servidor.
//
// Por qué: las funciones de Cloudflare salen a internet por direcciones IP
// compartidas con miles de sitios, y Discogs cuenta el consumo de todos juntos.
// Resultado: la cuota aparecía siempre agotada (74 a 95 consultas por minuto
// sobre un límite de 60) aunque nadie estuviera usando SURCOGS.
//
// Desde el navegador, cada vendedor usa su propia conexión y su propia cuota,
// que sin token es de 25 consultas por minuto. Para cargar discos de a uno es
// muchísimo. Y de paso dejamos de exponer el token, porque no hace falta.

const API = "https://api.discogs.com";

// Discogs agrega " (2)" al final del nombre cuando hay artistas homónimos.
const limpiarNombre = (s) => String(s || "").replace(/\s\(\d+\)$/, "");

const norm = (s) => (s || "").toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, " ").trim();

function armarArtista(d) {
  const nombres = (d.artists || []).map((a) => limpiarNombre(a.name));
  if (!nombres.length) return "";
  // Discogs marca en "join" si los artistas van con coma o con &
  const separador = d.artists?.[0]?.join === "," ? ", " : " & ";
  return nombres.join(separador);
}

function armarSello(d) {
  const l = d.labels?.[0];
  if (!l) return "";
  return [limpiarNombre(l.name), l.catno]
    .filter((x) => x && x !== "none")
    .join(" · ");
}

// Mapear al puñado de opciones que tiene el formulario.
function armarFormato(d) {
  const f = d.formats?.[0];
  if (!f) return '12"';
  const cantidad = Number(f.qty || 1);
  const desc = (f.descriptions || []).join(" ");
  if (/LP/i.test(desc)) return cantidad > 1 ? "2×LP" : "LP";
  if (/7"/.test(desc)) return '7"';
  if (/10"/.test(desc)) return '10"';
  return cantidad > 1 ? '2×12"' : '12"';
}

// Empareja cada tema con el video de YouTube que la comunidad de Discogs le
// asoció al disco. Es la parte más tediosa de publicar y la razón por la que
// muchos discos terminan mudos.
function emparejarAudio(d) {
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

  const extra = videos
    .filter((_, i) => !usados.has(i))
    .map((v) => ({ uri: v.uri, title: v.title }))
    .slice(0, 6);

  return { tracks, videos_extra: extra };
}

async function pedir(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (r.status === 404) throw new Error("No encontré ese disco en Discogs");
  if (r.status === 429) throw new Error("Discogs está limitando las consultas. Esperá un minuto.");
  if (!r.ok) throw new Error("Discogs no respondió (" + r.status + ")");
  return r.json();
}

// Acepta links de release (edición concreta) y de master (usa la principal).
export async function traerDeDiscogs(link) {
  const mRel = String(link).match(/release\/(\d+)/);
  const mMas = String(link).match(/master\/(\d+)/);

  let releaseId = null;
  if (mRel) {
    releaseId = mRel[1];
  } else if (mMas) {
    const master = await pedir(`${API}/masters/${mMas[1]}`);
    releaseId = master.main_release;
    if (!releaseId) throw new Error("Ese master no tiene una edición principal");
  } else {
    throw new Error("Pegá un link de Discogs de un disco (con /release/ o /master/)");
  }

  const d = await pedir(`${API}/releases/${releaseId}`);
  const { tracks, videos_extra } = emparejarAudio(d);

  return {
    artist: armarArtista(d),
    title: d.title || "",
    label: armarSello(d),
    year: d.year || null,
    format: armarFormato(d),
    country: d.country || null,
    genres: [...(d.styles || []), ...(d.genres || [])].slice(0, 3),
    discogs_url: d.uri || link,
    from_master: Boolean(mMas),
    tracks,
    videos_extra,
  };
}
