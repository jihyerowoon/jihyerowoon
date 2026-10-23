/* PQ4R 튜터 MVP(1차시 삼각형의 합동 · 2차시 평행사변형의 성질) — 화면. 판정·발문 선택·기록은 모두 서버(/api/v1)가 한다. */
(function () {
  'use strict';
  var C = null, ITEM = {}, WORKSHEETS = null;
  var STAGE_KEYS = ['preview', 'question', 'read', 'reflect', 'recite', 'review'];

  /* ---------- 공통 도구 ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(s) { return esc(s).replace(/\{([A-FO]{2})\}/g, '<span class="seg">$1</span>'); }
  function plain(s) { return String(s == null ? '' : s).replace(/\{([A-FO]{2})\}/g, '$1'); }
  function nowMs() { return Date.now() + App.skew; }
  function kst(iso, withDate) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleString('ko-KR', withDate ? { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false } : { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); } catch (e) { return iso; }
  }
  function mmss(sec) { sec = Math.max(0, Math.floor(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function toast(msg, kind) {
    var t = document.createElement('div'); t.className = 'toast' + (kind ? ' ' + kind : ''); t.textContent = msg;
    $('#toasts').appendChild(t); setTimeout(function () { t.classList.add('out'); }, 2800); setTimeout(function () { t.remove(); }, 3300);
  }
  function groupKo(g) { return g === 'EXPERIMENT' ? '실험집단' : g === 'CONTROL' ? '통제집단' : '-'; }
  function supporterKo(g) { return g === 'EXPERIMENT' ? 'AI 튜터' : '선생님'; }
  function store(k, v) { try { if (v === undefined) { var x = localStorage.getItem(k); return x ? JSON.parse(x) : null; } if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } return null; }

  var App = { role: null, tok: null, tid: null, skew: 0, timers: [], screen: null };
  function cleanup() { App.timers.forEach(function (t) { clearInterval(t); clearTimeout(t); }); App.timers = []; MatViewer.close('SCREEN'); }

  /* ---------- 서버 통신 ---------- */
  var Net = {
    ok: true,
    set: function (v) { if (v === this.ok) return; this.ok = v; var b = $('#netbar'); if (b) b.hidden = v; }
  };
  function api(method, path, body) {
    var headers = { 'Accept': 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (App.tok) headers['Authorization'] = 'Bearer ' + App.tok;
    return fetch('/api/v1/' + path, { method: method, headers: headers, body: body !== undefined ? JSON.stringify(body) : undefined, cache: 'no-store' })
      .then(function (r) {
        Net.set(true);
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (j && j.server_time) App.skew = Date.parse(j.server_time) - Date.now();
          if (r.status === 401 && App.tok && path.indexOf('login/') !== 0) { logout('로그인이 끝났어요. 다시 들어와 주세요.'); }
          if (!r.ok) { var e = new Error((j && j.error) || ('오류 ' + r.status)); e.status = r.status; e.code = j && j.code; throw e; }
          return j;
        });
      }, function () { Net.set(false); var e = new Error('서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.'); e.network = true; throw e; });
  }
  function download(path) {
    return fetch('/api/v1/' + path, { headers: { Authorization: 'Bearer ' + App.tok }, cache: 'no-store' }).then(function (r) {
      if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || '내려받지 못했어요.'); });
      var cd = r.headers.get('Content-Disposition') || '', m = /filename="([^"]+)"/.exec(cd);
      return r.blob().then(function (b) {
        var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = m ? m[1] : 'pq4r_download'; a.style.display = 'none'; a.textContent = a.download;
        document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
        toast('파일을 내려받았어요: ' + a.download);
      });
    }).catch(function (e) { toast(e.message, 'crit'); });
  }

  /* ---------- 로그인 정보 ---------- */
  var AUTH_KEY = 'pq4r:auth';
  function tokenExp(tok) { try { var p = tok.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'); while (p.length % 4) p += '='; return JSON.parse(decodeURIComponent(escape(atob(p)))).exp || 0; } catch (e) { return 0; } }
  /* 탭마다 따로(sessionStorage) 두고, 새로 연 탭은 마지막 로그인(localStorage)으로 이어 간다 */
  function tabStore(k, v) { try { if (v === undefined) { var x = sessionStorage.getItem(k); return x ? JSON.parse(x) : null; } if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } return null; }
  function valid(a) { return a && a.token && tokenExp(a.token) > Date.now() / 1000 + 60 ? a : null; }
  function saveAuth(a) {
    tabStore(AUTH_KEY, a); store(AUTH_KEY, a);
    if (/^#login/.test(location.hash)) try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
  }
  function loadAuth() { return valid(tabStore(AUTH_KEY)) || valid(store(AUTH_KEY)); }
  function logout(msg) {
    var mine = App.tok, shared = store(AUTH_KEY);
    tabStore(AUTH_KEY, null); if (shared && shared.token === mine) store(AUTH_KEY, null);
    App.tok = null; App.role = null;
    cleanup(); renderEntry(); if (msg) toast(msg, 'warn');
  }

  /* ---------- 문항 내용(공개분) ---------- */
  function resolveItem(itemId, group, settings) {
    var it = ITEM[itemId], g = (it.stage === 'Reflect' && it.byGroup && it.byGroup.EXPERIMENT) || (it.byGroup && it.byGroup[group]) || {};
    return { id: it.id, lesson: it.lesson, stage: it.stage, mark: it.mark, short: it.short || it.id, recall: it.recall || null, title: g.title || it.title, sub: g.sub || it.sub || null, hint: g.hint || it.hint || null,
      fig: it.fig ? C.figs[it.fig] : null, choices: it.choices || null, fixedAI: g.fixedAI ? C.fixed_ai[g.fixedAI] : null, fields: g.fields || it.fields };
  }
  function itemsForStage(stageId, group, settings, lesson) { return C.items.filter(function (it) { return !it.archived && it.stage === stageId && it.lesson === (lesson || 1); }).map(function (it) { return resolveItem(it.id, group, settings); }); }
  function stageIdxOf(id) { for (var i = 0; i < C.stages.length; i++) if (C.stages[i].id === id) return i; return -1; }
  /* 차시 */
  function lessonOf(n) { return C.lessons[n] || C.lessons[1]; }
  function lessonLabel(n) { var L = C.lessons[n]; return L ? n + '차시 · ' + L.title : n + '차시'; }
  function stageMin(n, i) { return lessonOf(n).min[i]; }
  function stageIntro(n, st, g) { var L = lessonOf(n); return ((L.intro && L.intro[st.id]) || st.intro)[g]; }
  function shortOf(id) { return ITEM[id] ? (ITEM[id].short || id) : id; }
  var CIRC = ['①', '②', '③', '④', '⑤'];
  function figHTML(f, cls) {
    if (!f) return '';
    return '<figure class="probfig' + (cls ? ' ' + cls : '') + '"><img src="' + esc(f.file) + '" width="' + f.w + '" height="' + f.h + '" alt="' + esc(plain(f.desc)) + '" loading="lazy"></figure>';
  }
  function worksheetPane(lesson,group,stage) {
    var pages=WORKSHEETS&&WORKSHEETS.lessons&&WORKSHEETS.lessons[String(lesson)]&&WORKSHEETS.lessons[String(lesson)][group]&&WORKSHEETS.lessons[String(lesson)][group][stage];
    if(!Array.isArray(pages)||!pages.length)return '';
    return '<section class="worksheet-panel" aria-label="원본 활동지"><details open><summary>원본 PPT 활동지 '+pages.length+'쪽 · 그림을 보고 아래 답변칸에 입력하세요</summary>'+
      '<div class="worksheet-pages">'+pages.map(function(url,i){
        if(typeof url!=='string'||url.indexOf('/worksheets/L')!==0||url.indexOf('..')>=0||!url.endsWith('.png'))return '';
        return '<figure><img src="'+esc(url)+'" alt="'+esc(stage)+' 활동지 '+(i+1)+'쪽" loading="lazy"><figcaption>수학문제와 도형: PPT 원본 이미지</figcaption></figure>';
      }).join('')+'</div></details></section>';
  }
  function choicesHTML(list) {
    if (!list || !list.length) return '';
    return '<ol class="choicelist">' + list.map(function (c, i) { return '<li><span class="cn">' + CIRC[i] + '</span> ' + fmt(c) + '</li>'; }).join('') + '</ol>';
  }
  function multiVals(v) { return String(v || '').split(',').filter(Boolean); }

  /* ---------- 도형 ---------- */
  function elLabel(el) {
    var p = el.split(':'), k = p[0], v = p[1];
    if (k === 'pt') return '점 ' + v;
    if (k === 'side') return '변 <span class="seg">' + v + '</span>';
    if (k === 'ang') return '∠' + v;
    if (k === 'diag') return '대각선 <span class="seg">' + v + '</span>';
    if (k === 'half') return '<span class="seg">' + v + '</span>';
    return esc(el);
  }
  function figureSVG() {
    var pt = C.figure.points;
    function L(a, b, cls, el) { return '<line class="' + cls + '" data-el="' + el + '" x1="' + pt[a][0] + '" y1="' + pt[a][1] + '" x2="' + pt[b][0] + '" y2="' + pt[b][1] + '"/>'; }
    var s = '<svg class="fig" viewBox="0 0 470 272" role="group" aria-label="평행사변형 ABCD와 두 대각선의 교점 O: 꼭짓점, 변, 각, 대각선을 눌러 선택">';
    C.figure.angles.forEach(function (v) {
      var order = ['A', 'B', 'C', 'D'], i = order.indexOf(v), prev = order[(i + 3) % 4], next = order[(i + 1) % 4];
      var o = pt[v], a = pt[prev], b = pt[next], r = 30;
      function unit(p) { var dx = p[0] - o[0], dy = p[1] - o[1], m = Math.hypot(dx, dy); return [dx / m, dy / m]; }
      var u1 = unit(a), u2 = unit(b), p1 = [o[0] + u1[0] * r, o[1] + u1[1] * r], p2 = [o[0] + u2[0] * r, o[1] + u2[1] * r];
      var sweep = (u1[0] * u2[1] - u1[1] * u2[0]) > 0 ? 1 : 0;
      s += '<path class="ang" data-el="ang:' + v + '" d="M' + o[0] + ' ' + o[1] + ' L' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1) + ' A' + r + ' ' + r + ' 0 0 ' + sweep + ' ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1) + ' Z"/>';
    });
    var halves = [['A', 'O', 'half:AO'], ['O', 'C', 'half:OC'], ['B', 'O', 'half:BO'], ['O', 'D', 'half:OD']], sides = [['A', 'B', 'side:AB'], ['B', 'C', 'side:BC'], ['C', 'D', 'side:CD'], ['D', 'A', 'side:DA']];
    halves.forEach(function (h) { s += L(h[0], h[1], 'diag-line', h[2]); });
    sides.forEach(function (h) { s += L(h[0], h[1], 'side-line', h[2]); });
    halves.concat(sides).forEach(function (h) { s += L(h[0], h[1], 'hit', h[2]); });
    ['A', 'B', 'C', 'D', 'O'].forEach(function (v) { s += '<circle class="pt" data-el="pt:' + v + '" cx="' + pt[v][0] + '" cy="' + pt[v][1] + '" r="5"/><circle class="hit-pt" data-el="pt:' + v + '" cx="' + pt[v][0] + '" cy="' + pt[v][1] + '" r="13"/>'; });
    var lab = C.figure.labels;
    ['A', 'B', 'C', 'D', 'O'].forEach(function (v) { s += '<text class="lbl" x="' + (pt[v][0] + lab[v][0]) + '" y="' + (pt[v][1] + lab[v][1]) + '">' + v + '</text>'; });
    return s + '</svg>';
  }
  var CHIP_GROUPS = [['점', ['pt:A', 'pt:B', 'pt:C', 'pt:D', 'pt:O']], ['변', ['side:AB', 'side:BC', 'side:CD', 'side:DA']], ['각', ['ang:A', 'ang:B', 'ang:C', 'ang:D']], ['대각선', ['diag:AC', 'diag:BD']], ['나뉜 선분', ['half:AO', 'half:OC', 'half:BO', 'half:OD']]];
  function chipRows() {
    return CHIP_GROUPS.map(function (g) {
      return '<div class="chiprow"><span class="chiprow-k">' + g[0] + '</span>' + g[1].map(function (el) {
        return '<button type="button" class="elchip" data-el="' + el + '" aria-pressed="false">' + elLabel(el).replace('점 ', '').replace('변 ', '').replace('대각선 ', '') + '</button>';
      }).join('') + '</div>';
    }).join('');
  }
  function highlightFigure(root, sel) {
    var set = {}; (sel || []).forEach(function (e) { set[e] = true; });
    if (set['diag:AC']) set['half:AO'] = set['half:OC'] = true;
    if (set['diag:BD']) set['half:BO'] = set['half:OD'] = true;
    $$('[data-el]', root).forEach(function (n) {
      var el = n.getAttribute('data-el');
      if (n.classList.contains('elchip')) { var on = (sel || []).indexOf(el) >= 0; n.classList.toggle('on', on); n.setAttribute('aria-pressed', on ? 'true' : 'false'); }
      else n.classList.toggle('on', !!set[el]);
    });
  }

  /* ---------- 개념 자료 보기 ---------- */
  function lessonMaterials(lesson) { return C.materials.filter(function (m) { return m.lesson === lesson; }); }
  var MatViewer = {
    el: null, list: [], idx: 0, openedAt: null, onClose: null, onSwitch: null, fit: true,
    open: function (list, idx, onOpen, onClose) {
      var self = this; self.close('REOPEN');
      self.list = list; self.idx = idx || 0; self.fit = true; self.onClose = onClose || null; self.onSwitch = onOpen || null;
      var m = document.createElement('div'); m.className = 'matview'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', '개념 자료');
      document.body.appendChild(m); self.el = m; self.render();
      m.addEventListener('click', function (ev) {
        var b = ev.target.closest('button'); if (!b) { if (ev.target === m) self.close('BACKDROP'); return; }
        if (b.hasAttribute('data-mclose')) self.close('BUTTON');
        else if (b.hasAttribute('data-mtab')) self.switchTo(+b.getAttribute('data-mtab'));
        else if (b.hasAttribute('data-mfit')) { self.fit = !self.fit; self.render(true); }
      });
      document.addEventListener('keydown', self._key = function (ev) { if (ev.key === 'Escape') self.close('ESC'); });
      self.openedAt = Date.now(); if (onOpen) onOpen(self.list[self.idx]);
      setTimeout(function () { var c = $('[data-mclose]', m); if (c) c.focus(); }, 0);
    },
    switchTo: function (i) {
      if (i === this.idx) return;
      if (this.onClose) this.onClose(this.list[this.idx], (Date.now() - this.openedAt) / 1000, 'SWITCH');
      this.idx = i; this.openedAt = Date.now(); this.render();
      if (this.onSwitch) this.onSwitch(this.list[i]);
    },
    render: function (keepScroll) {
      var self = this, m = self.list[self.idx]; if (!self.el || !m) return;
      var body = $('.mv-body', self.el), top = body ? body.scrollTop : 0;
      self.el.innerHTML = '<div class="mv-card"><header class="mv-h"><div class="mv-tabs">' + self.list.map(function (x, i) {
        return '<button class="mv-tab' + (i === self.idx ? ' on' : '') + '" data-mtab="' + i + '">' + esc(x.title) + '</button>';
      }).join('') + '</div><div class="mv-act"><button class="btn sm" data-mfit>' + (self.fit ? '원본 크기' : '화면 맞춤') + '</button><button class="btn sm primary" data-mclose>닫기</button></div></header>' +
        '<div class="mv-body" tabindex="0" aria-label="교재 이미지(스크롤 가능)"><img class="' + (self.fit ? 'fit' : 'full') + '" src="' + esc(m.file) + '" alt="' + esc(m.title + ' 개념 자료: ' + m.topic) + '"></div></div>';
      if (keepScroll) { var b2 = $('.mv-body', self.el); if (b2) b2.scrollTop = top; }
    },
    close: function (why) {
      if (!this.el) return;
      var m = this.list[this.idx], sec = (Date.now() - this.openedAt) / 1000;
      this.el.remove(); this.el = null; document.removeEventListener('keydown', this._key);
      var cb = this.onClose; this.onClose = null; this.onSwitch = null;
      if (cb) cb(m, sec, why);
    }
  };

  /* ---------- 공통 화면 조각 ---------- */
  function topbar(roleLabel, extra, lesson) {
    return '<header class="topbar"><div class="tb-l"><button class="linkbtn" id="btn-exit" title="나가기">◂</button>' +
      '<div><p class="tb-k" id="tb-lesson">' + (lesson ? esc(lessonLabel(lesson)) : 'PQ4R 튜터') + '</p><p class="tb-t">' + roleLabel + '</p></div></div>' +
      '<div class="tb-c" id="stepper" role="group" aria-label="수업 단계" tabindex="0"></div>' +
      '<div class="tb-r">' + (extra || '') + '<span class="timer" id="timer"></span></div></header>';
  }
  function bindExit(confirmMsg) {
    var b = $('#btn-exit'); if (!b) return;
    b.addEventListener('click', function () { if (!confirmMsg || window.confirm(confirmMsg)) logout(); });
  }
  function stepperHTML(open, view, opts) {
    opts = opts || {};
    var n = opts.lesson || 1;
    return C.stages.map(function (s, i) {
      var min = stageMin(n, i);
      var state = i < open ? 'past' : i === open ? 'now' : 'future';
      var hidden = opts.reciteHide && open === 4 && i < 4;
      var disabled = state === 'future' || hidden || opts.noNav;
      return '<button class="step ' + STAGE_KEYS[i] + ' ' + state + (i === view ? ' viewing' : '') + (hidden ? ' hidden-stage' : '') + '" data-step="' + i + '"' + (disabled ? ' disabled' : '') +
        ' title="' + s.id + ' ' + s.ko + ' · ' + min + '분' + (hidden ? ' (Recite 동안 가림)' : '') + '"><span class="n">' + (i + 1) + '</span><span class="nm">' + s.id + '</span><span class="mn">' + min + '′</span></button>';
    }).join('');
  }
  function timerText(sess) {
    if (!sess) return '';
    var i = sess.stage || 0, st = C.stages[i], opened = sess.stage_opened && sess.stage_opened[i];
    if (!opened) return '';
    var left = stageMin(sess.lesson, i) * 60 - (nowMs() - Date.parse(opened)) / 1000;
    return left >= 0 ? '<span class="tm-k">' + st.id + '</span> ' + mmss(left) + ' 남음' : '<span class="tm-k">' + st.id + '</span> <b class="over">시간 종료 +' + mmss(-left) + '</b>';
  }
  function every(ms, fn, hiddenMs) {
    var t = null;
    function loop() { t = setTimeout(function () { Promise.resolve().then(fn).catch(function () { }).then(loop); }, document.hidden ? (hiddenMs || ms * 4) : ms); App.timers.push(t); }
    loop();
  }

  /* =====================================================================
   * 입장
   * ===================================================================== */
  function renderEntry(tab) {
    cleanup(); App.screen = 'entry';
    document.body.className = 'is-entry';
    var last = store('pq4r:last') || {};
    tab = tab || last.tab || 'student';
    $('#app').innerHTML = '<main class="entry"><section class="entry-card">' +
      '<div class="brand"><svg viewBox="0 0 64 40" class="brand-mark" aria-hidden="true"><path d="M18 4 H60 L46 36 H4 Z"/><path d="M18 4 L46 36 M60 4 L4 36" class="d"/></svg>' +
      '<div><p class="eyebrow">연구용 MVP · ' + esc(C.versions.app) + '</p><h1>PQ4R 튜터</h1><p class="sub">' + Object.keys(C.lessons).map(function (k) { return esc(lessonLabel(+k)) + ' ' + C.lessons[k].total + '분'; }).join(' / ') + ' · 중학교 2학년</p></div></div>' +
      '<p class="lead">학생이 먼저 생각하고 답을 제출한 뒤 필요할 때 같은 수준의 메타인지 점검 질문을 요청합니다. 반복 과정은 모두 기록됩니다.</p>' +
      '<nav class="login-tabs" role="tablist">' + [['student', '학생'], ['teacher', '교사'], ['researcher', '연구자']].map(function (t) {
        return '<button class="login-tab' + (t[0] === tab ? ' on' : '') + '" role="tab" aria-selected="' + (t[0] === tab) + '" data-ltab="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</nav><div id="loginbox"></div></section></main>';
    $$('[data-ltab]').forEach(function (b) { b.onclick = function () { renderEntry(b.getAttribute('data-ltab')); }; });
    var box = $('#loginbox');
    if (tab === 'student') {
      box.innerHTML = '<form class="login-form" id="lf" autocomplete="off">' +
        '<label>수업 코드<input id="l-sess" required maxlength="24" value="' + esc(last.session || '') + '" autocapitalize="characters" spellcheck="false"></label>' +
        '<label>학생 코드<input id="l-code" required maxlength="20" value="' + esc(last.code || '') + '" autocapitalize="characters" spellcheck="false"></label>' +
        '<label>PIN<input id="l-pin" required inputmode="numeric" pattern="[0-9]{4,8}" maxlength="8" type="password" autocomplete="off"></label>' +
        '<button class="btn primary" type="submit">입장</button><p class="err" id="l-err" role="alert"></p>' +
        '<p class="hint">선생님이 알려 준 수업 코드와 내 학생 코드, PIN을 넣으세요. 실험·통제 집단은 명단에 이미 정해져 있어요.</p></form>';
    } else {
      box.innerHTML = '<form class="login-form staff" id="lf">' +
        (tab === 'teacher' ? '<label>교사 ID<input id="l-tid" maxlength="20" value="' + esc(last.tid || 'T01') + '"></label>' : '') +
        '<label>' + (tab === 'teacher' ? '교사' : '연구자') + ' 비밀번호<input id="l-pw" type="password" required autocomplete="current-password"></label>' +
        '<button class="btn primary" type="submit">입장</button><p class="err" id="l-err" role="alert"></p>' +
        '<p class="hint">' + (tab === 'teacher' ? '수업 진행과 통제집단 지원 화면이에요. 교사 ID는 기록의 teacher_id에 남아요.' : '수업 만들기, 명단, 기록·내보내기, 처치충실도 화면이에요.') + '</p></form>';
    }
    $('#lf').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var btn = $('#lf button[type=submit]'), err = $('#l-err'); err.textContent = ''; btn.disabled = true;
      var p;
      if (tab === 'student') {
        var sc = $('#l-sess').value.trim().toUpperCase(), code = $('#l-code').value.trim().toUpperCase();
        store('pq4r:last', Object.assign({}, last, { tab: 'student', session: sc, code: code }));
        p = api('POST', 'login/student', { session_code: sc, student_code: code, pin: $('#l-pin').value.trim(), ua: navigator.userAgent.slice(0, 160) })
          .then(function (r) { App.tok = r.token; App.role = 'student'; saveAuth({ token: r.token, role: 'student' }); Student.start(r.me); });
      } else {
        var tid = tab === 'teacher' ? $('#l-tid').value.trim().toUpperCase() : null;
        store('pq4r:last', Object.assign({}, last, { tab: tab, tid: tid || last.tid }));
        p = api('POST', 'login/staff', { role: tab, password: $('#l-pw').value, teacher_id: tid })
          .then(function (r) { App.tok = r.token; App.role = r.role; App.tid = r.tid; saveAuth({ token: r.token, role: r.role, tid: r.tid }); if (r.role === 'teacher') Teacher.start(); else Researcher.start(); });
      }
      p.catch(function (e) { err.textContent = e.message; }).then(function () { btn.disabled = false; });
    });
    var f = $('#l-pin') && !$('#l-sess').value ? $('#l-sess') : ($('#l-pin') || $('#l-pw')); if (f) f.focus();
  }

  /* =====================================================================
   * 학생
   * ===================================================================== */
  var Student = {
    me: null, view: 0, focus: null, busy: {}, saveTimers: {}, pending: {}, reviewFeedback: null, reviewLoading: false, lastReviewFetch: 0, reviewReflectionShown: false,
    start: function (me) {
      cleanup(); App.screen = 'student';
      var self = this;
      self.me = me; self.view = me.session.stage; self.focus = null; self.busy = {}; self.pending = store(self.pendKey()) || {}; self.reviewFeedback = null; self.reviewLoading = false; self.lastReviewFetch = 0; self.reviewReflectionShown = false;
      document.body.className = 'is-student g-' + me.student.group.toLowerCase();
      Object.keys(self.pending).forEach(function (id) { var p = self.pending[id]; var it = self.item(id); it.draft = p.draft; it.draft_sel = p.draft_sel; it.reason = p.reason; self.flushDraft(id); });
      self.shell();
      every(4000, function () { return self.poll(); }, 15000);
      App.timers.push(setInterval(function () {
        var t = $('#timer'); if (t) t.innerHTML = timerText(self.me.session);
        if (self.view === 5 && self.stageIdx() === 5) { var due = self.me.review && self.me.review.release_at; var reflectAt = self.me.review && self.me.review.reflection_at; var count = $('#review-release-count'); if (count && due) count.textContent = '해설까지 ' + mmss((Date.parse(due)-nowMs())/1000); if (due && nowMs() >= Date.parse(due)) self.loadReviewFeedback(); var rc = $('#review-reflect-count'); if (rc && reflectAt) rc.textContent = '성찰까지 ' + mmss((Date.parse(reflectAt)-nowMs())/1000); if (reflectAt && nowMs() >= Date.parse(reflectAt) && self.reviewFeedback && !self.reviewReflectionShown) { self.reviewReflectionShown = true; self.renderStage(); } }
        $('.waiting[data-at]').forEach(function (n) { n.textContent = '도움 요청 보냄 · ' + mmss((nowMs() - Date.parse(n.getAttribute('data-at'))) / 1000) + ' 기다리는 중'; });
      }, 1000));
    },
    pendKey: function () { return 'pq4r:pending:' + this.me.session.code + ':' + this.me.student.code; },
    group: function () { return this.me.student.group; },
    lesson: function () { return Number(this.me.session.lesson) || 1; },
    hasTool: function (sid) { var L = lessonOf(this.lesson()); return !!L.tool && (!sid || (L.toolStages || []).indexOf(sid) >= 0); },
    settings: function () { return this.me.session.settings || {}; },
    stageIdx: function () { return this.me.session.stage; },
    item: function (id) { var it = this.me.items[id]; if (!it) it = this.me.items[id] = { draft: {}, draft_sel: {}, versions: [], reason: '', status: 'open', attempts: 0 }; return it; },
    reload: function () {
      var self = this;
      return api('GET', 'me').then(function (me) {
        Object.keys(self.pending).forEach(function (id) { if (me.items[id] && me.items[id].status !== 'incomplete') { var p = self.pending[id]; me.items[id].draft = p.draft; me.items[id].draft_sel = p.draft_sel; me.items[id].reason = p.reason; } });
        self.me = me;
      });
    },
    poll: function () {
      var self = this;
      return api('GET', 'me/sync?seq=' + self.me.msgSeq).then(function (r) {
        var stageChanged = r.stage_rev !== self.me.session.stage_rev;
        if (r.messages.length) { self.me.messages = self.me.messages.concat(r.messages); self.me.msgSeq = r.messages[r.messages.length - 1].seq; }
        if (self.group() === 'CONTROL') self.me.requests = r.requests;
        if (r.review) self.me.review = r.review;
        if (stageChanged) {
          var prev = self.me.session.stage;
          return self.reload().then(function () { self.onStageChange(prev, self.me.session.stage); });
        }
        if (r.messages.length || self.group() === 'CONTROL') self.refreshThreads();
        if (r.review && r.review.unlocked && self.view === 5 && self.stageIdx() === 5) self.loadReviewFeedback();
      });
    },
    onStageChange: function (prev, cur) {
      MatViewer.close('STAGE_CHANGED');
      if (this.me.session.status !== 'open') { $('#app').innerHTML = '<main class="loading">수업이 끝났어요. 수고했어요!</main>'; cleanup(); return; }
      this.view = cur; this.renderStepper(); this.renderDemo(); this.renderStage();
      if (cur !== prev) toast(C.stages[cur].id + ' ' + C.stages[cur].ko + ' 단계가 열렸어요.');
    },
    shell: function () {
      var self = this, g = self.group();
      $('#app').innerHTML = topbar('학생 ' + esc(self.me.student.code) + ' · <span class="grp ' + g.toLowerCase() + '">' + groupKo(g) + ' · ' + supporterKo(g) + '</span>', '', self.lesson()) +
        '<div class="demo" id="demo" hidden></div><div class="layout" id="layout"><aside class="left" id="left"></aside><section class="right" id="right"></section></div>';
      bindExit('나가면 다시 들어올 때 PIN을 넣어야 해요. 나갈까요?');
      self.renderStepper(); self.renderDemo(); self.renderLeft(); self.renderStage();
      $('#stepper').addEventListener('click', function (ev) { var b = ev.target.closest('[data-step]'); if (!b || b.disabled) return; self.view = +b.getAttribute('data-step'); self.renderStepper(); self.renderStage(); });
      self.bindRight(); self.bindLeft();
    },
    renderStepper: function () { var n = $('#stepper'); if (n) n.innerHTML = stepperHTML(this.stageIdx(), this.view, { reciteHide: true, lesson: this.lesson() }); var t = $('#timer'); if (t) t.innerHTML = timerText(this.me.session); },
    renderDemo: function () {
      var self = this, n = $('#demo'); if (!n) return;
      if (!self.settings().demoControls) { n.hidden = true; return; }
      n.hidden = false;
      n.innerHTML = '<span class="demo-k">시연 제어</span><span>시연용 수업이라 학생 화면에서 단계를 넘길 수 있어요.</span>' +
        '<button class="btn sm" id="demo-prev"' + (self.stageIdx() === 0 ? ' disabled' : '') + '>이전 단계</button><button class="btn sm" id="demo-next"' + (self.stageIdx() === 5 ? ' disabled' : '') + '>다음 단계 열기</button>';
      var go = function (d) { var prev = self.stageIdx(); api('POST', 'me/stage', { stage: prev + d }).then(function (me) { self.me = me; self.onStageChange(prev, me.session.stage); }).catch(function (e) { toast(e.message, 'warn'); }); };
      $('#demo-prev').onclick = function () { go(-1); }; $('#demo-next').onclick = function () { go(1); };
    },
    renderLeft: function () {
      $('#left').innerHTML = (lessonOf(this.lesson()).tool ? '<div class="figcard" id="figcard"><div class="figcard-h"><h2>평행사변형 ABCD</h2><span class="figtarget" id="figtarget">답 칸을 고르면 여기서 선택해요</span></div>' +
        figureSVG() + '<div class="chips">' + chipRows() + '</div><p class="fig-note">눌러서 고른 요소는 지금 쓰고 있는 답 칸에 함께 저장되고, 설명과 같이 점검돼요.</p></div>' : '') + '<div id="leftstage"></div>';
      this.renderLeftStage();
    },
    matVisible: function (sid) { return sid === 'Read' || (sid === 'Reflect' && this.settings().materialsInReflect); },
    renderLeftStage: function () {
      var n = $('#leftstage'); if (!n) return;
      var self = this, sid = C.stages[this.view].id, L = lessonOf(this.lesson()), h = '';
      var pk = L.stageProblem && L.stageProblem[sid], pb = pk ? C.problems[pk] : null;
      if (pb) h += '<div class="panel problem"><p class="k">' + (sid === 'Preview' ? '문제' : sid === 'Question' ? '문제 다시 보기 (Preview)' : '처음 본 문제') + '</p><p>' + fmt(pb.text) + '</p>' + figHTML(C.figs[pb.fig]) + '</div>';
      if (this.matVisible(sid)) {
        h += '<div class="panel material"><p class="k">개념 정리 · 교재</p><div class="mat-list">' + lessonMaterials(this.lesson()).map(function (m, i) {
          return '<button type="button" class="mat ' + m.role + '" data-mat="' + i + '"><img src="' + esc(m.thumb) + '" alt="" loading="lazy"><span class="mat-t">' + esc(m.title) + '</span><span class="mat-s">' + esc(m.topic) + '</span></button>';
        }).join('') + '</div><p class="hint small">눌러서 크게 보세요. Recite에서는 가려져요.</p></div>';
      }
      if (sid === 'Recite') h += '<div class="panel cover"><p class="k">가린 내용</p><p>Recite 동안은 앞 단계의 답과 개념 정리를 가려요. 먼저 내 말로 설명해 보세요.</p></div>';
      n.innerHTML = h;
      var fc = $('#figcard'); if (fc) fc.hidden = !self.hasTool(sid);
      var lay = $('#layout'); if (lay) lay.classList.toggle('noleft', !h && !(fc && !fc.hidden));
    },
    bindLeft: function () {
      var self = this;
      $('#left').addEventListener('click', function (ev) {
        var mb = ev.target.closest('[data-mat]'); if (mb) { self.openMaterial(+mb.getAttribute('data-mat')); return; }
        var t = ev.target.closest('[data-el]'); if (!t) return;
        self.toggleSel(t.getAttribute('data-el'));
      });
    },
    logEvent: function (type, itemId, extra) {
      api('POST', 'me/event', { type: type, item_id: itemId || null, extra: extra || {}, client_ts: new Date().toISOString(), viewing_stage: C.stages[this.view].id }).catch(function () { });
    },
    openMaterial: function (i) {
      var self = this, sid = C.stages[self.view].id;
      if (!(self.editable() && self.matVisible(sid))) return;
      MatViewer.open(lessonMaterials(self.lesson()), i, function (m) { self.logEvent('MATERIAL_OPEN', null, { material: m.id }); },
        function (m, sec, why) { self.logEvent('MATERIAL_CLOSE', null, { material: m.id, seconds: Math.round(sec), reason: why }); });
    },
    toggleSel: function (el) {
      var self = this, f = self.focus;
      if (!self.hasTool(C.stages[self.view].id)) return;
      if (!f || !self.editable()) { toast('먼저 답을 쓸 칸을 눌러 고르세요.', 'warn'); return; }
      var it = self.item(f.item); if (it.status === 'incomplete') return;
      var arr = (it.draft_sel[f.field] = it.draft_sel[f.field] || []);
      var i = arr.indexOf(el); if (i >= 0) arr.splice(i, 1); else arr.push(el);
      self.renderSelRow(f.item, f.field); self.renderFigSel(); self.saveDraft(f.item);
    },
    renderFigSel: function () {
      var f = this.focus, sel = f ? (this.item(f.item).draft_sel[f.field] || []) : [];
      if (!$('#figcard')) return;
      highlightFigure($('#left'), sel);
      var t = $('#figtarget');
      if (t) {
        if (!f) t.textContent = '답 칸을 고르면 여기서 선택해요';
        else { var it = resolveItem(f.item, this.group(), this.settings()), fd = it.fields.filter(function (x) { return x.key === f.field; })[0]; t.innerHTML = '선택 대상: <b>' + esc(shortOf(f.item)) + '</b> ' + fmt(fd ? fd.label : f.field); }
      }
    },
    editable: function () {
      var due = this.me.review && this.me.review.release_at;
      return this.view === this.stageIdx() && this.me.session.status === 'open' &&
        !(this.stageIdx() === 5 && due && nowMs() >= Date.parse(due));
    },
    reviewPanel: function () {
      var due = this.me.review && this.me.review.release_at, data = this.reviewFeedback, self = this;
      if (!due) return '';
      if (nowMs() < Date.parse(due)) return '<section class="panel"><h3>Review 첫 6분 · 문제 풀이</h3><p>정답 없이 문제를 풀고 풀이 근거를 작성해 제출해 주세요.</p><p id="review-release-count" class="hint small">정답 공개까지 ' + mmss((Date.parse(due)-nowMs())/1000) + '</p><p class="small">6분 뒤 두 집단에 정답과 풀이를 동시에 공개합니다. 작성한 답변은 보존됩니다.</p></section>';
      if (!data) return '<section class="panel"><h3>해설 공개 시간</h3><p>나의 답변을 보존하고 정답과 해설을 불러오는 중입니다.</p></section>';
      var confidence = {explain:'다른 사람에게 설명할 수 있다',partial:'일부는 이해했지만 아직 어렵다',uncertain:'아직 이해하지 못했다'};
      var solutionName = function(x) { var id=x.item_id||''; return id.indexOf('RV')>=0?'Review 다시 풀기':id.indexOf('RD')>=0?'Read 개념확인':'Reflect 문제 '+id.slice(-1); };
      var cards = (data.solutions || []).map(function (sol,i) {
        var p = sol.problem || {}, a = (data.answers || []).filter(function (v) {return v.item_id === sol.item_id;})[0] || {}, ans = a.pre_response || {};
        var own = Object.keys(ans).filter(function(k) {return String(ans[k]||'').trim();}).map(function (k) {return '<p><b>' + esc(k) + ':</b> ' + fmt(String(ans[k])) + '</p>';}).join('') || '<p class="muted">작성된 답안이 없습니다.</p>';
        return '<details class="review-solution"' + (i === 0 ? ' open' : '') + '><summary><b>' + (i+1) + '. ' + solutionName(sol) + '</b> · ' + esc(sol.answer) + '</summary>' +
          '<div style="padding:12px 0"><h4>문제와 그림</h4><p>' + fmt(p.title || '') + '</p>' + figHTML(p.fig) + choicesHTML(p.choices) +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin:14px 0">' +
          '<div class="panel"><h4>나의 공개 전 답변</h4>' + own + (a.source==='saved_draft_only'?'<p class="hint">제출 전 임시저장본입니다.</p>':'') + '</div>' +
          '<div class="panel"><h4>정답과 검증용 풀이 초안</h4><p><b>' + esc(sol.answer) + '</b></p><ol>' + (sol.steps||[]).map(function (line){return '<li>' + fmt(line) + '</li>';}).join('') + '</ol></div></div></div></details>';
      }).join('');
      var ref = data.reflection;
      var reflectAt = this.me.review && this.me.review.reflection_at;
      var canReflect = reflectAt && nowMs() >= Date.parse(reflectAt);
      var completed = ref ? '<section class="panel"><h3>해설 후 성찰 저장 완료</h3><p><b>중심 문제:</b> ' + esc(ref.focus_item || '') + '</p><p><b>이해 정도:</b> ' + esc(confidence[ref.understanding]||'') + '</p><p><b>내 풀이와 비교:</b> ' + esc(ref.comparison) + '</p></section>' :
        '<section class="panel"><h3>해설을 본 뒤 나의 이해 정도 성찰</h3><p class="hint small">5문항의 해설을 확인하고 어려웠던 문제 한 개를 골라 깊이 비교해 보세요. 이해하지 못한 점도 그대로 기록하면 됩니다.</p>' +
        '<label style="display:block;margin:10px 0">성찰할 문제<select id="post-focus-item"><option value="">문제를 선택하세요</option>' +
        (data.solutions||[]).map(function(x,i){return '<option value="'+esc(x.item_id)+'">'+solutionName(x)+'</option>';}).join('') + '</select></label>' +
        '<fieldset><legend>지금 이 문제의 풀이를 다른 사람에게 설명할 수 있나요?</legend>' +
        Object.keys(confidence).map(function(k){return '<label style="display:block;margin:8px 0"><input type="radio" name="post-understanding" value="'+k+'"> '+esc(confidence[k])+'</label>';}).join('') + '</fieldset>' +
        '<label style="display:block;margin:10px 0">해설을 보고 새롭게 확인한 점 또는 아직 어려운 점 한 가지<textarea id="post-comparison" rows="2" maxlength="350" placeholder="한두 문장으로 적어 보세요."></textarea></label>' +
        '<button type="button" class="btn primary" data-act="review-reflect">해설 후 성찰 저장</button></section>';
      var reflectUI = ref || canReflect ? completed : '<section class="panel"><h3>6~10분: 정답과 내 풀이 비교</h3><p>풀이에서 무엇이 같고 다른지 확인하세요. 마지막 2분에 짧은 이해도 성찰이 열립니다.</p><p id="review-reflect-count" class="hint small">성찰까지 ' + mmss((Date.parse(reflectAt)-nowMs())/1000) + '</p></section>';
      return '<section class="panel"><h2>Review 정답과 풀이 · 6분 후 공개</h2><p>첫 6분의 자기 풀이를 보존했습니다. 다음 4분은 정답 비교, 마지막 2분은 성찰입니다.</p><p class="hint small">두 집단에 동일하게 제공하는 검증용 해설 초안입니다.</p>' + cards + '</section>' + reflectUI;
    },
    loadReviewFeedback: function () {
      var self=this, due=self.me.review && self.me.review.release_at;
      if (!due || self.stageIdx()!==5 || self.view!==5 || self.reviewFeedback || self.reviewLoading || nowMs()<Date.parse(due)) return;
      if (Date.now()-self.lastReviewFetch<3500) return;
      self.lastReviewFetch=Date.now(); self.reviewLoading=true;
      api('GET','me/review-feedback').then(function(r){
        self.reviewFeedback=r;
        if(self.me.review) self.me.review.reflection=r.reflection;
        Object.keys(self.pending).forEach(function(id){if (ITEM[id] && ITEM[id].stage === 'Review') delete self.pending[id];});
        store(self.pendKey(),self.pending);
        self.renderStage(); self.renderLeftStage();
      }).catch(function(e){ if(e.code!=='review_locked') toast('해설을 불러오지 못했어요: '+e.message,'warn'); })
        .then(function(){self.reviewLoading=false;});
    },
    submitReviewReflection: function(){
      var self=this, checked=$('input[name="post-understanding"]:checked');
      var body={focus_item:($('#post-focus-item')||{}).value||'',understanding:checked?checked.value:'',comparison:($('#post-comparison')||{}).value||'',next_step:''};
      var btn=$('[data-act="review-reflect"]'); if(btn) btn.disabled=true;
      api('POST','me/review-reflection',body).then(function(r){
        if(self.reviewFeedback) self.reviewFeedback.reflection=r.saved;
        self.renderStage(); toast('해설 후 성찰이 저장됐어요.');
      }).catch(function(e){toast(e.message,'warn'); if(btn)btn.disabled=false;});
    },
    visibleStage: function (i) { var open = this.stageIdx(); if (i > open) return false; if (open === 4 && i < 4) return false; return true; },
    renderStage: function () {
      var self = this;
      if (!self.visibleStage(self.view)) self.view = self.stageIdx();
      var st = C.stages[self.view], key = STAGE_KEYS[self.view], g = self.group(), ln = self.lesson();
      var items = itemsForStage(st.id, g, self.settings(), ln), editable = self.editable();
      var mats = lessonMaterials(ln);
      var h = '<div class="stagehead ' + key + '"><p class="stage-k"><span class="sdot"></span>' + (self.view + 1) + '. ' + st.id.toUpperCase() + '<span class="ko">' + st.ko + '</span><span class="min">' + stageMin(ln, self.view) + '분</span></p>' +
        '<p class="stage-intro">' + esc(stageIntro(ln, st, g)) + '</p>' + (editable ? '' : '<p class="closed-note">이 단계는 닫혔어요. 보기만 할 수 있어요.</p>') +
        (editable && self.matVisible(st.id) && mats.length ? '<p class="row">' + mats.map(function (m, i) { return '<button type="button" class="btn sm' + (m.role === 'main' ? '' : ' ghost') + '" data-openmat="' + i + '">' + esc(m.title) + '</button>'; }).join('') + '</p>' : '') + '</div>';
      h += worksheetPane(ln,g,st.id);
      if (editable) h += self.toolbarHTML();
      items.forEach(function (it) { h += self.itemHTML(it, editable); });
      if (self.view === 5 && self.stageIdx() === 5) h += self.reviewPanel();
      h += '<p class="savestate" id="savestate"></p>';
      $('#right').innerHTML = h;
      items.forEach(function (it) { self.refreshItem(it.id); });
      if (!self.focus || ITEM[self.focus.item].stage !== st.id) {
        var first = items.filter(function (it) { return self.item(it.id).status !== 'clear'; })[0] || items[0];
        var ff = first && first.fields.filter(function (f) { return f.kind !== 'choice' && f.kind !== 'multi'; })[0];
        self.focus = editable && ff ? { item: first.id, field: ff.key } : null;
      }
      self.markFocus(); self.renderFigSel(); self.renderLeftStage();
    },
    toolbarHTML: function () {
      var syms = [['△', '삼각형'], ['≡', '합동'], ['∠', '각'], ['∥', '평행'], ['⊥', '수직'], ['=', '같음'], ['°', '도'], ['+', '더하기'], ['−', '빼기'], ['×', '곱하기'], ['÷', '나누기']];
      var segs = this.lesson() === 1 ? ['AB', 'BC', 'CA', 'DE', 'EF', 'FD', 'AO', 'CO', 'BD'] : ['AB', 'BC', 'CD', 'DA', 'AC', 'BD', 'AO', 'OC', 'BO', 'OD', 'AE', 'EO'];
      return '<div class="symbar" role="toolbar" aria-label="수학 기호 입력"><span class="symbar-k">기호</span>' +
        syms.map(function (s) { return '<button type="button" class="sym" data-sym="' + s[0] + '" title="' + s[1] + '">' + s[0] + '</button>'; }).join('') +
        '<span class="segpick"><button type="button" class="sym wide" data-act="segmenu" aria-expanded="false">선분 <span class="seg">AB</span> ▾</button>' +
        '<span class="segmenu" id="segmenu" hidden>' + segs.map(function (s) { return '<button type="button" class="sym" data-segins="' + s + '"><span class="seg">' + s + '</span></button>'; }).join('') + '</span></span>' +
        '<span class="symbar-hint">마지막으로 누른 칸에 들어가요</span></div>';
    },
    itemHTML: function (it, editable) {
      var self = this, rec = self.item(it.id);
      var last = rec.versions.length ? rec.versions[rec.versions.length - 1].fields : {};
      var h = '<article class="item" data-item="' + it.id + '"><header class="item-h"><div class="item-t">' + (it.mark ? '<span class="mark">' + esc(it.mark) + '</span>' : '') +
        '<h3>' + fmt(it.title) + '</h3></div><span class="chip-status" data-status="' + it.id + '"></span></header>';
      if (it.fig || it.choices) h += '<div class="probblock">' + figHTML(it.fig) + choicesHTML(it.choices) + '</div>';
      if (it.fixedAI) h += '<div class="aiout"><p class="aiout-k">검토할 풀이 설명 <small>두 집단 공통 검토자료</small></p><p>' + fmt(it.fixedAI.text) + '</p></div>';
      if (it.sub) h += '<p class="item-sub">' + fmt(it.sub) + '</p>';
      if (it.hint) h += '<p class="item-hint">' + fmt(it.hint) + '</p>';
      if (it.recall) {
        var src = self.item(it.recall), txt = src.versions.length ? src.versions[0].fields.text : (src.draft.text || '');
        h += '<blockquote class="recall"><span>처음 생각 (Preview)</span>' + (txt ? esc(txt) : '<i>기록 없음</i>') + '</blockquote>';
      }
      h += '<div class="fields' + (it.fields.some(function (f) { return f.narrow; }) ? ' has-narrow' : '') + '">';
      it.fields.forEach(function (f) {
        var val = rec.draft[f.key] != null ? rec.draft[f.key] : (last[f.key] || '');
        var id = 'in-' + it.id + '-' + f.key, dis = editable && rec.status !== 'incomplete' ? '' : ' disabled';
        var pick = f.kind === 'choice' || f.kind === 'multi';
        h += '<div class="field' + (f.narrow ? ' narrow' : '') + (pick ? ' choice' : '') + '" data-fieldwrap="' + it.id + ':' + f.key + '">';
        if (pick) {
          var on = f.kind === 'multi' ? multiVals(val) : [val];
          h += '<fieldset><legend>' + fmt(f.label) + (f.kind === 'multi' ? ' <small>(여러 개 고를 수 있어요)</small>' : '') + '</legend><div class="choices">' + f.options.map(function (o) {
            return '<label class="opt"><input type="' + (f.kind === 'multi' ? 'checkbox' : 'radio') + '" name="' + id + '" value="' + o.v + '" data-item="' + it.id + '" data-field="' + f.key + '"' + (on.indexOf(o.v) >= 0 ? ' checked' : '') + dis + '><span>' + fmt(o.label) + '</span></label>';
          }).join('') + '</div></fieldset>';
        } else {
          h += '<label for="' + id + '">' + fmt(f.label) + (f.unit ? ' <small>(' + esc(f.unit) + ')</small>' : '') + '</label>';
          if (f.kind === 'long') h += '<textarea id="' + id + '" rows="' + (f.rows || 3) + '" maxlength="3000" data-item="' + it.id + '" data-field="' + f.key + '"' + dis + '>' + esc(val) + '</textarea>';
          else h += '<input id="' + id + '" type="text" maxlength="300" autocomplete="off" data-item="' + it.id + '" data-field="' + f.key + '" value="' + esc(val) + '"' + dis + '>';
          h += '<div class="selrow" data-selrow="' + it.id + ':' + f.key + '"></div>';
        }
        h += '</div>';
      });
      h += '</div>';
      if (editable) {
        h += '<div class="revise" data-revise="' + it.id + '" hidden><label for="rv-' + it.id + '">고친 이유 <small>(선택)</small></label><input id="rv-' + it.id + '" data-reason="' + it.id + '" maxlength="300" autocomplete="off" value="' + esc(rec.reason || '') + '" placeholder="무엇을 왜 고쳤는지 한 줄로"></div>' +
          '<footer class="item-f"><button type="button" class="btn primary" data-act="submit" data-id="' + it.id + '">제출</button><button type="button" class="btn ghost" data-act="help" data-id="' + it.id + '">도움 요청</button><span class="busy" data-busy="' + it.id + '" hidden>점검 중…</span></footer>';
      }
      return h + '<div class="thread" data-thread="' + it.id + '"></div></article>';
    },
    statusText: function (id) {
      var r = this.item(id), drafted = Object.keys(r.draft || {}).some(function (k) { return String(r.draft[k] || '').trim(); });
      if (r.status === 'incomplete') return ['미제출', 'muted'];
      if (r.status === 'clear') return ['기록 완료', 'done'];
      if (r.status === 'unresolved' || r.status === 'closed') return ['기록됨', 'muted'];
      if (r.attempts > 0) return [r.attempts > 1 ? '다시 제출함 · ' + r.attempts + '회' : '제출함', 'sent'];
      return drafted ? ['작성 중', 'draft'] : ['아직 안 씀', 'muted'];
    },
    isEmpty: function (id) {
      var r = this.item(id), it = resolveItem(id, this.group(), this.settings());
      return it.fields.every(function (f) { return !String(r.draft[f.key] != null ? r.draft[f.key] : '').trim(); });
    },
    refreshItem: function (id) {
      var self = this, r = self.item(id), chip = $('[data-status="' + id + '"]'); if (!chip) return;
      var st = self.statusText(id); chip.textContent = st[0]; chip.className = 'chip-status ' + st[1];
      var sb = $('[data-act="submit"][data-id="' + id + '"]');
      if (sb) {
        sb.textContent = r.attempts ? '다시 제출' : '제출';
        sb.disabled = !!self.busy[id] || self.isEmpty(id) || r.status === 'incomplete' || !self.editable();
        var hb = $('[data-act="help"][data-id="' + id + '"]'); if (hb) hb.disabled = !!self.busy[id] || r.status === 'incomplete' || !self.editable();
      }
      var rv = $('[data-revise="' + id + '"]'); if (rv) rv.hidden = !(r.attempts > 0 && r.status !== 'incomplete');
      var bz = $('[data-busy="' + id + '"]'); if (bz) bz.hidden = !self.busy[id];
      resolveItem(id, self.group(), self.settings()).fields.forEach(function (f) { if (f.kind !== 'choice' && f.kind !== 'multi') self.renderSelRow(id, f.key); });
      self.renderThread(id);
    },
    refreshItemLight: function (id) {
      var r = this.item(id), chip = $('[data-status="' + id + '"]');
      if (chip) { var st = this.statusText(id); chip.textContent = st[0]; chip.className = 'chip-status ' + st[1]; }
      var sb = $('[data-act="submit"][data-id="' + id + '"]'); if (sb) sb.disabled = !!this.busy[id] || this.isEmpty(id) || r.status === 'incomplete' || !this.editable();
    },
    renderSelRow: function (id, field) {
      var n = $('[data-selrow="' + id + ':' + field + '"]'); if (!n) return;
      var sel = this.item(id).draft_sel[field] || [], ed = this.editable();
      n.innerHTML = sel.length ? '<span class="selrow-k">도형 선택</span>' + sel.map(function (el) {
        return '<span class="selchip">' + elLabel(el) + (ed ? '<button type="button" aria-label="선택 해제" data-unsel="' + id + ':' + field + ':' + el + '">×</button>' : '') + '</span>';
      }).join('') : '';
    },
    renderThread: function (id) {
      var n = $('[data-thread="' + id + '"]'); if (!n) return;
      var self = this;
      var h = self.me.messages.filter(function (m) { return m.item_id === id; }).map(function (m) {
        if (m.sender === 'SYS') return '<div class="msg sys"><p>' + fmt(m.text) + '</p></div>';
        var who = m.sender === 'TEACHER' ? '선생님' : 'AI 튜터';
        return '<div class="msg ' + (m.sender === 'TEACHER' ? 'teacher' : 'ai') + (m.ack ? ' ack' : '') + '"><p class="who">' + who + ' <time>' + kst(m.at) + '</time></p><p>' + fmt(m.text) + '</p>' +
          (m.requires_resubmission ? '<p class="next">생각을 고쳐 다시 제출해 보세요.</p>' : '') + '</div>';
      }).join('');
      if (self.group() === 'CONTROL') {
        var open = (self.me.requests || []).filter(function (r) { return r.item_id === id; });
        if (open.length) h += '<p class="waiting" data-at="' + open[open.length - 1].at + '">도움 요청 보냄</p>';
      }
      n.innerHTML = h; n.hidden = !h;
    },
    refreshThreads: function () { var self = this; $$('[data-thread]').forEach(function (n) { self.renderThread(n.getAttribute('data-thread')); }); },
    markFocus: function () {
      var f = this.focus;
      $$('.field.focused').forEach(function (n) { n.classList.remove('focused'); });
      if (f) { var w = $('[data-fieldwrap="' + f.item + ':' + f.field + '"]'); if (w) w.classList.add('focused'); }
    },
    /* 임시저장: 1초 뒤 서버로, 실패하면 이 기기에 보관했다가 다시 보낸다 */
    saveDraft: function (id) {
      var self = this, r = self.item(id);
      self.pending[id] = { draft: clone(r.draft), draft_sel: clone(r.draft_sel), reason: r.reason || '', t: Date.now() };
      store(self.pendKey(), self.pending);
      clearTimeout(self.saveTimers[id]);
      self.saveTimers[id] = setTimeout(function () { self.flushDraft(id); }, 1000);
    },
    flushDraft: function (id) {
      var self = this, p = self.pending[id]; if (!p) return Promise.resolve();
      return api('POST', 'me/draft', { item_id: id, draft: p.draft, draft_sel: p.draft_sel, reason: p.reason }).then(function (r) {
        if (self.pending[id] === p) { delete self.pending[id]; store(self.pendKey(), self.pending); }
        var n = $('#savestate'); if (n && r.saved) n.textContent = '임시저장 ' + kst(r.at);
      }).catch(function () {
        var n = $('#savestate'); if (n) n.textContent = '임시저장 실패 · 이 기기에 보관하고 다시 보낼게요';
        clearTimeout(self.saveTimers[id]); self.saveTimers[id] = setTimeout(function () { self.flushDraft(id); }, 5000);
      });
    },
    bindRight: function () {
      var self = this, right = $('#right'), lastInput = null;
      right.addEventListener('focusin', function (ev) {
        var t = ev.target;
        if (t.matches('textarea[data-field], input[type=text][data-field]')) { lastInput = t; self.focus = { item: t.getAttribute('data-item'), field: t.getAttribute('data-field') }; self.markFocus(); self.renderFigSel(); }
      });
      right.addEventListener('input', function (ev) {
        var t = ev.target;
        if (t.hasAttribute('data-reason')) { var id0 = t.getAttribute('data-reason'); self.item(id0).reason = t.value; self.saveDraft(id0); return; }
        if (!t.hasAttribute('data-field') || t.type === 'radio' || t.type === 'checkbox') return;
        var id = t.getAttribute('data-item');
        self.item(id).draft[t.getAttribute('data-field')] = t.value; self.refreshItemLight(id); self.saveDraft(id);
      });
      right.addEventListener('change', function (ev) {
        var t = ev.target; if (t.type !== 'radio' && t.type !== 'checkbox') return;
        var id = t.getAttribute('data-item'), fk = t.getAttribute('data-field');
        if (t.type === 'checkbox') self.item(id).draft[fk] = $$('input[type=checkbox][data-item="' + id + '"][data-field="' + fk + '"]', right).filter(function (x) { return x.checked; }).map(function (x) { return x.value; }).join(',');
        else self.item(id).draft[fk] = t.value;
        self.refreshItemLight(id); self.saveDraft(id);
      });
      right.addEventListener('paste', function (ev) {
        var t = ev.target; if (!t.hasAttribute('data-field')) return;
        var len = 0; try { len = (ev.clipboardData.getData('text') || '').length; } catch (e) { len = -1; }
        self.logEvent('PASTE', t.getAttribute('data-item'), { field: t.getAttribute('data-field'), length: len });
      });
      right.addEventListener('mousedown', function (ev) { if (ev.target.closest('.sym')) ev.preventDefault(); });
      right.addEventListener('click', function (ev) {
        var b = ev.target.closest('button'); if (!b) return;
        if (b.hasAttribute('data-sym')) { insertAt(lastInput, b.getAttribute('data-sym')); return; }
        if (b.getAttribute('data-act') === 'segmenu') { var m = $('#segmenu'); m.hidden = !m.hidden; b.setAttribute('aria-expanded', String(!m.hidden)); return; }
        if (b.hasAttribute('data-segins')) { insertAt(lastInput, b.getAttribute('data-segins').split('').map(function (ch) { return ch + '̅'; }).join('')); $('#segmenu').hidden = true; return; }
        if (b.hasAttribute('data-unsel')) { var p = b.getAttribute('data-unsel').split(':'), arr = self.item(p[0]).draft_sel[p[1]] || [], el = p[2] + ':' + p[3], i = arr.indexOf(el); if (i >= 0) arr.splice(i, 1); self.renderSelRow(p[0], p[1]); self.renderFigSel(); self.saveDraft(p[0]); return; }
        if (b.hasAttribute('data-openmat')) { self.openMaterial(+b.getAttribute('data-openmat')); return; }
        if (b.getAttribute('data-act') === 'review-reflect') { self.submitReviewReflection(); return; }
        if (b.getAttribute('data-act') === 'submit') { self.submit(b.getAttribute('data-id')); return; }
        if (b.getAttribute('data-act') === 'help') { self.help(b.getAttribute('data-id')); return; }
      });
      function insertAt(inp, text) {
        if (!inp || inp.disabled) { toast('기호를 넣을 칸을 먼저 눌러 주세요.', 'warn'); return; }
        var s = inp.selectionStart != null ? inp.selectionStart : inp.value.length, e = inp.selectionEnd != null ? inp.selectionEnd : s;
        inp.value = inp.value.slice(0, s) + text + inp.value.slice(e);
        inp.focus(); try { inp.setSelectionRange(s + text.length, s + text.length); } catch (er) { /* ignore */ }
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
    },
    currentFields: function (id) {
      var it = resolveItem(id, this.group(), this.settings()), r = this.item(id), out = {};
      it.fields.forEach(function (f) { out[f.key] = r.draft[f.key] != null ? String(r.draft[f.key]) : ''; });
      return out;
    },
    applyResult: function (res) {
      var self = this, id = res.item_id, local = self.item(id);
      var keep = { draft: local.draft, draft_sel: local.draft_sel };
      self.me.items[id] = Object.assign({}, res.item, keep, { reason: '' });
      if (res.messages.length) { self.me.messages = self.me.messages.concat(res.messages); self.me.msgSeq = Math.max(self.me.msgSeq, res.messages[res.messages.length - 1].seq); }
      self.me.requests = res.requests || self.me.requests;
    },
    submit: function (id) {
      var self = this; if (self.busy[id] || !self.editable() || self.isEmpty(id)) return;
      var r = self.item(id);
      self.busy[id] = true; self.refreshItem(id);
      api('POST', 'me/submit', { item_id: id, fields: self.currentFields(id), selections: clone(r.draft_sel || {}), reason: r.attempts ? (r.reason || '') : '', client_ts: new Date().toISOString() })
        .then(function (res) {
          self.applyResult(res);
          delete self.pending[id]; store(self.pendKey(), self.pending);
          var rv = $('[data-reason="' + id + '"]'); if (rv) rv.value = '';
        })
        .catch(function (e) {
          if (e.code === 'stage_changed' || e.code === 'stage_closed' || e.code === 'item_closed') { toast(e.message, 'warn'); return self.reload().then(function () { self.renderStepper(); self.renderStage(); }); }
          toast(e.message || '제출하지 못했어요. 다시 눌러 주세요.', 'warn');
        })
        .then(function () { self.busy[id] = false; self.refreshItem(id); });
    },
    help: function (id) {
      var self = this; if (self.busy[id] || !self.editable()) return;
      self.busy[id] = true; self.refreshItem(id);
      var send = self.pending[id] ? self.flushDraft(id) : Promise.resolve();
      send.then(function () { return api('POST', 'me/help', { item_id: id, client_ts: new Date().toISOString() }); })
        .then(function (res) { self.applyResult(res); if (res.duplicate) toast('이미 도움을 요청했어요. 선생님을 기다려 주세요.'); })
        .catch(function (e) { toast(e.message, 'warn'); })
        .then(function () { self.busy[id] = false; self.refreshItem(id); });
    }
  };

  /* =====================================================================
   * 교사
   * ===================================================================== */
  var Teacher = {
    code: null, data: null, detail: null, sel: null, selItem: null, bank: null, confirmCustom: false,
    start: function (sessionCode) {
      cleanup(); App.screen = 'teacher';
      var self = this; self.data = null; self.detail = null; self.sel = null; self.selItem = null;
      document.body.className = 'is-teacher';
      var last = store('pq4r:teacher-session');
      self.code = sessionCode || last || null;
      var bankP = self.bank ? Promise.resolve() : api('GET', 'staff/content').then(function (r) { self.bank = r; });
      bankP.then(function () { return api('GET', 'staff/sessions'); }).then(function (r) {
        var open = r.sessions.filter(function (s) { return s.status === 'open'; });
        if (!self.code || !r.sessions.some(function (s) { return s.code === self.code; })) return self.pick(open);
        self.shell();
      }).catch(function (e) { $('#app').innerHTML = '<main class="loading">' + esc(e.message) + '</main>'; });
    },
    pick: function (list) {
      var self = this;
      $('#app').innerHTML = '<main class="entry"><section class="entry-card"><h1>수업 고르기</h1><p class="lead">진행할 수업을 고르세요. 수업은 연구자 화면에서 만듭니다.</p><div class="sesslist">' +
        (list.length ? list.map(function (s) { return '<button class="sessrow" data-pick="' + esc(s.code) + '"><span><b>' + esc(s.code) + '</b> · ' + esc(lessonLabel(s.lesson)) + (s.class_name ? ' · ' + esc(s.class_name) + '반' : '') + '</span><span class="pill">' + s.joined + '명 · ' + C.stages[s.stage].id + '</span></button>'; }).join('') : '<p class="empty">열린 수업이 없어요.</p>') +
        '</div><p><button class="btn" id="pick-out">나가기</button></p></section></main>';
      $$('[data-pick]').forEach(function (b) { b.onclick = function () { self.code = b.getAttribute('data-pick'); store('pq4r:teacher-session', self.code); self.shell(); }; });
      $('#pick-out').onclick = function () { logout(); };
    },
    shell: function () {
      var self = this;
      $('#app').innerHTML = topbar('교사 화면 · 수업 ' + esc(self.code), '<span class="stagectl"><button class="btn sm" id="t-prev">이전 단계</button><button class="btn sm primary" id="t-next">다음 단계 열기</button></span>' + (App.role === 'researcher' ? '<button class="btn sm ghost" id="t-back">연구자 화면</button>' : '<button class="btn sm ghost" id="t-switch">수업 바꾸기</button>')) +
        '<div class="tlayout"><aside class="tleft"><h2>도움 요청 <small>통제집단</small></h2><div id="queue"><p class="empty">불러오는 중…</p></div><p class="hint small">실험집단은 AI 튜터가 지원해요. 교사는 시간·전환·기기 문제만 돕습니다.</p></aside>' +
        '<section class="tmain"><div class="tmain-h"><h2>학생</h2><span id="t-count"></span></div><div class="tablewrap"><table class="roster" id="roster"></table></div>' +
        '<div class="legend"><span><span class="cell none">·</span>아직 안 씀</span><span><span class="cell draft">…</span>작성 중</span><span><span class="cell sent">1</span>제출 횟수</span><span><span class="cell mid">?</span>숫자 확인 필요</span><span><span class="cell ok2">✓</span>숫자 맞음</span><span><span class="cell inc">–</span>빈칸·막힘</span><span><span class="cell inc">미</span>미제출</span></div>' +
        '<div class="legend"><b>실험집단</b><span><span class="cell mid">L1</span>진행 중 지원 수준</span><span><span class="cell ok">✓</span>해결</span><span><span class="cell bad">!</span>미해결</span><span>숫자 표시는 규칙 판정이며, 통제집단에는 AI 판정을 쓰지 않아요.</span></div></section>' +
        '<aside class="tdetail" id="tdetail"><p class="empty">학생을 고르면 답과 지원 기록이 여기에 보여요.</p></aside></div>';
      bindExit();
      if ($('#t-back')) $('#t-back').onclick = function () { Researcher.start(); };
      if ($('#t-switch')) $('#t-switch').onclick = function () { store('pq4r:teacher-session', null); self.code = null; Teacher.start(); };
      $('#t-prev').onclick = function () { self.setStage(-1); };
      $('#t-next').onclick = function () { self.setStage(1); };
      $('#roster').addEventListener('click', function (ev) { var tr = ev.target.closest('[data-code]'); if (tr) self.select(tr.getAttribute('data-code'), null); });
      $('#queue').addEventListener('click', function (ev) { var b = ev.target.closest('[data-req]'); if (!b) return; var p = b.getAttribute('data-req').split('|'); self.select(p[0], p[1]); });
      every(3000, function () { return self.refresh(); }, 10000);
      App.timers.push(setInterval(function () { var t = $('#timer'); if (t && self.data) t.innerHTML = timerText(self.data.session); $$('[data-wait]').forEach(function (n) { n.textContent = mmss((nowMs() - Date.parse(n.getAttribute('data-wait'))) / 1000); }); }, 1000));
      self.refresh();
    },
    refresh: function () {
      var self = this;
      return api('GET', 'staff/overview?session=' + encodeURIComponent(self.code) + (self.data ? '&fp=' + encodeURIComponent(self.data.fp) : '')).then(function (r) {
        if (r.same) return;
        self.data = r; var tl = $('#tb-lesson'); if (tl) tl.textContent = lessonLabel(r.session.lesson); self.renderTop(); self.renderRoster(); self.renderQueue();
        if (self.sel) return self.loadDetail();
      }).catch(function (e) { if (e.status === 404) { toast(e.message, 'warn'); store('pq4r:teacher-session', null); Teacher.start(); } });
    },
    stage: function () { return this.data ? this.data.session.stage : 0; },
    lesson: function () { return this.data ? (Number(this.data.session.lesson) || 1) : 1; },
    stageItems: function () { var stg = C.stages[this.stage()].id, ln = this.lesson(); return C.items.filter(function (it) { return it.stage === stg && it.lesson === ln; }).map(function (it) { return it.id; }); },
    setStage: function (d) {
      var self = this, next = self.stage() + d;
      if (d > 0 && !window.confirm(C.stages[next].id + ' 단계를 열까요? 지금 단계에서 제출하지 않은 답은 미완료로 기록돼요.')) return;
      api('POST', 'staff/stage', { session: self.code, stage: next }).then(function () { self.data = null; return self.refresh(); }).catch(function (e) { toast(e.message, 'crit'); });
    },
    renderTop: function () {
      var s = this.stage(), n = $('#stepper'); if (n) n.innerHTML = stepperHTML(s, s, { noNav: true, lesson: this.lesson() });
      var t = $('#timer'); if (t) t.innerHTML = timerText(this.data.session);
      var p = $('#t-prev'), x = $('#t-next'); if (p) p.disabled = s === 0; if (x) x.disabled = s === 5;
    },
    renderQueue: function () {
      var q = this.data.requests, n = $('#queue'); if (!n) return;
      n.innerHTML = q.length ? q.map(function (r) {
        return '<button class="req" data-req="' + esc(r.code) + '|' + esc(r.item_id) + '"><b>' + esc(r.code) + '</b><span>' + esc(shortOf(r.item_id)) + ' · ' + esc(r.stage) + '</span><span class="w">대기 <span data-wait="' + r.at + '">' + mmss((nowMs() - Date.parse(r.at)) / 1000) + '</span></span></button>';
      }).join('') : '<p class="empty">기다리는 요청이 없어요.</p>';
    },
    cell: function (group, x, itemId) {
      if (!x) return '<span class="cell none" title="' + shortOf(itemId) + ': 아직 안 씀">·</span>';
      var cls = 'none', label = '·', title = '아직 안 씀';
      if (x.s === 'incomplete') { cls = 'inc'; label = '미'; title = '미제출'; }
      else if (x.a > 0) {
        if (group === 'EXPERIMENT') {
          if (x.s === 'clear') { cls = 'ok'; label = '✓'; title = '해결' + (x.sc ? ' (도움 받음)' : ''); }
          else if (x.s === 'unresolved' || x.s === 'closed') { cls = 'bad'; label = '!'; title = '미해결'; }
          else { cls = 'mid'; label = 'L' + (x.l || 0); title = '진행 중 · 지원 수준 ' + (x.l || 0); }
        } else {
          cls = 'sent'; label = String(x.a); title = '제출 ' + x.a + '회';
          if (x.f === 'num_check') { cls = 'mid'; label = '?'; title = '숫자 확인 필요(규칙 판정)'; }
          if (x.f === 'num_ok') { cls = 'ok2'; label = '✓'; title = '숫자 맞음(규칙 판정)'; }
          if (x.f === 'empty') { cls = 'inc'; label = '–'; title = '빈칸·막힘'; }
        }
      } else if (x.d) { cls = 'draft'; label = '…'; title = '작성 중'; }
      return '<span class="cell ' + cls + '" title="' + shortOf(itemId) + ': ' + title + '">' + label + '</span>';
    },
    renderRoster: function () {
      var self = this, n = $('#roster'); if (!n) return;
      var stg = C.stages[self.stage()].id, items = self.stageItems();
      var list = self.data.students;
      $('#t-count').textContent = list.length + '명 접속 · 현재 ' + stg + ' 단계 문항';
      n.innerHTML = '<thead><tr><th>학생</th><th>집단</th>' + items.map(function (i) { return '<th title="' + esc(plain(ITEM[i].title)) + '">' + esc(shortOf(i)) + '</th>'; }).join('') + '<th>최근 활동</th></tr></thead><tbody>' +
        (list.length ? list.map(function (s) {
          var idle = (nowMs() - Date.parse(s.last_seen)) / 1000;
          return '<tr data-code="' + esc(s.code) + '" class="' + (self.sel === s.code ? 'on' : '') + '"><td><b>' + esc(s.code) + '</b></td><td><span class="grp ' + s.group.toLowerCase() + '">' + groupKo(s.group) + '</span></td>' +
            items.map(function (i) { return '<td>' + self.cell(s.group, s.items[i], i) + '</td>'; }).join('') + '<td class="muted">' + kst(s.last_seen) + (idle > 90 ? ' <span class="pill warn">연결 끊김?</span>' : '') + '</td></tr>';
        }).join('') : '<tr><td colspan="' + (items.length + 3) + '" class="empty">아직 들어온 학생이 없어요. 학생은 수업 코드 ' + esc(self.code) + '로 입장해요.</td></tr>') + '</tbody>';
    },
    select: function (code, itemId) {
      this.sel = code; this.selItem = itemId || null; this.confirmCustom = false;
      this.renderRoster(); this.loadDetail(true);
    },
    loadDetail: function (fresh) {
      var self = this, code = self.sel;
      if (fresh) $('#tdetail').innerHTML = '<p class="empty">불러오는 중…</p>';
      return api('GET', 'staff/student?session=' + encodeURIComponent(self.code) + '&code=' + encodeURIComponent(code)).then(function (d) {
        if (self.sel !== code) return;
        var keepForm = !fresh && self.detail && self.detail.student.code === code && $('#sendform') && ($('#sf-custom') && $('#sf-custom').value || document.activeElement && $('#td-form') && $('#td-form').contains(document.activeElement));
        self.detail = d;
        if (keepForm) self.renderDetailTop(); else self.renderDetail();
      }).catch(function (e) { $('#tdetail').innerHTML = '<p class="empty">' + esc(e.message) + '</p>'; });
    },
    renderDetail: function () {
      var self = this, d = self.detail, s = d.student, n = $('#tdetail');
      n.innerHTML = '<div class="td-h"><h2>' + esc(s.code) + ' <span class="grp ' + s.group.toLowerCase() + '">' + groupKo(s.group) + '</span></h2></div><div id="td-top"></div>' +
        (s.group === 'CONTROL' ? '<div id="td-form"></div>' : '<p class="note">실험집단 학생은 AI 튜터가 지원해요. 교사는 수학 내용을 따로 돕지 않습니다.</p>');
      self.renderDetailTop();
      if (s.group === 'CONTROL') self.renderForm();
    },
    renderDetailTop: function () {
      var self = this, d = self.detail, s = d.student, n = $('#td-top'); if (!n) return;
      var items = self.stageItems();
      if (!self.selItem || !ITEM[self.selItem] || (items.indexOf(self.selItem) < 0 && !d.items[self.selItem])) self.selItem = items[0];
      var it = d.items[self.selItem], ri = resolveItem(self.selItem, s.group, self.data.session.settings);
      var h = '<div class="itabs">' + items.map(function (i) { return '<button class="itab' + (i === self.selItem ? ' on' : '') + '" data-itab="' + i + '">' + esc(shortOf(i)) + '</button>'; }).join('') + '</div><p class="td-q">' + fmt(ri.title) + '</p>' + (ri.choices ? choicesHTML(ri.choices) : '');
      if (!it || !it.versions || !it.versions.length) {
        var dk = it && it.draft ? Object.keys(it.draft).filter(function (k) { return String(it.draft[k] || '').trim(); }) : [];
        h += dk.length ? '<p class="muted">작성 중(아직 제출 안 함)</p>' + fieldsView(ri, it.draft, it.draft_sel) : '<p class="muted">아직 제출하지 않았어요.</p>';
      } else {
        var first = it.versions[0], last = it.versions[it.versions.length - 1];
        h += '<p class="td-k">최근 제출 · ' + last.no + '회차 · ' + kst(last.at) + '</p>' + fieldsView(ri, last.fields, last.sel);
        if (last.reason) h += '<p class="td-reason">고친 이유: ' + esc(last.reason) + '</p>';
        if (it.versions.length > 1) h += '<details><summary>처음 제출본 보기 (' + kst(first.at) + ')</summary>' + fieldsView(ri, first.fields, first.sel) + '</details>';
        if (s.group === 'CONTROL') h += '<p class="td-flag">규칙 판정 표시: <b>' + ({ empty: '빈칸·막힘', num_ok: '숫자 맞음', num_check: '숫자 확인 필요', text: '서술형(교사 판단)' }[it.last_judgment && it.last_judgment.flag] || '-') + '</b> <small>AI 판정은 통제집단에 쓰지 않아요</small></p>';
        else h += '<p class="td-flag">지원 수준 ' + (it.rec.level || 0) + ' · 최고 ' + (it.rec.maxLevel || 0) + ' · 상태 ' + esc(it.rec.status || '') + '</p>';
      }
      var th = d.messages.filter(function (m) { return m.item_id === self.selItem && m.sender !== 'SYS'; });
      if (th.length) h += '<div class="td-thread">' + th.map(function (m) { return '<p><b>' + (m.sender === 'TEACHER' ? '교사' : 'AI') + ' L' + m.level + '</b> ' + fmt(m.text) + ' <time>' + kst(m.at) + '</time></p>'; }).join('') + '</div>';
      n.innerHTML = h;
      $$('[data-itab]', n).forEach(function (b) { b.onclick = function () { self.selItem = b.getAttribute('data-itab'); self.confirmCustom = false; self.renderDetailTop(); if (s.group === 'CONTROL') self.renderForm(); }; });
    },
    renderForm: function () {
      var self = this, d = self.detail, n = $('#td-form'); if (!n) return;
      var it = d.items[self.selItem], cap = C.stages[stageIdxOf(ITEM[self.selItem].stage)].cap;
      var opt = it ? it.options : { preSubmitOnly: true, levels: [0], suggested: 0, cap: cap };
      var openReq = d.requests.filter(function (r) { return r.item_id === self.selItem && !r.answered_at; });
      n.innerHTML = '<form class="sendform" id="sendform"><h3>지원 보내기 <small>' + esc(shortOf(self.selItem)) + '</small></h3>' +
        (opt.preSubmitOnly ? '<p class="note">학생이 아직 제출하지 않았어요. 두 집단 공통 원칙에 따라 “먼저 생각 적기” 안내만 보낼 수 있어요.</p>' : '') +
        '<p class="hint small">메타인지적 점검 질문 · 단일 지원 수준</p><input id="sf-level" type="hidden" value="1">' +
        (!openReq.length ? '<p class="note">학생의 도움 요청이 오면 발문을 보낼 수 있습니다.</p>' : '') +
        '<fieldset class="panel"><legend>질문을 만드는 방법</legend>'+
        '<label style="display:inline-block;margin-right:14px"><input type="radio" name="sf-mode" value="bank" checked> 미리 준비한 질문 선택</label>'+
        '<label style="display:inline-block"><input type="radio" name="sf-mode" value="custom"> 교사가 직접 질문 쓰기</label></fieldset>'+
        '<div id="sf-bank" class="bank"></div>'+
        '<div id="sf-compose" hidden><label for="sf-custom"><b>학생 답변을 보고 직접 질문하세요.</b></label>'+
        '<textarea id="sf-custom" rows="3" maxlength="130" placeholder="예: 네가 그렇게 생각한 이유를 한 가지 말해볼래?"></textarea>'+
        '<label for="sf-emergency-reason"><b>비상시 직접 입력 사유 (필수)</b></label><input id="sf-emergency-reason" maxlength="180" placeholder="예: 은행의 질문이 학생 상황과 맞지 않음">'+
        '<p class="hint small">정답, 공식, 계산방법을 알려주지 마세요. 학생에게는 작성한 질문이 텍스트로 전달됩니다. 직접 작성 질문은 연구자가 기록으로 검수합니다.</p></div>' +
        '<label style="display:block;margin:10px 0"><input type="checkbox" id="sf-private-oral"> 같은 질문을 해당 학생에게 개별적으로 말로도 전달함 (교사 자기보고)</label>'+
        '<p class="hint small">전체 Zoom 강의실에 개별 질문을 읽는 방식은 사용하지 마세요. 체크 여부와 실제 전달 원문을 로그에 보존하며 음성 전달 자체를 독립적으로 검증한 것은 아닙니다.</p>'+
        '<p class="warnline" id="sf-warn" hidden></p><button class="btn primary" type="submit"' + ((!openReq.length || opt.preSubmitOnly) ? ' disabled' : '') + '>보내기</button>' +
        '<span class="hint small">' + (openReq.length ? '학생에게 텍스트 발송 · 교사 질문 선택이 기록됩니다. 소리 내어 말했는지는 기록되지 않습니다.' : '요청 전에는 발문을 보낼 수 없어요.') + '</span></form>';
      var renderBank = function () {
        var L = +$('#sf-level').value;
        var list = L === 0 ? [] : self.bank.bank.filter(function (b) { return b.item === self.selItem && b.level === 1 && !b.group; });
        var state = it && it.rec && it.rec.state || '*';
        var priority = list.filter(function(b){return b.state === state || b.state === '*';});
        var top = priority.slice(0,6), more = list.filter(function(b){return top.indexOf(b) < 0;});
        var optionHTML=function(b,checked){return '<label class="bankopt"><input type="radio" name="sf-b" value="' + esc(b.id) + '"' + (checked?' checked':'') + '><span>' + fmt(b.text) + ' <small>(' + esc(b.state) + ')</small></span></label>';};
        $('#sf-bank').innerHTML = '<p class="hint small">학생 응답 상태: ' + esc(state) + ' · 우선 추천 ' + top.length + '개 (교사는 내용 확인 후 선택)</p>' +
          top.map(function(b,i){return optionHTML(b,i===0);}).join('') +
          (more.length?'<details><summary>다른 승인된 메타인지 질문 ' + more.length + '개 보기</summary>' + more.map(function(b){return optionHTML(b,false);}).join('') + '</details>':'');
      };
      renderBank();
      $('input[name="sf-mode"]').forEach(function(radio){
        radio.onchange=function(){
          var custom=($('input[name="sf-mode"]:checked')||{}).value==='custom';
          $('#sf-bank').hidden=custom;
          $('#sf-compose').hidden=!custom;
        };
      });
      // 미리 승인된 질문 선택과 교사 직접 질문을 구분해 기록한다.
      // 어떤 모드든 지원 수준 1, 최초 답변 뒤 학생 도움 요청을 유지한다.
      $('#sendform').onsubmit = function (ev) {
        ev.preventDefault();
        var btn = $('#sendform button[type=submit]'); btn.disabled = true;
        var mode=($('input[name="sf-mode"]:checked')||{}).value==='custom'?'custom':'bank';
        var body = { session: self.code, code: d.student.code, item_id: self.selItem, level: +$('#sf-level').value, mode:mode, bank_id: mode==='bank'?($('input[name="sf-b"]:checked')||{}).value:null, custom: mode==='custom'?$('#sf-custom').value.trim():'', emergency_reason:mode==='custom'?$('#sf-emergency-reason').value.trim():'', private_oral: $('#sf-private-oral').checked };
        api('POST', 'staff/send', body).then(function (r) {
          if (r.warn) {
            self.confirmCustom = true;
            var w = $('#sf-warn'); w.hidden = false;
            w.textContent = ({ correctness_signal: '맞고 틀림을 알려 주는 표현이 있어요.', new_number: '정답 숫자가 들어 있을 수 있어요.', answer_leak: '정답을 그대로 알려 줄 수 있어요.', empty: '빈 문장이에요.' }[r.warn] || '확인이 필요한 문장이에요.') + ' 그래도 보내려면 한 번 더 누르세요.';
            return;
          }
          toast(d.student.code + '에게 보냈어요.'); self.confirmCustom = false;
          return self.loadDetail(true).then(function () { return self.refresh(); });
        }).catch(function (e) { toast(e.message, 'crit'); }).then(function () { if ($('#sendform button[type=submit]')) $('#sendform button[type=submit]').disabled = false; });
      };
    }
  };
  function fieldsView(ri, fields, sel) {
    fields = fields || {}; sel = sel || {};
    return '<dl class="fv">' + ri.fields.map(function (f) {
      var v = fields[f.key];
      if (f.kind === 'choice') { var o = (f.options || []).filter(function (x) { return x.v === v; })[0]; v = o ? plain(o.label) : ''; }
      if (f.kind === 'multi') { v = multiVals(v).map(function (x) { var o2 = (f.options || []).filter(function (y) { return y.v === x; })[0]; return o2 ? plain(o2.label) : x; }).join(', '); }
      var s = (sel[f.key] || []).map(elLabel).join(', ');
      return '<dt>' + fmt(f.label) + '</dt><dd>' + (String(v || '').trim() ? esc(v) : '<i>빈칸</i>') + (s ? '<span class="fv-sel">도형: ' + s + '</span>' : '') + '</dd>';
    }).join('') + '</dl>';
  }

  /* =====================================================================
   * 연구자
   * ===================================================================== */
  var Researcher = {
    tab: 'sess', code: null, sessions: [], events: [], admin: null,
    start: function () {
      cleanup(); App.screen = 'researcher';
      var self = this;
      document.body.className = 'is-researcher';
      self.code = store('pq4r:researcher-session') || null;
      $('#app').innerHTML = topbar('연구자 화면', '<span id="r-sess" class="pill"></span>') +
        '<nav class="rtabs" id="rtabs">' + [['sess', '수업·설정'], ['roster', '명단'], ['log', '기록'], ['fid', '처치충실도'], ['rev', '사람 검토'], ['bank', '발문 은행'], ['worksheet', '활동지 점검'], ['mat', '개념 자료'], ['status', '운영 점검']].map(function (t) {
          return '<button class="rtab" data-tab="' + t[0] + '">' + t[1] + '</button>';
        }).join('') + '</nav><section class="rbody" id="rbody"></section>';
      bindExit();
      $('#rtabs').addEventListener('click', function (ev) { var b = ev.target.closest('[data-tab]'); if (!b) return; self.tab = b.getAttribute('data-tab'); self.render(); });
      App.timers.push(setInterval(function () { var t = $('#timer'), s = self.cur(); if (t && s) t.innerHTML = timerText(s); }, 1000));
      self.loadSessions().then(function () { self.render(); });
    },
    cur: function () { var c = this.code; return this.sessions.filter(function (s) { return s.code === c; })[0] || null; },
    loadSessions: function () {
      var self = this;
      return api('GET', 'staff/sessions').then(function (r) {
        self.sessions = r.sessions;
        if (!self.cur() && self.sessions.length) self.code = self.sessions[0].code;
        self.renderTop();
      });
    },
    renderTop: function () {
      var s = this.cur(), n = $('#stepper'); if (n) n.innerHTML = s ? stepperHTML(s.stage, s.stage, { noNav: true, lesson: s.lesson }) : '';
      var p = $('#r-sess'); if (p) p.textContent = s ? '수업 ' + s.code : '수업 없음';
      var tl = $('#tb-lesson'); if (tl) tl.textContent = s ? lessonLabel(s.lesson) : 'PQ4R 튜터';
    },
    render: function () {
      var self = this;
      $$('.rtab').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === self.tab); });
      self.renderTop();
      var t = self.tab;
      if (t === 'sess') return self.renderSess();
      if (t === 'roster') return self.renderRoster();
      if (t === 'bank') return self.withAdmin(function () { self.renderBank(); });
      if (t === 'mat') return self.withAdmin(function () { self.renderMat(); });
      if (t === 'worksheet') return self.renderWorksheet();
      if (t === 'status') return self.renderStatus();
      if (t === 'fid') return self.renderFid();
      $('#rbody').innerHTML = '<p class="loading">기록을 불러오는 중…</p>';
      api('GET', 'admin/events?session=' + encodeURIComponent(self.code || 'ALL')).then(function (r) { self.events = r.events; if (self.tab === 'log') self.renderLog(); else if (self.tab === 'rev') self.withAdmin(function () { self.renderRev(); }); })
        .catch(function (e) { $('#rbody').innerHTML = '<p class="empty">' + esc(e.message) + '</p>'; });
    },
    withAdmin: function (fn) { var self = this; if (self.admin) return fn(); api('GET', 'admin/bank').then(function (r) { self.admin = r; fn(); }).catch(function (e) { toast(e.message, 'crit'); }); },
    renderSess: function () {
      var self = this, s = self.cur();
      function tog(key, label, desc) { return '<label class="tog"><input type="checkbox" data-set="' + key + '"' + (s.settings[key] ? ' checked' : '') + '><span class="tog-t"><b>' + label + '</b><small>' + desc + '</small></span></label>'; }
      $('#rbody').innerHTML = '<div class="rgrid">' +
        '<section class="rcard"><h2>수업 <small>차시 × 반마다 하나</small></h2><div class="sesslist">' +
        (self.sessions.length ? self.sessions.map(function (x) { return '<button class="sessrow' + (x.code === self.code ? ' on' : '') + '" data-sess="' + esc(x.code) + '"><span><b>' + esc(x.code) + '</b> · ' + esc(lessonLabel(x.lesson)) + (x.class_name ? ' · ' + esc(x.class_name) + '반' : ' · 반 제한 없음') + '</span><span class="pill ' + (x.status === 'open' ? 'ok' : '') + '">' + (x.status === 'open' ? '열림' : '끝남') + ' · ' + x.joined + '명 · ' + C.stages[x.stage].id + '</span></button>'; }).join('') : '<p class="empty">아직 수업이 없어요. 아래에서 만드세요.</p>') +
        '</div><h3>새 수업 만들기</h3><form class="formrow" id="newsess"><label>수업 코드<input id="ns-code" required maxlength="24" placeholder="예: 2A-L1" autocapitalize="characters"></label><label>반(명단의 반과 같게)<input id="ns-class" maxlength="40" placeholder="예: 2A"></label><label>차시<select id="ns-lesson">' + Object.keys(C.lessons).map(function (k) { return '<option value="' + k + '">' + esc(lessonLabel(+k)) + ' (' + C.lessons[k].total + '분)</option>'; }).join('') + '</select></label>' +
        '<label class="tog" style="border:0;padding:0"><input type="checkbox" id="ns-demo"><span class="tog-t"><b>시연용</b><small>학생 화면에서 단계 넘기기</small></span></label><button class="btn primary" type="submit">만들기</button></form>' +
        '<p class="hint small">반을 적으면 그 반 명단의 학생만 들어올 수 있어요. 수업 코드는 학생에게 알려 주는 입장 코드예요.</p></section>' +
        (s ? '<section class="rcard"><h2>' + esc(s.code) + ' 진행 <small>' + esc(lessonLabel(s.lesson)) + ' · ' + (s.status === 'open' ? '열림' : '끝남') + '</small></h2><p>현재 단계: <b>' + (s.stage + 1) + '. ' + C.stages[s.stage].id + ' ' + C.stages[s.stage].ko + '</b> · <span class="mono">' + timerText(s) + '</span></p>' +
          '<div class="row"><button class="btn sm" id="r-prev"' + (s.stage === 0 || s.status !== 'open' ? ' disabled' : '') + '>이전 단계</button><button class="btn sm primary" id="r-next"' + (s.stage === 5 || s.status !== 'open' ? ' disabled' : '') + '>다음 단계 열기</button><button class="btn sm" id="r-teacher">교사 화면으로</button>' +
          '<button class="btn sm ghost" id="r-close">' + (s.status === 'open' ? '수업 끝내기' : '다시 열기') + '</button></div>' +
          '<p class="hint">단계를 열면 이전 단계는 학생 화면에서 보기 전용이 되고, 제출하지 않은 답은 미완료로 기록돼요. Recite 동안은 앞 단계가 가려집니다.</p>' +
          '<h3>이 수업 설정 <small>바꾸면 기록에 남아요</small></h3>' +
          tog('aiJudge', 'AI 판정 사용', '서술형 답을 학생 상태 9가지 중 하나로 분류해요(실험집단만). API 키가 없으면 규칙 판정만 써요.') +
          tog('aiJudgeTwice', 'AI 판정 두 번 확인', '같은 판정을 두 번 돌려 다르면 보류하고 뜻 확인 질문을 보내요(사람 검토 대상).') +
          '<p class="hint small">연구용 발문은 공통 1수준 은행의 원문만 제공합니다. AI 문장 재작성 기능은 비활성화되어 있습니다.</p>' +
          tog('fadingPairs', '짝 문항으로 지원 감소 관찰', '1차시 RD02(개념확인)↔RF01(합동조건), 2차시 RD02(대각선 증명)↔RF02(대각선 길이).') +
          tog('materialsInReflect', 'Reflect에서도 개념 정리 열람 허용', '기본은 Read에서만 보여요.') +
          tog('demoControls', '학생 화면에 시연 제어 표시', '실제 수업에서는 끄세요.') + '</section>' : '') + '</div>';
      $$('[data-sess]').forEach(function (b) { b.onclick = function () { self.code = b.getAttribute('data-sess'); store('pq4r:researcher-session', self.code); self.render(); }; });
      $('#newsess').onsubmit = function (ev) {
        ev.preventDefault();
        api('POST', 'admin/session', { code: $('#ns-code').value.trim().toUpperCase(), class_name: $('#ns-class').value.trim(), lesson: +$('#ns-lesson').value, settings: { demoControls: $('#ns-demo').checked } })
          .then(function (r) { self.code = r.session.code; store('pq4r:researcher-session', self.code); toast('수업 ' + r.session.code + '을 만들었어요.'); return self.loadSessions(); }).then(function () { self.render(); }).catch(function (e) { toast(e.message, 'crit'); });
      };
      if (!s) return;
      var stageGo = function (d) {
        if (d > 0 && !window.confirm(C.stages[s.stage + 1].id + ' 단계를 열까요? 지금 단계에서 제출하지 않은 답은 미완료로 기록돼요.')) return;
        api('POST', 'staff/stage', { session: s.code, stage: s.stage + d }).then(function () { return self.loadSessions(); }).then(function () { self.render(); }).catch(function (e) { toast(e.message, 'crit'); });
      };
      $('#r-prev').onclick = function () { stageGo(-1); }; $('#r-next').onclick = function () { stageGo(1); };
      $('#r-teacher').onclick = function () { Teacher.start(s.code); };
      $('#r-close').onclick = function () {
        var to = s.status === 'open' ? 'closed' : 'open';
        if (to === 'closed' && !window.confirm('수업을 끝낼까요? 학생은 더 이상 들어오거나 제출할 수 없어요.')) return;
        api('POST', 'admin/session/update', { session: s.code, status: to }).then(function () { return self.loadSessions(); }).then(function () { self.render(); }).catch(function (e) { toast(e.message, 'crit'); });
      };
      $$('[data-set]').forEach(function (inp) {
        inp.addEventListener('change', function () {
          var key = inp.getAttribute('data-set'), val = inp.type === 'checkbox' ? inp.checked : inp.value;
          api('POST', 'admin/session/update', { session: s.code, key: key, value: val }).then(function () { toast('설정을 저장했어요.'); return self.loadSessions(); }).catch(function (e) { toast(e.message, 'crit'); });
        });
      });
    },
    renderRoster: function () {
      var self = this;
      $('#rbody').innerHTML = '<div class="rgrid"><section class="rcard"><h2>명단 올리기 <small>가명 코드만</small></h2>' +
        '<p class="hint">한 줄에 한 명: <span class="mono">학생코드, 집단(실험/통제), 반, PIN(선택)</span>. 이름은 넣지 마세요. PIN을 비우면 4자리를 새로 만들어요. PIN은 오른쪽 학생 목록(연구자 화면)에서 언제든 다시 볼 수 있어요.</p>' +
        '<p class="row"><input type="file" id="ro-file" accept=".csv,.txt,text/csv" aria-label="명단 CSV 파일 고르기"><button class="btn sm" id="ro-sample">예시 넣기</button></p>' +
        '<textarea id="ro-csv" class="roster-in" rows="10" aria-label="명단 CSV 내용" placeholder="code,group,class,pin&#10;S2A01,실험,2A,&#10;S2A02,통제,2A,"></textarea>' +
        '<p class="row"><button class="btn primary" id="ro-up">올리기</button></p><div id="ro-out"></div></section>' +
        '<section class="rcard"><h2>학생 <small id="st-n"></small></h2><p class="row"><button class="btn sm" id="st-pins">PIN 목록 내려받기</button><button class="btn sm ghost" id="st-mask" aria-pressed="false">PIN 가리기</button><span class="hint small">입장 카드 인쇄용. 화면을 띄워 둘 때는 가려 두세요.</span></p><div class="tablewrap"><table id="st-t"><tbody><tr><td class="empty">불러오는 중…</td></tr></tbody></table></div></section></div>';
      $('#ro-sample').onclick = function () { $('#ro-csv').value = 'code,group,class,pin\nS2A01,실험,2A,\nS2A02,통제,2A,\nS2A03,실험,2A,'; };
      $('#ro-file').onchange = function () { var f = this.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { $('#ro-csv').value = rd.result; }; rd.readAsText(f, 'utf-8'); };
      $('#ro-up').onclick = function () {
        var csv = $('#ro-csv').value; if (!csv.trim()) return;
        api('POST', 'admin/roster', { csv: csv }).then(function (r) {
          var h = '<p>새로 <b>' + r.created + '</b>명 · 바뀜 <b>' + r.updated + '</b>명 · 그대로 ' + r.unchanged + '명' + (r.errors.length ? ' · <b class="warnline">오류 ' + r.errors.length + '줄</b>' : '') + '</p>';
          if (r.errors.length) h += '<ul class="checklist">' + r.errors.map(function (e) { return '<li><span class="pill crit">' + e.line + '줄</span><span>' + esc(e.code) + ' — ' + esc(e.error) + '</span></li>'; }).join('') + '</ul>';
          if (r.pins.length) { h += '<p class="row"><button class="btn sm primary" id="ro-pins">PIN 목록 내려받기 (' + r.pins.length + '명)</button><span class="hint small">학생에게 나눠 줄 입장 카드용</span></p>'; }
          $('#ro-out').innerHTML = h;
          if (r.pins.length) $('#ro-pins').onclick = function () { saveText('pq4r_pins_' + new Date().toISOString().slice(0, 10) + '.csv', '﻿code,group,class,pin\r\n' + r.pins.map(function (p) { return [p.code, p.group === 'EXPERIMENT' ? '실험' : '통제', p.class_name, p.pin].join(','); }).join('\r\n')); };
          self.loadStudents();
        }).catch(function (e) { toast(e.message, 'crit'); });
      };
      self.loadStudents();
    },
    loadStudents: function () {
      var self = this;
      api('GET', 'admin/students').then(function (r) {
        $('#st-n').textContent = r.students.length + '명 · 실험 ' + r.students.filter(function (s) { return s.group === 'EXPERIMENT'; }).length + ' · 통제 ' + r.students.filter(function (s) { return s.group === 'CONTROL'; }).length;
        var masked = !!self.pinMasked;
        $('#st-mask').textContent = masked ? 'PIN 보기' : 'PIN 가리기'; $('#st-mask').setAttribute('aria-pressed', masked ? 'true' : 'false');
        $('#st-mask').onclick = function () { self.pinMasked = !self.pinMasked; self.loadStudents(); };
        $('#st-pins').onclick = function () {
          var list = r.students.filter(function (s) { return s.pin; });
          if (!list.length) { toast('보여 줄 PIN이 없어요. PIN 새로를 눌러 만들어 주세요.', 'warn'); return; }
          saveText('pq4r_pins_' + new Date().toISOString().slice(0, 10) + '.csv', '\ufeffcode,group,class,pin\r\n' + list.map(function (p) { return [p.code, p.group === 'EXPERIMENT' ? '실험' : '통제', p.class_name, p.pin].join(','); }).join('\r\n'));
        };
        $('#st-t').innerHTML = '<thead><tr><th>코드</th><th>PIN</th><th>집단</th><th>반</th><th>참여 수업</th><th>상태</th><th></th></tr></thead><tbody>' + (r.students.length ? r.students.map(function (s) {
          var pinCell = s.pin ? (masked ? '••••' : esc(s.pin)) : '<span class="muted" title="예전에 만든 PIN이라 다시 볼 수 없어요. PIN 새로를 누르면 보여요.">—</span>';
          return '<tr><td class="mono"><b>' + esc(s.code) + '</b></td><td class="mono">' + pinCell + '</td><td>' + groupKo(s.group) + '</td><td>' + esc(s.class_name) + '</td><td class="mono">' + s.sessions + '</td><td>' + (s.active ? (s.locked ? '<span class="pill warn">잠김</span>' : '<span class="pill ok">사용</span>') : '<span class="pill">중지</span>') + '</td>' +
            '<td><button class="btn sm" data-pin="' + esc(s.code) + '">PIN 새로</button> <button class="btn sm ghost" data-act-st="' + esc(s.code) + '" data-v="' + (!s.active) + '">' + (s.active ? '중지' : '다시 사용') + '</button></td></tr>';
        }).join('') : '<tr><td colspan="7" class="empty">명단이 비어 있어요.</td></tr>') + '</tbody>';
        $$('[data-pin]').forEach(function (b) { b.onclick = function () { var c = b.getAttribute('data-pin'); if (!window.confirm(c + '의 PIN을 새로 만들까요? 예전 PIN은 쓸 수 없게 돼요.')) return; api('POST', 'admin/student', { code: c, reset_pin: true }).then(function (r2) { toast(c + '의 새 PIN: ' + r2.pin); self.loadStudents(); }).catch(function (e) { toast(e.message, 'crit'); }); }; });
        $$('[data-act-st]').forEach(function (b) { b.onclick = function () { api('POST', 'admin/student', { code: b.getAttribute('data-act-st'), active: b.getAttribute('data-v') === 'true' }).then(function () { self.loadStudents(); }).catch(function (e) { toast(e.message, 'crit'); }); }; });
      }).catch(function (e) { toast(e.message, 'crit'); });
    },
    renderLog: function () {
      var self = this, evs = self.events, sc = self.code || 'ALL';
      var students = Array.from(new Set(evs.map(function (e) { return e.student_id; }).filter(Boolean))).sort();
      var types = Array.from(new Set(evs.map(function (e) { return e.event_type; }))).sort();
      $('#rbody').innerHTML = '<div class="logbar"><span><b>' + evs.length + '</b>건 · ' + esc(sc) + ' · 06 사전 30개 항목 + 추가 11개</span>' +
        '<select id="lf-s" aria-label="학생 거르기"><option value="">모든 학생</option>' + students.map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('') + '</select>' +
        '<select id="lf-t" aria-label="이벤트 유형 거르기"><option value="">모든 이벤트</option>' + types.map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('') + '</select>' +
        '<button class="btn sm" id="lf-r">새로고침</button><button class="btn sm primary" id="lf-csv">CSV 내려받기</button><button class="btn sm" id="lf-json">JSON</button><button class="btn sm" id="lf-all">전체 수업 CSV</button><button class="btn sm ghost" id="lf-bak">전체 백업</button></div>' +
        '<div class="tablewrap"><table class="logt" id="logt"></table></div><p class="hint small">화면에는 최근 400건만 보여요. 내려받은 파일에는 모두 들어 있어요. 시각은 한국 시간으로 보이고 파일에는 UTC로 저장돼요.</p>';
      var draw = function () {
        var fs = $('#lf-s').value, ft = $('#lf-t').value;
        var rows = evs.filter(function (e) { return (!fs || e.student_id === fs) && (!ft || e.event_type === ft); }).slice(-400).reverse();
        $('#logt').innerHTML = '<thead><tr><th>시각(KST)</th><th>학생</th><th>집단</th><th>단계</th><th>문항</th><th>이벤트</th><th>회차</th><th>상태</th><th>수준</th><th>주체·경로</th><th>내용</th></tr></thead><tbody>' +
          rows.map(function (e) {
            var content = e.support_text || (e.response_raw ? summarize(e.response_raw) : '') || (e.transition_reason || '');
            return '<tr class="ev-' + e.event_type.toLowerCase() + '"><td class="mono">' + kst(e.event_timestamp, true) + '</td><td>' + esc(e.student_id || e.writer || '') + '</td><td>' + (e.group ? groupKo(e.group).replace('집단', '') : '') + '</td><td>' + esc(e.stage || '') + '</td><td>' + esc(e.item_id || '') + '</td><td><span class="evt">' + esc(e.event_type) + '</span>' + (e.error_flag ? ' <span class="flag">차단</span>' : '') + (e.needs_review ? ' <span class="flag rv">검토</span>' : '') + '</td><td class="mono">' + (e.attempt_no == null ? '' : e.attempt_no) + '</td><td class="mono">' + esc(e.student_state || e.performance_status || '') + '</td><td class="mono">' + (e.support_level_after != null ? (e.support_level_before == null ? '' : e.support_level_before) + '→' + e.support_level_after : '') + '</td><td>' + esc([e.support_provider !== 'NONE' ? e.support_provider : '', e.support_trigger || ''].filter(Boolean).join(' · ')) + '</td><td class="clip">' + esc(content) + '</td></tr>';
          }).join('') + '</tbody>';
      };
      $('#lf-s').onchange = draw; $('#lf-t').onchange = draw; draw();
      $('#lf-r').onclick = function () { self.render(); };
      $('#lf-csv').onclick = function () { download('admin/export?format=csv&session=' + encodeURIComponent(sc)); };
      $('#lf-json').onclick = function () { download('admin/export?format=json&session=' + encodeURIComponent(sc)); };
      $('#lf-all').onclick = function () { download('admin/export?format=csv&session=ALL'); };
      $('#lf-bak').onclick = function () { download('admin/backup'); };
    },
    renderFid: function () {
      var self = this, sc = self.code || 'ALL';
      $('#rbody').innerHTML = '<p class="loading">계산하는 중…</p>';
      api('GET', 'admin/fidelity?session=' + encodeURIComponent(sc)).then(function (r) {
        function row(ok, label, val, note) { return '<li class="' + (ok ? 'pass' : 'fail') + '"><span class="mk">' + (ok ? '통과' : '확인') + '</span><span class="lb">' + label + '</span><span class="vl mono">' + val + '</span>' + (note ? '<small>' + note + '</small>' : '') + '</li>'; }
        var maxl = r.maxLevelByStudent, ks = Object.keys(maxl).sort();
        $('#rbody').innerHTML = '<div class="rgrid"><section class="rcard"><h2>처치충실도 <small>' + esc(sc) + ' · 기록에서 자동 계산</small></h2><ul class="fid">' +
          row(r.preSubmitMath === 0, '첫 제출 전 메타인지 지원 없음', r.preSubmitMath + '건') + row(r.leaks === 0, '지원 문장에 정답 노출 없음', r.leaks + '건') +
          row(r.levelViolations === 0, '지원 강도 1수준만 사용', r.levelViolations + '건') + row(r.typeViolations === 0, '메타인지 발문 한 유형만 사용', r.typeViolations + '건') + row(r.unsolicited === 0, '학생 요청에 근거한 발문만 제공', r.unsolicited + '건') + row(r.unapprovedText === 0, '발문은행 외 질문 사용 없음', r.unapprovedText + '건') +
          row(r.reflectSignals === 0, 'Reflect에서 정오 신호 없음', r.reflectSignals + '건') + row(r.controlAI === 0, '통제집단 AI 지원 0건', r.controlAI + '건') +
          row(r.earlyReviewDisclosure === 0, 'Review 6분 이전 정답 공개 없음', r.earlyReviewDisclosure + '건') +
          row(true, '공개 전 답변 고정', r.reviewSnapshots + '명', '첫 해설 열람 시 원래 답변 보존') +
          row(true, '해설 공개 학생', r.reviewFeedbackOpens + '명') +
          row(true, '해설 후 이해도 성찰 제출', r.reviewPostReflections + '명') +
          row(r.reciteBeforeStudent === 0, 'Recite에서 학생 설명이 먼저', r.reciteBeforeStudent + '건') + row(true, 'AI 문장 차단(대체됨)', r.blocked + '건', '차단되면 원래 은행 문장이 나가요') +
          row(r.needsReview === 0, '사람 검토가 필요한 판정', r.needsReview + '건', '사람 검토 탭에서 코딩') +
          row(true, '미완료(시간 종료)', r.timeouts + '건', r.lateJoin ? '늦게 들어와 이미 닫힌 단계 문항 ' + r.lateJoin + '건은 따로 셈' : '') +
          row(r.materialInRecite === 0, '교재를 가리는 단계에서 열람 없음', r.materialInRecite + '건', 'Preview·Question·Recite·Review') +
          '</ul></section><section class="rcard"><h2>지원 분량</h2><p>AI 수학 지원 <b class="mono">' + r.supportCount.AI + '</b>회 · 교사 수학 지원 <b class="mono">' + r.supportCount.TEACHER + '</b>회</p>' +
          '<p>교재 열람: 실험 <b class="mono">' + r.materialOpens.EXPERIMENT + '</b>회 · 통제 <b class="mono">' + r.materialOpens.CONTROL + '</b>회</p>' +
          '<p>교사 응답 대기: ' + (r.teacherWait.n ? '중앙값 <b class="mono">' + mmss(r.teacherWait.median) + '</b> · 최대 <b class="mono">' + mmss(r.teacherWait.max) + '</b> (' + r.teacherWait.n + '건)' : '기록 없음') + '</p>' +
          '<h3>학생별 적용된 지원 수준</h3>' + (ks.length ? '<div class="lvls">' + ks.map(function (k) { return '<span class="lv"><b>' + esc(k) + '</b> L' + maxl[k] + '</span>'; }).join('') + '</div>' : '<p class="muted">아직 지원 기록이 없어요.</p>') + '</section></div>';
      }).catch(function (e) { $('#rbody').innerHTML = '<p class="empty">' + esc(e.message) + '</p>'; });
    },
    renderRev: function () {
      var self = this, evs = self.events, states = self.admin.states, sc = self.code;
      var reviewed = {}; evs.filter(function (e) { return e.event_type === 'TEACHER_REVIEW'; }).forEach(function (e) { if (e.extra && e.extra.target) reviewed[e.extra.target] = e; });
      var list = evs.filter(function (e) { return (e.event_type === 'FIRST_SUBMIT' || e.event_type === 'RESUBMIT') && e.needs_review; });
      $('#rbody').innerHTML = '<section class="rcard wide"><h2>사람 검토 <small>' + esc(sc || '') + ' · 판정이 애매했던 제출 ' + list.length + '건</small></h2>' +
        '<p class="hint">수업 중에는 학생에게 뜻 확인 질문이 나갔어요. 여기서 상태를 코딩하면 TEACHER_REVIEW 기록으로 남아요(코더 ID = 로그인 ID).</p>' +
        (list.length ? list.map(function (e) {
          var done = reviewed[e.event_id];
          return '<article class="revcard"><p class="rv-h"><b>' + esc(e.student_id) + '</b> ' + esc(e.item_id) + ' · ' + e.attempt_no + '회차 · ' + kst(e.event_timestamp, true) + ' · 자동: <span class="mono">' + esc(e.student_state) + '</span> (' + esc(e.judge_source || '') + ')</p>' +
            '<pre class="rv-raw">' + esc(summarize(e.response_raw, true)) + '</pre>' +
            (e.extra && e.extra.ai ? '<p class="small muted">AI: ' + e.extra.ai.map(function (a) { return a ? esc(a.state + ' — ' + (a.evidence || '')) : '실패'; }).join(' / ') + '</p>' : '') +
            '<div class="row"><select data-code-for="' + esc(e.event_id) + '" aria-label="사람 코딩 상태">' + Object.keys(states).map(function (k) { return '<option value="' + k + '"' + (done && done.student_state === k ? ' selected' : '') + '>' + k + ' — ' + esc(states[k]) + '</option>'; }).join('') + '</select>' +
            '<button class="btn sm" data-save-review="' + esc(e.event_id) + '">코딩 저장</button>' + (done ? '<span class="ok-note">코딩됨 · ' + kst(done.event_timestamp) + '</span>' : '') + '</div></article>';
        }).join('') : '<p class="empty">검토할 제출이 없어요.</p>') + '</section>';
      $$('[data-save-review]').forEach(function (b) {
        b.onclick = function () {
          var id = b.getAttribute('data-save-review'), src = evs.filter(function (e) { return e.event_id === id; })[0];
          api('POST', 'admin/review', { session: src.session_id, target: id, state: $('[data-code-for="' + id + '"]').value }).then(function () { toast('코딩을 저장했어요.'); self.render(); }).catch(function (e) { toast(e.message, 'crit'); });
        };
      });
    },
    renderBank: function () {
      var A = this.admin, rows = A.bank.slice().sort(function (a, b) { return a.item < b.item ? -1 : a.item > b.item ? 1 : a.level - b.level; });
      var byItem = {}; rows.forEach(function (b) { (byItem[b.item] = byItem[b.item] || []).push(b); });
      var cap = {}; A.caps.forEach(function (c) { cap[c.id] = c.cap; });
      $('#rbody').innerHTML = '<section class="rcard wide"><h2>발문 은행 <small>' + esc(A.versions.bank) + ' · ' + A.bank.length + '문장 + 공통 ' + Object.keys(A.common).length + ' · 연구자 승인 필요</small></h2>' +
        '<p class="hint">이번 판(활동지 PPTX 반영)의 정답 기준과 발문은 Claude가 쓴 초안이라 연구자 검토가 필요해요. 이 질문들은 2026년 10월 23일 새로 작성한 수학 개념 연계형 메타인지 질문 후보입니다. 모두 단일 강도 1수준이며 연구자 최종 검수가 필요합니다. 상태가 * 이면 모든 학생 상태에서 사용할 수 있으며, 반복 요청 시 미사용 질문을 우선합니다. 이 화면과 정답 기준은 연구자에게만 보여요.</p>' +
        Object.keys(C.lessons).map(function (ln) {
          return '<h3>' + esc(lessonLabel(+ln)) + '</h3>' + C.items.filter(function (it) { return String(it.lesson) === ln && !it.archived; }).map(function (it) {
          var rbx = A.rubric[it.id], fxs = it.byGroup && it.byGroup.EXPERIMENT && it.byGroup.EXPERIMENT.fixedAI ? A.fixed_ai[it.byGroup.EXPERIMENT.fixedAI] : null;
          var vk = function (l) { return (l || []).map(function (v) { return ({ right: '옳다', partly: '일부만 옳다', wrong: '다 틀리다' })[v]; }).join('·') || '없음'; };
          return '<details class="bankitem"><summary><b>' + esc(it.short) + '</b> ' + esc(it.stage) + ' · 상한 ' + cap[it.stage] + ' · ' + (byItem[it.id] || []).length + '문장' + (rbx && rbx.draft ? ' <span class="pill warn">기준 초안</span>' : '') + '</summary>' +
            '<p class="small muted">' + fmt(it.title) + '</p>' +
            (rbx ? '<p class="small"><b>정답 기준' + (rbx.draft ? '(초안 · 연구자 검토 필요)' : '') + '</b> 기대: ' + fmt(rbx.expected) + ' / 인정: ' + fmt(rbx.accepted) + ' / 오개념: ' + fmt(rbx.misconceptions) + (rbx.add ? '<br><b>추가 기준</b> ' + fmt(rbx.add) : '') + '</p>' : '') +
            (fxs ? '<p class="small"><b>두 집단 공통 검토 설명</b> “' + fmt(fxs.text) + '” · 실제 성격 <span class="mono">' + esc(fxs.type) + '</span> · 충족으로 보는 판단: ' + vk(fxs.ok) + (fxs.near && fxs.near.length ? ' · 일부 충족: ' + vk(fxs.near) : '') + '</p>' : '') +
            '<table class="banktab"><thead><tr><th>수준</th><th>상태</th><th>변형</th><th>집단</th><th>출처</th><th>문장</th></tr></thead><tbody>' +
            (byItem[it.id] || []).map(function (b) { return '<tr><td class="mono">L' + b.level + '</td><td class="mono small">' + esc(b.state) + '</td><td>' + esc(b.variant) + '</td><td>' + (b.group ? groupKo(b.group).replace('집단', '') : '공통') + '</td><td>' + esc(b.src) + '</td><td>' + fmt(b.text) + '</td></tr>'; }).join('') + '</tbody></table></details>';
          }).join('');
        }).join('') +
        '<h3>공통 응답</h3><table class="banktab"><tbody>' + Object.keys(A.common).map(function (k) { var c = A.common[k]; return '<tr><td class="mono small">' + k + '</td><td>' + fmt(c.text) + '</td></tr>'; }).join('') + '</tbody></table>' +
        (A.excluded.length ? '<h3>은행에서 뺀 문장</h3><table class="banktab"><tbody>' + A.excluded.map(function (x) { return '<tr><td class="mono">' + esc(x.item) + ' L' + x.level + '</td><td>' + esc(x.text) + '</td><td class="muted">' + esc(x.reason) + '</td></tr>'; }).join('') + '</tbody></table>' : '') + '</section>';
    },
    renderWorksheet: function () {
      var s = this.cur();
      var stages=['Preview','Question','Read','Reflect','Recite','Review'];
      var slides={1:{Preview:'1',Question:'1',Read:'2~3',Reflect:'4~6',Recite:'7',Review:'8'},
                  2:{Preview:'1',Question:'1',Read:'2~4',Reflect:'5~7',Recite:'8',Review:'9'}};
      var labels={Preview:'미리보기',Question:'질문 만들기',Read:'개념 읽기와 개념 확인',
                  Reflect:'제시된 설명 검토',Recite:'스스로 설명',Review:'스스로 다시 풀기'};
      var html='<section class="rcard wide"><h2>활동지 점검 <small>현재 웹앱의 실제 문항과 답변란</small></h2>'+
        '<p class="hint">최종 PPTX 7개와 비교한 웹 구현 목록입니다. <b>PPTX 원본 파일 자체를 이 서버에 업로드한 것은 아닙니다.</b> 아래 문제와 도형이 학생 화면에 연결된 내용을 확인하세요.</p>'+
        '<p class="hint small">1차시 AI·교사 활동지 각 8쪽, 2차시 AI·교사 활동지 각 9쪽. 정답지는 각 5쪽, 공통 성찰지 1쪽. 두 집단에 같은 수학문항과 동일한 Reflect 검토 설명을 제공해야 합니다.</p>';
      Object.keys(C.lessons).forEach(function(ln) {
        var L=Number(ln),list=C.items.filter(function(it){return it.lesson===L&&!it.archived;});
        html+='<h3>'+esc(lessonLabel(L))+' · 활동 문항 '+list.length+'개</h3>'+
          '<p class="small">차시 시간 60분 · Preview 2, Question 2, Read 16, Reflect 19, Recite 9, Review 12분</p>';
        stages.forEach(function(stage){
          var subset=list.filter(function(it){return it.stage===stage;});
          if(!subset.length)return;
          html+='<details class="bankitem"><summary><b>'+stage+'</b> '+esc(labels[stage])+
            ' · 활동지 '+slides[L][stage]+'쪽 · 문항 '+subset.length+'개</summary>';
          subset.forEach(function(it){
            var ai=resolveItem(it.id,'EXPERIMENT',{}),tc=resolveItem(it.id,'CONTROL',{});
            var same=JSON.stringify(ai)===JSON.stringify(tc);
            var prob=L&&C.lessons[L]&&C.lessons[L].stageProblem&&C.lessons[L].stageProblem[stage];
            var shared=prob&&C.problems[prob];
            html+='<article class="panel"><h4>'+esc(it.id)+' '+fmt(ai.title)+'</h4>'+
              (ai.sub?'<p class="small">'+fmt(ai.sub)+'</p>':'')+
              (shared?'<p class="small"><b>공통 문제:</b> '+fmt(shared.text)+'</p>'+figHTML(C.figs[shared.fig]):'')+
              (ai.fig?figHTML(ai.fig):'')+choicesHTML(ai.choices)+
              (ai.fixedAI?'<p class="small"><b>두 집단 공통 검토 설명:</b> '+fmt(ai.fixedAI.text)+'</p>':'')+
              '<p class="small"><b>입력란:</b> '+ai.fields.map(function(f){return esc(f.label)+(f.kind==='choice'?' (선택형)':'');}).join(' / ')+'</p>'+
              '<p class="small">'+(same?'집단별 화면 콘텐츠 일치':'집단별 안내 또는 입력란 차이 존재 · 원본 대조 필요')+'</p></article>';
          });
          html+='</details>';
        });
      });
      html+='<section class="panel"><h3>공통 Review 운영 확인</h3>'+
        '<p>첫 6분: 풀이와 정답 공개 전 확신 정도 기록. 6~10분: 두 집단에 같은 서버 정답 및 풀이 공개. 10~12분: 이해도 선택과 짧은 성찰 저장.</p>'+
        '<p class="hint">정답 본문은 이 학생용 공개 API에 포함되지 않습니다. 연구자 발문 은행에서는 정답키 초안을 볼 수 있습니다. 실제 학생 화면에서 6분 차단 여부는 별도 시연으로 검증해야 합니다.</p></section></section>';
      $('#rbody').innerHTML=html;
    },
    renderMat: function () {
      var notes = this.admin.material_notes || [];
      $('#rbody').innerHTML = '<section class="rcard wide"><h2>개념 자료 <small>활동지 개념 정리 3장 + 교재 9장 · 차시별 연결</small></h2>' +
        '<p class="hint">학생 화면에는 그 차시의 개념 정리(활동지)와 교재가 Read 단계에서만 보여요(두 집단 같음). 열고 닫은 시각과 본 시간은 기록에 남아요.</p>' +
        '<div class="matgrid">' + C.materials.map(function (m, i) {
          var ns = notes.filter(function (n) { return n.id === m.id; });
          return '<article class="matcard"><button type="button" class="mat-thumb" data-rmat="' + i + '"><img src="' + esc(m.thumb) + '" alt="' + esc(m.title) + ' 미리보기" loading="lazy"></button>' +
            '<div class="matcard-t"><p class="mc-k">' + (m.lesson ? esc(lessonLabel(m.lesson)) + ' · ' + (m.role === 'main' ? '개념 정리로 사용 중' : '교재(참고)로 사용 중') : '다음 차시용 · 아직 연결 안 함') + '</p><h3>' + esc(m.title) + '</h3><p class="muted small">' + esc(m.topic) + '</p>' +
            (ns.length ? '<ul class="mc-notes">' + ns.map(function (n) { return '<li><b>' + esc(n.kind) + '</b> ' + esc(n.text) + '</li>'; }).join('') + '</ul>' : '<p class="small ok-note">검토 메모 없음</p>') + '</div></article>';
        }).join('') + '</div></section>';
      $$('[data-rmat]').forEach(function (b) { b.onclick = function () { MatViewer.open(C.materials, +b.getAttribute('data-rmat')); }; });
    },
    renderStatus: function () {
      var self = this;
      $('#rbody').innerHTML = '<p class="loading">점검하는 중…</p>';
      api('GET', 'admin/status').then(function (r) {
        function li(ok, label, note) { return '<li><span class="pill ' + (ok === true ? 'ok' : ok === false ? 'crit' : 'warn') + '">' + (ok === true ? '정상' : ok === false ? '필요' : '확인') + '</span><span>' + label + (note ? '<small>' + note + '</small>' : '') + '</span></li>'; }
        var hbAge = r.db.heartbeat ? (Date.now() - Date.parse(r.db.heartbeat)) / 3600000 : null;
        $('#rbody').innerHTML = '<div class="rgrid"><section class="rcard"><h2>운영 점검</h2><ul class="checklist">' +
          li(r.db.ok, '데이터베이스 연결 · ' + r.db.ms + 'ms', '학생 ' + r.db.students + '명 · 수업 ' + r.db.sessions + '개 · 기록 ' + r.db.events + '건 · 크기 ' + r.db.size_mb + 'MB / Neon 무료 1GB') +
          li(r.ai.configured ? true : null, r.ai.configured ? 'AI 판정 연결됨 · ' + esc(r.ai.model) + ' · effort ' + esc(r.ai.effort) : 'AI 키 없음 — 규칙 판정만 쓰여요', r.ai.configured ? '아래 ‘AI 연결 시험’으로 실제 호출을 확인하세요.' : 'Vercel 환경 변수 ANTHROPIC_API_KEY를 넣으면 켜져요.') +
          li(r.env.teacher_password && r.env.researcher_password, '교사·연구자 비밀번호 설정') +
          li(r.env.cron_secret ? true : null, '하루 한 번 점검 작업(무료 DB 일시정지 방지) · 마지막 ' + (r.db.heartbeat ? kst(r.db.heartbeat, true) : '기록 없음'), hbAge != null && hbAge > 30 ? '30시간 넘게 기록이 없어요. Vercel의 Cron Jobs를 확인하세요.' : 'CRON_SECRET이 있으면 외부에서 이 작업을 부를 수 없어요.') +
          li(null, '백업: 무료 플랜은 자동 백업이 없어요', '수업이 끝날 때마다 ‘기록’ 탭의 전체 백업을 내려받아 연구실 저장소에 보관하세요.') +
          li(r.env.region ? true : null, '서버 지역: ' + esc(r.env.region || '로컬') ) +
          '</ul><p class="row"><button class="btn sm" id="ai-test"' + (r.ai.configured ? '' : ' disabled') + '>AI 연결 시험</button><span id="ai-out" class="small"></span></p></section>' +
          '<section class="rcard"><h2>버전 <small>모든 기록에 함께 남아요</small></h2><dl class="fv">' + Object.keys(r.versions).map(function (k) { return '<dt>' + k + '</dt><dd class="mono">' + esc(r.versions[k]) + '</dd>'; }).join('') + '</dl></section></div>';
        if (r.ai.configured) $('#ai-test').onclick = function () {
          $('#ai-out').textContent = '부르는 중…';
          api('POST', 'admin/ai-test').then(function (x) {
            var st = (x.results || []).map(function (a) { return a ? a.state : '실패'; }).join(' / ');
            $('#ai-out').textContent = x.error && !st.replace(/실패|\s|\//g, '') ? '실패: ' + x.error : (Math.round(x.ms / 100) / 10) + '초 · ' + st + ' (기대 ' + x.expected + ')';
          }).catch(function (e) { $('#ai-out').textContent = e.message; });
        };
      }).catch(function (e) { $('#rbody').innerHTML = '<p class="empty">' + esc(e.message) + '</p>'; });
    }
  };
  function summarize(raw, full) {
    try { var o = JSON.parse(raw); return Object.keys(o).filter(function (k) { return String(o[k] || '').trim(); }).map(function (k) { return k + ': ' + o[k]; }).join(full ? '\n' : ' | '); } catch (e) { return String(raw || ''); }
  }
  function saveText(name, text) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); a.download = name; a.style.display = 'none'; a.textContent = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  /* ---------- 시작 ---------- */
  function boot() {
    fetch('/api/v1/content', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(); return r.json(); }).then(function (c) {
      C = c; C.items.forEach(function (it) { ITEM[it.id] = it; });
      fetch('/worksheets/manifest.json',{cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(json){
        if(!json || !json.lessons)return;
        WORKSHEETS=json;
        if(App.role==='student' && Student.me) Student.renderStage();
      }).catch(function(){ /* PPT 이미지 미설치 시 기존 웹 문제와 입력란 유지 */ });
      var a = /^#login/.test(location.hash) ? null : loadAuth();
      if (!a) return renderEntry();
      App.tok = a.token; App.role = a.role; App.tid = a.tid || null;
      if (a.role === 'student') return api('GET', 'me').then(function (me) { Student.start(me); }).catch(function () { logout(); });
      if (a.role === 'teacher') return Teacher.start();
      return Researcher.start();
    }).catch(function () {
      $('#app').innerHTML = '<main class="loading">서버에 연결하지 못했어요. 잠시 뒤 새로고침해 주세요.</main>';
    });
  }
  window.PQ_APP = App;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
