/* Review 정답 공개: 서버 시간 기준 8분 자기점검 + 4분 해설 및 사후 성찰.
 * 문제/해설은 서버에서만 제공. 미공개 자료가 /api/content에 포함되지 않도록 별도 모듈.
 * 연구자 검수 전: 모든 수학 답안/서술을 최신 활동지와 대조한 뒤 main 병합할 것.
 */
'use strict';
const C = require('./content');
const DELAY_MS = 6 * 60 * 1000;
const REFLECT_DELAY_MS = 10 * 60 * 1000;
const DURATION_MS = 12 * 60 * 1000;
const SOLUTIONS = {
  1: [
    { item_id:'L1RF01', answer:'검토 설명에 오류 있음. 올바른 합동조건은 ASA.',
      steps:['∠A=∠C, AO=CO는 주어진 조건이다.','∠AOB=∠COD는 맞꼭지각으로 같다.','한 변과 그 양 끝 각이 각각 같으므로 △ABO≡△CDO (ASA 합동)이다.','제시된 설명은 주어진 근거를 일부 맞게 썼지만 합동조건을 SAS로 잘못 판단했다.'] },
    { item_id:'L1RF02', answer:'옳지 않은 선택지 ③, ⑤. 검토 설명은 일부만 옳음.',
      steps:['AB=CB, AD=CD, BD는 공통변이므로 △ABD≡△CBD (SSS 합동)이다.','대응각 ∠ABD=∠CBD이므로 ③의 ∠CDB는 대응각이 아니다.','∠ADC는 2∠ADB이므로 ⑤의 2∠ABD라는 주장은 옳지 않다.','선택지 ②의 기호 =는 넓이가 같다는 뜻으로 해석해 판단한다(연구자가 현행 문항 사용을 확인함).'] },
    { item_id:'L1RF03', answer:'옳은 선택지 ②, ③, ⑤. 제시된 검토 설명은 옳음.',
      steps:['△ABC≡△DEF에서 A↔D, B↔E, C↔F가 대응한다.','BC의 대응변은 EF이고, DE=AB=5cm이다.','∠F=∠C=30°이며 ∠B는 180°−(60°+30°)=90°이다.'] },
    { item_id:'L1RD02', answer:'개념확인 정답은 ②(ㄱ, ㅁ), ⑤(ㄷ, ㄹ).',
      steps:['ㄱ과 ㅁ은 대응하는 세 변의 길이가 10cm, 8cm, 6cm로 각각 같으므로 SSS 합동이다.','ㄷ에서 아직 표시되지 않은 각은 180°−(40°+85°)=55°이다.','ㄷ과 ㄹ은 길이 6cm인 변과 양 끝 각 40°, 55°가 같으므로 ASA 합동이다.'] },
    { item_id:'L1RV01', answer:'△ABC≡△EFD, SAS 합동.',
      steps:['△DEF에서 ∠F=180°−(60°+40°)=80°이다.','AB=EF=8cm, BC=FD=7cm, ∠B=∠F=80°이다.','두 변과 그 끼인각이 각각 같으므로 △ABC≡△EFD (SAS 합동)이다.','대응 꼭짓점은 A↔E, B↔F, C↔D이다.'] }
  ],
  2: [
    { item_id:'L2RF01', answer:'③ 75°. 검토 설명에 오류 있음.',
      steps:['△AED는 AD=AE인 이등변삼각형이고 ∠DAE=30°이다.','∠ADE=∠AED=(180°−30°)÷2=75°이다.','이웃한 두 각의 합이 180°이므로 ∠DAB=105°이다.','∠BAE=105°−30°=75°이다.'] },
    { item_id:'L2RF02', answer:'옳지 않은 선택지 ④, ⑤. 검토 설명은 일부만 옳음.',
      steps:['평행사변형의 두 대각선은 서로를 이등분하여 OA=OC=3cm, OB=OD=4cm이다.','마주 보는 변이 같아 BC=AD=5cm, CD=AB=5cm이다.','따라서 OD=5cm라는 ④는 틀리고, △OBC 둘레는 4+3+5=12cm이므로 ⑤도 틀리다.'] },
    { item_id:'L2RF03', answer:'③ 96°. 검토 설명은 성질은 맞으나 계산값에 오류가 있음.',
      steps:['평행사변형의 이웃한 각 ∠A+∠B=180°이다.','∠A:∠B=8:7이므로 ∠A=180°×8/15=96°이다.','마주 보는 각이 같으므로 ∠C=∠A=96°이다.'] },
    { item_id:'L2RD02', answer:'개념확인 정답은 ①, ⑤ (ASA 합동에 필요한 조건).',
      steps:['평행사변형에서 AB∥CD이므로 ∠BAO=∠DCO, ∠ABO=∠CDO이다(엇각).','마주 보는 변의 길이가 같으므로 AB=CD이다(선택지 ①).','두 각과 그 사이의 변이 각각 같아 △ABO≡△CDO (ASA 합동)이다.','따라서 합동을 보이는 데 선택지 ①과 ⑤의 조건을 이용한다.'] },
    { item_id:'L2RV01', answer:'AE=3cm.',
      steps:['평행사변형의 대각선은 서로를 이등분하므로 AO=CO이다.','엇각과 맞꼭지각도 같으므로 △AEO≡△CFO (ASA 합동)이고, EO=FO=5cm이다.','△OCD의 넓이 30cm²=1/2×CD×5이므로 CD=12cm이다.','평행사변형의 대변은 길이가 같아 AB=CD=12cm이다.','AE=AB−EB=12−9=3cm이다.'] }
  ]
};
function status(session, time) {
  const t=session&&session.stage_opened&&session.stage_opened[5];
  const opened= t && Date.parse(t);
  const release_at=Number.isFinite(opened) ? new Date(opened+DELAY_MS).toISOString() : null;
  const ready=!!(session&&session.stage===5&&session.status==='open'&&release_at);
  const now=time==null?Date.now():Number(time);
  const unlocked=!!(ready&&now>=opened+DELAY_MS);
  const reflection_at=Number.isFinite(opened)?new Date(opened+REFLECT_DELAY_MS).toISOString():null;
  const reflect_unlocked=!!(ready&&now>=opened+REFLECT_DELAY_MS);
  return {enabled:ready,unlocked,release_at,reflection_at,reflect_unlocked,delay_seconds:360,compare_seconds:240,reflect_seconds:120,review_seconds:720,remaining_seconds:ready?Math.max(0,Math.ceil((opened+DELAY_MS-now)/1000)):null};
}
function publicSolutions(lesson) {
  const list=SOLUTIONS[Number(lesson)]||[];
  const order={'RV01':0,'RD02':1,'RF01':2,'RF02':3,'RF03':4};
  return list.map(x=>{
    const i=C.ITEMS.find(v=>v.id===x.item_id);
    const problem=i ? {id:i.id,title:i.title,mark:i.mark,fig:i.fig?C.FIGS[i.fig]:null,choices:i.choices||null} : null;
    if(problem&&i.stage==='Review') {
      const p=C.PROBLEMS['L'+lesson+'P'];
      problem.title=p&&p.text||i.title;
      problem.fig=p&&C.FIGS[p.fig]||null;
    }
    return {item_id:x.item_id,problem,answer:x.answer,steps:x.steps};
  }).sort((a,b)=>(order[a.item_id.slice(2)]??99)-(order[b.item_id.slice(2)]??99));
}
function normalizeReflection(body) {
  const focusItem=String(body.focus_item||'').trim();
  if(!/^L[12](RF0[123]|RV01|RD02)$/.test(focusItem)) throw new Error('성찰할 문제를 하나 선택해 주세요.');
  const level=String(body.understanding||'');
  if(!['explain','partial','uncertain'].includes(level)) throw new Error('이해 정도를 선택해 주세요.');
  const comparison=String(body.comparison||'').trim().slice(0,1200);
  const nextStep=String(body.next_step||'').trim().slice(0,1200);
  if(!comparison) throw new Error('나의 풀이와 해설을 비교해 새로 확인한 점을 한 문장으로 적어 주세요. 아직 모르는 점도 적어도 됩니다.');
  return {focus_item:focusItem,understanding:level,comparison,next_step:nextStep};
}
module.exports={DELAY_MS,DURATION_MS,SOLUTIONS,status,publicSolutions,normalizeReflection};
