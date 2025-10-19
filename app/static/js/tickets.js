/* ============ tickets.js (фильтры с применением, детали, inline-правки) ============ */
document.addEventListener("DOMContentLoaded", async () => {
  if (!getToken()) { redirectLogin(); return; }
  try { const me = await api("/auth/me"); if (me) saveMe(me); } catch {}
  const user = getMe();

  // ---------- Admin panel visibility
  const adminPanel = $("#admin-panel");
  if (adminPanel) adminPanel.hidden = !(user && user.role === "admin");

  // ---------- Workers cache
  let WORKERS = [];
  async function loadWorkers(){
    if (WORKERS.length) return WORKERS;
    try {
      const ures = await api("/users?page=1&page_size=200");
      WORKERS = (ures.items || []).filter(u => u.role === "worker");
    } catch {}
    return WORKERS;
  }

  // ---------- Elements
  const qInput = $("#q");
  const statusBtn = $("#statusBtn");
  const statusBtnText = $("#statusBtnText");
  const dateBtn = $("#dateBtn");
  const dateBtnText = $("#dateBtnText");
  const sizeBtn = $("#sizeBtn");
  const sizeBtnText = $("#sizeBtnText");
  const applyBtn = $("#applyFilters");
  const resetBtn = $("#resetFilters");

  const prevBtn = $("#prev"), nextBtn = $("#next"), reloadBtn = $("#reload");
  const pageInfo = $("#page-info");
  const tbody = $("#ticket-rows");
  const summary = $("#filtersSummary");

  // Modal
  const modal = $("#ticket-modal");
  const mClose = $("#tm-close");
  const mBackdrop = modal?.querySelector(".modal__backdrop");
  const mTitle = $("#tm-title");
  const fEdit = $("#tm-edit-form");
  const fEditMsg = $("#tm-edit-msg");
  let lastFocus = null;

  // ---------- Filters: draft + applied
  const STORAGE_KEY = "tickets_filters_v4";
  const DEF = { q:"", status:[], page:1, page_size:20, date:"all", from:null, to:null };

  function loadApplied(){
    try { return Object.assign({}, DEF, JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}")); }
    catch { return { ...DEF }; }
  }
  function saveApplied(v){ localStorage.setItem(STORAGE_KEY, JSON.stringify(v)); }

  let applied = loadApplied();
  let draft   = structuredClone(applied);

  function dateLabel(f){
    if (f.date === "today") return "Сегодня";
    if (f.date === "7d") return "7 дней";
    if (f.date === "30d") return "30 дней";
    if (f.date === "range" && f.from && f.to) return `${f.from.slice(0,10)}—${f.to.slice(0,10)}`;
    return "Любая дата";
  }
  function syncFiltersUI(){
    qInput.value = draft.q || "";
    statusBtnText.textContent = draft.status?.length ? draft.status.join(", ") : "Любые";
    sizeBtnText.textContent = String(draft.page_size || 20);
    dateBtnText.textContent = dateLabel(draft);
    summary.textContent = `Черновик: стр. ${draft.page || 1}, размер ${draft.page_size}.`;
  }
  syncFiltersUI();

  // ---- Draft handlers
  qInput?.addEventListener("change", () => { draft.q = qInput.value.trim(); draft.page = 1; syncFiltersUI(); });

  statusBtn?.addEventListener("click", () => {
    const items = ["new","in_progress","done","canceled"].map(s => ({ value:s, label:s }));
    openPortalMenu(statusBtn, items, (vals) => {
      draft.status = vals;
      statusBtnText.textContent = vals.length ? vals.join(", ") : "Любые";
      draft.page = 1;
      syncFiltersUI();
    }, { multi:true, selected:[...(draft.status||[])] });
  });

  dateBtn?.addEventListener("click", () => {
    const items = [
      { value:"all",  label:"Любая дата" },
      { value:"today",label:"Сегодня" },
      { value:"7d",   label:"Последние 7 дней" },
      { value:"30d",  label:"Последние 30 дней" },
      { value:"range",label:"Выбрать диапазон…" },
    ];
    openPortalMenu(dateBtn, items, async (val) => {
      if (val === "range"){
        const from = prompt("С даты (YYYY-MM-DD):", draft.from?.slice(0,10) || "");
        const to   = prompt("По дату (YYYY-MM-DD):", draft.to?.slice(0,10) || "");
        if (from && to){
          draft.date="range"; draft.from = from + "T00:00:00.000Z"; draft.to = to + "T23:59:59.999Z";
        } else { return; }
      } else {
        draft.date = val; draft.from = draft.to = null;
      }
      draft.page = 1;
      syncFiltersUI();
    });
  });

  sizeBtn?.addEventListener("click", () => {
    const items = ["10","20","50"].map(x => ({ value:x, label:x }));
    openPortalMenu(sizeBtn, items, (val) => {
      draft.page_size = Number(val); draft.page = 1;
      syncFiltersUI();
    });
  });

  // ---- Apply / Reset
  applyBtn?.addEventListener("click", () => {
    applied = structuredClone(draft);
    saveApplied(applied);
    showToast("Фильтры применены");
    loadTickets(true);
  });

  resetBtn?.addEventListener("click", () => {
    draft = structuredClone(DEF);
    applied = structuredClone(DEF);
    saveApplied(applied);
    syncFiltersUI();
    showToast("Фильтры сброшены");
    loadTickets(true);
  });

  // ---------- Data + rendering
  let DATA = [];      // текущие элементы на странице
  let DIRTY = {};     // изменения в строках { [id]: {status?, assignee_id?} }

  function applyDateClient(items, f){
    if (f.date === "all") return items;
    const now = new Date();
    let from = null, to = null;
    if (f.date === "today"){
      from = new Date(); from.setHours(0,0,0,0);
      to = new Date();   to.setHours(23,59,59,999);
    } else if (f.date === "7d"){
      from = new Date(now.getTime() - 7*864e5); to = now;
    } else if (f.date === "30d"){
      from = new Date(now.getTime() - 30*864e5); to = now;
    } else if (f.date === "range" && f.from && f.to){
      from = new Date(f.from); to = new Date(f.to);
    }
    if (!from || !to) return items;
    return items.filter(t => {
      const dt = new Date(t.created_at);
      return dt >= from && dt <= to;
    });
  }

  async function loadTickets(resetPage=false){
    if (resetPage) applied.page = 1;
    const params = {
      q: applied.q || undefined,
      page: applied.page || 1,
      page_size: applied.page_size || 20,
    };
    if (applied.status?.length) params.status = applied.status;

    try{
      const resp = await api("/tickets" + qparams(params));
      const items = applyDateClient(resp.items || [], applied);
      DATA = items;
      renderTickets(resp.page, resp.total, items);
    }catch(err){
      tbody.innerHTML = `<tr><td colspan="8" class="muted">Ошибка: ${err.message}</td></tr>`;
    }
  }

  function labelAssignee(aid){ return (aid ?? "Назначить"); }

  function renderTickets(page, total, items){
    if (!items.length){
      tbody.innerHTML = `<tr><td colspan="8" class="muted">Пусто</td></tr>`;
      pageInfo.textContent = `Стр. ${page} • всего ${total}`;
      return;
    }

    tbody.innerHTML = items.map(t => {
      const d = DIRTY[t.id] || {};
      const statusNow = d.status || t.status;
      const assigneeNow = (d.assignee_id !== undefined ? d.assignee_id : t.assignee_id);
      const dirtyClass = DIRTY[t.id] ? "row-dirty" : "";

      return `
        <tr data-id="${t.id}" class="${dirtyClass}">
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
          <td class="ta-right">
            <div class="row-actions" style="display:flex;gap:8px;justify-content:flex-end">
              <button class="btn row-more" data-id="${t.id}">Подробнее</button>
              <button class="btn btn-primary row-save" data-id="${t.id}" ${DIRTY[t.id] ? "" : "disabled"}>Сохранить</button>
              <button class="btn row-cancel" data-id="${t.id}" ${DIRTY[t.id] ? "" : "disabled"}>Отмена</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    pageInfo.textContent = `Стр. ${applied.page} • всего ${total}`;

    // status menu
    $all(".row-status", tbody).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = Number(btn.dataset.id);
        const items = ["new","in_progress","done","canceled"].map(s => ({ value:s, label:s }));
        const current = (DIRTY[id]?.status) || DATA.find(x => x.id===id)?.status || "new";
        openPortalMenu(btn, items, (val) => {
          DIRTY[id] = { ...(DIRTY[id]||{}), status: val };
          markDirtyRow(id);
        }, { multi:false, selected:[current] });
      });
    });

    // assignee menu
    $all(".row-assignee", tbody).forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = Number(btn.dataset.id);
        const workers = await loadWorkers();
        const items = [{ value:"", label:"(не назначать)" }].concat(
          workers.map(w => ({ value:String(w.id), label:`${w.id} — ${w.email}` }))
        );
        const current = (DIRTY[id]?.assignee_id ?? DATA.find(x => x.id===id)?.assignee_id ?? "").toString();
        openPortalMenu(btn, items, (val) => {
          const v = val ? Number(val) : null;
          DIRTY[id] = { ...(DIRTY[id]||{}), assignee_id: v };
          markDirtyRow(id);
        }, { multi:false, selected:[current] });
      });
    });

    // save row
    $all(".row-save", tbody).forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = Number(btn.dataset.id);
        if (!DIRTY[id]) return;
        btn.disabled = true; btn.textContent = "...";
        const payload = {};
        if ("status" in DIRTY[id]) payload.status = DIRTY[id].status;
        if ("assignee_id" in DIRTY[id]) payload.assignee_id = DIRTY[id].assignee_id;

        try{
          const updated = await api(`/tickets/${id}`, { method:"PATCH", body: payload });
          // обновим DATA и DOM без перерисовки всей таблицы
          const idx = DATA.findIndex(x => x.id === id);
          if (idx >= 0) DATA[idx] = { ...DATA[idx], ...updated };

          const tr = tbody.querySelector(`tr[data-id="${id}"]`);
          tr.querySelector(".row-status").firstChild.nodeValue = updated.status + " ";
          tr.querySelector(".row-assignee").firstChild.nodeValue = (updated.assignee_id ?? "Назначить") + " ";
          tr.classList.remove("row-dirty");
          tr.querySelector(".row-save").disabled = true;
          tr.querySelector(".row-cancel").disabled = true;
          delete DIRTY[id];

          btn.textContent = "Сохранить";
          showToast("Сохранено");
        }catch(err){
          btn.disabled = false; btn.textContent = "Сохранить";
          alert(err.message || "Ошибка сохранения");
        }
      });
    });

    // cancel row
    $all(".row-cancel", tbody).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = Number(btn.dataset.id);
        const tr = tbody.querySelector(`tr[data-id="${id}"]`);
        const t = DATA.find(x => x.id===id);
        if (!t || !tr) return;
        tr.querySelector(".row-status").firstChild.nodeValue = t.status + " ";
        tr.querySelector(".row-assignee").firstChild.nodeValue = (t.assignee_id ?? "Назначить") + " ";
        tr.classList.remove("row-dirty");
        tr.querySelector(".row-save").disabled = true;
        tr.querySelector(".row-cancel").disabled = true;
        delete DIRTY[id];
      });
    });

    // details
    $all(".row-more", tbody).forEach(btn => {
      btn.addEventListener("click", () => openDetails(Number(btn.dataset.id)));
    });
  }

  function markDirtyRow(id){
    const tr = tbody.querySelector(`tr[data-id="${id}"]`);
    if (!tr) return;
    tr.classList.add("row-dirty");
    tr.querySelector(".row-save").disabled = false;
    tr.querySelector(".row-cancel").disabled = false;

    if (DIRTY[id]?.status){
      const b = tr.querySelector(".row-status"); if (b) b.firstChild.nodeValue = DIRTY[id].status + " ";
    }
    if ("assignee_id" in (DIRTY[id] || {})){
      const b = tr.querySelector(".row-assignee"); if (b) b.firstChild.nodeValue = (DIRTY[id].assignee_id ?? "Назначить") + " ";
    }
  }

  // ---------- Pagination / reload
  prevBtn?.addEventListener("click", () => {
    if ((applied.page || 1) > 1){
      applied.page = (applied.page || 1) - 1;
      saveApplied(applied);
      loadTickets();
    }
  });
  nextBtn?.addEventListener("click", () => {
    applied.page = (applied.page || 1) + 1;
    saveApplied(applied);
    loadTickets();
  });
  reloadBtn?.addEventListener("click", () => loadTickets());

  // ---------- Admin: Create ticket (custom assignee menu)
  const createForm = $("#new-ticket-form");
  const createMsg  = $("#create-msg");
  if (createForm && user && user.role === "admin"){
    const assignBtn = $("#assignBtn");
    const assignText = $("#assignText");
    const hiddenAssignee = createForm.querySelector('input[name="assignee_id"]');

    assignBtn?.addEventListener("click", async () => {
      const workers = await loadWorkers();
      const items = [{ value:"", label:"(не назначать)" }].concat(
        workers.map(w => ({ value:String(w.id), label:`${w.id} — ${w.email}` }))
      );
      openPortalMenu(assignBtn, items, (val) => {
        hiddenAssignee.value = val || "";
        assignText.textContent = val ? items.find(i => i.value===val)?.label : "(не назначать)";
      });
    });

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
        assignText.textContent = "(не назначать)";
        loadTickets(); // остаёмся на странице, порядок не трогаем
      }catch(err){
        createMsg.textContent = err.message || "Ошибка";
      }
    });
  }

  // ---------- Details modal
  function openDetails(id){
    const t = DATA.find(x => x.id === id);
    if (!t){ return; }
    fillModal(t);

    // запомним элемент, у которого был фокус до открытия
    lastFocus = document.activeElement;

    // показываем модалку
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");

    // переведём фокус на содержимое модалки
    const content = modal.querySelector(".modal__content");
    content && content.focus();
  }
  function closeDetails(){
    // вернуть фокус туда, откуда открывали (если элемент ещё в DOM)
    if (lastFocus && document.contains(lastFocus)) {
      lastFocus.focus();
    } else {
      // запасной вариант: фокус на кнопку «Обновить» или любую безопасную
      document.getElementById("reload")?.focus();
    }

    // теперь можно скрывать модалку
    modal.setAttribute("aria-hidden", "true");
    modal.hidden = true;

    // очистим сообщения
    fEditMsg.textContent = "";
  }
  mClose?.addEventListener("click", closeDetails);
  mBackdrop?.addEventListener("click", (e) => { if (e.target.dataset.close !== undefined) closeDetails(); });
  document.addEventListener("keydown", (e) => { if (!modal.hidden && e.key === "Escape") closeDetails(); });

  function fillModal(t){
    $("#tm-id").textContent = t.id;
    $("#tm-title").textContent = `Тикет #${t.id}`;
    $("#tm-title-text").textContent = t.title || "—";
    $("#tm-desc").textContent = t.description || "—";
    $("#tm-status").textContent = t.status;
    $("#tm-client").textContent = t.client_id ?? "—";
    $("#tm-assignee").textContent = t.assignee_id ?? "—";
    $("#tm-scheduled").textContent = formatDate(t.scheduled_at);
    $("#tm-created").textContent = formatDate(t.created_at);
    $("#tm-updated").textContent = formatDate(t.updated_at);

    // префилл формы редактирования
    fEdit.querySelector('[name="title"]').value = t.title || "";
    fEdit.querySelector('[name="description"]').value = t.description || "";
    fEdit.querySelector('[name="scheduled_at"]').value =
      t.scheduled_at ? new Date(t.scheduled_at).toISOString().slice(0,16) : "";
    fEdit.dataset.id = String(t.id);
  }

  fEdit?.addEventListener("submit", async (e) => {
    e.preventDefault();
    fEditMsg.textContent = "Сохраняем...";
    const id = Number(fEdit.dataset.id);
    const fd = new FormData(fEdit);
    const payload = {
      title: (fd.get("title") || "").trim() || undefined,
      description: (fd.get("description") || "").trim() || undefined,
      scheduled_at: isoOrNull(fd.get("scheduled_at")),
    };
    try{
      const updated = await api(`/tickets/${id}`, { method:"PATCH", body: payload });
      // локально
      const idx = DATA.findIndex(x => x.id === id);
      if (idx >= 0) DATA[idx] = { ...DATA[idx], ...updated };
      // обновим строку в таблице (только видимые поля)
      const tr = tbody.querySelector(`tr[data-id="${id}"]`);
      if (tr){
        tr.children[1].textContent = updated.title || DATA[idx].title || "";
        tr.children[5].textContent = formatDate(updated.scheduled_at || DATA[idx].scheduled_at);
      }
      fillModal(DATA[idx]);
      fEditMsg.textContent = "Сохранено ✅";
      showToast("Тикет обновлён");
    }catch(err){
      fEditMsg.textContent = err.message || "Ошибка";
    }
  });
  $("#tm-edit-cancel")?.addEventListener("click", () => { if (!modal.hidden) closeDetails(); });

  // ---------- Initial load
  await loadTickets();
});
