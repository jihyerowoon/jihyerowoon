# PQ4R 튜터 1차시 — 연구용 MVP (mvp-0.3.0)

중학교 2학년 「평행사변형의 성질」 1차시를 PQ4R 6단계(2·2·16·17·8·5분)로 진행하는 웹앱입니다. 학생이 먼저 풀고, 필요한 만큼만 0~4단계로 돕고, 모든 과정을 지우지 않고 기록합니다. 실험집단은 AI 튜터, 통제집단은 교사가 같은 발문 은행으로 지원합니다.

무료 서비스만으로 돌아갑니다: **GitHub(코드) → Vercel(화면·서버 함수, 서울) → Supabase(데이터베이스, 서울)**. Claude API는 선택이며 쓸 때만 비용이 듭니다.

```
학생·교사·연구자 브라우저 ──▶ Vercel (public/ 화면, api/ 서버 함수: 판정·발문 선택·기록)
                                   │                    └──▶ Claude API (선택, 답 글만 전송)
                                   ▼
                            Supabase Postgres (명단·수업·기록, 기록은 추가만 가능)
```

## 실사용을 위해 샘플에서 바뀐 것

| 항목 | 샘플(claude.ai 아티팩트) | MVP |
| --- | --- | --- |
| 로그인 | 코드만(E·C 접두어로 집단 결정) | 가명 학생 코드 + PIN, 집단은 연구자가 올린 명단에서만 결정, 5회 틀리면 10분 잠김. 교사·연구자 비밀번호는 틀린 기기만 잠김 |
| 정답 기준·발문 은행·판정 엔진 | 브라우저로 내려감 | 서버에만 있음(브라우저에는 문항 글만) |
| AI | 보는 사람의 Claude 계정, 모델 고정 불가 | 서버의 API 키, 모델·effort 고정, 기록에 모델명 |
| 저장 | 아티팩트 공유 저장소 | Postgres. 연구 기록은 수정·삭제·비우기를 DB가 거부 |
| 단계 닫기 | 학생 기기가 처리 | 교사가 단계를 열면 서버가 모든 학생의 미제출 문항을 한 번에 기록 |
| 동시 제출 | 고려 없음 | 문항별 버전 검사로 회차 겹침 방지(30명 동시 제출 시험 통과) |
| 끊김 | — | 임시저장은 기기에 보관했다가 자동 재전송, 화면 상단에 연결 끊김 표시 |
| 백업 | — | CSV(06 순서)·JSON 내보내기, 전체 백업 파일 |

## 무료로 배포하기 (약 30분)

준비물: GitHub 계정. Supabase와 Vercel은 GitHub 계정으로 가입할 수 있습니다.

### 1. GitHub에 코드 올리기
1. github.com → 오른쪽 위 **+** → **New repository** → 이름 `pq4r-tutor-mvp`, **Private** 선택 → **Create repository**.
2. 새 저장소 화면의 **uploading an existing file** → 압축을 푼 `pq4r-tutor-mvp` 폴더 **안의** 파일과 폴더를 모두 끌어다 놓기 → **Commit changes**.
   - `node_modules`는 넣지 않습니다(Vercel이 설치).
   - 명령줄을 쓴다면: `git init && git add . && git commit -m "mvp" && git branch -M main && git remote add origin https://github.com/<아이디>/pq4r-tutor-mvp.git && git push -u origin main`

### 2. Supabase 데이터베이스 만들기
1. supabase.com → **New project** → 이름 `pq4r`, **Database Password**는 영문·숫자로 길게 만들어 따로 적어 둡니다, **Region: Northeast Asia (Seoul)** → **Create new project**(1~2분).
2. 왼쪽 **SQL Editor** → **New query** → `db/schema.sql` 내용을 전부 붙여 넣고 **Run**. "Success"가 나오면 끝입니다(여러 번 실행해도 안전).
3. 위쪽 **Connect** → **Transaction pooler**의 URI를 복사하고 `[YOUR-PASSWORD]` 자리에 1의 비밀번호를 넣습니다. 이것이 `DATABASE_URL`입니다(포트 **6543**).

### 3. Vercel에 배포하기
1. vercel.com → **Add New… → Project** → GitHub 저장소 `pq4r-tutor-mvp` **Import**.
2. **Framework Preset: Other** 그대로. 빌드 설정은 건드리지 않습니다(`vercel.json`이 정함).
3. **Environment Variables**에 아래를 넣습니다(`.env.example` 참고).

   | 이름 | 값 |
   | --- | --- |
   | `DATABASE_URL` | 2-3에서 만든 URI |
   | `APP_SECRET` | 32자 이상 무작위 문자열 |
   | `TEACHER_PASSWORD` | 교사 화면 비밀번호(8자 이상) |
   | `RESEARCHER_PASSWORD` | 연구자 화면 비밀번호(8자 이상, 교사와 다르게) |
   | `CRON_SECRET` | 무작위 문자열(하루 한 번 점검 작업 보호) |
   | `ANTHROPIC_API_KEY` | (선택) Claude API 키. 없으면 규칙 판정만 |

4. **Deploy** → 1분쯤 뒤 `https://pq4r-tutor-mvp-xxxx.vercel.app` 주소가 생깁니다. 환경 변수를 나중에 바꾸면 **Deployments → … → Redeploy**를 한 번 해야 적용됩니다.

### 4. 첫 점검
1. 사이트 → **연구자** 탭 → 비밀번호 → **운영 점검** 탭: 데이터베이스 연결·비밀번호 설정이 "정상"인지 봅니다. AI 키를 넣었다면 **AI 연결 시험**(기대: `CLEAR_INDEPENDENT / CLEAR_INDEPENDENT`).
2. 서버 지역이 `icn1`(서울)로 보이는지 확인합니다.
3. 다음 날 같은 탭에서 "하루 한 번 점검 작업"의 마지막 시각이 찍혔는지 봅니다(Vercel → Settings → Cron Jobs에도 `/api/keepalive`가 보여야 함).
4. 학교 와이파이·태블릿에서 `vercel.app` 주소가 열리는지 미리 확인합니다(일부 학교망은 차단).

## 수업 준비와 진행

**연구자 (수업 전)**
1. **명단** 탭: `학생코드, 집단(실험/통제), 반, PIN(선택)` CSV를 붙여 넣거나 파일로 올립니다. 이름은 넣지 않습니다. PIN을 비우면 4자리를 만들어 주며, **PIN 목록 내려받기**는 그때만 가능합니다(입장 카드로 인쇄).
2. **수업·설정** 탭: 반마다 수업을 만듭니다(예: 수업 코드 `2A-L1`, 반 `2A`). 반을 적으면 그 반 명단 학생만 들어옵니다. 시연·연습용은 **시연용**을 체크해 따로 만듭니다.
3. 설정(AI 판정, 두 번 확인, 문장 다듬기, 통제 RF03 문구, Reflect 교재 열람)을 확인합니다. 바꾸면 기록에 남습니다.

**교사 (수업 중)**: 교사 탭 → 수업 고르기 → **다음 단계 열기**로 진행합니다. 단계를 열면 이전 단계의 미제출 문항이 미완료로 기록되고 학생 화면이 5초 안에 바뀝니다. 왼쪽 대기열에서 통제집단 도움 요청을 눌러 같은 발문 은행에서 골라 보냅니다(직접 쓰기는 정답 노출 경고 후 기록에 표시).

**학생**: 주소 → 수업 코드·학생 코드·PIN → 입장. 새로고침하거나 잠시 끊겨도 이어서 합니다.

**연구자 (수업 후)**: **기록** 탭 → CSV(06 순서) 내려받기와 **전체 백업**을 연구실 저장소에 보관합니다(무료 플랜은 자동 백업 없음). **처치충실도**, **사람 검토**(보류 판정 코딩) 탭을 확인하고, 수업을 **끝내기**합니다.

## Claude API (선택)
- platform.claude.com에서 조직·결제 등록 후 API 키 발급 → Vercel `ANTHROPIC_API_KEY`. 기본 모델 `claude-sonnet-5-5`, effort `medium`(`ANTHROPIC_MODEL`, `ANTHROPIC_EFFORT`로 변경). 파일럿에서 수학교사 코딩과의 일치도로 모델을 정하세요.
- 보내는 것: 문항, 03 정답 기준, 학생이 쓴 답 글. 학생 코드·PIN·이름은 보내지 않습니다.
- Anthropic 기본 정책: API 입력·출력은 30일 안에 삭제, 허락 없이 학습에 쓰지 않음. 처리 지역은 미국/전 세계 중 선택(한국 없음) → 동의서에 국외 처리 고지가 필요합니다.
- 비용 대략: 실험집단 30명 1차시에서 판정 약 500회(학생당 8회 × 2번 확인 가정) → Sonnet 5.5로 몇 달러 수준. Console의 **Billing → Spend limits**에서 월 한도를 낮게 걸어 두세요.
- 요청 한도에 걸리거나 오류가 나면 그 제출은 규칙 판정으로 처리되고 "검토 필요"로 남습니다(수업은 멈추지 않음).

## 무료 한도와 예상 사용량 (2026-10 기준)
| 서비스 | 무료 한도 | 30명 한 반 50분 수업 |
| --- | --- | --- |
| Vercel Hobby | 서버 함수 호출 월 100만 회, CPU 월 4시간, 비상업·개인 용도 | 호출 약 2만 9천 회, CPU 수 분(로컬 측정 요청당 1~3ms) |
| Supabase Free | DB 500MB, 1주 무활동 시 일시정지, 자동 백업 없음 | 기록 수 MB. 하루 한 번 점검 작업으로 일시정지 방지 |

8차시 × 실험·통제 2반 = 16회 수업이면 한 달에 다 해도 한도 안입니다. 무료 플랜 변경 여부는 운영 전에 각 서비스 가격 페이지에서 다시 확인하세요.

## 보안·개인정보
- 학생 정보는 가명 코드·집단·반만. PIN은 해시로만 저장하고 백업에도 넣지 않습니다.
- 브라우저용 공개 키로는 어떤 표도 읽을 수 없게 행 수준 보안(RLS)을 켰습니다. 앱 서버만 DB 연결 문자열로 접근합니다.
- 연구 기록(events)은 수정·삭제·비우기를 DB 트리거가 거부합니다. 동의 철회로 삭제가 필요하면 연구 책임자가 Supabase에서 트리거를 잠시 끄고 처리한 뒤 사실을 기록하세요.
- 화면은 엄격한 보안 정책(CSP), 프레임 차단, 검색 제외를 겁니다.

## 문제 해결
| 증상 | 확인 |
| --- | --- |
| "서버 설정이 끝나지 않았어요(…)" | 괄호 안 환경 변수를 Vercel에 넣고 Redeploy |
| "데이터베이스에 연결하지 못했어요" | `DATABASE_URL`이 Transaction pooler(6543)인지, 비밀번호 특수문자, Supabase 프로젝트가 일시정지됐는지 |
| 학생이 "이 수업 명단에 없어요" | 명단의 반과 수업의 반이 같은지 |
| 학생 로그인 잠김 | 연구자 → 명단 → PIN 새로(잠금도 풀림) |
| 단계를 잘못 열었음 | 이전 단계로 되돌릴 수 있지만, 이미 미완료로 기록된 문항은 그대로 남습니다 |

## 로컬 개발·시험
```
npm install
cp .env.example .env.local   # DATABASE_URL을 로컬 Postgres로
psql "$DATABASE_URL" -f db/schema.sql
npm run dev                  # http://localhost:3000
bash tests/run-local.sh      # 엔진·API·AI(가짜 API)·브라우저 시험 (로컬 Postgres 필요)
```
시험 결과(mvp-0.3.0): 엔진 82, API 통합 104, AI 경로 19, 브라우저 전체 흐름 51(접근성 검사 14 포함) 모두 통과.

## 파일
- `public/` 화면(`index.html`, `app.js`)과 개념 자료 이미지
- `api/router.js` 모든 `/api/v1/*` 처리, `api/keepalive.js` 하루 한 번 점검
- `lib/` 판정 엔진(`engine.js`), 문항·기준·발문 은행(`content.js`), 학생·교직원 처리, 기록(06), AI 호출
- `db/schema.sql` 데이터베이스, `vercel.json` 경로·서울 지역·보안 헤더·점검 일정
- `tests/` 시험, `dev/server.js` 로컬 서버

## 운영 전에 남은 결정(연구자)
발문 은행 147문장 승인, 무관한 답(off_topic)의 지원 수준 처리, Preview·Question의 독립 성공 정의, AI 사용 여부와 모델, 동의서의 국외 처리·보관 기간, Read 동영상 탑재.
