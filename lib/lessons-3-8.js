/* 3~8차시: 사용자 제공 학생용 최신 PDF(각 9쪽)를 단계별로 연결.
 * 학생에게 보이는 원본 그림·문제는 별도 lesson_assets.pdf 원본에 있으며 이 파일은 답안 입력 필드를 정의한다.
 * PDF 누락 시 문제 그림을 지어내지 않는다. */
'use strict';
const titles={
  3:'평행사변형이 되는 조건',4:'직사각형',5:'마름모',6:'정사각형',
  7:'등변사다리꼴',8:'여러 가지 사각형 사이의 관계'
};
const preview={
  3:'사각형 ABCD에서 AB=5, BC=8일 때 ABCD가 평행사변형이 되는 조건을 보기에서 고르세요.',
  4:'직사각형 ABCD에서 대각선의 성질을 이용하여 ∠x의 크기를 구하세요.',
  5:'평행사변형 ABCD가 마름모가 되도록 하는 조건을 모두 고르세요. (정답 2개)',
  6:'평행사변형 ABCD가 정사각형이 되도록 하는 조건을 고르세요.',
  7:'등변사다리꼴 ABCD에서 ∠B=78°, ∠CAD=32°일 때 ∠x+∠y를 구하세요.',
  8:'여러 가지 사각형의 포함 관계에 관한 다섯 문장 중 옳지 않은 것을 고르세요.'
};
const recite={
  3:['평행사변형의 변에 관련된 조건을 두 가지 써보세요.','평행사변형의 각에 관련된 조건을 한 가지 써보세요.','평행사변형의 대각선에 관련된 조건을 한 가지 써보세요.','평행사변형에서 평행과 길이에 관련된 조건을 한 가지 써보세요.'],
  4:['직사각형의 뜻을 설명해보세요.','직사각형의 대각선은 어떤 성질이 있나요?','평행사변형이 직사각형이 되는 조건 두 가지를 친구에게 설명하듯이 적어보세요.'],
  5:['마름모의 뜻을 써보세요.','마름모의 대각선의 성질을 써보세요.','평행사변형이 마름모가 되는 조건 두 가지를 친구에게 설명하듯이 적어보세요.'],
  6:['정사각형의 뜻을 설명하세요.','직사각형이 정사각형이 되는 조건을 써보세요.','마름모가 정사각형이 되는 조건을 써보세요.'],
  7:['등변사다리꼴의 뜻을 써보세요.','등변사다리꼴의 변의 성질에 대해서 써보세요.','등변사다리꼴의 대각선의 성질에 대해서 써보세요.'],
  8:['평행사변형에서 직사각형이 되는 조건을 친구에게 설명하듯 쉽게 두 가지 이야기해 주세요.','직사각형에서 정사각형이 되는 조건을 친구에게 설명하듯 쉽게 두 가지 이야기해 주세요.','대각선이 서로를 이등분하는 사각형을 모두 써보세요.','대각선의 길이가 같은 사각형을 모두 써보세요.']
};
const explanation={
  3:['ㄹ은 마주 보는 두 쌍의 변의 길이가 각각 같으므로 맞다. 정답은 ㄹ뿐이다.','ㄴ처럼 두 대각선이 수직이면 평행사변형이다. ㄷ처럼 한 쌍의 대변이 평행하고 길이도 같을 때도 평행사변형이다. 그러므로 정답은 ㄴ, ㄷ이다.','AB ∥ CD이고 AD=BC만으로는 평행사변형이라고 확정할 수 없다. 평행한 같은 한 쌍의 대변의 길이도 같아야 한다.'],
  4:['직사각형에서는 두 대각선이 서로를 이등분하므로 OB=OD이다. 따라서 OD는 5cm이다.','② 선분 AC=선분 BD가 정답이다. 직사각형은 언제나 두 대각선의 길이가 같기 때문이다.','∠ACD=36°이므로 ∠DAC도 36°이다. 따라서 x=36°, y=90°이다.'],
  5:['마름모의 두 대각선 길이는 언제나 같아서 AC=BD=14cm이다. 따라서 AO=7cm이다.','AC가 ∠C를 이등분하는 평행사변형은 마름모이다. AD=4cm이므로 네 변이 4cm이고 둘레는 16cm이다.','AB는 11cm이다. 이웃한 변 AD도 11cm로 길이가 같으면 네 변의 길이가 같아서 마름모가 된다.'],
  6:['한 각이 직각이고 두 대각선의 길이가 같으면 언제나 정사각형이다.','마름모의 대각선은 원래 길이가 같다. 그러므로 AC=BD라는 조건은 없어도 된다.','△PBC는 정삼각형이므로 ∠PCB=60°, PC=BC=CD이다. ∠PCD=90°−60°=30°이다. 따라서 △PCD는 이등변삼각형이고 두 밑각도 30°이므로 x=30°이다.'],
  7:['∠A=115°이므로 ∠B=180°−115°=65°이다. 아래쪽 밑각 두 개가 같아 ∠C=65°이다.','D에서 AB와 평행한 선을 그어 BC와 만나는 점을 E라고 하자. ABED가 평행사변형이므로 BE=6cm, DE=7cm이다. EC=7cm, CD=7cm이므로 △DEC는 정삼각형이다. ∠C=60°이고 등변사다리꼴은 두 밑각이 같으므로 ∠A=60°이다.','55°+40°=95°이므로 ∠D=95°이다.'],
  8:['AD ∥ BC이고 AD=BC이면 평행사변형이다. 여기에 AC ⊥ BD 조건이 있으면 마름모가 된다.','평행사변형에서 두 대각선의 길이가 같으면 등변사다리꼴이다. 그러므로 ③의 짝은 옳다.','평행사변형의 조건을 볼 수 있고 두 대각선이 수직으로 만나기 때문에 마름모이다.']
};
const verdict=[{v:'right',label:'옳다'},{v:'partly',label:'일부만 옳다'},{v:'wrong',label:'다 틀리다'}];
function long(key,label,rows){return {key,label,kind:'long',rows:rows||3};}
function add(data){
 const {LESSONS,ITEMS,PROBLEMS,FIXED_AI,RUBRIC,KEYS}=data;
 for(let n=3;n<=8;n++){
   const p='L'+n, title=titles[n];
   LESSONS[n]={n,title,total:60,min:[2,2,16,19,9,12],tool:false,
     stageProblem:{Preview:p+'P',Question:p+'P',Review:p+'P'},
     source:'USER_STUDENT_PDF_20261029',pdf_pages:{Preview:[1],Question:[2],Read:[3,4],Reflect:[5,6,7],Recite:[8],Review:[9]}};
   PROBLEMS[p+'P']={text:preview[n],fig:null};
   const addItem=(it)=>{ITEMS.push(it);RUBRIC[it.id]={expected:'제공된 원본 활동지 '+n+'차시 '+it.stage+' 단계의 문항에 근거해 평가함.',accepted:'답안과 수학적 근거를 검토. 자동 확정 채점 금지.',misconceptions:'원본 정답지와 대조 필요',draft:true,src:'USER_PDF_20261029'};};
   addItem({id:p+'PV01',lesson:n,stage:'Preview',mark:'①',kind:'open',title:'원본 활동지 1쪽 그림을 보고 이미 알고 있는 것을 적어보세요.',
     fields:[long('text','내가 이미 알고 있는 것',4)]});
   addItem({id:p+'QU01',lesson:n,stage:'Question',mark:'①',kind:'question',title:'오늘 문제를 보고 내가 궁금한 것을 질문으로 써보세요.',
     fields:[long('text','내가 만든 질문',3)]});
   addItem({id:p+'QU02',lesson:n,stage:'Question',mark:'②',kind:'open',title:'왜 그 질문이 생겼나요? 알고 있는 것과 모르는 것을 구분해보세요.',
     fields:[long('text','질문이 생긴 이유',3)]});
   addItem({id:p+'RD01',lesson:n,stage:'Read',mark:'①',kind:'memo',title:'개념을 보고 해결할 문제의 근거를 찾아보세요. (활동지 3쪽)',
     fields:[long('text','학습한 핵심 개념과 근거',4)]});
   addItem({id:p+'RD02',lesson:n,stage:'Read',mark:'②',kind:'open',math:true,title:'원본 활동지 4쪽의 문제를 풀어보세요.',
     fields:[long('answer','(1) 답을 쓰세요',2),long('work','(2) 그렇게 판단한 이유를 써보세요',4)]});
   for(let i=1;i<=3;i++){
     const id=p+'RF0'+i;FIXED_AI[id]={text:explanation[n][i-1],type:'PREWRITTEN',ok:[],near:[]};
     addItem({id,lesson:n,stage:'Reflect',mark:'문제 '+i,kind:'rf',math:true,
       title:'원본 활동지 '+(i+4)+'쪽 문제와 검토할 설명을 비교하세요.',
       byGroup:{EXPERIMENT:{fixedAI:id},CONTROL:{fixedAI:id}},
       fields:[{key:'verdict',label:'① 검토할 설명은 어떠한가요?',kind:'choice',options:verdict},
         long('reason','② 이유를 쓰고, 틀리거나 부족하면 바르게 고쳐보세요',4)]});
   }
   recite[n].forEach((q,i)=>addItem({id:p+'RC0'+(i+1),lesson:n,stage:'Recite',mark:String(i+1),kind:'recite',
     title:q,fields:[long('text','내 말로 설명하기',4)]}));
   addItem({id:p+'RV01',lesson:n,stage:'Review',mark:'①',kind:'rv_solve',math:true,
     title:'원본 활동지 9쪽의 처음 문제를 다시 풀고 답과 풀이를 쓰세요.',
     fields:[long('text','풀이 과정과 답 (모르면 어려운 점도 적으세요)',5),
       {key:'pre_confidence',label:'정답 공개 전 내 판단의 확신 정도',kind:'choice',
        options:[{v:'1',label:'확신한다'},{v:'2',label:'조금 불확실하다'},{v:'3',label:'아직 모르겠다'}]}]});
 }
}
module.exports={add,titles,preview,recite,explanation};
