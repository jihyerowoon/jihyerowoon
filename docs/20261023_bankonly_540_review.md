# 2026-10-23 연구자 결정: AI 발문은행 선택 고정 및 비상 교사 입력

## 실행 범위 및 사실
- 연구용 PR #1 브랜치에서만 수정한다. main/운영 사이트는 변경하지 않는다.
- 1~2차시 24개 활성 문항의 기존 396개 발문을 유지하고, 중2가 이해하기 쉽게 쓴 추가 **144개 초안**을 코드에 탑재한다. 현재 연구용 브랜치 후보는 **540개**다.
- **540개 모두 연구자 및 전문가 검수 전 후보**이며, 어느 문장도 이번 코드 수정만으로 검증을 마친 것은 아니다. 원래 396개에는 비교적 어려운 표현이 남아 있다. 이 문장을 실험에서 제공하려면 승인표와 앱 발문 ID를 대조하여 확정한다.
- 전체 3~8차시 자료와 발문은 준비되지 않았다. 540개를 8차시 은행으로 부르지 않는다.
- 실험집단 생성형 질문의 실시간 새 문장 생성은 `lib/student.js` 지원 발송 경로에서 **호출되지 않도록 제거**했다. `PQ4R_ENABLE_GENERATION=true`도 학생에게 새 질문을 생성하지 못한다. `lib/ai.js`의 미사용 함수가 남은 것과 실행 중 생성은 다르다. 문항 판정 보조에 별도 모델을 사용할 수 있으므로 'AI 미사용'이라고도 쓰면 안 된다.
- 실험집단은 본인이 먼저 답을 제출한 뒤 학생 요청이 있어야 서버에서 질문은행의 문장을 **그대로 선택하여** 제공한다. 학생 재응답 뒤 재요청은 가능하며 수준은 항상 1이다.
- 통제집단은 교사 대기열에서 **은행 선택 기본**, **직접 입력은 비상 선택지**다. 직접 입력시 `emergency_reason` 필수(6자 이상), 발문 서버 자동 검사, 학생별 `SUPPORT_SENT` 원문, `TEACHER_FREEFORM`, 사유와 `review_required=true`로 기록한다. 자동 문자열 검사 통과는 연구자 승인과 다르다.

## 대상 범위와 은행 실체
| 차시 | 활성 문항 | 기존 후보 | 추가 쉬운 후보 | 합계 |
|---|---:|---:|---:|---:|
| 1차시 삼각형의 합동 | 12 | 198 | 72 | 270 |
| 2차시 평행사변형의 성질 | 12 | 198 | 72 | 270 |
| 합계 | **24** | **396** | **144** | **540** |

추가 질문의 6개 응답 상태: 일반(*), 무시작(NO_START), 근거 누락(CORRECT_NO_REASON), 부분 답변(PARTIAL), 적용 근거 불일치(MISAPPLIED_PROPERTY), 표현이 모호함(AMBIGUOUS). 상태는 오류의 정확한 원인 진단이 아니라 시스템의 임시 분류이므로 분류의 정확성을 검증해야 한다. 난이도 단계는 1개다.

## 전문가와 연구자 전수 검수 절차
1. 540행을 **발문 ID별로** 확정하며, 1차시와 2차시의 실제 최종 활동지 및 교사용 동일 자료와 비교한다. 평가자 간 불일치와 수정 이력을 남긴다.
2. 각 문장에 대해 (a) 메타인지적 질문 한 유형인지, (b) 답/정답 수치/특정 보기/공식/풀이 다음 단계 노출이 없는지, (c) 문제 조건을 잘못 지목하지 않는지, (d) 초등 5~6학년이 혼자 이해할 짧은 표현인지, (e) 학생 상태에 맞는지, (f) 두 집단이 동일 후보를 사용할 수 있는지를 검토한다.
3. 결과를 **승인 / 수정 후 재검수 / 제외**로 기록하고 실제 승인된 발문만 운영본에 포함한다. 추가 144개뿐 아니라 기존 396개에도 같은 기준을 적용한다.
4. 학생 실험 전에는 독립 수학 내용 검수, 불완전한 응답 및 고의적 정답요청 시나리오, 발문 중복 방지, 교사 대기열, HELP_REQUEST → SUPPORT_SENT 시각, 30명 동시접속 및 기록 누락 시험을 실행한다.
5. 승인본의 SHA와 발문은행 버전을 연구방법, 부록 및 처치충실도 검사표에 기록한다. 생성형 발문을 사용했다고 서술하지 않는다.
6. 교사 자유발문 발생 건은 사유, 문장, 요청자, 발송시각, 직접적인 정답단서 포함 여부, 사후 검수 결과를 보고한다. 교사 직접 입력 빈도가 높으면 집단 간 지원내용 비교에 큰 교란이 생길 수 있으므로 별도 보고한다.

## 자동 검사 한계
- 숫자 및 정답 관련 표현에 대한 규칙 검색은 표면적 점검이다. 수학적 풀이 힌트를 우회적으로 제시해도 통과할 수 있다.
- 문장이 짧다는 이유만으로 초등학생이 이해한다고 말할 수 없다. 소규모 중2 학습자 대상 이해 가능성 시험이 필요하다.
- 540개 후보가 있다는 사실은 **모든 문항과 학습자 상태에 적절한 발문이 존재한다는 보증이 아니다.**
- 실제 Vercel과 Neon DB 연동, AI 선택 전송, 교사 비상 입력 전송, 기록 누락률 등은 아직 브라우저 통합 검증이 필요하다.

## 직접 근거가 되는 무료 원문
- van de Pol, J., Volman, M., & Beishuizen, J. (2010). *Scaffolding in teacher-student interaction: A decade of research*. *Educational Psychology Review, 22*, 271–296. https://doi.org/10.1007/s10648-010-9127-6 (무료 전체 PDF). contingency, fading, 책임 이양과 상황에 맞는 지원을 설명. 본 연구의 단일 강도 자체를 검증한 논문은 아님.
- Reiser, B. J. (2004). *Scaffolding complex learning: The mechanisms of structuring and problematizing student work*. *Journal of the Learning Sciences, 13*(3), 273–304. https://sites.northwestern.edu/brianreiser/ (저자 사이트의 논문 Download 확인 가능). 과제 구조화와 근거 검토를 분리하여 해석.
- van der Graaf, J., et al. (2023). *How to design and evaluate personalized scaffolds for self-regulated learning*. *Metacognition and Learning, 18*, 783–810. https://doi.org/10.1007/s11409-023-09361-y (무료 전체 PDF). 개인화 지원의 설계 및 평가 검토.
- Güner, P., & Erbay, H. N. (2021). *Metacognitive skills and problem-solving*. *International Journal of Research in Education and Science, 7*(3), 715–734. https://eric.ed.gov/?id=EJ1308166 (무료 원문 가능 여부는 페이지에서 재확인). 중학생 수학 문제 해결의 메타인지 수행을 다룸.
- Toikka, S., et al. (2026). *From problem-solving to reflection: Activating diverse metacognitive skills in mathematics*. *International Journal of Science and Mathematics Education, 24*, Article 10. https://doi.org/10.1007/s10763-025-10643-x (무료 전체 PDF). 수학 과제와 성찰 활동에 따른 메타인지 활성화를 논의.

이 참고문헌은 **발문 설계 원리의 근거**이지, 코드 속 각 후보 문장이 논문에서 검증되었다는 의미가 아니다.
