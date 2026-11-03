'use strict';
const assert=require('node:assert/strict'),{call}=require('./classroom.test'),{db}=require('../lib/db');
module.exports=async function(){const sql=db();let r=await call('POST','login/staff',{role:'researcher',password:process.env.RESEARCHER_PASSWORD});const rt=r.body.token;
await call('POST','admin/class',{code:'TESTANS',group:'CONTROL',teacher_code:'T1'},rt);await call('POST','admin/class-roster',{class_code:'TESTANS',csv:'code,pin\nA01,1111\nA02,1111\nA03,1111'},rt);
r=await call('POST','staff/new-demo',{class_code:'TESTANS',lesson:1},rt);const code=r.body.session.code;const toks=[];for(const student_code of ['A01','A02','A03']){r=await call('POST','login/student',{class_code:'TESTANS',student_code,pin:'1111'});toks.push(r.body.token);}await call('POST','staff/clock',{session:code,action:'start'},rt);
for(const tok of toks){r=await call('POST','me/submit',{item_id:'L1PV01',fields:{text:'삼각형을 살펴본다'}},tok);assert.equal(r.status,200);assert.equal(r.body.requests.length,0);r=await call('POST','me/help',{item_id:'L1PV01'},tok);assert.equal(r.body.requests.length,1);}
r=await call('GET','staff/overview?session='+code,undefined,rt);assert.equal(r.body.requests.length,3);assert.ok(r.body.requests.every(x=>x.recommendation&&x.fields.text));
r=await call('POST','me/submit',{item_id:'L1PV01',fields:{text:'수정한 생각'}},toks[0]);assert.equal(r.status,200);assert.equal(r.body.requests.length,0);r=await call('GET','staff/overview?session='+code,undefined,rt);assert.equal(r.body.requests.length,2);
r=await call('POST','me/help',{item_id:'L1PV01'},toks[0]);assert.equal(r.body.requests.length,1);
// Reflect 중 긴급 정지 후 재개: 세 학생, 답안, 요청, 남은 시간 유지
await sql`update sessions set stage=3,stage_opened=jsonb_set(stage_opened,'{3}',to_jsonb(now()::text)),clock=jsonb_set(clock,'{deadline}',to_jsonb((now()+interval '10 minutes')::text)) where code=${code}`;
r=await call('POST','staff/clock',{session:code,action:'pause'},rt);assert.equal(r.status,200);const remain=r.body.session.clock.remaining_ms;for(const tok of toks){r=await call('GET','me',undefined,tok);assert.equal(r.body.session.stage,3);assert.equal(r.body.session.clock.mode,'paused');assert.ok(r.body.items.L1PV01);}
r=await call('POST','staff/clock',{session:code,action:'resume'},rt);assert.equal(r.status,200);assert.equal(r.body.session.stage,3);assert.ok(Math.abs(Date.parse(r.body.session.clock.deadline)-Date.now()-remain)<1500);r=await call('GET','staff/overview?session='+code,undefined,rt);assert.equal(r.body.students.length,3);console.log('PASS: 제출/도움요청 분리, 이전 요청 종료, 답안별 추천, 학생3명 Reflect 정지·재개 보존');};
