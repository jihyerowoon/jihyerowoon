/* 수업 준비 → 학생 전원 입장 → 교사 시작 시 Preview 2분 동시 시작 */
'use strict';
const assert=require('node:assert/strict');const {call}=require('./classroom.test');const {db}=require('../lib/db');
module.exports=async function(){let n=0;const ok=(v,m)=>{assert.ok(v,m);n++;};const sql=db();
 let r=await call('POST','login/staff',{role:'researcher',password:process.env.RESEARCHER_PASSWORD});const rt=r.body.token;
 r=await call('POST','login/staff',{role:'teacher',teacher_id:'T1',password:process.env.TEACHER_PASSWORD});const tt=r.body.token;
 await call('POST','admin/class',{code:'TESTPRE',group:'CONTROL',teacher_code:'T1'},rt);await call('POST','admin/class-roster',{class_code:'TESTPRE',csv:'code,pin\nP01,1111\nP02,1111\nP03,1111'},rt);
 await call('POST','admin/session',{code:'TESTPRE-L1',class_name:'TESTPRE',lesson:1,settings:{autoTimer:true}},rt);
 let tokens=[];for(const code of ['P01','P02','P03']){r=await call('POST','login/student',{class_code:'TESTPRE',student_code:code,pin:'1111'});ok(r.status===200,'일반 수업 시작 전 입장 '+code);ok(r.body.me.session.stage===0&&!r.body.me.session.clock.deadline,'학생 대기 중 Preview/시간 미시작 '+code);tokens.push(r.body.token);}
 r=await call('GET','staff/overview?session=TESTPRE-L1',undefined,tt);ok(r.body.students.length===3&&r.body.students.every(s=>s.last_seen),'교사가 사전 입장 3명 확인');
 for(const tok of tokens){r=await call('POST','me/draft',{item_id:'L1PV01',draft:{text:'미리 답 작성'}},tok);ok(r.body.saved===false,'시작 전 작성 불가');}
 r=await call('POST','staff/ready',{session:'TESTPRE-L1'},tt);ok(r.body.ok,'교사 수업 선택은 타이머 시작 아님');
 r=await call('POST','staff/clock',{session:'TESTPRE-L1',action:'start'},tt);ok(r.status===200,'교사 수업 시작');const opened=r.body.session.stage_opened[0],deadline=r.body.session.clock.deadline;
 ok(Date.parse(deadline)-Date.parse(opened)===120000,'누른 시점부터 정확히 Preview 2분');ok(r.body.session.clock.started_at===opened,'경과 0분의 시작 시각도 교사 버튼 시각');
 for(const tok of tokens){r=await call('GET','me',undefined,tok);ok(r.body.session.stage===0&&r.body.session.clock.deadline===deadline&&r.body.session.stage_opened[0]===opened,'입장한 학생의 공통 시작 시각');}
 // 별도 반: 두 차시를 준비해도 교사가 고른 대기 수업에 입장한다.
 await call('POST','admin/class',{code:'TESTMULTI',group:'CONTROL',teacher_code:'T1'},rt);await call('POST','admin/class-roster',{class_code:'TESTMULTI',code:'M01',pin:'1111'},rt);
 for(const lesson of [1,2])await call('POST','admin/session',{code:'TESTMULTI-L'+lesson,class_name:'TESTMULTI',lesson,settings:{autoTimer:true}},rt);
 r=await call('POST','login/student',{class_code:'TESTMULTI',student_code:'M01',pin:'1111'});ok(r.body.code==='class_ambiguous','교사 선택 전 복수 대기 수업을 임의 배정하지 않음');
 r=await call('POST','staff/ready',{session:'TESTMULTI-L2'},tt);ok(r.body.ok,'교사가 준비할 2차시 선택');
 r=await call('POST','login/student',{class_code:'TESTMULTI',student_code:'M01',pin:'1111'});ok(r.status===200&&r.body.me.session.lesson===2&&!r.body.me.session.clock.deadline,'선택한 차시에 시작 전 입장');
 r=await call('POST','staff/ready',{session:'TESTMULTI-L1'},tt);ok(r.status===409&&r.body.code==='students_already_waiting','학생이 대기 중인 다른 수업에서 임의로 바꾸지 않음');
 r=await call('POST','staff/clock',{session:'TESTMULTI-L1',action:'start'},tt);ok(r.status===409&&r.body.code==='students_already_waiting','다른 수업 시작으로 대기 학생을 남겨 두지 않음');
 console.log('PASS '+n+': 일반 수업 사전 입장, 접속 인원, 시작 전 쓰기 차단, 공통 Preview 2분, 교사 차시 선택');
};
