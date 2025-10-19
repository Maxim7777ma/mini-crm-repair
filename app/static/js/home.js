/* ============ home.js (Public Request Form) ============ */
document.addEventListener("DOMContentLoaded", () => {
  const form = $("#public-request-form");
  const msg  = $("#public-msg");
  const btnSubmit = $("#pf-submit");
  const btnClear  = $("#pf-clear");
  const cmtLeft   = $("#cmt-left");
  if (!form) return;

  const DRAFT_KEY = "public_draft_v1";
  let sending = false;

  // ---- helpers ----
  const get = (name) => form.querySelector(`[name="${name}"]`);
  const errBox = (name) => form.querySelector(`.pf-err[data-for="${name}"]`);
  const wrap = (el) => el?.closest(".pf-field");

  function setError(name, text){
    const el = get(name); const box = errBox(name);
    if (!el || !box) return;
    wrap(el)?.classList.add("invalid");
    box.textContent = text || "";
  }
  function clearError(name){
    const el = get(name); const box = errBox(name);
    if (!el || !box) return;
    wrap(el)?.classList.remove("invalid");
    box.textContent = "";
  }
  function firstInvalidScroll(){
    const bad = form.querySelector(".pf-field.invalid");
    if (bad) bad.scrollIntoView({ behavior:"smooth", block:"center" });
  }
  function sanitizePhone(raw){
    // Разрешаем + и цифры, удаляем остальное
    const cleaned = (raw || "").replace(/[^\d+]/g, "");
    // Один плюс только в начале
    return cleaned.replace(/(?!^)\+/g, "");
  }
  function looksLikeEmail(v){
    if (!v) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }
  function hasAtLeastOneContact(phone, email){
    const p = sanitizePhone(phone);
    return (p && p.length >= 7) || looksLikeEmail(email);
  }
  function minDateLocal(){
    // локальное «сейчас» для min атрибута
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); // локализация для input[type=datetime-local]
    return d.toISOString().slice(0,16);
  }
  function inFuture(dtLocal){
    if (!dtLocal) return true;
    // datetime-local -> локальная строка (YYYY-MM-DDTHH:mm)
    // преобразуем к Date как локальное время
    const [date, time] = dtLocal.split("T");
    const [Y,M,D] = date.split("-").map(Number);
    const [h,m]   = (time || "00:00").split(":").map(Number);
    const d = new Date(Y, (M-1), D, h, m, 0, 0);
    return d.getTime() > Date.now() - 60_000; // допускаем до 1 мин назад
  }
  function collectPayload(){
    const fd = new FormData(form);
    return {
      title: fd.get("title")?.toString().trim(),
      description: fd.get("description")?.toString().trim() || null,
      scheduled_at: isoOrNull(fd.get("scheduled_at")),
      client: {
        name: fd.get("name")?.toString().trim(),
        phone: sanitizePhone(fd.get("phone")?.toString()),
        email: fd.get("email")?.toString().trim(),
        comment: fd.get("comment")?.toString().trim() || null,
      }
    };
  }

  // ---- realtime UX ----
  // счётчик комментария
  const comment = get("comment");
  if (comment && cmtLeft){
    const max = Number(comment.getAttribute("maxlength") || "300");
    const upd = () => cmtLeft.textContent = String(max - comment.value.length);
    comment.addEventListener("input", upd);
    upd();
  }

  // маска телефона
  const phone = get("phone");
  phone?.addEventListener("input", () => {
    const pos = phone.selectionStart;
    phone.value = sanitizePhone(phone.value);
    try { phone.setSelectionRange(pos, pos); } catch {}
    clearError("phone");
  });

  // минимум для datetime-local
  const sched = get("scheduled_at");
  if (sched){
    sched.setAttribute("min", minDateLocal());
    sched.addEventListener("change", () => clearError("scheduled_at"));
  }

  // поля: снимаем ошибку на вводе
  ["name","email","title","description"].forEach(n => {
    get(n)?.addEventListener("input", () => clearError(n));
  });

  // ---- Автосохранение черновика ----
  function loadDraft(){
    try{
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      if (!d) return;
      for (const [k,v] of Object.entries(d)){
        if (k === "scheduled_at" && v){
          // записывали как ISO — переведём в локальный datetime-local
          const dt = new Date(v);
          dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
          get(k).value = dt.toISOString().slice(0,16);
        } else if (k === "client"){
          // вложенные поля
          for (const [ck,cv] of Object.entries(v || {})){
            const inp = get(ck);
            if (inp) inp.value = cv ?? "";
          }
        } else {
          const inp = get(k);
          if (inp) inp.value = v ?? "";
        }
      }
    }catch{}
  }
  function saveDraft(){
    const p = collectPayload();
    localStorage.setItem(DRAFT_KEY, JSON.stringify(p));
  }
  function clearDraft(){
    localStorage.removeItem(DRAFT_KEY);
  }
  // следим за изменениями
  form.addEventListener("input", saveDraft);
  loadDraft();

  // кнопка очистки
  btnClear?.addEventListener("click", () => {
    form.reset();
    clearDraft();
    // визуально обновить счётчик, min и ошибки
    comment && (cmtLeft.textContent = comment.getAttribute("maxlength") || "300");
    sched?.setAttribute("min", minDateLocal());
    ["name","email","phone","title","description","scheduled_at"].forEach(clearError);
    msg.textContent = "";
    showToast("Форма очищена");
  });

  // ---- Валидация перед отправкой ----
  function validate(){
    let ok = true;
    const p = collectPayload();
    // honeypot
    const trap = form.querySelector('[name="website"]')?.value?.trim();
    if (trap){ return { ok:false, payload:p, first:"name", msg:"Подозрение на спам" }; }

    // имя
    if (!p.client.name || p.client.name.length < 2){
      setError("name", "Укажите имя (минимум 2 символа)");
      ok = false;
    }
    // контакты: хотя бы телефон ИЛИ email
    if (!hasAtLeastOneContact(p.client.phone, p.client.email)){
      setError("phone", "Нужен телефон или email");
      setError("email", "Нужен телефон или email");
      ok = false;
    } else {
      // если указан email — проверим формат
      if (p.client.email && !looksLikeEmail(p.client.email)){
        setError("email", "Некорректный email");
        ok = false;
      }
      // если указан телефон — пусть будет хотя бы 7 цифр
      if (p.client.phone && p.client.phone.replace(/\D/g,"").length < 7){
        setError("phone", "Слишком короткий телефон");
        ok = false;
      }
    }
    // заголовок
    if (!p.title || p.title.length < 5){
      setError("title", "Минимум 5 символов");
      ok = false;
    }
    // дата — если задана, должна быть в будущем
    const rawLocal = get("scheduled_at")?.value;
    if (rawLocal && !inFuture(rawLocal)){
      setError("scheduled_at", "Дата/время не в прошлом");
      ok = false;
    }

    // найдём первый инпут с ошибкой
    const first =
      (!p.client.name || p.client.name.length < 2) ? "name" :
      (!hasAtLeastOneContact(p.client.phone, p.client.email)) ? "phone" :
      (p.client.email && !looksLikeEmail(p.client.email)) ? "email" :
      (p.client.phone && p.client.phone.replace(/\D/g,"").length < 7) ? "phone" :
      (!p.title || p.title.length < 5) ? "title" :
      (rawLocal && !inFuture(rawLocal)) ? "scheduled_at" : null;

    return { ok, payload:p, first, msg: ok ? "" : "Проверьте поля формы" };
  }

  // ---- Submit ----
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (sending) return;

    // очистим визуальные ошибки
    ["name","email","phone","title","description","scheduled_at"].forEach(clearError);
    msg.textContent = "Проверка…";

    const { ok, payload, first, msg: vmsg } = validate();
    if (!ok){
      msg.textContent = vmsg;
      firstInvalidScroll();
      return;
    }

    try{
      sending = true;
      btnSubmit.disabled = true;
      msg.textContent = "Отправка…";

      await api("/tickets/public", { method:"POST", body: payload, auth:false });

      msg.textContent = "Заявка отправлена! Мы свяжемся с вами ✅";
      showToast("Готово!");
      form.reset();
      clearDraft();
      // обновить min, счётчик и фокусы
      sched?.setAttribute("min", minDateLocal());
      comment && (cmtLeft.textContent = comment.getAttribute("maxlength") || "300");
    }catch(err){
      msg.textContent = err.message || "Ошибка";
    }finally{
      sending = false;
      btnSubmit.disabled = false;
    }
  });

  // плавный скролл к форме, если пришли по якорю
  if (location.hash === "#public-form"){
    document.getElementById("public-form")?.scrollIntoView({ behavior:"smooth", block:"start" });
  }
});
