'use strict';

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => [...(r || document).querySelectorAll(s)];

const LS = {
  get(k, d) {
    try {
      const v = localStorage.getItem('suomi_' + k);
      return v === null ? d : JSON.parse(v);
    } catch { return d; }
  },
  set(k, v) {
    try { localStorage.setItem('suomi_' + k, JSON.stringify(v)); } catch { /* lokal nicht verfügbar */ }
  },
};

const LEVELS = [
  { xp: 0,    name: 'Aloittelija',   icon: '🌱' },
  { xp: 150,  name: 'Harjoittelija', icon: '📖' },
  { xp: 400,  name: 'Oppija',        icon: '🎓' },
  { xp: 700,  name: 'Taitaja',       icon: '💪' },
  { xp: 1100, name: 'Mestari',       icon: '👑' },
  { xp: 1600, name: 'Suomalainen',   icon: '🇫🇮' },
];

const ROUND_LENGTH = 10;
const BLITZ_SECONDS = 60;

const state = {
  xp: LS.get('xp', 0),
  streakDays: LS.get('streakDays', 0),
  lastPlay: LS.get('lastPlay', null),
  bestBlitz: LS.get('bestBlitz', 0),
  known: new Set(LS.get('known', [])),
  sound: LS.get('sound', true),
  category: 'alle',
  roundMode: 'quiz',
  questions: [],
  qIndex: 0,
  correct: 0,
  streak: 0,
  roundXP: 0,
  mistakes: [],
  blitzTime: BLITZ_SECONDS,
  blitzScore: 0,
  blitzTimer: null,
  cardQueue: [],
  cardIndex: 0,
  cardFlipped: false,
  cardKnown: 0,
};

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const pick = a => a[Math.floor(Math.random() * a.length)];

function norm(s) {
  return String(s).toLowerCase().trim()
    .replace(/[.,!?;:'"()„“”‘’\-–]/g, '')
    .replace(/\s+/g, ' ');
}

function acceptable(answer, input) {
  const n = norm(input);
  if (!n) return false;
  return norm(answer).split('/').map(norm).includes(n);
}

function levelIndex(xp) {
  let i = 0;
  for (let k = 0; k < LEVELS.length; k++) if (xp >= LEVELS[k].xp) i = k;
  return i;
}

function pool() {
  return state.category === 'alle' ? WORDS : WORDS.filter(w => w.cat === state.category);
}

function makeQuestion(word) {
  const w = word || pick(pool());
  const p = pool();
  const dir = Math.random() < 0.5 ? 'fi-de' : 'de-fi';
  let cands = p.filter(x => x !== w);
  if (cands.length < 3) cands = WORDS.filter(x => x !== w);
  const distractors = shuffle([...cands]).slice(0, 3);
  return { word: w, dir, options: shuffle([w, ...distractors]), answered: false };
}

let audioCtx = null;
function beep(freq, dur, type, when, vol) {
  if (!state.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime + (when || 0);
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (dur || 0.12));
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t); o.stop(t + (dur || 0.12) + 0.02);
  } catch { /* Audio nicht verfügbar */ }
}

function sfx(name) {
  if (name === 'correct') { beep(660, 0.12); beep(880, 0.18, 'sine', 0.1); }
  else if (name === 'wrong') { beep(160, 0.28, 'sawtooth', 0, 0.1); }
  else if (name === 'click') { beep(440, 0.06, 'triangle', 0, 0.07); }
  else if (name === 'level') { beep(523, 0.12); beep(659, 0.12, 'sine', 0.12); beep(784, 0.12, 'sine', 0.24); beep(1047, 0.32, 'sine', 0.36); }
}

function registerPlay() {
  const today = new Date().toISOString().slice(0, 10);
  if (state.lastPlay === today) return;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  state.streakDays = state.lastPlay === yesterday ? state.streakDays + 1 : 1;
  state.lastPlay = today;
  LS.set('streakDays', state.streakDays);
  LS.set('lastPlay', today);
  updateStats();
}

function addXP(n) {
  if (n <= 0) { updateStats(); return; }
  const before = levelIndex(state.xp);
  state.xp += n;
  LS.set('xp', state.xp);
  const after = levelIndex(state.xp);
  if (after > before) levelUp(LEVELS[after]);
  updateStats();
}

function levelUp(lvl) {
  confetti();
  sfx('level');
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `${lvl.icon} Level aufgestiegen: <b>${lvl.name}</b>!`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

function confetti() {
  const layer = $('#confetti-layer');
  if (!layer) return;
  layer.innerHTML = '';
  const colors = ['#002F6C', '#ffffff', '#e63946', '#f4d35e', '#06d6a0', '#ff8fab'];
  for (let i = 0; i < 80; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = colors[i % colors.length];
    c.style.animationDelay = Math.random() * 0.4 + 's';
    c.style.animationDuration = 1.8 + Math.random() * 1.2 + 's';
    layer.appendChild(c);
  }
  setTimeout(() => { layer.innerHTML = ''; }, 3400);
}

function showScreen(name) {
  for (const s of ['home', 'game', 'cards']) $('#screen-' + s).classList.toggle('hidden', s !== name);
  $('#btn-home').classList.toggle('hidden', name === 'home');
  window.scrollTo(0, 0);
}

function updateStats() {
  const li = levelIndex(state.xp);
  const lvl = LEVELS[li];
  const next = LEVELS[li + 1];
  const pct = next ? Math.min(100, Math.round(((state.xp - lvl.xp) / (next.xp - lvl.xp)) * 100)) : 100;
  $('#stats-bar').innerHTML = `
    <div class="stat"><span class="stat-ico">${lvl.icon}</span><div><b>${lvl.name}</b><small>Level ${li + 1}</small></div></div>
    <div class="stat grow"><small>XP ${state.xp}${next ? ' / ' + next.xp : ''}</small>
      <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div></div>
    <div class="stat"><span class="stat-ico">🔥</span><div><b>${state.streakDays}</b><small>Tage in Folge</small></div></div>
    <div class="stat"><span class="stat-ico">✅</span><div><b>${state.known.size}</b><small>Wörter bekannt</small></div>`;
}

function renderHome() {
  const counts = {};
  for (const w of WORDS) counts[w.cat] = (counts[w.cat] || 0) + 1;
  const modes = [
    { id: 'quiz',   icon: '🎯', title: 'Quiz',       desc: 'Multiple Choice – 10 Fragen pro Runde' },
    { id: 'typing', icon: '⌨️', title: 'Schreiben',  desc: 'Übersetzung selbst eintippen (+15 XP)' },
    { id: 'cards',  icon: '🃏', title: 'Karteikarten', desc: 'Karten umdrehen und als „bekannt“ markieren' },
    { id: 'blitz',  icon: '⚡', title: 'Blitzrunde', desc: `${BLITZ_SECONDS} Sekunden – so viele wie möglich!` },
  ];
  $('#screen-home').innerHTML = `
    <div class="card hero">
      <h2>Lerne Finnisch – spielerisch! 🇫🇮</h2>
      <p>Wähle einen Modus und eine Kategorie. Richtige Antworten bringen XP, Fehler gehören zum Lernen dazu. Baue jeden Tag eine Serie auf!</p>
      <div class="tip">💡 <b>Aussprache:</b> Finnisch wird fast so gesprochen, wie es geschrieben wird. <b>Ä</b> wie „ä“ in „Mädchen“, <b>Ö</b> wie „ö“ in „schön“, <b>Y</b> wie „ü“. Doppelbuchstaben (aa, ll, ss …) werden lang gezogen.</div>
      <div class="tip fact">🧠 <b>Wusstest du?</b> ${escapeHTML(pick(FUN_FACTS))}</div>
    </div>
    <h3 class="section-title">Spielmodus</h3>
    <div class="mode-grid">
      ${modes.map(m => `<button class="mode-card" data-mode="${m.id}"><span class="mode-icon">${m.icon}</span><b>${m.title}</b><small>${m.desc}</small></button>`).join('')}
    </div>
    <h3 class="section-title">Kategorie</h3>
    <div class="chips">
      ${CATEGORIES.map(c => `<button class="chip ${state.category === c.id ? 'active' : ''}" data-cat="${c.id}">${c.icon} ${c.name}${c.id !== 'alle' ? ` <em>${counts[c.id] || 0}</em>` : ''}</button>`).join('')}
    </div>
    ${state.bestBlitz > 0 ? `<p class="blitz-best">⚡ Dein bester Blitz: <b>${state.bestBlitz}</b> Punkte</p>` : ''}
    <p class="footnote">Dein Fortschritt wird lokal in diesem Browser gespeichert – die App läuft komplett offline.</p>`;
  $$('#screen-home .mode-card').forEach(b => b.addEventListener('click', () => {
    sfx('click');
    startMode(b.dataset.mode);
  }));
  $$('#screen-home .chip').forEach(b => b.addEventListener('click', () => {
    sfx('click');
    state.category = b.dataset.cat;
    renderHome();
  }));
}

function startMode(mode) {
  if (mode === 'cards') startCards();
  else if (mode === 'blitz') startBlitz();
  else startRound(mode);
}

function startRound(mode) {
  const p = pool();
  if (p.length < 2) return;
  state.roundMode = mode;
  state.questions = shuffle([...p]).slice(0, Math.min(ROUND_LENGTH, p.length)).map(w => makeQuestion(w));
  state.qIndex = 0;
  state.correct = 0;
  state.streak = 0;
  state.roundXP = 0;
  state.mistakes = [];
  showScreen('game');
  renderQuestion();
}

function renderQuestion() {
  const q = state.questions[state.qIndex];
  const promptLang = q.dir === 'fi-de' ? 'fi' : 'de';
  const answerLang = q.dir === 'fi-de' ? 'de' : 'fi';
  const promptLabel = q.dir === 'fi-de' ? '🇫🇮 Finnisch' : '🇩🇪 Deutsch';
  const answerLabel = q.dir === 'fi-de' ? 'Übersetzung auf Deutsch' : 'Übersetzung auf Finnisch';
  const body = state.roundMode === 'quiz'
    ? `<div class="options">${q.options.map(o => `<button class="option" data-fi="${escapeHTML(o.fi)}">${escapeHTML(o[answerLang])}</button>`).join('')}</div>`
    : `<div class="typing-row">
         <input id="typing-input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Antwort eingeben …">
         <button id="btn-check" class="btn primary">Prüfen ✓</button>
       </div>
       <button id="btn-hint" class="btn ghost">💡 Tipp: erster Buchstabe</button>
       <div id="hint-box" class="hint hidden"></div>`;
  $('#screen-game').innerHTML = `
    <div class="game-top">
      <div class="progress-text">Frage ${state.qIndex + 1} / ${state.questions.length}</div>
      <div class="streak ${state.streak >= 2 ? 'hot' : ''}">${state.streak >= 2 ? '🔥 ' : ''}${state.streak} Serie</div>
    </div>
    <div class="bar big"><div class="bar-fill" style="width:${(state.qIndex / state.questions.length) * 100}%"></div></div>
    <div class="card question-card">
      <div class="lang-label">${promptLabel}</div>
      <div class="prompt">${escapeHTML(q.word[promptLang])}</div>
      <div class="lang-label sub">${answerLabel}</div>
      ${body}
    </div>
    <div id="feedback" class="feedback hidden"></div>
    <button id="btn-next" class="btn primary hidden">Weiter ➜</button>`;

  if (state.roundMode === 'quiz') {
    $$('#screen-game .option').forEach(btn => btn.addEventListener('click', () => handleQuizAnswer(btn, q)));
  } else {
    const input = $('#typing-input');
    $('#btn-check').addEventListener('click', () => handleTypingAnswer(q, input.value));
    input.addEventListener('keydown', e => { if (e.key === 'Enter') handleTypingAnswer(q, input.value); });
    $('#btn-hint').addEventListener('click', () => {
      const hb = $('#hint-box');
      hb.classList.remove('hidden');
      hb.textContent = `Beginnt mit „${q.word[answerLang][0]}…“ (${q.word[answerLang].length} Buchstaben)`;
      sfx('click');
    });
    input.focus();
  }
  $('#btn-next').addEventListener('click', () => {
    sfx('click');
    state.qIndex++;
    if (state.qIndex >= state.questions.length) endRound();
    else renderQuestion();
  });
}

function handleQuizAnswer(btn, q) {
  if (q.answered) return;
  const ok = btn.dataset.fi === q.word.fi;
  finishAnswer(ok, q);
  $$('#screen-game .option').forEach(b => {
    b.disabled = true;
    if (b.dataset.fi === q.word.fi) b.classList.add('correct');
    else if (b === btn && !ok) b.classList.add('wrong');
  });
}

function handleTypingAnswer(q, value) {
  if (q.answered) return;
  const answerLang = q.dir === 'fi-de' ? 'de' : 'fi';
  const ok = acceptable(q.word[answerLang], value);
  finishAnswer(ok, q);
  const input = $('#typing-input');
  if (input) input.disabled = true;
  const check = $('#btn-check');
  if (check) check.disabled = true;
}

function finishAnswer(ok, q) {
  q.answered = true;
  const answerLang = q.dir === 'fi-de' ? 'de' : 'fi';
  const fb = $('#feedback');
  let xp = 0;
  if (ok) {
    state.correct++;
    state.streak++;
    const bonus = state.streak >= 5 ? 5 : 0;
    xp = (state.roundMode === 'typing' ? 15 : 10) + bonus;
    state.roundXP += xp;
    fb.className = 'feedback ok';
    fb.innerHTML = `✅ Richtig! <b>+${xp} XP</b>${bonus ? ' 🔥 Streak-Bonus!' : ''}`;
    sfx('correct');
  } else {
    state.streak = 0;
    state.mistakes.push(q.word);
    fb.className = 'feedback bad';
    fb.innerHTML = `❌ Nicht ganz. Richtig: <b>${escapeHTML(q.word.fi)}</b> = ${escapeHTML(q.word[answerLang])}`;
    sfx('wrong');
  }
  registerPlay();
  addXP(xp);
  fb.classList.remove('hidden');
  const next = $('#btn-next');
  next.classList.remove('hidden');
  next.textContent = state.qIndex + 1 >= state.questions.length ? 'Ergebnis 🏁' : 'Weiter ➜';
}

function endRound() {
  const total = state.questions.length;
  const pct = Math.round((state.correct / total) * 100);
  const msg = pct === 100 ? 'Täydellinen! Perfekt! 🏆' : pct >= 70 ? 'Hienoa! Sehr gut! 🎉' : pct >= 40 ? 'Hyvä! Weiter so! 👍' : 'Harjoitus macht den Meister! 🌱';
  $('#screen-game').innerHTML = `
    <div class="card result-card">
      <div class="result-emoji">${pct === 100 ? '🏆' : pct >= 70 ? '🎉' : pct >= 40 ? '😊' : '🌱'}</div>
      <h2>${msg}</h2>
      <p class="big-score">${state.correct} / ${total} richtig (${pct} %)</p>
      <p>⭐ <b>+${state.roundXP} XP</b> in dieser Runde gesammelt</p>
      ${state.mistakes.length ? `<div class="mistakes"><h3>📖 Zum Nachschlagen:</h3><ul>${state.mistakes.map(w => `<li><b>${escapeHTML(w.fi)}</b> – ${escapeHTML(w.de)}</li>`).join('')}</ul></div>` : '<p>Keine Fehler – stark! 💪</p>'}
      <div class="btn-row">
        <button id="btn-again" class="btn primary">🔁 Nochmal</button>
        <button id="btn-home2" class="btn ghost">🏠 Startseite</button>
      </div>
    </div>`;
  $('#btn-again').addEventListener('click', () => { sfx('click'); startRound(state.roundMode); });
  $('#btn-home2').addEventListener('click', () => { sfx('click'); goHome(); });
}

function startBlitz() {
  const p = pool();
  if (p.length < 4) return;
  stopBlitz();
  state.blitzTime = BLITZ_SECONDS;
  state.blitzScore = 0;
  showScreen('game');
  renderBlitzQuestion();
  state.blitzTimer = setInterval(() => {
    state.blitzTime -= 0.1;
    const bar = $('#blitz-bar-fill');
    if (bar) bar.style.width = Math.max(0, (state.blitzTime / BLITZ_SECONDS) * 100) + '%';
    const t = $('#blitz-time');
    if (t) t.textContent = Math.max(0, Math.ceil(state.blitzTime)) + 's';
    if (state.blitzTime <= 0) endBlitz();
  }, 100);
}

function stopBlitz() {
  if (state.blitzTimer) { clearInterval(state.blitzTimer); state.blitzTimer = null; }
}

function renderBlitzQuestion() {
  const q = makeQuestion();
  const promptLang = q.dir === 'fi-de' ? 'fi' : 'de';
  const answerLang = q.dir === 'fi-de' ? 'de' : 'fi';
  $('#screen-game').innerHTML = `
    <div class="game-top">
      <div class="blitz-score">⚡ <b id="blitz-score">${state.blitzScore}</b></div>
      <div class="blitz-time" id="blitz-time">${Math.ceil(state.blitzTime)}s</div>
    </div>
    <div class="bar big blitz"><div class="bar-fill" id="blitz-bar-fill" style="width:100%"></div></div>
    <div class="card question-card">
      <div class="lang-label">${q.dir === 'fi-de' ? '🇫🇮 Finnisch' : '🇩🇪 Deutsch'}</div>
      <div class="prompt">${escapeHTML(q.word[promptLang])}</div>
      <div class="options">${q.options.map(o => `<button class="option" data-fi="${escapeHTML(o.fi)}">${escapeHTML(o[answerLang])}</button>`).join('')}</div>
    </div>`;
  $$('#screen-game .option').forEach(btn => btn.addEventListener('click', () => {
    const ok = btn.dataset.fi === q.word.fi;
    if (ok) { state.blitzScore++; sfx('correct'); btn.classList.add('correct'); }
    else {
      sfx('wrong');
      btn.classList.add('wrong');
      $$('#screen-game .option').forEach(b => { if (b.dataset.fi === q.word.fi) b.classList.add('correct'); });
    }
    $('#blitz-score').textContent = state.blitzScore;
    $$('#screen-game .option').forEach(b => { b.disabled = true; });
    setTimeout(() => { if (state.blitzTime > 0) renderBlitzQuestion(); }, ok ? 200 : 550);
  }));
}

function endBlitz() {
  stopBlitz();
  registerPlay();
  const isBest = state.blitzScore > state.bestBlitz;
  if (isBest) { state.bestBlitz = state.blitzScore; LS.set('bestBlitz', state.bestBlitz); }
  if (isBest && state.blitzScore > 0) { confetti(); sfx('level'); }
  $('#screen-game').innerHTML = `
    <div class="card result-card">
      <div class="result-emoji">${isBest && state.blitzScore >= 10 ? '🏆' : '⚡'}</div>
      <h2>Zeit um!</h2>
      <p class="big-score">${state.blitzScore} richtige Antworten</p>
      <p>${isBest ? '🎉 Neuer persönlicher Rekord!' : `Dein Rekord: <b>${state.bestBlitz}</b>`}</p>
      <div class="btn-row">
        <button id="btn-again" class="btn primary">⚡ Nochmal</button>
        <button id="btn-home2" class="btn ghost">🏠 Startseite</button>
      </div>
    </div>`;
  $('#btn-again').addEventListener('click', () => { sfx('click'); startBlitz(); });
  $('#btn-home2').addEventListener('click', () => { sfx('click'); goHome(); });
}

function startCards() {
  const p = pool();
  if (!p.length) return;
  state.cardQueue = shuffle([...p]);
  state.cardIndex = 0;
  state.cardFlipped = false;
  state.cardKnown = 0;
  showScreen('cards');
  renderCard();
}

function renderCard() {
  const w = state.cardQueue[state.cardIndex];
  const total = state.cardQueue.length;
  $('#screen-cards').innerHTML = `
    <div class="game-top"><div class="progress-text">Karte ${state.cardIndex + 1} / ${total}</div>
      <div class="streak">✅ ${state.known.size} bekannt</div></div>
    <div class="bar big"><div class="bar-fill" style="width:${(state.cardIndex / total) * 100}%"></div></div>
    <div class="flashcard ${state.cardFlipped ? 'flipped' : ''}" id="flashcard" role="button" tabindex="0" aria-label="Karteikarte umdrehen">
      <div class="fc-face fc-front">
        <div class="lang-label">🇫🇮 Finnisch</div>
        <div class="prompt">${escapeHTML(w.fi)}</div>
        <small>Klicken zum Umdrehen</small>
      </div>
      <div class="fc-face fc-back">
        <div class="lang-label">🇩🇪 Deutsch</div>
        <div class="prompt">${escapeHTML(w.de)}</div>
      </div>
    </div>
    <div class="btn-row">
      <button id="btn-unknown" class="btn bad">🔁 Nochmal üben</button>
      <button id="btn-known" class="btn good">✅ Kann ich</button>
    </div>`;
  const flip = () => {
    state.cardFlipped = !state.cardFlipped;
    $('#flashcard').classList.toggle('flipped', state.cardFlipped);
    sfx('click');
  };
  $('#flashcard').addEventListener('click', flip);
  $('#flashcard').addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } });
  $('#btn-known').addEventListener('click', () => {
    if (!state.known.has(w.fi)) { state.known.add(w.fi); state.cardKnown++; LS.set('known', [...state.known]); }
    sfx('correct');
    nextCard();
  });
  $('#btn-unknown').addEventListener('click', () => { sfx('click'); nextCard(); });
}

function nextCard() {
  state.cardIndex++;
  state.cardFlipped = false;
  if (state.cardIndex >= state.cardQueue.length) {
    updateStats();
    $('#screen-cards').innerHTML = `
      <div class="card result-card">
        <div class="result-emoji">🎉</div>
        <h2>Alle Karten durch!</h2>
        <p class="big-score">${state.cardKnown} als „bekannt“ markiert</p>
        <p>Insgesamt kennst du jetzt <b>${state.known.size}</b> Wörter. 🇫🇮</p>
        <div class="btn-row">
          <button id="btn-again" class="btn primary">🃏 Nochmal</button>
          <button id="btn-home2" class="btn ghost">🏠 Startseite</button>
        </div>
      </div>`;
    $('#btn-again').addEventListener('click', () => { sfx('click'); startCards(); });
    $('#btn-home2').addEventListener('click', () => { sfx('click'); goHome(); });
  } else {
    renderCard();
  }
}

function goHome() {
  stopBlitz();
  showScreen('home');
  renderHome();
  updateStats();
}

function init() {
  $('#btn-sound').textContent = state.sound ? '🔊' : '🔇';
  $('#btn-sound').addEventListener('click', () => {
    state.sound = !state.sound;
    LS.set('sound', state.sound);
    $('#btn-sound').textContent = state.sound ? '🔊' : '🔇';
    sfx('click');
  });
  $('#btn-home').addEventListener('click', () => { sfx('click'); goHome(); });
  goHome();
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', init);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { norm, acceptable, shuffle, levelIndex, makeQuestion, pool, state, LEVELS };
}
