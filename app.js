/* ConjuMaster — логика тренировки + ANKI (интервальные повторения).
   Хранение: localStorage "conjumaster_v1".
   Статус формы: new (0 показов) · learning · learned (streak>=3) · difficult (wrong>=3, пока streak<3).
   Статус глагола: new (ничего не встречалось) · learned (все формы learned) · hard (есть difficult) · learning.
*/
"use strict";

const LS_KEY = "conjumaster_v1";
const SESSION_SIZE = 10;
const LEARN_STREAK = 3;   // сколько подряд "верно" нужно для выучивания
const HARD_FAILS = 3;     // сколько ошибок делает форму трудной
const INTERVALS = [1, 2, 4, 8, 15, 30]; // повтор через N сессий по streak

const $ = (id) => document.getElementById(id);

// ---------- плоский каталог карточек ----------
const CARDS = [];
const VERB_DATA = (typeof VERBS !== "undefined") ? VERBS : [];
VERB_DATA.forEach((v, vi) => {
  (v.forms || []).forEach((f) => {
    CARDS.push({
      id: v.inf + ":" + f.key, // стабильный id по инфинитиву (не зависит от порядка в файле)
      verb: vi,
      key: f.key,
      inf: v.inf,
      infRu: v.ru,
      fr: f.fr,
      ru: f.ru,
    });
  });
});
const cardById = Object.fromEntries(CARDS.map((c) => [c.id, c]));

// ---------- хранилище ----------
function blankState() { return { seen: 0, good: 0, mid: 0, bad: 0, streak: 0, due: 0 }; }
let store = { progress: {}, session: 0, answers: 0, days: {} };

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s && typeof s === "object") {
      store.progress = s.progress || {};
      store.session = s.session || 0;
      store.answers = s.answers || 0;
      store.days = (s.days && typeof s.days === "object") ? s.days : {};
      sanitizeDays(); // отбрасываем старый формат (число сессий за день)
      migrateProgress(); // одноразовый перевод числовых id на стабильные
    }
  } catch (e) { console.warn("localStorage недоступен", e); }
}
// days: дата -> число повторений (ответов) в этот день.
// Старые форматы (число сессий, списки глаголов) молча отбрасываем.
function sanitizeDays() {
  if (!store.days || typeof store.days !== "object") store.days = {};
  for (const k of Object.keys(store.days)) {
    if (typeof store.days[k] !== "number") delete store.days[k];
  }
}
function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(store)); }
  catch (e) { console.warn("не удалось сохранить", e); }
}
function st(id) {
  if (!store.progress[id]) store.progress[id] = blankState();
  return store.progress[id];
}
// Порядок глаголов в СТАРОМ файле (top200verbsfr.txt) — для одноразовой миграции
// прогресса со числовых id ("12:tu") на стабильные ("faire:tu").
const OLD_ORDER = ["être", "avoir", "aller", "faire", "dire", "pouvoir", "vouloir", "savoir", "voir", "devoir", "venir", "suivre", "parler", "prendre", "croire", "mettre", "écrire", "lire", "répondre", "attendre", "partir", "sortir", "dormir", "servir", "sentir", "connaître", "reconnaître", "paraître", "traduire", "conduire", "produire", "ouvrir", "couvrir", "offrir", "souffrir", "finir", "choisir", "réussir", "obéir", "réfléchir", "agir", "bâtir", "remplir", "punir", "grandir", "vieillir", "nourrir", "réunir", "applaudir", "donner", "demander", "regarder", "écouter", "montrer", "porter", "apporter", "emporter", "trouver", "chercher", "penser", "travailler", "habiter", "aimer", "adorer", "détester", "manger", "boire", "vendre", "acheter", "payer", "employer", "appeler", "jeter", "lever", "se lever", "se promener", "s'asseoir", "se souvenir", "se taire", "passer", "arriver", "entrer", "monter", "descendre", "rester", "retourner", "rentrer", "tomber", "marcher", "courir", "voyager", "chanter", "danser", "jouer", "gagner", "perdre", "compter", "peser", "mesurer", "répéter", "essayer", "présenter", "représenter", "expliquer", "utiliser", "terminer", "continuer", "commencer", "cesser", "changer", "garder", "oublier", "rappeler", "permettre", "promettre", "admettre", "soumettre", "transmettre", "comprendre", "apprendre", "surprendre", "entreprendre", "éteindre", "peindre", "craindre", "plaindre", "joindre", "atteindre", "obtenir", "maintenir", "contenir", "appartenir", "tenir", "retenir", "devenir", "revenir", "prévenir", "intervenir", "accepter", "refuser", "décider", "préparer", "recevoir", "concevoir", "apercevoir", "falloir", "pleuvoir", "neiger", "valoir"];
function migrateProgress() {
  const keys = Object.keys(store.progress);
  if (!keys.some((k) => /^\d+:/.test(k))) return; // числовых id уже нет
  const np = {};
  const merge = (a, b) => ({
    seen: (a.seen || 0) + (b.seen || 0),
    good: (a.good || 0) + (b.good || 0),
    mid: (a.mid || 0) + (b.mid || 0),
    bad: (a.bad || 0) + (b.bad || 0),
    streak: Math.max(a.streak || 0, b.streak || 0),
    due: Math.max(a.due || 0, b.due || 0),
  });
  for (const k of keys) {
    const m = /^(\d+):(.+)$/.exec(k);
    const nk = (m && OLD_ORDER[+m[1]]) ? OLD_ORDER[+m[1]] + ":" + m[2] : k;
    np[nk] = np[nk] ? merge(np[nk], store.progress[k]) : store.progress[k];
  }
  store.progress = np;
}
function statusOf(s) {
  if (!s || s.seen === 0) return "new";
  if (s.streak >= LEARN_STREAK) return "learned";
  if (s.bad >= HARD_FAILS) return "difficult";
  return "learning";
}

// ---------- взвешенный отбор сессии (ANKI) ----------
function weightOf(s, status) {
  const due = s.due <= store.session;
  if (status === "learned") return due ? 3 : 0; // выученное — редко, только просроченное
  if (status === "difficult") return due ? 12 : 2; // трудное — чаще всех
  if (status === "learning") return due ? 6 : 1.5; // в изучении — часто
  return 2.2; // new — в меру, чтобы шёл прогресс по новым
}

function pickSession(n, onlyIds) {
  const pool = onlyIds ? onlyIds.map((id) => cardById[id]).filter(Boolean) : CARDS.slice();
  // если тренируем трудные, а их нет — берём обычные
  let items = pool.map((c) => {
    const s = st(c.id);
    const status = statusOf(s);
    return { c, w: onlyIds ? 1 : weightOf(s, status), status };
  }).filter((x) => x.w > 0);
  if (!items.length) items = pool.map((c) => ({ c, w: 1, status: "new" }));

  // разнообразие: сначала не больше 2 карт одного глагола
  const picked = [];
  const perVerb = {};
  const take = (maxPerVerb) => {
    let guard = items.length * 3;
    while (picked.length < n && items.length && guard-- > 0) {
      const total = items.reduce((a, x) => a + x.w, 0);
      let r = Math.random() * total;
      let idx = 0;
      for (; idx < items.length; idx++) { r -= items[idx].w; if (r <= 0) break; }
      idx = Math.min(idx, items.length - 1);
      const it = items[idx];
      const v = it.c.verb;
      if ((perVerb[v] || 0) >= maxPerVerb) {
        // поискать другой глагол
        const alt = items.findIndex((x) => (perVerb[x.c.verb] || 0) < maxPerVerb);
        if (alt === -1) return; // все забиты — выходим, доберём ниже
        const it2 = items.splice(alt, 1)[0];
        picked.push(it2.c); perVerb[v] = (perVerb[v] || 0) + 0; perVerb[it2.c.verb] = (perVerb[it2.c.verb] || 0) + 1;
      } else {
        items.splice(idx, 1);
        picked.push(it.c); perVerb[v] = (perVerb[v] || 0) + 1;
      }
    }
  };
  take(2);
  if (picked.length < n) take(99); // добрать остаток чем угодно
  // перемешать
  for (let i = picked.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [picked[i], picked[j]] = [picked[j], picked[i]];
  }
  return picked;
}

// ---------- состояние тренировки ----------
let queue = [], pos = 0, flipped = false;
let sessGood = 0, sessMid = 0, sessBad = 0, requeues = 0;
let sessGrades = []; // {id, grade}
let trainTitle = "";

function startSession(opts) {
  opts = opts || {};
  let ids = null;
  if (opts.onlyDifficult) {
    ids = CARDS.filter((c) => statusOf(st(c.id)) === "difficult").map((c) => c.id);
    if (!ids.length) { alert("Трудных форм пока нет — начни обычную тренировку!"); return; }
    trainTitle = "🔥 Трудные";
  } else if (opts.verb != null) {
    const v = VERB_DATA[opts.verb];
    ids = (v.forms || []).map((f) => v.inf + ":" + f.key);
    // дополнить до 10 повторами форм глагола
    while (ids.length < SESSION_SIZE) ids = ids.concat(ids);
    ids = ids.slice(0, SESSION_SIZE);
    trainTitle = "📖 " + v.inf;
  } else if (opts.pron != null) {
    const list = CARDS.filter((c) => c.key.split("#")[0] === opts.pron);
    if (!list.length) return;
    ids = list.map((c) => c.id); // весь пул лица (~242) — случайные 10 выберет pickSession
    trainTitle = "🎯 " + opts.pron + " — все глаголы";
  } else {
    trainTitle = "🎲 Смешанная";
  }
  store.session += 1;
  save();
  queue = pickSession(SESSION_SIZE, ids);
  pos = 0; flipped = false;
  sessGood = sessMid = sessBad = 0; requeues = 0; sessGrades = [];
  $("viewHome").hidden = true; $("viewDone").hidden = true; $("viewTrain").hidden = false;
  $("btnHome").hidden = false;
  $("trainMode").textContent = trainTitle;
  renderCard();
  updateSessionPill();
}

function renderCard() {
  const c = queue[pos];
  if (!c) return finishSession();
  flipped = false;
  $("trainPos").textContent = (pos + 1) + " / " + queue.length;
  $("trainBar").style.width = (pos / queue.length * 100) + "%";
  $("cardRu").textContent = c.ru;
  $("cardFr").textContent = c.fr;
  $("cardRuSmall").textContent = c.ru + "  ·  " + c.inf + " — " + c.infRu;
  $("hintPop").hidden = true;
  $("hintPop").textContent = c.inf + " — " + c.infRu;
  $("requeueNote").hidden = true;
  document.querySelector(".face-front").hidden = false;
  document.querySelector(".face-back").hidden = true;
}

function flip() {
  if (flipped) return;
  flipped = true;
  document.querySelector(".face-front").hidden = true;
  document.querySelector(".face-back").hidden = false;
}

function unflip() {
  if (!flipped) return;
  flipped = false;
  document.querySelector(".face-front").hidden = false;
  document.querySelector(".face-back").hidden = true;
}

function grade(g) {
  if (!flipped) return;
  const c = queue[pos];
  const s = st(c.id);
  s.seen += 1; store.answers += 1;
  // фиксируем повторение сразу — засчитывается каждое, даже если тренировку прервут
  if (!store.days || typeof store.days !== "object") store.days = {};
  const dk = dayKey(new Date());
  store.days[dk] = (typeof store.days[dk] === "number" ? store.days[dk] : 0) + 1;
  if (g === "good") {
    s.good += 1; s.streak += 1;
    s.due = store.session + INTERVALS[Math.min(s.streak, INTERVALS.length - 1)];
    sessGood++;
  } else if (g === "mid") {
    s.mid += 1; s.streak = 0;
    s.due = store.session + 1; // неуверенное — уже в следующей тренировке
    sessMid++;
  } else {
    s.bad += 1; s.streak = 0;
    s.due = store.session; // неверное — как можно скорее
    sessBad++;
    sessGrades.push({ id: c.id, grade: g });
    // вернуть в эту же тренировку ещё раз (макс. +4 повтора за сессию)
    if (requeues < 4) {
      queue.splice(Math.min(pos + 3, queue.length), 0, c);
      requeues++;
      $("requeueNote").hidden = false;
      setTimeout(() => { if (queue[pos + 1]) { pos++; renderCard(); } else finishSession(); }, 650);
      save();
      return;
    }
  }
  sessGrades.push({ id: c.id, grade: g });
  save();
  pos++;
  if (pos >= queue.length) finishSession();
  else renderCard();
}

function finishSession() {
  save();
  $("viewTrain").hidden = true; $("viewDone").hidden = false;
  $("dGood").textContent = sessGood; $("dMid").textContent = sessMid; $("dBad").textContent = sessBad;
  const box = $("doneMistakes");
  box.innerHTML = "";
  const bads = sessGrades.filter((x) => x.grade === "bad").slice(-8);
  if (bads.length) {
    const h = document.createElement("p");
    h.className = "muted-small"; h.textContent = "Повтори эти формы:";
    box.appendChild(h);
    bads.forEach((g) => {
      const c = cardById[g.id];
      const d = document.createElement("div");
      d.className = "mistake";
      d.innerHTML = "<span></span><b></b>";
      d.children[0].textContent = c.ru;
      d.children[1].textContent = c.fr;
      box.appendChild(d);
    });
  } else if (sessGood + sessMid + sessBad > 0) {
    const p = document.createElement("p");
    p.className = "muted-small"; p.textContent = "Ошибок нет — так держать! 🎉";
    box.appendChild(p);
  }
  renderStats(); renderVerbs(); updateSessionPill();
}

// ---------- статистика ----------
function formStats() {
  const r = { new: 0, learning: 0, learned: 0, difficult: 0 };
  CARDS.forEach((c) => { r[statusOf(st(c.id))]++; });
  return r;
}
function verbStatus(vi) {
  const v = VERB_DATA[vi];
  let seenAny = false, allLearned = true, hasHard = false;
  for (const f of v.forms) {
    const s = statusOf(st(v.inf + ":" + f.key));
    if (s !== "new") seenAny = true;
    if (s !== "learned") allLearned = false;
    if (s === "difficult") hasHard = true;
  }
  if (!seenAny) return "new";
  if (allLearned) return "learned";
  if (hasHard) return "hard";
  return "learning";
}
const RU_STATUS = { new: "Новый", learning: "В изучении", learned: "Выучен", hard: "Сложный" };

function renderStats() {
  const f = formStats();
  const total = CARDS.length || 1;
  $("stNew").textContent = f.new; $("stLearning").textContent = f.learning;
  $("stLearned").textContent = f.learned; $("stHard").textContent = f.difficult;
  $("barNew").style.width = (f.new / total * 100) + "%";
  $("barLearning").style.width = (f.learning / total * 100) + "%";
  $("barLearned").style.width = (f.learned / total * 100) + "%";
  $("barHard").style.width = (f.difficult / total * 100) + "%";
  $("formsTotal").textContent = "· " + CARDS.length;

  const vs = { new: 0, learning: 0, learned: 0, hard: 0 };
  VERB_DATA.forEach((_, i) => { vs[verbStatus(i)]++; });
  const vt = VERB_DATA.length || 1;
  $("vNew").textContent = vs.new; $("vLearning").textContent = vs.learning;
  $("vLearned").textContent = vs.learned; $("vHard").textContent = vs.hard;
  $("vbarNew").style.width = (vs.new / vt * 100) + "%";
  $("vbarLearning").style.width = (vs.learning / vt * 100) + "%";
  $("vbarLearned").style.width = (vs.learned / vt * 100) + "%";
  $("vbarHard").style.width = (vs.hard / vt * 100) + "%";
  $("verbsTotal").textContent = "· " + VERB_DATA.length;
  $("footCount").textContent = VERB_DATA.length + " глаголов · " + CARDS.length + " форм";
  renderStorageInfo();
  renderCal();
  renderProns();
}

// ---------- тренировка по лицам ----------
const PRON_RU = { je: "я", tu: "ты", il: "он", elle: "она", on: "on", nous: "мы", vous: "вы", ils: "они (м.)", elles: "они (ж.)" };
const PRON_ORDER = ["je", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles"];
function renderProns() {
  const box = $("pronList");
  if (!box) return;
  box.innerHTML = "";
  PRON_ORDER.forEach((p) => {
    const cards = CARDS.filter((c) => c.key.split("#")[0] === p);
    if (!cards.length) return;
    let learned = 0;
    cards.forEach((c) => { if (statusOf(st(c.id)) === "learned") learned++; });
    const b = document.createElement("button");
    b.className = "btn btn-soft pron-btn";
    b.innerHTML = "<b></b><span></span><small></small>";
    b.children[0].textContent = p;
    b.children[1].textContent = PRON_RU[p];
    b.children[2].textContent = learned + "/" + cards.length;
    b.onclick = () => startSession({ pron: p });
    box.appendChild(b);
  });
}

// ---------- календарь активности за год ----------
const RU_M_S = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
const RU_M_G = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
function plural(n, one, few, many) {
  n = Math.abs(n) % 100;
  const d = n % 10;
  if (n > 10 && n < 20) return many;
  if (d > 1 && d < 5) return few;
  if (d === 1) return one;
  return many;
}
function dayKey(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function renderCal() {
  const grid = $("calGrid");
  if (!grid) return;
  const months = $("calMonths");
  grid.innerHTML = ""; months.innerHTML = "";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const N = 365; // последний год, включая сегодня
  const start = new Date(today); start.setDate(start.getDate() - (N - 1));
  const dates = [];
  for (let i = 0; i < N; i++) { const d = new Date(start); d.setDate(start.getDate() + i); dates.push(d); }
  // раскладка неделями с понедельника (как столбцы): добиваем начало пустыми клетками
  const lead = (start.getDay() + 6) % 7;
  const weeks = []; let w = new Array(lead).fill(null);
  dates.forEach((d) => { w.push(d); if (w.length === 7) { weeks.push(w); w = []; } });
  if (w.length) { while (w.length < 7) w.push(null); weeks.push(w); }
  const countOf = (d) => (store.days && store.days[dayKey(d)]) || 0;
  weeks.forEach((week) => week.forEach((d) => {
    const el = document.createElement(d ? "div" : "span");
    if (!d) { el.className = "cal-day pad"; grid.appendChild(el); return; }
    const n = countOf(d);
    el.className = "cal-day " + (n === 0 ? "l0" : n <= 4 ? "l1" : n <= 9 ? "l2" : n <= 19 ? "l3" : "l4");
    el.title = d.getDate() + " " + RU_M_G[d.getMonth()] + " " + d.getFullYear() + " — " + n + " " + plural(n, "повторение", "повторения", "повторений");
    grid.appendChild(el);
  }));
  // подписи месяцев над столбцами
  const pickM = (week) => { for (const k of [3, 4, 2, 5, 1, 6, 0]) { if (week[k]) return week[k].getMonth(); } return 0; };
  let curM = pickM(weeks[0]), span = 1;
  const flush = () => {
    const el = document.createElement("div");
    el.className = "cal-mlabel"; el.textContent = RU_M_S[curM];
    el.style.gridColumn = "span " + span;
    months.appendChild(el);
  };
  for (let i = 1; i < weeks.length; i++) {
    const m = pickM(weeks[i]);
    if (m === curM) span++;
    else { flush(); curM = m; span = 1; }
  }
  flush();
  // итоги: всего сессий за год + серия дней подряд
  let total = 0;
  dates.forEach((d) => { total += countOf(d); });
  let streak = 0;
  const t = new Date(today);
  if (!countOf(t)) t.setDate(t.getDate() - 1); // сегодня ещё без тренировки — считаем от вчера
  while (countOf(t) > 0) { streak++; t.setDate(t.getDate() - 1); }
  $("calTotal").textContent = "Повторений за год: " + total;
  $("calStreak").textContent = "🔥 Серия: " + streak + " " + plural(streak, "день", "дня", "дней");
  // по умолчанию показываем правую (самую новую) часть календаря
  const wrap = $("calGrid").parentNode;
  if (wrap) wrap.scrollLeft = wrap.scrollWidth;
}

function renderVerbs(filter) {
  const box = $("verbList");
  box.innerHTML = "";
  const q = (filter || "").trim().toLowerCase();
  VERB_DATA.forEach((v, i) => {
    if (q && !(v.inf.toLowerCase().includes(q) || v.ru.toLowerCase().includes(q))) return;
    let learned = 0;
    v.forms.forEach((fm) => { if (statusOf(st(v.inf + ":" + fm.key)) === "learned") learned++; });
    const s = verbStatus(i);
    const el = document.createElement("div");
    el.className = "verb-item";
    el.innerHTML =
      '<div class="vi-top"><span class="vi-inf"></span><span class="badge"></span></div>' +
      '<div class="vi-ru"></div><div class="vi-bar"><i></i></div>' +
      '<div class="vi-meta"><span></span><span></span></div>' +
      '<button class="btn btn-soft vi-train">▶ Тренировать этот глагол</button>';
    el.querySelector(".vi-inf").textContent = v.inf;
    el.querySelector(".vi-ru").textContent = v.ru;
    const b = el.querySelector(".badge");
    b.textContent = RU_STATUS[s];
    b.classList.add("b-" + s);
    el.querySelector(".vi-bar i").style.width = (v.forms.length ? learned / v.forms.length * 100 : 0) + "%";
    el.querySelector(".vi-meta").children[0].textContent = learned + "/" + v.forms.length + " форм";
    el.querySelector(".vi-meta").children[1].textContent = v.forms.length + " лиц";
    el.querySelector(".vi-train").onclick = (e) => { e.stopPropagation(); startSession({ verb: i }); };
    box.appendChild(el);
  });
}

function updateSessionPill() { $("sessionPill").textContent = "Сессия " + store.session; }

// ---------- справка ----------
let helpReturn = "home";
function showHelp() {
  helpReturn = !$("viewTrain").hidden ? "train" : (!$("viewDone").hidden ? "done" : "home");
  ["viewHome", "viewTrain", "viewDone"].forEach((id) => { $(id).hidden = true; });
  $("viewHelp").hidden = false;
  window.scrollTo(0, 0);
}
function goBack() {
  $("viewHelp").hidden = true;
  if (helpReturn === "train" || helpReturn === "done") {
    $(helpReturn === "train" ? "viewTrain" : "viewDone").hidden = false; // тренировка/итог живы — состояние не теряем
  } else {
    goHome();
  }
}

// Сводка сохранённых данных для раздела "Данные"
function renderStorageInfo() {
  const el = $("storageInfo");
  if (!el) return;
  const n = Object.keys(store.progress).length;
  let kb = 0;
  try { kb = ((localStorage.getItem(LS_KEY) || "").length / 1024); }
  catch (e) { /* localStorage недоступен */ }
  if (!n && !store.session) {
    el.textContent = "💾 Сохранённый прогресс: пока пусто — пройди первую тренировку, и здесь появится сводка.";
  } else {
    el.textContent = "💾 Сохранено: форм с прогрессом — " + n + " из " + CARDS.length +
      " · сессий — " + store.session + " · ответов — " + store.answers +
      " · ~" + kb.toFixed(1) + " КБ в localStorage.";
  }
}
function goHome() {
  $("viewTrain").hidden = true; $("viewDone").hidden = true; $("viewHelp").hidden = true; $("viewHome").hidden = false;
  $("btnHome").hidden = true;
  renderStats(); renderVerbs($("verbSearch").value);
}

// ---------- события ----------
$("btnStart").onclick = () => startSession({});
$("btnAgain").onclick = () => startSession({});
$("btnReviewHard").onclick = () => startSession({ onlyDifficult: true });
$("btnToHome").onclick = goHome;
$("btnHome").onclick = goHome;
$("btnHelp").onclick = () => { $("viewHelp").hidden ? showHelp() : goBack(); }; // повторный клик закрывает
$("btnHelpBack").onclick = goBack;
$("card").addEventListener("click", (e) => {
  if (e.target.closest(".grade-btns") || e.target.closest("#hintBtn")) return;
  flipped ? unflip() : flip(); // клик — туда-обратно, как пробел
});
// Горячие клавиши — на уровне документа, чтобы работали без клика по карточке
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { // Esc — назад (из справки) или на главную (из тренировки/итогов)
    if (!$("viewHelp").hidden) goBack();
    else if (!$("viewTrain").hidden || !$("viewDone").hidden) goHome();
    return;
  }
  const tag = (document.activeElement && document.activeElement.tagName) || "";
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return; // не мешаем вводу текста
  if (!$("viewHome").hidden) { // главный экран: Enter — старт тренировки
    if (e.key === "Enter") startSession({});
    return;
  }
  if ($("viewTrain").hidden) return; // дальше — только экран тренировки
  if (e.key === " ") { e.preventDefault(); flipped ? unflip() : flip(); } // пробел — туда-обратно
  if (!flipped) return;
  if (e.key === "1") grade("bad");
  if (e.key === "2") grade("mid");
  if (e.key === "3") grade("good");
});
document.querySelectorAll(".grade-btns .btn").forEach((b) => {
  b.addEventListener("click", (e) => { e.stopPropagation(); grade(b.dataset.grade); });
});
$("hintBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  $("hintPop").hidden = !$("hintPop").hidden; // подсказка: инфинитив
});
$("verbSearch").addEventListener("input", (e) => renderVerbs(e.target.value));
$("btnReset").onclick = () => {
  if (confirm("Точно сбросить весь прогресс? Это удалит все интервалы повторений.")) {
    store = { progress: {}, session: 0, answers: 0, days: {} };
    save(); renderStats(); renderVerbs(); updateSessionPill();
  }
};
$("btnExport").onclick = () => {
  const blob = new Blob([JSON.stringify(store)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "conjumaster-progress.json";
  a.click();
  URL.revokeObjectURL(a.href);
};
$("fileImport").addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const s = JSON.parse(r.result);
      if (s && typeof s === "object") {
        store.progress = s.progress || {}; store.session = s.session || 0; store.answers = s.answers || 0;
        store.days = (s.days && typeof s.days === "object") ? s.days : {};
        sanitizeDays();
        save(); renderStats(); renderVerbs(); updateSessionPill();
        alert("Прогресс импортирован!");
      }
    } catch { alert("Не удалось прочитать файл."); }
  };
  r.readAsText(f);
});

// ---------- старт ----------
load();
renderStats(); renderVerbs(); updateSessionPill();
