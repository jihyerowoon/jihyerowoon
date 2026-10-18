/* PQ4R 1차시 콘텐츠 · 정답 기준 · 발문 은행
 * 근거: 활동지 1010(실험)·1011(통제), 03 정답키, 04 스캐폴딩 규칙, 행동규칙 v1.0, 논문 부록5
 * 운영판에서는 이 파일의 RUBRIC·BANK가 서버로 이동해야 한다(브라우저 노출 금지 원칙). 샘플에서는 시연을 위해 함께 둔다.
 * 표기: {AO} = 선분 AO(윗줄 표시). */
(function (root) {
  'use strict';

  var VERSIONS = {
    app: 'mvp-0.3.1',
    content: 'activity-1010/1011',
    materials: 'concept-images-2026-10-17',
    answer_key: '03-2026-10-10',
    bank: 'bank-0.2-draft',
    prompt: 'judge-0.2',
    rules: '04-proposed-pilot'
  };

  var STAGES = [
    { id: 'Preview', ko: '훑어보기', min: 2, cap: 2, auto: false,
      intro: { EXPERIMENT: '그림을 천천히 살펴보고, 지금 내가 알고 있는 것을 먼저 꺼내 보세요. 정답보다 “내 생각”을 먼저!',
               CONTROL: '그림을 천천히 살펴보고, 지금 내가 알고 있는 것을 먼저 꺼내 보세요. 정답보다 “내 생각”을 먼저!' } },
    { id: 'Question', ko: '질문하기', min: 2, cap: 2, auto: false,
      intro: { EXPERIMENT: '먼저 내가 해결하고 싶은 질문을 한 문장으로 만든 뒤, 필요하면 AI 튜터에게 질문을 더 구체화할 수 있도록 도움을 요청하세요.',
               CONTROL: '먼저 내가 해결하고 싶은 질문을 한 문장으로 만든 뒤, 필요하면 교사의 질문을 통해 범위를 더 구체화해 보세요.' } },
    { id: 'Read', ko: '읽기와 문제해결', min: 16, cap: 4, auto: true,
      intro: { EXPERIMENT: '교재에서 평행사변형의 변, 각, 대각선의 성질을 확인하세요. 먼저 스스로 문제를 해결한 뒤, 막힌 경우에만 AI 튜터에게 힌트를 요청하세요.',
               CONTROL: '교재에서 평행사변형의 변, 각, 대각선의 성질을 확인하세요. 먼저 스스로 문제를 해결한 뒤, 막힌 경우에만 교사에게 힌트를 요청하세요.' } },
    { id: 'Reflect', ko: '되돌아보기', min: 17, cap: 4, auto: true,
      intro: { EXPERIMENT: 'AI 튜터의 응답을 바로 받아들이지 말고, 문제의 조건과 사용한 성질, 추론과 결론을 차례로 확인한 뒤 최종 판단을 쓰세요.',
               CONTROL: '먼저 내 풀이를 작성하세요. 교사의 질문이나 힌트를 받은 뒤, 문제의 조건과 사용한 성질, 추론과 결론을 다시 점검하여 최종 답을 정리하세요.' } },
    { id: 'Recite', ko: '자기설명', min: 8, cap: 3, auto: true,
      intro: { EXPERIMENT: '교재와 앞쪽 내용을 가리고 먼저 내 말로 설명하세요. 설명을 마친 뒤 AI 튜터에게 빠진 근거나 조건이 있는지 질문받고, 필요한 부분만 스스로 보완하세요.',
               CONTROL: '교재와 앞쪽 내용을 가리고 먼저 내 말로 설명하세요. 설명을 마친 뒤 교사의 추가 질문에 답하며 빠진 근거나 조건을 스스로 보완하세요.' } },
    { id: 'Review', ko: '마무리 점검', min: 5, cap: 2, auto: true,
      intro: { EXPERIMENT: '처음 만든 질문으로 돌아가 오늘의 이해와 점검 방법을 정리하세요.',
               CONTROL: '처음 만든 질문으로 돌아가 오늘의 이해와 점검 방법을 정리하세요.' } }
  ];

  var READ_PROBLEM = '평행사변형 ABCD에서 ∠A=68°, {AO}=3cm, {BO}=4.5cm이다.';

  var RF_PROBLEMS = {
    RF01: '평행사변형 ABCD에서 {AB}=8cm, {BC}=5cm이다. {CD}와 {AD}의 길이를 구하시오.',
    RF02: '평행사변형 ABCD에서 {AC}=14cm이고, 두 대각선의 교점을 O라 한다.',
    RF03: '평행사변형 ABCD에서 ∠A=3x+10°, ∠B=2x+20°이다. x의 값을 구하시오.'
  };

  /* Reflect 고정 AI 산출물(실험집단). 연구 전에 확정한 자료이며 실시간 AI가 바꾸지 않는다. */
  var FIXED_AI = {
    RF01: { text: '“평행사변형에서는 마주 보는 두 변의 길이가 같으므로 {CD}=8cm, {AD}=5cm입니다.”', type: 'VALID' },
    RF02: { text: '“평행사변형의 두 대각선은 서로를 이등분하므로 {AO}={OC}=7cm입니다. 또한 {BO}={OD}=7cm입니다.”', type: 'PARTLY_INVALID' },
    RF03: { text: '“평행사변형에서는 마주 보는 두 각의 크기가 같으므로 3x+10=2x+20, 따라서 x=10입니다.”', type: 'INVALID' }
  };

  var USE_CHOICES = [
    { v: 'accept', label: '그대로 써도 된다' },
    { v: 'partial', label: '일부만 맞다' },
    { v: 'reject', label: '고쳐야 한다' }
  ];

  var CONTROL_RF_SUB = {
    RF01: '먼저 스스로 풀이한 뒤, 내가 사용한 성질이 무엇인지 적어 보세요.',
    RF02: '{AO}와 {OC}의 길이를 구하고, {BO}와 {OD}의 값을 현재 정보만으로 정할 수 있는지 판단하여 이유를 설명하세요.',
    RF03_original: '먼저 두 각의 위치 관계를 확인한 뒤, 어떤 성질을 사용할지 정하고 풀이하세요.',
    RF03_neutral: '먼저 스스로 풀이한 뒤, 내가 사용한 성질이 무엇인지 적어 보세요.'
  };

  function rfExpFields() {
    return [
      { key: 'use', label: '① AI 튜터의 답변을 그대로 사용해도 될까요?', kind: 'choice', options: USE_CHOICES },
      { key: 'property', label: '② 내가 확인한 성질', kind: 'long', rows: 2 },
      { key: 'judgment', label: '나의 판단과 이유', kind: 'long', rows: 3 },
      { key: 'final', label: '최종 답', kind: 'short' }
    ];
  }
  function rfCtlFields() {
    return [
      { key: 'first', label: '① 나의 첫 답은 무엇인가요?', kind: 'long', rows: 2 },
      { key: 'property', label: '② 내가 사용한 성질이 무엇인가요?', kind: 'long', rows: 2 },
      { key: 'recheck', label: '③ 교사의 질문이나 힌트 후 다시 확인한 점이 있다면 적어보세요.', kind: 'long', rows: 2 },
      { key: 'final', label: '④ 최종 답과 이유를 설명해보세요.', kind: 'long', rows: 3 }
    ];
  }

  /* 문항: 두 집단 공통 문항은 group 없이, 집단별로 다른 부분은 byGroup에 둔다. */
  var ITEMS = [
    { id: 'PV01', stage: 'Preview', mark: '①', title: '평행사변형에 대해 이미 알고 있는 것을 내 말로 적어 보세요.', kind: 'open',
      fields: [{ key: 'text', label: '내 생각', kind: 'long', rows: 3 }] },
    { id: 'PV02', stage: 'Preview', mark: '②', title: '변, 각, 대각선 중 눈에 띄는 점과 더 확인하고 싶은 점은 무엇인가요?', kind: 'open',
      fields: [{ key: 'text', label: '눈에 띄는 점과 확인하고 싶은 점', kind: 'long', rows: 3 }] },
    { id: 'QU01', stage: 'Question', mark: '①', title: '나의 질문', kind: 'question',
      fields: [{ key: 'text', label: '내가 해결하고 싶은 질문 (한 문장)', kind: 'long', rows: 2 }] },
    { id: 'QU02', stage: 'Question', mark: '②', title: '이 질문을 만든 이유는 무엇인가요?', kind: 'open',
      fields: [{ key: 'text', label: '이유', kind: 'long', rows: 2 }] },
    { id: 'RD01', stage: 'Read', mark: '①', title: '∠B, ∠C, ∠D를 구하세요.', kind: 'rd01', problem: READ_PROBLEM,
      fields: [
        { key: 'angB', label: '∠B', kind: 'short', unit: '°', narrow: true },
        { key: 'angC', label: '∠C', kind: 'short', unit: '°', narrow: true },
        { key: 'angD', label: '∠D', kind: 'short', unit: '°', narrow: true },
        { key: 'work', label: '나의 풀이와 설명', kind: 'long', rows: 3 }
      ] },
    { id: 'RD02', stage: 'Read', mark: '②', title: '{OC}와 {OD}를 구하세요.', kind: 'rd02', problem: READ_PROBLEM,
      fields: [
        { key: 'OC', label: '{OC}', kind: 'short', unit: 'cm', narrow: true },
        { key: 'OD', label: '{OD}', kind: 'short', unit: 'cm', narrow: true },
        { key: 'work', label: '나의 풀이와 설명', kind: 'long', rows: 3 }
      ] },
    { id: 'RD03', stage: 'Read', mark: '③', title: '사용한 성질을 순서대로 설명하세요.', kind: 'rd03', problem: READ_PROBLEM,
      fields: [{ key: 'text', label: '사용한 성질 (순서대로)', kind: 'long', rows: 4 }] },
    { id: 'RF01', stage: 'Reflect', mark: '', title: RF_PROBLEMS.RF01, kind: 'rf01',
      byGroup: { EXPERIMENT: { fixedAI: 'RF01', fields: rfExpFields() },
                 CONTROL: { sub: CONTROL_RF_SUB.RF01, fields: rfCtlFields() } } },
    { id: 'RF02', stage: 'Reflect', mark: '', title: RF_PROBLEMS.RF02, kind: 'rf02',
      byGroup: { EXPERIMENT: { fixedAI: 'RF02', fields: rfExpFields() },
                 CONTROL: { sub: CONTROL_RF_SUB.RF02, fields: rfCtlFields() } } },
    { id: 'RF03', stage: 'Reflect', mark: '', title: RF_PROBLEMS.RF03, kind: 'rf03',
      byGroup: { EXPERIMENT: { fixedAI: 'RF03', fields: rfExpFields() },
                 CONTROL: { sub: 'RF03_SWITCH', fields: rfCtlFields() } } },
    { id: 'RC01', stage: 'Recite', mark: '①', title: '변의 성질', kind: 'rc01', groupTitle: '평행사변형의 성질을 쓰세요.',
      fields: [{ key: 'text', label: '변의 성질', kind: 'long', rows: 2 }] },
    { id: 'RC02', stage: 'Recite', mark: '①', title: '각의 성질', kind: 'rc02',
      fields: [{ key: 'text', label: '각의 성질', kind: 'long', rows: 2 }] },
    { id: 'RC03', stage: 'Recite', mark: '①', title: '대각선의 성질', kind: 'rc03',
      fields: [{ key: 'text', label: '대각선의 성질', kind: 'long', rows: 2 }] },
    { id: 'RC04', stage: 'Recite', mark: '②', kind: 'rc04',
      title: '세 성질이 왜 성립하는지 내 말로 설명하세요.',
      byGroup: { EXPERIMENT: { sub: 'AI 튜터의 추가 질문이 있었다면 보완한 내용을 함께 적으세요.' },
                 CONTROL: { sub: '교사의 추가 질문 뒤 보완한 내용이 있다면 함께 적으세요.' } },
      fields: [{ key: 'text', label: '왜 성립하는지', kind: 'long', rows: 4 }] },
    { id: 'RV01', stage: 'Review', mark: '①', title: '처음 만든 나의 질문에 지금은 어떻게 답할 수 있나요?', kind: 'review', recall: 'QU01',
      fields: [{ key: 'text', label: '지금의 답', kind: 'long', rows: 3 }] },
    { id: 'RV02', stage: 'Review', mark: '②', title: '처음 생각에서 바뀌거나 새롭게 알게 된 점은 무엇인가요?', kind: 'review', recall: 'PV01',
      fields: [{ key: 'text', label: '달라진 점', kind: 'long', rows: 3 }] },
    { id: 'RV03', stage: 'Review', mark: '③', kind: 'review',
      byGroup: { EXPERIMENT: { title: '오늘 문제를 해결하고 AI 응답을 검토할 때 가장 도움이 된 방법은 무엇이었나요? 어느 단계였는지와 그 이유를 써보세요.' },
                 CONTROL: { title: '오늘 문제를 해결하고 내 풀이를 점검할 때 가장 도움이 된 방법은 무엇이었나요? 어느 단계였는지와 그 이유를 써보세요.' } },
      fields: [{ key: 'text', label: '방법, 단계, 이유', kind: 'long', rows: 3 }] },
    { id: 'RV04', stage: 'Review', mark: '④', kind: 'review',
      byGroup: { EXPERIMENT: { title: '다음 평행사변형 문제에서는 무엇을 먼저 확인하고, AI의 설명을 어떻게 검증할 것인가요?' },
                 CONTROL: { title: '다음 평행사변형 문제에서는 무엇을 먼저 확인하고, 내 풀이를 어떤 기준으로 다시 점검할 것인가요?' } },
      fields: [{ key: 'text', label: '점검 순서와 기준', kind: 'long', rows: 3 }] }
  ];

  /* 비공개 기준: 03 정답 기준 원문 그대로(answer_key_version과 일치). add는 앱이 덧붙인 기준과 그 출처 */
  var RUBRIC = {
    PV01: { expected: '답의 정형성 없음; 사각형, 두 쌍 대변 평행 등 사실에 맞는 표현', accepted: '자유로운 선행지식 기술', misconceptions: '정사각형에서만 성립하는 성질을 전 사각형에 일반화' },
    PV02: { expected: '관찰과 확인 대상을 자신이 작성', accepted: '도형 관찰/의문 어느 것이든 인정', misconceptions: 'AI 완성 문장 복사' },
    QU01: { expected: '1차시 사각형의 성질과 관련된 학생 생성 질문', accepted: '서술 수준에 따라 단순 질문도 인정', misconceptions: '질문 대신 정답 또는 활동무관 글' },
    QU02: { expected: '자기 동기나 모르는 점의 기록', accepted: '짧더라도 자기 이유 진실성 존중', misconceptions: 'AI가 학생 이유를 대신 생성' },
    RD01: { expected: 'B=112°, C=68°, D=112°', accepted: 'B=180−68, C=A, D=B 등의 동치 식과 정확한 자연어', misconceptions: '인접각도 68°; 네 각 모두 68°; 대각/인접각 교환', add: '답이 맞아도 근거(이웃한 두 각의 합 180°, 마주 보는 두 각은 같다)가 없으면 충족이 아니다(02 설계 3절 ‘숫자만 맞으면 근거 확인 질문’, 07 QA T01·T03).' },
    RD02: { expected: 'OC=3cm, OD=4.5cm', accepted: 'AO=OC, BO=OD, 대응 정답', misconceptions: '두 대각선 전체가 같음; OC=4.5; OD=3', add: '답이 맞아도 근거(두 대각선은 서로를 이등분, AO=OC·BO=OD)가 없으면 충족이 아니다(02 설계 3절 ‘숫자만 맞으면 근거 확인 질문’, 07 QA T01·T03).' },
    RD03: { expected: '대각은 같고 인접각 합180; 대각선 교점에서 서로를 이등분', accepted: '동치 구어, 수식/그림 혼합 설명', misconceptions: '근거 없는 수치; 대각선 길이 같다고 서술' },
    RF01: { expected: 'AI 주장 타당. CD=8cm, AD=5cm', accepted: '대변 대응을 쓰는 검증', misconceptions: '이웃 변 대응 혼동; AI를 무근거 수용', add: 'AI 응답을 받아들이더라도 마주 보는 변의 대응을 근거로 확인해야 충족이다(02 설계 4절, 07 QA T05).' },
    RF02: { expected: 'AO=OC=7은 타당; BO=OD의 값은 주어진 조건에서 결정 불가. AI 전체 응답 부적절', accepted: 'BO=OD이지만 7이라고 단정불가, BD 정보 부족 등', misconceptions: '두 대각선 전체 길이 동일 오개념; 근거 없는 7 대입' },
    RF03: { expected: '인접각 합180: 5x+30=180, x=30. AI x=10 부적절', accepted: '동치식, x=30과 타당 근거', misconceptions: '대각 성질을 인접각에 오적용' },
    RC01: { expected: '서로 마주보는 변 각각 길이 같음', accepted: 'AB=CD, BC=AD, 동치 자연어', misconceptions: '네 변 모두 길이 같음' },
    RC02: { expected: '대각 같음, 인접각 합180', accepted: '대각·이웃각 표현 바뀌어도 동치면 인정', misconceptions: '네 각 같음; 90°만 가능' },
    RC03: { expected: '대각선 서로 이등분; AO=OC 및 BO=OD', accepted: '교점은 두 대각선 각각의 중점 등', misconceptions: 'AC=BD라고 일반화' },
    RC04: { expected: '학생이 선택한 조건·성질·관계를 연결하여 근거를 설명', accepted: '엄밀한 증명이 아니어도 본인 논리의 유효성에 따라 수용; 근거 불충분은 따로 기록', misconceptions: '근거 없는 키워드 나열; 외운 문장 복사' },
    RV01: { expected: 'QU01에 맞는 본인 답변', accepted: '질문에 따라 다양한 타당 응답 인정', misconceptions: 'AI가 답변 대필' },
    RV02: { expected: '초기-현재 차이 또는 변화 없음의 이유', accepted: '변화 없음/아직 혼란 포함 진실된 자기평가', misconceptions: '긍정적 변화 강요' },
    RV03: { expected: '실제 사용 방법과 경험 기반 이유', accepted: '도움이 없었다는 평가도 인정', misconceptions: '인위적 성과 주장 유도' },
    RV04: { expected: '실행가능한 점검 대상과 절차', accepted: '조건-사용성질-적용-결론 중 한두 개를 실행 가능하게 기록', misconceptions: 'AI 말을 무조건 믿겠다를 긍정 평가' }
  };

  var STATES = {
    CLEAR_INDEPENDENT: '답·필요 근거 충족, 추가 지원 불필요',
    CORRECT_NO_REASON: '정답 타당하나 필수 근거 부재',
    PARTIAL: '일부 조건 또는 대응 성질만 표현',
    MISAPPLIED_PROPERTY: '성질의 적용 대상/전제가 틀림',
    AMBIGUOUS: '표현 다의적, 의미 재확인 필요',
    NO_START: '응답 불가 또는 막힘 표현',
    INVALID_RESPONSE: '빈칸, 복사, 무관 답변',
    REFLECT_UNCRITICAL: 'AI 답을 조건 검토 없이 수용',
    SELF_REPORT_UNCERTAIN: '자신의 불확실함을 정확히 표현'
  };

  /* 발문 은행 (초안, 연구자 승인 필요)
   * key: item|level|stateKey|variant — stateKey '*' = 상태 무관. stateKey 'PARTIAL:P_DIAG_BISECT' 처럼 빠진 성질별 변형 가능.
   * group 지정 시 해당 집단에만 사용. src: 03 = 정답키 원문 다듬음, STD = 행동규칙 표준 발문, NEW = 새로 작성 */
  var B = [];
  function add(item, level, state, variant, text, src, group) {
    B.push({ id: item + '-L' + level + '-' + (state === '*' ? 'G' : state.replace(':', '-').replace(/[^A-Za-z0-9_-]/g, '')) + '-' + variant + (group ? '-' + group.charAt(0) : ''),
      item: item, level: level, state: state, variant: variant, text: text, src: src, group: group || null });
  }
  // Preview (상한 2)
  add('PV01', 1, '*', 'a', '평행사변형에 대해 떠오르는 특징이 있나요? 확실하지 않아도 괜찮아요. 떠오르는 대로 적어 보세요.', '03');
  add('PV01', 1, '*', 'b', '그림을 보고 이미 알고 있는 것을 먼저 적어 보세요. 지금은 처음 생각을 기록하는 단계예요.', 'STD');
  add('PV01', 2, '*', 'a', '변, 각, 대각선 중 한 가지를 골라서 떠오르는 것을 적어 볼까요?', '03');
  add('PV01', 2, '*', 'b', '그림에서 변, 각, 대각선 중 무엇이 가장 먼저 눈에 들어오나요?', 'STD');
  add('PV02', 1, '*', 'a', '그림에서 눈에 띄는 부분은 어디인가요?', '03');
  add('PV02', 1, '*', 'b', '눈에 띄는 점 하나와 더 확인하고 싶은 점 하나를 나누어 적어 볼까요?', 'NEW');
  add('PV02', 2, '*', 'a', '변, 각, 대각선 중 한 곳을 골라 살펴볼까요?', '03');
  add('PV02', 2, '*', 'b', '도형에서 변이나 각을 하나 눌러 선택한 뒤, 그것에 대해 궁금한 점을 적어 볼까요?', 'NEW');
  // Question (상한 2)
  add('QU01', 1, '*', 'a', '무엇이 궁금한지 한 문장으로 적어 볼까요?', '03');
  add('QU01', 1, '*', 'b', '변, 각, 대각선 중 무엇이 가장 궁금한가요?', 'STD');
  add('QU01', 1, 'PARTIAL', 'a', '무엇을 비교하거나 확인하면 질문이 더 분명해질까요?', 'STD');
  add('QU01', 1, 'INVALID_RESPONSE', 'a', '답을 적기보다, 확인하고 싶은 것을 질문 문장으로 바꿔 볼까요?', 'NEW');
  add('QU01', 2, '*', 'a', '변, 각, 대각선 중 대상을 하나 정해서 질문을 만들어 볼까요?', '03');
  add('QU01', 2, '*', 'b', '무엇을 비교하거나 확인하면 질문이 더 분명해질까요?', 'STD');
  add('QU02', 1, '*', 'a', '어떤 부분이 궁금했나요?', '03');
  add('QU02', 1, '*', 'b', '이 질문을 떠올리게 된 이유를 한 문장으로 적어 볼까요?', 'NEW');
  add('QU02', 2, '*', 'a', '처음 알고 있던 것과 헷갈리는 것을 나누어 적어 볼까요?', '03');
  add('QU02', 2, '*', 'b', '질문을 만들 때 그림의 어느 부분을 보고 있었나요?', 'NEW');
  // Read RD01 (상한 4)
  add('RD01', 1, '*', 'a', '문제에서 주어진 각은 어느 꼭짓점의 각인가요? 구해야 하는 각과 함께 적어 볼까요?', '03');
  add('RD01', 1, '*', 'b', '문제에서 주어진 값과 구해야 하는 것을 먼저 구분해 볼까요?', 'STD');
  add('RD01', 1, 'CORRECT_NO_REASON', 'a', '그 값을 정할 때 사용한 평행사변형의 성질은 무엇인가요?', 'STD');
  add('RD01', 1, 'CORRECT_NO_REASON', 'b', '∠B, ∠C, ∠D를 각각 어떻게 정했는지 근거를 한 가지씩 적어 볼까요?', 'NEW');
  add('RD01', 1, 'MISAPPLIED_PROPERTY', 'a', '∠B를 그렇게 정한 근거는 무엇인가요? 그림에서 ∠A와 ∠B가 어디에 있는지 함께 적어 보세요.', 'NEW');
  add('RD01', 1, 'PARTIAL:calc', 'a', '사용한 성질은 그대로 두고 계산을 한 번 더 점검해 볼까요?', 'NEW');
  add('RD01', 1, 'PARTIAL', 'a', '아직 근거를 적지 않은 각이 있나요? 그 각을 정한 이유를 적어 볼까요?', 'NEW');
  add('RD01', 2, '*', 'a', '∠A와 ∠B, ∠A와 ∠C는 각각 서로 어떤 위치 관계인가요?', '03');
  add('RD01', 2, '*', 'b', '∠A와 ∠B는 서로 어떤 위치 관계인가요?', 'STD');
  add('RD01', 3, '*', 'a', '마주 보는 각과 이웃한 각 중 어떤 관계를 써야 할까요?', '03');
  add('RD01', 3, '*', 'b', '평행사변형의 각의 성질 중 어떤 것이 연결될까요?', 'STD');
  add('RD01', 4, '*', 'a', '평행사변형에서 마주 보는 두 각의 크기는 같고, 이웃한 두 각의 크기의 합은 180°예요. 이 성질로 나머지 각을 직접 구해 보세요.', '03');
  add('RD01', 4, '*', 'b', '마주 보는 두 각은 크기가 같아요. 이 성질이 어느 각과 어느 각 사이에 쓰이는지 직접 확인해 보세요.', 'NEW');
  // RD02
  add('RD02', 1, '*', 'a', '교점 O는 그림에서 어디인가요? 구해야 하는 선분을 도형에서 선택해 볼까요?', '03');
  add('RD02', 1, '*', 'b', '문제에서 주어진 선분과 구해야 하는 선분을 나누어 적어 볼까요?', 'NEW');
  add('RD02', 1, 'CORRECT_NO_REASON', 'a', '{OC}와 {OD}의 길이를 정할 때 사용한 성질은 무엇인가요?', 'STD');
  add('RD02', 1, 'CORRECT_NO_REASON', 'b', '{OC}와 {OD}를 각각 어떻게 정했는지 근거를 한 가지씩 적어 볼까요?', 'NEW');
  add('RD02', 1, 'MISAPPLIED_PROPERTY', 'a', '{OC}는 어느 대각선의 일부인가요? 그 대각선에서 주어진 길이는 무엇인지 확인해 볼까요?', 'NEW');
  add('RD02', 2, '*', 'a', '대각선 AC와 BD는 점 O에서 어떻게 나뉘나요?', '03');
  add('RD02', 2, '*', 'b', 'O가 대각선을 어떤 방식으로 나누는지 떠올려 볼까요?', 'STD');
  add('RD02', 3, '*', 'a', '대각선이 ‘서로를 이등분한다’는 성질을 적용해 볼까요?', '03');
  add('RD02', 3, '*', 'b', '평행사변형의 대각선에 관한 성질 중 어떤 것이 연결될까요?', 'NEW');
  add('RD02', 3, '*', 'c', '{AO}와 {OC}, {BO}와 {OD}를 짝지어 비교해 볼까요?', 'NEW');
  add('RD02', 4, '*', 'a', '평행사변형의 두 대각선은 서로를 이등분해요. {AO}와 {OC}, {BO}와 {OD}를 비교해 직접 적어 보세요.', '03');
  add('RD02', 4, '*', 'b', '두 대각선은 서로를 이등분해요. 이 성질로 {OC}와 {OD}를 다시 판단해 보세요.', 'NEW');
  // RD03
  add('RD03', 1, '*', 'a', '각과 대각선에서 각각 무엇을 사용했나요?', '03');
  add('RD03', 1, '*', 'b', '①번과 ②번 풀이에서 쓴 성질을 순서대로 떠올려 볼까요?', 'NEW');
  add('RD03', 1, 'PARTIAL', 'a', '①번(각)과 ②번(선분) 중 아직 성질을 적지 않은 쪽이 있나요?', 'NEW');
  add('RD03', 1, 'MISAPPLIED_PROPERTY', 'a', '적은 성질이 두 대각선 전체에 대한 말인지, 점 O로 나뉜 부분에 대한 말인지 확인해 볼까요?', 'NEW');
  add('RD03', 2, '*', 'a', '성질을 적용한 대상이 어디인지 도형에서 선택해 볼까요?', '03');
  add('RD03', 2, '*', 'b', '각을 구할 때 본 두 각의 위치와, 선분을 구할 때 본 선분들의 관계를 나누어 적어 볼까요?', 'NEW');
  add('RD03', 3, '*', 'a', '마주 보는 각, 이웃한 각, 대각선의 나뉨 중 사용한 것을 골라 설명해 볼까요?', '03');
  add('RD03', 3, '*', 'b', '평행사변형의 각의 성질과 대각선의 성질 중 각각 어떤 것을 썼나요?', 'NEW');
  add('RD03', 4, '*', 'a', '①번과 ②번에서 쓴 성질에 각각 이름을 붙여 네 말로 정리해 보세요.', 'NEW');
  add('RD03', 4, '*', 'b', '각을 구할 때 쓴 성질 하나, 선분을 구할 때 쓴 성질 하나를 각각 네 말로 적어 보세요.', 'NEW');
  add('RD03', 4, 'PARTIAL:P_ADJ_180', 'a', '평행사변형에서 이웃한 두 각의 합은 180°예요. ①번 풀이 어디에 이 성질을 썼는지 네 말로 적어 보세요.', 'NEW');
  add('RD03', 4, 'PARTIAL:P_OPP_ANGLES', 'a', '평행사변형에서 마주 보는 두 각의 크기는 같아요. ①번 풀이 어디에 이 성질을 썼는지 네 말로 적어 보세요.', 'NEW');
  add('RD03', 4, 'PARTIAL:P_DIAG_BISECT', 'a', '평행사변형의 두 대각선은 서로를 이등분해요. ②번 풀이 어디에 이 성질을 썼는지 네 말로 적어 보세요.', 'NEW');
  // Reflect RF01
  add('RF01', 1, '*', 'a', 'AI 튜터는 어떤 성질을 사용했나요? 그 성질이 이 문제의 어느 변에 쓰였는지 적어 볼까요?', '03', 'EXPERIMENT');
  add('RF01', 1, '*', 'b', '왜 이 성질을 이 문제에 적용할 수 있는지 설명해 볼까요?', 'STD', 'EXPERIMENT');
  add('RF01', 1, 'REFLECT_UNCRITICAL', 'a', '사용된 성질이 이 문제의 해당 변에 실제로 적용되는지 확인해 볼까요?', 'STD', 'EXPERIMENT');
  add('RF01', 1, 'MISAPPLIED_PROPERTY', 'a', '어느 문장이 어떤 수학적 성질과 맞지 않는지 근거를 적어 볼까요?', 'STD', 'EXPERIMENT');
  add('RF01', 1, 'PARTIAL', 'a', '조건, 사용한 성질, 추론, 결론 중 아직 확인하지 않은 한 가지는 무엇인가요?', 'STD', 'EXPERIMENT');
  add('RF01', 1, '*', 'a', '문제에서 주어진 변과 구해야 하는 변을 먼저 구분해 볼까요?', 'NEW', 'CONTROL');
  add('RF01', 1, '*', 'b', '그 길이를 정할 때 사용한 성질은 무엇인가요?', 'STD', 'CONTROL');
  add('RF01', 2, '*', 'a', '{AB}와 {CD}, {BC}와 {AD}는 각각 어떤 위치에 있나요?', '03');
  add('RF01', 2, '*', 'b', '그림에서 {AB}와 마주 보는 변은 어느 것인가요? {BC}와 마주 보는 변도 찾아볼까요?', 'NEW');
  add('RF01', 3, '*', 'a', '마주 보는 변의 길이를 비교해 판단해 볼까요?', '03');
  add('RF01', 3, '*', 'b', '평행사변형의 변의 성질 중 어떤 것이 이 판단과 연결될까요?', 'NEW');
  add('RF01', 4, '*', 'a', '평행사변형에서 마주 보는 두 변의 길이는 같아요. 이 성질이 어느 변과 어느 변에 적용되는지 직접 표시하고 판단해 보세요.', '03');
  add('RF01', 4, '*', 'b', '마주 보는 두 변의 길이는 각각 같아요. 이 성질로 결론을 다시 판단해 보세요.', 'NEW');
  // RF02
  add('RF02', 1, '*', 'a', '주어진 길이는 어느 대각선의 길이인가요?', '03');
  add('RF02', 1, '*', 'b', 'AI 응답의 문장을 문제의 조건으로 확인할 수 있는 부분과 확인할 수 없는 부분으로 나누어 볼까요?', 'STD', 'EXPERIMENT');
  add('RF02', 1, '*', 'b', '구할 수 있는 것과 현재 정보만으로는 정할 수 없는 것을 나누어 볼까요?', 'NEW', 'CONTROL');
  add('RF02', 1, 'REFLECT_UNCRITICAL', 'a', 'AC와 BD의 길이 정보는 각각 문제에 어떻게 주어져 있나요? 비교해 볼까요?', 'NEW', 'EXPERIMENT');
  add('RF02', 1, 'MISAPPLIED_PROPERTY', 'a', '{BO}=7cm라고 판단한 근거는 무엇인가요? 그 근거가 문제의 조건에 있는지 확인해 볼까요?', 'NEW');
  add('RF02', 1, 'PARTIAL', 'a', '조건, 사용한 성질, 추론, 결론 중 아직 확인하지 않은 한 가지는 무엇인가요?', 'STD');
  add('RF02', 2, '*', 'a', 'AC와 BD 중 길이가 주어진 것은 어느 쪽인가요?', '03');
  add('RF02', 2, '*', 'b', '{BO}와 {OD}는 어느 대각선의 일부인가요? 그 대각선의 길이는 주어졌나요?', 'NEW');
  add('RF02', 3, '*', 'a', '‘서로를 이등분한다’는 말이 두 대각선의 전체 길이도 같다는 뜻일까요?', '03');
  add('RF02', 3, '*', 'b', '대각선의 성질로 알 수 있는 것과, 조건이 더 있어야 알 수 있는 것을 구별해 볼까요?', 'NEW');
  add('RF02', 4, '*', 'a', '평행사변형의 두 대각선은 서로를 이등분해요. AC의 절반과 BD의 절반을 판단할 자료가 각각 있는지 구별해 보세요.', '03');
  add('RF02', 4, '*', 'b', '두 대각선은 각각 점 O에서 반으로 나뉘어요. 이 성질로 {BO}와 {OD}에 대해 무엇을 말할 수 있는지 판단해 보세요.', 'NEW');
  // RF03
  add('RF03', 1, '*', 'a', 'AI가 적용한 각의 성질은 무엇인가요? 그 성질이 ∠A와 ∠B에 쓰일 수 있는지 확인해 볼까요?', '03', 'EXPERIMENT');
  add('RF03', 1, '*', 'b', 'AI 응답에서 조건, 사용한 성질, 식, 결론을 차례로 점검해 볼까요?', 'NEW', 'EXPERIMENT');
  add('RF03', 1, '*', 'a', '문제에서 주어진 두 각은 어느 꼭짓점의 각인가요? 어떤 식을 세웠는지 적어 볼까요?', 'NEW', 'CONTROL');
  add('RF03', 1, '*', 'b', 'x의 값을 정할 때 세운 식은 어떤 성질에서 나왔나요?', 'NEW', 'CONTROL');
  add('RF03', 1, 'REFLECT_UNCRITICAL', 'a', 'AI는 ∠A와 ∠B를 어떤 관계로 보고 식을 세웠나요? 그림에서 두 각의 위치를 확인해 볼까요?', 'NEW', 'EXPERIMENT');
  add('RF03', 1, 'CORRECT_NO_REASON', 'a', 'x의 값을 정할 때 어떤 식을 세웠고, 그 식은 어떤 성질에서 나왔나요?', 'NEW');
  add('RF03', 1, 'MISAPPLIED_PROPERTY', 'a', '3x+10=2x+20이라는 식은 어떤 성질에서 나왔나요? 그 성질이 ∠A와 ∠B에 쓰일 수 있는지 확인해 볼까요?', 'NEW');
  add('RF03', 1, 'PARTIAL:calc', 'a', '세운 식은 그대로 두고 계산 과정을 한 번 더 점검해 볼까요?', 'NEW');
  add('RF03', 2, '*', 'a', '∠A와 ∠B가 마주 보는 각인지 이웃한 각인지 살펴볼까요?', '03');
  add('RF03', 2, '*', 'b', '이 두 각은 실제로 마주 보는 각인가요, 이웃한 각인가요?', 'STD');
  add('RF03', 3, '*', 'a', '이웃한 각의 관계를 사용해 식을 다시 검토해 볼까요?', '03');
  add('RF03', 3, '*', 'b', '평행사변형의 각의 성질 중 이웃한 두 각에 관한 것을 떠올려 볼까요?', 'NEW');
  add('RF03', 4, '*', 'a', '평행사변형에서 이웃한 두 각의 크기의 합은 180°예요. 직접 식을 세워 계산해 보세요.', '03');
  add('RF03', 4, '*', 'b', '이웃한 두 각의 합은 180°예요. 이 성질로 식을 다시 판단해 보세요.', 'STD');
  // Recite (상한 3)
  add('RC01', 1, '*', 'a', '어느 변끼리 비교했나요?', '03');
  add('RC01', 1, '*', 'b', '변에 대해 설명한 문장에서 어떤 변과 어떤 변을 말하는지 이름으로 적어 볼까요?', 'NEW');
  add('RC01', 1, 'MISAPPLIED_PROPERTY', 'a', '네 변이 모두 같다고 본 근거는 무엇인가요? 그림의 변 길이를 다시 비교해 볼까요?', 'NEW');
  add('RC01', 1, 'AMBIGUOUS', 'a', '‘변이 같다’는 것이 어떤 변과 어떤 변이 같다는 뜻인지 {AB}, {CD}처럼 이름으로 적어 볼까요?', 'NEW');
  add('RC01', 2, '*', 'a', '그림에서 서로 마주 보는 변의 쌍을 찾아볼까요?', '03');
  add('RC01', 2, '*', 'b', '마주 보는 두 변에 대해 무엇을 말할 수 있나요?', 'STD');
  add('RC01', 3, '*', 'a', '같은 길이의 변이 어떤 위치에 있는지 설명해 볼까요?', '03');
  add('RC01', 3, '*', 'b', '평행사변형의 변의 성질 중 길이에 관한 것을 떠올려 볼까요?', 'NEW');
  add('RC02', 1, '*', 'a', '어떤 두 각을 비교했나요?', '03');
  add('RC02', 1, '*', 'b', '각에 대해 설명한 문장에서 어떤 각과 어떤 각을 말하는지 ∠A처럼 이름으로 적어 볼까요?', 'NEW');
  add('RC02', 1, 'PARTIAL', 'a', '마주 보는 각과 이웃한 각 중 아직 설명하지 않은 쪽이 있나요?', 'NEW');
  add('RC02', 1, 'PARTIAL', 'b', '마주 보는 각과 이웃한 각을 나누어 설명해 볼까요?', 'STD');
  add('RC02', 1, 'MISAPPLIED_PROPERTY', 'a', '그렇게 본 근거는 무엇인가요? 그림의 네 각을 다시 비교해 볼까요?', 'NEW');
  add('RC02', 2, '*', 'a', '마주 보는 각과 이웃한 각을 각각 생각해 볼까요?', '03');
  add('RC02', 2, '*', 'b', '마주 보는 각과 이웃한 각을 나누어 설명해 볼까요?', 'STD');
  add('RC02', 3, '*', 'a', '같은 크기 관계와 합의 관계를 구별해 설명해 볼까요?', '03');
  add('RC02', 3, '*', 'b', '두 각 사이의 관계가 ‘같다’인지 ‘합이 일정하다’인지 나누어 생각해 볼까요?', 'NEW');
  add('RC03', 1, '*', 'a', '대각선이 만나는 점을 떠올려 볼까요?', '03');
  add('RC03', 1, '*', 'b', '대각선에 대해 설명한 문장에서 어떤 선분을 말하는지 이름으로 적어 볼까요?', 'NEW');
  add('RC03', 1, 'MISAPPLIED_PROPERTY', 'a', '‘길이가 같다’는 것이 두 대각선 전체 길이를 말하는 건가요, 점 O로 나뉜 부분을 말하는 건가요?', 'NEW');
  add('RC03', 1, 'AMBIGUOUS', 'a', '{AO}, {OC}, {BO}, {OD}를 사용해서 ‘반으로 나뉜다’는 뜻을 설명해 볼까요?', 'STD');
  add('RC03', 2, '*', 'a', 'O를 기준으로 각 대각선이 어떻게 나뉘는지 생각해 볼까요?', '03');
  add('RC03', 2, '*', 'b', '{AO}와 {OC}, {BO}와 {OD}를 각각 비교하면 무엇을 말할 수 있나요?', 'NEW');
  add('RC03', 3, '*', 'a', '전체 대각선의 길이와 각각 반으로 나뉨을 구분해 볼까요?', '03');
  add('RC03', 3, '*', 'b', '대각선의 성질을 두 대각선 각각에 대해 말해 볼까요?', 'NEW');
  add('RC04', 1, '*', 'a', '왜 그렇게 판단했는지 이유를 한 가지 덧붙여 볼까요?', '03');
  add('RC04', 1, '*', 'b', '세 성질 중 하나를 골라 왜 성립하는지 네 생각을 적어 볼까요?', 'NEW');
  add('RC04', 1, 'PARTIAL', 'a', '성질 이름만 적기보다, 그 성질이 왜 성립하는지 네 말로 한 문장 덧붙여 볼까요?', 'NEW');
  add('RC04', 2, '*', 'a', '네가 사용한 도형의 위치나 조건을 설명해 볼까요?', '03');
  add('RC04', 2, '*', 'b', '그림에서 평행한 두 쌍의 변을 선택하고, 그것과 연결해 생각해 볼까요?', 'NEW');
  add('RC04', 3, '*', 'a', '관련 성질이 어느 대상에 적용됐는지 말해 볼까요?', '03');
  add('RC04', 3, '*', 'b', '대각선을 하나 그으면 생기는 두 삼각형을 비교해 볼까요?', 'NEW');
  // Review (상한 2)
  add('RV01', 1, '*', 'a', '처음 만든 질문은 무엇이었나요? 위에 보이는 질문을 다시 읽어 볼까요?', '03');
  add('RV01', 1, '*', 'b', '처음 만든 질문에 지금은 어떻게 답할 수 있나요?', 'STD');
  add('RV01', 2, '*', 'a', '질문에서 확인하고 싶던 것이 변, 각, 대각선 중 무엇이었나요?', '03');
  add('RV01', 2, '*', 'b', '오늘 해결한 문제 중 그 질문과 관련된 것을 떠올려 볼까요?', 'NEW');
  add('RV02', 1, '*', 'a', '처음과 지금 생각이 같나요, 달라졌나요?', '03');
  add('RV02', 1, '*', 'b', '위에 보이는 처음 생각을 다시 읽고, 달라진 점이나 그대로인 점을 적어 볼까요?', 'NEW');
  add('RV02', 1, 'SELF_REPORT_UNCERTAIN', 'a', '아직 헷갈리는 부분이 있다면 그것이 무엇인지 하나만 적어 볼까요?', 'NEW');
  add('RV02', 2, '*', 'a', '처음 생각을 다시 보고, 달라진 점이나 여전히 불확실한 점 하나를 적어 볼까요?', '03');
  add('RV02', 2, '*', 'b', '처음 생각, 지금 판단, 그 이유 순서로 적어 볼까요?', '03');
  add('RV03', 1, '*', 'a', '어떤 활동에서 도움을 느꼈나요? 도움이 없었다면 그렇게 적어도 괜찮아요.', '03');
  add('RV03', 1, '*', 'b', 'Read, Reflect, Recite 중 어느 단계였는지 적어 볼까요?', '03');
  add('RV03', 1, 'PARTIAL', 'a', '실제로 어떤 활동을 했을 때였는지 한 가지만 구체적으로 적어 볼까요?', 'NEW');
  add('RV03', 2, '*', 'a', '그 방법이 네 판단에 어떻게 영향을 주었는지 적어 볼까요?', '03');
  add('RV03', 2, '*', 'b', '단계, 실제로 한 행동, 그 이유 순서로 적어 볼까요?', '03');
  add('RV04', 1, '*', 'a', '무엇을 먼저 확인하겠다는 뜻인가요?', '03');
  add('RV04', 1, '*', 'b', 'AI 설명을 확인할 때 무엇을 먼저 봤나요?', 'STD', 'EXPERIMENT');
  add('RV04', 1, '*', 'b', '내 풀이를 점검할 때 무엇을 먼저 봤나요?', 'NEW', 'CONTROL');
  add('RV04', 1, 'PARTIAL', 'a', '다음 문제에서 가장 먼저 확인할 항목 하나를 구체적으로 적어 볼까요?', 'NEW');
  add('RV04', 2, '*', 'a', '조건, 사용한 성질, 계산 중 먼저 확인할 곳은 어디인가요?', '03');
  add('RV04', 2, '*', 'b', '다음 평행사변형 문제에서도 사용할 점검 기준을 하나 적어 보세요.', 'STD');

  /* 공통 응답 */
  var COMMON = {
    PRE_SUBMIT: { id: 'C-PRE_SUBMIT', level: 0, text: '먼저 네 생각을 적어 보세요. 확실하지 않아도 괜찮아요. 제출하면 그다음에 함께 점검해요.', type: '절차', mechanism: '구조화' },
    ANSWER_REQUEST: { id: 'C-ANSWER_REQUEST', level: 1, text: '정답은 바로 알려주지 않을게요. 문제에서 주어진 것과 구해야 하는 것을 먼저 적어 볼까요?', type: '메타인지', mechanism: '문제화' },
    ACK: { id: 'C-ACK', level: 0, text: '기록했어요. 다음 문항으로 넘어가세요.', type: null, mechanism: null },
    ALREADY_DONE: { id: 'C-ALREADY_DONE', level: 0, text: '이 문항은 기록이 끝났어요. 다음 문항으로 넘어가세요.', type: null, mechanism: null },
    RESUBMIT_FIRST: { id: 'C-RESUBMIT_FIRST', level: null, text: '받은 질문을 생각하며 답을 고쳐 다시 제출해 보세요. 다시 제출한 뒤에도 막히면 도움을 요청하세요.', type: '절차', mechanism: '구조화' },
    UNRESOLVED: { id: 'C-UNRESOLVED', level: null, text: '지금 생각과 사용한 성질을 그대로 남기고 다음 문항으로 넘어가도 괜찮아요.', type: '절차', mechanism: '구조화' },
    AMBIGUOUS: { id: 'C-AMBIGUOUS', level: 1, text: '네가 쓴 문장이 어떤 뜻인지 조금 더 분명하게 적어 볼까요? 변·각·선분을 {AO}, ∠A처럼 이름으로 써 보세요.', type: '메타인지', mechanism: '문제화' },
    COPY: { id: 'C-COPY', level: 1, text: '옮겨 적은 문장 대신, 같은 내용을 네 말로 다시 적어 볼까요?', type: '메타인지', mechanism: '문제화' },
    OFF_TOPIC: { id: 'C-OFF_TOPIC', level: 1, text: '지금은 평행사변형의 성질에 집중해요. 이 문항에 대한 네 생각을 적어 볼까요?', type: '절차', mechanism: '구조화' },
    WAIT_TEACHER: { id: 'C-WAIT_TEACHER', level: null, text: '도움 요청을 보냈어요. 선생님의 답을 기다리는 동안 지금 생각을 계속 적어 보세요.', type: null, mechanism: null }
  };

  /* 상한 초과 또는 정답 노출로 은행에서 뺀 03 원문(승인 검토용) */
  var EXCLUDED = [
    { item: 'PV01', level: 3, text: '평행사변형의 이름이 나타내는 변 관계를 생각해 볼까?', reason: 'Preview 상한 2 초과' },
    { item: 'PV01', level: 4, text: '평행사변형의 두 쌍의 대변은 각각 평행해. 네가 알고 있던 설명과 연결해 볼래?', reason: 'Preview에서 정의 선공개' },
    { item: 'PV02', level: 3, text: '서로 마주 보는 위치 관계를 살펴볼래?', reason: 'Preview 상한 2 초과' },
    { item: 'PV02', level: 4, text: '한 쌍의 변이 아니라 두 쌍의 대변이 평행한 그림이야. 무엇을 확인하고 싶니?', reason: 'Preview에서 정의 선공개' },
    { item: 'QU01', level: 3, text: '그 성질이 항상 성립하는지를 묻는 질문으로 만들어 볼래?', reason: 'Question 상한 2 초과' },
    { item: 'QU01', level: 4, text: '질문할 때 비교할 대상과 확인할 관계를 적어 봐. 질문 문장은 네가 완성해.', reason: 'Question 상한 2 초과' },
    { item: 'QU02', level: 3, text: '관찰했던 부분과 질문을 연결해 볼래?', reason: 'Question 상한 2 초과' },
    { item: 'QU02', level: 4, text: '질문을 만든 이유는 알고 있던 내용과 확인하려는 내용을 이어서 적을 수 있어.', reason: 'Question 상한 2 초과' },
    { item: 'RD03', level: 4, text: '평행사변형의 대각은 같고 이웃각 합은 180°, 대각선은 서로를 이등분해. …', reason: 'RD03 정답 전체 노출 → 빠진 성질 하나만 제시하도록 교체' },
    { item: 'RF02', level: 4, text: '…AC의 절반이 7이라는 사실과 BD의 절반을 판단할 자료를 구별해 봐.', reason: '수치(7) 제시 → 수치 없이 교체' },
    { item: 'RC01', level: 4, text: '평행사변형은 마주보는 변의 길이가 같아. 네 문장으로 설명해 줘.', reason: 'Recite 정답 노출, 상한 3 초과' },
    { item: 'RC02', level: 4, text: '평행사변형에서 마주보는 각은 같고 이웃한 각의 합은 180°야. …', reason: 'Recite 정답 노출, 상한 3 초과' },
    { item: 'RC03', level: 4, text: '평행사변형에서 대각선은 서로를 이등분해. 그 뜻을 네가 설명해 줘.', reason: 'Recite 정답 노출, 상한 3 초과' },
    { item: 'RC04', level: 4, text: '그림의 평행한 두 쌍의 변과 교점에 관해 배운 성질을 연결해 …', reason: 'Recite 상한 3 초과' },
    { item: 'RV01', level: 3, text: '오늘 배운 개념을 연결해 직접 답해 볼래?', reason: 'Review 상한 2 초과' },
    { item: 'RV01', level: 4, text: '질문에 대한 답은 배운 성질과 그 적용 대상을 연결해 써 볼 수 있어. 네 말로 적어 봐.', reason: 'Review 상한 2 초과' },
    { item: 'RV02', level: 3, text: '달라진 점이나 여전히 불확실한 점 하나를 적어 볼까?', reason: 'Review 상한 2 초과' },
    { item: 'RV02', level: 4, text: '처음 생각, 현재 판단, 그 이유 순서로 네 경험을 정리해 볼 수 있어.', reason: 'Review 상한 2 초과' },
    { item: 'RV03', level: 3, text: '왜 그 방법이 네 판단에 도움이 되었는지 적어 볼래?', reason: 'Review 상한 2 초과' },
    { item: 'RV03', level: 4, text: '해당 단계, 실제 행동, 도움이 된 이유를 네 경험대로 작성해 줘.', reason: 'Review 상한 2 초과' },
    { item: 'RV04', level: 3, text: 'AI의 설명에 나온 성질이 문제 조건에 맞는지 먼저 보겠니?', reason: 'Review 상한 2 초과' },
    { item: 'RV04', level: 4, text: '문제 조건, 적용한 성질, 추론과 결론을 점검할 수 있어. 네가 쓸 순서를 직접 정해 봐.', reason: 'Review 상한 2 초과' }
  ];

  var LEVEL_TAGS = {
    1: { type: '메타인지', mechanism: '문제화' },
    2: { type: '개념', mechanism: '결합' },
    3: { type: '전략', mechanism: '구조화' },
    4: { type: '개념', mechanism: '구조화' }
  };
  B.forEach(function (e) { var t = LEVEL_TAGS[e.level]; e.type = t.type; e.mechanism = t.mechanism; });

  /* 짝 문항(지원 감소 관찰용 제안): 앞 문항에서 도움을 받았고 뒤 문항을 도움 없이 해결하면 DECREASED */
  var FADING_PAIRS = { RF03: 'RD01', RF02: 'RD02' };

  var FIGURE = {
    points: { A: [170, 46], B: [390, 46], C: [300, 226], D: [80, 226], O: [235, 136] },
    sides: ['AB', 'BC', 'CD', 'DA'],
    diagonals: ['AC', 'BD'],
    halves: ['AO', 'OC', 'BO', 'OD'],
    angles: ['A', 'B', 'C', 'D']
  };

  /* 개념 자료(교재). 클라이언트 제공 이미지, 차시별. lesson 1의 main·reference만 1차시 Read에서 학생에게 보인다. */
  var MATERIALS = [
    { id: 'L1_parallelogram_properties', lesson: 1, role: 'main', title: '평행사변형의 성질', topic: '평행사변형의 정의·성질·증명' },
    { id: 'L0_triangle_congruence', lesson: 1, role: 'reference', title: '참고: 삼각형의 합동', topic: 'SSS·SAS·ASA 합동(성질 증명에 쓰이는 선수 학습)' },
    { id: 'L2_parallelogram_conditions', lesson: 2, role: 'main', title: '평행사변형이 되는 조건', topic: '다섯 가지 조건과 증명' },
    { id: 'L3_rectangle', lesson: 3, role: 'main', title: '직사각형', topic: '뜻, 대각선의 성질, 평행사변형이 직사각형이 되는 조건' },
    { id: 'L4_rhombus', lesson: 4, role: 'main', title: '마름모', topic: '뜻, 대각선의 수직이등분, 평행사변형이 마름모가 되는 조건' },
    { id: 'L5_square', lesson: 5, role: 'main', title: '정사각형', topic: '뜻, 성질, 직사각형·마름모가 정사각형이 되는 조건' },
    { id: 'L6_isosceles_trapezoid', lesson: 6, role: 'main', title: '등변사다리꼴', topic: '뜻, 성질, 증명' },
    { id: 'L7_quadrilateral_relations', lesson: 7, role: 'main', title: '여러 가지 사각형 사이의 관계', topic: '관계도, 대각선의 성질 비교' },
    { id: 'L8_parallel_lines_area', lesson: 8, role: 'main', title: '평행선과 삼각형의 넓이', topic: '밑변·높이가 같은 삼각형, 사각형을 넓이가 같은 삼각형으로' }
  ];
  MATERIALS.forEach(function (m) { m.file = 'materials/' + m.id + '.webp'; m.thumb = 'materials/' + m.id + '_thumb.webp'; });
  /* 개념 자료 검토 메모(연구자 확인용) */
  var MATERIAL_NOTES = [
    { id: 'L1_parallelogram_properties', kind: '그림 방향', text: '교재 그림은 A(왼쪽 위)→B(왼쪽 아래)→C(오른쪽 아래)→D(오른쪽 위) 순서이고, 활동지와 앱 그림은 A(왼쪽 위)→B(오른쪽 위)→C→D 순서입니다. 성질은 같지만 학생이 두 그림을 오가며 꼭짓점 위치를 헷갈릴 수 있어 한쪽으로 맞추기를 권합니다.' },
    { id: 'L1_parallelogram_properties', kind: '내용 맞춤', text: '성질 (2)는 “두 쌍의 대각의 크기는 각각 같다”만 적고, Read ①(∠B)과 Recite 각의 성질 기준(03)에 필요한 “이웃한 두 각의 합은 180°”는 증명 아래 “또,” 문장에만 나옵니다. 성질 목록에 추가할지, 03 기준에서 뺄지 정해야 합니다.' },
    { id: 'L1_parallelogram_properties', kind: '용어', text: '교재는 “대변·대각”, “서로 다른 것을 이등분한다”를 쓰고 활동지는 “마주 보는”, “서로를 이등분한다”를 씁니다. 판정은 두 표현을 모두 인정합니다.' },
    { id: 'L4_rhombus', kind: '기호 오류', text: '증명 ③의 “△ABO = △ADO (SSS합동)”는 합동 기호 “≡”가 맞습니다.' },
    { id: 'L5_square', kind: '형식', text: '다른 장과 달리 맨 위 제목(정사각형)이 없습니다.' }
  ];

  var API = {
    MATERIALS: MATERIALS, MATERIAL_NOTES: MATERIAL_NOTES,
    VERSIONS: VERSIONS, STAGES: STAGES, ITEMS: ITEMS, RUBRIC: RUBRIC, STATES: STATES, BANK: B, COMMON: COMMON,
    EXCLUDED: EXCLUDED, FIXED_AI: FIXED_AI, USE_CHOICES: USE_CHOICES, CONTROL_RF_SUB: CONTROL_RF_SUB,
    FADING_PAIRS: FADING_PAIRS, FIGURE: FIGURE, READ_PROBLEM: READ_PROBLEM, LEVEL_TAGS: LEVEL_TAGS
  };
  root.PQ_CONTENT = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
