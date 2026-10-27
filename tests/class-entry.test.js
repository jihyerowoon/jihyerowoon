/* 반 코드만으로 입장. T1/T01 및 학생 T01/T02/T04 혼동 방지 통합 검사. 격리 DB 전용. */
'use strict';
const assert=require('node:assert/strict');
const {call}=require('./classroom.test');
const {db}=require('../lib/db');
module.exports=async function main(){
 let n=0;const check=(v,msg)=>{assert.ok(v,msg);n++;};
 const sql=db();let r=await call('POST','login/staff',{role:'researcher',password:process.env.RESEARCHER_PASSWORD}),rt=r.body.token;
 r=await call('POST','login/staff',{role:'teacher',teacher_id:'T1',password:process.env.TEACHER_PASSWORD});const tt=r.body.token;
 for(const code of ['T1','T01']){r=await call('POST','admin/class',{code,group:'CONTROL',teacher_code:'T1'},rt);check(r.status===200,'별개 반 생성 '+code);}
 r=await call('POST','admin/class-roster',{class_code:'T01',csv:'code,pin\nT01,1111\nT02,1111\nT04,1111'},rt);check(r.body.created===3,'실제 형식의 학생 코드 세 개 등록');
 for(const [code,class_name,lesson] of [['T01','T1',1],['T01-L1','T01',1],['T01-L2','T01',2]]){r=await call('POST','admin/session',{code,class_name,lesson,settings:{autoTimer:true}},rt);check(r.status===200,'수업 준비 '+code);}
 const body={class_code:'t01',student_code:'t01',pin:'1111'};
 r=await call('POST','login/student',body);check(r.body.code==='class_waiting','시작 전 대기, 차시 입력 요구 없음');
 r=await call('POST','login/student',{...body,class_code:'T1'});check(r.status===403&&r.body.code==='not_in_class','T1/T01은 다른 반, 타반 입장 차단');
 r=await call('POST','login/student',{...body,pin:'2222'});check(r.status===401,'틀린 PIN 차단');
 r=await call('POST','staff/clock',{session:'T01-L2',action:'start'},tt);check(r.status===200,'교사가 2차시 선택 및 시작');
 for(const code of ['t01','t02','t04']){r=await call('POST','login/student',{...body,student_code:code});check(r.status===200&&r.body.me.session.code==='T01-L2'&&r.body.me.session.lesson===2,'학생은 반 코드만으로 시작한 2차시 입장 '+code);}
 r=await call('POST','staff/clock',{session:'T01-L1',action:'start'},tt);check(r.status===409&&r.body.code==='class_already_running','같은 반의 두 수업 동시 시작 방지');
 r=await call('POST','login/student',{session_code:'T01-L2',student_code:'T02',pin:'1111'});check(r.status===200,'구형 수업 코드 API 호환');
 await call('POST','staff/clock',{session:'T01-L2',action:'pause'},tt);
 r=await call('POST','login/student',body);check(r.status===200&&r.body.me.session.clock.mode==='paused','정지 중 재입장도 동일 수업으로 연결');
 await call('POST','staff/clock',{session:'T01-L2',action:'resume'},tt);
 // 비정상적으로 여러 활성 수업이 남은 구형 데이터는 임의의 차시로 보내지 않는다.
 await sql`update sessions set clock=jsonb_build_object('mode','running','deadline',${new Date(Date.now()+100000).toISOString()}::text) where code='T01-L1'`;
 r=await call('POST','login/student',body);check(r.body.code==='class_ambiguous','기존 복수 활성 수업을 임의 선택하지 않음');
 await sql`update sessions set clock='{"mode":"finished"}'::jsonb where class_name='T01'`;
 r=await call('POST','login/student',body);check(r.body.code==='class_waiting','완료 수업에 잘못 재배정하지 않음');
 const classes=await call('GET','admin/classes',undefined,rt);check(classes.body.classes.length===2,'두 반 보존');
 console.log('PASS '+n+': 반 코드 입장, 소문자 학생 코드, PIN1111, 대기, 교사 선택 차시, 반 구분, 동시 시작 방지, 기존 API 호환');
};
