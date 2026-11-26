'use strict';
const rows=require('../data/prompt-bank-1126.json');
function load(items){
 if(!Array.isArray(rows)||rows.length!==1126||new Set(rows.map(r=>r[0])).size!==1126)throw Error('1126 prompt bank integrity');
 const ids=new Set(items.filter(x=>!x.archived).map(x=>x.id));
 const bank=[];
 rows.forEach(function(r){
  const [id,lesson,unit,stage,item,activity,situation,mechanism,focus,text,design,origin]=r;
  if(!id||!text||!situation||!['계획','점검','평가'].includes(mechanism)||!Number.isInteger(lesson)||lesson<1||lesson>8)throw Error('Invalid prompt '+id);
  const targets=/^L[1-8]QU$/.test(item)?[item+'01',item+'02']:[item];
  targets.forEach(function(target,i){
   if(!ids.has(target))throw Error('Unknown prompt item '+target);
   bank.push({id:i?id+'-QU02':id,source_id:id,item:target,lesson,unit,stage,activity,situation,mechanism,focus,text,design,origin,level:1,state:'*',variant:'context1126',priority:1,type:'메타인지',src:'USER_XLSX_1126_APPROVED_20261126',review_status:'RESEARCHER_APPROVED_20261126',group:null});
  });
 });
 if(new Set(bank.map(b=>b.id)).size!==bank.length)throw Error('Duplicate runtime prompt IDs');
 return bank;
}
module.exports={load};
