/* ============ login.js (красивая форма + валидация) ============ */
document.addEventListener("DOMContentLoaded", () => {
  const form    = document.getElementById("login-form");
  if (!form) return;

  const email   = document.getElementById("log-email");
  const pass    = document.getElementById("log-pass");
  const eye     = document.getElementById("log-eye");
  const caps    = document.getElementById("log-caps");
  const submit  = document.getElementById("log-submit");
  const msg     = document.getElementById("login-msg");
  const live    = document.getElementById("log-live");

  const remember = document.getElementById("log-remember");
  const demoBtn  = document.getElementById("log-demo");

  const LS_EMAIL_KEY = "login_email";

  // ---- helpers ----
  function looksLikeEmail(v){
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v||"").trim());
  }
  function markInput(el, ok){
    el.classList.remove("ok","err");
    el.classList.add(ok ? "ok" : "err");
  }
  function say(m, isErr=false){
    msg.textContent = m || "";
    msg.classList.toggle("err", !!isErr);
    if (isErr && m) { live.textContent = m; }
  }
  function setBusy(b){
    submit.disabled = b;
    submit.textContent = b ? "Входим..." : "Войти";
  }

  // ---- restore saved email ----
  const savedEmail = localStorage.getItem(LS_EMAIL_KEY);
  if (savedEmail){
    email.value = savedEmail;
    remember.checked = true;
  }

  // ---- live validation ----
  email.addEventListener("input", () => {
    const ok = looksLikeEmail(email.value);
    markInput(email, ok);
  });
  pass.addEventListener("input", () => {
    const ok = (pass.value || "").length > 0;
    markInput(pass, ok);
  });

  // ---- caps lock detection ----
  function capsHandler(e){
    const on = e.getModifierState && e.getModifierState("CapsLock");
    if (on) { caps.style.display = "block"; }
    else { caps.style.display = "none"; }
  }
  pass.addEventListener("keydown", capsHandler);
  pass.addEventListener("keyup", capsHandler);

  // ---- toggle password visibility ----
  eye.addEventListener("click", () => {
    const show = pass.type === "password";
    pass.type = show ? "text" : "password";
    eye.setAttribute("aria-pressed", show ? "true" : "false");
    eye.textContent = show ? "🙈" : "👁";
  });

  // ---- demo autofill ----
  demoBtn.addEventListener("click", () => {
    email.value = "admin@example.com";
    pass.value  = "admin123";
    markInput(email, true);
    markInput(pass, true);
    say("Демо-данные подставлены");
  });

  // ---- submit ----
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    say("");

    const ev = email.value.trim();
    const pv = pass.value;

    if (!looksLikeEmail(ev)){
      markInput(email, false);
      say("Неверный email", true);
      return;
    }
    if (!pv){
      markInput(pass, false);
      say("Введите пароль", true);
      return;
    }

    // remember email
    if (remember.checked) localStorage.setItem(LS_EMAIL_KEY, ev);
    else localStorage.removeItem(LS_EMAIL_KEY);

    try {
      setBusy(true);
      const data = await api("/auth/login", {
        method: "POST",
        auth: false,
        body: { email: ev, password: pv }
      });

      saveToken(data.access_token);
      syncNav();

      try { const me = await api("/auth/me"); if (me) saveMe(me); } catch {}

      say("Готово! Перенаправляю...");
      showToast("Вход выполнен");
      setTimeout(() => location.href = "/ui/tickets", 350);
    } catch (err) {
      say(err.message || "Ошибка входа", true);
    } finally {
      setBusy(false);
    }
  });
});
