/* 연구자가 제공한 2026-10-29 원본 CSV 560문항을 빠짐없이 읽는다.
 * 한 발문은 한 수준(level 1)만 제공하며 우선순위를 유지한다.
 * 학생 오답의 의미를 추론해서 추천하는 기능은 별도 검증 전이므로 구현하지 않는다. */
'use strict';
const fs=require('fs');
const path=require('path');
function rowsFromCSV(source){
 const rows=[];let row=[],v='',quote=false;
 for(let i=0;i<source.length;i++){
   const ch=source[i];
   if(ch==='"'){if(quote&&source[i+1]==='"'){v+='"';i++;}else quote=!quote;}
   else if(ch===','&&!quote){row.push(v);v='';}
   else if((ch==='\r'||ch==='\n')&&!quote){
     if(ch==='\r'&&source[i+1]==='\n')i++;
     row.push(v);if(row.some(x=>x.length))rows.push(row);row=[];v='';
   }else v+=ch;
 }
 row.push(v);if(row.some(x=>x.length))rows.push(row);
 return rows;
}
function itemOf(lesson,stage,activity){
 const prefix='L'+Number(lesson),a=String(activity||'');
 if(stage==='QUESTION')return prefix+(a.includes('(2)')?'QU02':'QU01');
 if(stage==='READ')return prefix+'RD02';
 if(stage.indexOf('REFLECT')===0)return prefix+'RF0'+stage.slice(-1);
 if(stage==='RECITE'){
   const k=/⑤\s*[-－]\s*([1-4])/.exec(a);
   const index=k?Number(k[1]):1;
   return prefix+'RC0'+index;
 }
 if(stage==='REVIEW')return prefix+'RV01';
 return null;
}
function load(){
 const file=path.join(__dirname,'../data/lesson_prompts_560.csv');
 const lines=rowsFromCSV(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
 const head=lines.shift();const index={};head.forEach((x,i)=>index[x]=i);
 const need=['발문ID','차시','단계','활동지내질문','추천순위','우선노출','학생발문','메타인지요소','제시상황','참고연구'];
 need.forEach(n=>{if(index[n]===undefined)throw Error('발문 CSV 필수 열 없음: '+n)});
 const list=lines.map(row=>{
   const col=k=>String(row[index[k]]||'').trim();
   const lesson=Number(col('차시')),item=itemOf(lesson,col('단계'),col('활동지내질문'));
   const priority=Number(col('추천순위'));
   if(!item||lesson<1||lesson>8||!col('학생발문')||!(priority>=1&&priority<=10))throw Error('발문 행 오류: '+col('발문ID'));
   return {id:col('발문ID'),item,lesson,level:1,state:'*',variant:'csv',
      text:col('학생발문'),type:'메타인지',mechanism:col('메타인지요소'),
      priority,priority_label:col('우선노출'),situation:col('제시상황'),origin:col('참고연구'),
      activity:col('활동지내질문'),src:'USER_CSV_560_20261029',
      review_status:'USER_PROVIDED_EXPERT_VALIDATION_PENDING',group:null};
 });
 if(list.length!==560||Array.from({length:8},(_,i)=>list.filter(x=>x.lesson===i+1).length).some(n=>n!==70))throw Error('560개 발문 갯수 불일치');
 list.sort((a,b)=>a.lesson-b.lesson||a.priority-b.priority||a.id.localeCompare(b.id));
 return list;
}
module.exports={load,rowsFromCSV,itemOf};
