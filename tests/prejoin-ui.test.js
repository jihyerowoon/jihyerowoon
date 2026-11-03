'use strict';
const assert=require('node:assert/strict');const {call}=require('./classroom.test');const {db}=require('../lib/db');
module.exports=async function(browser){
 let r=await call('POST','login/staff',{role:'researcher',password:process.env.RESEARCHER_PASSWORD});const rt=r.body.token;
 r=await call('POST','login/staff',{role:'teacher',teacher_id:'T1',password:process.env.TEACHER_PASSWORD});const tt=r.body.token;
 await call('POST','admin/class',{code:'T01',group:'CONTROL',teacher_code:'T1'},rt);await call('POST','admin/class-roster',{class_code:'T01',csv:'code,pin\nT01,1111\nT02,1111\nT04,1111'},rt);
 await call('POST','admin/session',{code:'OLD',class_name:'t01',lesson:1},rt);await call('POST','admin/session',{code:'T01-L1',class_name:'T01',lesson:1,settings:{autoTimer:true}},rt);
 const errors=[],tc=await browser.newContext(),t=await tc.newPage();t.on('pageerror',e=>errors.push(e.message));t.on('dialog',d=>d.accept());
 await tc.addInitScript(a=>{sessionStorage.setItem('pq4r:auth',JSON.stringify(a));localStorage.setItem('pq4r:teacher-session',JSON.stringify('OLD'));},{token:tt,role:'teacher',tid:'T1'});
 await t.goto('http://127.0.0.1:3200/');await t.getByRole('button',{name:'수업 시작',exact:true}).waitFor();assert.ok(!(await t.locator('#timer').innerText()).includes('시간 종료'));assert.ok((await t.locator('#teacher-live-timer').innerText()).includes('0:00'));
 await t.locator('#teacher-research-view').click();await t.locator('#l-pw').fill(process.env.RESEARCHER_PASSWORD);await t.locator('#lf button[type=submit]').click();await t.locator('#cl-prepare').waitFor();await t.locator('#cl-prepare').click();await t.getByRole('button',{name:'수업 시작',exact:true}).waitFor();
 assert.ok((await t.locator('#timer').innerText()).includes('0:00'));assert.ok((await t.locator('#teacher-entry-note').innerText()).includes('학생들이 반 코드로 먼저 입장'));
 const sc=await browser.newContext(),pages=[];
 for(const code of ['T01','T02','T04']){const p=await sc.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:3200/?class=T01#login-student');await p.locator('#l-code').fill(code);await p.locator('#l-pin').fill('1111');await p.locator('#lf button').click();await p.locator('#student-waiting').waitFor();assert.equal(await p.locator('#right textarea').count(),0);assert.ok((await p.locator('#timer').innerText()).includes('0:00'));pages.push(p);}
 await t.waitForFunction(()=>document.querySelector('#console-stats').textContent.includes('접속 3'));await t.locator('.console-header').screenshot({path:'tests/shots/start-button.png'});const sql=db();let [s]=await sql`select * from sessions where class_name='T01' and status='open' and settings->>'autoTimer'='true'`;assert.ok(!s.clock.deadline);
 await t.getByRole('button',{name:'수업 시작',exact:true}).click();for(const p of pages)await p.waitForFunction(()=>document.querySelector('#right textarea')&&!document.querySelector('#right textarea').disabled);
 [s]=await sql`select * from sessions where class_name='T01' and status='open' and settings->>'autoTimer'='true'`;assert.equal(Date.parse(s.clock.deadline)-Date.parse(s.stage_opened[0]),120000);assert.equal(s.stage,0);for(const p of pages){assert.ok((await p.locator('#timer').innerText()).includes('Preview'));assert.ok(await p.locator('#right textarea').first().isEnabled());}
 assert.deepEqual(errors,[]);console.log('PASS Chromium: 기존 수동 수업 구분, 연구자 새 수업 준비, 일반 학생 3명 사전 입장, 접속 확인 후 교사 시작, Preview 2분 동시 시작');
};
