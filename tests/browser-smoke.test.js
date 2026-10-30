/* Actual headless Chromium click flow with mocked server. No production DB or personal data. */
'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const C=require('../lib/content');
const root=path.resolve(__dirname,'..');
const publicContent={
 versions:C.VERSIONS,stages:C.STAGES,lessons:C.LESSONS,problems:C.PROBLEMS,figs:C.FIGS,items:C.ITEMS,
 fixed_ai:Object.fromEntries(Object.entries(C.FIXED_AI).map(([key,val])=>[key,{text:val.text}])),
 verdict_choices:C.VERDICT_CHOICES,figure:C.FIGURE,materials:C.MATERIALS
};
const classCode='A01',students=Array.from({length:30},(_,i)=>'A'+String(i+1).padStart(2,'0'));
let session=null,clockStarts=0,logins=0;
const reply=(res,status,body,type='application/json')=>{
 res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});
 res.end(typeof body==='string'?body:JSON.stringify(body));
};
function teacherOverview(){
 return {session:{...session},fp:'ci',group:'EXPERIMENT',requests:[],students:students.map(code=>({
   code,group:'EXPERIMENT',items:{},last_seen:code==='A01'&&logins?new Date().toISOString():null,
   worksheet:null
 }))};
}
function studentMe(){
 return {student:{code:'A01',group:'EXPERIMENT'},
   session:{...session},
   messages:[],items:{},requests:[],msgSeq:0,notice:null,
   server_time:new Date().toISOString(),
   review:{unlocked:false,reflect_unlocked:false,reflection:null}
 };
}
const server=http.createServer(async(req,res)=>{
 const uri=new URL(req.url,'http://localhost');
 const p=uri.pathname;
 if(p==='/')return reply(res,200,fs.readFileSync(path.join(root,'public/index.html'),'utf8'),'text/html; charset=utf-8');
 if(p==='/app.js')return reply(res,200,fs.readFileSync(path.join(root,'public/app.js'),'utf8'),'application/javascript; charset=utf-8');
 if(p==='/api/v1/content')return reply(res,200,publicContent);
 if(p==='/api/v1/health')return reply(res,200,{ok:true,version:C.VERSIONS.app});
 if(p==='/worksheets/manifest.json')return reply(res,404,{});
 if(!p.startsWith('/api/v1/'))return reply(res,404,{error:'not found'});
 const route=p.slice('/api/v1/'.length);
 let body={};
 if(req.method==='POST'){const buf=[];for await(const chunk of req)buf.push(chunk);try{body=JSON.parse(Buffer.concat(buf).toString('utf8')||'{}');}catch(_){}}
 if(route==='login/staff')return reply(res,200,{token:'ci-staff',role:body.role,tid:body.teacher_id||'R1'});
 if(route==='login/staff/refresh')return reply(res,200,{token:'ci-staff',role:'researcher',tid:'R1'});
 if(route==='admin/classes')return reply(res,200,{classes:[{code:classCode,grp:'EXPERIMENT',teacher_code:'T01',count:30}]});
 if(route==='admin/students')return reply(res,200,{students:students.map(code=>({code,active:true,class_name:classCode,group:'EXPERIMENT'}))});
 if(route==='admin/lesson-assets')return reply(res,200,{files:[]});
 if(route==='staff/sessions')return reply(res,200,{sessions:session?[{...session,joined:logins}]:[]});
 if(route==='staff/content')return reply(res,200,{bank:C.BANK.map(x=>({id:x.id,item:x.item,level:1,state:x.state,variant:x.variant,text:x.text,type:x.type,mechanism:x.mechanism})),pre_submit:C.COMMON.PRE_SUBMIT});
 if(route==='staff/new-demo'||route==='staff/new-lesson'){
   session={code:'DEMO-CI-01',lesson:Number(body.lesson)||1,class_name:classCode,stage:0,stage_opened:{},stage_rev:0,
     status:'open',settings:{autoTimer:true,demoSession:route.endsWith('demo'),videoUrl:'',demoControls:false},clock:{mode:'waiting',ready:true}};
   logins=0;return reply(res,200,{session});
 }
 if(route==='staff/overview')return reply(res,200,teacherOverview());
 if(route==='staff/ready')return reply(res,200,{ok:true});
 if(route==='staff/clock'){
   if(body.action==='start'&&session.clock.mode==='waiting'){clockStarts++;session.clock={mode:'running',ready:true,started_at:new Date().toISOString(),deadline:new Date(Date.now()+120000).toISOString()};session.stage_opened={0:session.clock.started_at};session.stage_rev++;}
   return reply(res,200,{session});
 }
 if(route==='login/student'){
   if(!session||body.session_code!==session.code||body.class_code!==classCode||!students.includes(body.student_code)||body.pin!=='1111')
     return reply(res,401,{error:'Invalid session code/student PIN for smoke test'});
   logins++;
   return reply(res,200,{token:'ci-student',role:'student',me:studentMe()});
 }
 if(route==='me')return reply(res,200,studentMe());
 if(route==='me/sync')return reply(res,200,{clock:session.clock,stage:session.stage,stage_opened:session.stage_opened,
   stage_rev:session.stage_rev,status:session.status,settings:session.settings,notice:null,messages:[],requests:[],
   server_time:new Date().toISOString(),review:{unlocked:false,reflect_unlocked:false}});
 if(route==='staff/announce')return reply(res,200,{ok:true});
 return reply(res,404,{error:'unmocked '+route});
});
async function run(){
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const ctx=await browser.newContext(),research=await ctx.newPage(),errors=[];
 try{
  for(const page of [research])page.on('pageerror',e=>errors.push('research: '+e.message));
  await research.goto(base+'/#login-researcher');
  await research.getByRole('tab',{name:'연구자'}).click();
  await research.locator('#l-pw').fill('smoke-password');
  await research.locator('#lf button[type=submit]').click();
  await research.locator('[data-fixed-demo="A01"]').waitFor({timeout:12000});
  await research.locator('[data-fixed-demo="A01"]').click();
  await research.locator('#teacher-student-share').waitFor({timeout:12000});
  assert.equal(session.clock.mode,'waiting');
  assert.equal(clockStarts,0,'timer started without teacher click');
  // Student enters before the teacher has entered the shared link.
  const student=await ctx.newPage();
  student.on('pageerror',e=>errors.push('student: '+e.message));
  await student.goto(base+'/?class=A01&session='+encodeURIComponent(session.code)+'#login-student');
  await student.locator('#l-code').fill('A01');
  await student.locator('#l-pin').fill('1111');
  await student.locator('#lf button[type=submit]').click();
  await student.locator('#student-waiting').waitFor({timeout:12000});
  assert.equal(clockStarts,0,'Student arrival started timer');
  // Separately, teacher may join after student, and start once ready.
  const teacher=await browser.newPage();
  teacher.on('pageerror',e=>errors.push('teacher: '+e.message));
  await teacher.goto(base+'/?class=A01&session='+encodeURIComponent(session.code)+'#login-teacher');
  await teacher.locator('#l-tid').fill('T01');
  await teacher.locator('#l-pw').fill('smoke-password');
  await teacher.locator('#lf button[type=submit]').click();
  await teacher.locator('#teacher-student-share').waitFor({timeout:12000});
  await teacher.locator('[data-clock="start"]').click();
  await teacher.waitForTimeout(1500);
  assert.equal(clockStarts,1,'Teacher start click should start timer exactly once');
  assert.equal(session.clock.mode,'running');
  await student.waitForTimeout(1600);
  assert.equal(errors.length,0,'Browser errors: '+errors.join(' | '));
  console.log('PASS: researcher creates lesson, share links appear, student joins first, teacher joins second, teacher starts time, student sync, no pageerrors.');
  await teacher.close();await student.close();
 }finally{await ctx.close();await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
