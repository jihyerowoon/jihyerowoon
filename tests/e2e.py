"""브라우저 전체 흐름: 연구자(수업·명단) → 학생(실험·통제) → 교사(단계·지원) → 연구자(기록·내보내기).
사용: BASE=http://localhost:3200 AXE=<axe.min.js> python3 tests/e2e.py"""
import os, re, json, time
from playwright.sync_api import sync_playwright

BASE = os.environ.get('BASE', 'http://localhost:3200') + '/'
AXE = os.environ.get('AXE')
SHOTS = os.path.join(os.path.dirname(__file__), 'shots'); os.makedirs(SHOTS, exist_ok=True)
RUN = 'W' + hex(int(time.time()))[-4:].upper()
SESS = RUN + '-L1'
res, errs = [], []
def check(c, n, x=''): res.append(('PASS' if c else 'FAIL', n, x))
def watch(pg, name):
    pg.on('pageerror', lambda e: errs.append(name + ' pageerror: ' + str(e)))
    pg.on('console', lambda m: errs.append(name + ' console: ' + m.text) if m.type == 'error' and 'fonts.g' not in m.text and 'ERR_TUNNEL' not in m.text and 'Failed to load resource' not in m.text else None)
    pg.on('dialog', lambda d: d.accept())
def login_staff(pg, role, pw, tid=None):
    pg.goto(BASE + '#login'); pg.wait_for_selector('#lf'); pg.click('[data-ltab="%s"]' % role); pg.wait_for_selector('#l-pw')
    if tid: pg.fill('#l-tid', tid)
    pg.fill('#l-pw', pw); pg.click('#lf button[type=submit]')
def login_student(pg, code, pin):
    pg.goto(BASE + '#login'); pg.wait_for_selector('#l-sess')
    pg.fill('#l-sess', SESS.lower()); pg.fill('#l-code', code); pg.fill('#l-pin', pin); pg.click('#lf button[type=submit]')
    pg.wait_for_selector('.item', timeout=15000)
def axe(pg, name):
    if not AXE: return
    pg.add_script_tag(path=AXE)
    v = pg.evaluate("""async () => (await axe.run(document, { resultTypes: ['violations'] })).violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id + ': ' + v.nodes.slice(0,2).map(n => n.target.join(' ')).join(', '))""")
    check(not v, '접근성: ' + name, v)

with sync_playwright() as p:
    b = p.chromium.launch()
    # 보안 정책(CSP)을 켠 채로 화면이 정책 위반 없이 뜨는지 먼저 본다. 이후 접근성 검사용 스크립트 주입을 위해 bypass_csp 사용.
    X = b.new_context(); xp = X.new_page(); csp = []
    xp.on('console', lambda m: csp.append(m.text) if 'Content Security Policy' in m.text else None)
    xp.goto(BASE + '#login'); xp.wait_for_selector('#l-sess'); xp.click('[data-ltab="researcher"]'); xp.wait_for_timeout(400)
    check(not csp, '보안 정책(CSP) 위반 없음', csp); X.close()
    _new_context = b.new_context
    b.new_context = lambda **kw: _new_context(bypass_csp=True, **kw)
    R = b.new_context(viewport={'width': 1360, 'height': 900}, accept_downloads=True); rp = R.new_page(); watch(rp, 'researcher')
    login_staff(rp, 'researcher', os.environ['RESEARCHER_PASSWORD'])
    rp.wait_for_selector('#rtabs'); rp.wait_for_selector('#newsess')
    rp.fill('#ns-code', SESS); rp.fill('#ns-class', RUN); rp.click('#newsess button[type=submit]')
    rp.wait_for_selector('.sessrow.on:has-text("%s")' % SESS)
    check(True, '연구자: 수업 만들기')
    rp.click('[data-tab="roster"]'); rp.wait_for_selector('#ro-csv')
    rp.fill('#ro-csv', 'code,group,class,pin\n%sE1,실험,%s,1357\n%sC1,통제,%s,2468\n%sE2,실험,%s,' % (RUN, RUN, RUN, RUN, RUN, RUN))
    rp.click('#ro-up'); rp.wait_for_selector('#ro-pins')
    check('새로 3' in rp.inner_text('#ro-out').replace('<b>', '').replace(' ', ' '), '연구자: 명단 3명 올림', rp.inner_text('#ro-out'))
    with rp.expect_download() as dl: rp.click('#ro-pins')
    pins = open(dl.value.path(), encoding='utf-8-sig').read()
    check(('%sE1,실험,%s,1357' % (RUN, RUN)) in pins and len(pins.strip().splitlines()) == 4, 'PIN 목록 내려받기', pins)
    rp.wait_for_selector('#st-t tr:has-text("%sE1") td:has-text("1357")' % RUN)
    check(True, '연구자: 학생 목록에 PIN 보임')
    rp.click('#st-mask'); rp.wait_for_selector('#st-t tr:has-text("%sE1") td:has-text("••••")' % RUN)
    check('1357' not in rp.inner_text('#st-t'), '연구자: PIN 가리기')
    rp.click('#st-mask'); rp.wait_for_selector('#st-t tr:has-text("%sE1") td:has-text("1357")' % RUN)
    with rp.expect_download() as dl2: rp.click('#st-pins')
    pins2 = open(dl2.value.path(), encoding='utf-8-sig').read()
    check(('%sC1,통제,%s,2468' % (RUN, RUN)) in pins2, '연구자: 학생 목록에서 PIN 목록 다시 내려받기', pins2[:200])
    rp.screenshot(path=SHOTS + '/e01_roster.png', full_page=True)
    axe(rp, '연구자 명단')

    # 학생(실험)
    E = b.new_context(viewport={'width': 1360, 'height': 900}); ep = E.new_page(); watch(ep, 'E')
    ep.goto(BASE + '#login'); ep.wait_for_selector('#l-sess'); axe(ep, '로그인 화면')
    ep.fill('#l-sess', SESS); ep.fill('#l-code', RUN + 'E1'); ep.fill('#l-pin', '0000'); ep.click('#lf button[type=submit]')
    ep.wait_for_function("document.querySelector('#l-err').textContent.length > 0")
    check('PIN' in ep.inner_text('#l-err'), '틀린 PIN 안내', ep.inner_text('#l-err'))
    login_student(ep, RUN + 'E1', '1357')
    check('실험집단' in ep.inner_text('.tb-t'), '실험 학생 입장(집단은 명단에서)')
    check(ep.locator('#demo').is_hidden(), '실제 수업: 학생 화면에 시연 제어 없음')
    ep.fill('#in-PV01-text', '사각형이고 마주 보는 변이 평행하다')
    ep.wait_for_function("document.querySelector('#savestate').textContent.indexOf('임시저장') >= 0", timeout=5000)
    check(True, '임시저장 표시')
    ep.reload(); ep.wait_for_selector('.item')
    check(ep.input_value('#in-PV01-text') == '사각형이고 마주 보는 변이 평행하다', '새로고침해도 로그인·임시저장 유지')
    ep.click('[data-act="submit"][data-id="PV01"]'); ep.wait_for_function("document.querySelector('[data-status=\"PV01\"]').textContent === '기록 완료'")
    check(True, 'PV01 제출 → 기록 완료')
    ep.click('[data-act="help"][data-id="PV02"]'); ep.wait_for_selector('[data-thread="PV02"] .msg')
    check('먼저 네 생각' in ep.inner_text('[data-thread="PV02"]'), 'T16 제출 전 도움 → 수준0')
    axe(ep, '학생 Preview')
    # 오프라인 임시저장
    E.set_offline(True)
    ep.fill('#in-PV02-text', '대각선이 궁금하다'); ep.wait_for_timeout(1600)
    check('실패' in ep.inner_text('#savestate'), '연결 끊김: 임시저장 실패 안내', ep.inner_text('#savestate'))
    E.set_offline(False); ep.wait_for_timeout(5600)
    check('임시저장' in ep.inner_text('#savestate') and '실패' not in ep.inner_text('#savestate'), '연결 복구 후 자동으로 다시 저장', ep.inner_text('#savestate'))

    # 학생(통제)
    Cc = b.new_context(viewport={'width': 1360, 'height': 900}); cp = Cc.new_page(); watch(cp, 'C')
    login_student(cp, RUN + 'C1', '2468')
    check('통제집단' in cp.inner_text('.tb-t'), '통제 학생 입장')

    # 교사: 단계 열기
    T = b.new_context(viewport={'width': 1360, 'height': 900}); tp = T.new_page(); watch(tp, 'T')
    login_staff(tp, 'teacher', os.environ['TEACHER_PASSWORD'], 'T02')
    tp.wait_for_selector('[data-pick="%s"]' % SESS); tp.click('[data-pick="%s"]' % SESS)
    tp.wait_for_selector('#roster tbody tr[data-code]')
    check(tp.locator('#roster tbody tr[data-code]').count() == 2, '교사: 접속 학생 2명')
    tp.click('#t-next'); tp.wait_for_timeout(800); tp.click('#t-next'); tp.wait_for_function("document.querySelector('.step.now .nm').textContent === 'Read'", timeout=8000)
    check(True, '교사: Read까지 열기')
    ep.wait_for_selector('.item[data-item="RD01"]', timeout=9000)
    check(True, '실험 학생 화면이 Read로 바뀜(폴링)')
    check(ep.locator('.panel.material .mat').count() == 2, 'Read 교재 2장')
    ep.click('.mat[data-mat="0"]'); ep.wait_for_selector('.matview img'); ep.keyboard.press('Escape')
    ep.click('#in-RD01-work'); ep.click('.elchip[data-el="ang:A"]'); ep.click('.elchip[data-el="ang:B"]')
    check('∠A' in ep.inner_text('[data-selrow="RD01:work"]'), '도형 선택이 답 칸에 붙음')
    ep.click('#in-RD01-work'); ep.click('.sym[data-sym="∠"]')
    check('∠' in ep.input_value('#in-RD01-work'), '기호 버튼 입력')
    ep.fill('#in-RD01-angB', '68'); ep.fill('#in-RD01-angC', '68'); ep.fill('#in-RD01-angD', '68')
    ep.click('[data-act="submit"][data-id="RD01"]'); ep.wait_for_selector('[data-thread="RD01"] .msg.ai')
    t1 = ep.inner_text('[data-thread="RD01"]')
    check('AI 튜터' in t1 and '112' not in t1, 'T02 모두 68 → AI 튜터 수준1 질문, 정답 없음', t1)
    ep.click('[data-act="help"][data-id="RD01"]'); ep.wait_for_function("document.querySelectorAll('[data-thread=\"RD01\"] .msg.ai').length === 2")
    check(True, '재제출 전 도움 → 같은 수준 다른 표현')
    ep.screenshot(path=SHOTS + '/e02_student_read.png', full_page=True)
    axe(ep, '학생 Read')

    # 통제: 도움 요청 → 교사 → 학생
    cp.wait_for_selector('.item[data-item="RD01"]', timeout=9000)
    cp.fill('#in-RD01-angB', '68'); cp.fill('#in-RD01-angC', '68'); cp.fill('#in-RD01-angD', '68')
    cp.click('[data-act="submit"][data-id="RD01"]'); cp.wait_for_timeout(800)
    check(cp.inner_text('[data-thread="RD01"]').strip() == '', 'T21 통제 제출 → AI 지원 없음')
    cp.click('[data-act="help"][data-id="RD01"]'); cp.wait_for_selector('[data-thread="RD01"] .waiting')
    check(True, '통제 도움 요청 → 대기 표시')
    tp.wait_for_selector('#queue .req', timeout=8000)
    check(RUN + 'C1' in tp.inner_text('#queue'), '교사 대기열에 요청 표시')
    tp.click('#queue .req'); tp.wait_for_selector('#sendform')
    tp.screenshot(path=SHOTS + '/e03_teacher.png', full_page=True)
    axe(tp, '교사 보내기 양식')
    tp.click('#sendform button[type=submit]'); tp.wait_for_timeout(600)
    cp.wait_for_selector('[data-thread="RD01"] .msg.teacher', timeout=9000)
    check(cp.locator('[data-thread="RD01"] .waiting').count() == 0, '통제 학생이 교사 지원 받음·대기 끝')
    # 직접 쓰기 경고
    tp.select_option('#sf-level', '2'); tp.fill('#sf-custom', '∠B는 112도예요'); tp.click('#sendform button[type=submit]')
    tp.wait_for_selector('#sf-warn:not([hidden])')
    check('정답' in tp.inner_text('#sf-warn'), '직접 쓰기 정답 노출 경고')

    # 실험 학생에게 교사 양식 없음
    tp.click('#roster tr[data-code="%sE1"]' % RUN); tp.wait_for_selector('#tdetail .note')
    check(tp.locator('#sendform').count() == 0, '실험 학생에게는 교사 지원 양식 없음')

    # 연구자: 기록·충실도·내보내기
    rp.click('[data-tab="log"]'); rp.wait_for_selector('#logt tbody tr')
    lt = rp.inner_text('#logt')
    check('FIRST_SUBMIT' in lt and 'SUPPORT_SENT' in lt and 'TIMEOUT' in lt and 'HELP_REQUEST' in lt, '연구자 기록 탭')
    with rp.expect_download() as dl: rp.click('#lf-csv')
    csv = open(dl.value.path(), encoding='utf-8-sig').read()
    check(csv.splitlines()[0].startswith('session_id,student_id,group,lesson,stage,item_id,event_id') and RUN + 'C1' in csv, 'CSV 내려받기', csv[:120])
    with rp.expect_download() as dl: rp.click('#lf-bak')
    bk = json.load(open(dl.value.path(), encoding='utf-8'))
    check(len(bk['events']) > 10 and 'item_states' in bk, '전체 백업 내려받기')
    rp.click('[data-tab="fid"]'); rp.wait_for_selector('.fid')
    check('통제집단 AI 지원 0건' in rp.inner_text('.fid'), '처치충실도')
    rp.click('[data-tab="status"]'); rp.wait_for_selector('.checklist')
    check('데이터베이스 연결' in rp.inner_text('.checklist'), '운영 점검')
    for tab in ['sess', 'log', 'fid', 'rev', 'bank', 'mat', 'status']:
        rp.click('[data-tab="%s"]' % tab); rp.wait_for_timeout(700); axe(rp, '연구자 ' + tab)

    # 수업 끝내기 → 학생 화면
    rp.click('[data-tab="sess"]'); rp.wait_for_selector('#r-close'); rp.click('#r-close'); rp.wait_for_timeout(800)
    ep.wait_for_function("document.body.innerText.indexOf('수업이 끝났어요') >= 0", timeout=10000)
    check(True, '수업을 끝내면 학생 화면도 끝남')

    # 모바일·다크
    for scheme in ['light', 'dark']:
        M = b.new_context(viewport={'width': 390, 'height': 844}, color_scheme=scheme); mp = M.new_page(); watch(mp, 'M')
        mp.goto(BASE + '#login'); mp.wait_for_selector('#l-sess')
        sw = mp.evaluate('document.documentElement.scrollWidth'); check(sw <= 391, '모바일 로그인 가로 넘침 없음(%s)' % scheme, sw)
        mp.screenshot(path=SHOTS + '/e04_mobile_login_%s.png' % scheme)
        axe(mp, '모바일 로그인 ' + scheme)
        M.close()
    # 모바일 교사 화면
    M = b.new_context(viewport={'width': 390, 'height': 844}, color_scheme='dark'); mp = M.new_page(); watch(mp, 'MT')
    login_staff(mp, 'teacher', os.environ['TEACHER_PASSWORD']); mp.wait_for_selector('.sesslist')
    sw = mp.evaluate('document.documentElement.scrollWidth'); check(sw <= 391, '모바일 교사 수업 고르기 가로 넘침 없음', sw)
    b.close()

for r in res: print(r[0], r[1], '' if r[0] == 'PASS' else '| ' + str(r[2])[:300])
print('errors', errs[:10])
print(sum(1 for r in res if r[0] == 'PASS'), 'pass /', len(res))
