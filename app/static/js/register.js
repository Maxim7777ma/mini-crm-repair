/* ============ register.js (строгая валидация) ============ */
document.addEventListener("DOMContentLoaded", () => {
  const form   = document.getElementById("reg-form");
  if (!form) return;

  const email  = document.getElementById("reg-email");
  const pass   = document.getElementById("reg-pass");
  const pass2  = document.getElementById("reg-pass2");
  const msg    = document.getElementById("register-msg");
  const live   = document.getElementById("reg-live");

  const meterFill  = document.getElementById("reg-meter");
  const meterLabel = document.getElementById("reg-meter-label");

  const crit = {
    length : document.getElementById("crit-length"),
    sets   : document.getElementById("crit-sets"),
    space  : document.getElementById("crit-space"),
    email  : document.getElementById("crit-email"),
    common : document.getElementById("crit-common"),
    seq    : document.getElementById("crit-seq"),
  };

  const toggleBtn = document.getElementById("reg-toggle-visibility");

  // Роль — кастомный переключатель
  const roleWrap   = document.getElementById("reg-role");
  const roleBtns   = roleWrap?.querySelectorAll(".reg-role-btn");
  const roleHidden = document.getElementById("reg-role-hidden");

  // Disposable / нежелательные домены
  const badDomains = new Set([
    "mailinator.com","10minutemail.com","guerrillamail.com","temp-mail.org","trashmail.com",
    "yopmail.com","tempmail.dev","getnada.com","sharklasers.com","maildrop.cc"
  ]);

  // Частые плохие пароли (короткий список — без внешних API)
  const commonPw = new Set([
    "password","qwerty","qwerty123","iloveyou","admin","welcome","abc123","111111","123456","12345678","1234567890",
    "letmein","dragon","sunshine","monkey","login","000000","passw0rd"
  ]);

  // ===== helpers =====
  function setOK(el, ok){
    el.classList.toggle("ok",  !!ok);
    el.classList.toggle("bad", !ok);
  }
  function markInput(el, ok){
    el.classList.remove("ok","err");
    el.classList.add(ok ? "ok" : "err");
  }
  function say(m, isErr=false){
    msg.textContent = m || "";
    msg.classList.toggle("err", !!isErr);
    if (isErr && m) { live.textContent = m; } // a11y
  }

  function domainOfEmail(e){
    const m = String(e||"").trim().toLowerCase().match(/^[^@]+@([^@]+)$/);
    return m ? m[1] : "";
  }
  function looksLikeEmail(e){
    // достаточно строго, но без фанатизма
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e||"").trim());
  }

  function isSequential(s){
    const t = String(s||"").toLowerCase();
    const seq = ["0123456789","abcdefghijklmnopqrstuvwxyz","qwertyuiopasdfghjklzxcvbnm"];
    if (t.length < 4) return false;
    for (const base of seq){
      for (let i=0; i<=base.length-4; i++){
        const chunk = base.slice(i, i+4);
        if (t.includes(chunk) || t.includes([...chunk].reverse().join(""))) return true;
      }
    }
    return false;
  }
  function allSameChar(s){
    if (!s) return false;
    const c = s[0];
    return [...s].every(ch => ch === c);
  }

  function scorePassword(p, emailStr){
    const s = String(p||"");
    let score = 0;

    // базовые очки
    if (s.length >= 10) score += 30;
    if (/[a-z]/.test(s)) score += 10;
    if (/[A-Z]/.test(s)) score += 10;
    if (/\d/.test(s))    score += 15;
    if (/[^A-Za-z0-9]/.test(s)) score += 20;

    // штрафы
    if (/\s/.test(s)) score -= 25;
    if (commonPw.has(s.toLowerCase())) score -= 40;
    if (isSequential(s)) score -= 20;
    if (allSameChar(s)) score -= 30;

    // похоже на email
    if (emailStr){
      const e = emailStr.toLowerCase();
      const base = e.split("@")[0];
      if (s.toLowerCase().includes(base)) score -= 25;
      if (s.toLowerCase() === e || s.toLowerCase() === [...e].reverse().join("")) score -= 30;
    }

    // clamp
    return Math.max(0, Math.min(100, score));
  }

  function updateMeter(p, e){
    const sc = scorePassword(p, e);
    meterFill.style.width = sc + "%";
    let label = "Очень слабый";
    if (sc >= 30) label = "Слабый";
    if (sc >= 55) label = "Средний";
    if (sc >= 75) label = "Сильный";
    if (sc >= 90) label = "Отличный";
    meterLabel.textContent = `Сложность: ${label}`;
  }

  function validateEmailField(){
    const v = email.value.trim();
    if (!looksLikeEmail(v)){ markInput(email, false); return { ok:false, msg:"Неверный формат email" }; }
    const dom = domainOfEmail(v);
    if (badDomains.has(dom)){ markInput(email, false); return { ok:false, msg:"Одноразовые домены запрещены" }; }
    markInput(email, true); return { ok:true };
  }

  function validatePasswordField(){
    const e = email.value.trim();
    const p = pass.value;

    // критерии
    const cLength = p.length >= 10;
    const cSets   = /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p) && /[^A-Za-z0-9]/.test(p);
    const cSpace  = !/\s/.test(p);
    const cEmail  = p.toLowerCase() !== e.toLowerCase() && p.toLowerCase() !== [...e.toLowerCase()].reverse().join("");
    const cCommon = !commonPw.has(p.toLowerCase());
    const cSeq    = !isSequential(p) && !allSameChar(p);

    setOK(crit.length, cLength);
    setOK(crit.sets,   cSets);
    setOK(crit.space,  cSpace);
    setOK(crit.email,  cEmail);
    setOK(crit.common, cCommon);
    setOK(crit.seq,    cSeq);

    const ok = cLength && cSets && cSpace && cEmail && cCommon && cSeq;
    markInput(pass, ok);
    updateMeter(p, e);
    return { ok, msg: ok ? "" : "Пароль не соответствует требованиям" };
  }

  function validateConfirmField(){
    const ok = pass2.value === pass.value && pass2.value.length > 0;
    markInput(pass2, ok);
    return { ok, msg: ok ? "" : "Пароли не совпадают" };
  }

  function allValid(){
    const r1 = validateEmailField();
    const r2 = validatePasswordField();
    const r3 = validateConfirmField();
    return r1.ok && r2.ok && r3.ok;
  }

  // live-validation
  email.addEventListener("input", () => { validateEmailField(); validatePasswordField(); });
  pass.addEventListener("input",  () => { validatePasswordField(); validateConfirmField(); });
  pass2.addEventListener("input", () => { validateConfirmField(); });

  // переключатель видимости пароля
  toggleBtn?.addEventListener("click", () => {
    const show = pass.type === "password";
    pass.type  = show ? "text" : "password";
    pass2.type = show ? "text" : "password";
    toggleBtn.setAttribute("aria-pressed", show ? "true" : "false");
    toggleBtn.textContent = show ? "Скрыть пароль" : "Показать пароль";
  });

  // переключатель роли
  roleBtns?.forEach(b => {
    b.addEventListener("click", () => {
      const value = b.dataset.role;
      roleHidden.value = value;
      roleBtns.forEach(x => x.setAttribute("aria-pressed", String(x===b)));
      roleWrap.classList.toggle("reg-role--right", value === "admin");
    });
  });

  // submit
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    say("");

    if (!allValid()){
      say("Исправьте ошибки формы", true);
      return;
    }

    const payload = {
      email: email.value.trim(),
      password: pass.value,
      password_confirm: pass2.value,
      role: roleHidden.value || "worker",
    };

    try{
      say("Регистрируем...");
      await api("/auth/register", { method:"POST", body:payload, auth:false });
      say("Успех! Теперь войдите.");
      showToast("Аккаунт создан");
      setTimeout(() => location.href = "/ui/login", 800);
    }catch(err){
      say(err.message || "Ошибка регистрации", true);
    }
  });
});
