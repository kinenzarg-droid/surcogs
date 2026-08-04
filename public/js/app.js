// SURCOGS — módulo compartido
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.SURCOGS_CONFIG;
export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const GRADOS = ["M", "NM", "VG+", "VG", "G+", "G"];

// Zonas y localidades para perfiles y discos
export const ZONAS = {
  "CABA": ["Almagro", "Balvanera", "Belgrano", "Boedo", "Caballito", "Chacarita", "Colegiales",
    "Flores", "Floresta", "La Boca", "Liniers", "Mataderos", "Monserrat", "Núñez", "Palermo",
    "Parque Patricios", "Paternal", "Recoleta", "Retiro", "Saavedra", "San Cristóbal", "San Telmo",
    "Villa Crespo", "Villa Devoto", "Villa del Parque", "Villa Urquiza", "Otro barrio"],
  "GBA Norte": ["Vicente López", "San Isidro", "San Fernando", "Tigre", "San Martín", "San Miguel",
    "José C. Paz", "Malvinas Argentinas", "Escobar", "Pilar", "Otra localidad"],
  "GBA Oeste": ["La Matanza", "Morón", "Hurlingham", "Ituzaingó", "Tres de Febrero", "Merlo",
    "Moreno", "General Rodríguez", "Marcos Paz", "Otra localidad"],
  "GBA Sur": ["Avellaneda", "Lanús", "Lomas de Zamora", "Quilmes", "Berazategui",
    "Florencio Varela", "Almirante Brown", "Esteban Echeverría", "Ezeiza", "Otra localidad"],
  "La Plata y alrededores": ["La Plata", "Berisso", "Ensenada", "City Bell / Gonnet", "Otra localidad"],
  "Interior del país": ["Córdoba", "Rosario / Santa Fe", "Mendoza", "Tucumán", "Entre Ríos",
    "Neuquén", "Río Negro", "Salta", "Corrientes", "Misiones", "Mar del Plata", "Bahía Blanca",
    "Otra provincia"],
};

// Llena dos <select> encadenados (zona → localidad). Reusable en registro, cuenta y publicar.
export function zonaSelector(selZona, selLoc, zonaVal = "", locVal = "") {
  selZona.innerHTML = `<option value="">Elegí tu zona…</option>` +
    Object.keys(ZONAS).map(z => `<option ${z === zonaVal ? "selected" : ""}>${z}</option>`).join("");
  const llenar = (loc) => {
    const locs = ZONAS[selZona.value] || [];
    selLoc.innerHTML = `<option value="">Localidad / barrio…</option>` +
      locs.map(l => `<option ${l === loc ? "selected" : ""}>${l}</option>`).join("");
    selLoc.disabled = !locs.length;
  };
  selZona.onchange = () => llenar("");
  llenar(locVal);
}
export const ADMIN_ID = window.SURCOGS_CONFIG.ADMIN_ID || null;

export const fmtPrecio = (n) => "$" + Number(n).toLocaleString("es-AR");

// El precio guardado (records.price) es lo que RECIBE el vendedor.
// El comprador ve el precio con comisiones incluidas.
// Debe coincidir con functions/api/create-preference.js
export const RESERVA_MP = 0.08;      // reserva para Mercado Pago (con colchón)
export const TASA_SURCOGS = 0.10;
export const precioComprador = (neto) =>
  Math.round(Number(neto) / (1 - RESERVA_MP - TASA_SURCOGS));

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
  let iniciales = "";
  if (user) {
    const perfil = await getPerfil(user.id);
    iniciales = (perfil?.name || "")
      .trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase() || "YO";
  }
  const el = document.getElementById("header");
  el.innerHTML = `
    <header class="hdr">
      <a class="logo" href="/"><span class="vinilo"></span>SUR<span class="lg-acc">COGS</span></a>
      <nav>
        <a href="/" class="${activo === "inicio" ? "on" : ""}">Inicio</a>
        <a href="/catalogo.html" class="${activo === "catalogo" ? "on" : ""}">Catálogo</a>
        <a href="${user ? "/perfil.html?id=" + user.id : "/cuenta.html"}">Mi colección</a>
      </nav>
      <div class="search">
        <input id="hdr-q" type="search" placeholder="Buscar artista, disco o sello" autocomplete="off">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>
        <div class="search-dd" id="hdr-dd"></div>
      </div>
      <a class="btn-cta" href="/publicar.html">Vender gratis</a>
      <div class="hdr-links">
        ${user ? `
          <div class="avatar-wrap">
            <button class="avatar" id="avatar-btn" title="Menú">${iniciales}</button>
            <div class="avatar-menu" id="avatar-menu">
              <a href="/perfil.html?id=${user.id}" class="only-mobile">Mi colección</a>
              <a href="/cuenta.html">Mi cuenta</a>
              <a href="#" class="salir" id="btn-salir">Salir</a>
            </div>
          </div>` : `<a href="/cuenta.html">Ingresar</a>`}
      </div>
    </header>`;

  // Menú del avatar
  if (user) {
    const menu = document.getElementById("avatar-menu");
    document.getElementById("avatar-btn").onclick = (e) => {
      e.stopPropagation();
      menu.style.display = menu.style.display === "block" ? "none" : "block";
    };
    document.addEventListener("click", () => { menu.style.display = "none"; });
    document.getElementById("btn-salir").onclick = async (e) => {
      e.preventDefault();
      await sb.auth.signOut();
      location.href = "/";
    };
  }

  // Búsqueda global: Enter → catálogo con el término
  const q = document.getElementById("hdr-q");
  const dd = document.getElementById("hdr-dd");
  q.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && q.value.trim()) {
      location.href = "/catalogo.html?q=" + encodeURIComponent(q.value.trim());
    }
    if (e.key === "Escape") dd.style.display = "none";
  });

  // Autocompletado con miniaturas mientras tipeás
  let ddTimer;
  q.addEventListener("input", () => {
    clearTimeout(ddTimer);
    const term = q.value.trim().replace(/[,()]/g, " ");
    if (term.length < 2) { dd.style.display = "none"; return; }
    ddTimer = setTimeout(async () => {
      const { data } = await sb.from("records")
        .select("id, artist, title, label, photos, status")
        .or(`artist.ilike.%${term}%,title.ilike.%${term}%,label.ilike.%${term}%`)
        .neq("status", "vendido")
        .limit(6);
      if (!data || !data.length) {
        dd.innerHTML = `<div class="sd-empty">Sin resultados para "${term.replace(/</g, "&lt;")}"</div>`;
        dd.style.display = "block";
        return;
      }
      dd.innerHTML = data.map(r => `
        <a href="/disco.html?id=${r.id}">
          <img src="${fotoPrincipal(r)}" alt="">
          <div>
            <div class="sd-t">${r.title.replace(/</g, "&lt;")}</div>
            <div class="sd-a">${r.artist.replace(/</g, "&lt;")}${r.label ? " · " + r.label.replace(/</g, "&lt;") : ""}</div>
          </div>
        </a>`).join("");
      dd.style.display = "block";
    }, 250);
  });

  // Cerrar el desplegable al hacer clic afuera
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search")) dd.style.display = "none";
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
