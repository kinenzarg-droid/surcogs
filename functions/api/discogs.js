// Cloudflare Pages Function — trae los datos de un disco de Discogs
// para autocompletar el formulario de publicación.
// Acepta links de release (edición concreta) y de master (usa la edición principal):
//   https://www.discogs.com/release/1234567-Artista-Titulo
//   https://www.discogs.com/es/master/531487-Artista-Titulo
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const link = url.searchParams.get("url") || "";

  const headers = {
    "User-Agent": "SURCOGS/1.0 +https://surcogs.com.ar",
    Accept: "application/json",
  };
  const conToken = Boolean(env.DISCOGS_TOKEN);
  if (conToken) headers.Authorization = `Discogs token=${env.DISCOGS_TOKEN}`;

  // Discogs a veces devuelve 429 aislados: reintentar una vez tras una pausa
  const fetchDg = async (u) => {
    let r = await fetch(u, { headers });
    if (r.status === 429) {
      await new Promise((res) => setTimeout(res, 1500));
      r = await fetch(u, { headers });
    }
    return r;
  };
  const err429 = () => json({
    error: `Discogs está limitando las consultas${conToken ? "" : " (token no configurado)"}. Esperá un minuto y probá de nuevo.`,
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

  return json({
    artist,
    title: d.title || "",
    label,
    year: d.year || null,
    format,
    country: d.country || null,
    genres: [...(d.styles || []), ...(d.genres || [])].slice(0, 3),
    discogs_url: d.uri || link,
    from_master: Boolean(mMas),
    // Tracklist tal como está en Discogs (sin encabezados de lado)
    tracks: (d.tracklist || [])
      .filter((t) => t.type_ !== "heading" && t.title)
      .map((t) => ({
        position: t.position || "",
        title: t.title,
        duration: t.duration || "",
      })),
  });
}

const json = (b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
