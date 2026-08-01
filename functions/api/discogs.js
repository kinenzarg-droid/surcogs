// Cloudflare Pages Function — trae los datos de un release de Discogs
// para autocompletar el formulario de publicación.
// Acepta links tipo: https://www.discogs.com/release/1234567-Artista-Titulo
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const link = url.searchParams.get("url") || "";

  // Extraer el ID del release del link
  const m = link.match(/release\/(\d+)/);
  if (!m) {
    return json({ error: "Pegá un link de un release de Discogs (tiene que contener /release/...)" }, 400);
  }
  const releaseId = m[1];

  const headers = {
    "User-Agent": "SURCOGS/1.0 +https://surcogs.com.ar",
    Accept: "application/json",
  };
  if (env.DISCOGS_TOKEN) headers.Authorization = `Discogs token=${env.DISCOGS_TOKEN}`;

  const r = await fetch(`https://api.discogs.com/releases/${releaseId}`, { headers });
  if (r.status === 404) return json({ error: "No encontramos ese release en Discogs" }, 404);
  if (r.status === 429) return json({ error: "Discogs está limitando las consultas. Esperá un minuto y probá de nuevo." }, 429);
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
  });
}

const json = (b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
