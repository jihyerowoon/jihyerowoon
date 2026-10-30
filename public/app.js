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
  function groupKo(g) { return g === 'EXPERIMENT' ? 'A01' : g === 'CONTROL' ? 'T01' : '-'; }
  function supporterKo(g) { return g === 'EXPERIMENT' ? 'AI 튜터' : '선생님'; }
  function store(k, v) { try { if (v === undefined) { var x = localStorage.getItem(k); return x ? JSON.parse(x) : null; } if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } return null; }

  var App = { role: null, tok: null, tid: null, skew: 0, timers: [], screen: null };
  function cleanup() { var d=document.getElementById('video-dialog');if(d)d.remove(); App.timers.forEach(function (t) { clearInterval(t); clearTimeout(t); }); App.timers = []; MatViewer.close('SCREEN'); }

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
  var AUTH_KEY = 'pq4r:auth', STAFF_LAST='pq4r:staff-last', STAFF_PAUSED='pq4r:staff-paused';
  function staffKey(role){return 'pq4r:remember:'+role;}
  function rememberedStaff(role){return store(STAFF_PAUSED)?null:valid(store(staffKey(role)));}
  function tokenExp(tok) { try { var p = tok.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'); while (p.length % 4) p += '='; return JSON.parse(decodeURIComponent(escape(atob(p)))).exp || 0; } catch (e) { return 0; } }
  /* 탭마다 따로(sessionStorage) 두고, 새로 연 탭은 마지막 로그인(localStorage)으로 이어 간다 */
  function tabStore(k, v) { try { if (v === undefined) { var x = sessionStorage.getItem(k); return x ? JSON.parse(x) : null; } if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } return null; }
  function valid(a) { return a && a.token && tokenExp(a.token) > Date.now() / 1000 + 60 ? a : null; }
  function saveAuth(a) {
    tabStore(AUTH_KEY, a); store(AUTH_KEY, a);
    if(a&&['teacher','researcher'].includes(a.role)){store(staffKey(a.role),a);store(STAFF_LAST,a.role);store(STAFF_PAUSED,null);}
    if (/^#login/.test(location.hash)) try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
  }
  function loadAuth() { return valid(tabStore(AUTH_KEY)) || rememberedStaff(store(STAFF_LAST)||'researcher') || rememberedStaff('researcher') || rememberedStaff('teacher') || valid(store(AUTH_KEY)); }
  function logout(msg) {
    var mine = App.tok, shared = store(AUTH_KEY);
    if(['teacher','researcher'].includes(App.role)){store(staffKey(App.role),null);store(STAFF_PAUSED,true);}
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
  function paperAsset(it,group) {
    if(group!=='CONTROL'||![1,2].includes(it.lesson))return null;
    var suffix=it.id.slice(2),key=['PV01','QU01','RV01'].includes(suffix)?'shared':/^(RD02|RF0[123])$/.test(suffix)?suffix:null;
    return key?'/worksheets/control/L'+it.lesson+'-'+key+'.webp':null;
  }
  function paperProblem(it,group) {
    var url=paperAsset(it,group);if(!url)return '';
    var shared=/-shared\.webp$/.test(url)?C.problems['L'+it.lesson+'P']:null;
    return (it.fixedAI?'<p class="paper-caption">문제 · 검토할 설명</p>':'')+'<figure class="paper-problem"><img src="'+url+'" alt="'+esc(plain(shared?shared.text:it.title)+(it.fig?' '+plain(it.fig.desc):'')+(it.choices?' 보기: '+it.choices.map(function(c,i){return CIRC[i]+' '+plain(c);}).join(' '):'')+(it.fixedAI?' 검토할 설명: '+plain(it.fixedAI.text):''))+'" loading="lazy"></figure>';
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
  function lessonMaterials(lesson) { var id=lesson===1?'L0_triangle_congruence':lesson===2?'L1_parallelogram_properties':null;return C.materials.filter(function(m){return id?m.id===id:m.lesson===lesson;}); }
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
        ' title="' + s.id + ' ' + s.ko + ' · ' + min + '분' + (hidden ? ' (Recite 동안 가림)' : '') + '"><span class="n">' + (i + 1) + '</span><span class="nm">' + ['미리보기','질문하기','개념 읽기','생각 점검','내 말로 설명','마무리'][i] + '</span><span class="mn">' + min + '분</span></button>';
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
  /* 수업 공유 링크는 실행 번호만 포함. PIN이나 비밀번호를 링크에 넣지 않는다. */
  function shareLink(role,classCode,sessionCode) {
    if(!sessionCode||!classCode)throw new Error('먼저 수업을 준비해 주세요.');
    var u=new URL('/',location.origin);
    u.searchParams.set('class',classCode);
    u.searchParams.set('session',sessionCode);
    u.hash=role==='teacher'?'login-teacher':'login-student';
    return u.href;
  }
  function copyShareLink(role,classCode,sessionCode) {
    var url=shareLink(role,classCode,sessionCode);
    if(navigator.clipboard&&navigator.clipboard.writeText)
      navigator.clipboard.writeText(url).then(function(){toast((role==='teacher'?'교사용':'학생용')+' 수업 링크를 복사했습니다.');})
        .catch(function(){window.prompt('아래 주소를 복사하세요.',url);});
    else window.prompt('아래 주소를 복사하세요.',url);
  }
  function linkSession(){return new URLSearchParams(location.search).get('session')||'';}
  function renderEntry(tab) {
    cleanup(); App.screen = 'entry';
    document.body.className = 'is-entry';
    var last = store('pq4r:last') || {};
    tab = tab || (location.hash==='#login-teacher'?'teacher':location.hash==='#login-student'?'student':null) || last.tab || 'student';
    $('#app').innerHTML = '<main class="entry"><section class="entry-card">' +
      '<div class="brand"><svg viewBox="0 0 64 40" class="brand-mark" aria-hidden="true"><path d="M18 4 H60 L46 36 H4 Z"/><path d="M18 4 L46 36 M60 4 L4 36" class="d"/></svg>' +
      '<div><p class="eyebrow">연구용 MVP · ' + esc(C.versions.app) + '</p><h1>PQ4R 튜터</h1><p class="sub">' + Object.keys(C.lessons).map(function (k) { return esc(lessonLabel(+k)) + ' ' + C.lessons[k].total + '분 + 보완 5분'; }).join(' / ') + ' · 중학교 2학년</p></div></div>' +
      '<p class="lead">문제를 읽고 내 답을 제출하세요. 어려울 때는 <b>도움 요청</b>을 누르고, 질문을 받은 뒤 다시 생각해 보세요.</p>' +
      '<nav class="login-tabs" role="tablist">' + [['student', '학생'], ['teacher', '교사'], ['researcher', '연구자']].map(function (t) {
        return '<button class="login-tab' + (t[0] === tab ? ' on' : '') + '" role="tab" aria-selected="' + (t[0] === tab) + '" data-ltab="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</nav><div id="loginbox"></div></section></main>';
    $$('[data-ltab]').forEach(function (b) { b.onclick = function () { var role=b.getAttribute('data-ltab'),saved=rememberedStaff(role);if(saved){if(role==='researcher')tabStore('pq4r:staff-screen',{screen:'researcher'});return restoreStaff(saved);}renderEntry(role); }; });
    var box = $('#loginbox');
    if (tab === 'student') {
      box.innerHTML = '<form class="login-form" id="lf" autocomplete="off">' +
        '<label>수업 코드<input id="l-sess" required maxlength="24" value="' + esc(new URLSearchParams(location.search).get('class') || last.classCode || '') + '" autocapitalize="characters" spellcheck="false"></label>' +
        '<label>학생 코드<input id="l-code" required maxlength="20" value="' + esc(last.code || '') + '" autocapitalize="characters" spellcheck="false"></label>' +
        '<label>PIN<input id="l-pin" required inputmode="numeric" pattern="[0-9]{4,8}" maxlength="8" type="password" autocomplete="off"></label>' +
        '<button class="btn primary" type="submit">입장</button><p class="err" id="l-err" role="alert"></p>' +
        '<p class="hint">수업 코드, 학생 코드, PIN만 입력하세요. 별도의 구글 로그인은 필요하지 않습니다. 차시는 자동 연결됩니다.</p></form>';
    } else {
      box.innerHTML = '<form class="login-form staff" id="lf">' +
        (tab === 'teacher' ? '<label>교사 ID<input id="l-tid" maxlength="20" value="' + esc(last.tid === 'T1' ? 'T01' : (last.tid || 'T01')) + '"></label>' : '') +
        '<label>' + (tab === 'teacher' ? '교사' : '연구자') + ' 비밀번호<input id="l-pw" type="password" required autocomplete="current-password"></label>' +
        '<button class="btn primary" type="submit">입장</button><p class="err" id="l-err" role="alert"></p>' +
        '<p class="hint">이 브라우저에 로그인 상태를 자동으로 기억합니다. 비밀번호는 저장하지 않습니다.</p><p class="hint">' + (tab === 'teacher' ? '교사 ID는 T01입니다. 수업 진행과 학생의 질문 확인, 발문 전송에 사용합니다. 기존 교사 비밀번호를 입력하세요.' : '수업 만들기, 명단, 기록·내보내기, 처치충실도 화면이에요.') + '</p></form>';
    }
    $('#lf').addEventListener('submit', function (ev) {
      ev.preventDefault();clearTimeout(App.loginRetry);
      var btn = $('#lf button[type=submit]'), err = $('#l-err'); err.textContent = ''; btn.disabled = true;
      var p;
      if (tab === 'student') {
        var sc = $('#l-sess').value.trim().toUpperCase(), code = $('#l-code').value.trim().toUpperCase();
        store('pq4r:last', Object.assign({}, last, { tab: 'student', classCode: sc, code: code }));
        p = api('POST', 'login/student', { class_code: sc, session_code:linkSession(), student_code: code, pin: $('#l-pin').value.trim(), ua: navigator.userAgent.slice(0, 160) })
          .then(function (r) { App.tok = r.token; App.role = 'student'; saveAuth({ token: r.token, role: 'student' }); Student.start(r.me); });
      } else {
        var tid = tab === 'teacher' ? $('#l-tid').value.trim().toUpperCase() : null;
        store('pq4r:last', Object.assign({}, last, { tab: tab, tid: tid || last.tid }));
        p = api('POST', 'login/staff', { role: tab, password: $('#l-pw').value, teacher_id: tid })
          .then(function (r) { App.tok = r.token; App.role = r.role; App.tid = r.tid; saveAuth({ token: r.token, role: r.role, tid: r.tid }); if (r.role === 'teacher') Teacher.start(linkSession()||null); else Researcher.start(); });
      }
      p.catch(function (e) { err.textContent = e.message;
        if(e.code==='class_waiting'){clearTimeout(App.loginRetry);var form=$('#lf'),waitingPin=$('#l-pin').value;App.timers.push(App.loginRetry=setTimeout(function(){if(App.screen==='entry'&&$('#lf')===form&&$('#l-sess').value.trim().toUpperCase()===sc&&$('#l-code').value.trim().toUpperCase()===code&&$('#l-pin').value===waitingPin)form.requestSubmit();},4000));}
      }).then(function () { btn.disabled = false; });
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
      Object.keys(self.pending).forEach(function (id) { var p = self.pending[id]; var it = self.item(id); it.draft = p.draft; it.draft_sel = p.draft_sel; it.reason = p.reason; it.question_draft=p.question||''; self.flushDraft(id); });
      self.shell();
      every(4000, function () { return self.poll(); }, 15000);
      App.timers.push(setInterval(function () {
        var t = $('#timer'); if (t) t.innerHTML = timerText(self.me.session);
        if (self.view === 5 && self.stageIdx() === 5) { var due = self.me.review && self.me.review.release_at; var reflectAt = self.me.review && self.me.review.reflection_at; var count = $('#review-release-count'); if (count && due) count.textContent = '해설까지 ' + mmss((Date.parse(due)-nowMs())/1000); if (due && nowMs() >= Date.parse(due)) self.loadReviewFeedback(); var rc = $('#review-reflect-count'); if (rc && reflectAt) rc.textContent = '성찰까지 ' + mmss((Date.parse(reflectAt)-nowMs())/1000); if (reflectAt && nowMs() >= Date.parse(reflectAt) && self.reviewFeedback && !self.reviewReflectionShown) { self.reviewReflectionShown = true; self.renderStage(); } }
        $$('.waiting[data-at]').forEach(function (n) { n.textContent = '도움 요청 보냄 · ' + mmss((nowMs() - Date.parse(n.getAttribute('data-at'))) / 1000) + ' 기다리는 중'; });
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
      var self = this,requestToken=App.tok;
      return api('GET', 'me').then(function (me) {
        if(App.screen!=='student'||App.tok!==requestToken)return;
        Object.keys(self.pending).forEach(function (id) { if (me.items[id] && me.items[id].status !== 'incomplete') { var p = self.pending[id]; me.items[id].draft = p.draft; me.items[id].draft_sel = p.draft_sel; me.items[id].reason = p.reason; } });
        self.me = me;
      });
    },
    poll: function () {
      var self = this,requestToken=App.tok,requestSession=self.me.session.code;
      return api('GET', 'me/sync?seq=' + self.me.msgSeq).then(function (r) {
        if(App.screen!=='student'||App.tok!==requestToken||self.me.session.code!==requestSession)return;
        if(r.stage_rev<self.me.session.stage_rev)return;
        var stageChanged = r.stage_rev !== self.me.session.stage_rev;
        if (r.messages.length) { self.me.messages = self.me.messages.concat(r.messages); self.me.msgSeq = r.messages[r.messages.length - 1].seq; }
        if (self.group() === 'CONTROL') self.me.requests = r.requests;
        if(r.clock) self.me.session.clock=r.clock;
        if(r.notice) self.me.notice=r.notice;
        if (r.review) self.me.review = r.review;
        if (stageChanged) {
          var prev = self.me.session.stage;
          return self.reload().then(function () { if(App.screen==='student'&&App.tok===requestToken&&self.me.session.code===requestSession)self.onStageChange(prev, self.me.session.stage); });
        }
        if (r.messages.length || self.group() === 'CONTROL') self.refreshThreads();
        var supports=r.messages.filter(function(m){return m.sender==='TEACHER'||m.sender==='AI';});
        if(supports.length){
          var recent=supports[supports.length-1],by=recent.sender==='TEACHER'?'선생님':'AI 튜터';
          var alert=$('#student-hint-alert');
          if(!alert){alert=document.createElement('div');alert.id='student-hint-alert';alert.className='time-warning hint-arrived';alert.setAttribute('role','status');var lay=$('#layout');if(lay&&lay.parentNode)lay.parentNode.insertBefore(alert,lay);}
          if(alert){alert.innerHTML='<strong>'+by+'의 점검 질문이 도착했습니다.</strong> <button class="btn sm" type="button" id="student-see-hint">질문 확인</button>';
            $('#student-see-hint').onclick=function(){var target=$('[data-thread="'+recent.item_id+'"]');if(target)target.scrollIntoView({behavior:'smooth',block:'center'});else toast('현재 열린 단계에서 해당 문제를 확인해 주세요.');};
          }
          toast(by+'의 점검 질문이 도착했습니다.','warn');
        }
        if (r.review && r.review.unlocked && self.view === 5 && self.stageIdx() === 5) self.loadReviewFeedback();
      });
    },
    onStageChange: function (prev, cur) {
      MatViewer.close('STAGE_CHANGED');
      var video=$('#video-dialog');if(video)video.remove();
      if (this.me.session.status !== 'open') {logout('이전 수업이 종료되었습니다. 수업 코드로 다시 입장해 주세요.');return;}
      this.view = cur; this.renderStepper(); this.renderDemo(); this.renderStage();
      if (cur !== prev) toast(C.stages[cur].id + ' ' + C.stages[cur].ko + ' 단계가 열렸어요.');
    },
    shell: function () {
      var self = this, g = self.group();
      $('#app').innerHTML = topbar('학생 ' + esc(self.me.student.code) + ' · 수업 코드 ' + groupKo(g), '', self.lesson()) +
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
      if (pb && self.group()!=='CONTROL') h += '<div class="panel problem"><p class="k">' + (sid === 'Preview' ? '문제' : sid === 'Question' ? '문제 다시 보기 (Preview)' : '처음 본 문제') + '</p><p>' + fmt(pb.text) + '</p>' + figHTML(C.figs[pb.fig]) + '</div>';
      if (this.matVisible(sid)) {
        h += '<div class="panel material"><p class="k">개념 정리</p>'+lessonMaterials(this.lesson()).map(function(m,i){return '<button type="button" class="paper-material" data-mat="'+i+'" aria-label="'+esc(m.title)+' 크게 보기"><img src="'+esc(m.file)+'" alt="'+esc(m.title)+'" loading="lazy"><span>눌러서 크게 보기</span></button>';}).join('')+'</div>';
      }
      if (sid === 'Recite') h += '<div class="panel cover"><p class="k">가린 내용</p><p>Recite 동안은 앞 단계의 답과 개념 정리를 가려요. 먼저 내 말로 설명해 보세요.</p></div>';
      n.innerHTML = h;
      var fc = $('#figcard'); if (fc) fc.hidden = self.lesson()===2 || !self.hasTool(sid);
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
      var confidence = {explain:'충분히 설명할 수 있다',partial:'일부 이해했다',uncertain:'아직 어렵다'};
      var solutionName = function(x) { var id=x.item_id||''; return id.indexOf('RV')>=0?'Review 다시 풀기':id.indexOf('RD')>=0?'Read 개념확인':'Reflect 문제 '+id.slice(-1); };
      var reflectAt=this.me.review&&this.me.review.reflection_at, canReflect=reflectAt&&nowMs()>=Date.parse(reflectAt);
      var cards = (data.solutions || []).map(function (sol,i) {
        var p = sol.problem || {}, a = (data.answers || []).filter(function (v) {return v.item_id === sol.item_id;})[0] || {}, ans = a.pre_response || {};
        var own = Object.keys(ans).filter(function(k) {return String(ans[k]||'').trim();}).map(function (k) {return '<p><b>' + esc(k) + ':</b> ' + fmt(String(ans[k])) + '</p>';}).join('') || '<p class="muted">작성된 답안이 없습니다.</p>';
        return '<details class="review-solution"' + (i === 0 && !canReflect ? ' open' : '') + '><summary><b>' + (i+1) + '. ' + solutionName(sol) + '</b> · ' + esc(sol.answer) + '</summary>' +
          '<div style="padding:12px 0"><h4>문제와 그림</h4><p>' + fmt(p.title || '') + '</p>' + figHTML(p.fig) + choicesHTML(p.choices) +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin:14px 0">' +
          '<div class="panel"><h4>나의 공개 전 답변</h4>' + own + (a.source==='saved_draft_only'?'<p class="hint">제출 전 임시저장본입니다.</p>':'') + '</div>' +
          '<div class="panel"><h4>정답과 검증용 풀이 초안</h4><p><b>' + esc(sol.answer) + '</b></p><ol>' + (sol.steps||[]).map(function (line){return '<li>' + fmt(line) + '</li>';}).join('') + '</ol></div></div></div></details>';
      }).join('');
      var ref = data.reflection;
      var completed = ref ? '<section class="panel review-reflection"><h3>해설 후 성찰 저장 완료</h3><p><b>이해 정도:</b> ' + esc(confidence[ref.understanding]||'') + '</p><p><b>내 풀이와 비교:</b> ' + esc(ref.comparison) + '</p></section>' :
        '<section class="panel review-reflection"><h3>해설 공개 후 이해도 성찰</h3><p class="hint small">문제와 해설을 비교해 봅시다. 내가 실제로 이해한 것과 아직 어려운 부분을 솔직히 적어 주세요.</p>' +
        '<fieldset><legend>지금 이 풀이를 다른 사람에게 설명할 수 있나요?</legend>' +
        Object.keys(confidence).map(function(k){return '<label class="choice-line"><input type="radio" name="post-understanding" value="'+k+'"><span>'+esc(confidence[k])+'</span></label>';}).join('') + '</fieldset>' +
        '<label style="display:block;margin:10px 0">내 풀이와 해설을 비교하여 새롭게 확인한 조건이나 성질, 또는 아직 이해하지 못한 부분 한 가지<textarea id="post-comparison" rows="2" maxlength="350" placeholder="한두 문장으로 적어 보세요."></textarea></label>' +
        '<p class="hint">2분이 지나도 자동 종료되지 않습니다. 작성한 내용을 제출해 주세요.</p><button type="button" class="btn primary" data-act="review-reflect">성찰 제출</button></section>';
      var reflectUI = ref || canReflect ? completed : '<section class="panel"><h3>6~10분: 정답과 내 풀이 비교</h3><p>풀이에서 무엇이 같고 다른지 확인하세요. 마지막 2분에 짧은 이해도 성찰이 열립니다.</p><p id="review-reflect-count" class="hint small">성찰까지 ' + mmss((Date.parse(reflectAt)-nowMs())/1000) + '</p></section>';
      if(canReflect)return '<section class="panel review-answers"><h2>2단계 · 정답과 풀이 확인</h2>'+cards+'</section>'+reflectUI;
      return '<section class="panel"><h2>Review 정답과 풀이 · 6분 후 공개</h2><p>첫 6분의 자기 풀이를 보존했습니다. 다음 4분은 정답 비교, 마지막 2분은 성찰입니다.</p><p class="hint small">두 집단에 동일하게 제공하는 검증용 해설 초안입니다.</p>' + cards + '</section>' + reflectUI;
    },
    loadReviewFeedback: function () {
      var self=this, due=self.me.review && self.me.review.release_at;
      if(['catchup','finished'].includes(clockMode(self.me.session)))return;
      if (!due || self.stageIdx()!==5 || self.view!==5 || self.reviewFeedback || self.reviewLoading || nowMs()<Date.parse(due)) return;
      if (Date.now()-self.lastReviewFetch<3500) return;
      self.lastReviewFetch=Date.now(); self.reviewLoading=true;
      api('GET','me/review-feedback').then(function(r){
        self.reviewFeedback=r;
        if(self.me.review) self.me.review.reflection=r.reflection;
        // 미저장 입력은 보완을 위해 기기에 보관하며 시간 내 답안은 덮어쓰지 않는다.
        self.renderStage(); self.renderLeftStage();
      }).catch(function(e){ if(e.code!=='review_locked') toast('해설을 불러오지 못했어요: '+e.message,'warn'); })
        .then(function(){self.reviewLoading=false;});
    },
    submitReviewReflection: function(){
      var self=this, checked=$('input[name="post-understanding"]:checked');
      var body={focus_item:'',understanding:checked?checked.value:'',comparison:($('#post-comparison')||{}).value||'',next_step:''};
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
        '<p class="stage-intro">' + esc(stageIntro(ln, st, g)) + '</p>' + (editable ? '' : self.view===5&&self.me.review&&self.me.review.unlocked?'<p class="closed-note">문제 풀이 작성 시간은 끝났습니다. 해설을 확인하고 아래에서 성찰을 작성하세요.</p>':'<p class="closed-note">이 단계는 닫혔어요. 보기만 할 수 있어요.</p>') + '</div>';
      if (editable && st.id !== 'Preview' && st.id !== 'Read') h += '<p class="student-simple-tip">① 답을 적고 제출하세요. ② 어렵다면 <b>질문으로 도움받기</b>를 누르세요. Review에서는 첫 제출 전에도 질문할 수 있습니다.</p>';
      if(g!=='CONTROL')h += worksheetPane(ln,g,st.id);
      if (editable) h += self.toolbarHTML();
      if(!(self.view===5 && self.reviewFeedback))items.forEach(function (it) { h += self.itemHTML(it, editable); });
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
      var syms = [['△', '삼각형'], ['≡', '합동'], ['∠', '각'], ['∥', '평행'], ['⊥', '수직'], ['=', '같음'], ['≠', '다름'], ['°', '도'], ['+', '더하기'], ['−', '빼기'], ['×', '곱하기'], ['÷', '나누기']];
      var segs = this.lesson() === 1 ? ['AB', 'BC', 'CA', 'DE', 'EF', 'FD', 'AO', 'CO', 'BD'] : ['AB', 'BC', 'CD', 'DA', 'AC', 'BD', 'AO', 'BO', 'CO', 'DO', 'OA', 'OB', 'OC', 'OD', 'AD', 'DC', 'AE', 'BE', 'DE', 'EC', 'EO', 'PC', 'PD', 'PB', 'AP'];
      return '<div class="symbar" role="toolbar" aria-label="수학 기호 입력"><span class="symbar-k">기호</span>' +
        syms.map(function (s) { return '<button type="button" class="sym" data-sym="' + s[0] + '" title="' + s[1] + '">' + s[0] + '</button>'; }).join('') +
        '<span class="segpick"><button type="button" class="sym wide" data-act="segmenu" aria-expanded="false">선분 <span class="seg">AB</span> ▾</button>' +
        '<span class="segmenu" id="segmenu" hidden>' + segs.map(function (s) { return '<button type="button" class="sym" data-segins="' + s + '"><span class="seg">' + s + '</span></button>'; }).join('') + '</span></span>' +
        '<span class="symbar-hint">답안 칸을 누른 후 기호를 선택하세요. 1~8차시 공통</span></div>';
    },
    itemHTML: function (it, editable) {
      var self = this, rec = self.item(it.id), paper=true, source=paperAsset(it,self.group());
      var last = rec.versions.length ? rec.versions[rec.versions.length - 1].fields : {};
      var h = '<article class="item'+(paper?' paper-item':'')+'" data-item="' + it.id + '"><header class="item-h"><div class="item-t">' + (it.mark ? '<span class="mark">' + esc(it.mark) + '</span>' : '') +
        '<h3'+(source?' class="paper-sr"':'')+'>' + fmt(it.title) + '</h3></div><span class="chip-status" data-status="' + it.id + '"></span></header>';
      if(source)h+=paperProblem(it,self.group());
      if (!source && (it.fig || it.choices)) h += '<div class="probblock">' + figHTML(it.fig) + choicesHTML(it.choices) + '</div>';
      if (it.fixedAI && !source) h += '<div class="aiout"><p class="aiout-k">검토할 풀이 설명 <small>두 집단 공통 검토자료</small></p><p>' + fmt(it.fixedAI.text) + '</p></div>';
      if (it.sub && !source) h += '<p class="item-sub">' + fmt(it.sub) + '</p>';
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
        h += '<div class="revise" data-revise="' + it.id + '" hidden><label for="rv-' + it.id + '">무엇을 수정했나요? <small>(수정해서 다시 제출할 때 작성)</small></label><input id="rv-' + it.id + '" data-reason="' + it.id + '" maxlength="300" autocomplete="off" value="' + esc(rec.reason || '') + '" placeholder="처음 답에서 바꾼 부분과 그 이유를 적어 보세요."></div>' +
          
          '<footer class="item-f"><button type="button" class="btn primary" data-act="submit" data-id="' + it.id + '">내 답 제출하기</button>' +
          ((it.stage === 'Preview' || it.kind === 'memo') ? '' : '<button type="button" class="btn ghost" data-act="help" data-id="' + it.id + '">질문으로 도움받기</button>') +
          '<span class="busy" data-busy="' + it.id + '" hidden>점검 중…</span></footer>';
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
        sb.textContent = r.attempts ? '수정한 답 저장·제출하기' : '내 답 제출하기';
        sb.disabled = !!self.busy[id] || self.isEmpty(id) || r.status === 'incomplete' || !self.editable();
        var hb = $('[data-act="help"][data-id="' + id + '"]'); if (hb) hb.disabled = !!self.busy[id] || (!r.attempts && ITEM[id].stage !== 'Review') || r.status === 'incomplete' || !self.editable();
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
      self.pending[id] = { draft: clone(r.draft), draft_sel: clone(r.draft_sel), reason: r.reason || '', question:r.question_draft||'', t: Date.now() };
      store(self.pendKey(), self.pending);
      clearTimeout(self.saveTimers[id]);
      self.saveTimers[id] = setTimeout(function () { self.flushDraft(id); }, 300);
    },
    flushDraft: function (id) {
      var self=this,p=self.pending[id];if(!p)return Promise.resolve();
      self.draftFlights=self.draftFlights||{};
      if(self.draftFlights[id])return self.draftFlights[id].then(function(){if(self.pending[id]&&self.pending[id]!==p)return self.flushDraft(id);});
      var flight=api('POST','me/draft',{item_id:id,draft:p.draft,draft_sel:p.draft_sel,reason:p.reason,question:p.question}).then(function(r){
        if(r.saved&&self.pending[id]===p){delete self.pending[id];store(self.pendKey(),self.pending);}
        var n=$('#savestate');if(n)n.textContent=r.saved?'임시저장 '+kst(r.at):'시간 종료로 원본에 저장되지 않았습니다. 입력은 이 기기에 보관되어 보완 때 확인할 수 있습니다.';
      }).catch(function(){var n=$('#savestate');if(n)n.textContent='임시저장 실패 · 이 기기에 보관하고 다시 보낼게요';clearTimeout(self.saveTimers[id]);self.saveTimers[id]=setTimeout(function(){self.flushDraft(id);},5000);}).then(function(){delete self.draftFlights[id];if(self.pending[id]&&self.pending[id]!==p)return self.flushDraft(id);});
      self.draftFlights[id]=flight;return flight;
    },

    bindRight: function () {
      var self = this, right = $('#right'), lastInput = null;
      right.addEventListener('focusin', function (ev) {
        var t = ev.target;
        if(t.matches('textarea[data-field], input[type=text][data-field], input[type=radio][data-field], input[type=checkbox][data-field]')){
  if(t.matches('textarea[data-field], input[type=text][data-field]'))lastInput=t;
  var id=t.getAttribute('data-item'),field=t.getAttribute('data-field');
  self.focus={item:id,field:field};self.markFocus();self.renderFigSel();
  if(self.lastFocus!==id+':'+field&&self.editable()){
    self.lastFocus=id+':'+field;
    api('POST','me/focus',{item_id:id,field:field}).catch(function(){/* 관찰 상태가 실패해도 답안은 따로 자동 저장 */});
  }
}
      });
      right.addEventListener('input', function (ev) {
        var t = ev.target;
        if (t.hasAttribute('data-reason')) { var id0 = t.getAttribute('data-reason'); self.item(id0).reason = t.value; self.saveDraft(id0); return; }
        if(t.hasAttribute('data-help-question')){var askId=t.getAttribute('data-help-question');self.item(askId).question_draft=t.value;self.saveDraft(askId);return;}
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
        if(!inp || !inp.isConnected || inp.disabled){
          var f=self.focus;
          inp=f?$('#right [data-item="'+f.item+'"][data-field="'+f.field+'"]'):null;
        }
        if (!inp || inp.disabled) { toast('기호를 넣을 칸을 먼저 눌러 주세요.', 'warn'); return; }
        var s = inp.selectionStart != null ? inp.selectionStart : inp.value.length, e = inp.selectionEnd != null ? inp.selectionEnd : s;
        inp.value = inp.value.slice(0, s) + text + inp.value.slice(e);
        inp.focus();lastInput=inp;try { inp.setSelectionRange(s + text.length, s + text.length); } catch (er) { /* ignore */ }
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
          self.applyResult(res);toast('답안을 저장했습니다. 필요하면 질문으로 도움받기를 눌러 주세요.');
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
      send.then(function () { return api('POST', 'me/help', { item_id: id, question:self.item(id).question_draft||'', client_ts: new Date().toISOString() }); })
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
      if(sessionCode)store('pq4r:teacher-session',sessionCode);
      tabStore('pq4r:staff-screen',{screen:'teacher',session:self.code});
      var bankP = self.bank ? Promise.resolve() : api('GET', 'staff/content').then(function (r) { self.bank = r; });
      bankP.then(function () { return api('GET', 'staff/sessions'); }).then(function (r) {
        var open = r.sessions.filter(function (s) { return s.status === 'open' && s.settings.autoTimer && clockMode(s)!=='finished'; });
        if(!sessionCode){var lastRun=r.sessions.find(function(s){return s.code===self.code;});if(lastRun&&!lastRun.settings.autoTimer){var ready=open.find(function(s){return s.class_name.toUpperCase()===(lastRun.class_name||'').toUpperCase();});self.code=ready?ready.code:null;}}

        if (!self.code || !r.sessions.some(function (s) { return s.code === self.code; })) return self.pick(open);
        store('pq4r:teacher-session',self.code);tabStore('pq4r:staff-screen',{screen:'teacher',session:self.code});self.shell();
      }).catch(function (e) { $('#app').innerHTML = '<main class="loading">' + esc(e.message) + '</main>'; });
    },
    pick: function (list) {
      var self = this;
      $('#app').innerHTML = '<main class="entry"><section class="entry-card"><h1>수업 고르기</h1><p class="lead">진행할 수업을 고르세요. 수업은 연구자 화면에서 만듭니다.</p><div class="sesslist">' +
        (list.length ? list.map(function (s) { return '<button class="sessrow" data-pick="' + esc(s.code) + '"><span><b>' + esc(s.code) + '</b> · ' + esc(lessonLabel(s.lesson)) + (s.class_name ? ' · ' + esc(s.class_name) + '반' : '') + '</span><span class="pill">' + s.joined + '명 · ' + C.stages[s.stage].id + '</span></button>'; }).join('') : '<p class="empty">열린 수업이 없어요.</p>') +
        '</div><p><button class="btn" id="pick-out">나가기</button></p></section></main>';
      $$('[data-pick]').forEach(function (b) { b.onclick = function () { self.code = b.getAttribute('data-pick'); store('pq4r:teacher-session', self.code);tabStore('pq4r:staff-screen',{screen:'teacher',session:self.code}); self.shell(); }; });
      $('#pick-out').onclick = function () { logout(); };
    },
    shell: function () {
      var self = this;
      $('#app').innerHTML = topbar('교사 화면 · 수업 ' + esc(self.code), '<span class="stagectl"><button class="btn sm" id="t-prev">이전 단계</button><button class="btn sm primary" id="t-next">다음 단계 열기</button></span>' + (App.role === 'researcher' ? '<button class="btn sm ghost" id="t-back">연구자 화면</button>' : '<button class="btn sm ghost" id="t-switch">수업 바꾸기</button>')) +
        '<p class="teacher-simple-tip">① 도움 요청 확인 → ② 학생 답 읽기 → ③ 질문 골라 보내기</p><div class="tlayout"><aside class="tleft"><h2>도움 요청 <small>통제집단</small></h2><div id="queue"><p class="empty">불러오는 중…</p></div><p class="hint small">실험집단은 AI 튜터가 지원해요. 교사는 시간·전환·기기 문제만 돕습니다.</p></aside>' +
        '<section class="tmain"><details class="teacher-roster-more"><summary>전체 학생 현황 보기 (필요할 때만) <span id="t-count"></span></summary><div class="tablewrap"><table class="roster" id="roster"></table></div>' +
        '<div class="legend"><span><span class="cell none">·</span>아직 안 씀</span><span><span class="cell draft">…</span>작성 중</span><span><span class="cell sent">1</span>제출 횟수</span><span><span class="cell mid">?</span>숫자 확인 필요</span><span><span class="cell ok2">✓</span>숫자 맞음</span><span><span class="cell inc">–</span>빈칸·막힘</span><span><span class="cell inc">미</span>미제출</span></div>' +
        '<div class="legend"><b>실험집단</b><span><span class="cell mid">L1</span>진행 중 지원 수준</span><span><span class="cell ok">✓</span>해결</span><span><span class="cell bad">!</span>미해결</span><span>숫자 표시는 규칙 판정이며, 통제집단에는 AI 판정을 쓰지 않아요.</span></div></details></section>' +
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
        self.data = r; var tl = $('#tb-lesson'); if (tl) tl.textContent = lessonLabel(r.session.lesson); self.renderTop(); self.renderRoster(); self.renderQueue(); self.renderBatch();
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
      var self = this, code = self.sel, requestSession=self.code;
      if (fresh) $('#tdetail').innerHTML = '<p class="empty">불러오는 중…</p>';
      return api('GET', 'staff/student?session=' + encodeURIComponent(self.code) + '&code=' + encodeURIComponent(code)).then(function (d) {
        if (App.screen!=='teacher'||self.sel !== code||self.code!==requestSession) return;
        var keepForm = !fresh && self.detail && self.detail.student.code === code && $('#sendform') && ($('#sf-custom') && $('#sf-custom').value || document.activeElement && (($('#td-form')&&$('#td-form').contains(document.activeElement))||($('#oral-log')&&$('#oral-log').contains(document.activeElement))));
        self.detail = d;
        if (keepForm) self.renderDetailTop(); else self.renderDetail();
      }).catch(function (e) { $('#tdetail').innerHTML = '<p class="empty">' + esc(e.message) + '</p>'; });
    },
    renderDetail: function () {
      var self = this, d = self.detail, s = d.student, n = $('#tdetail');
      n.innerHTML = '<div class="td-h"><h2>' + esc(s.code) + ' <span class="grp ' + s.group.toLowerCase() + '">' + groupKo(s.group) + '</span></h2><button type="button" class="btn sm" id="student-word-export">이 학생 문제·답안 Word 저장</button></div><div id="td-top"></div>' +
        (s.group === 'CONTROL' ? '<div id="td-form"></div><div id="oral-log"></div>' : '<p class="note">이 수업에서는 자동 질문 지원이 제공됩니다. 교사는 수학 내용을 따로 전송하지 않습니다.</p>');
      $('#student-word-export').onclick=function(){self.downloadStudentWord();};
      self.renderDetailTop();
      if (s.group === 'CONTROL') {self.renderForm();self.renderOralNote();}
    },
    downloadStudentWord: function () {
      if(!this.detail||!this.data)return;
      var d=this.detail,student=d.student,lesson=this.data.session.lesson;
      var rows=C.items.filter(function(it){return Number(it.lesson)===Number(lesson)&&!it.archived;}).map(function(it){
        var rec=d.items[it.id]||{},v=rec.versions&&rec.versions.length?rec.versions[rec.versions.length-1]:null,fields=v&&v.fields||rec.draft||{};
        var answer=it.fields.map(function(f){return '<p><b>'+esc(plain(f.label))+':</b> '+esc(String(fields[f.key]||'(미작성)'))+'</p>';}).join('');
        var reason=v&&v.reason?'<p><b>수정한 내용:</b> '+esc(v.reason)+'</p>':'';
        return '<section style="break-inside:avoid;margin-bottom:24px;border-bottom:1px solid #ccc;padding:10px"><h3>'+esc(it.stage)+' · '+esc(it.id)+'</h3><p><b>문항:</b> '+esc(plain(it.title))+'</p>'+answer+reason+'</section>';
      }).join('');
      var html='<!doctype html><html><head><meta charset="utf-8"><title>학생 활동 기록</title><style>body{font-family:Malgun Gothic,Arial,sans-serif;font-size:12pt;line-height:1.6;margin:25mm}h1{color:#173c71}section{page-break-inside:avoid}</style></head><body><h1>수학 PQ4R 활동 기록</h1><p>학생 코드: '+esc(student.code)+' | '+esc(String(lesson))+'차시</p><p>이 문서는 웹에 저장된 문항 제목과 학생 작성 답안을 포함합니다. 원본 PDF 도형은 별도 활동지에서 확인해야 합니다.</p>'+rows+'</body></html>';
      var blob=new Blob(['\ufeff',html],{type:'application/msword;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download='PQ4R_'+student.code+'_L'+lesson+'_답안.doc';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},3000);
    },
    renderDetailTop: function () {
      var self = this, d = self.detail, s = d.student, n = $('#td-top'); if (!n) return;
      var items = self.stageItems();
      if (!self.selItem || !ITEM[self.selItem] || (items.indexOf(self.selItem) < 0 && !d.items[self.selItem])) self.selItem = items[0];
      var it = d.items[self.selItem], ri = resolveItem(self.selItem, s.group, self.data.session.settings);
      var h = '<div class="itabs">' + items.map(function (i) { return '<button class="itab' + (i === self.selItem ? ' on' : '') + '" data-itab="' + i + '">' + esc(shortOf(i)) + '</button>'; }).join('') + '</div><p class="td-q">' + fmt(ri.title) + '</p>' + (ri.choices ? choicesHTML(ri.choices) : '');
      if(ri.fig)h+='<div class="teacher-worksheet-fig">'+figHTML(ri.fig)+'</div>';
      if (!it || !it.versions || !it.versions.length) {
        var dk = it && it.draft ? Object.keys(it.draft).filter(function (k) { return String(it.draft[k] || '').trim(); }) : [];
        h += dk.length ? '<p class="muted">작성 중(아직 제출 안 함)</p>' + fieldsView(ri, it.draft, it.draft_sel) : '<p class="muted">아직 제출하지 않았어요.</p>';
      } else {
        var first = it.versions[0], last = it.versions[it.versions.length - 1];
        var currentDraft=it.draft||{},changed=Object.keys(currentDraft).some(function(k){return String(currentDraft[k]||'')!==String((last.fields||{})[k]||'');})||JSON.stringify(it.draft_sel||{})!==JSON.stringify(last.sel||{});
        if(changed)h+='<section class="live-draft"><b>현재 수정 중인 답안 (자동저장본)</b>'+fieldsView(ri,currentDraft,it.draft_sel||{})+'</section>';
        h += '<p class="td-k">최근 제출 · ' + last.no + '회차 · ' + kst(last.at) + '</p>' + fieldsView(ri, last.fields, last.sel);
        if (last.reason) h += '<p class="td-reason">고친 이유: ' + esc(last.reason) + '</p>';
        if (it.versions.length > 1) h += '<details><summary>처음 제출본 보기 (' + kst(first.at) + ')</summary>' + fieldsView(ri, first.fields, first.sel) + '</details>';
        if (s.group === 'CONTROL') h += '<p class="td-flag">규칙 판정 표시: <b>' + ({ empty: '빈칸·막힘', num_ok: '숫자 맞음', num_check: '숫자 확인 필요', text: '서술형(교사 판단)' }[it.last_judgment && it.last_judgment.flag] || '-') + '</b> <small>AI 판정은 통제집단에 쓰지 않아요</small></p>';
        else h += '<p class="td-flag">지원 수준 ' + (it.rec.level || 0) + ' · 최고 ' + (it.rec.maxLevel || 0) + ' · 상태 ' + esc(it.rec.status || '') + '</p>';
      }
      var th = d.messages.filter(function (m) { return m.item_id === self.selItem && m.sender !== 'SYS'; });
      if (th.length) h += '<div class="td-thread">' + th.map(function (m) { return '<p><b>' + (m.sender === 'TEACHER' ? '교사' : 'AI') + ' L' + m.level + '</b> ' + fmt(m.text) + ' <time>' + kst(m.at) + '</time></p>'; }).join('') + '</div>';
      var asks=(d.student_questions||[]).filter(function(q){return q.item_id===self.selItem;});
      if(asks.length)h+='<section class="student-question-history"><b>학생이 직접 작성한 질문</b>'+asks.slice(0,5).map(function(q){return '<p>'+esc(q.question)+' <small>'+kst(q.at)+'</small></p>';}).join('')+'</section>';
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
          (more.length?'<details><summary>다른 발문 후보 ' + more.length + '개 보기</summary>' + more.map(function(b){return optionHTML(b,false);}).join('') + '</details>':'');
      };
      renderBank();
      $$('input[name="sf-mode"]').forEach(function(radio){
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
  Teacher.renderOralNote=function(){
    var self=this,n=$('#oral-log');if(!n||!self.detail)return;
    var notes=(self.detail.oral_notes||[]).filter(function(x){return x.item_id===self.selItem;});
    n.innerHTML='<details class="oral-note"><summary>수업 중 구두 질문 및 교사 발화 기록 (수동 입력)</summary>'
      +'<p class="hint">교사가 실제로 들은 문장이나 말한 문장을 입력합니다. 녹음이나 자동 음성인식은 아닙니다.</p>'
      +'<form id="oral-note-form"><label>누가 말했나요?<select id="oral-speaker"><option value="STUDENT">학생의 질문</option><option value="TEACHER">교사의 발화</option></select></label>'
      +'<label>실제로 말한 내용<textarea id="oral-text" rows="3" maxlength="800" required placeholder="실제로 들은 말을 가능한 그대로 적어 주세요."></textarea></label>'
      +'<button class="btn" type="submit">이 발화를 연구 로그에 저장</button></form>'
      +'<div class="oral-history">'+notes.map(function(x){return '<p><b>'+(x.speaker==='STUDENT'?'학생':'교사')+'</b> · '+esc(x.utterance)+' <small>'+kst(x.at)+'</small></p>';}).join('')+'</div></details>';
    $('#oral-note-form').onsubmit=function(ev){
      ev.preventDefault();var btn=this.querySelector('button'),text=$('#oral-text').value.trim();if(!text)return;
      btn.disabled=true;
      api('POST','staff/oral-note',{session:self.code,code:self.sel,item_id:self.selItem,speaker:$('#oral-speaker').value,utterance:text})
        .then(function(){toast('구두 발화 기록을 저장했습니다.');return self.loadDetail(true);})
        .catch(function(e){toast(e.message,'warn');btn.disabled=false;});
    };
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
      cleanup(); App.screen = 'researcher';tabStore('pq4r:staff-screen',{screen:'researcher'});
      var self = this;self.tab='classes';
      document.body.className = 'is-researcher';
      self.code = store('pq4r:researcher-session') || null;
      $('#app').innerHTML = topbar('연구자 화면', '<span id="r-sess" class="pill"></span>') +
        '<nav class="rtabs" id="rtabs" aria-label="연구자 메뉴">' + [['classes','수업 준비'],['sess','지난 수업 관리'],['log','기록 저장']].map(function (t) {
          return '<button class="rtab" data-tab="' + t[0] + '">' + t[1] + '</button>';
        }).join('') + '<details class="r-advanced"><summary>기타 기능</summary><div class="r-advanced-list">' + [['roster','기존 전체 명단'],['status','연결 확인'],['fid','처치충실도'],['rev','사람 검토'],['bank','발문 은행'],['worksheet','활동지 점검'],['mat','개념 자료']].map(function (t) {
          return '<button class="rtab" data-tab="' + t[0] + '">' + t[1] + '</button>';
        }).join('') + '</div></details></nav><p class="simple-help">수업 코드 A01 또는 T01을 사용합니다. 학생은 수업 코드, 개인 학생 코드, PIN만 입력합니다. 시험과 본실험은 각각 새 수업으로 시작하세요.</p><section class="rbody" id="rbody"></section>';
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
      var p = $('#r-sess'); if (p) p.textContent = s ? '기록 ID ' + s.code : '수업 없음';
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
          '<details class="r-settings-more"><summary>연구 설정 보기 (실험 중 변경하지 마세요)</summary><h3>이 수업 설정 <small>바꾸면 기록에 남아요</small></h3>' +
          tog('aiJudge', 'AI 판정 사용', '서술형 답을 학생 상태 9가지 중 하나로 분류해요(실험집단만). API 키가 없으면 규칙 판정만 써요.') +
          tog('aiJudgeTwice', 'AI 판정 두 번 확인', '같은 판정을 두 번 돌려 다르면 보류하고 뜻 확인 질문을 보내요(사람 검토 대상).') +
          '<p class="hint small">연구용 발문은 공통 1수준 은행의 원문만 제공합니다. AI 문장 재작성 기능은 비활성화되어 있습니다.</p>' +
          tog('fadingPairs', '짝 문항으로 지원 감소 관찰', '1차시 RD02(개념확인)↔RF01(합동조건), 2차시 RD02(대각선 증명)↔RF02(대각선 길이).') +
          tog('materialsInReflect', 'Reflect에서도 개념 정리 열람 허용', '기본은 Read에서만 보여요.') +
          tog('demoControls', '학생 화면에 시연 제어 표시', '실제 수업에서는 끄세요.') + '</details></section>' : '') + '</div>';
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
        '<button class="btn sm primary" id="lf-csv">현재 수업 기록 저장 (CSV)</button><button class="btn sm" id="lf-bak">전체 백업 저장</button><details class="log-more"><summary>다른 저장 옵션</summary><button class="btn sm" id="lf-r">새로고침</button><button class="btn sm" id="lf-json">JSON</button><button class="btn sm" id="lf-all">전체 수업 CSV</button></details></div>' +
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
        if (!r.supportCount.AI && !r.supportCount.TEACHER) {
          $('#rbody').innerHTML = '<section class="rcard"><h2>아직 검증 전입니다</h2><p>AI 또는 교사가 실제로 보낸 발문이 없습니다. 기록 0건은 통과가 아닙니다.</p><p class="hint">지원이 필요하지 않은 학생도 있으므로, 지원 횟수 0회 자체가 문제라는 뜻은 아닙니다. 수업 참여 기록은 ‘기록 저장’에서 확인하세요.</p></section>';
          return;
        }
        function row(ok, label, val, note) { return '<li class="' + (ok ? 'pass' : 'fail') + '"><span class="mk">' + (ok ? '통과' : '확인') + '</span><span class="lb">' + label + '</span><span class="vl mono">' + val + '</span>' + (note ? '<small>' + note + '</small>' : '') + '</li>'; }
        var maxl = r.maxLevelByStudent, ks = Object.keys(maxl).sort();
        $('#rbody').innerHTML = '<div class="rgrid"><section class="rcard"><h2>처치충실도 <small>' + esc(sc) + ' · 기록에서 자동 계산</small></h2><ul class="fid">' +
          row(r.preSubmitMath === 0, '첫 제출 전 메타인지 지원 없음', r.preSubmitMath + '건') + row(r.leaks === 0, '지원 문장에 정답 노출 없음', r.leaks + '건') +
          row(r.levelViolations === 0, '지원 강도 1수준만 사용', r.levelViolations + '건') + row(r.typeViolations === 0, '메타인지 발문 한 유형만 사용', r.typeViolations + '건') + row(r.unsolicited === 0, '학생 요청에 근거한 발문만 제공', r.unsolicited + '건') + row(r.unapprovedText === 0, '발문 ID 기록 확인 (승인 검증은 별도)', r.unapprovedText + '건') +
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

  /* 연구자 승인 2026-10-27: 한 화면 등록, 30명 대시보드, 자동 진행 */
  function clockMode(s) { return s && s.clock && s.clock.mode || (s && s.settings && s.settings.autoTimer ? 'waiting' : 'legacy'); }
  var oldTimerText=timerText;
  timerText=function(s){
    var m=clockMode(s),c=s&&s.clock||{};
    if(m==='legacy')return '기존 수동 수업';
    if(m==='waiting')return '<span class="tm-k">'+(s.settings&&s.settings.demoSession?'시연 · ':'')+'Preview 시작 대기</span><strong class="clock-digits">0:00</strong><small>경과 시간 · 시작 후 Preview '+stageMin(s.lesson,0)+'분</small>';
    if(m==='finished')return '수업 완료';
    if(m==='reflection')return '<span class="tm-k">성찰 작성 중 · 자동 종료 없음</span><strong class="clock-digits">∞</strong><small>학생들이 성찰을 마치면 교사가 종료합니다.</small>';
    var left=m==='paused'?c.remaining_ms/1000:(Date.parse(c.deadline)-nowMs())/1000;
    var start=Date.parse(c.started_at||s.stage_opened&&s.stage_opened[0]),end=m==='paused'?Date.parse(c.paused_at):nowMs(),elapsed=Number.isFinite(start)?Math.max(0,(end-start-(c.paused_total_ms||0))/1000):0;
    return '<span class="tm-k">'+(m==='paused'?'일시정지':m==='catchup'?'보완 시간':C.stages[s.stage].id)+' 남은 시간</span> <strong class="clock-digits'+(left<=60?' clock-urgent':'')+'">'+mmss(Math.max(0,left))+'</strong><small>수업 경과 '+mmss(elapsed)+'</small>';
  };
  var oldResearchRender=Researcher.render;
  Researcher.tab='classes';
  Researcher.render=function(){if(this.tab==='classes')return this.renderClasses();return oldResearchRender.call(this);};
  Researcher.renderClasses=function(){
    var self=this;
    $$('.rtab').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-tab')==='classes');});var step=$('#stepper');if(step)step.innerHTML='';var badge=$('#r-sess');if(badge)badge.textContent='연구 준비';
    $('#rbody').innerHTML='<p class="loading">반과 학생 명단을 불러오는 중…</p>';
    Promise.all([api('GET','admin/classes'),api('GET','admin/students')]).then(function(all){
      if(self.tab!=='classes'||App.screen!=='researcher')return;
      var list=all[0].classes,students=all[1].students;
      var cls=list.filter(function(c){return c.code===self.classCode;})[0]||list[0]||null;
      if(self.newClass)cls=null;
      if(cls)self.classCode=cls.code;
      var members=cls?students.filter(function(s){return s.class_name===cls.code;}):[];
      $('#rbody').innerHTML='<h1>반과 학생 등록</h1><p class="hint">반을 한 번 저장하면 학생의 반과 집단이 자동으로 연결됩니다. 이름 대신 코드만 사용하세요.</p><div class="class-layout"><aside class="rcard"><h2>반 목록 <button class="btn sm primary" id="cl-new">+ 새 반</button></h2><div class="sesslist">'+list.map(function(c){return '<button class="sessrow'+(cls&&c.code===cls.code?' on':'')+'" data-class="'+esc(c.code)+'"><span><b>'+esc(c.code)+'</b><small>'+groupKo(c.grp)+' · 교사 '+esc(c.teacher_code)+'</small></span><span>'+c.count+'명</span></button>';}).join('')+(!list.length?'<p class="hint">오른쪽에서 첫 반을 만드세요.</p>':'')+'</div></aside><div class="class-main"><section class="rcard"><h2>반 정보</h2><form id="cl-form" class="formrow"><label>반 코드<input id="cl-code" value="'+esc(cls?cls.code:'')+'" maxlength="20" required pattern="(?:[A-Za-z0-9_]|-){2,20}" '+(cls?'readonly':'placeholder="예: A01"')+'></label><label>집단<select id="cl-group"'+(cls?' disabled':'')+'><option value="EXPERIMENT">실험집단</option><option value="CONTROL"'+(cls&&cls.grp==='CONTROL'?' selected':'')+'>통제집단</option></select></label><label>교사 코드<input id="cl-teacher" required maxlength="20" value="'+esc(cls?cls.teacher_code:'T1')+'" pattern="(?:[A-Za-z0-9_]|-){2,20}"></label><button class="btn primary" type="submit">반 저장</button></form><p class="hint small">교사는 이 코드와 교사 비밀번호로 입장합니다.</p></section>'+
      (cls?'<section class="rcard"><h2>학생 등록 <small>'+esc(cls.code)+'에 자동 등록</small></h2><form id="cl-add" class="formrow"><label>학생 코드<input id="cl-student" required maxlength="20" pattern="(?:[A-Za-z0-9_]|-){2,20}" placeholder="예: S001"></label><label>PIN<input id="cl-pin" inputmode="numeric" pattern="[0-9]{4,8}" maxlength="8" placeholder="비우면 자동 발급"></label><button class="btn primary" type="submit">+ 개별 추가</button></form><div class="upload-inline"><label>명단 파일 등록<input id="cl-file" type="file" accept=".csv,.txt,text/csv"></label><button class="btn sm" id="cl-template">양식 받기</button><span class="hint small">선택한 반에 학생을 추가합니다. 같은 반의 다음 차시와 시연에서도 이 명단을 사용합니다.</span></div><div id="cl-preview" hidden><textarea id="cl-csv" rows="4" aria-label="등록할 명단 미리보기"></textarea><button class="btn primary" id="cl-upload">명단 등록</button></div><div id="cl-result" role="status"></div></section><section class="rcard"><h2>'+esc(cls.code)+'에 등록된 학생 <small>'+members.length+'명</small></h2><div class="row"><button class="btn sm" id="cl-mask">'+(self.showPins?'PIN 가리기':'PIN 보기')+'</button><button class="btn sm" id="cl-export">입장 명단 내려받기</button></div><div class="tablewrap"><table class="roster"><thead><tr><th>학생 코드</th><th>PIN</th><th>상태</th><th>관리</th></tr></thead><tbody>'+members.map(function(s){return '<tr><td>'+esc(s.code)+'</td><td>'+esc(self.showPins?s.pin||'재발급 필요':'••••')+'</td><td>'+(s.active?(s.locked?'잠김':'사용'):'중지')+'</td><td><button class="btn sm" data-cl-edit="'+esc(s.code)+'">PIN 수정</button> <button class="btn sm" data-cl-reset="'+esc(s.code)+'">PIN 새로</button> <button class="btn sm" data-cl-active="'+esc(s.code)+'" data-active="'+(!s.active)+'">'+(s.active?'중지':'다시 사용')+'</button></td></tr>';}).join('')+'</tbody></table></div></section><section class="rcard"><h2>수업 준비</h2><div class="formrow"><label>차시<select id="cl-lesson">'+Object.keys(C.lessons).map(function(k){return '<option value="'+k+'">'+esc(lessonLabel(+k))+'</option>';}).join('')+'</select></label><label class="video-url">Read 개념영상 주소 (선택)<input id="cl-video" type="url" placeholder="https://..."></label><button class="btn primary" id="cl-prepare">새 수업 준비</button><button class="btn" id="cl-newdemo">시연 처음부터</button></div><p class="hint">새 수업 준비와 시연 처음부터는 Preview 2분에서 대기합니다. 학생이 입장한 뒤 시작을 누르세요. 기존 수업을 계속하려면 아래 수업 운영을 누르세요.</p><div class="sesslist">'+self.sessions.filter(function(s){return s.class_name===cls.code;}).map(function(s){return '<div class="session-action"><span><b>'+esc(s.code)+'</b> · '+esc(lessonLabel(s.lesson))+' · '+(s.settings.autoTimer?clockLabel(s):'기존 수동 수업')+'</span><button class="btn sm" data-cl-open="'+esc(s.code)+'">수업 운영</button><button class="btn sm" data-cl-test="'+esc(s.code)+'">학생 입장 테스트</button></div>';}).join('')+'</div></section>':'<section class="rcard"><p>새 반의 명단은 비어 있습니다. 반을 저장한 뒤 학생을 추가하면 아래 명단에 바로 나타납니다.</p></section>')+'</div></div>';
      $('#cl-new').onclick=function(){self.newClass=true;self.renderClasses();};
      $$('[data-class]').forEach(function(b){b.onclick=function(){self.classCode=b.getAttribute('data-class');self.newClass=false;self.renderClasses();};});
      $('#cl-form').onsubmit=function(ev){ev.preventDefault();var btn=this.querySelector('button');btn.disabled=true;api('POST','admin/class',{code:$('#cl-code').value,group:$('#cl-group').value,teacher_code:$('#cl-teacher').value}).then(function(){self.classCode=$('#cl-code').value.toUpperCase();self.newClass=false;self.renderClasses();}).catch(function(e){toast(e.message,'warn');btn.disabled=false;});};
      if(!cls)return;
      var prepareCard=$('#cl-prepare').closest('section'),main=$('.class-main');main.insertBefore(prepareCard,main.children[1]);
      prepareCard.insertAdjacentHTML('afterbegin','<p class="notice-bar"><b>'+esc(cls.code)+'반</b> · '+groupKo(cls.grp)+' · 교사 '+esc(cls.teacher_code)+' · 등록 '+members.length+'명<br>새 수업 준비 → 학생 먼저 입장 → 교사 화면의 수업 시작</p>');
      function upload(body,btn){btn.disabled=true;api('POST','admin/class-roster',Object.assign({class_code:cls.code},body)).then(function(r){self.classResult=r;self.renderClasses();}).catch(function(e){toast(e.message,'warn');btn.disabled=false;});}
      $('#cl-add').onsubmit=function(ev){ev.preventDefault();upload({code:$('#cl-student').value,pin:$('#cl-pin').value},this.querySelector('button'));};
      $('#cl-template').onclick=function(){saveText('학생등록양식.csv','\ufeffcode,pin\r\nS001,1111\r\nS002,2222');};
      $('#cl-file').onchange=function(){var f=this.files[0];if(!f)return;if(f.size>500000){toast('파일은 500KB 이하로 준비해 주세요.','warn');return;}var rd=new FileReader();rd.onload=function(){$('#cl-preview').hidden=false;$('#cl-csv').value=rd.result;};rd.readAsText(f,'utf-8');};
      $('#cl-upload').onclick=function(){upload({csv:$('#cl-csv').value},this);};
      if(self.classResult){var r=self.classResult;$('#cl-result').innerHTML='<p>신규 '+r.created+'명 / 변경 '+r.updated+'명 / 유지 '+r.unchanged+'명</p>'+r.errors.map(function(e){return '<p class="warnline">'+e.line+'행 '+esc(e.code)+': '+esc(e.error)+'</p>';}).join('');self.classResult=null;}
      $('#cl-mask').onclick=function(){self.showPins=!self.showPins;self.renderClasses();};
      $('#cl-export').onclick=function(){saveText(cls.code+'_입장명단.csv','\ufeff학생코드,PIN,반,교사코드\r\n'+members.map(function(s){return [s.code,s.pin||'',cls.code,cls.teacher_code].join(',');}).join('\r\n'));};
      $$('[data-cl-reset]').forEach(function(b){b.onclick=function(){if(!confirm('PIN을 새로 발급할까요? 기존 PIN은 사용할 수 없습니다.'))return;api('POST','admin/student',{code:b.getAttribute('data-cl-reset'),reset_pin:true}).then(function(){self.renderClasses();}).catch(function(e){toast(e.message,'warn');});};});
      $$('[data-cl-active]').forEach(function(b){b.onclick=function(){api('POST','admin/student',{code:b.getAttribute('data-cl-active'),active:b.getAttribute('data-active')==='true'}).then(function(){self.renderClasses();}).catch(function(e){toast(e.message,'warn');});};});
      $$('[data-cl-edit]').forEach(function(b){b.onclick=function(){var code=b.getAttribute('data-cl-edit');$('#cl-student').value=code;$('#cl-pin').value='';$('#cl-pin').focus();toast('새 PIN을 입력한 뒤 개별 추가를 누르면 이 학생의 PIN만 변경됩니다.');};});
      $('#cl-lesson').onchange=function(){var lesson=+this.value,session=self.sessions.find(function(s){return s.class_name===cls.code&&s.lesson===lesson&&s.status==='open'&&clockMode(s)!=='finished';});$('#cl-video').value=session&&session.settings.videoUrl||'';};$('#cl-lesson').onchange();
      $('#cl-prepare').onclick=function(){var button=this,lesson=+$('#cl-lesson').value,current=self.sessions.find(function(s){return s.class_name===cls.code&&s.status==='open'&&['running','paused','catchup'].includes(clockMode(s));})||self.sessions.find(function(s){return s.class_name===cls.code&&s.status==='open'&&s.settings.autoTimer&&clockMode(s)==='waiting';});if(current&&!confirm('기존 수업 대신 새 수업을 Preview에서 준비할까요? 이전 기록은 보존됩니다. 기존 수업을 계속하려면 아래 수업 운영을 누르세요.'))return;button.disabled=true;api('POST','staff/new-lesson',{class_code:cls.code,lesson:lesson,videoUrl:$('#cl-video').value,replace_session:current?current.code:null}).then(function(r){return self.loadSessions().then(function(){Teacher.start(r.session.code);});}).catch(function(e){toast(e.message,'warn');button.disabled=false;});};
      $('#cl-newdemo').onclick=function(){var button=this,lesson=+$('#cl-lesson').value,current=self.sessions.find(function(s){return s.class_name===cls.code&&s.status==='open'&&['running','paused','catchup'].includes(clockMode(s));})||self.sessions.find(function(s){return s.class_name===cls.code&&s.lesson===lesson&&s.status==='open';});if(current&&!confirm('기존 수업의 진행을 끝내고 새 시연을 Preview에서 준비할까요? 기존 답안과 기록은 보존됩니다. 실제 수업 중에는 사용하지 마세요.'))return;button.disabled=true;api('POST','staff/new-demo',{class_code:cls.code,lesson:lesson,videoUrl:$('#cl-video').value,replace_session:current?current.code:null}).then(function(r){return self.loadSessions().then(function(){Teacher.start(r.session.code);});}).catch(function(e){toast(e.message,'warn');button.disabled=false;});};
      $$('[data-cl-open]').forEach(function(b){b.onclick=function(){Teacher.start(b.getAttribute('data-cl-open'));};});
      $$('[data-cl-test]').forEach(function(b){b.onclick=function(){window.open('/?class='+encodeURIComponent(cls.code)+'#login-student','_blank','noopener');toast('새 창에서 수업 코드, 학생 코드, PIN으로 입장해 확인하세요.');};});
    }).catch(function(e){toast(e.message,'warn');});
  };
  function clockLabel(s){return ({waiting:'시작 대기',running:'진행 중',paused:'일시정지',catchup:'보완 시간',reflection:'성찰 작성 중',finished:'완료'})[clockMode(s)]||'수동 진행';}
  Teacher.picked={};Teacher.filter='all';Teacher.reqItem='';Teacher.bankId='';
  function countdownNotice(target,session){
    if(!session||clockMode(session)!=='running'||!session.clock||!session.clock.deadline)return;
    var left=(Date.parse(session.clock.deadline)-nowMs())/1000;if(!(left>0))return;
    var key=session.code+':'+session.stage+':'+session.clock.deadline;
    if(target._timeKey!==key){target._timeKey=key;target._timeNotified={};var oldBox=$('#'+(target===Student?'student-time-warning':'teacher-time-warning'));if(oldBox)oldBox.remove();}
    var current=null;[180,120,60,30,10].forEach(function(t){if(left<=t)current=t;});
    if(current===null||target._timeNotified[current])return;
    target._timeNotified[current]=true;
    var label=({180:'3분',120:'2분',60:'1분',30:'30초',10:'10초'})[current];
    var message='남은 시간 '+label+' · '+(session.stage===5?'풀이와 성찰을 확인하세요.':'답을 작성하고 제출해 주세요.');
    var id=target===Student?'student-time-warning':'teacher-time-warning',box=$('#'+id);
    if(!box){box=document.createElement('div');box.id=id;box.className='time-warning';box.setAttribute('role','status');box.setAttribute('aria-live','polite');var anchor=target===Student?$('#layout'):$('#console-stats');if(anchor&&anchor.parentNode)anchor.parentNode.insertBefore(box,anchor);}
    if(box)box.textContent=message;
    toast(message,'warn');
  }
  Teacher.soundEnabled=false;Teacher.alertAudio=null;
  Teacher.notifyNew=function(requests){
    if(!requests.length)return;
    var label=requests.map(function(r){return r.code;}).join(', ');
    document.title='[새 도움 요청 '+requests.length+'건] '+label+' · PQ4R';
    toast(label+' 학생의 새 도움 요청이 도착했습니다.','warn');
    if(this.soundEnabled){
      try{
        var ac=this.alertAudio;if(ac&&ac.state==='suspended')ac.resume();
        if(ac){var osc=ac.createOscillator(),gain=ac.createGain();osc.type='sine';osc.frequency.setValueAtTime(660,ac.currentTime);osc.frequency.setValueAtTime(880,ac.currentTime+.15);gain.gain.setValueAtTime(.04,ac.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.34);osc.connect(gain).connect(ac.destination);osc.start();osc.stop(ac.currentTime+.35);}
      }catch(e){}
    }
    if(document.hidden&&window.Notification&&Notification.permission==='granted'){
      try{new Notification('학생 도움 요청 '+requests.length+'건',{body:label,tag:'pq4r-request-'+requests[0].id});}catch(e){}
    }
  };
  Teacher.shell=function(){
    var self=this;self.picked={};self.bankId='';self.reqItem='';self.batchResults='';self.queueFingerprint=null;self.filter='all';self.gridMode=store('pq4r:teacher-grid')||'worksheet';self.mirrorStudent=null;self.readyAttempt=null;
    $('#app').innerHTML=topbar((App.role==='researcher'?'연구자 수업 운영':'교사 '+esc(App.tid||'T01'))+' · 수업 운영','<button class="btn sm" id="t-switch">'+(App.role==='researcher'?'연구 준비':'수업 바꾸기')+'</button>')+
      '<main class="teacher-console"><section class="console-header rcard"><div><h1 id="console-title">수업 운영</h1><p id="console-sub" class="hint"></p></div><div id="teacher-live-timer" class="teacher-live-timer" aria-live="off"></div><div class="row"><div id="clock-actions" class="row"></div><button class="btn" id="t-demo-restart" hidden>시연 처음부터</button></div></section><div class="row staff-view-nav"><button class="btn sm" id="teacher-research-view">수업 준비 화면</button><button class="btn sm" id="teacher-student-view">학생 입장 화면 열기</button><button class="btn sm primary" id="teacher-student-share">학생용 링크 복사</button><button class="btn sm" id="teacher-staff-share">교사용 링크 복사</button><button class="btn sm" id="teacher-alert-enable" type="button">알림 소리 켜기</button><span class="hint small">새 도움 요청은 화면에 표시됩니다. 소리 알림은 버튼으로 켜세요.</span></div><div class="notice-bar" id="teacher-entry-note"></div><div class="console-stats" id="console-stats"></div><div class="console-grid"><section class="rcard" id="teacher-wall"><div class="worksheet-wall-title"><h2>전체 학생 현황</h2><button type="button" class="btn sm" id="teacher-wall-fullscreen">5열 6행 전체화면</button></div><div class="row worksheet-view-controls"><button class="btn sm primary" data-grid-mode="worksheet" aria-pressed="true">활동지 30명 보기</button><button class="btn sm" data-grid-mode="status" aria-pressed="false">상태만 보기</button><span class="hint small">학생이 입력 중인 현재 활동지를 약 3초마다 반영합니다. 화면 영상 공유는 아닙니다.</span></div><div class="row"><button class="btn sm" data-filter="all">전체</button><button class="btn sm" data-filter="help">도움 요청</button><button class="btn sm" data-filter="missing">미제출</button></div><div class="student-grid" id="student-grid"></div><div class="tablewrap"><table class="roster" id="roster" hidden></table></div></section><section class="rcard"><h2 id="request-title">도움 요청</h2><label>문항별 보기<select id="request-item"></select></label><p class="hint small">학생의 최근 제출 답안과 추천 발문을 바로 확인하세요. 도움 버튼을 누른 요청만 표시합니다.</p><div id="queue"></div></section><section class="rcard"><div id="batch-panel"></div><details id="detail-fold" open><summary>학생 답안과 지원 기록</summary><div id="tdetail"><p class="hint">학생을 선택하면 자세한 답과 기록을 볼 수 있습니다.</p></div></details></section></div><div class="row" id="notice-actions"><b>전체 안내</b><button class="btn sm" data-notice="time">시간 확인</button><button class="btn sm" data-notice="save">제출 안내</button><button class="btn sm" data-notice="device">접속 문제 안내</button></div></main>';
    bindExit();
    $('#teacher-alert-enable').onclick=function(){
      if(!self.soundEnabled){
        try{var AC=window.AudioContext||window.webkitAudioContext;self.alertAudio=AC?new AC():null;if(self.alertAudio)self.alertAudio.resume();}catch(e){self.alertAudio=null;}
        self.soundEnabled=true;this.textContent='알림 소리 켜짐';
        if(window.Notification&&Notification.permission==='default')Notification.requestPermission().catch(function(){});
        toast('새 요청이 도착하면 소리와 제목으로 알려드려요.');
      }else{self.soundEnabled=false;this.textContent='알림 소리 켜기';}
    };
    $('#teacher-research-view').onclick=function(){tabStore('pq4r:staff-screen',{screen:'researcher'});if(App.role==='researcher'){Researcher.tab='classes';Researcher.start();}else{var a=rememberedStaff('researcher');if(a)restoreStaff(a);else renderEntry('researcher');}};
    $('#teacher-student-view').onclick=function(){var cls=self.data&&self.data.session.class_name;if(cls&&self.code)window.open(shareLink('student',cls,self.code),'_blank','noopener');else toast('수업 데이터를 불러오는 중입니다.','warn');};
    $('#teacher-student-share').onclick=function(){var cls=self.data&&self.data.session.class_name;if(cls)copyShareLink('student',cls,self.code);else toast('수업 데이터를 불러오는 중입니다.','warn');};
    $('#teacher-staff-share').onclick=function(){var cls=self.data&&self.data.session.class_name;if(cls)copyShareLink('teacher',cls,self.code);else toast('수업 데이터를 불러오는 중입니다.','warn');};
    $('#t-switch').onclick=function(){if(App.role==='researcher'){Researcher.tab='classes';Researcher.start();}else{self.code=null;store('pq4r:teacher-session',null);Teacher.start();}};
    $$('[data-filter]').forEach(function(b){b.onclick=function(){self.filter=b.getAttribute('data-filter');self.renderRoster();};});
    $$('[data-grid-mode]').forEach(function(b){b.onclick=function(){self.gridMode=b.getAttribute('data-grid-mode');store('pq4r:teacher-grid',self.gridMode);self.renderRoster();};});
    $('#teacher-wall').addEventListener('fullscreenchange',function(){
      var b=$('#teacher-wall-fullscreen');if(b)b.textContent=document.fullscreenElement===$('#teacher-wall')?'전체화면 닫기':'5열 6행 전체화면';
    });
    $('#teacher-wall-fullscreen').onclick=function(){
      var wall=$('#teacher-wall');if(!wall)return;
      if(document.fullscreenElement===wall){if(document.exitFullscreen)document.exitFullscreen().catch(function(){toast('전체화면을 종료할 수 없습니다.','warn');});}
      else if(wall.requestFullscreen){self.gridMode='worksheet';store('pq4r:teacher-grid','worksheet');self.renderRoster();wall.requestFullscreen().catch(function(){toast('전체화면이 실행되지 않았습니다.','warn');});}
      else toast('이 브라우저는 전체화면을 지원하지 않습니다.','warn');
    };
    $('#student-grid').onclick=function(ev){var b=ev.target.closest('[data-student]');if(!b)return;
      if(self.gridMode==='worksheet')self.openWorksheet(b.getAttribute('data-student'));
      else{$('#detail-fold').open=true;self.select(b.getAttribute('data-student'),null);}
    };
    $('#request-item').onchange=function(){self.reqItem=this.value;self.picked={};self.bankId='';self.renderQueue();self.renderBatch();};
    $('#queue').onclick=function(ev){var direct=ev.target.closest('[data-direct-send]');if(direct){var id=direct.getAttribute('data-direct-send'),req=self.data.requests.find(function(q){return q.id===id;}),card=direct.closest('[data-request-card]'),sel=card&&card.querySelector('[data-direct-bank]'),status=card&&card.querySelector('[data-send-status]');if(!req||!sel||!sel.value){toast('발문을 선택해 주세요.','warn');return;}direct.disabled=true;if(status)status.textContent='전송 중…';api('POST','staff/send-batch',{session:self.code,item_id:req.item_id,bank_id:sel.value,targets:[{code:req.code,request_id:req.id,attempt:req.attempt}]}).then(function(r){var result=r.results&&r.results[0];if(result&&result.ok){toast(req.code+' 학생에게 발문을 전송했습니다.');self.picked={};self.queueFingerprint=null;return self.refresh();}var msg=result&&result.error||'전송 결과를 확인하지 못했습니다.';if(status)status.textContent=msg;toast(msg,'warn');direct.disabled=false;}).catch(function(e){if(status)status.textContent=e.message;toast(e.message,'warn');direct.disabled=false;});return;}var pick=ev.target.closest('[data-request-recommend],[data-request-toggle]');if(pick){var rid=pick.getAttribute('data-request-recommend')||pick.getAttribute('data-request-toggle'),req=self.data.requests.find(function(x){return x.id===rid;});if(!req)return;if(pick.hasAttribute('data-request-recommend')){self.picked={};self.picked[rid]=req.attempt;self.bankId=req.recommendation?req.recommendation.id:'';}else if(self.picked[rid]!==undefined)delete self.picked[rid];else self.picked[rid]=req.attempt;self.renderQueue();self.renderBatch();return;}var b=ev.target.closest('[data-request-detail]');if(b){var r=self.data.requests.find(function(x){return x.id===b.getAttribute('data-request-detail');});$('#detail-fold').open=true;self.select(r.code,r.item_id);}};
    $('#queue').onchange=function(ev){var t=ev.target;if(!t.matches('[data-request-pick]'))return;var r=self.data.requests.find(function(x){return x.id===t.getAttribute('data-request-pick');});if(t.checked)self.picked[r.id]=r.attempt;else delete self.picked[r.id];self.renderBatch();};
    $$('[data-notice]').forEach(function(b){b.onclick=function(){api('POST','staff/announce',{session:self.code,key:b.getAttribute('data-notice')}).then(function(){toast('전체 학생에게 안내를 보냈어요.');}).catch(function(e){toast(e.message,'warn');});};});
    every(3000,function(){return self.refresh();},5000);
    App.timers.push(setInterval(function(){if(self.data){var t=$('#timer');if(t)t.innerHTML=timerText(self.data.session);var live=$('#teacher-live-timer');if(live)live.innerHTML=timerText(self.data.session);countdownNotice(self,self.data.session);}},1000));
    self.refresh();
  };
  Teacher.refresh=function(){var self=this,requestSession=self.code;return api('GET','staff/overview?session='+encodeURIComponent(requestSession)).then(function(r){if(App.screen!=='teacher'||self.code!==requestSession)return;if(self.data&&r.session.stage_rev<self.data.session.stage_rev)return;var prev=self.data;self.data=r;
    if(prev){var oldIds=new Set((prev.requests||[]).map(function(q){return q.id;}));self.notifyNew((r.requests||[]).filter(function(q){return !oldIds.has(q.id);}));}
    else document.title='PQ4R 수업 운영';
    self.data.requests.forEach(function(q){if(self.picked[q.id]!==undefined&&self.picked[q.id]!==q.attempt)delete self.picked[q.id];});Object.keys(self.picked).forEach(function(id){if(!r.requests.some(function(q){return q.id===id;}))delete self.picked[id];});self.renderTop();self.renderRoster();if(self.mirrorStudent)self.renderWorksheetModal();var fingerprint=JSON.stringify(r.requests)+r.group+clockMode(r.session);if(fingerprint!==self.queueFingerprint){self.queueFingerprint=fingerprint;self.renderQueue();self.renderBatch();}if(self.sel&&(!prev||JSON.stringify(prev.students)!==JSON.stringify(r.students)))return self.loadDetail();}).catch(function(e){toast(e.message,'warn');});};
  function downloadRecord(path){
    api('GET',path).then(function(r){
      if(!r||!r.base64||!r.filename)throw new Error('다운로드 자료가 없습니다.');
      var bytes=atob(r.base64),parts=[];
      for(var i=0;i<bytes.length;i+=8192){var chunk=bytes.slice(i,i+8192),arr=new Uint8Array(chunk.length);for(var j=0;j<chunk.length;j++)arr[j]=chunk.charCodeAt(j);parts.push(arr);}
      var blob=new Blob(parts,{type:r.mime||'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=r.filename;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},5000);
      toast('학습 기록 파일을 내려받았습니다.');
    }).catch(function(e){toast(e.message||'다운로드 실패','warn');});
  }
  Teacher.renderTop=function(){
    var self=this,s=self.data.session,m=clockMode(s),auto=!!s.settings.autoTimer;
    $('#console-title').textContent=(s.class_name||'수업')+' 수업 · '+(clockLabel(s));
    $('#console-sub').textContent=lessonLabel(s.lesson)+' · '+clockLabel(s)+' · '+(self.data.group==='EXPERIMENT'?'학생 학습 상태와 자동 발문 기록을 확인합니다. 교사는 진행과 접속을 관리합니다.':'학생의 답안을 보고 준비된 발문을 개별 전달합니다.');
    var t=$('#timer');if(t)t.innerHTML=timerText(s);var live=$('#teacher-live-timer');if(live)live.innerHTML=timerText(s);var step=$('#stepper');if(step)step.innerHTML=stepperHTML(s.stage,s.stage,{noNav:true,lesson:s.lesson});
    var nav=$('#teacher-stage-review');
    if(!nav){nav=document.createElement('section');nav.id='teacher-stage-review';nav.className='rcard teacher-stage-review';var anchor=$('#teacher-entry-note');if(anchor&&anchor.parentNode)anchor.parentNode.insertBefore(nav,anchor.nextSibling);}
    if(nav){
      var viewed=Number.isInteger(self.reviewStage)?self.reviewStage:s.stage;
      if(viewed>s.stage||viewed<0)viewed=s.stage;
      nav.innerHTML='<h3>이전 단계 확인 <small>교사 열람 전용 · 학생의 현재 단계와 시간은 그대로 유지</small></h3><div class="teacher-stage-tabs">'+C.stages.map(function(st,i){return '<button type="button" class="btn sm'+(i===viewed?' primary':'')+'" data-review-stage="'+i+'"'+(i>s.stage?' disabled':'')+'>'+esc(st.id)+'</button>';}).join('')+'</div><div id="teacher-stage-preview"></div>';
      nav.querySelectorAll('[data-review-stage]').forEach(function(b){b.onclick=function(){self.reviewStage=Number(b.getAttribute('data-review-stage'));self.renderTop();};});
      var st=C.stages[viewed],ln=Number(s.lesson)||1,items=C.items.filter(function(it){return !it.archived&&it.lesson===ln&&it.stage===st.id;});
      var pages=WORKSHEETS&&WORKSHEETS.lessons&&WORKSHEETS.lessons[String(ln)]&&WORKSHEETS.lessons[String(ln)][self.data.group]&&WORKSHEETS.lessons[String(ln)][self.data.group][st.id];
      $('#teacher-stage-preview').innerHTML='<p class="hint">현재 수업: <b>'+esc(C.stages[s.stage].ko)+'</b> · 열람 중: <b>'+esc(st.ko)+'</b> · 읽기 전용</p>'+
        (Array.isArray(pages)&&pages.length?'<details><summary>활동지 원본 '+pages.length+'쪽 확인</summary>'+pages.filter(function(u){return typeof u==='string'&&u.indexOf('/worksheets/L')===0&&!u.includes('..');}).map(function(u){return '<img loading="lazy" style="display:block;width:100%;max-width:720px;margin:8px auto" src="'+esc(u)+'" alt="활동지">';}).join('')+'</details>':'')+
        items.map(function(it){var asset=paperAsset(it,self.data.group);return '<details class="teacher-stage-item"><summary>'+esc(shortOf(it.id))+' · '+esc(plain(it.title))+'</summary>'+(asset?paperProblem(it,self.data.group):'<p>'+fmt(it.title)+'</p>'+(it.fig?figHTML(it.fig):'')+choicesHTML(it.choices)+(it.sub?'<p>'+fmt(it.sub)+'</p>':''))+'</details>';}).join('')+
        (!items.length?'<p class="hint">이 단계의 웹 문항이 등록되어 있지 않습니다.</p>':'');
    }
    var note=$('#teacher-entry-note');
    if(!auto){note.innerHTML='<b>이전 방식으로 만든 수동 수업입니다.</b> 이 수업에는 자동 시작 버튼이 없습니다. 연구자 화면에서 등록된 반을 선택한 뒤 새 수업이나 시연을 준비해 주세요. <button class="btn sm" id="open-research-setup">연구자 수업 준비로</button>';$('#open-research-setup').onclick=function(){if(App.role==='researcher'){Researcher.tab='classes';Researcher.start();}else{var saved=rememberedStaff('researcher');if(saved){tabStore('pq4r:staff-screen',{screen:'researcher'});restoreStaff(saved);}else renderEntry('researcher');}};}
    else if(m==='waiting'){note.textContent='① 학생들이 반 코드로 먼저 입장합니다. ② 아래 접속 인원을 확인합니다. ③ '+'수업 시작'+'을 누르면 모두 Preview 2분부터 시작합니다. 시작 전에는 시간이 흐르지 않습니다.';
      if(!s.clock.ready&&self.readyAttempt!==s.code){self.readyAttempt=s.code;api('POST','staff/ready',{session:s.code}).then(function(){return self.refresh();}).catch(function(e){toast(e.message,'warn');note.textContent=e.message;});}
    }else if(m==='paused')note.textContent='현재 단계와 남은 시간, 학생 답안이 보존되어 있습니다. 이어서 진행을 누르면 이 지점부터 학생들과 함께 재개합니다. 새 수업을 만들 필요가 없습니다.';else if(m==='reflection')note.textContent='성찰지 작성 중입니다. Review 마지막 2분이 지나도 자동 종료되지 않습니다. 모든 학생의 성찰 제출을 확인한 뒤 직접 종료하세요.';else note.textContent='교사 시작 시각을 기준으로 모든 학생이 함께 진행합니다. 시간이 끝나면 자동으로 다음 단계로 이동합니다.';
    var navActions=(m==='running'&&auto)?'<button class="btn" data-clock="manual-prev"'+(s.stage===0?' disabled':'')+'>← 이전 단계</button><button class="btn primary" data-clock="manual-next"'+(s.stage===5?' disabled':'')+'>다음 단계 →</button>':'';
    var otherActions=auto?(m==='waiting'?'<button class="btn primary" data-clock="start">수업 시작</button>':['running','catchup'].includes(m)?'<button class="btn" data-clock="pause">긴급 일시정지</button>':m==='reflection'?'<button class="btn primary" data-clock="finish">성찰 확인 후 수업 종료</button>':m==='paused'?'<button class="btn primary" data-clock="resume">이어서 진행</button>':'<span class="pill">수업 완료</span>'):'<button class="btn" id="t-prev">이전 단계</button><button class="btn primary" id="t-next">다음 단계</button>';
    var actions=navActions+otherActions;
    if($('#clock-actions').innerHTML!==actions){
      $('#clock-actions').innerHTML=actions;
      $$('[data-clock]').forEach(function(b){b.onclick=function(){
        var action=b.getAttribute('data-clock');
        if(action==='manual-next'&&!confirm('다음 단계로 이동할까요? 현재 단계의 미제출 답안은 미완료 처리되며 수업 진행 로그에 교사 조작으로 기록됩니다.'))return;
        if(action==='manual-prev'&&!confirm('이전 단계로 돌아갈까요? 학생 화면도 이전 단계로 이동하고 새 타이머가 시작됩니다. 수업 진행 로그에 교사 조작으로 기록됩니다.'))return;
        if(action==='finish'&&!confirm('학생들의 성찰 제출을 확인했습니까? 종료하면 성찰을 추가 저장할 수 없습니다.'))return;
        b.disabled=true;
        api('POST','staff/clock',{session:self.code,action:action}).then(function(){self.queueFingerprint=null;self.reviewStage=null;return self.refresh();}).catch(function(e){toast(e.message,'warn');self.refresh();});
      };});
      if(!auto){$('#t-prev').onclick=function(){if(s.stage>0)self.setStage(-1);};$('#t-next').onclick=function(){if(s.stage<5)self.setStage(1);};}
    }
    var restart=$('#t-demo-restart');restart.hidden=!s.settings.demoSession;restart.onclick=function(){if(!confirm('새 시연을 Preview 2분에서 다시 준비할까요? 이전 답안과 기록은 그대로 보존됩니다.'))return;restart.disabled=true;api('POST','staff/new-demo',{class_code:s.class_name,lesson:s.lesson,videoUrl:s.settings.videoUrl||'',replace_session:s.status==='open'?s.code:null}).then(function(r){store('pq4r:teacher-session',r.session.code);Teacher.start(r.session.code);}).catch(function(e){toast(e.message,'warn');restart.disabled=false;});};
    var bulk=$('#teacher-all-records');
    if(!bulk){bulk=document.createElement('button');bulk.id='teacher-all-records';bulk.className='btn sm';bulk.textContent='전체 학생 단계별 Word 일괄 다운로드 (ZIP)';var toolbar=$('#clock-actions');if(toolbar)toolbar.appendChild(bulk);}
    bulk.disabled=!(m==='finished'||s.status!=='open');
    bulk.onclick=function(){downloadRecord('staff/all-records?session='+encodeURIComponent(self.code));};
    var people=self.data.students,online=people.filter(function(p){return p.last_seen&&nowMs()-Date.parse(p.last_seen)<90000;}).length;
    $('#console-stats').innerHTML='<span>등록 <b>'+people.length+'</b></span><span>접속 <b>'+online+'</b></span><span>도움 요청 <b>'+self.data.requests.length+'</b></span><span>현재 단계 미제출 <b>'+people.filter(function(p){return self.stageItems().some(function(id){return !p.items[id]||!p.items[id].a;});}).length+'</b></span>';
  };

  /* 학생 브라우저의 실제 영상이 아니라 문제 본문, 선택 항목, 자동저장된 답안을 읽기 전용으로 재구성한다. */
  Teacher.mirrorField=function(f,value,sel,focused,small){
    var v=String(value==null?'':value);
    if(f.kind==='choice'||f.kind==='multi'){
      var selected=f.kind==='multi'?multiVals(v):[v];
      v=(f.options||[]).filter(function(o){return selected.indexOf(o.v)>=0;}).map(function(o){return plain(o.label);}).join(', ');
    }
    var choices=Array.isArray(sel)?sel.map(elLabel).join(', '):'';
    return '<div class="mirror-field'+(focused?' focused':'')+'"><span class="mirror-field-name">'+fmt(f.label)+'</span>'+
      '<span class="mirror-field-value">'+(v.trim()?esc(v):'<i>아직 입력하지 않음</i>')+'</span>'+
      (choices?'<span class="mirror-field-selections">도형 선택: '+esc(choices)+'</span>':'')+'</div>';
  };
  Teacher.worksheetHTML=function(p,full){
    var ws=p.worksheet,s=this.data&&this.data.session||{},it=ws&&ITEM[ws.item_id]?resolveItem(ws.item_id,p.group,s.settings||{}):null;
    if(!it)return '<p class="mirror-empty">현재 단계의 활동지가 아직 열리지 않았습니다.</p>';
    var asset=paperAsset(it,p.group),fig=asset?'<img class="mirror-figure-img" loading="lazy" src="'+esc(asset)+'" alt="현재 문제의 활동지 그림">':(it.fig?'<img class="mirror-figure-img" loading="lazy" src="'+esc(it.fig.file)+'" alt="'+esc(plain(it.fig.desc||'문제 그림'))+'">':'');
    var fields=ws.fields||{},selected=ws.selections||{},count=0;
    var answer=it.fields.map(function(f){
      if(String(fields[f.key]||'').trim()||(selected[f.key]||[]).length)count++;
      return Teacher.mirrorField(f,fields[f.key],selected[f.key],ws.focused_field===f.key,full);
    }).join('');
    var head='<div class="mirror-sheet-head"><span>'+esc(C.stages[s.stage].ko)+'</span><strong>'+esc(shortOf(it.id))+'</strong></div>';
    var problem='<div class="mirror-problem"><p class="mirror-problem-title">'+fmt(it.title)+'</p>'+
      (fig?'<div class="mirror-figure">'+fig+'</div>':'')+
      (full&&!asset&&it.choices?choicesHTML(it.choices):'')+
      (full&&!asset&&it.fixedAI?'<div class="mirror-fixed-explanation"><b>공통 검토 설명</b><p>'+fmt(it.fixedAI.text)+'</p></div>':'')+
      (full&&it.sub?'<p>'+fmt(it.sub)+'</p>':'')+'</div>';
    var foot='<div class="mirror-sheet-foot"><span>'+(ws.attempts>0?'제출 '+ws.attempts+'회':'아직 미제출')+'</span><span>답안 작성 '+count+'/'+it.fields.length+'칸</span></div>';
    return '<div class="mirror-sheet'+(full?' mirror-sheet-large':'')+'">'+head+problem+'<div class="mirror-answer-fields">'+answer+'</div>'+foot+'</div>';
  };
  Teacher.renderRoster=function(){
    var self=this;if(!self.data)return;
    var reqs=self.data.requests,ids=self.stageItems(),showSheet=self.gridMode==='worksheet',grid=$('#student-grid');
    grid.classList.toggle('worksheet-grid',showSheet);
    $$('[data-grid-mode]').forEach(function(b){var active=b.getAttribute('data-grid-mode')===self.gridMode;b.setAttribute('aria-pressed',String(active));b.classList.toggle('primary',active);});
    grid.innerHTML=self.data.students.filter(function(p){
      return self.filter==='help'?reqs.some(function(r){return r.code===p.code;}):self.filter==='missing'?ids.some(function(id){return !p.items[id]||!p.items[id].a;}):true;
    }).map(function(p){
      var help=reqs.some(function(r){return r.code===p.code;}),offline=!p.last_seen||nowMs()-Date.parse(p.last_seen)>90000;
      var submitted=ids.filter(function(id){return p.items[id]&&p.items[id].a;}).length;
      var draft=ids.some(function(id){return p.items[id]&&p.items[id].d;});
      var active=p.worksheet&&p.worksheet.item_id?p.worksheet.item_id:null;
      var label=active?shortOf(active):'문항 선택 전';
      var preview=p.recent&&p.recent.preview?p.recent.preview:'';
      var status=offline?'미접속':help?'도움 요청':submitted===ids.length?'제출 완료':draft?'답안 작성 중':'대기 또는 읽는 중';
      var kind=help?'need-help':offline?'offline':submitted===ids.length?'submitted':'writing';
      var info='<span class="tile-head"><b>'+esc(p.code)+'</b><strong>'+esc(status)+'</strong></span>';
      if(showSheet){
        return '<button type="button" class="student-tile worksheet-tile '+kind+'" data-student="'+esc(p.code)+'" aria-label="'+esc(p.code)+' '+esc(status)+' 활동지 크게 보기">'+info+
          '<span class="tile-live-item">'+esc(label)+'</span><span class="mini-mirror">'+self.worksheetHTML(p,false)+'</span>'+
          '<small>클릭하면 활동지 확대 · '+submitted+'/'+ids.length+' 제출</small></button>';
      }
      return '<button type="button" class="student-tile '+kind+(self.sel===p.code?' selected':'')+'" data-student="'+esc(p.code)+'" title="'+esc(p.code)+' · '+esc(label)+' · '+esc(preview)+'">'+info+
        '<span class="tile-item">'+esc(label)+'</span><span class="tile-preview">'+esc(preview||'입력한 답안이 아직 없습니다.')+'</span>'+
        '<small>'+submitted+'/'+ids.length+' 제출 · 클릭해 답안 보기</small></button>';
    }).join('')||'<p class="hint">표시할 학생이 없습니다.</p>';
  };
  Teacher.openWorksheet=function(code){
    if(!this.data||!this.data.students.some(function(p){return p.code===code;}))return;
    var self=this,dlg=$('#teacher-worksheet-dialog');
    if(!dlg){
      dlg=document.createElement('dialog');dlg.id='teacher-worksheet-dialog';dlg.className='teacher-worksheet-dialog';
      dlg.innerHTML='<div class="worksheet-zoom-shell"><div class="worksheet-zoom-header"><div><h2 id="worksheet-zoom-title"></h2><p id="worksheet-zoom-status" class="hint"></p></div><div class="worksheet-zoom-actions">'+
        '<button type="button" class="btn sm" id="worksheet-prev">이전 학생</button><button type="button" class="btn sm" id="worksheet-next">다음 학생</button>'+
        '<button type="button" class="btn sm" id="worksheet-see-history">답안 이력 보기</button><button type="button" class="btn sm primary" id="worksheet-zoom-close">닫기</button></div></div>'+
        '<div id="worksheet-zoom-content" class="worksheet-zoom-content"></div><p class="worksheet-zoom-caption">학생이 웹앱에서 마지막으로 선택한 문제와 저장된 답안을 보여줍니다. 실제 PC 화면 또는 마우스 움직임을 전송하지 않습니다.</p></div>';
      ($('#teacher-wall')||document.body).appendChild(dlg);
      dlg.addEventListener('close',function(){self.mirrorStudent=null;});
      $('#worksheet-zoom-close').onclick=function(){dlg.close();};
      $('#worksheet-prev').onclick=function(){self.stepWorksheet(-1);};
      $('#worksheet-next').onclick=function(){self.stepWorksheet(1);};
      $('#worksheet-see-history').onclick=function(){var code=self.mirrorStudent,p=self.data&&self.data.students.find(function(x){return x.code===code;});dlg.close();if(document.fullscreenElement&&document.exitFullscreen)document.exitFullscreen().catch(function(){});$('#detail-fold').open=true;self.select(code,p&&p.worksheet&&p.worksheet.item_id||null);$('#detail-fold').scrollIntoView({block:'start',behavior:'smooth'});};
    }
    self.mirrorStudent=code;
    self.mirrorFingerprint=null;
    self.renderWorksheetModal();
    if(!dlg.open)dlg.showModal();
  };
  Teacher.stepWorksheet=function(direction){
    if(!this.data||!this.mirrorStudent)return;
    var people=this.data.students,idx=people.findIndex(function(p){return p.code===this.mirrorStudent;}.bind(this));
    if(idx<0)return;
    this.mirrorStudent=people[(idx+direction+people.length)%people.length].code;
    this.mirrorFingerprint=null;
    this.renderWorksheetModal();
    var box=$('#worksheet-zoom-content');if(box)box.scrollTop=0;
  };
  Teacher.renderWorksheetModal=function(){
    var dlg=$('#teacher-worksheet-dialog');
    if(!dlg||!dlg.open&&!this.mirrorStudent||!this.data||!this.mirrorStudent)return;
    var p=this.data.students.find(function(x){return x.code===this.mirrorStudent;}.bind(this));
    if(!p){if(dlg.open)dlg.close();return;}
    var fingerprint=JSON.stringify({code:p.code,worksheet:p.worksheet,requests:(this.data.requests||[]).filter(function(r){return r.code===p.code;}),last_seen:p.last_seen,stage:this.data.session.stage});
    if(fingerprint===this.mirrorFingerprint)return;
    this.mirrorFingerprint=fingerprint;
    $('#worksheet-zoom-title').textContent=p.code+' 학생 · 실시간 활동지';
    var online=p.last_seen&&nowMs()-Date.parse(p.last_seen)<90000;
    $('#worksheet-zoom-status').textContent=(online?'접속 중':'현재 미접속')+' · '+(p.worksheet&&p.worksheet.updated_at?'최근 서버 저장 '+kst(p.worksheet.updated_at):'아직 저장된 답안 없음')+' · 약 3초 간격으로 확인';
    var content=$('#worksheet-zoom-content'),scroll=content.scrollTop,reqs=(this.data.requests||[]).filter(function(r){return r.code===p.code;});
    content.innerHTML=this.worksheetHTML(p,true)+(reqs.length?'<section class="worksheet-zoom-help"><h3>도움 요청 '+reqs.length+'건</h3>'+reqs.map(function(q){return '<p><b>'+esc(shortOf(q.item_id))+'</b> '+(q.question_text?esc(q.question_text):'학생이 도움을 요청했습니다.')+'</p>';}).join('')+'</section>':'');
    content.scrollTop=scroll;
  };

  Teacher.renderQueue=function(){
    var self=this,qs=(self.data.requests||[]),isControl=self.data.group==='CONTROL';
    var ids=Array.from(new Set(qs.map(function(r){return r.item_id;})));
    if(!ids.includes(self.reqItem)){self.reqItem=ids[0]||'';self.picked={};self.bankId='';}
    $('#request-item').innerHTML=ids.map(function(id){return '<option value="'+esc(id)+'"'+(id===self.reqItem?' selected':'')+'>'+esc(shortOf(id))+' ('+qs.filter(function(r){return r.item_id===id;}).length+'명)</option>';}).join('')||'<option value="">대기 요청 없음</option>';
    $('#request-title').textContent=isControl?'학생 질문 · 교사 발문 전송 ('+qs.length+'건)':'AI 지원 현황';
    if(!isControl){$('#queue').innerHTML='<p class="hint">AI 발문과 재응답은 학생을 눌러 확인하세요.</p>';return;}
    var matching=qs.filter(function(r){return r.item_id===self.reqItem;});
    $('#queue').innerHTML=matching.map(function(r){
      var entries=((self.bank&&self.bank.bank)||[]).filter(function(b){return b.item===r.item_id&&b.level===1;});
      var recommended=r.recommendation&&r.recommendation.id;
      var sorted=entries.slice().sort(function(a,b){return (a.id===recommended?-1:0)-(b.id===recommended?-1:0);});
      var opts=sorted.map(function(b){return '<option value="'+esc(b.id)+'"'+(b.id===recommended?' selected':'')+'>'+esc(b.text)+'</option>';}).join('');
      return '<article class="request-card" data-request-card="'+esc(r.id)+'"><div class="row"><b>'+esc(r.code)+' 학생</b><small>대기 '+mmss(Math.max(0,(nowMs()-Date.parse(r.at))/1000))+'</small><button class="btn sm" data-request-detail="'+esc(r.id)+'">전체 답안</button></div>'+
        '<div class="teacher-question"><strong>학생이 보낸 질문</strong><p>'+esc(r.question_text||'도움을 요청했습니다. 학생의 제출 답안을 함께 확인하세요.')+'</p></div>'+
        '<details class="teacher-answer"><summary>학생의 제출 답안 보기</summary>'+fieldsView(resolveItem(r.item_id,'CONTROL',self.data.session.settings),r.fields,r.sel||{})+'</details>'+
        '<label class="teacher-bank-label" for="bank-'+esc(r.id)+'">보낼 메타인지 발문 선택</label>'+
        '<select class="teacher-bank-select" id="bank-'+esc(r.id)+'" data-direct-bank="'+esc(r.id)+'"><option value="">발문 선택</option>'+opts+'</select>'+
        '<div class="row teacher-send-row"><button type="button" class="btn primary" data-direct-send="'+esc(r.id)+'"'+(!entries.length||clockMode(self.data.session)!=='running'?' disabled':'')+'>이 학생에게 발문 전송</button><span class="hint small" data-send-status="'+esc(r.id)+'">'+(entries.length?'학생에게만 개별 전송됩니다.':'이 문항의 발문이 아직 등록되지 않았습니다.')+'</span></div></article>';
    }).join('')||'<p class="hint">현재 문항에 대기 중인 학생 질문이 없습니다.</p>';
  };
  Teacher.renderBatch=function(){var self=this,n=$('#batch-panel'),count=Object.keys(self.picked).length;if(self.data.group==='EXPERIMENT'){n.innerHTML='<h2>수업 학습 상태 관리</h2><p>자동 타이머로 모든 학생이 함께 이동합니다. 학생을 선택하면 답안과 AI 지원 기록을 확인할 수 있습니다.</p><p class="hint">접속 문제나 수업 진행만 안내해 주세요.</p>';return;}
    var list=self.bank.bank.filter(function(b){return b.item===self.reqItem&&b.level===1;});
    var pickedRequest=self.data.requests.find(function(r){return self.picked[r.id]!==undefined&&r.item_id===self.reqItem;});
    var recommendedId=(pickedRequest&&pickedRequest.recommendation&&pickedRequest.recommendation.id)||self.bankId;
    list.sort(function(a,b){return (a.id===recommendedId?-2:a.state==='*'?1:0)-(b.id===recommendedId?-2:b.state==='*'?1:0);});
    if(!list.some(function(b){return b.id===self.bankId;}))self.bankId='';
    var options=function(bs){return bs.map(function(b){return '<label class="bankopt"><input type="radio" name="batch-bank" value="'+esc(b.id)+'"'+(b.id===self.bankId?' checked':'')+'><span>'+fmt(b.text)+'</span></label>';}).join('');};
    n.innerHTML='<h2>추천 발문 확인 · 전송</h2><p>선택한 학생 <b>'+count+'명</b> · '+esc(self.reqItem?shortOf(self.reqItem):'문항 선택 대기')+'</p>'+options(list.slice(0,4))+(list.length>4?'<details><summary>다른 발문 '+(list.length-4)+'개</summary>'+options(list.slice(4))+'</details>':'')+'<button class="btn primary batch-send" id="batch-send"'+(!count||!self.bankId||clockMode(self.data.session)==='paused'||['catchup','finished','waiting'].includes(clockMode(self.data.session))?' disabled':'')+'>선택한 '+count+'명에게 보내기</button><p class="hint small">각 학생에게만 개별 전달됩니다. 전송 직전 답안과 요청을 다시 확인합니다.</p><div id="batch-results" role="status">'+(self.batchResults||'')+'</div>';
    $$('input[name="batch-bank"]',n).forEach(function(t){t.onchange=function(){self.bankId=t.value;self.renderBatch();};});
    $('#batch-send').onclick=function(){var btn=this;btn.disabled=true;var targets=self.data.requests.filter(function(r){return self.picked[r.id]!==undefined&&r.item_id===self.reqItem;}).map(function(r){return {code:r.code,request_id:r.id,attempt:self.picked[r.id]};});api('POST','staff/send-batch',{session:self.code,item_id:self.reqItem,bank_id:self.bankId,targets:targets}).then(function(r){self.batchResults=r.results.map(function(x){return '<p class="'+(x.ok?'':'warnline')+'">'+esc(x.code)+': '+(x.ok?'전송 완료':esc(x.error))+'</p>';}).join('');self.picked={};self.queueFingerprint=null;return self.refresh();}).catch(function(e){toast(e.message,'warn');btn.disabled=false;});};
  };
  var originalStudentRender=Student.renderStage;
  Student.renderStage=function(){
    var m=clockMode(this.me.session);
    if(['catchup','finished'].includes(m))return this.renderSupplements();
    if(m==='waiting'){
      $('#left').hidden=true;$('#layout').classList.add('noleft');
      $('#right').innerHTML='<section class="panel" id="student-waiting" role="status"><h1>Preview · 수업 시작 대기</h1><p>학생 '+esc(this.me.student.code)+'님, 입장되었습니다.</p><p>선생님이 '+'수업 시작'+'을 누르면 Preview 2분부터 함께 시작합니다.</p><p><b>시작 전에는 시간이 흐르지 않습니다.</b> 문제와 활동지는 시작한 뒤 표시됩니다.</p></section>';return;
    }
    $('#left').hidden=false;
    originalStudentRender.call(this);
    var self=this;
    if(self.view===5 && $('#post-comparison')){
      var key='pq4r:reflection:'+self.me.session.code+':'+self.me.student.code,draft=store(key)||{};
      if(draft.comparison)$('#post-comparison').value=draft.comparison;
      var radio=$('input[name="post-understanding"][value="'+(draft.understanding||'none')+'"]');if(radio)radio.checked=true;
      var autoReflection=function(){var checked=$('input[name="post-understanding"]:checked'),value={understanding:checked?checked.value:'',comparison:$('#post-comparison').value};store(key,value);clearTimeout(self.saveTimers.reflection);self.saveTimers.reflection=setTimeout(function(){api('POST','me/reflection-draft',value).catch(function(){/* 미저장 내용은 이 기기에 보관 */});},300);};
      $('#post-comparison').oninput=autoReflection;$$('input[name="post-understanding"]').forEach(function(r){r.onchange=autoReflection;});
    }
    if(m==='waiting'||m==='paused'){$$('#right input, #right textarea, #right button').forEach(function(n){n.disabled=true;});$('#right').insertAdjacentHTML('afterbegin','<p class="notice-bar">'+(m==='waiting'?(self.settings().demoSession?'새 시연은 Preview 2분에서 준비되었습니다. 교사가 시연 시작을 누르면 작성과 타이머가 함께 시작됩니다.':'선생님이 수업을 시작하면 작성할 수 있습니다.'):'수업이 일시정지되었습니다. 다시 시작할 때까지 기다려 주세요.')+'</p>');}
    if(self.view===5&&self.stageIdx()===5){
      var confidence=$('#right [data-fieldwrap$=":pre_confidence"]');
      if(confidence){
        var bottom=document.createElement('section');bottom.className='panel review-confidence-bottom';
        bottom.innerHTML='<h3>정답 공개 전, 내 판단의 확신도</h3><p class="hint small">답과 풀이를 적은 뒤 마지막으로 표시하세요. 별도 질문이나 AI 발문은 필요하지 않습니다.</p>';
        bottom.appendChild(confidence);var rvCard=$('#right article.item[data-item="L'+self.lesson()+'RV01"]');if(rvCard)rvCard.after(bottom);else $('#right').appendChild(bottom);
      }
    }
    if(self.view===2&&self.stageIdx()===2&&self.settings().videoUrl){self.renderReadVideo();}
    if(self.settings().autoTimer)$('#right').insertAdjacentHTML('afterbegin','<p class="notice-bar" role="note">다 쓰지 않아도 시간이 끝나면 자동 이동합니다. 작성 내용은 자동 저장되며, 마지막에 보완 5분을 제공합니다.</p>');
  };
  var originalEditable=Student.editable;
  Student.editable=function(){var m=clockMode(this.me.session);return (m==='legacy'||m==='running')&&originalEditable.call(this);};
  /* Read inline video: user click starts with sound. After ten seconds try sound-on autoplay; browsers can deny it. */
  Student.renderReadVideo=function(){
    var self=this,url=self.settings().videoUrl,u,host,segments,id,source='',type='';
    try{
      u=new URL(url,location.origin);host=u.hostname.toLowerCase();segments=u.pathname.split('/').filter(Boolean);
      if(['youtube.com','www.youtube.com','m.youtube.com','youtu.be','www.youtube-nocookie.com'].includes(host)){
        id=host==='youtu.be'?segments[0]:(u.searchParams.get('v')||segments[segments.length-1]);
        if(/^[a-zA-Z0-9_-]{11}$/.test(id)){source='https://www.youtube-nocookie.com/embed/'+id;type='youtube';}
      }else if(['vimeo.com','www.vimeo.com','player.vimeo.com'].includes(host)){
        id=segments[segments.length-1];
        if(/^\d+$/.test(id)){source='https://player.vimeo.com/video/'+id;type='vimeo';}
      }else if((u.protocol==='https:'||u.protocol==='http:')&&/\.(mp4|webm|ogv)$/i.test(u.pathname)){
        source=u.href;type='file';
      }
    }catch(e){}
    var root=document.createElement('section');root.className='panel read-video-panel';root.setAttribute('aria-label','Read 개념 강의 영상');
    root.innerHTML='<h2>개념 강의 영상</h2><p>아래 <b>소리 켜고 재생</b>을 눌러 시청하세요. 누르지 않으면 10초 뒤 소리와 함께 자동 재생을 시도합니다.</p>'+
      '<div class="read-video-frame" style="position:relative;max-width:100%;aspect-ratio:16/9;background:#111;border-radius:12px;overflow:hidden;display:flex;align-items:center;justify-content:center">'+
      '<div id="read-video-player" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center"></div></div>'+
      '<div class="row" style="margin-top:12px"><button type="button" class="btn primary" id="read-video-play">소리 켜고 재생</button><span id="read-video-status" role="status">10초 후 자동 재생 시도</span></div>'+
      '<p class="hint small">핵심 개념 메모는 선택입니다. 배운 내용 중 중요하다고 생각한 것을 내 말로 적어 보세요.</p>';
    $('#right').insertAdjacentElement('afterbegin',root);
    var player=root.querySelector('#read-video-player'),btn=root.querySelector('#read-video-play'),status=root.querySelector('#read-video-status');
    if(!source){status.textContent='이 영상 주소는 사이트 안 재생을 지원하지 않습니다. 링크를 확인해 주세요.';btn.disabled=true;return;}
    self.logEvent('VIDEO_OPEN',null,{material:'READ_VIDEO'});
    var started=false;
    function play(fromUser){
      if(!document.contains(root)||clockMode(self.me.session)!=='running'||started)return;
      if(type==='file'){
        var v=player.querySelector('video');
        if(!v){v=document.createElement('video');v.src=source;v.controls=true;v.playsInline=true;v.preload='metadata';v.style.cssText='width:100%;height:100%';player.appendChild(v);}
        v.muted=false;v.volume=1;
        var promise=v.play();
        if(promise&&promise.then)promise.then(function(){started=true;status.textContent='음성 재생 중';self.logEvent('VIDEO_PLAY',null,{material:'READ_VIDEO',audio:true});}).catch(function(){status.textContent='브라우저가 자동 재생을 차단했습니다. 소리 켜고 재생을 눌러 주세요.';});
      }else{
        var sep=source.indexOf('?')>=0?'&':'?';
        var opts=type==='youtube'?'autoplay=1&mute=0&playsinline=1':'autoplay=1&muted=0';
        var frame=document.createElement('iframe');frame.src=source+sep+opts;frame.title='Read 개념 강의 영상';frame.allow='autoplay; encrypted-media; fullscreen; picture-in-picture';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';frame.style.cssText='width:100%;height:100%;border:0';
        player.replaceChildren(frame);started=true;status.textContent=fromUser?'음성 재생을 요청했습니다.':'자동 재생을 시도했습니다. 소리가 나오지 않으면 영상 안의 재생 버튼을 눌러 주세요.';
        self.logEvent('VIDEO_PLAY',null,{material:'READ_VIDEO',audio_requested:true,user_initiated:!!fromUser});
      }
    }
    btn.onclick=function(){play(true);};
    setTimeout(function(){if(!started&&document.contains(root))play(false);},10000);
  };
  Student.openVideo=function(){
    var self=this,url=self.settings().videoUrl;if(!url)return;
    var prior=$('#video-dialog');if(prior)prior.remove();
    var d=document.createElement('dialog');d.id='video-dialog';d.className='video-dialog';
    d.innerHTML='<div class="row"><h2>Read 개념영상</h2><button class="btn sm" id="video-close">닫기</button></div><p>재생 버튼을 눌러 개념 강의를 시청하세요. Read 타이머는 계속 진행됩니다.</p><div id="video-player"><button class="btn primary" id="video-play">영상 재생하기</button></div><p><a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">영상이 안 보이면 새 창에서 열기</a></p>';
    document.body.appendChild(d);d.showModal();self.logEvent('VIDEO_OPEN',null,{material:'READ_VIDEO'});
    function close(){self.logEvent('VIDEO_CLOSE',null,{material:'READ_VIDEO'});d.close();d.remove();}
    $('#video-close').onclick=close;d.addEventListener('cancel',function(ev){ev.preventDefault();close();});
    $('#video-play').onclick=function(){var u=new URL(url),embed='';
      if(['youtube.com','www.youtube.com','m.youtube.com','youtu.be','www.youtube-nocookie.com'].includes(u.hostname)) {var id=u.hostname==='youtu.be'?u.pathname.slice(1):u.searchParams.get('v')||u.pathname.split('/').filter(Boolean).pop();if(/^[\w-]{11}$/.test(id))embed='https://www.youtube-nocookie.com/embed/'+id+'?autoplay=1';}
      if(['vimeo.com','www.vimeo.com','player.vimeo.com'].includes(u.hostname)){var vid=u.pathname.split('/').filter(Boolean).pop();if(/^\d+$/.test(vid))embed='https://player.vimeo.com/video/'+vid+'?autoplay=1';}
      var player=$('#video-player');if(embed)player.innerHTML='<iframe src="'+esc(embed)+'" title="개념 강의 영상" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
      else if(/\.(mp4|webm|ogv)$/i.test(u.pathname))player.innerHTML='<video src="'+esc(url)+'" controls autoplay playsinline></video>';
      else player.innerHTML='<p>이 주소는 사이트 안 재생을 지원하지 않습니다. 아래 링크를 눌러 새 창에서 시청하세요.</p>';
      self.logEvent('VIDEO_PLAY',null,{material:'READ_VIDEO'});
    };
  };
  Student.renderSupplements=function(){
    var self=this,mode=clockMode(self.me.session);var d=$('#video-dialog');if(d)d.remove();
    $('#left').hidden=false;$('#left').innerHTML=mode==='finished'?'<section class="panel"><h2>수업 완료</h2><p>정답·해설과 나의 성찰은 오른쪽에서 계속 확인할 수 있습니다.</p><p>수업 시간에 제출한 답안과 보완본은 그대로 보관됩니다.</p></section>':'<section class="panel"><h2>보완 5분</h2><p>시간 안에 마치지 못한 문항을 보완하세요. 원래 답안은 그대로 보관됩니다.</p><p>정답·해설은 오른쪽 위에서 다시 볼 수 있습니다. 이 시간에는 AI와 교사의 추가 발문이 제공되지 않습니다.</p></section>';$('#layout').classList.remove('noleft');
    if(mode==='finished'){
      var btn=document.createElement('button');btn.className='btn primary';btn.textContent='나의 단계별 학습 기록 Word 다운로드';btn.id='my-record-download';
      $('#left').appendChild(btn);btn.onclick=function(){downloadRecord('me/my-record');};
    }
    $('#right').innerHTML='<p class="loading">보완할 문항을 불러오는 중…</p>';
    api('GET','me/supplements').then(function(r){if(App.screen!=='student'||!['catchup','finished'].includes(clockMode(self.me.session)))return;
      var disabled=mode==='finished'?' disabled':'';self.supplementLocal=store('pq4r:supplement:'+self.me.session.code+':'+self.me.student.code)||{};
      $('#right').innerHTML='<h1>'+(mode==='finished'?'수업 완료':'미완료 문항 보완')+'</h1><p class="notice-bar">'+(mode==='finished'?'보완 시간이 끝났습니다. 저장된 내용을 확인할 수 있습니다.':'5분이 끝나면 자동 종료됩니다. 보완 답안은 시간 내 답안과 별도 저장됩니다.')+'</p>'+r.items.map(function(x){var it=resolveItem(x.item_id,self.group(),self.settings()),original=x.original||{},values=self.supplementLocal[it.id]||x.saved&&x.saved.fields||self.pending[it.id]&&self.pending[it.id].draft||original.draft||{};return '<section class="panel supplement-item" data-supplement="'+it.id+'"><h2>'+esc(it.title)+'</h2>'+figHTML(it.fig)+choicesHTML(it.choices)+(it.fixedAI?'<p>'+fmt(it.fixedAI.text)+'</p>':'')+'<details><summary>시간 내 기록 보기</summary>'+fieldsView(it,original.draft||{},{})+'</details>'+it.fields.map(function(f){var v=values[f.key]||'';if(f.kind==='choice'||f.kind==='multi')return '<fieldset><legend>'+fmt(f.label)+'</legend>'+f.options.map(function(o){return '<label class="choice-line"><input data-sup-field="'+f.key+'" type="'+(f.kind==='multi'?'checkbox':'radio')+'" name="sup-'+it.id+'-'+f.key+'" value="'+esc(o.v)+'"'+((f.kind==='multi'?multiVals(v):[v]).includes(o.v)?' checked':'')+disabled+'><span>'+fmt(o.label)+'</span></label>';}).join('')+'</fieldset>';return '<label>'+fmt(f.label)+'<textarea data-sup-field="'+f.key+'" rows="2" maxlength="3000"'+disabled+'>'+esc(v)+'</textarea></label>';}).join('')+'<p class="hint small" data-sup-status="'+it.id+'">'+(x.saved?'서버에 저장된 보완본이 있습니다.':'')+'</p></section>';}).join('')+(!r.items.length?'<p>보완할 미완료 문항이 없습니다. 수고했어요.</p>':'');
      $('#right').insertAdjacentHTML('afterbegin','<section class="panel end-review" id="end-review"><h2>정답·해설 및 나의 성찰</h2><p>불러오는 중…</p></section>');self.loadCompletedReview();
      $$('.supplement-item').forEach(function(panel){panel.oninput=function(){var id=panel.getAttribute('data-supplement'),fields={};$$('[data-sup-field]',panel).forEach(function(n){var k=n.getAttribute('data-sup-field');if(n.type==='radio'){if(n.checked)fields[k]=n.value;}else if(n.type==='checkbox'){if(n.checked)fields[k]=(fields[k]?fields[k]+',':'')+n.value;}else fields[k]=n.value;});self.supplementLocal[id]=fields;store('pq4r:supplement:'+self.me.session.code+':'+self.me.student.code,self.supplementLocal);var status=$('[data-sup-status="'+id+'"]');status.textContent='이 기기에 보관 중 · 서버 저장 대기';clearTimeout(self.saveTimers['sup:'+id]);self.saveTimers['sup:'+id]=setTimeout(function(){self.flushSupplement(id);},300);};});
    }).catch(function(e){$('#right').innerHTML='<p class="warnline">'+esc(e.message)+'</p>';});
  };
  Student.loadCompletedReview=function(){
    var self=this,session=self.me.session.code,token=App.tok;
    return api('GET','me/review-feedback').then(function(data){
      if(App.screen!=='student'||App.tok!==token||self.me.session.code!==session||!['catchup','finished'].includes(clockMode(self.me.session)))return;
      var box=$('#end-review');if(!box)return;
      var names={explain:'다른 사람에게 설명할 수 있다',partial:'일부는 이해했지만 아직 어렵다',uncertain:'아직 이해하지 못했다'};
      var ref=data.reflection,draft=store('pq4r:reflection:'+session+':'+self.me.student.code);
      var own=ref||draft;
      box.innerHTML='<h2>정답·해설 다시 보기</h2><p>수업이 끝난 뒤에도 정답과 해설, 제출한 답안을 확인할 수 있습니다.</p><div class="completed-solutions">'+(data.solutions||[]).map(function(sol,i){
        var p=sol.problem||{},ans=(data.answers||[]).find(function(a){return a.item_id===sol.item_id;}),ri=ITEM[sol.item_id]?resolveItem(sol.item_id,self.group(),self.settings()):null;
        return '<details class="review-solution"'+(i===0?' open':'')+'><summary><b>'+esc(shortOf(sol.item_id))+'</b> · '+esc(sol.answer)+'</summary><div class="completed-solution-body">'+(ri&&paperAsset(ri,self.group())?paperProblem(ri,self.group()):'<h3>'+fmt(p.title||'')+'</h3>'+figHTML(p.fig)+choicesHTML(p.choices))+'<h3>정답과 해설</h3><p class="completed-answer">'+esc(sol.answer)+'</p><ol>'+(sol.steps||[]).map(function(t){return '<li>'+fmt(t)+'</li>';}).join('')+'<h3>해설 공개 전 나의 답안</h3>'+(ri&&ans?fieldsView(ri,ans.pre_response||{},{}) :'<p>제출 기록이 없습니다.</p>')+'</div></details>';
      }).join('')+'</div><section class="completed-reflection"><h2>나의 성찰</h2>'+(own?'<p class="hint">'+(ref?'서버에 저장된 성찰입니다.':'이 기기에 남아 있는 임시저장본입니다. 제출 완료 기록과 구분됩니다.')+'</p><p><b>이해 정도:</b> '+esc(names[own.understanding]||'선택 기록 없음')+'</p><p><b>새롭게 알게 된 점·어려운 점:</b> '+esc(own.comparison||'작성 기록 없음')+'</p>':'<p>저장된 성찰이 없습니다.</p>')+'</section>';
    }).catch(function(e){var box=$('#end-review');if(box&&App.tok===token&&self.me.session.code===session){box.innerHTML='<h2>정답·해설 다시 보기</h2><p class="warnline">'+esc(e.message)+'</p><button type="button" class="btn" id="retry-completed-review">다시 불러오기</button>';$('#retry-completed-review').onclick=function(){self.loadCompletedReview();};}});
  };
  Student.flushSupplement=function(id){
    var self=this;self.supplementFlights=self.supplementFlights||{};if(self.supplementFlights[id])return self.supplementFlights[id];
    var fields=self.supplementLocal[id];if(!fields)return Promise.resolve();
    var p=api('POST','me/supplement',{item_id:id,fields:fields}).then(function(x){var n=$('[data-sup-status="'+id+'"]');if(n)n.textContent='보완본 저장 '+kst(x.at);}).catch(function(e){var n=$('[data-sup-status="'+id+'"]');if(n)n.textContent='서버 저장 실패 · 이 기기에 보관됨: '+e.message;}).then(function(){delete self.supplementFlights[id];if(self.supplementLocal[id]!==fields)return self.flushSupplement(id);});self.supplementFlights[id]=p;return p;
  };
  var originalStudentPoll=Student.poll;
  Student.poll=function(){var self=this;return originalStudentPoll.call(self).then(function(){self.showNotice(self.me.notice);studentStatus();});};
  function studentStatus(){
    if(App.screen!=='student'||!Student.me)return;var self=Student,m=clockMode(self.me.session),requests=(self.me.requests||[]).filter(function(r){return stageIdxOf(r.stage)===self.stageIdx();}),bar=$('#student-status-bar');
    if(!bar){bar=document.createElement('div');bar.id='student-status-bar';bar.className='notice-bar';$('#layout').before(bar);}
    bar.textContent=m==='waiting'?'입장 완료 · 교사의 수업 시작을 기다리고 있습니다.':m==='paused'?'수업 일시정지 · 입력과 타이머가 멈춰 있습니다.':m==='finished'?'수업 완료':m==='catchup'?'보완 시간 · 시간 내 답안과 별도 저장합니다.':m==='reflection'?'성찰 작성 중 · 교사가 종료할 때까지 저장할 수 있습니다.':requests.length?'도움 요청 '+requests.length+'건 전달됨 · 교사 답변은 해당 문제 아래에 표시됩니다.':'수업 진행 중 · 답을 제출한 뒤 도움이 필요하면 해당 문제에서 도움을 요청하세요.';
  }
  Student.showNotice=function(n){if(!n||n.id===this.noticeId)return;this.noticeId=n.id;toast(n.text,'warn');var box=$('#student-notice');if(!box){box=document.createElement('div');box.id='student-notice';box.className='notice-bar';box.setAttribute('role','status');$('#app').prepend(box);}box.textContent=n.text;};
  var originalStudentStart=Student.start;
  Student.start=function(me){var self=this;self.pdfCache={};self.pdfLoading={};self.pdfPage={};if(me.session.status!=='open')return logout('이전 수업이 종료되었습니다. 수업 코드로 다시 입장해 주세요.');self.lastWarning='';self.nearEndFlush='';originalStudentStart.call(self,me);self.showNotice(me.notice);studentStatus();
    App.timers.push(setInterval(function(){if(App.screen==='student'&&clockMode(self.me.session)==='waiting'&&!self.waitingPoll){self.waitingPoll=true;self.poll().finally(function(){self.waitingPoll=false;});}},1000));
    App.timers.push(setInterval(function(){
    var s=self.me.session,c=s.clock||{},m=clockMode(s);if(m!=='running'&&m!=='catchup')return;var left=(Date.parse(c.deadline)-nowMs())/1000;
    var phase=m+':'+s.stage+':'+c.deadline;
     if(m==='running')countdownNotice(self,s);
    if(left<=2&&self.nearEndFlush!==phase){self.nearEndFlush=phase;Object.keys(self.pending).forEach(function(id){self.flushDraft(id);});}
    if(left<=0&&!self.clockPolling){self.clockPolling=true;self.poll().finally(function(){self.clockPolling=false;});}
  },500));};


  /* 현장 운영용 단순 화면. 내부 데이터베이스 반 구분은 유지하지만 사용자는 두 수업 코드만 선택한다. */
  Researcher.renderClassesLegacy=Researcher.renderClasses;
  Researcher.renderClasses=function(){
    var self=this,body=$('#rbody');if(!body)return;
    $$('.rtab').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-tab')==='classes');});
    var step=$('#stepper');if(step)step.innerHTML='';
    var badge=$('#r-sess');if(badge)badge.textContent='수업 준비';
    body.innerHTML='<p class="loading">A01, T01 수업 코드와 학생 명단 확인 중…</p>';
    Promise.all([api('GET','admin/classes'),api('GET','admin/students'),api('GET','admin/lesson-assets')]).then(function(all){
      if(App.screen!=='researcher'||self.tab!=='classes')return;
      var cs=all[0].classes||[],students=all[1].students||[],assets=all[2].files||[];
      var settings=[{code:'A01',prefix:'A'},{code:'T01',prefix:'T'}];
      var cards=settings.map(function(g){
        var expected=Array.from({length:30},function(_,i){return g.prefix+String(i+1).padStart(2,'0');});
        var enrolled=students.filter(function(p){return expected.indexOf(p.code)>=0&&p.class_name===g.code&&p.active;});
        var known=cs.some(function(x){return x.code===g.code;});
        var running=self.sessions.filter(function(x){return x.class_name===g.code&&x.status==='open'&&clockMode(x)!=='finished';})[0];
        var latest=self.sessions.filter(function(x){return x.class_name===g.code;})[0]||null;
        var ready=known&&enrolled.length===30;
        return '<article class="rcard fixed-class-card"><div class="fixed-class-head"><div><span class="fixed-code">'+g.code+'</span><h2>'+g.code+' 수업</h2></div><span class="pill '+(ready?'ok':'warn')+'">'+enrolled.length+' / 30명 등록</span></div>'+
          '<p>학생 코드 <b>'+g.prefix+'01 ~ '+g.prefix+'30</b> · 공통 PIN <b>1111</b> · 교사 ID <b>T01</b></p>'+
          '<p class="hint">학생 입장 시 수업 코드: <strong>'+g.code+'</strong> (매 차시 동일)</p>'+
          '<div class="fixed-class-actions"><label>차시 선택<select data-fixed-lesson="'+g.code+'">'+Object.keys(C.lessons).map(function(n){return '<option value="'+n+'">'+esc(lessonLabel(+n))+'</option>';}).join('')+'</select></label>'+
          '<button class="btn primary" data-fixed-run="'+g.code+'"'+(!ready?' disabled':'')+'>새 본수업 준비</button>'+
          '<button class="btn" data-fixed-demo="'+g.code+'"'+(!ready?' disabled':'')+'>새 시험 수업 준비</button>'+
          (running?'<button class="btn" data-fixed-open="'+esc(running.code)+'">현재 수업 운영</button><button class="btn primary" data-share-student="'+esc(g.code)+'" data-share-session="'+esc(running.code)+'">학생용 링크 복사</button><button class="btn" data-share-teacher="'+esc(g.code)+'" data-share-session="'+esc(running.code)+'">교사용 링크 복사</button>':latest?'<span class="hint small">마지막 수업: '+(latest.settings&&latest.settings.demoSession?'시험':'본수업')+'</span>':'')+
          '</div><details class="fixed-video-options"><summary>Read 단계 개념영상 설정 (선택)</summary><label>영상 링크<input type="url" data-fixed-video="'+g.code+'" placeholder="https://..."></label></details>'+
          '<p class="hint small">새 수업을 준비하면 학생 코드는 유지되고 답안 및 로그는 새로운 실행 기록으로 저장됩니다.</p></article>';
      }).join('');
      body.innerHTML='<div class="fixed-setup"><h1>수업 준비</h1>'+
        '<p>학생은 수업 코드, 학생 코드, PIN만 입력합니다. 내부 등록 작업은 여기서 한 번만 진행합니다.</p>'+
        '<section class="rcard fixed-setup-head"><div><h2>학생 60명 코드 설정</h2><p>수업 코드 A01과 T01 · 학생 A01 ~ A30, T01 ~ T30 · 교사 ID T01 · 공통 PIN 1111</p></div>'+
        '<button class="btn primary" id="fixed-setup-submit">학생 60명 등록 또는 확인</button></section>'+
        '<p class="hint">이전 수업에 연결된 학생도 지정한 코드로 재배정합니다. 이전 시험 기록은 보존하며 새 수업 기록과 분리합니다. 공통 PIN은 분실 시 구분이 어려우므로 실제 연구에서는 보안에 주의하세요.</p>'+
        '<div class="fixed-class-grid">'+cards+'</div>'+
        '<section class="rcard" id="lesson-pdf-manager"><h2>활동지 · 정답지 · 성찰지 PDF 등록</h2>'+
        '<p>압축파일 ZIP 1개를 그대로 선택하거나, 압축을 푼 PDF 14개를 한 번에 선택하면 차시와 종류를 자동 판별합니다. 공통 성찰지는 1~8차시에 한 번에 연결합니다.</p>'+
        '<label class="pdf-upload-drop">ZIP 1개 또는 PDF 14개 선택<input id="lesson-pdf-upload" type="file" multiple accept=".zip,.pdf,application/pdf,application/zip"></label>'+
        '<div id="pdf-upload-progress" role="status" aria-live="polite">'+esc(self.assetUploadStatus||'')+'</div>'+
        '<div class="lesson-pdf-status">'+Array.from({length:8},function(_,i){var n=i+1;return '<div class="pdf-status-row"><strong>'+n+'차시</strong> '+
          ['worksheet','answer','reflection'].map(function(kind){var found=assets.some(function(x){return x.lesson===n&&x.kind===kind;});
           var builtin=(((n===1||n===2)&&kind==='worksheet')||(n===2&&kind==='answer'));
           return '<span class="pill '+(found||builtin?'ok':'warn')+'">'+({worksheet:'활동지',answer:'정답지',reflection:'성찰지'}[kind])+' '+(found?'등록':builtin?'웹앱 내장':'미등록')+'</span>';
          }).join(' ')+'</div>';}).join('')+'</div>'+
        '<p class="hint small">1~2차시는 기존 온라인 활동지를 사용하며, 2차시 정답은 웹앱의 기존 해설을 유지합니다. 미등록 PDF는 화면에 원본으로 표시되지 않습니다. PDF 등록 전에는 해당 차시 본수업을 시작할 수 없습니다.</p></section>'+
        '<section class="rcard"><h3>시험 수업과 실제 수업</h3><p>같은 학생 코드와 PIN을 계속 사용합니다. 다만 시험은 “새 시험 수업 준비”, 본실험은 “새 본수업 준비”로 시작해야 이전 기록과 섞이지 않습니다.</p>'+
        '<p class="hint">실제 수업이 진행 중이면 새 수업을 만들지 말고 “현재 수업 운영”을 선택하세요. 기존 기록을 삭제하거나 초기화하지 않습니다.</p></section></div>';
      // ZIP 1개 선택으로 PDF 원본 14개를 개별 업로드. 브라우저에서 압축 해제하여 서버 ZIP 업로드 제한 회피.
      async function pdfsFromZip(file){
        if(!('DecompressionStream' in window))throw Error('이 브라우저는 ZIP 자동 압축 해제를 지원하지 않습니다. Chrome 최신 버전에서 시도하세요.');
        var bin=await file.arrayBuffer(),v=new DataView(bin),last=bin.byteLength-22,found=-1;
        for(var pos=last;pos>=Math.max(0,last-65535);pos--)if(v.getUint32(pos,true)===0x06054b50){found=pos;break;}
        if(found<0)throw Error('ZIP 중앙 디렉터리를 찾지 못했습니다.');
        var count=v.getUint16(found+10,true),ptr=v.getUint32(found+16,true),files=[];
        if(count>100||ptr>=bin.byteLength)throw Error('압축파일 구조가 올바르지 않습니다.');
        for(var k=0;k<count;k++){
          if(v.getUint32(ptr,true)!==0x02014b50)throw Error('ZIP 파일 목록이 손상되었습니다.');
          var method=v.getUint16(ptr+10,true),size=v.getUint32(ptr+20,true),nameLen=v.getUint16(ptr+28,true),
              extraLen=v.getUint16(ptr+30,true),commentLen=v.getUint16(ptr+32,true),loc=v.getUint32(ptr+42,true);
          var name=new TextDecoder('utf-8').decode(new Uint8Array(bin,ptr+46,nameLen)).split('/').pop();
          ptr+=46+nameLen+extraLen+commentLen;
          if(!name||!/\.pdf$/i.test(name))continue;
          if(!size||size>2000000||loc+30>bin.byteLength||v.getUint32(loc,true)!==0x04034b50)throw Error('ZIP 내부 PDF의 크기나 헤더가 잘못됐습니다: '+name);
          var dataStart=loc+30+v.getUint16(loc+26,true)+v.getUint16(loc+28,true);
          if(dataStart+size>bin.byteLength)throw Error('ZIP PDF 압축 데이터가 손상됐습니다: '+name);
          var body=new Uint8Array(bin.slice(dataStart,dataStart+size)),bytes;
          if(method===0)bytes=body;
          else if(method===8){
            try{bytes=new Uint8Array(await new Response(new Blob([body]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());}
            catch(e){throw Error('압축 해제 실패 ('+name+'): '+e.message);}
          }else throw Error('지원하지 않는 ZIP 압축 방식: '+method);
          if(bytes.length>1550000||new TextDecoder('ascii').decode(bytes.slice(0,5))!=='%PDF-')throw Error('PDF 원본 또는 파일 크기를 확인하세요: '+name);
          files.push(new File([bytes],name,{type:'application/pdf'}));
        }
        if(!files.length)throw Error('ZIP 안에서 PDF 파일을 찾지 못했습니다.');
        return files;
      }
      $('#lesson-pdf-upload').onchange=async function(){
        var fileList=Array.from(this.files||[]),status=$('#pdf-upload-progress');
        if(!fileList.length)return;
        if(fileList.some(function(f){return /.zip$/i.test(f.name);})){
          if(fileList.length!==1){status.textContent='ZIP 파일은 하나씩 선택해 주세요.';return;}
          try{status.textContent='ZIP 압축 해제 중…';fileList=await pdfsFromZip(fileList[0]);}
          catch(e){status.textContent='ZIP 압축 해제 실패: '+e.message;return;}
        }
        var jobs=[],errors=[];
        fileList.forEach(function(file){
          if(!/\.pdf$/i.test(file.name)){errors.push(file.name+': PDF 형식이 아닙니다.');return;}
          var kind=/성찰/.test(file.name)?'reflection':/정답|해설/.test(file.name)?'answer':'worksheet';
          var m=/([1-8])차시/.exec(file.name),lessons=kind==='reflection'?[1,2,3,4,5,6,7,8]:m?[Number(m[1])]:[];
          if(!lessons.length){errors.push(file.name+': 차시 번호를 찾을 수 없습니다.');return;}
          if(file.size>1550000){errors.push(file.name+': 1.55MB를 초과합니다. PDF를 더 작게 저장하세요.');return;}
          lessons.forEach(function(lesson){jobs.push({file,lesson,kind});});
        });
        if(!jobs.length){status.textContent=errors.join(' / ')||'등록할 파일이 없습니다.';return;}
        if(!confirm('활동지와 정답지 원본 '+fileList.length+'개를 등록할까요? 같은 차시의 이전 파일은 새 파일로 바뀌고 변경 기록이 남습니다.'))return;
        this.disabled=true;
        var done=0,cache=new Map(),ok=0;
        try{
          for(const job of jobs){
            status.textContent='업로드 중 '+(done+1)+'/'+jobs.length+': '+job.lesson+'차시 '+({worksheet:'활동지',answer:'정답지',reflection:'성찰지'}[job.kind]);
            try{
              var base64=cache.get(job.file);
              if(!base64){
                base64=await new Promise(function(resolve,reject){var reader=new FileReader();reader.onload=function(){resolve(String(reader.result).split(',')[1]||'');};reader.onerror=function(){reject(new Error('파일을 읽지 못했습니다.'));};reader.readAsDataURL(job.file);});
                cache.set(job.file,base64);
              }
              await api('POST','admin/lesson-asset',{lesson:job.lesson,kind:job.kind,filename:job.file.name,data_base64:base64});
              ok++;
            }catch(e){errors.push(job.lesson+'차시 '+job.kind+': '+e.message);}
            done++;
          }
          self.assetUploadStatus='등록 성공 '+ok+'/'+jobs.length+(errors.length?' · 오류: '+errors.join(' / '):' · 모든 등록 완료');
          await self.renderClasses();
          toast(errors.length?'일부 자료에 오류가 있습니다. PDF 상태를 확인하세요.':'원본 PDF 등록을 완료했습니다.',errors.length?'warn':'ok');
        }finally{this.disabled=false;}
      };
      $('#fixed-setup-submit').onclick=function(){
        if(!confirm('학생 60명의 코드를 A01~A30, T01~T30으로 등록하고, 교사 ID는 T01, 기존 해당 학생의 PIN도 모두 1111로 맞추시겠습니까? 기존 답안 기록은 삭제하지 않습니다.'))return;
        var b=this;b.disabled=true;b.textContent='등록 중…';
        api('POST','admin/fixed-codes',{}).then(function(r){
          toast('등록 완료: 새 학생 '+r.created+'명, 기존 학생 재배정 '+r.reassigned+'명, 기타 업데이트 '+r.updated+'명, 유지 '+r.unchanged+'명.');
          return self.loadSessions().then(function(){return self.renderClasses();});
        }).catch(function(e){toast(e.message,'warn');b.disabled=false;b.textContent='학생 60명 등록 또는 확인';});
      };
      $$('[data-fixed-open]').forEach(function(b){b.onclick=function(){Teacher.start(b.getAttribute('data-fixed-open'));};});
      $$('[data-share-student],[data-share-teacher]').forEach(function(b){b.onclick=function(){
        copyShareLink(b.hasAttribute('data-share-teacher')?'teacher':'student',
          b.getAttribute('data-share-student')||b.getAttribute('data-share-teacher'),b.getAttribute('data-share-session'));
      };});
      $$('[data-fixed-run], [data-fixed-demo]').forEach(function(b){b.onclick=function(){
        var code=b.getAttribute('data-fixed-run')||b.getAttribute('data-fixed-demo'),demo=b.hasAttribute('data-fixed-demo'),
            current=self.sessions.filter(function(x){return x.class_name===code&&x.status==='open'&&clockMode(x)!=='finished';})[0],
            lesson=Number($('[data-fixed-lesson="'+code+'"]').value);
        if(current&&!confirm('이전 수업의 기록을 보존하고 새 '+(demo?'시험':'본')+'수업을 준비할까요? 이전 수업을 계속할 경우 “현재 수업 운영”을 선택해야 합니다.'))return;
        b.disabled=true;
        api('POST',demo?'staff/new-demo':'staff/new-lesson',{class_code:code,lesson:lesson,videoUrl:($('[data-fixed-video="'+code+'"]')||{}).value||'',replace_session:current?current.code:null})
          .then(function(r){return self.loadSessions().then(function(){Teacher.start(r.session.code);});})
          .catch(function(e){toast(e.message,'warn');b.disabled=false;});
      };});
    }).catch(function(e){body.innerHTML='<p class="empty">'+esc(e.message)+'</p>';});
  };


  /* 원본 PDF는 서버에 연구자가 등록한 후에만 학생에게 표시한다.
     활동지는 항상 읽기 전용, 정답은 Review 6분 후, 성찰지는 Review 10분 후 서버에서 개방. */
  Student.ensureLessonPdf=function(kind){
    var self=this,lesson=self.lesson(),cache=self.pdfCache||(self.pdfCache={}),loading=self.pdfLoading||(self.pdfLoading={});
    if(cache[kind]||loading[kind])return;
    loading[kind]=true;
    api('GET','me/lesson-asset?lesson='+lesson+'&kind='+kind).then(function(r){
      if(!self.me||self.lesson()!==lesson)return;
      var raw=atob(r.base64),data=new Uint8Array(raw.length);
      for(var i=0;i<raw.length;i++)data[i]=raw.charCodeAt(i);
      cache[kind]={url:URL.createObjectURL(new Blob([data],{type:'application/pdf'})),bytes:data,filename:r.filename,sha256:r.sha256};
    }).catch(function(e){if(self.me&&self.lesson()===lesson)cache[kind]={error:e.message};})
    .then(function(){loading[kind]=false;if(App.screen==='student'&&self.me&&self.lesson()===lesson&&self.me.session.status==='open')self.renderStage();});
  };
  Student.loadPdfRenderer=function(){
    if(window.pdfjsLib)return Promise.resolve(window.pdfjsLib);
    if(this.pdfRendererPromise)return this.pdfRendererPromise;
    this.pdfRendererPromise=new Promise(function(resolve,reject){
      var script=document.createElement('script');
      script.src='/vendor/pdf.min.js';
      script.onload=function(){if(!window.pdfjsLib){reject(new Error('PDF 렌더러 로드 실패'));return;}window.pdfjsLib.GlobalWorkerOptions.workerSrc='/vendor/pdf.worker.min.js';resolve(window.pdfjsLib);};
      script.onerror=function(){reject(new Error('PDF 렌더러 로드 실패'));};
      document.head.appendChild(script);
    }).catch(function(e){Student.pdfRendererPromise=null;throw e;});
    return this.pdfRendererPromise;
  };
  Student.renderPdfPage=function(kind,page,canvasId){
    var self=this,asset=self.pdfCache&&self.pdfCache[kind],canvas=$('#'+canvasId),hint=canvas&&canvas.closest('.student-pdf-panel').querySelector('[data-pdf-status]');
    if(!asset||!asset.url||!canvas)return;
    self.loadPdfRenderer().then(function(pdfjs){
      if(!asset.documentPromise)asset.documentPromise=pdfjs.getDocument({data:asset.bytes.slice(),disableWorker:true}).promise;
      return asset.documentPromise;
    }).then(function(doc){
      if(page<1||page>doc.numPages)throw new Error('PDF '+page+'쪽이 없습니다.');
      return doc.getPage(page);
    }).then(function(p){
      if(!canvas.isConnected)return;
      var viewport=p.getViewport({scale:1}),width=Math.max(320,Math.min(1100,canvas.parentElement.clientWidth||760)),scale=width/viewport.width;
      var draw=p.getViewport({scale:scale*1.6}),ctx=canvas.getContext('2d');
      canvas.width=Math.ceil(draw.width);canvas.height=Math.ceil(draw.height);canvas.style.width='100%';canvas.style.height='auto';
      return p.render({canvasContext:ctx,viewport:draw}).promise.then(function(){if(hint&&hint.isConnected)hint.textContent=page+'쪽 표시 중 · 화면에 맞게 확대됨';});
    }).catch(function(e){
      if(canvas&&canvas.isConnected){
        canvas.style.display='none';
        var fallback=document.createElement('iframe');fallback.title='원본 활동지 '+page+'쪽';fallback.src=asset.url+'#page='+page+'&toolbar=0&navpanes=0&view=FitH';fallback.className='student-pdf-embed';fallback.style.cssText='width:100%;height:850px;border:0;display:block;background:white';canvas.parentElement.insertBefore(fallback,canvas.nextSibling);
      }
      if(hint&&hint.isConnected)hint.textContent='PDF 그림을 웹 화면 안에서 표시합니다. 문제가 지속되면 교사에게 알려 주세요. ('+(e&&e.message||'렌더링 오류')+')';
    });
  };
  Student.pdfPanel=function(kind,pages,heading){
    var self=this,cache=self.pdfCache||{},asset=cache[kind],step=self.stageIdx(),k=kind+':'+step;
    var chosen=self.pdfPage&&self.pdfPage[k],page=pages.indexOf(chosen)>=0?chosen:pages[0];
    if(!asset)return '<section class="student-pdf-panel"><h3>'+esc(heading)+'</h3><p class="hint">원본 PDF 불러오는 중…</p></section>';
    if(asset.error)return '<section class="student-pdf-panel"><h3>'+esc(heading)+'</h3><p class="hint warn">원본 PDF가 아직 등록되지 않았습니다. 선생님께 알려 주세요.</p></section>';
    return '<section class="student-pdf-panel"><div class="student-pdf-head"><h3>'+esc(heading)+'</h3>'+
      '<a class="btn sm" href="'+asset.url+'#page='+page+'" target="_blank" rel="noopener">원본 크게 열기</a></div>'+
      (pages.length>1?'<nav class="student-pdf-nav" aria-label="활동지 쪽 선택">'+pages.map(function(n){
         return '<button type="button" class="btn sm'+(n===page?' primary':'')+'" data-pdf-page="'+n+'" data-pdf-kind="'+kind+'">'+n+'쪽</button>';
       }).join('')+'</nav>':'')+
      '<div class="student-pdf-paper"><canvas id="pdf-canvas-'+kind+'-'+page+'" data-pdf-canvas data-pdf-kind="'+kind+'" data-pdf-page-number="'+page+'" aria-label="'+esc(heading)+' '+page+'쪽"></canvas>'+
      '</div><p data-pdf-status class="hint small">선택한 '+page+'쪽을 크게 불러오는 중…</p></section>';
  };
  var beforePdfStage=Student.renderStage;
  Student.renderStage=function(){
    beforePdfStage.call(this);
    if(App.screen!=='student'||!this.me||!$('#right')||['waiting','catchup','finished'].includes(clockMode(this.me.session)))return;
    var self=this,lesson=self.lesson(),stage=self.stageIdx(),view=self.view;
    if(lesson>=3){
      self.ensureLessonPdf('worksheet');
      var pageMap={0:[1],1:[2],2:[3,4],3:[5,6,7],4:[8],5:[9]};
      var chosenPages=pageMap[view]||[1];
      var stageItems=C.items.filter(function(it){return it.lesson===lesson&&it.stage===C.stages[view].id&&!it.archived;});
      chosenPages.forEach(function(page,index){
        var item=stageItems[index]||stageItems[0],card=item&&$('#right article.item[data-item="'+item.id+'"]');
        var panel=self.pdfPanel('worksheet',[page],lesson+'차시 · '+C.stages[view].ko+' '+page+'쪽');
        if(card){var header=card.querySelector('.item-h');if(header)header.insertAdjacentHTML('afterend',panel);else card.insertAdjacentHTML('afterbegin',panel);}
        else $('#right').insertAdjacentHTML('beforeend',panel);
      });
    }
    if(stage===5&&view===5){
      var review=self.me.review||{};
      if(review.unlocked){
        self.ensureLessonPdf('answer');
        $('#right').insertAdjacentHTML('beforeend',self.pdfPanel('answer',lesson===1?[1,2,3,4,5]:[1,2,3,4,5,6],lesson+'차시 정답지 · Review 6분 후 공개'));
      }
    }
    if(stage===5&&view===5){
      var root=$('#right'),answerPane=root&&root.querySelector('.student-pdf-panel:has([data-pdf-kind="answer"])');
      var reflectionForm=root&&root.querySelector('.review-reflection');
      if(answerPane){
        var solutionRoot=root.querySelector('.review-answers');
        if(solutionRoot)solutionRoot.after(answerPane);
        else {var reviewCards=root.querySelectorAll('.review-solution');if(reviewCards.length)reviewCards[reviewCards.length-1].parentElement.after(answerPane);}
      }
      if(reflectionForm&&answerPane)answerPane.after(reflectionForm);
    }
    // Review 성찰은 단일 웹 입력폼만 사용한다. 과거 버전의 중복 PDF 패널이 있으면 제거한다.
    if(stage===5&&view===5){
      $$('.student-pdf-panel').forEach(function(panel){
        if(panel.querySelector('[data-pdf-kind="reflection"]')||/공통 성찰지/.test(panel.querySelector('h3')&&panel.querySelector('h3').textContent||''))panel.remove();
      });
    }
    if(lesson>=3&&view===stage&&self.editable()){
      var stageName=C.stages[view].id,stageCards=C.items.filter(function(it){return it.lesson===lesson&&it.stage===stageName&&!it.archived;});
      stageCards.forEach(function(it,index){
        var card=$('#right article.item[data-item="'+it.id+'"]'),fields=card&&card.querySelector('.fields');
        if(!fields)return;
        var sourceCard=stageName==='Recite'?$('#right article.item[data-item="'+stageCards[0].id+'"]'):card;
        var paper=sourceCard&&sourceCard.querySelector('.student-pdf-paper');
        if(!paper)return;
        var overlay=document.createElement('div');overlay.className='worksheet-input-overlay';
        if(stageName==='Recite'){
          overlay.classList.add('worksheet-recite-input');
          overlay.style.top=(stageCards.length===4?[30,46,62,79][index]:[32,54,77][index])+'%';
          overlay.style.height=(stageCards.length===4?13:17)+'%';
        }else{
          overlay.style.top=(stageName==='Read'?67:stageName==='Review'?72:stageName==='Reflect'?71:stageName==='Question'?46:stageName==='Preview'?70:70)+'%';
          overlay.style.height=(stageName==='Question'?38:stageName==='Preview'?24:25)+'%';
        }
        overlay.appendChild(fields);paper.appendChild(overlay);
      });
    }
    $$('[data-pdf-canvas]').forEach(function(canvas){
      var kind=canvas.getAttribute('data-pdf-kind'),page=Number(canvas.getAttribute('data-pdf-page-number')),key=kind+':'+stage,selected=self.pdfPage&&self.pdfPage[key];
      self.renderPdfPage(kind,kind==='worksheet'?page:(selected||page),canvas.id);
    });
    $$('[data-pdf-page]').forEach(function(b){b.onclick=function(){
      var kind=b.getAttribute('data-pdf-kind'),key=kind+':'+self.stageIdx();
      self.pdfPage=self.pdfPage||{};self.pdfPage[key]=Number(b.getAttribute('data-pdf-page'));
      self.renderStage();
    };});
  };
  function restoreStaff(a){
    App.tok=a.token;App.role=a.role;App.tid=a.tid||null;
    $('#app').innerHTML='<main class="loading">저장된 '+(a.role==='teacher'?'교사':'연구자')+' 로그인으로 연결 중…</main>';
    function enter(){if(a.role==='teacher')return Teacher.start(linkSession()||null);var screen=tabStore('pq4r:staff-screen');if(screen&&screen.screen==='teacher'&&screen.session)return Teacher.start(screen.session);return Researcher.start();}
    return api('POST','login/staff/refresh').then(function(r){saveAuth({token:r.token,role:r.role,tid:r.tid});return enter();}).catch(function(e){
      if(e.status===401||e.status===403){store(staffKey(a.role),null);return logout('저장된 로그인이 만료되거나 변경되었습니다. 한 번 다시 로그인해 주세요.');}
      $('#app').innerHTML='<main class="loading"><p>저장된 로그인은 유지되어 있습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.</p><button class="btn primary" id="staff-retry">자동로그인 다시 시도</button><button class="btn" id="staff-manual">직접 로그인</button></main>';
      $('#staff-retry').onclick=function(){restoreStaff(a);};$('#staff-manual').onclick=function(){renderEntry(a.role);};
    });
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
      return restoreStaff(a);
    }).catch(function () {
      $('#app').innerHTML = '<main class="loading">서버에 연결하지 못했어요. 잠시 뒤 새로고침해 주세요.</main>';
    });
  }
  window.addEventListener('hashchange',function(){if(C&&/^#login/.test(location.hash))renderEntry(location.hash==='#login-student'?'student':location.hash==='#login-teacher'?'teacher':undefined);});
  window.PQ_APP = App;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
