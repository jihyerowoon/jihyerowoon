'use strict';
const assert=require('node:assert/strict'),A=require('../lib/auth');
module.exports=async function(browser){
 const ctx=await browser.newContext(),errors=[],p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:3200/#login');await p.locator('[data-ltab="researcher"]').click();await p.locator('#l-pw').fill(process.env.RESEARCHER_PASSWORD);await p.locator('#lf button[type=submit]').click();await p.locator('#cl-code').waitFor();
 const local=await p.evaluate(()=>JSON.stringify(localStorage));assert.ok(local.includes('pq4r:remember:researcher'));assert.ok(!local.includes(process.env.RESEARCHER_PASSWORD));
 // 새로운 탭은 브라우저에 남은 연구자 인증을 사용한다.
 const q=await ctx.newPage();q.on('pageerror',e=>errors.push(e.message));await q.goto('http://127.0.0.1:3200/');await q.locator('#cl-code').waitFor();assert.equal(await q.evaluate(()=>window.PQ_APP.role),'researcher');
 // 교사를 한 번 인증한 뒤 두 역할이 독립적으로 기억된다.
 await q.goto('http://127.0.0.1:3200/#login-student');await q.locator('[data-ltab="teacher"]').click();await q.locator('#l-tid').fill('T1');await q.locator('#l-pw').fill(process.env.TEACHER_PASSWORD);await q.locator('#lf button[type=submit]').click();await q.locator('#pick-out').waitFor();
 assert.ok(await q.evaluate(()=>!!localStorage.getItem('pq4r:remember:researcher')&&!!localStorage.getItem('pq4r:remember:teacher')));
 await q.goto('http://127.0.0.1:3200/#login-student');await q.locator('[data-ltab="researcher"]').click();await q.locator('#cl-code').waitFor();assert.equal(await q.locator('#l-pw').count(),0,'역할 전환 재인증 불필요');
 // 학생 시연이 공통 마지막 로그인 값을 바꿔도 새 탭 교직원 자동로그인은 유지한다.
 const student={role:'student',token:A.sign({role:'student',ses:'unused',sub:'unused'},3600)};
 await q.evaluate(a=>localStorage.setItem('pq4r:auth',JSON.stringify(a)),student);
 const r=await ctx.newPage();r.on('pageerror',e=>errors.push(e.message));await r.goto('http://127.0.0.1:3200/');await r.locator('#cl-code').waitFor();assert.equal(await r.evaluate(()=>window.PQ_APP.role),'researcher');
 // 브라우저를 다시 연 상황: sessionStorage 없이 저장된 localStorage만으로 복원.
 const state=await ctx.storageState(),next=await browser.newContext({storageState:state}),s=await next.newPage();await s.goto('http://127.0.0.1:3200/');await s.locator('#cl-code').waitFor();
 await s.locator('#btn-exit').click();await s.locator('#lf').waitFor();await s.reload();await s.locator('#lf').waitFor();assert.equal(await s.evaluate(()=>window.PQ_APP.role),null,'직접 로그아웃 뒤 자동 복원하지 않음');
 assert.deepEqual(errors,[]);console.log('PASS Chromium: 새 탭/브라우저 재실행 자동로그인, 교사/연구자 별도 저장과 원클릭 전환, 학생 로그인 이후 교직원 유지, 직접 로그아웃');
};
