// =============== Users/Clients page (admin) ===============
document.addEventListener("DOMContentLoaded", async () => {
  if (!getToken()) { redirectLogin(); return; }
  syncNav(); initLogout();

  // Проверка роли
  try { const me = await api("/auth/me"); if (me) saveMe(me); } catch {}
  const user = getMe();
  if (!user || user.role !== "admin") {
    const msg = document.getElementById("users-msg");
    if (msg) msg.textContent = "Доступ только для администраторов.";
    showToast("Доступ только для админов");
    return;
  }

  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);

  // Впрыснем стиль и разметку модалки один раз
  function ensureUserEditModal() {
    if (document.getElementById("ue-overlay")) return;

    const style = document.createElement("style");
    style.textContent = `
      .ue-overlay{position:fixed;inset:0;background:rgba(15,23,42,.4);backdrop-filter:saturate(120%) blur(2px);display:none;align-items:center;justify-content:center;z-index:1000}
      .ue-overlay.show{display:flex}
      .ue-modal{width:min(560px,92vw);background:#fff;border-radius:16px;box-shadow:0 30px 60px rgba(2,6,23,.2);padding:18px}
      .ue-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
      .ue-title{font-size:18px;font-weight:600}
      .ue-close{appearance:none;background:transparent;border:0;padding:6px 10px;cursor:pointer}
      .ue-grid{display:grid;grid-template-columns:1fr;gap:12px}
      .ue-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      @media (max-width:640px){.ue-row{grid-template-columns:1fr}}
      .ue-actions{display:flex;align-items:center;gap:10px;justify-content:flex-end;margin-top:12px}
      .ue-muted{color:#6b7280;font-size:12.5px}
      .ue-error{color:#dc2626;font-size:13px;display:none}
      .ue-error.show{display:block}
    `;
    document.head.appendChild(style);

    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <div id="ue-overlay" class="ue-overlay" role="dialog" aria-modal="true" aria-labelledby="ue-title">
        <div class="ue-modal">
          <div class="ue-head">
            <div class="ue-title" id="ue-title">Редактирование пользователя</div>
            <button class="ue-close" id="ue-close" aria-label="Закрыть">&times;</button>
          </div>

          <form id="ue-form" class="ue-grid">
            <input type="hidden" name="id" />

            <label>Email
              <input class="input" type="email" name="email" placeholder="user@example.com" />
            </label>

            <div class="ue-row">
              <label>Пароль (если нужно сменить)
                <input class="input" type="password" name="password" minlength="8" placeholder="минимум 8 символов" />
              </label>

              <label>Роль
                <div class="menu-wrap inline" style="display:block">
                  <button type="button" id="ue-role-btn" class="btn menu-btn" style="width:100%">
                    <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>
                    <span id="ue-role-text">worker</span>
                  </button>
                </div>
                <input type="hidden" name="role" value="worker" />
              </label>
            </div>

            <div class="ue-muted">Оставь поле пароля пустым, если менять не нужно.</div>
            <div id="ue-err" class="ue-error"></div>

            <div class="ue-actions">
              <button type="button" class="btn" id="ue-cancel">Отмена</button>
              <button type="submit" class="btn btn-primary">Сохранить</button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.body.appendChild(wrap.firstElementChild);
  }
  ensureUserEditModal();

  // ---------- Tabs (Users / Clients)
  const switchEl   = $("#entity-switch");
  const optUsers   = switchEl?.querySelector('[data-tab="users"]');
  const optClients = switchEl?.querySelector('[data-tab="clients"]');

  const paneUsers   = $("#panel-users");
  const paneClients = $("#panel-clients");

  const TAB_KEY = "uc_tab_v1";

  function applyTabToUI(t){
    if (t === "clients"){
      switchEl?.classList.add("is-clients");
      optUsers?.setAttribute("aria-selected", "false");
      optClients?.setAttribute("aria-selected", "true");
      paneUsers.hidden   = true;
      paneClients.hidden = false;
      $(".users-only")?.classList.add("hidden");
    } else {
      switchEl?.classList.remove("is-clients");
      optUsers?.setAttribute("aria-selected", "true");
      optClients?.setAttribute("aria-selected", "false");
      paneUsers.hidden   = false;
      paneClients.hidden = true;
      $(".users-only")?.classList.remove("hidden");
    }
  }
  function setTab(t){
    localStorage.setItem(TAB_KEY, t);
    applyTabToUI(t);
    if (typeof loadUsers === "function" && t === "users")   loadUsers();
    if (typeof loadClients === "function" && t === "clients") loadClients();
  }
  optUsers?.addEventListener("click",   () => setTab("users"));
  optClients?.addEventListener("click", () => setTab("clients"));
  applyTabToUI(localStorage.getItem(TAB_KEY) || "users");
  switchEl?.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") setTab("clients");
    if (e.key === "ArrowLeft")  setTab("users");
  });

  // ---------- Filters (shared UI)
  const qInput = $("#f-q");
  const sizeBtn = $("#f-size");
  const sizeText = $("#f-size-text");
  const roleBtn = $("#f-role");
  const roleText = $("#f-role-text");
  const applyBtn = $("#f-apply");
  const resetBtn = $("#f-reset");
  const fSummary = $("#f-summary");

  const KEY_USERS   = "filters_users_v2";
  const KEY_CLIENTS = "filters_clients_v2";

  function loadState(key, def){ try{ return JSON.parse(localStorage.getItem(key)||"null") || def; }catch{ return def; } }
  function saveState(key, v){ localStorage.setItem(key, JSON.stringify(v)); }

  let stateUsers = loadState(KEY_USERS, { q:"", roles:[], page:1, page_size:20 });
  let stateClients = loadState(KEY_CLIENTS, { q:"", page:1, page_size:20 });

  let draftUsers = structuredClone(stateUsers);
  let draftClients = structuredClone(stateClients);

  function syncFiltersUI(){
    const tab = localStorage.getItem(TAB_KEY) || "users";
    if (tab === "users"){
      qInput.value = draftUsers.q || "";
      sizeText.textContent = String(draftUsers.page_size || 20);
      roleText.textContent = (draftUsers.roles.length ? draftUsers.roles.join(", ") : "Любые");
      $(".users-only")?.classList.remove("hidden");
      fSummary.textContent = `Стр. ${draftUsers.page} • размер ${draftUsers.page_size}`;
    } else {
      qInput.value = draftClients.q || "";
      sizeText.textContent = String(draftClients.page_size || 20);
      $(".users-only")?.classList.add("hidden");
      fSummary.textContent = `Стр. ${draftClients.page} • размер ${draftClients.page_size}`;
    }
  }
  syncFiltersUI();

  sizeBtn?.addEventListener("click", () => {
    const items = [{value:"5",label:"5"},{value:"10",label:"10"},{value:"20",label:"20"},{value:"50",label:"50"}];
    openPortalMenu(sizeBtn, items, (val)=>{
      const tab = localStorage.getItem(TAB_KEY) || "users";
      if (tab === "users"){ draftUsers.page_size = Number(val); draftUsers.page = 1; }
      else { draftClients.page_size = Number(val); draftClients.page = 1; }
      syncFiltersUI();
    });
  });

  roleBtn?.addEventListener("click", () => {
    const tab = localStorage.getItem(TAB_KEY) || "users";
    if (tab !== "users") return;
    const items = [
      {value:"admin", label:"admin"},
      {value:"worker", label:"worker"},
    ];
    openPortalMenu(roleBtn, items, (vals)=>{
      draftUsers.roles = vals;
      roleText.textContent = vals.length ? vals.join(", ") : "Любые";
    }, { multi:true, selected:[...(draftUsers.roles||[])] });
  });

  qInput?.addEventListener("change", () => {
    const tab = localStorage.getItem(TAB_KEY) || "users";
    if (tab === "users"){ draftUsers.q = qInput.value.trim(); draftUsers.page = 1; }
    else { draftClients.q = qInput.value.trim(); draftClients.page = 1; }
    syncFiltersUI();
  });

  applyBtn?.addEventListener("click", () => {
    const tab = localStorage.getItem(TAB_KEY) || "users";
    if (tab === "users"){
      stateUsers = structuredClone(draftUsers);
      saveState(KEY_USERS, stateUsers);
      loadUsers();
    } else {
      stateClients = structuredClone(draftClients);
      saveState(KEY_CLIENTS, stateClients);
      loadClients();
    }
    showToast("Фильтры применены");
  });
  resetBtn?.addEventListener("click", () => {
    const tab = localStorage.getItem(TAB_KEY) || "users";
    if (tab === "users"){
      draftUsers = { q:"", roles:[], page:1, page_size:20 };
    } else {
      draftClients = { q:"", page:1, page_size:20 };
    }
    syncFiltersUI();
  });

  // ---------- Users: таблица, пагинация, CRUD
  const uTable = $("#users-table");
  const uBody  = uTable?.querySelector("tbody");
  const uPrev  = $("#u-prev");
  const uNext  = $("#u-next");
  const uPage  = $("#u-page");
  const uTotal = $("#u-total");
  const usersSub = $("#users-sub");

  function usersQuery(){
    const p = new URLSearchParams();
    if (stateUsers.q) p.append("q", stateUsers.q);
    if (stateUsers.roles?.length) stateUsers.roles.forEach(r => p.append("role", r));
    p.append("page", String(stateUsers.page));
    p.append("page_size", String(stateUsers.page_size));
    return `/users?${p.toString()}`;
  }

  async function loadUsers(){
    try{
      const data = await api(usersQuery());
      renderUsers(data);
    }catch(err){
      uBody.innerHTML = `<tr><td colspan="5" class="muted">Ошибка: ${err.message}</td></tr>`;
    }
  }

  function renderUsers(data){
    const items = data?.items || [];
    if (!items.length){
      uBody.innerHTML = `<tr><td colspan="5" class="muted">Пусто</td></tr>`;
    } else {
      uBody.innerHTML = items.map(u => `
        <tr data-id="${u.id}">
          <td>${u.id}</td>
          <td>${u.email}</td>
          <td>${u.role}</td>
          <td>${new Date(u.created_at).toLocaleString()}</td>
          <td class="ta-right">
            <button class="btn btn-ghost u-edit" data-id="${u.id}">Редактировать</button>
            <button class="btn btn-ghost u-delete" data-id="${u.id}">Удалить</button>
          </td>
        </tr>
      `).join("");
    }
    uPage.value = String(data.page);
    const total = data.total || 0;
    uTotal.textContent = `Всего: ${total}` + (stateUsers.q || stateUsers.roles?.length ? " (по фильтру)" : "");
    usersSub.textContent = `Отображено: ${items.length} • Страница ${data.page} / ${Math.max(1, Math.ceil(total / (stateUsers.page_size||20)))}`;
  }

  uPrev?.addEventListener("click", () => {
    if (stateUsers.page > 1) {
      stateUsers.page--;
      saveState(KEY_USERS, stateUsers);
      loadUsers();
    }
  });
  uNext?.addEventListener("click", () => {
    stateUsers.page++;
    saveState(KEY_USERS, stateUsers);
    loadUsers();
  });
  uPage?.addEventListener("change", () => {
    const v = Math.max(1, Number(uPage.value||1));
    stateUsers.page = v;
    saveState(KEY_USERS, stateUsers);
    loadUsers();
  });

  // создание пользователя
  const regForm = $("#register-form");
  const regMsg  = $("#register-msg");
  const regRoleBtn = $("#reg-role");
  const regRoleText = $("#reg-role-text");
  const regRoleHidden = regForm?.querySelector('input[name="role"]');

  regRoleBtn?.addEventListener("click", () => {
    openPortalMenu(regRoleBtn, [{value:"worker",label:"worker"},{value:"admin",label:"admin"}], (val)=>{
      if (regRoleHidden) regRoleHidden.value = val;
      if (regRoleText) regRoleText.textContent = val;
    });
  });

  regForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    regMsg.textContent = "Создаю...";
    const fd = new FormData(regForm);
    const email = fd.get("email");
    const role  = fd.get("role");
    const p1 = fd.get("password");
    const p2 = fd.get("password2");
    if (!email) { regMsg.textContent = "Укажите email"; return; }
    if ((p1||"").length < 8) { regMsg.textContent = "Пароль ≥ 8 символов"; return; }
    if (p1 !== p2) { regMsg.textContent = "Пароли не совпадают"; return; }

    try{
      await api("/users", { method:"POST", body:{ email, role, password:p1 }});
      regMsg.textContent = "Создан ✅";
      showToast("Пользователь создан");
      regForm.reset();
      if (regRoleHidden) regRoleHidden.value = "worker";
      if (regRoleText) regRoleText.textContent = "worker";
      loadUsers();
    }catch(err){
      regMsg.textContent = err.message || "Ошибка создания";
    }
  });

  // Удаление пользователя
  uBody?.addEventListener("click", async (e) => {
    const b = e.target.closest(".u-delete");
    if (!b) return;
    const id = Number(b.dataset.id);
    if (!id) return;
    if (!confirm(`Удалить пользователя #${id}?`)) return;
    try{
      await api(`/users/${id}`, { method:"DELETE" });
      showToast("Удалён");
      const tr = uBody.querySelector(`tr[data-id="${id}"]`);
      if (tr) tr.remove();
    }catch(err){
      alert(err.message || "Ошибка удаления");
    }
  });

  // ====== РЕДАКТИРОВАНИЕ ПОЛЬЗОВАТЕЛЯ: модалка ======
  const ueOverlay   = $("#ue-overlay");
  const ueForm      = $("#ue-form");
  const ueClose     = $("#ue-close");
  const ueCancel    = $("#ue-cancel");
  const ueRoleBtn   = $("#ue-role-btn");
  const ueRoleText  = $("#ue-role-text");
  const ueErr       = $("#ue-err");

  function ueShow() {
    ueOverlay?.classList.add("show");
    ueForm?.querySelector('input[name="email"]')?.focus();
    document.addEventListener("keydown", onEscClose);
  }
  function ueHide() {
    ueOverlay?.classList.remove("show");
    ueErr?.classList.remove("show");
    ueErr.textContent = "";
    ueForm?.reset();
    document.removeEventListener("keydown", onEscClose);
  }
  function onEscClose(e){ if (e.key === "Escape") ueHide(); }
  ueClose?.addEventListener("click", ueHide);
  ueCancel?.addEventListener("click", ueHide);
  ueOverlay?.addEventListener("click", (e)=>{ if (e.target === ueOverlay) ueHide(); });

  ueRoleBtn?.addEventListener("click", () => {
    openPortalMenu(ueRoleBtn, [
      { value: "worker", label: "worker" },
      { value: "admin",  label: "admin"  },
    ], (val) => {
      ueForm.querySelector('input[name="role"]').value = val;
      ueRoleText.textContent = val;
    });
  });

  // открыть модалку по клику "Редактировать"
  uBody?.addEventListener("click", async (e) => {
    const btn = e.target.closest(".u-edit");
    if (!btn) return;

    const id = Number(btn.dataset.id);
    const tr = uBody.querySelector(`tr[data-id="${id}"]`);
    const email = tr?.children?.[1]?.textContent?.trim() || "";
    const role  = tr?.children?.[2]?.textContent?.trim() || "worker";

    ueForm.querySelector('input[name="id"]').value = String(id);
    ueForm.querySelector('input[name="email"]').value = email;
    ueForm.querySelector('input[name="role"]').value  = role;
    ueRoleText.textContent = role;
    ueForm.querySelector('input[name="password"]').value = "";

    ueShow();
  });

  // сабмит модалки
  ueForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    ueErr?.classList.remove("show");
    ueErr.textContent = "";

    const id        = Number(ueForm.querySelector('input[name="id"]').value);
    const email     = ueForm.querySelector('input[name="email"]').value.trim();
    const password  = ueForm.querySelector('input[name="password"]').value;
    const role      = ueForm.querySelector('input[name="role"]').value;

    const tr = uBody.querySelector(`tr[data-id="${id}"]`);
    const currentEmail = tr?.children?.[1]?.textContent?.trim() || "";
    const currentRole  = tr?.children?.[2]?.textContent?.trim() || "";

    const payload = {};
    if (email && email !== currentEmail) payload.email = email;
    if (role && role !== currentRole)    payload.role  = role;
    if (password && password.length >= 8) payload.password = password;
    if (password && password.length > 0 && password.length < 8) {
      ueErr.textContent = "Пароль должен быть не короче 8 символов";
      ueErr.classList.add("show");
      return;
    }
    if (Object.keys(payload).length === 0) {
      showToast("Нет изменений");
      ueHide();
      return;
    }

    try {
      await api(`/users/${id}`, { method: "PUT", body: payload });
      showToast("Пользователь обновлён");
      ueHide();
      loadUsers();
    } catch (err) {
      ueErr.textContent = err?.message || "Ошибка сохранения";
      ueErr.classList.add("show");
    }
  });

  // ---------- Clients: таблица, пагинация
  const cTable = $("#clients-table");
  const cBody  = cTable?.querySelector("tbody");
  const cPrev  = $("#c-prev");
  const cNext  = $("#c-next");
  const cPage  = $("#c-page");
  const cTotal = $("#c-total");
  const clientsSub = $("#clients-sub");

  function clientsQuery(){
    const p = new URLSearchParams();
    if (stateClients.q) p.append("q", stateClients.q);
    p.append("page", String(stateClients.page));
    p.append("page_size", String(stateClients.page_size));
    return `/clients?${p.toString()}`;
  }

  async function loadClients(){
    try{
      const data = await api(clientsQuery());
      renderClients(data);
    }catch(err){
      cBody.innerHTML = `<tr><td colspan="5" class="muted">Ошибка: ${err.message}</td></tr>`;
    }
  }

  function renderClients(data){
    const items = data?.items || [];
    if (!items.length){
      cBody.innerHTML = `<tr><td colspan="5" class="muted">Пусто</td></tr>`;
    } else {
      cBody.innerHTML = items.map(c => `
        <tr>
          <td>${c.id}</td>
          <td class="clip">${c.name || "—"}</td>
          <td>${c.phone || "—"}</td>
          <td>${c.email || "—"}</td>
          <td class="clip">${c.comment || "—"}</td>
        </tr>
      `).join("");
    }
    cPage.value = String(data.page);
    const total = data.total || 0;
    cTotal.textContent = `Всего: ${total}` + (stateClients.q ? " (по фильтру)" : "");
    clientsSub.textContent = `Отображено: ${items.length} • Страница ${data.page} / ${Math.max(1, Math.ceil(total / (stateClients.page_size||20)))}`;
  }

  cPrev?.addEventListener("click", () => {
    if (stateClients.page > 1){
      stateClients.page--;
      saveState(KEY_CLIENTS, stateClients);
      loadClients();
    }
  });
  cNext?.addEventListener("click", () => {
    stateClients.page++;
    saveState(KEY_CLIENTS, stateClients);
    loadClients();
  });
  cPage?.addEventListener("change", () => {
    const v = Math.max(1, Number(cPage.value||1));
    stateClients.page = v;
    saveState(KEY_CLIENTS, stateClients);
    loadClients();
  });

  // ---------- начальная загрузка
  await Promise.all([loadUsers(), loadClients()]);
});
