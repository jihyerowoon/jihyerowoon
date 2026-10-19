# 이 저장소에서 일하는 Claude에게 — PQ4R 튜터 연구용 MVP

중학교 2학년 수업을 PQ4R 6단계로 진행하는 **학위논문 연구용 웹앱**이다(연구 책임자: 전지혜, 연세대 교육대학원 교육공학). 지금 들어 있는 차시: **1차시 「삼각형의 합동」(60분)**, **2차시 「평행사변형의 성질」(54분)** — 연구자가 준 활동지 PPTX(2026-10-19)를 옮긴 것이다(mvp-0.4.0). 실험집단은 AI 튜터, 통제집단은 교사가 같은 발문 은행으로 지원하고, 모든 과정을 지우지 않고 기록한다. 실제 학생 수업에 쓰이므로 **연구 설계와 기록을 망가뜨리지 않는 것이 가장 중요하다.**

## 1. 요청하는 사람과 말하는 법

요청하는 사람은 대개 **개발·AI 비전공자**(연구 보조, 교사)다. 아래를 지킨다.

1. **쉬운 한국어**로 말한다. 파일명·함수명·영어 용어는 꼭 필요할 때만 쓰고, 쓰면 한 번 풀어 준다. 화면에 보이는 이름(학생 화면, 연구자 → 명단 탭 등)으로 설명한다.
2. **고치기 전에** 무엇을 어떻게 바꿀지 화면 기준으로 1~3줄로 말한다. 요청이 모호하면 짧게 하나씩 묻고, 가능하면 선택지로 묻는다. 캡처가 있으면 캡처로 위치를 확인한다.
3. **연구 규칙(3장)에 걸리는 요청**은 바로 하지 않는다. 무엇이 연구에 영향을 주는지 쉬운 말로 설명하고 "연구 책임자(전지혜)께 확인받으셨나요?"를 묻는다. 확인되면 진행하고 커밋 메시지에 "연구자 승인"이라고 적는다.
4. **화면 조작으로 되는 일은 코드를 고치지 않는다.** 명단 올리기, PIN 재발급(연구자 → 명단 → PIN 새로), 수업 만들기, 설정 켜고 끄기(연구자 → 수업·설정), 기록·백업 내려받기(연구자 → 기록)는 사용법을 안내한다.
5. **비밀값을 대화에 붙여 넣게 하지 않는다**(비밀번호, `sk-ant-` API 키, DB 주소). 그런 값은 Vercel 환경변수에만 넣는다. 붙여 넣었다면 바로 바꾸라고 안내한다.
6. **끝나면 세 가지를 알려 준다.** 무엇이 바뀌었는지(전 → 후), 1~2분 뒤 사이트 어디를 열어 확인하는지(머리말 버전 `mvp-…`도 바뀜), 마음에 안 들면 "방금 바꾼 것 되돌려 줘"라고 하면 된다는 것.
7. **수업 시간에는 배포하지 않는다.** 실제 수업 기간이면 오늘 수업이 있는지 묻고, 수업 중이면 끝난 뒤로 미룬다.

## 2. 운영 구성

| 항목 | 내용 |
| --- | --- |
| 사이트 | https://jihyerowoon-one.vercel.app (`/api/v1/health` → `{"ok":true,"version":"mvp-…"}`) |
| 코드 | GitHub `leefoxai/jihyerowoon`, 브랜치 `main` |
| 배포 | Vercel Hobby(팀 "LEEKYUHO's projects", 프로젝트 `jihyerowoon`, 서버 지역 `sin1`). `main`에 push하면 1~2분 뒤 자동 배포 |
| DB | Neon Postgres Free(싱가포르), Vercel Storage로 연결. `DATABASE_URL` 자동 입력 |
| 환경변수(Vercel) | `DATABASE_URL`(자동), `APP_SECRET`, `TEACHER_PASSWORD`, `RESEARCHER_PASSWORD`, `CRON_SECRET`, `ANTHROPIC_API_KEY`(선택), `ANTHROPIC_MODEL`(기본 `claude-sonnet-5-5`), `ANTHROPIC_EFFORT`(기본 `medium`). 바꾸면 Vercel에서 Redeploy해야 적용 |

- **저장소는 공개(Public)로 둔다.** Vercel Hobby는 비공개 저장소에서 소유자가 아닌 사람(이 Claude 포함)의 커밋 배포를 막을 수 있다("The Hobby Plan does not support collaboration for private repositories"). 비공개로 바꾸자는 요청이 오면 이 점을 먼저 알린다.
- `APP_SECRET`을 바꾸면 모두 다시 로그인해야 하고, 연구자 명단의 PIN이 '—'로 보인다(로그인은 그대로 됨, PIN 새로로 복구).
- 이 작업 공간의 셸에서는 vercel.app·Vercel API 접속이 막혀 있을 수 있다. 배포 확인은 WebFetch로 `https://jihyerowoon-one.vercel.app/api/v1/health`를 읽는다.
- 무료 한도: Vercel 함수 호출 월 100만·CPU 월 4시간·비상업 용도, Neon 저장 1GB·컴퓨트 월 100 CU-시간(5분 쉬면 잠들고 첫 요청에 깨어남).

## 3. 연구 규칙 — 바꾸기 전에 반드시 연구자 승인

| 대상 | 위치 | 규칙 |
| --- | --- | --- |
| 연구 기록(events) | `db/schema.sql` 트리거, `lib/events.js` | **추가만 가능.** 수정·삭제·비우기를 막는 트리거를 끄거나 우회하는 코드·SQL을 만들지 않는다. 시험 기록도 영구히 남으므로 시험 수업 코드는 `DEMO`·`TEST`로 시작하게 안내한다 |
| 06 로그 항목 | `lib/events.js` `LOG_FIELDS`(30개) | 순서·이름을 바꾸지 않는다(분석이 CSV 머리줄에 의존). 새 항목은 `EXTRA_FIELDS` 끝에만 추가 |
| 정답 기준·정답 | `lib/content.js` `RUBRIC`, `KEYS` | 지금은 Claude 초안(`draft: true`, 연구자 검토 필요). 연구자가 확정하면 그 문장으로 바꾸고 `draft`를 지운다. 바꾸면 `VERSIONS.answer_key` 올림 |
| Reflect AI의 설명 | `lib/content.js` `FIXED_AI`(글, 실제 성격 `type`, 충족 판단 `ok`, 일부 충족 `near`) | 글과 판단 기준은 승인 후에만 바꾼다. 바꾸면 `VERSIONS.content`·`answer_key` 올림 |
| 04 상태 정의(9개) | `lib/content.js` `STATES` | 원문 그대로. 바꾸면 `VERSIONS.prompt` 올림 |
| 발문 은행 | `lib/content.js` `B`(256문장 초안: 1차시 129, 2차시 127), `COMMON`(10) | 문장 수정·추가·삭제는 승인 후 `VERSIONS.bank` 올림. 실험·통제가 같은 은행을 쓰는 구조 유지. 모든 문항·수준·집단에 일반 발문 2개 이상(엔진 시험이 확인) |
| 처치 차이 | `lib/student.js`, `lib/staff.js`, `lib/engine.js` | 통제집단에 AI 문장이 나가면 안 됨(처치충실도 `controlAI` = 0). 교사 직접 입력은 정답 노출 검사 후 기록에 표시 |
| 단계 설계 | `lib/content.js` `STAGES`(지원 상한 `cap` 2·2·4·4·3·2, 자동 L1 확인 `auto`), `LESSONS[n].min`(1차시 2·2·16·19·9·12분, 2차시 2·2·12·19·9·10분) | 시간·상한·자동 L1 확인 변경은 승인 필요 |
| 지원 규칙 | `lib/engine.js` `chooseSupport`, `onSubmit` | 혼합형 도움 시작(제출 시 자동 L1, L2부터 도움 버튼), 공통 반응은 첫 L1에만 |
| 학생 정보 | `lib/auth.js`, `lib/staff.js` | 이름 저장 금지. PIN은 해시(로그인)와 암호문(연구자 화면 표시)만, 평문 저장 금지. 교사 화면·백업에 PIN 노출 금지 |
| 공개 내용 | `api/router.js` `publicContent` | 정답 기준·정답(`KEYS`)·발문 은행·AI의 설명 정오(`FIXED_AI.type/ok`)를 브라우저로 보내지 않는다(API 시험이 확인) |
| 문항 ID | `lib/content.js` `ITEMS` | 차시 번호로 시작(`L1RD02`). 이미 쓴 ID는 이름을 바꾸지 않는다(기록이 ID에 묶임). 새 차시는 `L3…`처럼 새 ID로 추가 |

화면 문구, 버튼 위치, 색, 안내 문장, 오류 메시지 같은 **연구와 무관한 변경은 승인 없이** 진행해도 된다. 다만 학생에게 보이는 지시문(`STAGES.intro`, 문항 글)은 실험·통제에 같은 정보가 가는지 확인하고, 애매하면 연구자 승인을 묻는다.

## 4. 어디를 고치나

| 요청 | 파일 |
| --- | --- |
| 화면 문구·버튼·배치(학생·교사·연구자) | `public/app.js`(화면 그리기), `public/index.html`(색·글꼴·배치 CSS) |
| 단계 안내문, 차시(시간·왼쪽 문제·안내 바꿈), 문항, 정답, 정답 기준, AI의 설명, 상태 정의, 발문 은행, 개념 자료, 버전 표시 | `lib/content.js` (`VERSIONS`, `STAGES`, `LESSONS`, `PROBLEMS`, `FIGS`, `ITEMS`, `KEYS`, `RUBRIC`, `FIXED_AI`, `STATES`, `B`, `COMMON`, `MATERIALS`) |
| 문제 그림 | `public/figures/` 안 `.webp`(활동지에서 잘라 냄) + `lib/content.js` `FIGS`(크기와 그림 설명 `desc`. 설명은 화면 읽기와 AI 판정에 쓰이므로 답을 넣지 않는다) |
| 개념 자료 이미지 | `public/materials/` 안 `.webp` 파일(본 이미지 + `_thumb` 작은 이미지) + `lib/content.js` `MATERIALS` |
| 판정 규칙·지원 수준 선택·처치충실도 계산 | `lib/engine.js` (`judgeRule` → `judgeMC` 개념확인, `judgeRF` Reflect, `judgeRecite`, `judgeSolve` Review 풀이; `buildJudgePrompt`, `combine`, `chooseSupport`, `onSubmit`, `fidelity`, 정답 노출 검사 `LEAK`) |
| AI 호출(모델·재시도·응답 형식) | `lib/ai.js` |
| 학생 로그인·제출·도움 요청 | `lib/student.js` |
| 교사·연구자 기능(명단, 수업, 내보내기, 백업) | `lib/staff.js` |
| 설정 기본값, 단계 넘기기 | `lib/core.js` (`DEFAULT_SETTINGS`, `setStage`) |
| API 경로 표 | `api/router.js` |
| DB 표 | `db/schema.sql` |
| 배포 설정·보안 헤더(CSP)·점검 일정 | `vercel.json` |

## 5. 작업 절차

1. 관련 파일을 읽고 영향 범위를 요청자에게 쉬운 말로 확인한다(1장 2번).
2. 작게 고친다. 바꿀 때마다 `lib/content.js`의 `VERSIONS.app`(예: `mvp-0.4.0` → `mvp-0.4.1`)과 `package.json`의 `version`을 함께 올린다. 머리말에 보이므로 요청자가 반영 여부를 확인할 수 있다.
3. `db/schema.sql`은 **여러 번 실행해도 안전한 문장만** 쓴다(`create table if not exists`, `alter table … add column if not exists`). 표·열 삭제나 이름 바꾸기는 하지 않는다. 파일 내용이 바뀌면 앱이 첫 요청 때 자동으로 다시 실행한다(`lib/db.js` `ensureSchema`, `schema_meta` 판 번호 = 파일 해시).
4. 화면에는 외부 스크립트·인라인 스크립트를 넣지 않는다(CSP `script-src 'self'`).
5. 시험을 돌린다. `npm ci` 후:
   - DB 없이 바로: `node tests/engine.test.js lib`(문항·발문 은행 무결성 포함), `node tests/sim_fuzz.js lib`(무작위 시뮬레이션·퍼징, 1~2분)
   - 전체(로컬 Postgres 필요): `bash tests/run-local.sh`. 자동 표 생성, 엔진, API, AI 경로(가짜 API), 브라우저 흐름을 차례로 돈다. 브라우저 시험은 Python Playwright가 있을 때만, 접근성 검사는 `AXE=<axe.min.js 경로>`일 때만 돈다.
   - Postgres가 없으면(예):
     ```bash
     apt-get install -y postgresql >/dev/null
     PGBIN=$(ls -d /usr/lib/postgresql/*/bin | tail -1)
     mkdir -p /tmp/pgdata && chown postgres /tmp/pgdata
     su postgres -c "$PGBIN/initdb -D /tmp/pgdata -A trust" >/dev/null
     su postgres -c "$PGBIN/pg_ctl -D /tmp/pgdata -o '-p 54329 -k /tmp' -l /tmp/pg.log start"
     ```
6. 커밋 메시지는 한국어로 무엇을 왜 바꿨는지 쓴다. `main`에 push하고, 1~2분 뒤 `/api/v1/health`의 버전이 바뀌었는지 확인한 다음 요청자에게 확인할 화면을 알려 준다.
7. 되돌리기: `git revert <커밋>` 후 push한다. DB에 추가한 칸·표는 되돌리지 않는다(그래서 추가만 한다). 급하면 Vercel → Deployments에서 직전 배포로 되돌릴 수 있다(Hobby는 바로 이전 배포만, Vercel 계정 권한이 있는 사람만).

## 6. 연구 쪽 남은 결정 (요청이 오면 연구자 승인 대상)

1·2차시 정답 기준·발문 은행 초안(256문장) 승인, Reflect AI의 설명 판단 기준(1차시 RF01·2차시 RF01은 ‘다 틀리다’·‘일부만 옳다’ 모두 인정, 나머지는 `FIXED_AI.ok/near`), 1차시 Reflect 문제 2의 ②(△ABD=△CBD를 넓이가 같다는 뜻으로 볼지), 2차시 통제집단 문항(1차시 교사판 방식으로 만듦), 활동지 시간 표기 차이(2차시 머리말 60분·Read 16분·Reflect 10분 표기 vs 적용 54분), 핵심 개념 메모를 제출 문항으로 둘지, AI 사용 여부·모델·지출 한도, 동의서(국외 처리: 데이터는 싱가포르, AI는 미국·글로벌), off_topic 답의 지원 수준 처리, Preview·Question 독립 성공 정의, Read 개념 강의 동영상, 저장소 공개 유지 여부, 3~8차시 내용.
