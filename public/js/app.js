// SURCOGS — módulo compartido
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.SURCOGS_CONFIG;
export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const GRADOS = ["M", "NM", "VG+", "VG", "G+", "G"];

export const fmtPrecio = (n) => "$" + Number(n).toLocaleString("es-AR");

// El precio guardado (records.price) es lo que RECIBE el vendedor.
// El comprador ve el precio con comisiones incluidas.
export const TASA_MP = 0.0761;       // estimado Checkout Pro liberación inmediata (6,29% + IVA)
export const TASA_SURCOGS = 0.10;
export const precioComprador = (neto) =>
  Math.round(Number(neto) / (1 - TASA_MP - TASA_SURCOGS));

export async function getUser() {
  const { data } = await sb.auth.getUser();
  return data.user || null;
}

export async function getPerfil(userId) {
  const { data } = await sb.from("profiles").select("*").eq("id", userId).maybeSingle();
  return data;
}

// Header compartido — estilo SoundCloud
export async function renderHeader(activo) {
  const user = await getUser();
  const el = document.getElementById("header");
  el.innerHTML = `
    <header class="hdr">
      <a class="logo" href="/"><span class="vinilo"></span>SUR<span class="lg-acc">COGS</span></a>
      <nav>
        <a href="/" class="${activo === "catalogo" ? "on" : ""}">Inicio</a>
        <a href="/#catalogo">Catálogo</a>
        <a href="${user ? "/perfil.html?id=" + user.id : "/cuenta.html"}">Mi colección</a>
      </nav>
      <div class="search">
        <input id="hdr-q" type="search" placeholder="Buscar artista, disco o sello">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>
      </div>
      <a class="btn-cta" href="/publicar.html">Vender gratis</a>
      <div class="hdr-links">
        <a href="/cuenta.html">${user ? "Mi cuenta" : "Ingresar"}</a>
        ${user ? `<a class="avatar" href="/perfil.html?id=${user.id}" title="Mi perfil"></a>` : ""}
      </div>
    </header>`;

  // Búsqueda global: Enter → catálogo con el término
  const q = document.getElementById("hdr-q");
  q.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && q.value.trim()) {
      location.href = "/?q=" + encodeURIComponent(q.value.trim()) + "#catalogo";
    }
  });
}

export function youtubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}

export function fotoPrincipal(rec) {
  return rec.photos && rec.photos.length
    ? rec.photos[0]
    : "data:image/svg+xml," + encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><rect width='400' height='400' fill='#1a1a1a'/><circle cx='200' cy='200' r='140' fill='#111' stroke='#333' stroke-width='2'/><circle cx='200' cy='200' r='45' fill='#222'/><circle cx='200' cy='200' r='6' fill='#0a0a0a'/></svg>`);
}

// Reputación: promedio de estrellas de un vendedor, estilo "★★★★★ 100.0%, 79 valoraciones"
export async function reputacionHTML(sellerId) {
  const { data } = await sb.from("ratings").select("stars").eq("seller_id", sellerId);
  if (!data || !data.length) return `<span class="hint">Vendedor nuevo, sin valoraciones todavía</span>`;
  const avg = data.reduce((a, r) => a + r.stars, 0) / data.length;
  const full = Math.round(avg);
  return `<span class="stars">${"★".repeat(full)}${"☆".repeat(5 - full)}</span>
    <b>${((avg / 5) * 100).toFixed(1)}%</b>, ${data.length} valoraci${data.length === 1 ? "ón" : "ones"}`;
}

export function toast(msg, err = false) {
  let t = document.createElement("div");
  t.className = "toast" + (err ? " err" : "");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}
