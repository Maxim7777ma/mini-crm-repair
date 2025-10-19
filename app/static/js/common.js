/* ============ common.js (shared across pages) ============ */

// ---- TOKEN / PROFILE ----
const TOKEN_KEY = "token";
const ME_KEY = "me";

function saveToken(t){ localStorage.setItem(TOKEN_KEY, t); }
function getToken(){ return localStorage.getItem(TOKEN_KEY); }
function clearToken(){ localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(ME_KEY); }

function saveMe(m){ localStorage.setItem(ME_KEY, JSON.stringify(m)); }
function getMe(){ try { return JSON.parse(localStorage.getItem(ME_KEY)||"null"); } catch { return null; } }

function redirectLogin(){ window.location.href = "/ui/login"; }

// ---- TOAST ----
function showToast(msg){
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  setTimeout(() => el.hidden = true, 2200);
}

// ---- API WRAPPER ----
async function api(path, { method="GET", body, auth=true, headers={} } = {}){
  const h = { "Content-Type":"application/json", ...headers };
  if (auth && getToken()) h["Authorization"] = "Bearer " + getToken();

  const res = await fetch(path, { method, headers:h, body: body ? JSON.stringify(body) : undefined });

  if (res.status === 401){
    clearToken();
    redirectLogin();
    throw new Error("Unauthorized");
  }

  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json().catch(()=>null) : await res.text();

  if (!res.ok){
    const msg = data?.detail || res.statusText || "Ошибка";
    throw new Error(msg);
  }
  return data;
}

// ---- HELPERS ----
function $(sel, root=document){ return root.querySelector(sel); }
function $all(sel, root=document){ return [...root.querySelectorAll(sel)]; }

function qparams(obj){
  const q = new URLSearchParams();
  for (const [k,v] of Object.entries(obj)){
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) v.forEach(x => q.append(k, x)); else q.append(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

function isoOrNull(v){
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function formatDate(v){ if (!v) return "—"; try { return new Date(v).toLocaleString(); } catch { return v; } }
function badge(status){ const s = String(status||"").replace("-", "_"); return `<span class="badge ${s}">${status}</span>`; }

// ---- NAV STATE ----
function syncNav(){
  const authed = Boolean(getToken());
  const me = getMe();
  const isAdmin = me?.role === "admin";

  // auth/guest
  $all("[data-auth]").forEach(el => el.style.display = authed ? "" : "none");
  $all("[data-guest]").forEach(el => el.style.display = authed ? "none" : "");

  // admin-only
  $all("[data-admin]").forEach(el => el.style.display = isAdmin ? "" : "none");
}

function initLogout(){
  const desktop = $("#logout-btn");
  const mobile  = $("#logout-btn-mobile");
  const doLogout = () => {
    closeMobileNav(); // вдруг открыто
    clearToken();
    syncNav();
    redirectLogin();
  };
  desktop?.addEventListener("click", doLogout);
  mobile?.addEventListener("click", doLogout);
}

// ---- Fetch me once (чтобы работал data-admin в хедере на любой странице) ----
async function initAuth(){
  // первая отрисовка по тому, что уже есть
  syncNav();

  if (getToken() && !getMe()){
    try { const me = await api("/auth/me"); if (me) saveMe(me); } catch {}
  }
  // вторая отрисовка — после запроса
  syncNav();
}

// ---- PORTAL MENU (всегда поверх таблицы) ----
const PORTAL_ID = "__menu_portal__";
function ensurePortal(){
  let el = document.getElementById(PORTAL_ID);
  if (!el){
    el = document.createElement("div");
    el.id = PORTAL_ID;
    el.className = "menu";
    el.style.display = "none";
    el.style.position = "fixed";
    el.style.zIndex = "9999";
    document.body.appendChild(el);
  }
  return el;
}
/**
 * @param {HTMLElement} btn
 * @param {{value:string,label:string}[]} items
 * @param {(val:any, ctx:{final:boolean})=>void} onPick
 * @param {{multi?:boolean, selected?:string[]}} opts
 */
function openPortalMenu(btn, items, onPick, { multi=false, selected=[] } = {}){
  const menu = ensurePortal();
  menu.innerHTML = items.map(it => {
    const act = selected.includes(it.value) ? " active" : "";
    return `<button class="menu-item${act}" data-value="${it.value}">${it.label}</button>`;
  }).join("");

  const r = btn.getBoundingClientRect();
  const left = Math.min(r.left, window.innerWidth - 220);
  const top  = r.bottom + 6;
  Object.assign(menu.style, { left:left+"px", top:top+"px", display:"block" });
  menu.classList.add("open");

  const close = () => {
    menu.style.display = "none"; menu.classList.remove("open");
    document.removeEventListener("click", onDoc, true);
    document.removeEventListener("keydown", onEsc, true);
    window.removeEventListener("resize", onWin, true);
    window.removeEventListener("scroll", onWin, true);
    menu.removeEventListener("click", onClick, true);
  };
  const onClick = (e) => {
    const t = e.target.closest(".menu-item"); if (!t) return;
    const val = t.dataset.value;
    if (multi){
      if (selected.includes(val)) selected = selected.filter(x => x !== val); else selected.push(val);
      t.classList.toggle("active");
      onPick([...selected], { final:false });
    } else {
      onPick(val, { final:true }); close();
    }
  };
  const onDoc = (e) => { if (e.target===btn || btn.contains(e.target) || menu.contains(e.target)) return; close(); };
  const onEsc = (e) => { if (e.key==="Escape") close(); };
  const onWin = () => close();

  menu.addEventListener("click", onClick, true);
  setTimeout(() => {
    document.addEventListener("click", onDoc, true);
    document.addEventListener("keydown", onEsc, true);
    window.addEventListener("resize", onWin, true);
    window.addEventListener("scroll", onWin, true);
  }, 0);
}

// ---- Mobile nav (burger) ----
function openMobileNav(){
  const burger   = $("#nav-burger");
  const drawer   = $("#mobile-menu");
  const backdrop = $("#mobile-backdrop");
  if (!drawer || !backdrop || !burger) return;

  drawer.hidden = false;
  backdrop.hidden = false;
  requestAnimationFrame(() => {
    drawer.classList.add("open");
    burger.setAttribute("aria-expanded", "true");
    document.body.classList.add("no-scroll");
  });
}
function closeMobileNav(){
  const burger   = $("#nav-burger");
  const drawer   = $("#mobile-menu");
  const backdrop = $("#mobile-backdrop");
  if (!drawer || !backdrop || !burger) return;

  drawer.classList.remove("open");
  burger.setAttribute("aria-expanded", "false");
  document.body.classList.remove("no-scroll");

  // подождём окончание анимации
  setTimeout(() => {
    drawer.hidden = true;
    backdrop.hidden = true;
  }, 180);
}
function initMobileNav(){
  const burger   = $("#nav-burger");
  const drawer   = $("#mobile-menu");
  const backdrop = $("#mobile-backdrop");
  if (!burger || !drawer || !backdrop) return;

  burger.addEventListener("click", () => {
    const expanded = burger.getAttribute("aria-expanded") === "true";
    expanded ? closeMobileNav() : openMobileNav();
  });
  backdrop.addEventListener("click", closeMobileNav);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMobileNav();
  });
  // если расширили экран — закроем
  window.addEventListener("resize", () => {
    if (window.innerWidth > 600) closeMobileNav();
  });
}

// ---- expose to other files ----
window.saveToken = saveToken;
window.getToken = getToken;
window.clearToken = clearToken;
window.saveMe = saveMe;
window.getMe = getMe;
window.redirectLogin = redirectLogin;
window.showToast = showToast;
window.api = api;
window.$ = $; window.$all = $all;
window.qparams = qparams;
window.isoOrNull = isoOrNull;
window.formatDate = formatDate;
window.badge = badge;
window.syncNav = syncNav;
window.initLogout = initLogout;
window.openPortalMenu = openPortalMenu;
window.openMobileNav = openMobileNav;
window.closeMobileNav = closeMobileNav;

// ---- базовая инициализация: auth, навигация, бургер ----
document.addEventListener("DOMContentLoaded", () => {
  initAuth();      // подтянет /auth/me (если нужно) и обновит видимость admin-кнопок
  initLogout();    // и десктоп, и мобильный logout
  initMobileNav(); // бургер
});
