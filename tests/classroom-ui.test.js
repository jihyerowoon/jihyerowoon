/* 실제 Chromium으로 한 화면 등록과 교사/학생 흐름을 확인한다. 로컬 격리 DB 전용. */
'use strict';
const assert=require('node:assert/strict');
const {call}=require('./classroom.test');
const {db}=require('../lib/db');
const A=require('../lib/auth');
const BASE=process.env.TEST_BASE||'http://127.0.0.1:3200';
module.exports=async function run(browser){
 const sql=db(),errors=[];
 const context=await browser.newContext({viewport:{width:1600,height:1050}}),page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(BASE+'/#login');await page.locator('[data-ltab="researcher"]').click();await page.locator('#l-pw').fill(process.env.RESEARCHER_PASSWORD);await page.locator('#lf button[type=submit]').click();
 await page.locator('#cl-code').waitFor();await page.locator('#cl-code').fill('TESTUI');await page.locator('#cl-group').selectOption('CONTROL');assert.equal(await page.locator('#cl-teacher').inputValue(),'T1');await page.locator('#cl-form button').click();
 await page.locator('#cl-student').waitFor();await page.locator('#cl-student').fill('UIS001');await page.locator('#cl-pin').fill('1111');await page.locator('#cl-add button').click();await page.getByRole('cell',{name:'UIS001',exact:true}).waitFor();
 await page.locator('#cl-file').setInputFiles({name:'students.csv',mimeType:'text/csv',buffer:Buffer.from('code,pin\nUIS002,1111\nUIS003,1111')});await page.locator('#cl-upload').click();await page.getByRole('cell',{name:'UIS003',exact:true}).waitFor();
 await page.screenshot({path:'tests/shots/classes-desktop.png',fullPage:true});
 const rt=await page.evaluate(()=>window.PQ_APP.tok);
 // 나머지 학생은 시험 DB에만 직접 시드. 실제 등록 경로는 위에서 개별/CSV 모두 검증.
 const hash=A.hashPin('1111'),enc=A.sealPin('1111');
 const more=Array.from({length:27},(_,i)=>({code:'UIS'+String(i+4).padStart(3,'0'),grp:'CONTROL',class_name:'TESTUI',pin_hash:hash,pin_enc:enc}));
 await sql`insert into students ${sql(more,'code','grp','class_name','pin_hash','pin_enc')}`;
 await page.locator('#cl-video').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');await page.locator('#cl-prepare').click();await page.locator('.student-tile').nth(29).waitFor();
 await page.getByRole('button',{name:'수업 시작',exact:true}).click();await page.getByRole('button',{name:'긴급 일시정지'}).waitFor();
 const [se]=await sql`select * from sessions where class_name='TESTUI' and status='open' and settings->>'autoTimer'='true'`;
 const students=await sql`select id,code,grp from students where class_name='TESTUI' order by code`;
 const toks=students.slice(0,2).map(st=>A.sign({role:'student',sub:st.id,ses:se.id,code:st.code,grp:st.grp},3600));
 for(let i=0;i<2;i++){const st=students[i];await sql`insert into participants(session_id,student_id)values(${se.id},${st.id})`;await call('POST','me/submit',{item_id:'L1PV01',fields:{text:'어떤 조건인지 잘 모르겠어요'}},toks[i]);await call('POST','me/help',{item_id:'L1PV01'},toks[i]);}
 await page.locator('[data-request-pick]').nth(1).waitFor();await page.locator('[data-request-pick]').nth(0).check();await page.locator('[data-request-pick]').nth(1).check();await page.locator('input[name="batch-bank"]').first().check();await page.screenshot({path:'tests/shots/teacher-desktop.png',fullPage:true});
 await page.locator('#batch-send').click();await page.getByText('UIS001: 전송 완료',{exact:true}).waitFor();await page.getByText('UIS002: 전송 완료',{exact:true}).waitFor();
 await page.getByRole('button',{name:'긴급 일시정지'}).click();await page.getByRole('button',{name:'이어서 진행'}).waitFor();await page.reload();await page.getByRole('button',{name:'이어서 진행'}).waitFor();await page.getByRole('button',{name:'이어서 진행'}).click();
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'tests/shots/teacher-mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'모바일 가로 넘침 없음');
 // 별도 학생 창에서 실제 PIN 1111 로그인
 const sc=await browser.newContext({viewport:{width:1280,height:900}}),sp=await sc.newPage();sp.on('pageerror',e=>errors.push(e.message));
 await sp.goto(BASE+'/?class=TESTUI#login-student');await sp.locator('#l-code').fill('UIS003');await sp.locator('#l-pin').fill('1111');await sp.locator('#lf button').click();await sp.locator('#right textarea').first().waitFor();await sp.locator('#right textarea').first().fill('자동저장 검증 원문');
 await sp.waitForFunction(()=>document.querySelector('#savestate').textContent.includes('임시저장'));
 await sql`update sessions set clock=jsonb_build_object('mode','running','deadline',${new Date(Date.now()-121000).toISOString()}::text) where id=${se.id}`;
 await sp.locator('#video-dialog').waitFor({timeout:30000});assert.ok(await sp.locator('#video-play').isVisible(),'Read 자동 팝업');
 await sp.locator('#video-play').click();assert.equal(await sp.locator('#video-player iframe').getAttribute('src'),'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1');await sp.locator('#video-close').click();await sp.locator('#read-video').click();await sp.locator('#video-close').click();
 await sp.reload();await sp.locator('#read-video').waitFor();assert.equal(await sp.locator('#video-dialog').count(),0,'재접속시 불필요한 영상 팝업 중복 없음');
 // 마지막 성찰 레이아웃 및 자동 저장
 await sql`update sessions set stage=5,stage_opened=jsonb_build_object('5',${new Date(Date.now()-601000).toISOString()}::text),clock=jsonb_build_object('mode','running','deadline',${new Date(Date.now()+119000).toISOString()}::text),stage_rev=stage_rev+1 where id=${se.id}`;
 await sp.locator('#post-comparison').waitFor({timeout:30000});assert.equal(await sp.locator('#post-focus-item').count(),0);await sp.locator('input[name="post-understanding"][value="partial"]').check();await sp.locator('#post-comparison').fill('대응하는 부분을 확인해야 한다.');
 await sp.waitForResponse(r=>r.url().endsWith('/me/reflection-draft')&&r.status()===200);
 const box=await sp.locator('input[name="post-understanding"]').first().boundingBox();assert.ok(box.width<=22&&box.height<=22,'선택 동그라미 크기 정렬');
 await sp.screenshot({path:'tests/shots/reflection-desktop.png',fullPage:true});await sp.locator('[data-act="review-reflect"]').click();await sp.getByRole('heading',{name:'해설 후 성찰 저장 완료'}).waitFor();
 await sql`update sessions set clock=jsonb_build_object('mode','running','deadline',${new Date(Date.now()-1000).toISOString()}::text) where id=${se.id}`;
 await sp.getByRole('heading',{name:'미완료 문항 보완',exact:true}).waitFor({timeout:30000});await sp.locator('.supplement-item textarea').first().fill('보완시간에 작성한 답');await sp.waitForResponse(r=>r.url().endsWith('/me/supplement')&&r.status()===200);
 await sp.screenshot({path:'tests/shots/catchup-desktop.png',fullPage:true});
 await sql`update sessions set clock=jsonb_build_object('mode','catchup','deadline',${new Date(Date.now()-1000).toISOString()}::text) where id=${se.id}`;
 await sp.getByRole('heading',{name:'수업 완료',exact:true}).waitFor({timeout:30000});assert.ok(await sp.locator('.supplement-item textarea').first().isDisabled(),'보완 종료 잠금');
 assert.deepEqual(errors,[],'브라우저 런타임 오류 없음');
 console.log('PASS Chromium: 개별/CSV 등록, 30명 대시보드, 일괄 전송, 정지 재접속, 모바일, PIN1111, 영상 팝업, 성찰, 보완 저장과 종료');
};
