/* PQ4R 판정·수준 전환 엔진 (순수 함수)
 * 1층 규칙 판정 → 2층 AI 분류(선택, 앱에서 호출) → 3층 보류(의미 확인 + 사람 검토)
 * 수준 전환은 04 규칙을 따른다. AI는 수준을 정하지 않는다.
 * 문항 ID는 차시마다 다르다(L1…, L2…). 서버에서만 쓴다. */
(function (root) {
  'use strict';
  var C = root.PQ_CONTENT || (typeof require !== 'undefined' ? require('./content.js') : null);

  var STAGE = {};
  C.STAGES.forEach(function (s, i) { STAGE[s.id] = Object.assign({ index: i }, s); });
  var ITEM = {};
  C.ITEMS.forEach(function (it) { ITEM[it.id] = it; });

  /* ---------- 문항 해석(집단별) ---------- */
  function resolveItem(itemId, group, settings) {
    var it = ITEM[itemId];
    if (!it) return null;
    var g = (it.stage === 'Reflect' && it.byGroup && it.byGroup.EXPERIMENT) || (it.byGroup && it.byGroup[group]) || {};
    var fx = g.fixedAI ? C.FIXED_AI[g.fixedAI] : null;
    return {
      id: it.id, lesson: it.lesson, stage: it.stage, mark: it.mark, kind: it.kind, short: it.short, math: !!it.math, recall: it.recall || null,
      title: g.title || it.title, sub: g.sub || it.sub || null, hint: g.hint || it.hint || null,
      fig: it.fig ? C.FIGS[it.fig] : null, choices: it.choices || null,
      fixedAI: fx ? { id: g.fixedAI, text: fx.text, type: fx.type, ok: fx.ok, near: fx.near } : null,
      fields: g.fields || it.fields
    };
  }
  function itemsForStage(stageId, group, settings, lesson) {
    var L = Number(lesson) || 1;
    return C.ITEMS.filter(function (it) { return !it.archived && it.stage === stageId && it.lesson === L; }).map(function (it) { return resolveItem(it.id, group, settings); });
  }

  /* ---------- 텍스트 정규화 ---------- */
  function plain(s) { return String(s == null ? '' : s).replace(/\{([A-FO]{2})\}/g, '$1'); }
  function norm(s) {
    s = String(s == null ? '' : s);
    if (s.normalize) s = s.normalize('NFKC');
    s = s.replace(/̅/g, '')
      .replace(/[−–—]/g, '-').replace(/×/g, '*').replace(/÷/g, '/')
      .replace(/\/\//g, '∥').replace(/[“”"‘’']/g, '')
      .replace(/[a-wyz]/g, function (ch) { return ch.toUpperCase(); })
      .replace(/(\d)\s*(?:°|도(?![형]))/g, '$1')
      .replace(/(\d)\s*(?:cm2|cm|CM|센티미터|센티)/g, '$1')
      .replace(/°/g, '');
    return s;
  }
  function compact(s) { return norm(s).replace(/\s+/g, ''); }
  function isBlank(s) { return !String(s == null ? '' : s).trim(); }

  /* ---------- 수식 값 ---------- */
  function evalExpr(src) {
    var s = src.replace(/\s+/g, ''); var i = 0;
    function peek() { return s[i]; }
    function num() {
      var m = /^\d+(\.\d+)?/.exec(s.slice(i)); if (!m) throw 0; i += m[0].length; return parseFloat(m[0]);
    }
    function factor() {
      if (peek() === '(') { i++; var v = expr(); if (peek() !== ')') throw 0; i++; return v; }
      if (peek() === '-') { i++; return -factor(); }
      return num();
    }
    function term() { var v = factor(); while (peek() === '*' || peek() === '/') { var op = s[i++]; var r = factor(); v = op === '*' ? v * r : v / r; } return v; }
    function expr() { var v = term(); while (peek() === '+' || peek() === '-') { var op = s[i++]; var r = term(); v = op === '+' ? v + r : v - r; } return v; }
    var out = expr(); if (i !== s.length) throw 0; return out;
  }
  function numVal(raw) {
    if (isBlank(raw)) return null;
    var s = compact(raw);
    if (s.indexOf('=') >= 0) s = s.slice(s.lastIndexOf('=') + 1);
    s = s.replace(/^∠?[A-F]/, '');
    if (/^[0-9+\-*/().]+$/.test(s)) { try { var v = evalExpr(s); return isFinite(v) ? Math.round(v * 1000) / 1000 : null; } catch (e) { /* fallthrough */ } }
    var nums = compact(raw).match(/\d+(\.\d+)?/g);
    if (nums && nums.length === 1) return parseFloat(nums[0]);
    if (nums && nums.length > 1) return parseFloat(nums[nums.length - 1]);
    return null;
  }

  /* ---------- 등식 쌍 ---------- */
  function canonTerm(t) {
    if (/^\d/.test(t)) return { kind: 'num', v: parseFloat(t) };
    var ang = /^∠([A-F])$/.exec(t) || /^([A-D])$/.exec(t) || /^∠([A-FO]{3})$/.exec(t);
    if (ang) { var a = ang[1]; if (a.length === 3) a = a[1]; return { kind: 'ang', v: a }; }
    if (/^[A-FO]{2}$/.test(t)) return { kind: 'seg', v: t.split('').sort().join('') };
    return null;
  }
  function eqInfo(text) {
    var s = norm(text).replace(/\s+/g, ' ');
    var out = { pairs: {}, values: [] };
    var re = /(?:∠[A-FO]{1,3}|[A-FO]{1,2}|\d+(?:\.\d+)?)(?:\s*=\s*(?:∠[A-FO]{1,3}|[A-FO]{1,2}|\d+(?:\.\d+)?))+/g;
    var m;
    while ((m = re.exec(s))) {
      var parts = m[0].split('=').map(function (p) { return canonTerm(p.trim()); }).filter(Boolean);
      for (var a = 0; a < parts.length; a++) {
        for (var b = a + 1; b < parts.length; b++) {
          var x = parts[a], y = parts[b];
          if (x.kind !== 'num' && y.kind !== 'num' && x.kind === y.kind) out.pairs[x.kind + ':' + [x.v, y.v].sort().join('|')] = true;
          if (x.kind !== 'num' && y.kind === 'num') out.values.push({ t: x.kind + ':' + x.v, v: y.v });
          if (y.kind !== 'num' && x.kind === 'num') out.values.push({ t: y.kind + ':' + y.v, v: x.v });
        }
      }
    }
    var sum = /∠?([A-D])\s*\+\s*∠?([A-D])\s*=\s*180/g;
    while ((m = sum.exec(s))) out.pairs['sum:' + [m[1], m[2]].sort().join('|')] = true;
    return out;
  }
  function hasPair(info, kind, a, b) { return !!info.pairs[kind + ':' + [a, b].sort().join('|')]; }

  /* ---------- 평행사변형 성질 탐지(2차시) ---------- */
  var NEG = /(같지않|같지는않|다르|다름|아니|아닌|틀|않다|않아|않음)/;
  function clauses(c) {
    return c.replace(/(같고|같으며|같다|같아|같음|같습니다|이고|이며|하고|하며|이다|이야|입니다|이에요|예요|그리고|또한)/g, '$1|')
      .split(/[|.,;!?\n·]/).filter(function (x) { return x.length > 0; });
  }
  function detect(text, extra) {
    var c = compact(text);
    var info = eqInfo(text);
    var P = { P_OPP_SIDES: false, P_OPP_ANGLES: false, P_ADJ_180: false, P_DIAG_BISECT: false, P_PARALLEL: false,
      BISECT_ONE: false, BISECT_VAGUE: false, M_DIAG_EQUAL: false, M_ALL_SIDES_EQUAL: false, M_ALL_ANGLES_EQUAL: false, M_ADJ_EQUAL: false,
      mentionSide: false, mentionAngle: false, mentionDiag: false, eq: info };
    clauses(c).forEach(function (cl) {
      var noShape = cl.replace(/(대각선|사각형|삼각형|각각|직각삼각형|평행사변형)/g, '#');
      var hasOpp = /(마주보|맞은편|마주한|마주하|건너편|대변|대각(?!선))/.test(cl);
      var hasSide = /변/.test(cl.replace(/평행사변형/g, '#'));
      var hasAngle = /각/.test(noShape) || /∠/.test(cl) || /(^|[^A-FO])[A-D](?![A-FO])/.test(cl);
      var hasDiag = /대각선/.test(cl);
      var neg = NEG.test(cl);
      var eqw = /(같|동일|일치|똑같)/.test(cl) && !neg;
      var has180 = /180/.test(cl);
      var adjw = /(이웃|인접|옆|붙어|연속|양옆|나란히있는)/.test(cl);
      var sumw = /(합|더하|더한|180-|180에서)/.test(cl);
      var bis = /(이등분|반으로|절반|반씩|반반|중점|반띵|똑같이나|반이)/.test(cl);
      var mutual = /(서로|각각|두대각선모두|둘다|모두)/.test(cl);
      if (hasSide) P.mentionSide = true;
      if (hasAngle) P.mentionAngle = true;
      if (hasDiag) P.mentionDiag = true;
      if (hasOpp && hasSide && !hasDiag && !neg && !sumw && (eqw || /길이/.test(cl) || /=/.test(cl))) P.P_OPP_SIDES = true;
      if (hasOpp && hasAngle && !neg && !sumw) P.P_OPP_ANGLES = true;
      if (has180 && (adjw || sumw)) P.P_ADJ_180 = true;
      if (bis && !neg) {
        if (/서로(를|가)?이등분|서로다른것을(이등분|반으로)|서로를반으로/.test(cl) || (hasDiag && mutual)) P.P_DIAG_BISECT = true;
        else if (/(AC|CA|BD|DB)[^|]{0,8}(O|교점)/.test(cl) || /(O|교점)[^|]{0,8}(AC|BD)/.test(cl)) P.BISECT_ONE = true;
        else if (hasDiag) P.BISECT_VAGUE = true;
      }
      if (hasDiag && eqw && !bis && (/(길이|두대각선|대각선끼리|대각선은같|대각선이같)/.test(cl))) P.M_DIAG_EQUAL = true;
      if (/(네변|4변|모든변|변이모두|변은모두|변의길이가모두|변이다|변의길이가다|네개의변)/.test(cl) && eqw) P.M_ALL_SIDES_EQUAL = true;
      if (/(네각|4각|모든각|각이모두|각은모두|각의크기가모두|각이다|각의크기가다|네개의각)/.test(cl) && eqw) P.M_ALL_ANGLES_EQUAL = true;
      if (/(모두|다|전부|네각)[^|]{0,4}(90|직각)/.test(cl)) P.M_ALL_ANGLES_EQUAL = true;
      if (adjw && hasAngle && eqw && !sumw && !has180) P.M_ADJ_EQUAL = true;
      if (/(평행|∥)/.test(cl) && !neg) P.P_PARALLEL = true;
    });
    if (hasPair(info, 'seg', 'AB', 'CD') || hasPair(info, 'seg', 'BC', 'AD')) P.P_OPP_SIDES = true;
    if (hasPair(info, 'ang', 'A', 'C') || hasPair(info, 'ang', 'B', 'D')) P.P_OPP_ANGLES = true;
    ['A|B', 'B|C', 'C|D', 'A|D'].forEach(function (k) {
      if (info.pairs['sum:' + k]) P.P_ADJ_180 = true;
      if (info.pairs['ang:' + k]) P.M_ADJ_EQUAL = true;
    });
    var bAC = hasPair(info, 'seg', 'AO', 'CO'), bBD = hasPair(info, 'seg', 'BO', 'DO');
    if (bAC && bBD) P.P_DIAG_BISECT = true; else if (bAC || bBD) P.BISECT_ONE = true;
    if (hasPair(info, 'seg', 'AC', 'BD')) P.M_DIAG_EQUAL = true;
    if (/(180-|180−)/.test(c)) P.P_ADJ_180 = true;
    if (extra && extra.length) {
      var sel = {}; extra.forEach(function (e) { sel[e] = true; });
      var eqw2 = /(같|동일)/.test(c) && !NEG.test(c);
      if (eqw2 && ((sel['half:AO'] && sel['half:OC']) || (sel['half:BO'] && sel['half:OD']))) {
        if ((sel['half:AO'] && sel['half:OC']) && (sel['half:BO'] && sel['half:OD'])) P.P_DIAG_BISECT = true; else P.BISECT_ONE = true;
      }
      if (eqw2 && sel['diag:AC'] && sel['diag:BD'] && !/(이등분|반)/.test(c)) P.M_DIAG_EQUAL = true;
      if (eqw2 && ((sel['side:AB'] && sel['side:CD']) || (sel['side:BC'] && sel['side:DA']))) P.P_OPP_SIDES = true;
      if (eqw2 && ((sel['ang:A'] && sel['ang:C']) || (sel['ang:B'] && sel['ang:D']))) P.P_OPP_ANGLES = true;
      if (/180/.test(c) && ((sel['ang:A'] && sel['ang:B']) || (sel['ang:B'] && sel['ang:C']) || (sel['ang:C'] && sel['ang:D']) || (sel['ang:A'] && sel['ang:D']))) P.P_ADJ_180 = true;
    }
    if (P.P_DIAG_BISECT) { P.BISECT_ONE = false; P.BISECT_VAGUE = false; }
    return P;
  }

  /* ---------- 삼각형 합동 탐지(1차시) ---------- */
  function cong(text) {
    var c = compact(text);
    var o = {
      SSS: /SSS/.test(c), SAS: /SAS/.test(c), ASA: /ASA/.test(c),
      SSS_M: /세변.{0,10}(같|일치)/.test(c),
      SAS_M: /두변.{0,18}끼인각/.test(c) || /끼인각.{0,12}두변/.test(c),
      ASA_M: /한변.{0,22}양끝/.test(c) || /양끝(의)?각.{0,14}한변/.test(c) || /두각.{0,10}(사이|끼인)(의|에있는)?변/.test(c),
      VERT: /맞꼭지각/.test(c) || /∠?(AOB|BOA)=∠?(COD|DOC)/.test(c) || /∠?(COD|DOC)=∠?(AOB|BOA)/.test(c),
      AAA: /세각.{0,10}(같|일치)/.test(c) && /합동/.test(c),
      notSAS: /SAS(합동)?(이|가|은|는)?(아니|아닌|틀|잘못|않)/.test(c) || /(아니라|아닌|대신)[^|]{0,6}ASA/.test(c)
    };
    o.SSA = /두변.{0,14}(한각|각하나|각도같|각이같)/.test(c) && !o.SAS_M;
    o.anySSS = o.SSS || o.SSS_M; o.anySAS = o.SAS || o.SAS_M; o.anyASA = o.ASA || o.ASA_M;
    return o;
  }
  /* 합동 기호의 대응 순서: △ABC≡△EFD 같은 쌍을 찾아 정답 대응(map)과 비교 */
  function congPairs(text, map) {
    var s = norm(text).replace(/\s+/g, '').replace(/삼각형/g, '△');
    var found = [], m;
    var re1 = /△?([A-F]{3})(?:≡|=)△?([A-F]{3})/g, re2 = /△?([A-F]{3})(?:와|과|하고|랑|이랑)△?([A-F]{3})(?:는|은|이|가)?[^.|,]{0,10}합동/g;
    while ((m = re1.exec(s))) found.push([m[1], m[2]]);
    while ((m = re2.exec(s))) found.push([m[1], m[2]]);
    var ok = false, wrong = false;
    found.forEach(function (p) {
      var a = p[0], b = p[1], f = {}, i;
      for (i = 0; i < 3; i++) f[a[i]] = b[i];
      var good = Object.keys(map).every(function (k) { return f[k] === map[k]; }) || Object.keys(map).every(function (k) { return f[map[k]] === k; });
      var abc = /^[ABC]{3}$/.test(a) && /^[DEF]{3}$/.test(b), def = /^[DEF]{3}$/.test(a) && /^[ABC]{3}$/.test(b);
      if (good) ok = true; else if (abc || def) wrong = true;
    });
    return { ok: ok, wrong: wrong, n: found.length };
  }

  /* ---------- 보기 번호 ---------- */
  var CIRC_MAP = { '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5' };
  function uniqSort(a) { var o = []; a.forEach(function (x) { if (o.indexOf(x) < 0) o.push(x); }); return o.sort(); }
  function circNums(raw) {
    var o = [], s = String(raw || '');
    s.replace(/[①-⑤]/g, function (ch) { o.push(CIRC_MAP[ch]); return ch; });
    s.replace(/(?:^|[^0-9.])([1-5])\s*번/g, function (x, d) { o.push(d); return x; });
    return uniqSort(o);
  }
  function multiSet(v) { return uniqSort(String(v || '').split(',').filter(function (x) { return /^[1-5]$/.test(x); })); }
  function sameSet(a, b) { return a.length === b.length && a.every(function (x, i) { return x === b[i]; }); }
  /* 이유 글에서 보기마다 맞다/아니다를 나눈다: “①, ④는 맞고 ③, ⑤는 틀리다” → right [1,4], wrong [3,5] */
  var OPT_NEG = /(옳지않|옳지\s+않|틀리|틀렸|틀림|틀려|아니|않|다르|거짓)/, OPT_POS = /(옳|맞|성립|참)/;
  function classifyOpts(raw) {
    var segs = String(raw || '').split(/[.\n;!?]|(?:(?:고|며|지만|는데|면서|므로|니까|서)\s*,?\s*(?=[①-⑤]|[1-5]\s*번))/);
    var right = [], wrong = [], seen = [];
    segs.forEach(function (sg) {
      var ns = circNums(sg); if (!ns.length) return;
      seen = seen.concat(ns);
      if (OPT_NEG.test(sg)) wrong = wrong.concat(ns);
      else if (OPT_POS.test(sg)) right = right.concat(ns);
    });
    return { right: uniqSort(right), wrong: uniqSort(wrong), seen: uniqSort(seen) };
  }
  function choiceFromText(text, choices) {
    var c = compact(text), hit = null;
    (choices || []).forEach(function (ch, i) { var n = compact(ch).replace(/[^0-9]/g, ''); if (n && new RegExp('(^|[^0-9])' + n + '($|[^0-9])').test(c)) hit = hit === null ? String(i + 1) : 'many'; });
    if (hit && hit !== 'many') return hit;
    var ns = circNums(text); return ns.length === 1 ? ns[0] : '';
  }

  var ANSWER_REQ = /(답|정답|풀이|해설|과정)(만|좀|을|를|이나|부터)?(알려|가르쳐|말해|보여|써줘|줘|주세요)|알려줘|가르쳐줘|답뭐|답이뭐/;
  var UNCERTAIN = /(모르겠|몰라|모름|잘모르|헷갈|모르겟|모르것|노이해|이해가안)/;
  var DOMAIN = {
    1: /(합동|대응|꼭짓점|변|각|삼각형|SSS|SAS|ASA|길이|크기|≡|△|조건|겹|포개|모양|기호)/,
    2: /(변|각|대각선|평행|사각형|길이|크기|성질|교점|이등분|180|넓이|높이|AO|OC|BO|OD|AB|BC|CD|AD|AC|BD|AE)/
  };
  var PROCESS = /(Preview|Question|Read|Reflect|Recite|Review|PREVIEW|QUESTION|READ|REFLECT|RECITE|REVIEW|훑어보기|질문|읽기|되돌아|반성|자기설명|암송|복습|AI|조건|성질|확인|점검|그림|풀이|검토|비교|근거|이유)/;

  function lcsRatio(a, b) {
    if (!a || !b) return 0;
    a = a.slice(0, 240); b = b.slice(0, 600);
    var best = 0, prev = new Array(b.length + 1).fill(0);
    for (var i = 1; i <= a.length; i++) {
      var cur = new Array(b.length + 1).fill(0);
      for (var j = 1; j <= b.length; j++) {
        if (a[i - 1] === b[j - 1]) { cur[j] = prev[j - 1] + 1; if (cur[j] > best) best = cur[j]; }
      }
      prev = cur;
    }
    return best / a.length;
  }
  function isCopy(text, sources) {
    var t = compact(text); if (t.length < 14) return false;
    return sources.some(function (src) { return lcsRatio(t, compact(plain(src))) >= 0.8; });
  }

  /* ---------- 문항별 규칙 판정 ---------- */
  function R(state, opt) { opt = opt || {}; return { state: state, misc: opt.misc || null, missing: opt.missing || [], decisive: !!opt.decisive, flag: opt.flag || null, props: opt.props || null }; }
  function allSel(selections) {
    var out = []; Object.keys(selections || {}).forEach(function (k) { (selections[k] || []).forEach(function (e) { out.push(e); }); }); return out;
  }
  function verdictState(fx, v, okState) {
    if (!v) return R('PARTIAL', { misc: 'verdict_missing', decisive: true, flag: 'num_ok' });
    if (fx.ok.indexOf(v) >= 0) return okState;
    return R('PARTIAL', { misc: 'verdict_category', decisive: true, flag: 'num_ok' });
  }

  /* 개념확인(객관식 + 이유) */
  function judgeMC(it, fields) {
    var key = C.KEYS[it.id] || {}, work = fields.work || '', cw = compact(work);
    var A = multiSet(fields.answer); if (!A.length) A = circNums(work);
    var missing = [];
    if (it.id === 'L1RD02') {
      var cg = cong(work);
      if (!(cg.anySSS || /ㄱ.{0,8}ㅁ.{0,16}세변/.test(cw))) missing.push('C_SSS');
      if (!(cg.anyASA || /55/.test(cw))) missing.push('C_ASA');
    } else {
      var cg2 = cong(work);
      if (!cg2.anyASA) missing.push('C_ASA');
      if (!(/엇각/.test(cw) || /(평행|∥)/.test(cw) || /∠?(BAO|OAB)=∠?(DCO|OCD)/.test(cw))) missing.push('P_ALT');
    }
    if (!A.length) {
      if (UNCERTAIN.test(cw) && cw.length < 20) return R('NO_START', { decisive: true, flag: 'empty' });
      return R('AMBIGUOUS', { misc: 'no_choice', flag: 'num_check' });
    }
    var wrong = A.filter(function (x) { return key.set.indexOf(x) < 0; });
    if (wrong.length) {
      var misc = it.id === 'L2RD02' ? ((wrong.indexOf('2') >= 0 || wrong.indexOf('3') >= 0) ? 'circular' : 'irrelevant') : 'wrong_pair';
      return R('MISAPPLIED_PROPERTY', { misc: misc, decisive: true, flag: 'num_check' });
    }
    if (A.length < key.set.length) return R('PARTIAL', { misc: 'missing_choice', decisive: true, flag: 'num_check' });
    if (!missing.length) return R('CLEAR_INDEPENDENT', { decisive: true, flag: 'num_ok' });
    if (missing.length === 2) return R('CORRECT_NO_REASON', { decisive: isBlank(work), missing: missing, flag: 'num_ok' });
    return R('PARTIAL', { misc: 'reason_partial', missing: missing, flag: 'num_ok' });
  }

  /* Reflect: 실험집단은 AI의 설명 판단(verdict) + 이유(+ 2차시는 답), 통제집단은 답 + 이유 */
  function judgeRF(it, group, fields, P) {
    var id = it.id, key = C.KEYS[id] || {}, fx = it.fixedAI, E = !!fx;
    var v = E ? (fields.verdict || '') : '';
    var reason = fields.reason || '', cr = compact(reason);
    var trust = /(맞아|맞는|맞다|맞음|믿|그대로|정확|AI가맞|AI말|옳다고|옳아|옳음)/.test(cr) && !/(틀|아니|않|모르|없)/.test(cr);
    var cls = classifyOpts(reason);

    if (id === 'L1RF01') {
      var cg = cong((fields.answer || '') + ' | ' + reason);
      var asa = cg.anyASA, sas = cg.anySAS && !cg.notSAS, vert = cg.VERT;
      if (E) {
        if (v === 'right') return R('REFLECT_UNCRITICAL', { decisive: true, flag: 'text' });
        if (!v) return asa ? R('PARTIAL', { misc: 'verdict_missing', flag: 'text' }) : R('AMBIGUOUS', { flag: 'text' });
        if (asa && vert && !sas) return R('CLEAR_INDEPENDENT', { decisive: true, flag: 'num_ok' });
        if (sas && !asa) return R('MISAPPLIED_PROPERTY', { misc: 'sas', decisive: true, flag: 'num_check' });
        if (asa && !sas) return R('PARTIAL', { misc: 'reason_partial', missing: ['C_VERT'], flag: 'num_ok' });
        if (isBlank(reason)) return R('CORRECT_NO_REASON', { decisive: true, flag: 'text' });
        return R('PARTIAL', { misc: 'reason_vague', missing: ['C_ASA'], flag: 'text' });
      }
      var an = cong(fields.answer || '');
      if ((an.anySAS && !an.anyASA) || (sas && !asa)) return R('MISAPPLIED_PROPERTY', { misc: 'sas', decisive: true, flag: 'num_check' });
      if (an.anySSS && !an.anyASA) return R('MISAPPLIED_PROPERTY', { misc: 'sss', decisive: true, flag: 'num_check' });
      if (asa && vert) return R('CLEAR_INDEPENDENT', { decisive: true, flag: 'num_ok' });
      if (asa) return isBlank(reason) ? R('CORRECT_NO_REASON', { decisive: true, flag: 'num_ok' }) : R('PARTIAL', { misc: 'reason_partial', missing: ['C_VERT'], flag: 'num_ok' });
      return R('AMBIGUOUS', { flag: 'num_check' });
    }

    if (id === 'L1RF02') {
      var reasonish = /(대응|SSS|합동|공통|∠|2배|두배)/.test(cr) && cr.length >= 8;
      if (E && v === 'right') return R('REFLECT_UNCRITICAL', { decisive: true, flag: 'text' });
      var W = E ? cls.wrong : multiSet(fields.answer);
      if (!E && !W.length) W = cls.wrong;
      if (!W.length) {
        if (E && v && isBlank(reason)) return R('CORRECT_NO_REASON', { decisive: true, flag: 'text' });
        return R('AMBIGUOUS', { flag: 'num_check' });
      }
      if (W.some(function (x) { return x === '1' || x === '4'; })) return R('MISAPPLIED_PROPERTY', { misc: 'corr_confusion', decisive: true, flag: 'num_check' });
      var core = ['3', '5'].filter(function (x) { return W.indexOf(x) >= 0; });
      if (core.length === 2) {
        if (!reasonish) return R('CORRECT_NO_REASON', { decisive: isBlank(reason), flag: 'num_ok' });
        return E ? verdictState(fx, v, R('CLEAR_INDEPENDENT', { decisive: true, flag: 'num_ok' })) : R('CLEAR_INDEPENDENT', { decisive: true, flag: 'num_ok' });
      }
      if (core.length === 1) return R('PARTIAL', { misc: 'missing_choice', decisive: true, flag: 'num_check' });
      return E ? R('PARTIAL', { misc: 'missing_choice', decisive: true, flag: 'num_check' }) : R('MISAPPLIED_PROPERTY', { misc: 'same_as_ai', decisive: true, flag: 'num_check' });
    }

    if (id === 'L1RF03') {
      var ev = [/대응/, /90/, /(DE|ED)=?(AB|BA)|(AB|BA)=?(DE|ED)|(DE|ED)(=|는|은|이)?5/, /∠?F=∠?C|∠?C=∠?F|∠?F(=|는|은)?30/, /∠?A=∠?D|∠?D=∠?A|∠?A(=|는|은)?60/, /180/]
        .filter(function (re) { return re.test(cr); }).length;
      if (E) {
        if (v === 'partly' || v === 'wrong') return R('MISAPPLIED_PROPERTY', { misc: 'reject_valid', decisive: true, flag: 'num_check' });
        if (!v) return R('AMBIGUOUS', { flag: 'text' });
        if (ev >= 2) return R('CLEAR_INDEPENDENT', { decisive: true, flag: 'num_ok' });
        if (ev === 1) return R('PARTIAL', { misc: 'reason_partial', flag: 'num_ok' });
        return R('REFLECT_UNCRITICAL', { decisive: isBlank(reason) || trust || cr.length < 12, flag: 'text' });
      }
      var A3 = multiSet(fields.answer); if (!A3.length) A3 = cls.right;
      if (!A3.length) return R('AMBIGUOUS', { flag: 'num_check' });
      if (A3.indexOf('1') >= 0) return R('MISAPPLIED_PROPERTY', { misc: 'corr_position', decisive: true, flag: 'num_check' });
      if (A3.indexOf('4') >= 0) return R('MISAPPLIED_PROPERTY', { misc: 'angle_calc', decisive: true, flag: 'num_check' });
      if (sameSet(A3, key.set)) {
        if (ev >= 2) return R('CLEAR_INDEPENDENT', { decisive: true, flag: 'num_ok' });
        if (ev === 1) return R('PARTIAL', { misc: 'reason_partial', flag: 'num_ok' });
        return R('CORRECT_NO_REASON', { decisive: isBlank(reason), flag: 'num_ok' });
      }
      return R('PARTIAL', { misc: 'missing_choice', decisive: true, flag: 'num_check' });
    }

    if (id === 'L2RF01' || id === 'L2RF03') {
      var a = fields.answer || choiceFromText(reason, it.choices);
      var r1, r2, miss1, miss2;
      if (id === 'L2RF01') {
        r1 = /(이등변|밑각|∠?ADE=∠?AED|∠?AED=∠?ADE|75)/.test(cr); miss1 = 'P_ISOS';
        r2 = /(180|이웃|105)/.test(cr) || P.P_ADJ_180; miss2 = 'P_ADJ_180';
      } else {
        r1 = /180/.test(cr) || P.P_ADJ_180; miss1 = 'P_ADJ_180';
        r2 = P.P_OPP_ANGLES || /∠?C=∠?A|∠?A=∠?C|마주|대각(?!선)/.test(cr); miss2 = 'P_OPP_ANGLES';
      }
      if (E && v === 'right') return R('REFLECT_UNCRITICAL', { decisive: true, flag: 'num_check' });
      if (a && a === key.ai) return E ? R('REFLECT_UNCRITICAL', { decisive: true, flag: 'num_check' }) : R('MISAPPLIED_PROPERTY', { misc: id === 'L2RF01' ? 'base_angle' : 'adj_opp', decisive: true, flag: 'num_check' });
      if (a === key.one) {
        if (r1 && r2) return E ? verdictState(fx, v, R('CLEAR_INDEPENDENT', { decisive: true, flag: 'num_ok' })) : R('CLEAR_INDEPENDENT', { decisive: true, flag: 'num_ok' });
        if (r1 || r2) return R('PARTIAL', { misc: 'reason_partial', missing: [r1 ? miss2 : miss1], flag: 'num_ok' });
        return R('CORRECT_NO_REASON', { decisive: isBlank(reason), flag: 'num_ok' });
      }
      if (a) return R('MISAPPLIED_PROPERTY', { misc: 'calc', flag: 'num_check' });
      return R('AMBIGUOUS', { flag: 'num_check' });
    }

    if (id === 'L2RF02') {
      var A2 = multiSet(fields.answer); if (!A2.length) A2 = cls.wrong;
      var half = /(이등분|절반|반|중점|(OD|DO|OB|BO)(=|는|은)?4|=4)/.test(cr) || P.P_DIAG_BISECT || P.BISECT_ONE;
      var per = /(12|둘레)/.test(cr);
      if (E && v === 'right') return R('REFLECT_UNCRITICAL', { decisive: true, flag: 'num_check' });
      if (!A2.length) return R('AMBIGUOUS', { flag: 'num_check' });
      if (A2.some(function (x) { return x === '1' || x === '2' || x === '3'; })) return R('MISAPPLIED_PROPERTY', { misc: 'diag_half', decisive: true, flag: 'num_check' });
      if (sameSet(A2, key.set)) {
        if (half && per) return E ? verdictState(fx, v, R('CLEAR_INDEPENDENT', { decisive: true, flag: 'num_ok' })) : R('CLEAR_INDEPENDENT', { decisive: true, flag: 'num_ok' });
        if (half || per) return R('PARTIAL', { misc: 'reason_partial', missing: [half ? 'P_OPP_SIDES' : 'P_DIAG_BISECT'], flag: 'num_ok' });
        return R('CORRECT_NO_REASON', { decisive: isBlank(reason), flag: 'num_ok' });
      }
      return R('PARTIAL', { misc: 'missing_choice', decisive: true, flag: 'num_check' });
    }
    return R('AMBIGUOUS', { flag: 'text' });
  }

  function judgeRecite(it, all, P) {
    var c = compact(all);
    if (UNCERTAIN.test(c) && c.length < 14) return R('NO_START', { decisive: true, flag: 'text' });
    var k = it.kind;
    if (k === 'rc_cong_def') {
      var shape = /모양/.test(c), size = /크기/.test(c), same = /(같|동일|일치|똑같)/.test(c);
      var overlap = /(포개|포갤|겹치|겹쳐|겹친|겹칠|딱맞|꼭맞)/.test(c);
      if (/(넓이|둘레)(만|가|이|는|은)?(같)/.test(c) && !(shape && size) && !overlap) return R('MISAPPLIED_PROPERTY', { misc: 'area_only', decisive: true, flag: 'text' });
      if ((shape && size && same) || (overlap && /(완전|딱|꼭|모두|전부|빈틈)/.test(c))) return R('CLEAR_INDEPENDENT', { decisive: true, flag: 'text' });
      if (overlap) return R('CLEAR_INDEPENDENT', { flag: 'text' });
      if (shape && same && !size) return R('MISAPPLIED_PROPERTY', { misc: 'shape_only', flag: 'text' });
      if (size && same) return R('PARTIAL', { misc: 'missing', missing: ['C_DEF'], flag: 'text' });
      return R('AMBIGUOUS', { flag: 'text' });
    }
    if (k === 'rc_cong_corr') {
      var meaning = /(포개|겹치|겹쳐|겹친|겹칠|짝|만나는|서로맞|맞닿)/.test(c);
      var kinds = [/(꼭짓점|점)/.test(c), /변/.test(c), /각/.test(c)].filter(Boolean).length;
      var example = /[A-F](와|과|↔|<->|->|랑|이랑|하고|-)[A-F](?![A-F])/.test(c) || /(AB|BC|CA|AC)(와|과|↔|-)(DE|EF|FD|DF)/.test(c);
      var posOnly = /(같은위치|같은자리|위치가같|같은쪽|왼쪽|오른쪽)/.test(c) && !meaning;
      if (posOnly) return R('MISAPPLIED_PROPERTY', { misc: 'position', flag: 'text' });
      if (meaning && kinds >= 2) return R('CLEAR_INDEPENDENT', { decisive: true, flag: 'text' });
      if (meaning) return R('PARTIAL', { misc: 'missing', flag: 'text' });
      if (example) return R('PARTIAL', { misc: 'examples_only', flag: 'text' });
      return R('AMBIGUOUS', { flag: 'text' });
    }
    if (k === 'rc_cong_cond') {
      var cg = cong(all);
      if (cg.SSA) return R('MISAPPLIED_PROPERTY', { misc: 'ssa', decisive: true, flag: 'text' });
      if (cg.AAA) return R('MISAPPLIED_PROPERTY', { misc: 'aaa', decisive: true, flag: 'text' });
      var miss = [];
      if (!cg.SSS_M) miss.push('C_SSS'); if (!cg.SAS_M) miss.push('C_SAS'); if (!cg.ASA_M) miss.push('C_ASA');
      if (!miss.length) return R('CLEAR_INDEPENDENT', { decisive: true, flag: 'text' });
      var names = [cg.SSS, cg.SAS, cg.ASA].filter(Boolean).length;
      if (miss.length === 3 && names) return R('PARTIAL', { misc: 'names_only', missing: miss, decisive: names === 3, flag: 'text' });
      if (miss.length < 3) return R('PARTIAL', { misc: 'missing', missing: miss, flag: 'text' });
      return R('AMBIGUOUS', { flag: 'text' });
    }
    if (k === 'rc_pg_def') {
      var par = /(평행|∥)/.test(c) && !/평행하지않/.test(c);
      var pairs = /(두쌍|2쌍|양쪽|마주보는|대변|맞은편|서로마주|마주한)/.test(c);
      if (/(한쌍|1쌍)/.test(c) && !/두쌍/.test(c)) return R('MISAPPLIED_PROPERTY', { misc: 'trapezoid', decisive: true, flag: 'text' });
      if (P.M_ALL_SIDES_EQUAL && !par) return R('MISAPPLIED_PROPERTY', { misc: 'rhombus', decisive: true, flag: 'text' });
      if (par && pairs) return R('CLEAR_INDEPENDENT', { decisive: true, flag: 'text' });
      if (par) return R('PARTIAL', { misc: 'pairs_missing', flag: 'text' });
      if (P.P_OPP_SIDES || P.P_OPP_ANGLES || P.P_DIAG_BISECT) return R('MISAPPLIED_PROPERTY', { misc: 'property_as_def', flag: 'text' });
      return R('AMBIGUOUS', { flag: 'text' });
    }
    if (k === 'rc_pg_props') {
      if (P.M_DIAG_EQUAL && !P.P_DIAG_BISECT) return R('MISAPPLIED_PROPERTY', { misc: 'diag_equal', decisive: true, flag: 'text' });
      if (P.M_ALL_SIDES_EQUAL) return R('MISAPPLIED_PROPERTY', { misc: 'all_sides_equal', decisive: true, flag: 'text' });
      if (P.M_ALL_ANGLES_EQUAL) return R('MISAPPLIED_PROPERTY', { misc: 'all_angles_equal', decisive: true, flag: 'text' });
      var props = ['P_OPP_SIDES', 'P_PARALLEL', 'P_OPP_ANGLES', 'P_ADJ_180', 'P_DIAG_BISECT'];
      var have = props.filter(function (p) { return P[p]; });
      if (have.length >= 3) return R('CLEAR_INDEPENDENT', { decisive: true, flag: 'text' });
      var need = ['P_OPP_SIDES', 'P_OPP_ANGLES', 'P_DIAG_BISECT'].filter(function (p) { return !P[p]; });
      if (have.length || P.BISECT_ONE) return R('PARTIAL', { misc: 'missing', missing: need, flag: 'text' });
      if (P.BISECT_VAGUE) return R('AMBIGUOUS', { misc: 'bisect_vague', flag: 'text' });
      return R('AMBIGUOUS', { flag: 'text' });
    }
    if (k === 'rc_pg_symbols') {
      var info = P.eq;
      if (hasPair(info, 'seg', 'AC', 'BD')) return R('MISAPPLIED_PROPERTY', { misc: 'diag_equal', decisive: true, flag: 'text' });
      if (['A|B', 'B|C', 'C|D', 'A|D'].some(function (x) { return info.pairs['ang:' + x]; })) return R('MISAPPLIED_PROPERTY', { misc: 'adj_equal', decisive: true, flag: 'text' });
      var sides = hasPair(info, 'seg', 'AB', 'CD') || hasPair(info, 'seg', 'BC', 'AD') || /(AB|BA)∥(CD|DC)|(AD|DA)∥(BC|CB)|(CD|DC)∥(AB|BA)|(BC|CB)∥(AD|DA)/.test(c);
      var angles = hasPair(info, 'ang', 'A', 'C') || hasPair(info, 'ang', 'B', 'D') || ['A|B', 'B|C', 'C|D', 'A|D'].some(function (x) { return info.pairs['sum:' + x]; });
      var diag = hasPair(info, 'seg', 'AO', 'CO') || hasPair(info, 'seg', 'BO', 'DO');
      var miss2 = []; if (!sides) miss2.push('P_OPP_SIDES'); if (!angles) miss2.push('P_OPP_ANGLES'); if (!diag) miss2.push('P_DIAG_BISECT');
      if (!miss2.length) return R('CLEAR_INDEPENDENT', { decisive: true, flag: 'text' });
      if (miss2.length < 3) return R('PARTIAL', { misc: 'missing', missing: miss2, decisive: true, flag: 'text' });
      if (P.P_OPP_SIDES || P.P_OPP_ANGLES || P.P_DIAG_BISECT) return R('PARTIAL', { misc: 'words_only', missing: miss2, flag: 'text' });
      return R('AMBIGUOUS', { flag: 'text' });
    }
    return R('AMBIGUOUS', { flag: 'text' });
  }

  function judgeSolve(it, all) {
    var c = compact(all);
    if (it.lesson === 1) {
      var key = C.KEYS[it.id], pr = congPairs(all, key.map), cg = cong(all);
      var sas = cg.anySAS && !cg.notSAS;
      var f80 = /∠?F(=|는|은|도|의크기는|가)?80/.test(c) || /180-\(?60\+40\)?|180-60-40|180-100/.test(c);
      var sides = /(AB|BA)=?(EF|FE)|(EF|FE)=?(AB|BA)|(BC|CB)=?(FD|DF)|(FD|DF)=?(BC|CB)/.test(c);
      if (pr.wrong && !pr.ok) return R('MISAPPLIED_PROPERTY', { misc: 'corr_order', decisive: true, flag: 'num_check' });
      if ((cg.anyASA || cg.anySSS) && !sas) return R('MISAPPLIED_PROPERTY', { misc: 'wrong_condition', decisive: true, flag: 'num_check' });
      if (pr.ok && sas && (f80 || sides)) return R('CLEAR_INDEPENDENT', { decisive: true, flag: 'num_ok' });
      if (pr.ok && sas) return R('CORRECT_NO_REASON', { flag: 'num_ok' });
      if (pr.ok) return R('PARTIAL', { misc: 'cond_missing', missing: ['C_SAS'], flag: 'num_ok' });
      if (sas) return R('PARTIAL', { misc: 'notation_missing', missing: ['C_CORR'], flag: 'num_check' });
      if (UNCERTAIN.test(c) && c.length < 20) return R('SELF_REPORT_UNCERTAIN', { decisive: true, flag: 'text' });
      return R('AMBIGUOUS', { flag: 'num_check' });
    }
    var m = /(?:AE|EA)(?:의길이|길이)?(?:=|는|은|가|이)?([0-9+\-*/().=]+)/.exec(c) || /답(?:은|:|=)?([0-9+\-*/().=]+)/.exec(c);
    var val = null;
    if (m) { var last = m[1].split('=').filter(Boolean).pop() || ''; try { val = evalExpr(last); } catch (e) { var nn = last.match(/\d+(\.\d+)?/); val = nn ? parseFloat(nn[0]) : null; } }
    var area = /(120|4배|네배|1\/4|4분의1|사분의일)/.test(c), height = /(10|높이)/.test(c), ab = /(AB|BA)(=|는|은|가)?12|12-9/.test(c);
    if (val === 3) {
      if ((area && height) || ab) return R('CLEAR_INDEPENDENT', { decisive: true, flag: 'num_ok' });
      if (area || height) return R('PARTIAL', { misc: 'reason_partial', missing: ['P_AREA'], flag: 'num_ok' });
      return R('CORRECT_NO_REASON', { decisive: c.length < 14, flag: 'num_ok' });
    }
    if (val === 15) return R('MISAPPLIED_PROPERTY', { misc: 'height_5', decisive: true, flag: 'num_check' });
    if (val != null) return R('MISAPPLIED_PROPERTY', { misc: 'calc', flag: 'num_check' });
    if (area || height || ab) return R('PARTIAL', { misc: 'final_missing', flag: 'num_check' });
    if (UNCERTAIN.test(c) && c.length < 20) return R('SELF_REPORT_UNCERTAIN', { decisive: true, flag: 'text' });
    return R('AMBIGUOUS', { flag: 'num_check' });
  }

  function judgeRule(itemId, group, fields, selections, settings) {
    fields = fields || {};
    var it = resolveItem(itemId, group, settings);
    var texts = it.fields.map(function (f) { var v = fields[f.key]; return f.kind === 'choice' || f.kind === 'multi' ? '' : (v || ''); });
    var all = texts.join(' | ');
    var sel = allSel(selections);
    var empty = it.fields.every(function (f) { return isBlank(fields[f.key]); });
    if (empty) return R('NO_START', { decisive: true, flag: 'empty' });
    // 3~8차시의 수학 자동 채점 키는 전문가 검증 이전이다. 정답 여부를 생성형 AI가 추정하지 않도록 막고
    // 학생의 도움 요청 시 CSV 원문 발문 한 수준만 제공한다. 교사 검토 로그는 별도 남는다.
    if (it.lesson >= 3) return R('AMBIGUOUS', { decisive: true, misc: 'EXPERT_KEY_PENDING', flag: 'manual_review' });
    var ca = compact(all);
    if (ANSWER_REQ.test(ca) && ca.length < 40) return R('INVALID_RESPONSE', { misc: 'answer_request', decisive: true, flag: 'empty' });
    var copySources = [it.title, it.sub || '', it.hint || '', (it.choices || []).join(' ')];
    if (it.fixedAI) copySources.push(it.fixedAI.text);
    if (isCopy(all, copySources)) return R('INVALID_RESPONSE', { misc: 'copy', decisive: true, flag: 'text' });
    var P = detect(all, sel);
    var k = it.kind, L = it.lesson || 1;

    if (k === 'mc') return judgeMC(it, fields);
    if (k === 'rf') return judgeRF(it, group, fields, P);
    if (/^rc_/.test(k)) return judgeRecite(it, all, P);
    if (k === 'rv_solve') return judgeSolve(it, all);

    var t = ca, dom = DOMAIN[L] || DOMAIN[1];
    if (k === 'memo') {
      if (UNCERTAIN.test(t) && t.length < 16) return R('NO_START', { decisive: true, flag: 'text' });
      if (t.length >= 10 && dom.test(t)) return R('CLEAR_INDEPENDENT', { decisive: true, flag: 'text' });
      if (t.length >= 4) return R('PARTIAL', { misc: 'short', flag: 'text' });
      return R('AMBIGUOUS', { flag: 'text' });
    }
    if (k === 'question') {
      var qForm = /(\?|까$|까\?|나요|가요|을까|일까|인가|는가|는지|을지|ㄹ지|할까|될까|왜|어떻게|무엇|뭘|뭐)/.test(t);
      if (UNCERTAIN.test(t) && t.length < 12) return R('NO_START', { flag: 'text' });
      if (qForm && dom.test(t)) return R('CLEAR_INDEPENDENT', { flag: 'text' });
      if (qForm) return R('PARTIAL', { misc: 'broad', flag: 'text' });
      if (/\d/.test(t) || P.P_OPP_SIDES || P.P_OPP_ANGLES || P.P_DIAG_BISECT || /(SSS|SAS|ASA|≡)/.test(t)) return R('INVALID_RESPONSE', { misc: 'not_question', flag: 'text' });
      return R('PARTIAL', { misc: 'broad', flag: 'text' });
    }
    if (UNCERTAIN.test(t) && t.length < 16) return R(it.stage === 'Review' ? 'SELF_REPORT_UNCERTAIN' : 'NO_START', { decisive: true, flag: 'text' });
    if (t.length >= 12 && (dom.test(t) || PROCESS.test(t))) return R('CLEAR_INDEPENDENT', { flag: 'text' });
    return R('PARTIAL', { misc: 'not_specific', flag: 'text' });
  }

  /* ---------- AI 판정 프롬프트 ---------- */
  var STATE_KEYS = Object.keys(C.STATES);
  var PROP_KEYS = ['P_OPP_SIDES', 'P_OPP_ANGLES', 'P_ADJ_180', 'P_DIAG_BISECT', 'P_PARALLEL', 'P_ISOS', 'P_ALT', 'P_AREA', 'C_SSS', 'C_SAS', 'C_ASA', 'C_VERT', 'C_CORR', 'C_DEF'];
  function selText(selections) {
    var lines = [];
    Object.keys(selections || {}).forEach(function (k) { if ((selections[k] || []).length) lines.push(k + ': ' + selections[k].map(function (e) { return e.split(':')[1]; }).join(', ')); });
    return lines.length ? lines.join('\n') : '(선택 없음)';
  }
  function fieldValueText(f, v) {
    if (f.kind === 'choice') { var o = (f.options || []).filter(function (x) { return x.v === v; })[0]; return o ? o.label : ''; }
    if (f.kind === 'multi') { var vs = multiSet(v); return vs.map(function (x) { var o = (f.options || []).filter(function (y) { return y.v === x; })[0]; return o ? o.label : x; }).join(', '); }
    return v == null ? '' : String(v);
  }
  var RULES_BY_LESSON = {
    1: ['- 합동 기호는 대응하는 꼭짓점을 같은 순서로 써야 한다. 예: △ABC≡△EFD와 △BAC≡△FED는 같은 뜻이고, △ABC≡△DEF는 다른 대응이다.',
      '- SSS는 세 변, SAS는 두 변과 그 끼인각, ASA는 한 변과 그 양 끝 각이 각각 같을 때다. 이름(SSS)이나 뜻(세 변의 길이가 각각 같다) 중 하나로 써도 같은 조건으로 본다.',
      '- 끼인각이 아닌 각으로 SAS를 판단하거나, 세 각만 같아서 합동이라고 하면 오개념(MISAPPLIED_PROPERTY)이다.'],
    2: ['- 표현이 달라도 수학적으로 같은 뜻이면 같은 것으로 본다. 예: AO=OC, “AO와 OC의 길이가 같다”, “대각선 AC는 O에서 반으로 나뉜다”는 같은 관계다.',
      '- 뜻이 다른 표현은 구분한다. 예: AC=BD(두 대각선의 길이가 같다)는 “서로를 이등분한다”와 다르다.',
      '- 교재의 “대변·대각”, “서로 다른 것을 이등분한다”는 “마주 보는 변·각”, “서로를 이등분한다”와 같은 뜻이다.']
  };
  function buildJudgePrompt(itemId, group, fields, selections, settings) {
    var it = resolveItem(itemId, group, settings);
    var rb = C.RUBRIC[itemId] || { expected: '', accepted: '', misconceptions: '' };
    var L = it.lesson || 1, lesson = C.LESSONS[L] || {};
    var lines = [];
    lines.push('너는 중학교 2학년 수학 활동지 응답을 분류하는 채점 보조자다. 분류 결과는 학생에게 보이지 않는다. 정답을 설명하거나 학생에게 말을 걸지 않는다.');
    lines.push('');
    lines.push('[차시] ' + L + '차시 · ' + (lesson.title || ''));
    lines.push('[단계] ' + it.stage + ' / [문항] ' + itemId + ': ' + plain(it.title));
    var sp = lesson.stageProblem && lesson.stageProblem[it.stage] ? C.PROBLEMS[lesson.stageProblem[it.stage]] : null;
    if (sp) { lines.push('[문제] ' + plain(sp.text)); if (sp.fig && C.FIGS[sp.fig]) lines.push('[문제 그림] ' + plain(C.FIGS[sp.fig].desc)); }
    if (it.sub) lines.push('[지시] ' + plain(it.sub));
    if (it.choices) lines.push('[보기] ' + it.choices.map(function (c, i) { return '①②③④⑤'.charAt(i) + ' ' + plain(c); }).join('  '));
    if (it.fig) lines.push('[그림] ' + plain(it.fig.desc));
    if (it.fixedAI) lines.push('[학생이 검토하는 AI의 설명] ' + plain(it.fixedAI.text));
    lines.push('[비공개 기준] 기대: ' + plain(rb.expected) + ' / 인정: ' + plain(rb.accepted) + ' / 흔한 오개념: ' + plain(rb.misconceptions));
    if (rb.add) lines.push('[추가 기준] ' + plain(rb.add));
    lines.push('[학생 응답]');
    it.fields.forEach(function (f) {
      var v = fieldValueText(f, fields[f.key]);
      lines.push('- ' + plain(f.label) + ': ' + (isBlank(v) ? '(빈칸)' : String(v).slice(0, 600)));
    });
    if ((C.LESSONS[L] || {}).tool) { lines.push('[도형에서 선택한 요소]'); lines.push(selText(selections)); }
    lines.push('');
    lines.push('[분류 상태] 아래 중 정확히 하나를 고른다.');
    STATE_KEYS.forEach(function (k) { lines.push('- ' + k + ': ' + C.STATES[k]); });
    lines.push('');
    lines.push('[규칙]');
    (RULES_BY_LESSON[L] || []).forEach(function (r) { lines.push(r); });
    lines.push('- 답이 맞아도 필요한 근거가 없으면 CLEAR_INDEPENDENT가 아니다(CORRECT_NO_REASON).');
    lines.push('- Preview·Question·Review의 생각 쓰기, 핵심 개념 메모처럼 정답이 없는 문항은 맞고 틀림이 아니라 진지한 시도와 구체성으로 판단한다. 구체적이면 CLEAR_INDEPENDENT, 막연하면 PARTIAL, 자신의 불확실함을 밝히면 SELF_REPORT_UNCERTAIN. “도움이 없었다”, “아직 모르겠다”는 오답이 아니다.');
    lines.push('- Reflect에서 학생이 조건과 성질을 확인하지 않고 AI의 설명을 받아들이면 REFLECT_UNCRITICAL. AI의 설명이 실제로 옳은 문항에서 근거를 들어 옳다고 판단하면 수용이 아니라 검증이다. AI의 설명에 대한 판단(옳다/일부만 옳다/다 틀리다)은 비공개 기준을 따른다.');
    lines.push('- 확신이 없으면 AMBIGUOUS를 고른다.');
    lines.push('');
    lines.push('JSON 하나만 출력한다: {"state":"상태","misconception":"짧은 영문 코드 또는 빈 문자열","missing":["빠진 성질 코드"],"evidence":"판단 근거 한 문장"}');
    lines.push('빠진 성질 코드는 ' + PROP_KEYS.join(', ') + ' 중에서만 고른다.');
    return lines.join('\n');
  }
  function parseJudge(obj) {
    if (!obj || typeof obj !== 'object') return null;
    var st = String(obj.state || '').trim();
    if (STATE_KEYS.indexOf(st) < 0) return null;
    var miss = Array.isArray(obj.missing) ? obj.missing.filter(function (m) { return PROP_KEYS.indexOf(m) >= 0; }) : [];
    return { state: st, misc: obj.misconception ? String(obj.misconception).slice(0, 40) : null, missing: miss, evidence: obj.evidence ? String(obj.evidence).slice(0, 200) : '' };
  }

  /* 규칙 + AI 결합. 애매하면 '부족' 쪽(AMBIGUOUS → 의미 확인 질문)으로 */
  function isMath(itemId) { return !!(ITEM[itemId] && ITEM[itemId].math); }
  function combine(itemId, group, rule, aiResults, aiEnabled) {
    var base = { state: rule.state, misc: rule.misc, missing: rule.missing, flag: rule.flag, source: 'rule', agree: null, needsReview: false, ai: aiResults || null };
    if (rule.decisive || group === 'CONTROL' || !aiEnabled) {
      base.needsReview = !rule.decisive && isMath(itemId) && group !== 'CONTROL';
      if (group === 'CONTROL') base.needsReview = false;
      return base;
    }
    var ok = (aiResults || []).filter(Boolean);
    if (!ok.length) { base.source = 'rule(ai_unavailable)'; base.needsReview = isMath(itemId); return base; }
    if (ok.length === 1) {
      return Object.assign(base, { state: ok[0].state, misc: ok[0].misc || rule.misc, missing: ok[0].missing.length ? ok[0].missing : rule.missing, source: 'ai(1회)', agree: null, needsReview: isMath(itemId) && ok[0].state !== rule.state });
    }
    if (ok[0].state === ok[1].state) {
      return Object.assign(base, { state: ok[0].state, misc: ok[0].misc || rule.misc, missing: ok[0].missing.length ? ok[0].missing : rule.missing, source: 'ai(2회 일치)', agree: true });
    }
    return Object.assign(base, { state: 'AMBIGUOUS', misc: 'ai_disagree', source: 'hold', agree: false, needsReview: true });
  }

  /* ---------- 발문 은행 선택 ---------- */
  /* 동일 수준 질문을 계속 요청할 때, 같은 질문을 곧바로 반복하지 않고 문항별 미사용 승인 발문을 우선한다. */
  function pickEntry(itemId, level, state, misc, missing, group, variant, avoidId, usedIds) {
    var keys=[];
    if (missing && missing.length) keys.push(state+':'+missing[0]);
    if (misc) keys.push(state+':'+misc);
    keys.push(state, '*');
    var pool=C.BANK.filter(function(e){return e.item===itemId && e.level===level && !e.group;});
    var used=Array.isArray(usedIds)?usedIds:[];
    var order=[];
    keys.forEach(function(k){pool.filter(function(e){return e.state===k;}).forEach(function(e){if(order.indexOf(e)<0)order.push(e);});});
    pool.forEach(function(e){if(order.indexOf(e)<0)order.push(e);});
    var fresh=order.filter(function(e){return used.indexOf(e.id)<0 && e.id!==avoidId;});
    if (fresh.length) return fresh.filter(function(e){return e.variant===variant;})[0] || fresh[0];
    var other=order.filter(function(e){return e.id!==avoidId;});
    return other.filter(function(e){return e.variant===variant;})[0] || other[0] || order[0] || null;
  }

  function newRec() {
    return { attempts: 0, level: 0, levelSetAttempt: 0, maxLevel: 0, state: null, misc: null, missing: [], status: 'open', performance: null,
      supportCount: 0, sameLevelRepeats: 0, lastSupportAttempt: 0, lastEntryId: null, usedEntryIds: [], fading: null, helpCount: 0, needsReview: false };
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function supportOut(entry, level, trigger, reason, extra) {
    return Object.assign({ kind: 'support', level: level, entryId: entry.id, text: entry.text, type: entry.type || (C.LEVEL_TAGS[level] || {}).type || null,
      mechanism: entry.mechanism || (C.LEVEL_TAGS[level] || {}).mechanism || null, trigger: trigger, reason: reason, requiresResubmission: level > 0 }, extra || {});
  }

  function chooseSupport(rec,itemId,level,group,variant,judgment) {
    var st=judgment?judgment.state:rec.state;
    var misc=judgment?judgment.misc:rec.misc;
    return pickEntry(itemId,level,st,misc,judgment?judgment.missing:rec.missing,group,variant,rec.lastEntryId,rec.usedEntryIds||[]);
  }

  /* 연구용 단일 수준: 제출은 진단 및 기록만, 개입은 학습자의 요청에서 시작한다. */
  function onSubmit(recIn, judgment, ctx) {
    var rec = clone(recIn || newRec());
    rec.attempts += 1;
    rec.state = judgment.state; rec.misc = judgment.misc; rec.missing = judgment.missing || [];
    rec.needsReview = !!judgment.needsReview;
    rec.status = judgment.state === 'CLEAR_INDEPENDENT' ? 'clear' : 'open';
    rec.performance = rec.status === 'clear'
      ? (ctx.group === 'CONTROL' ? 'NOT_ASSESSED' : (rec.supportCount ? 'ASSISTED_SUCCESS' : 'INDEPENDENT_SUCCESS'))
      : null;
    rec.fading = null;
    // 내부 판정은 기록하되 학생의 도움 요청을 차단하거나 자동 발문을 보내지 않는다.
    return { rec: rec, out: [], events: rec.status === 'clear'
      ? [{ type: 'STATE_CHANGE', performance: rec.performance, reason: 'CLEAR_ON_ATTEMPT_' + rec.attempts }] : [] };
  }

  function onHelp(recIn, ctx) {
    var rec = clone(recIn || newRec()), out = [], events = [];
    rec.helpCount += 1;
    if (rec.attempts === 0 && ctx.stage !== 'Review') {
      out.push({ kind: 'system', text: C.COMMON.PRE_SUBMIT.text, reason: 'FIRST_SUBMIT_REQUIRED' });
      return { rec: rec, out: out, events: events };
    }
    if (rec.supportCount > 0 && rec.lastSupportAttempt >= rec.attempts) {
      out.push({ kind: 'system', text: '앞서 받은 질문을 생각하며 자신의 판단이나 근거를 다시 작성하여 제출해 보세요. 처음 판단을 유지해도 됩니다.', reason: 'RESUBMISSION_REQUIRED' });
      return { rec: rec, out: out, events: events };
    }
    if (ctx.group === 'CONTROL') {
      out.push({ kind: 'request', reason: 'CONTROL_REQUEST' });
      out.push({ kind: 'system', text: C.COMMON.WAIT_TEACHER.text, reason: 'WAIT_TEACHER' });
      return { rec: rec, out: out, events: events };
    }
    var e = chooseSupport(rec, ctx.itemId, 1, ctx.group, rec.supportCount % 2 ? 'b' : 'a', null);
    if (!e || e.group) e = C.COMMON.AMBIGUOUS;
    rec.level = 1; rec.maxLevel = 1; rec.levelSetAttempt = rec.attempts;
    rec.supportCount += 1; rec.lastSupportAttempt = rec.attempts;
    rec.lastEntryId = e.id;
    rec.usedEntryIds = (rec.usedEntryIds || []).concat([e.id]).slice(-64);
    rec.sameLevelRepeats = rec.supportCount - 1;
    out.push(supportOut(e, 1, 'STUDENT_REQUEST', 'SINGLE_METACOGNITIVE_SUPPORT'));
    return { rec: rec, out: out, events: events };
  }

  /* 단계 종료 */
  function onStageClose(recIn, ctx) {
    var rec = clone(recIn || newRec());
    var events = [];
    if (rec.status === 'clear' || rec.status === 'unresolved' || rec.status === 'incomplete' || rec.status === 'closed') return { rec: rec, events: events };
    if (rec.attempts === 0) {
      rec.status = 'incomplete'; rec.performance = 'NOT_ASSESSED';
      events.push({ type: 'TIMEOUT', performance: 'NOT_ASSESSED', reason: ctx.hasDraft ? 'STAGE_CLOSED_DRAFT_ONLY' : 'STAGE_CLOSED_EMPTY', incomplete: true });
      return { rec: rec, events: events };
    }
    rec.status = 'closed';
    if (ctx.group === 'CONTROL') { rec.performance = 'NOT_ASSESSED'; }
    else rec.performance = 'UNRESOLVED';
    events.push({ type: 'STATE_CHANGE', performance: rec.performance, reason: 'STAGE_CLOSED_OPEN_ITEM' });
    return { rec: rec, events: events };
  }

  /* 교사는 한 수준의 집단 공통 발문에서만 선택한다. */
  function teacherOptions(rec, stageId) {
    rec = rec || newRec();
    if (rec.attempts === 0 && stageId !== 'Review') return { preSubmitOnly: true, levels: [0], suggested: 0, cap: 1 };
    return { preSubmitOnly: false, levels: [1], suggested: 1, cap: 1 };
  }
  function bankFor(itemId, level, group) {
    if (level === 0) return [C.COMMON.PRE_SUBMIT];
    if (level !== 1) return [];
    return C.BANK.filter(function (e) { return e.item === itemId && e.level === 1 && !e.group; });
  }
  function applyTeacherSupport(recIn, level) {
    var rec = clone(recIn || newRec());
    if (level !== 1) return rec;
    rec.level = 1; rec.maxLevel = 1; rec.levelSetAttempt = rec.attempts;
    rec.supportCount += 1; rec.lastSupportAttempt = rec.attempts;
    rec.sameLevelRepeats = rec.supportCount - 1;
    return rec;
  }

  /* ---------- 출력 검사(AI 문장 다듬기·교사 자유 문구용) ---------- */
  var LEAK = {
    L1RD02: /ㄱ\s*[,와과및]?\s*ㅁ|ㄷ\s*[,와과및]?\s*ㄹ|②\s*[,와과및]?\s*⑤/,
    L1RF01: /ASA/i,
    L1RF02: /③\s*[,와과및]?\s*⑤/,
    L1RF03: /②\s*[,와과및]?\s*③\s*[,와과및]?\s*⑤/,
    L1RC01: /모양과\s?크기가\s?(모두\s?)?같/,
    L1RC03: /세\s?변의\s?길이가\s?(각각\s?)?같|끼인각의\s?크기가\s?같|양\s?끝\s?각의\s?크기가\s?(각각\s?)?같/,
    L1RV01: /EFD|FED|DEF와\s?합동|SAS/i,
    L2RD02: /①\s*[,와과및]?\s*⑤/,
    L2RF01: /75/,
    L2RF02: /④\s*[,와과및]?\s*⑤|12\s*cm|둘레[^.]{0,8}12/,
    L2RF03: /96/,
    L2RC01: /두\s?쌍의\s?(대변|마주\s?보는\s?변)이?\s?(각각\s?)?(서로\s?)?평행/,
    L2RC02: /서로를?\s?이등분|마주\s?보는\s?(두\s?)?변의\s?길이(는|가)?\s?(각각\s?)?같/,
    L2RC03: /([A-D]O|O[A-D])\s*=\s*(O[A-D]|[A-D]O)|(AB|BA)\s*=\s*(CD|DC)/,
    L2RV01: /(AE|EA)\s*(=|는|은)?\s*3(?!\d)|120|(AB|BA)\s*=\s*12/
  };
  var CORRECTNESS = /(정답|맞아요|맞습니다|맞았|맞아\b|틀렸|틀립|틀려|옳아|옳습|오답|잘했|훌륭|완벽|정확해|정확합)/;
  function leakCheck(itemId, text) { var re = LEAK[itemId]; return !!(re && re.test(plain(text))); }
  function checkOutput(text, template, studentText, itemId) {
    var t = plain(text || ''), tpl = plain(template || ''), stu = String(studentText || '');
    if (!t.trim()) return { ok: false, reason: 'empty' };
    if (CORRECTNESS.test(t)) return { ok: false, reason: 'correctness_signal' };
    var nums = t.match(/\d+(\.\d+)?/g) || [];
    for (var i = 0; i < nums.length; i++) { if (tpl.indexOf(nums[i]) < 0 && stu.indexOf(nums[i]) < 0) return { ok: false, reason: 'new_number' }; }
    var terms = ['이등분', '180', '마주 보는', '이웃한', '평행', '합동', '엇각', '동위각', 'SSS', 'SAS', 'ASA', '맞꼭지각', '끼인각', '양 끝 각', '이등변', '밑각'];
    for (var j = 0; j < terms.length; j++) { if (t.indexOf(terms[j]) >= 0 && tpl.indexOf(terms[j]) < 0 && stu.indexOf(terms[j]) < 0) return { ok: false, reason: 'new_math' }; }
    if (t.length > tpl.length + 80) return { ok: false, reason: 'too_long' };
    if (leakCheck(itemId, t) && !leakCheck(itemId, tpl)) return { ok: false, reason: 'answer_leak' };
    return { ok: true };
  }
  function buildPhrasePrompt(template, studentText) {
    return ['아래 ‘기본 문장’을 중학교 2학년 학생에게 보낼 문장으로 다듬어라.',
      '규칙: 뜻과 도움의 정도를 바꾸지 않는다. 새 수학 사실, 숫자, 성질을 더하지 않는다. 맞고 틀림을 암시하지 않는다(정답, 맞아요, 틀렸어요, 잘했어요 금지). 학생이 쓴 표현을 15자 이내로 작은따옴표에 넣어 한 번 인용할 수 있다. ‘-요’체를 쓴다. 두 문장을 넘기지 않는다.',
      '기본 문장: ' + plain(template),
      '학생 응답: ' + String(studentText || '').slice(0, 300),
      'JSON 하나만 출력한다: {"text":"다듬은 문장"}'].join('\n');
  }

  /* ---------- 처치충실도 리포트 ---------- */
  function fidelity(events) {
    var sup = events.filter(function (e) { return e.event_type === 'SUPPORT_SENT'; });
    var r = {};
    r.preSubmitMath = sup.filter(function (e) { return (e.attempt_no || 0) === 0 && (e.support_level_after || 0) > 0; }).length;
    r.leaks = sup.filter(function (e) { return leakCheck(e.item_id, e.support_text || '') && !/-L4-/.test(e.bank_id || ''); }).length;
    r.blocked = events.filter(function (e) { return e.error_flag; }).length;
    var capOf = {}; C.STAGES.forEach(function (s) { capOf[s.id] = s.cap; });
    r.capViolations = sup.filter(function (e) { return (e.support_level_after || 0) > (capOf[e.stage] || 4); }).length;
    r.jumps = events.filter(function (e) { return e.event_type === 'LEVEL_CHANGE' && (e.support_level_after - e.support_level_before) > 1; }).length;
    r.levelViolations = sup.filter(function (e) { return e.support_level_after !== 1; }).length;
    r.typeViolations = sup.filter(function (e) { return e.support_type !== '메타인지'; }).length;
    r.unsolicited = sup.filter(function (e) { return e.support_trigger !== 'STUDENT_REQUEST'; }).length;
    r.teacherBankQuestions = sup.filter(function(e){return e.support_provider==='TEACHER' && e.extra && e.extra.teacher_question_mode==='BANK';}).length;
    r.teacherFreeformQuestions = sup.filter(function(e){return e.support_provider==='TEACHER' && e.extra && e.extra.teacher_question_mode==='FREEFORM';}).length;
    r.teacherFreeformReviewRequired = sup.filter(function(e){return e.support_provider==='TEACHER' && e.extra && e.extra.teacher_question_mode==='FREEFORM' && e.extra.review_required;}).length;
    r.teacherPrivateOralReports = sup.filter(function(e){return e.support_provider==='TEACHER' && e.extra && e.extra.delivery_mode==='TEXT_AND_PRIVATE_ORAL';}).length;
    r.unapprovedText = sup.filter(function (e) { return !e.bank_id || (e.bank_id==='TEACHER_FREEFORM' && (!e.extra || e.extra.rule_validation!=='PASS')); }).length;
    r.reflectSignals = sup.filter(function (e) { return e.stage === 'Reflect' && CORRECTNESS.test(e.support_text || ''); }).length;
    r.controlAI = sup.filter(function (e) { return e.group === 'CONTROL' && e.support_provider === 'AI'; }).length;
    r.reciteBeforeStudent = sup.filter(function (e) { return e.stage === 'Recite' && (e.attempt_no || 0) === 0 && (e.support_level_after || 0) > 0; }).length;
    r.needsReview = events.filter(function (e) { return e.needs_review && (e.event_type === 'FIRST_SUBMIT' || e.event_type === 'RESUBMIT'); }).length;
    r.timeouts = events.filter(function (e) { return e.event_type === 'TIMEOUT' && e.transition_reason !== 'JOINED_AFTER_STAGE_CLOSED'; }).length;
    r.lateJoin = events.filter(function (e) { return e.event_type === 'TIMEOUT' && e.transition_reason === 'JOINED_AFTER_STAGE_CLOSED'; }).length;
    var maxLv = {};
    sup.forEach(function (e) { var k = e.student_id; maxLv[k] = Math.max(maxLv[k] || 0, e.support_level_after || 0); });
    r.maxLevelByStudent = maxLv;
    var waits = sup.filter(function (e) { return e.support_provider === 'TEACHER' && e.support_requested_at && e.support_sent_at; })
      .map(function (e) { return (Date.parse(e.support_sent_at) - Date.parse(e.support_requested_at)) / 1000; }).sort(function (a, b) { return a - b; });
    r.teacherWait = waits.length ? { n: waits.length, median: waits[Math.floor(waits.length / 2)], max: waits[waits.length - 1] } : { n: 0 };
    var mats = events.filter(function (e) { return e.event_type === 'MATERIAL_OPEN'; });
    r.materialInRecite = mats.filter(function (e) { return e.stage === 'Recite' || e.stage === 'Preview' || e.stage === 'Question' || e.stage === 'Review'; }).length;
    r.materialOpens = { EXPERIMENT: mats.filter(function (e) { return e.group === 'EXPERIMENT'; }).length, CONTROL: mats.filter(function (e) { return e.group === 'CONTROL'; }).length };
    r.reviewSnapshots = events.filter(function(e){return e.event_type==='REVIEW_PRE_SNAPSHOT';}).length;
    r.reviewFeedbackOpens = events.filter(function(e){return e.event_type==='REVIEW_FEEDBACK_OPEN';}).length;
    r.reviewPostReflections = events.filter(function(e){return e.event_type==='REVIEW_POST_REFLECTION';}).length;
    r.earlyReviewDisclosure = events.filter(function(e){
      return e.event_type==='REVIEW_FEEDBACK_OPEN' && e.extra && e.extra.release_at &&
        Date.parse(e.event_timestamp) < Date.parse(e.extra.release_at);
    }).length;
    r.supportCount = { AI: sup.filter(function (e) { return e.support_provider === 'AI' && (e.support_level_after || 0) > 0; }).length,
      TEACHER: sup.filter(function (e) { return e.support_provider === 'TEACHER' && (e.support_level_after || 0) > 0; }).length };
    return r;
  }

  var API = {
    STAGE: STAGE, ITEM: ITEM, resolveItem: resolveItem, itemsForStage: itemsForStage, plain: plain, norm: norm, compact: compact,
    numVal: numVal, detect: detect, cong: cong, congPairs: congPairs, classifyOpts: classifyOpts, circNums: circNums, multiSet: multiSet,
    judgeRule: judgeRule, buildJudgePrompt: buildJudgePrompt, parseJudge: parseJudge, combine: combine, PROP_KEYS: PROP_KEYS, STATE_KEYS: STATE_KEYS,
    pickEntry: pickEntry, newRec: newRec, onSubmit: onSubmit, onHelp: onHelp, onStageClose: onStageClose,
    teacherOptions: teacherOptions, bankFor: bankFor, applyTeacherSupport: applyTeacherSupport,
    checkOutput: checkOutput, leakCheck: leakCheck, buildPhrasePrompt: buildPhrasePrompt, fidelity: fidelity, isCopy: isCopy, fieldValueText: fieldValueText
  };
  root.PQ_ENGINE = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
