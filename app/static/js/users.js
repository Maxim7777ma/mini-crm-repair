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

  // ---------- Tabs (Users / Clients)
// ---------- Switch (Users / Clients)
const switchEl   = $("#entity-switch"); // <— новый контейнер
const optUsers   = switchEl?.querySelector('[data-tab="users"]');
const optClients = switchEl?.querySelector('[data-tab="clients"]');
const knob       = switchEl?.querySelector(".seg-knob");

// панели остаются те же id
const paneUsers   = $("#panel-users");
const paneClients = $("#panel-clients");

const TAB_KEY = "uc_tab_v1";

// 1) Применяем выбранную вкладку к интерфейсу (двигаем «ползунок», меняем aria)
function applyTabToUI(t){
  if (t === "clients"){
    switchEl?.classList.add("is-clients");                  // двигает .seg-knob вправо (через CSS)
    optUsers?.setAttribute("aria-selected", "false");
    optClients?.setAttribute("aria-selected", "true");
    paneUsers.hidden   = true;
    paneClients.hidden = false;
    $(".users-only")?.classList.add("hidden");              // скрыть фильтр ролей в режиме клиентов
  } else {
    switchEl?.classList.remove("is-clients");               // knob влево
    optUsers?.setAttribute("aria-selected", "true");
    optClients?.setAttribute("aria-selected", "false");
    paneUsers.hidden   = false;
    paneClients.hidden = true;
    $(".users-only")?.classList.remove("hidden");           // показать фильтр ролей
  }
}

// 2) Сетtab: сохраняем состояние и применяем к UI
function setTab(t){
  localStorage.setItem(TAB_KEY, t);
  applyTabToUI(t);

  // Хочешь — сразу подгружай списки при переключении:
  if (typeof loadUsers === "function" && t === "users")   loadUsers();
  if (typeof loadClients === "function" && t === "clients") loadClients();
}

// 3) Навешиваем клики на обе кнопки переключателя
optUsers?.addEventListener("click",   () => setTab("users"));
optClients?.addEventListener("click", () => setTab("clients"));

// 4) Инициализация: берём из localStorage или по умолчанию "users"
applyTabToUI(localStorage.getItem(TAB_KEY) || "users");

// 5) Доступность с клавиатуры: ← / →
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

  // отдельные состояния для users и clients
  const KEY_USERS   = "filters_users_v2";
  const KEY_CLIENTS = "filters_clients_v2";

  function loadState(key, def){ try{ return JSON.parse(localStorage.getItem(key)||"null") || def; }catch{ return def; } }
  function saveState(key, v){ localStorage.setItem(key, JSON.stringify(v)); }

  // базовые значения:
  let stateUsers = loadState(KEY_USERS, { q:"", roles:[], page:1, page_size:20 });
  let stateClients = loadState(KEY_CLIENTS, { q:"", page:1, page_size:20 });

  // изменяемые (черновики) — чтобы Apply/Reset работали
  let draftUsers = structuredClone(stateUsers);
  let draftClients = structuredClone(stateClients);

  // подстановки в UI под активный таб
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

  // меню размеров страницы
  sizeBtn?.addEventListener("click", () => {
    const items = [{value:"5",label:"5"},{value:"10",label:"10"},{value:"20",label:"20"},{value:"50",label:"50"}];
    openPortalMenu(sizeBtn, items, (val)=>{
      const tab = localStorage.getItem(TAB_KEY) || "users";
      if (tab === "users"){ draftUsers.page_size = Number(val); draftUsers.page = 1; }
      else { draftClients.page_size = Number(val); draftClients.page = 1; }
      syncFiltersUI();
    });
  });

  // меню ролей (только users; multi)
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

  // поиск
  qInput?.addEventListener("change", () => {
    const tab = localStorage.getItem(TAB_KEY) || "users";
    if (tab === "users"){ draftUsers.q = qInput.value.trim(); draftUsers.page = 1; }
    else { draftClients.q = qInput.value.trim(); draftClients.page = 1; }
    syncFiltersUI();
  });

  // применить / сброс
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
  const uMsg   = $("#users-msg");
  const usersSub = $("#users-sub");

  function usersQuery(){
    const p = new URLSearchParams();
    if (stateUsers.q) p.append("q", stateUsers.q);
    if (stateUsers.roles?.length) stateUsers.roles.forEach(r => p.append("role", r));
    p.append("page", String(stateUsers.page));
    p.append("page_size", String(stateUsers.page_size));
    return `/users?${p.toString()}`;
    // NB: нужно быть админом -> у нас проверка выше
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
      // вернуть роль по умолчанию:
      if (regRoleHidden) regRoleHidden.value = "worker";
      if (regRoleText) regRoleText.textContent = "worker";
      loadUsers();
    }catch(err){
      regMsg.textContent = err.message || "Ошибка создания";
    }
  });

  uBody?.addEventListener("click", async (e) => {
    const b = e.target.closest(".u-delete");
    if (!b) return;
    const id = Number(b.dataset.id);
    if (!id) return;
    if (!confirm(`Удалить пользователя #${id}?`)) return;
    try{
      await api(`/users/${id}`, { method:"DELETE" });
      showToast("Удалён");
      // локально удалить строку
      const tr = uBody.querySelector(`tr[data-id="${id}"]`);
      if (tr) tr.remove();
    }catch(err){
      alert(err.message || "Ошибка удаления");
    }
  });

  // ---------- Clients: таблица, пагинация
  const cTable = $("#clients-table");
  const cBody  = cTable?.querySelector("tbody");
  const cPrev  = $("#c-prev");
  const cNext  = $("#c-next");
  const cPage  = $("#c-page");
  const cTotal = $("#c-total");
  const cMsg   = $("#clients-msg");
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
  // грузим оба списка, чтобы при переключении вкладки всё было
  await Promise.all([loadUsers(), loadClients()]);
});
