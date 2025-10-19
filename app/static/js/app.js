/* ===================== MINI-CRM Front (Light UI) ===================== */
/* One-file front: token utils, API wrapper, helpers, router, pages, UI */

// --------- TOKEN / PROFILE ----------
const TOKEN_KEY = "token";
const ME_KEY = "me";

function saveToken(t){ localStorage.setItem(TOKEN_KEY, t); }
function getToken(){ return localStorage.getItem(TOKEN_KEY); }
function clearToken(){ localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(ME_KEY); }

function saveMe(m){ localStorage.setItem(ME_KEY, JSON.stringify(m)); }
function getMe(){
  try { return JSON.parse(localStorage.getItem(ME_KEY) || "null"); }
  catch { return null; }
}

function redirectLogin(){ window.location.href = "/ui/login"; }
function showToast(msg){
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  setTimeout(() => el.hidden = true, 2200);
}

// --------- API WRAPPER ----------
async function api(path, { method="GET", body, auth=true, headers={} } = {}){
  const h = { "Content-Type": "application/json", ...headers };
  if (auth && getToken()) h["Authorization"] = "Bearer " + getToken();

  const res = await fetch(path, {
    method, headers: h,
    body: body ? JSON.stringify(body) : undefined
  });

  if (res.status === 401){
    clearToken();
    redirectLogin();
    throw new Error("Unauthorized");
  }

  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json")
    ? await res.json().catch(() => null)
    : await res.text().catch(() => "");

  if (!res.ok){
    const msg = data?.detail || res.statusText || "Ошибка";
    throw new Error(msg);
  }
  return data;
}

// --------- HELPERS ----------
function $(sel, root=document){ return root.querySelector(sel); }
function $all(sel, root=document){ return [...root.querySelectorAll(sel)]; }

function qparams(obj){
  const q = new URLSearchParams();
  for (const [k,v] of Object.entries(obj)){
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) v.forEach(x => q.append(k, x));
    else q.append(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

function isoOrNull(v){
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function formatDate(v){
  if (!v) return "—";
  try { return new Date(v).toLocaleString(); } catch { return v; }
}

function badge(status){
  const s = String(status || "").replace("-", "_");
  return `<span class="badge ${s}">${status}</span>`;
}

// --------- NAV STATE ----------
function syncNav(){
  const authed = Boolean(getToken());
  $all("[data-auth]").forEach(el => el.style.display = authed ? "" : "none");
  $all("[data-guest]").forEach(el => el.style.display = authed ? "none" : "");
}

function initLogout(){
  const btn = $("#logout-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    clearToken();
    syncNav();
    redirectLogin();
  });
}

// ================== PORTAL MENU (overlay over table) ==================
const PORTAL_ID = "__menu_portal__";

function ensurePortal(){
  let el = document.getElementById(PORTAL_ID);
  if (!el){
    el = document.createElement("div");
    el.id = PORTAL_ID;
    el.className = "menu";
    el.style.display = "none";
    document.body.appendChild(el);
  }
  return el;
}

/**
 * Opens a portal menu at button position.
 * @param {HTMLElement} btn anchor button
 * @param {Array<{value:string,label:string}>} items list
 * @param {(val:any, ctx:{final:boolean})=>void} onPick callback
 * @param {{multi?:boolean, selected?:string[]}} opts
 */
function openPortalMenu(btn, items, onPick, { multi=false, selected=[] } = {}){
  const menu = ensurePortal();
  // build content
  menu.innerHTML = items.map(it => {
    const act = selected.includes(it.value) ? " active" : "";
    return `<button class="menu-item${act}" data-value="${it.value}">${it.label}</button>`;
  }).join("");

  // place
  const r = btn.getBoundingClientRect(); // viewport coords (good for fixed)
  const left = Math.min(r.left, window.innerWidth - 220);
  const top  = r.bottom + 6;
  menu.style.left = left + "px";
  menu.style.top  = top + "px";
  menu.style.display = "block";
  menu.classList.add("open");

  const close = () => {
    menu.style.display = "none";
    menu.classList.remove("open");
    document.removeEventListener("click", onDoc, true);
    document.removeEventListener("keydown", onEsc, true);
    window.removeEventListener("resize", onWin, true);
    window.removeEventListener("scroll", onWin, true);
    menu.removeEventListener("click", onClick, true);
  };
  const onClick = (e) => {
    const t = e.target.closest(".menu-item");
    if (!t) return;
    const val = t.dataset.value;
    if (multi){
      if (selected.includes(val)) selected = selected.filter(x => x !== val);
      else selected.push(val);
      t.classList.toggle("active");
      onPick([...selected], { final:false });
    } else {
      onPick(val, { final:true });
      close();
    }
  };
  const onDoc = (e) => {
    if (e.target === btn || btn.contains(e.target) || menu.contains(e.target)) return;
    close();
  };
  const onEsc = (e) => { if (e.key === "Escape") close(); };
  const onWin = () => close();

  menu.addEventListener("click", onClick, true);
  setTimeout(() => {
    document.addEventListener("click", onDoc, true);
    document.addEventListener("keydown", onEsc, true);
    window.addEventListener("resize", onWin, true);
    window.addEventListener("scroll", onWin, true);
  }, 0);

  return () => close();
}

// ================== ROUTER ==================
document.addEventListener("DOMContentLoaded", async () => {
  syncNav();
  initLogout();

  const p = location.pathname;
  if (p === "/" || p === "/ui") initHome();
  else if (p.startsWith("/ui/login")) initLogin();
  else if (p.startsWith("/ui/register")) initRegister();
  else if (p.startsWith("/ui/tickets")) await initTickets();
});

// ================== HOME (Public Form) ==================
function initHome(){
  const form = $("#public-request-form");
  const msg  = $("#public-msg");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "Отправка...";
    const fd = new FormData(form);
    const payload = {
      title: fd.get("title"),
      description: fd.get("description") || null,
      scheduled_at: isoOrNull(fd.get("scheduled_at")),
      client: {
        name: fd.get("name"),
        phone: fd.get("phone") || null,
        email: fd.get("email") || null,
        comment: fd.get("comment") || null,
      }
    };
    try{
      await api("/tickets/public", { method:"POST", body: payload, auth:false });
      msg.textContent = "Заявка отправлена! Мы свяжемся с вами ✅";
      showToast("Готово!");
      form.reset();
    }catch(err){
      msg.textContent = err.message || "Ошибка";
    }
  });
}

// ================== LOGIN ==================
function initLogin(){
  const form = $("#login-form");
  const msg  = $("#login-msg");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "Входим...";
    const fd = new FormData(form);
    const body = { email: fd.get("email"), password: fd.get("password") };
    try{
      const data = await api("/auth/login", { method: "POST", body, auth:false });
      saveToken(data.access_token);
      syncNav();
      // подтянем профиль
      try {
        const me = await api("/auth/me");
        if (me) saveMe(me);
      } catch {}
      msg.textContent = "Готово! Перенаправляю...";
      setTimeout(() => location.href = "/ui/tickets", 350);
    }catch(err){
      msg.textContent = err.message || "Ошибка входа";
    }
  });
}

// ================== REGISTER ==================
function initRegister(){
  const form = $("#register-form");
  const msg  = $("#register-msg");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "Регистрируем...";
    const fd = new FormData(form);
    const email = fd.get("email");
    const password = fd.get("password");
    const password_confirm = fd.get("password_confirm");
    const role = fd.get("role");

    if (password.length < 8){ msg.textContent = "Пароль ≥ 8 символов"; return; }
    if (password !== password_confirm){ msg.textContent = "Пароли не совпадают"; return; }

    try{
      await api("/auth/register", {
        method: "POST",
        body: { email, password, password_confirm, role },
        auth: false
      });
      msg.textContent = "Успех! Теперь войдите.";
      showToast("Аккаунт создан");
      setTimeout(() => location.href = "/ui/login", 700);
    }catch(err){
      msg.textContent = err.message || "Ошибка регистрации";
    }
  });
}

// ================== TICKETS ==================
async function initTickets(){
  // защита страницы
  if (!getToken()){ redirectLogin(); return; }

  // текущий пользователь
  try {
    const me = await api("/auth/me");
    if (me) saveMe(me);
  } catch { /* api() сам редиректит на 401 */ }

  const user = getMe();

  // показать/скрыть секцию админа
  const adminPanel = $("#admin-panel");
  if (adminPanel) adminPanel.hidden = !(user && user.role === "admin");

  // --- Workers cache for assign menu
  let WORKERS = [];
  async function loadWorkers(){
    if (WORKERS.length) return WORKERS;
    try{
      const ures = await api("/users?page=1&page_size=200");
      WORKERS = (ures.items || []).filter(u => u.role === "worker");
    }catch{}
    return WORKERS;
  }

  // --- Saved filters in localStorage
  const FILTERS_KEY = "tickets_filters_v2";
  function loadFilters(){
    try { return JSON.parse(localStorage.getItem(FILTERS_KEY) || "{}"); }
    catch { return {}; }
  }
  function saveFilters(f){ localStorage.setItem(FILTERS_KEY, JSON.stringify(f)); }

  // --- elements
  const qInput = document.getElementById("q");
  const statusBtn = document.getElementById("statusBtn");
  const statusBtnText = document.getElementById("statusBtnText");
  const sizeBtn = document.getElementById("sizeBtn");
  const sizeBtnText = document.getElementById("sizeBtnText");
  const resetBtn = document.getElementById("resetFilters");

  const prevBtn = document.getElementById("prev");
  const nextBtn = document.getElementById("next");
  const reloadBtn = document.getElementById("reload");
  const pageInfo = document.getElementById("page-info");
  const tbody = document.getElementById("ticket-rows");

  // --- state
  let filters = Object.assign({ q:"", status:[], page:1, page_size:20 }, loadFilters());
  let currentPage = filters.page || 1;
  let DIRTY = {}; // { [id]: {status?, assignee_id?} }

  // --- apply UI from state
  if (qInput) qInput.value = filters.q || "";
  if (sizeBtnText) sizeBtnText.textContent = String(filters.page_size || 20);
  if (statusBtnText) statusBtnText.textContent =
    (filters.status && filters.status.length) ? filters.status.join(", ") : "Любые";

  // --- handlers: search
  qInput?.addEventListener("change", () => {
    filters.q = qInput.value.trim();
    filters.page = currentPage = 1;
    saveFilters(filters);
    loadTickets();
  });

  // --- handlers: statuses (multi)
  statusBtn?.addEventListener("click", () => {
    const items = [
      { value:"new", label:"new" },
      { value:"in_progress", label:"in_progress" },
      { value:"done", label:"done" },
      { value:"canceled", label:"canceled" },
    ];
    openPortalMenu(statusBtn, items, (vals, {final}) => {
      filters.status = vals;
      statusBtnText.textContent = (vals.length ? vals.join(", ") : "Любые");
      saveFilters(filters);
      if (final) loadTickets();
    }, { multi:true, selected:[...(filters.status || [])] });
  });

  // --- handlers: page size
  sizeBtn?.addEventListener("click", () => {
    const items = [{value:"10", label:"10"},{value:"20", label:"20"},{value:"50", label:"50"}];
    openPortalMenu(sizeBtn, items, (val) => {
      filters.page_size = Number(val);
      filters.page = currentPage = 1;
      sizeBtnText.textContent = val;
      saveFilters(filters);
      loadTickets();
    });
  });

  // --- reset filters
  resetBtn?.addEventListener("click", () => {
    filters = { q:"", status:[], page:1, page_size:20 };
    currentPage = 1;
    if (qInput) qInput.value = "";
    if (statusBtnText) statusBtnText.textContent = "Любые";
    if (sizeBtnText) sizeBtnText.textContent = "20";
    saveFilters(filters);
    loadTickets();
  });

  // --- load tickets
  async function loadTickets(){
    const params = {
      q: filters.q || undefined,
      page: currentPage,
      page_size: filters.page_size || 20,
    };
    if (filters.status && filters.status.length){
      params.status = filters.status; // list[...] ok
    }

    try{
      const data = await api("/tickets" + qparams(params));
      renderTickets(data);
    }catch(err){
      tbody.innerHTML = `<tr><td colspan="8" class="muted">Ошибка: ${err.message}</td></tr>`;
    }
  }

  function labelAssignee(aid){ return (aid ?? "Назначить"); }

  function renderTickets(data){
    const items = data?.items || [];
    if (!items.length){
      tbody.innerHTML = `<tr><td colspan="8" class="muted">Пусто</td></tr>`;
      if (pageInfo) pageInfo.textContent = `Стр. ${data.page} • всего ${data.total}`;
      return;
    }

    tbody.innerHTML = items.map(t => {
      const dirty = DIRTY[t.id] || {};
      const statusNow = dirty.status || t.status;
      const assigneeNow = (dirty.assignee_id !== undefined ? dirty.assignee_id : t.assignee_id);

      return `
        <tr data-id="${t.id}" class="${DIRTY[t.id] ? "row-dirty" : ""}">
          <td>${t.id}</td>
          <td class="clip" title="${t.description || ""}">${t.title}</td>
          <td>
            <button class="btn-chip row-status" data-id="${t.id}">
              ${statusNow}
              <svg class="i caret" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="1.6"/></svg>
            </button>
          </td>
          <td>${t.client_id ?? "—"}</td>
          <td>
            <button class="btn-chip row-assignee" data-id="${t.id}">
              ${labelAssignee(assigneeNow)}
              <svg class="i caret" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="1.6"/></svg>
            </button>
          </td>
          <td>${formatDate(t.scheduled_at)}</td>
          <td>${formatDate(t.created_at)}</td>
          <td>
            <button class="btn btn-primary row-save" data-id="${t.id}" ${DIRTY[t.id] ? "" : "disabled"}>Сохранить</button>
          </td>
        </tr>
      `;
    }).join("");

    if (pageInfo) pageInfo.textContent = `Стр. ${data.page} • всего ${data.total}`;

    // row menu handlers
    $all(".row-status", tbody).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = Number(btn.dataset.id);
        const items = [
          { value:"new", label:"new" },
          { value:"in_progress", label:"in_progress" },
          { value:"done", label:"done" },
          { value:"canceled", label:"canceled" },
        ];
        const current = (DIRTY[id]?.status) || items[0].value;
        openPortalMenu(btn, items, (val) => {
          DIRTY[id] = { ...(DIRTY[id] || {}), status: val };
          markDirtyRow(id);
        }, { multi:false, selected:[(DIRTY[id]?.status) || current] });
      });
    });

    $all(".row-assignee", tbody).forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = Number(btn.dataset.id);
        const workers = await loadWorkers();
        const items = [{ value:"", label:"(не назначать)" }].concat(
          workers.map(w => ({ value:String(w.id), label:`${w.id} — ${w.email}` }))
        );
        const current = (DIRTY[id]?.assignee_id ?? "").toString();
        openPortalMenu(btn, items, (val) => {
          const v = val ? Number(val) : null;
          DIRTY[id] = { ...(DIRTY[id] || {}), assignee_id: v };
          markDirtyRow(id);
        }, { multi:false, selected:[current] });
      });
    });

    $all(".row-save", tbody).forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = Number(btn.dataset.id);
        if (!DIRTY[id]) return;
        btn.disabled = true; btn.textContent = "...";
        try{
          const payload = {};
          if ("status" in DIRTY[id]) payload.status = DIRTY[id].status;
          if ("assignee_id" in DIRTY[id]) payload.assignee_id = DIRTY[id].assignee_id;
          await api(`/tickets/${id}`, { method:"PATCH", body: payload });
          delete DIRTY[id];
          showToast("Сохранено");
          await loadTickets();
        }catch(err){
          btn.disabled = false; btn.textContent = "Сохранить";
          alert(err.message || "Ошибка");
        }
      });
    });

    function markDirtyRow(id){
      const tr = tbody.querySelector(`tr[data-id="${id}"]`);
      if (!tr) return;
      tr.classList.add("row-dirty");
      const save = tr.querySelector(".row-save");
      if (save) save.disabled = false;

      // refresh button labels
      if (DIRTY[id]?.status){
        const stBtn = tr.querySelector(".row-status");
        if (stBtn) stBtn.firstChild.nodeValue = DIRTY[id].status + " ";
      }
      if ("assignee_id" in (DIRTY[id] || {})){
        const aBtn = tr.querySelector(".row-assignee");
        if (aBtn) aBtn.firstChild.nodeValue = (DIRTY[id].assignee_id ?? "Назначить") + " ";
      }
    }
  }

  // --- pagination & reload
  prevBtn?.addEventListener("click", () => {
    if (currentPage > 1){
      currentPage--;
      filters.page = currentPage;
      saveFilters(filters);
      loadTickets();
    }
  });
  nextBtn?.addEventListener("click", () => {
    currentPage++;
    filters.page = currentPage;
    saveFilters(filters);
    loadTickets();
  });
  reloadBtn?.addEventListener("click", loadTickets);

  // --- admin create ticket
  const createForm = $("#new-ticket-form");
  const createMsg  = $("#create-msg");
  if (createForm && user && user.role === "admin"){
    // prefill worker select
    (async () => {
      const sel = $("#assignee_id");
      if (!sel) return;
      try{
        const workers = await loadWorkers();
        workers.forEach(w => {
          const opt = document.createElement("option");
          opt.value = String(w.id);
          opt.textContent = `${w.id} — ${w.email}`;
          sel.appendChild(opt);
        });
      }catch{}
    })();

    createForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      createMsg.textContent = "Создаём...";
      const fd = new FormData(createForm);
      const body = {
        title: fd.get("title"),
        description: fd.get("description") || null,
        client_id: Number(fd.get("client_id")),
        assignee_id: fd.get("assignee_id") ? Number(fd.get("assignee_id")) : null,
        scheduled_at: isoOrNull(fd.get("scheduled_at")),
      };
      try{
        await api("/tickets", { method:"POST", body });
        createMsg.textContent = "Создано ✅";
        showToast("Тикет создан");
        createForm.reset();
        loadTickets();
      }catch(err){
        createMsg.textContent = err.message || "Ошибка";
      }
    });
  }

  // initial
  loadTickets();
}
