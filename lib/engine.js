/* PQ4R 판정·수준 전환 엔진 (순수 함수)
 * 1층 규칙 판정 → 2층 AI 분류(선택, 앱에서 호출) → 3층 보류(의미 확인 + 사람 검토)
 * 수준 전환은 04 규칙을 따른다. AI는 수준을 정하지 않는다.
 * 운영판에서는 이 파일 전체가 서버로 이동한다. */
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
    var g = (it.byGroup && it.byGroup[group]) || {};
    var sub = g.sub || null;
    if (sub === 'RF03_SWITCH') {
      sub = (settings && settings.controlRF03 === 'original') ? C.CONTROL_RF_SUB.RF03_original : C.CONTROL_RF_SUB.RF03_neutral;
    }
    return {
      id: it.id, stage: it.stage, mark: it.mark, kind: it.kind, recall: it.recall || null,
      title: g.title || it.title, sub: sub, problem: it.problem || null, groupTitle: it.groupTitle || null,
      fixedAI: g.fixedAI ? C.FIXED_AI[g.fixedAI] : null,
      fields: g.fields || it.fields
    };
  }
  function itemsForStage(stageId, group, settings) {
    return C.ITEMS.filter(function (it) { return it.stage === stageId; }).map(function (it) { return resolveItem(it.id, group, settings); });
  }

  /* ---------- 텍스트 정규화 ---------- */
  function plain(s) { return String(s == null ? '' : s).replace(/\{([A-DO]{2})\}/g, '$1'); }
  function norm(s) {
    s = String(s == null ? '' : s);
    if (s.normalize) s = s.normalize('NFKC');
    s = s.replace(/̅/g, '')
      .replace(/[−–—]/g, '-').replace(/×/g, '*').replace(/÷/g, '/')
      .replace(/[“”"‘’']/g, '')
      .replace(/[a-wyz]/g, function (ch) { return ch.toUpperCase(); })
      .replace(/(\d)\s*(?:°|도(?![형]))/g, '$1')
      .replace(/(\d)\s*(?:cm|CM|센티미터|센티)/g, '$1')
      .replace(/°/g, '');
    return s;
  }
  function spaced(s) { return norm(s).replace(/\s+/g, ' ').trim(); }
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
    s = s.replace(/^∠?[A-D]/, '');
    if (/^[0-9+\-*/().]+$/.test(s)) { try { var v = evalExpr(s); return isFinite(v) ? Math.round(v * 1000) / 1000 : null; } catch (e) { /* fallthrough */ } }
    var nums = compact(raw).match(/\d+(\.\d+)?/g);
    if (nums && nums.length === 1) return parseFloat(nums[0]);
    if (nums && nums.length > 1) return parseFloat(nums[nums.length - 1]);
    return null;
  }
  function eqNum(a, b) { return a != null && Math.abs(a - b) < 1e-6; }

  /* ---------- 등식 쌍 ---------- */
  function canonTerm(t) {
    if (/^\d/.test(t)) return { kind: 'num', v: parseFloat(t) };
    var ang = /^∠([A-D])$/.exec(t) || /^([A-D])$/.exec(t) || /^∠([A-D]{3})$/.exec(t);
    if (ang) { var a = ang[1]; if (a.length === 3) a = a[1]; return { kind: 'ang', v: a }; }
    if (/^[A-DO]{2}$/.test(t)) return { kind: 'seg', v: t.split('').sort().join('') };
    return null;
  }
  function eqInfo(text) {
    var s = norm(text).replace(/\s+/g, ' ');
    var out = { pairs: {}, values: [] };
    var re = /(?:∠[A-D]{1,3}|[A-DO]{1,2}|\d+(?:\.\d+)?)(?:\s*=\s*(?:∠[A-D]{1,3}|[A-DO]{1,2}|\d+(?:\.\d+)?))+/g;
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

  /* ---------- 성질 탐지 ---------- */
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
      var hasAngle = /각/.test(noShape) || /∠/.test(cl) || /(^|[^A-DO])[A-D](?![A-DO])/.test(cl);
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
      if (/평행/.test(cl) && !neg) P.P_PARALLEL = true;
    });
    // 등식으로 드러난 관계
    if (hasPair(info, 'seg', 'AB', 'CD') || hasPair(info, 'seg', 'BC', 'AD')) P.P_OPP_SIDES = true;
    if (hasPair(info, 'ang', 'A', 'C') || hasPair(info, 'ang', 'B', 'D')) P.P_OPP_ANGLES = true;
    ['A|B', 'B|C', 'C|D', 'A|D'].forEach(function (k) {
      if (info.pairs['sum:' + k]) P.P_ADJ_180 = true;
      if (info.pairs['ang:' + k]) P.M_ADJ_EQUAL = true;
    });
    var bAC = hasPair(info, 'seg', 'AO', 'CO'), bBD = hasPair(info, 'seg', 'BO', 'DO');
    if (bAC && bBD) P.P_DIAG_BISECT = true; else if (bAC || bBD) P.BISECT_ONE = true;
    if (hasPair(info, 'seg', 'AC', 'BD')) P.M_DIAG_EQUAL = true;
    if (/5X\+30=180|3X\+10\+2X\+20=180|5x\+30=180|3x\+10\+2x\+20=180/.test(c)) P.P_ADJ_180 = true;
    if (/3x\+10=2x\+20/.test(c) && !NEG.test(c)) P.M_ADJ_EQUAL = true;
    if (/(180-|180−)/.test(c)) P.P_ADJ_180 = true;
    // 도형 선택 근거
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

  var ANSWER_REQ = /(답|정답|풀이|해설|과정)(만|좀|을|를|이나|부터)?(알려|가르쳐|말해|보여|써줘|줘|주세요)|알려줘|가르쳐줘|답뭐|답이뭐/;
  var UNCERTAIN = /(모르겠|몰라|모름|잘모르|헷갈|모르겟|모르것|노이해|이해가안)/;
  var DOMAIN = /(변|각|대각선|평행|사각형|길이|크기|성질|교점|이등분|180|O|AO|OC|BO|OD|AB|BC|CD|AD|AC|BD)/;
  var PROCESS = /(Preview|Question|Read|Reflect|Recite|Review|PREVIEW|QUESTION|READ|REFLECT|RECITE|REVIEW|훑어보기|질문|읽기|되돌아|반성|자기설명|암송|복습|AI|조건|성질|확인|점검|그림|풀이|검토|비교)/;

  function lcsRatio(a, b) {
    if (!a || !b) return 0;
    a = a.slice(0, 240); b = b.slice(0, 400);
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

  function judgeRule(itemId, group, fields, selections, settings) {
    fields = fields || {};
    var it = resolveItem(itemId, group, settings);
    var texts = it.fields.map(function (f) { var v = fields[f.key]; return f.kind === 'choice' ? '' : (v || ''); });
    var all = texts.join(' | ');
    var sel = allSel(selections);
    var empty = it.fields.every(function (f) { return isBlank(fields[f.key]); });
    if (empty) return R('NO_START', { decisive: true, flag: 'empty' });
    if (ANSWER_REQ.test(compact(all)) && compact(all).length < 40) return R('INVALID_RESPONSE', { misc: 'answer_request', decisive: true, flag: 'empty' });
    var copySources = [it.title, it.sub || '', it.problem || ''];
    if (it.fixedAI) copySources.push(it.fixedAI.text);
    if (isCopy(all, copySources)) return R('INVALID_RESPONSE', { misc: 'copy', decisive: true, flag: 'text' });
    var P = detect(all, sel);
    var k = it.kind;

    if (k === 'rd01') {
      var b = numVal(fields.angB), cc = numVal(fields.angC), d = numVal(fields.angD);
      var workC = compact(fields.work || '');
      var anyNum = b != null || cc != null || d != null;
      if (!anyNum && UNCERTAIN.test(workC) && workC.length < 20) return R('NO_START', { decisive: true, flag: 'empty' });
      if (/(모두|다|전부|네각)(다)?68/.test(compact(all)) || (eqNum(b, 68) && eqNum(cc, 68) && eqNum(d, 68))) return R('MISAPPLIED_PROPERTY', { misc: 'all_equal', decisive: true, flag: 'num_check' });
      var adj = P.P_ADJ_180 || /180/.test(compact(fields.angB || '') + compact(fields.angD || ''));
      var opp = P.P_OPP_ANGLES || (/A/.test(compact(fields.angC || '')) && /(=|같)/.test(compact(fields.angC || ''))) || (/B/.test(compact(fields.angD || '')) && /(=|같)/.test(compact(fields.angD || '')));
      var correct = eqNum(b, 112) && eqNum(cc, 68) && eqNum(d, 112);
      if (correct) {
        if (adj && opp) return R('CLEAR_INDEPENDENT', { decisive: true, flag: 'num_ok' });
        if (!adj && !opp) return R('CORRECT_NO_REASON', { decisive: isBlank(fields.work), flag: 'num_ok' });
        return R('PARTIAL', { misc: 'reason_partial', missing: adj ? ['P_OPP_ANGLES'] : ['P_ADJ_180'], flag: 'num_ok' });
      }
      if (eqNum(b, 68) && eqNum(cc, 112) && eqNum(d, 68)) return R('MISAPPLIED_PROPERTY', { misc: 'opp_adj_swap', decisive: true, flag: 'num_check' });
      if (eqNum(b, 68) || eqNum(d, 68) || P.M_ADJ_EQUAL) return R('MISAPPLIED_PROPERTY', { misc: 'adj_equal', decisive: true, flag: 'num_check' });
      if (b == null || cc == null || d == null) {
        if (!anyNum) return R('AMBIGUOUS', { misc: 'no_values', flag: 'num_check' });
        return R('PARTIAL', { misc: 'missing_values', flag: 'num_check' });
      }
      if (adj || opp) return R('PARTIAL', { misc: 'calc', flag: 'num_check' });
      return R('MISAPPLIED_PROPERTY', { misc: 'unknown', flag: 'num_check' });
    }

    if (k === 'rd02') {
      var oc = numVal(fields.OC), od = numVal(fields.OD);
      var bis = P.P_DIAG_BISECT || (/AO|OA/.test(compact(fields.OC || '')) && /BO|OB/.test(compact(fields.OD || '')));
      var half = P.BISECT_ONE;
      if (oc == null && od == null && UNCERTAIN.test(compact(all))) return R('NO_START', { decisive: true, flag: 'empty' });
      if (eqNum(oc, 3) && eqNum(od, 4.5)) {
        if (bis) return R('CLEAR_INDEPENDENT', { decisive: true, flag: 'num_ok' });
        if (half) return R('PARTIAL', { misc: 'reason_partial', missing: ['P_DIAG_BISECT'], flag: 'num_ok' });
        return R('CORRECT_NO_REASON', { decisive: isBlank(fields.work), flag: 'num_ok' });
      }
      if (eqNum(oc, 4.5) && eqNum(od, 3)) return R('MISAPPLIED_PROPERTY', { misc: 'swap', decisive: true, flag: 'num_check' });
      if ((oc != null && od != null && eqNum(oc, od)) || P.M_DIAG_EQUAL) return R('MISAPPLIED_PROPERTY', { misc: 'diag_equal', decisive: true, flag: 'num_check' });
      if (oc == null || od == null) return R('PARTIAL', { misc: 'missing_values', flag: 'num_check' });
      if (bis || half) return R('PARTIAL', { misc: 'calc', flag: 'num_check' });
      return R('MISAPPLIED_PROPERTY', { misc: 'unknown', flag: 'num_check' });
    }

    if (k === 'rd03') {
      if (UNCERTAIN.test(compact(all)) && compact(all).length < 16) return R('NO_START', { decisive: true, flag: 'text' });
      if (P.M_DIAG_EQUAL) return R('MISAPPLIED_PROPERTY', { misc: 'diag_equal', decisive: true, flag: 'text' });
      var need = ['P_OPP_ANGLES', 'P_ADJ_180', 'P_DIAG_BISECT'];
      var miss = need.filter(function (p) { return !P[p]; });
      if (!miss.length) return R('CLEAR_INDEPENDENT', { decisive: true, flag: 'text' });
      if (miss.length < need.length || P.BISECT_ONE) return R('PARTIAL', { misc: 'missing', missing: miss, flag: 'text' });
      return R('AMBIGUOUS', { misc: 'no_property', flag: 'text' });
    }

    if (k === 'rf01' || k === 'rf02' || k === 'rf03') {
      var use = fields.use || '';
      var txt = compact(all);
      var trust = /(맞아|맞는|맞다|맞음|믿|그대로|정확|AI가맞|AI말)/.test(txt) && !/(틀|아니|않|모르|없)/.test(txt);
      if (group === 'CONTROL') use = '';
      if (k === 'rf01') {
        var fin = compact((fields.final || '') + '|' + (fields.first || ''));
        var finOk = (/(CD|DC)=?8/.test(fin) || /8/.test(fin)) && (/(AD|DA)=?5/.test(fin) || /5/.test(fin)) && !/(CD|DC)=?5|(AD|DA)=?8/.test(fin);
        var swapped = /(CD|DC)=?5|(AD|DA)=?8/.test(fin);
        if (swapped) return R('MISAPPLIED_PROPERTY', { misc: 'adj_side_confusion', decisive: true, flag: 'num_check' });
        if (use === 'accept' && !P.P_OPP_SIDES) return R('REFLECT_UNCRITICAL', { decisive: !isBlank(fields.judgment) && compact(fields.judgment).length < 20, flag: 'text' });
        if (use === 'accept' && P.P_OPP_SIDES && finOk) return R('CLEAR_INDEPENDENT', { decisive: true, flag: 'num_ok' });
        if (use === 'accept' && P.P_OPP_SIDES) return R('PARTIAL', { misc: 'final_missing', flag: 'num_check' });
        if (use === 'reject' || use === 'partial') return R('MISAPPLIED_PROPERTY', { misc: 'reject_valid', flag: finOk ? 'num_ok' : 'num_check' });
        if (P.P_OPP_SIDES && finOk) return group === 'CONTROL' ? R('CLEAR_INDEPENDENT', { decisive: true, flag: 'num_ok' }) : R('PARTIAL', { misc: 'use_missing', flag: 'num_ok' });
        if (finOk) return R('CORRECT_NO_REASON', { flag: 'num_ok' });
        if (trust) return R('REFLECT_UNCRITICAL', { flag: 'text' });
        return R('AMBIGUOUS', { flag: 'num_check' });
      }
      if (k === 'rf02') {
        var undStrong = /(BO|OB|OD|DO|BD|DB)[^|]{0,14}(모르|모름|알수없|정할수없|구할수없|단정할수없|확정할수없|주어지지|안나와|없)/.test(txt) || /(알수없|정할수없|구할수없|단정할수없|모르)[^|]{0,6}(BO|OB|OD|DO|BD|DB)/.test(txt);
        var und = undStrong || (/(알수없|알수가없|모르|모름|정할수없|구할수없|단정할수없|확정할수없|결정할수없|정보가(없|부족)|주어지지않|나와있지않)/.test(txt) && /(BO|OB|OD|DO|BD|DB)/.test(txt));
        var ao7 = /(AO|OA)=(OC|CO)=7|(AO|OA)=7|(OC|CO)=7|(AO|OA)와(OC|CO)(는|가|도)?(각각|모두)?7|7cm/.test(txt) || /7/.test(compact(fields.final || ''));
        var bo7 = /(BO|OB)=(OD|DO)=7|(BO|OB)=7|(OD|DO)=7|(BO|OB)와(OD|DO)(도|는|가)?(각각|모두)?7/.test(txt);
        if (und && (P.P_DIAG_BISECT || P.BISECT_ONE || ao7)) return R('CLEAR_INDEPENDENT', { decisive: undStrong, flag: 'num_ok' });
        if (und) return R('PARTIAL', { misc: 'missing_ao_oc', flag: 'num_check' });
        if (P.M_DIAG_EQUAL) return R('MISAPPLIED_PROPERTY', { misc: 'diag_equal', decisive: true, flag: 'num_check' });
        if (use === 'accept' || (bo7 && trust) || (group !== 'CONTROL' && trust && !use)) return R('REFLECT_UNCRITICAL', { decisive: bo7 || compact(all).length < 20, flag: 'num_check' });
        if (bo7) return R('MISAPPLIED_PROPERTY', { misc: 'bo_assumed', decisive: true, flag: 'num_check' });
        return R('PARTIAL', { misc: 'reason_missing', flag: 'num_check' });
      }
      if (k === 'rf03') {
        var fx = compact((fields.final || '') + '|' + (fields.first || '') + '|' + (fields.judgment || ''));
        var mx = /x=(\d+(?:\.\d+)?)/.exec(fx) || /X=(\d+(?:\.\d+)?)/.exec(fx);
        var xv = mx ? parseFloat(mx[1]) : numVal(fields.final);
        var adjE = P.P_ADJ_180;
        if (eqNum(xv, 30) && adjE) return R('CLEAR_INDEPENDENT', { decisive: true, flag: 'num_ok' });
        if (use === 'accept' || (eqNum(xv, 10) && trust)) return R('REFLECT_UNCRITICAL', { decisive: true, flag: 'num_check' });
        if (P.M_ADJ_EQUAL || eqNum(xv, 10)) return R('MISAPPLIED_PROPERTY', { misc: 'adj_equal', decisive: true, flag: 'num_check' });
        if (eqNum(xv, 30)) return R('CORRECT_NO_REASON', { decisive: isBlank(fields.judgment) && isBlank(fields.property), flag: 'num_ok' });
        if (adjE && xv != null) return R('PARTIAL', { misc: 'calc', flag: 'num_check' });
        if (trust) return R('REFLECT_UNCRITICAL', { flag: 'text' });
        return R('AMBIGUOUS', { flag: 'num_check' });
      }
    }

    if (k === 'rc01') {
      if (UNCERTAIN.test(compact(all)) && compact(all).length < 14) return R('NO_START', { decisive: true, flag: 'text' });
      if (P.M_ALL_SIDES_EQUAL) return R('MISAPPLIED_PROPERTY', { misc: 'all_sides_equal', decisive: true, flag: 'text' });
      if (P.P_OPP_SIDES) return R('CLEAR_INDEPENDENT', { decisive: true, flag: 'text' });
      if (P.mentionSide) return R('AMBIGUOUS', { misc: 'vague_side', flag: 'text' });
      return R('AMBIGUOUS', { flag: 'text' });
    }
    if (k === 'rc02') {
      if (UNCERTAIN.test(compact(all)) && compact(all).length < 14) return R('NO_START', { decisive: true, flag: 'text' });
      if (P.M_ALL_ANGLES_EQUAL) return R('MISAPPLIED_PROPERTY', { misc: 'all_angles_equal', decisive: true, flag: 'text' });
      if (P.M_ADJ_EQUAL && !P.P_ADJ_180) return R('MISAPPLIED_PROPERTY', { misc: 'adj_equal', decisive: true, flag: 'text' });
      if (P.P_OPP_ANGLES && P.P_ADJ_180) return R('CLEAR_INDEPENDENT', { decisive: true, flag: 'text' });
      if (P.P_OPP_ANGLES || P.P_ADJ_180) return R('PARTIAL', { misc: 'missing', missing: P.P_OPP_ANGLES ? ['P_ADJ_180'] : ['P_OPP_ANGLES'], decisive: true, flag: 'text' });
      return R('AMBIGUOUS', { flag: 'text' });
    }
    if (k === 'rc03') {
      if (UNCERTAIN.test(compact(all)) && compact(all).length < 14) return R('NO_START', { decisive: true, flag: 'text' });
      if (P.M_DIAG_EQUAL && !P.P_DIAG_BISECT) return R('MISAPPLIED_PROPERTY', { misc: 'diag_equal', decisive: true, flag: 'text' });
      if (P.P_DIAG_BISECT) return R('CLEAR_INDEPENDENT', { decisive: true, flag: 'text' });
      if (P.BISECT_ONE) return R('PARTIAL', { misc: 'bisect_one', missing: ['P_DIAG_BISECT'], flag: 'text' });
      if (P.BISECT_VAGUE) return R('AMBIGUOUS', { misc: 'bisect_vague', decisive: true, flag: 'text' });
      return R('AMBIGUOUS', { flag: 'text' });
    }
    if (k === 'rc04') {
      var t4 = compact(all);
      if (UNCERTAIN.test(t4) && t4.length < 14) return R('SELF_REPORT_UNCERTAIN', { flag: 'text' });
      var reasonM = /(때문|므로|니까|이유|왜냐|평행|엇각|동위각|합동|삼각형|증명|그래서|따라서|이므로|하면)/.test(t4);
      if (reasonM && t4.length >= 12) return R('CLEAR_INDEPENDENT', { flag: 'text' });
      if (P.P_OPP_SIDES || P.P_OPP_ANGLES || P.P_ADJ_180 || P.P_DIAG_BISECT) return R('PARTIAL', { misc: 'keyword_list', flag: 'text' });
      return R('AMBIGUOUS', { flag: 'text' });
    }
    // 열린 문항: PV, QU, RV
    var t = compact(all);
    if (k === 'question') {
      var qForm = /(\?|까$|까\?|나요|가요|을까|일까|인가|는가|는지|을지|ㄹ지|할까|될까|왜|어떻게|무엇|뭘|뭐)/.test(t);
      if (UNCERTAIN.test(t) && t.length < 12) return R('NO_START', { flag: 'text' });
      if (qForm && DOMAIN.test(t)) return R('CLEAR_INDEPENDENT', { flag: 'text' });
      if (qForm) return R('PARTIAL', { misc: 'broad', flag: 'text' });
      if (/\d/.test(t) || P.P_OPP_SIDES || P.P_OPP_ANGLES || P.P_DIAG_BISECT) return R('INVALID_RESPONSE', { misc: 'not_question', flag: 'text' });
      return R('PARTIAL', { misc: 'broad', flag: 'text' });
    }
    if (UNCERTAIN.test(t) && t.length < 16) return R(itemId === 'PV01' || itemId === 'PV02' || itemId === 'QU02' ? 'NO_START' : 'SELF_REPORT_UNCERTAIN', { decisive: true, flag: 'text' });
    if (itemId === 'RV04' && /(무조건|그냥|다)(믿|따르|따라)/.test(t)) return R('PARTIAL', { misc: 'uncritical_plan', flag: 'text' });
    if (t.length >= 12 && (DOMAIN.test(t) || PROCESS.test(t))) return R('CLEAR_INDEPENDENT', { flag: 'text' });
    return R('PARTIAL', { misc: 'not_specific', flag: 'text' });
  }

  /* ---------- AI 판정 프롬프트 ---------- */
  var STATE_KEYS = Object.keys(C.STATES);
  var PROP_KEYS = ['P_OPP_SIDES', 'P_OPP_ANGLES', 'P_ADJ_180', 'P_DIAG_BISECT', 'P_PARALLEL'];
  function selText(selections) {
    var lines = [];
    Object.keys(selections || {}).forEach(function (k) { if ((selections[k] || []).length) lines.push(k + ': ' + selections[k].map(function (e) { return e.split(':')[1]; }).join(', ')); });
    return lines.length ? lines.join('\n') : '(선택 없음)';
  }
  function buildJudgePrompt(itemId, group, fields, selections, settings) {
    var it = resolveItem(itemId, group, settings);
    var rb = C.RUBRIC[itemId];
    var lines = [];
    lines.push('너는 중학교 2학년 수학 활동지 응답을 분류하는 채점 보조자다. 분류 결과는 학생에게 보이지 않는다. 정답을 설명하거나 학생에게 말을 걸지 않는다.');
    lines.push('');
    lines.push('[단계] ' + it.stage + ' / [문항] ' + itemId + ': ' + plain(it.title));
    if (it.problem) lines.push('[문제] ' + plain(it.problem));
    if (it.sub) lines.push('[지시] ' + plain(it.sub));
    if (it.fixedAI) lines.push('[학생이 검토하는 고정 AI 응답] ' + plain(it.fixedAI.text));
    lines.push('[비공개 기준] 기대: ' + rb.expected + ' / 인정: ' + rb.accepted + ' / 흔한 오개념: ' + rb.misconceptions);
    if (rb.add) lines.push('[추가 기준] ' + rb.add);
    lines.push('[학생 응답]');
    it.fields.forEach(function (f) {
      var v = fields[f.key];
      if (f.kind === 'choice') { var o = (f.options || []).filter(function (x) { return x.v === v; })[0]; v = o ? o.label : ''; }
      lines.push('- ' + plain(f.label) + ': ' + (isBlank(v) ? '(빈칸)' : String(v).slice(0, 600)));
    });
    lines.push('[도형에서 선택한 요소]');
    lines.push(selText(selections));
    lines.push('');
    lines.push('[분류 상태] 아래 중 정확히 하나를 고른다.');
    STATE_KEYS.forEach(function (k) { lines.push('- ' + k + ': ' + C.STATES[k]); });
    lines.push('');
    lines.push('[규칙]');
    lines.push('- 표현이 달라도 수학적으로 같은 뜻이면 같은 것으로 본다. 예: AO=OC, “AO와 OC의 길이가 같다”, “대각선 AC는 O에서 반으로 나뉜다”는 같은 관계다.');
    lines.push('- 뜻이 다른 표현은 구분한다. 예: AC=BD(두 대각선의 길이가 같다)는 “서로를 이등분한다”와 다르다.');
    lines.push('- 답이 맞아도 필요한 근거가 없으면 CLEAR_INDEPENDENT가 아니다(CORRECT_NO_REASON).');
    lines.push('- Preview·Question·Review처럼 정답이 없는 문항은 맞고 틀림이 아니라 진지한 시도와 구체성으로 판단한다. 구체적이면 CLEAR_INDEPENDENT, 막연하면 PARTIAL, 자신의 불확실함을 밝히면 SELF_REPORT_UNCERTAIN. “도움이 없었다”, “아직 모르겠다”는 오답이 아니다.');
    lines.push('- Reflect에서 학생이 조건과 성질을 확인하지 않고 AI 응답을 받아들이면 REFLECT_UNCRITICAL.');
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
  var MATH_ITEMS = /^(RD|RF|RC0[1-3])/;
  function combine(itemId, group, rule, aiResults, aiEnabled) {
    var base = { state: rule.state, misc: rule.misc, missing: rule.missing, flag: rule.flag, source: 'rule', agree: null, needsReview: false, ai: aiResults || null };
    if (rule.decisive || group === 'CONTROL' || !aiEnabled) {
      base.needsReview = !rule.decisive && MATH_ITEMS.test(itemId) && group !== 'CONTROL';
      if (group === 'CONTROL') base.needsReview = false;
      return base;
    }
    var ok = (aiResults || []).filter(Boolean);
    if (!ok.length) { base.source = 'rule(ai_unavailable)'; base.needsReview = MATH_ITEMS.test(itemId); return base; }
    if (ok.length === 1) {
      return Object.assign(base, { state: ok[0].state, misc: ok[0].misc || rule.misc, missing: ok[0].missing.length ? ok[0].missing : rule.missing, source: 'ai(1회)', agree: null, needsReview: MATH_ITEMS.test(itemId) && ok[0].state !== rule.state });
    }
    if (ok[0].state === ok[1].state) {
      return Object.assign(base, { state: ok[0].state, misc: ok[0].misc || rule.misc, missing: ok[0].missing.length ? ok[0].missing : rule.missing, source: 'ai(2회 일치)', agree: true });
    }
    return Object.assign(base, { state: 'AMBIGUOUS', misc: 'ai_disagree', source: 'hold', agree: false, needsReview: true });
  }

  /* ---------- 발문 은행 선택 ---------- */
  function pickEntry(itemId, level, state, misc, missing, group, variant, avoidId) {
    var keys = [];
    if (missing && missing.length) keys.push(state + ':' + missing[0]);
    if (misc) keys.push(state + ':' + misc);
    keys.push(state); keys.push('*');
    var pool = C.BANK.filter(function (e) { return e.item === itemId && e.level === level && (!e.group || e.group === group); });
    for (var i = 0; i < keys.length; i++) {
      var c = pool.filter(function (e) { return e.state === keys[i]; });
      if (!c.length) continue;
      var pref = c.filter(function (e) { return e.variant === variant && e.id !== avoidId; })[0];
      var any = c.filter(function (e) { return e.id !== avoidId; })[0];
      if (pref) return pref; if (any) return any;
    }
    return null;
  }

  function newRec() {
    return { attempts: 0, level: 0, levelSetAttempt: 0, maxLevel: 0, state: null, misc: null, missing: [], status: 'open', performance: null,
      supportCount: 0, sameLevelRepeats: 0, lastSupportAttempt: 0, lastEntryId: null, fading: null, helpCount: 0, needsReview: false };
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function supportOut(entry, level, trigger, reason, extra) {
    return Object.assign({ kind: 'support', level: level, entryId: entry.id, text: entry.text, type: entry.type || (C.LEVEL_TAGS[level] || {}).type || null,
      mechanism: entry.mechanism || (C.LEVEL_TAGS[level] || {}).mechanism || null, trigger: trigger, reason: reason, requiresResubmission: level > 0 }, extra || {});
  }

  function chooseSupport(rec, itemId, level, group, variant, judgment) {
    var st = judgment ? judgment.state : rec.state;
    var misc = judgment ? judgment.misc : rec.misc;
    /* 공통 응답(답 요청·복사·무관·뜻 확인)은 수준 1의 첫 지원에만 쓴다.
     * 같은 수준 재표현과 수준 상승에서는 문항 발문을 써서 같은 문장 반복과 '기록된 수준 ≠ 실제 발문'을 막는다. */
    var commonOK = level === 1 && !/^C-/.test(rec.lastEntryId || '');
    if (commonOK && st === 'INVALID_RESPONSE' && misc === 'answer_request') return C.COMMON.ANSWER_REQUEST;
    if (commonOK && st === 'INVALID_RESPONSE' && misc === 'copy') return C.COMMON.COPY;
    if (commonOK && st === 'INVALID_RESPONSE' && misc === 'off_topic') return C.COMMON.OFF_TOPIC;
    var e = pickEntry(itemId, level, st, misc, judgment ? judgment.missing : rec.missing, group, variant, rec.lastEntryId);
    if (commonOK && st === 'AMBIGUOUS' && level === 1 && (!e || e.state === '*')) {
      var own = pickEntry(itemId, 1, 'AMBIGUOUS', null, null, group, variant, rec.lastEntryId);
      return own && own.state === 'AMBIGUOUS' ? own : C.COMMON.AMBIGUOUS;
    }
    return e || pickEntry(itemId, level, '*', null, null, group, 'a', null);
  }

  /* 제출 */
  function onSubmit(recIn, judgment, ctx) {
    var rec = clone(recIn || newRec());
    var st = STAGE[ctx.stage];
    var out = [], events = [];
    rec.attempts += 1;
    rec.state = judgment.state; rec.misc = judgment.misc; rec.missing = judgment.missing || [];
    rec.needsReview = !!judgment.needsReview;
    var before = rec.level;
    if (judgment.state === 'CLEAR_INDEPENDENT') {
      rec.status = 'clear';
      rec.performance = ctx.group === 'CONTROL' ? 'NOT_ASSESSED' : (rec.supportCount > 0 ? 'ASSISTED_SUCCESS' : 'INDEPENDENT_SUCCESS');
      var fade = 'NOT_OBSERVED';
      var pair = C.FADING_PAIRS[ctx.itemId];
      if (pair && ctx.settings && ctx.settings.fadingPairs && ctx.recs && ctx.recs[pair] && ctx.group !== 'CONTROL') {
        var early = ctx.recs[pair];
        fade = (early.supportCount > 0 && rec.supportCount === 0) ? 'DECREASED' : 'NONE';
      }
      rec.fading = fade;
      events.push({ type: 'STATE_CHANGE', performance: rec.performance, fading: fade, reason: 'CLEAR_ON_ATTEMPT_' + rec.attempts });
      if (before > 0) { rec.level = 0; events.push({ type: 'LEVEL_CHANGE', before: before, after: 0, reason: 'CLEAR_RESET' }); }
      if (ctx.group === 'EXPERIMENT' && st.auto) out.push({ kind: 'support', level: 0, entryId: C.COMMON.ACK.id, text: C.COMMON.ACK.text, type: null, mechanism: null, trigger: 'AUTO_ON_SUBMIT', reason: 'CLEAR_ACK', requiresResubmission: false, ack: true });
      return { rec: rec, out: out, events: events };
    }
    rec.status = 'open'; rec.performance = null; rec.fading = null;
    if (ctx.group === 'CONTROL' || !st.auto) return { rec: rec, out: out, events: events };
    if (before === 0) {
      var e1 = chooseSupport(rec, ctx.itemId, 1, ctx.group, 'a', judgment);
      rec.level = 1; rec.levelSetAttempt = rec.attempts; rec.maxLevel = Math.max(rec.maxLevel, 1); rec.supportCount += 1; rec.lastSupportAttempt = rec.attempts; rec.lastEntryId = e1.id; rec.sameLevelRepeats = 0;
      events.push({ type: 'LEVEL_CHANGE', before: 0, after: 1, reason: judgment.state === 'AMBIGUOUS' ? 'AMBIGUOUS_MEANING_CHECK' : (judgment.misc === 'answer_request' ? 'ANSWER_REQUEST_BLOCK' : 'AUTO_L1_ON_SUBMIT') });
      out.push(supportOut(e1, 1, 'AUTO_ON_SUBMIT', 'AUTO_L1_ON_SUBMIT'));
      return { rec: rec, out: out, events: events };
    }
    // 지원 후 재제출했으나 여전히 부족
    if (before >= st.cap) {
      rec.status = 'unresolved'; rec.performance = 'UNRESOLVED';
      events.push({ type: 'STATE_CHANGE', performance: 'UNRESOLVED', reason: 'CAP_REACHED_UNRESOLVED' });
      out.push({ kind: 'support', level: before, entryId: C.COMMON.UNRESOLVED.id, text: C.COMMON.UNRESOLVED.text, type: '절차', mechanism: '구조화', trigger: 'AUTO_ON_SUBMIT', reason: 'CAP_REACHED_UNRESOLVED', requiresResubmission: false });
      return { rec: rec, out: out, events: events };
    }
    if (rec.sameLevelRepeats < 1) {
      var e2 = chooseSupport(rec, ctx.itemId, before, ctx.group, 'b', judgment);
      rec.sameLevelRepeats += 1; rec.supportCount += 1; rec.lastSupportAttempt = rec.attempts; rec.lastEntryId = e2.id;
      out.push(supportOut(e2, before, 'AUTO_ON_SUBMIT', 'AUTO_SAME_LEVEL_REPHRASE', { hintHelp: true }));
    } else {
      out.push({ kind: 'system', text: '더 도움이 필요하면 ‘도움 요청’을 누르세요.', reason: 'AUTO_NO_REPEAT' });
    }
    return { rec: rec, out: out, events: events };
  }

  /* 도움 요청 버튼 */
  function onHelp(recIn, ctx) {
    var rec = clone(recIn || newRec());
    var st = STAGE[ctx.stage];
    var out = [], events = [];
    rec.helpCount += 1;
    if (ctx.group === 'CONTROL') {
      out.push({ kind: 'request', reason: 'CONTROL_REQUEST' });
      out.push({ kind: 'system', text: C.COMMON.WAIT_TEACHER.text, reason: 'WAIT_TEACHER' });
      return { rec: rec, out: out, events: events };
    }
    if (rec.attempts === 0) {
      out.push({ kind: 'support', level: 0, entryId: C.COMMON.PRE_SUBMIT.id, text: C.COMMON.PRE_SUBMIT.text, type: '절차', mechanism: '구조화', trigger: 'STUDENT_REQUEST', reason: 'HELP_PRE_SUBMIT_L0', requiresResubmission: false });
      return { rec: rec, out: out, events: events };
    }
    if (rec.status === 'clear') {
      out.push({ kind: 'support', level: 0, entryId: C.COMMON.ALREADY_DONE.id, text: C.COMMON.ALREADY_DONE.text, type: null, mechanism: null, trigger: 'STUDENT_REQUEST', reason: 'ALREADY_CLEAR', requiresResubmission: false, ack: true });
      return { rec: rec, out: out, events: events };
    }
    if (rec.status === 'unresolved') {
      out.push({ kind: 'support', level: rec.level, entryId: C.COMMON.UNRESOLVED.id, text: C.COMMON.UNRESOLVED.text, type: '절차', mechanism: '구조화', trigger: 'STUDENT_REQUEST', reason: 'ALREADY_UNRESOLVED', requiresResubmission: false });
      return { rec: rec, out: out, events: events };
    }
    var before = rec.level;
    var resubmitted = rec.attempts > (rec.levelSetAttempt || 0);
    if (before === 0 || resubmitted) {
      var target = before === 0 ? 1 : before + 1;
      if (target > st.cap) {
        rec.status = 'unresolved'; rec.performance = 'UNRESOLVED';
        events.push({ type: 'STATE_CHANGE', performance: 'UNRESOLVED', reason: 'CAP_REACHED_UNRESOLVED' });
        out.push({ kind: 'support', level: before, entryId: C.COMMON.UNRESOLVED.id, text: C.COMMON.UNRESOLVED.text, type: '절차', mechanism: '구조화', trigger: 'STUDENT_REQUEST', reason: 'CAP_REACHED_UNRESOLVED', requiresResubmission: false });
        return { rec: rec, out: out, events: events };
      }
      var e = chooseSupport(rec, ctx.itemId, target, ctx.group, 'a', null);
      rec.level = target; rec.levelSetAttempt = rec.attempts; rec.maxLevel = Math.max(rec.maxLevel, target); rec.supportCount += 1; rec.lastSupportAttempt = rec.attempts; rec.lastEntryId = e.id; rec.sameLevelRepeats = 0;
      events.push({ type: 'LEVEL_CHANGE', before: before, after: target, reason: before === 0 ? 'HELP_FIRST_SUPPORT' : 'HELP_ESCALATE_AFTER_RESUBMIT' });
      out.push(supportOut(e, target, 'STUDENT_REQUEST', before === 0 ? 'HELP_FIRST_SUPPORT' : 'HELP_ESCALATE_AFTER_RESUBMIT'));
      return { rec: rec, out: out, events: events };
    }
    if (rec.sameLevelRepeats < 1) {
      var e2 = chooseSupport(rec, ctx.itemId, before, ctx.group, 'b', null);
      rec.sameLevelRepeats += 1; rec.supportCount += 1; rec.lastEntryId = e2.id;
      out.push(supportOut(e2, before, 'STUDENT_REQUEST', 'HELP_SAME_LEVEL_REPHRASE'));
      return { rec: rec, out: out, events: events };
    }
    out.push({ kind: 'support', level: before, entryId: C.COMMON.RESUBMIT_FIRST.id, text: C.COMMON.RESUBMIT_FIRST.text, type: '절차', mechanism: '구조화', trigger: 'STUDENT_REQUEST', reason: 'HELP_RESUBMIT_FIRST', requiresResubmission: true, procedural: true });
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

  /* 통제집단 교사 선택지 */
  function teacherOptions(rec, stageId) {
    rec = rec || newRec();
    var cap = STAGE[stageId].cap;
    if (rec.attempts === 0) return { preSubmitOnly: true, levels: [0], suggested: 0, cap: cap };
    var levels = []; for (var l = 1; l <= cap; l++) levels.push(l);
    return { preSubmitOnly: false, levels: levels, suggested: Math.min(cap, Math.max(1, rec.level + 1)), cap: cap };
  }
  function bankFor(itemId, level, group) {
    if (level === 0) return [C.COMMON.PRE_SUBMIT];
    return C.BANK.filter(function (e) { return e.item === itemId && e.level === level && (!e.group || e.group === group); });
  }
  function applyTeacherSupport(recIn, level) {
    var rec = clone(recIn || newRec());
    if (level > 0) { rec.supportCount += 1; rec.lastSupportAttempt = rec.attempts; }
    if (level !== rec.level) rec.levelSetAttempt = rec.attempts;
    rec.level = Math.max(level, 0); rec.maxLevel = Math.max(rec.maxLevel, rec.level);
    return rec;
  }

  /* ---------- 출력 검사(AI 문장 다듬기·교사 자유 문구용) ---------- */
  var LEAK = {
    RD01: /112/, RD02: /(OD|DO)\s*(=|는|은)?\s*4\.5|(OC|CO)\s*(=|는|은)\s*3(?!\d)/,
    RF01: /(CD|DC)\s*=\s*8|(AD|DA)\s*=\s*5/, RF02: /(BO|OD)[^.]{0,12}(정할 수 없|알 수 없|모른|단정할 수 없)/,
    RF03: /x\s*=\s*30|(?:^|[^\d])30(?!\d)/,
    RC01: /마주\s?보는\s?(두\s?)?변의\s?길이(는|가)?\s?(각각\s?)?같/,
    RC02: /마주\s?보는\s?(두\s?)?각의\s?크기(는|가)?\s?(각각\s?)?같|이웃한\s?두\s?각의\s?(크기의\s?)?합(은|이)?\s?180/,
    RC03: /서로를\s?이등분/
  };
  var CORRECTNESS = /(정답|맞아요|맞습니다|맞았|맞아\b|틀렸|틀립|틀려|옳아|옳습|오답|잘했|훌륭|완벽|정확해|정확합)/;
  function leakCheck(itemId, text) { var re = LEAK[itemId]; return !!(re && re.test(plain(text))); }
  function checkOutput(text, template, studentText, itemId) {
    var t = plain(text || ''), tpl = plain(template || ''), stu = String(studentText || '');
    if (!t.trim()) return { ok: false, reason: 'empty' };
    if (CORRECTNESS.test(t)) return { ok: false, reason: 'correctness_signal' };
    var nums = t.match(/\d+(\.\d+)?/g) || [];
    for (var i = 0; i < nums.length; i++) { if (tpl.indexOf(nums[i]) < 0 && stu.indexOf(nums[i]) < 0) return { ok: false, reason: 'new_number' }; }
    var terms = ['이등분', '180', '마주 보는', '이웃한', '평행', '합동', '엇각', '동위각'];
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
    r.leaks = sup.filter(function (e) { return leakCheck(e.item_id, e.support_text || '') && !/^(RD0[12]|RF0[123])-L4/.test(e.bank_id || ''); }).length;
    r.blocked = events.filter(function (e) { return e.error_flag; }).length;
    var capOf = {}; C.STAGES.forEach(function (s) { capOf[s.id] = s.cap; });
    r.capViolations = sup.filter(function (e) { return (e.support_level_after || 0) > (capOf[e.stage] || 4); }).length;
    r.jumps = events.filter(function (e) { return e.event_type === 'LEVEL_CHANGE' && (e.support_level_after - e.support_level_before) > 1; }).length;
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
    r.supportCount = { AI: sup.filter(function (e) { return e.support_provider === 'AI' && (e.support_level_after || 0) > 0; }).length,
      TEACHER: sup.filter(function (e) { return e.support_provider === 'TEACHER' && (e.support_level_after || 0) > 0; }).length };
    return r;
  }

  var API = {
    STAGE: STAGE, ITEM: ITEM, resolveItem: resolveItem, itemsForStage: itemsForStage, plain: plain, norm: norm, compact: compact,
    numVal: numVal, detect: detect, judgeRule: judgeRule, buildJudgePrompt: buildJudgePrompt, parseJudge: parseJudge, combine: combine,
    pickEntry: pickEntry, newRec: newRec, onSubmit: onSubmit, onHelp: onHelp, onStageClose: onStageClose,
    teacherOptions: teacherOptions, bankFor: bankFor, applyTeacherSupport: applyTeacherSupport,
    checkOutput: checkOutput, leakCheck: leakCheck, buildPhrasePrompt: buildPhrasePrompt, fidelity: fidelity, isCopy: isCopy
  };
  root.PQ_ENGINE = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
