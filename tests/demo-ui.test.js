'use strict';
const assert=require('node:assert/strict');const {db}=require('../lib/db');
module.exports=async function(browser){
 const errors=[],ctx=await browser.newContext(),p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 await p.goto('http://127.0.0.1:3200/#login');await p.locator('[data-ltab="researcher"]').click();await p.locator('#l-pw').fill(process.env.RESEARCHER_PASSWORD);await p.locator('#lf button[type=submit]').click();
 await p.locator('#cl-code').fill('TESTDEMOUI');await p.locator('#cl-form button').click();await p.locator('#cl-student').fill('DUI01');await p.locator('#cl-pin').fill('1111');await p.locator('#cl-add button').click();await p.getByRole('cell',{name:'DUI01',exact:true}).waitFor();
 assert.equal(await p.getByRole('heading',{name:'TESTDEMOUI에 등록된 학생 1명'}).count(),1);
 await p.locator('#cl-newdemo').click();await p.getByRole('button',{name:'수업 시작',exact:true}).waitFor();assert.ok((await p.locator('#timer').innerText()).includes('0:00'));
 const sc=await browser.newContext(),s=await sc.newPage();s.on('pageerror',e=>errors.push(e.message));await s.goto('http://127.0.0.1:3200/?class=TESTDEMOUI#login-student');await s.locator('#l-code').fill('DUI01');await s.locator('#l-pin').fill('1111');await s.locator('#lf button').click();await s.locator('#student-waiting').waitFor();assert.equal(await s.locator('#right textarea').count(),0);assert.ok((await s.locator('#timer').innerText()).includes('0:00'));
 await p.getByRole('button',{name:'수업 시작',exact:true}).click();await s.waitForFunction(()=>document.querySelector('#right textarea')&&!document.querySelector('#right textarea').disabled);await s.locator('#right textarea').first().fill('시연의 원본');await s.waitForFunction(()=>document.querySelector('#savestate').textContent.includes('임시저장'));
 const sql=db(),[old]=await sql`select * from sessions where class_name='TESTDEMOUI' and status='open'`;
 await sql`update sessions set clock=jsonb_build_object('mode','running','deadline',${new Date(Date.now()-121000).toISOString()}::text) where id=${old.id}`;
 await s.waitForFunction(()=>(document.querySelector('#timer')?.textContent||'').includes('Read'));
 await p.locator('#t-demo-restart').click();await p.getByRole('button',{name:'수업 시작',exact:true}).waitFor();await s.locator('#l-pin').waitFor({timeout:30000});await s.locator('#l-pin').fill('1111');await s.locator('#lf button').click();await s.waitForFunction(()=>(document.querySelector('#timer')?.textContent||'').includes('시연 Preview'));
 assert.ok((await s.locator('#timer').innerText()).includes('0:00'));assert.equal(await s.locator('#right textarea').count(),0);assert.ok(await s.locator('#student-waiting').isVisible());
 const [live]=await sql`select * from sessions where class_name='TESTDEMOUI' and status='open'`;assert.notEqual(live.id,old.id);assert.equal(live.stage,0);assert.deepEqual(errors,[]);
 console.log('PASS Chromium: 반 학생 명단, 새 시연 준비, Preview 2분 대기 입장, 교사 시작, Read 진행, 재시작 후 재입장과 초기 답안');
};
