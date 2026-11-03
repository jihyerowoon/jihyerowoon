'use strict';
const assert=require('node:assert/strict'),A=require('../lib/auth');const {call}=require('./classroom.test');
module.exports=async function(){let n=0;const ok=(x,m)=>{assert.ok(x,m);n++;};
 for(const role of ['teacher','researcher']){
  const password=role==='teacher'?process.env.TEACHER_PASSWORD:process.env.RESEARCHER_PASSWORD;
  let r=await call('POST','login/staff',{role,teacher_id:role==='teacher'?'T1':'R01',password});ok(r.status===200,'정상 로그인 '+role);const original=A.verify(r.body.token);
  ok(original.exp-original.iat===180*86400,'180일 인증 '+role);ok(!!original.pwv&&!JSON.stringify(original).includes(password),'비밀번호 대신 서버 지문 '+role);
  r=await call('POST','login/staff/refresh',undefined,r.body.token);ok(r.status===200&&r.body.role===role,'비밀번호 없이 자동 갱신 '+role);ok(A.verify(r.body.token).tid===original.tid,'역할/코드 유지 '+role);
 }
 let r=await call('POST','login/staff/refresh',undefined,A.sign({role:'teacher',tid:'T1'},3600));ok(r.status===200&&A.verify(r.body.token).pwv,'기존 12시간 로그인 자동 이행');
 r=await call('POST','login/staff/refresh',undefined,A.sign({role:'student',sub:'x'},3600));ok(r.status===403,'학생은 교직원 갱신 불가');
 r=await call('POST','login/staff/refresh',undefined,A.sign({role:'researcher',tid:'R01',pwv:'old-password-stamp'},3600));ok(r.status===401,'비밀번호 변경 뒤 예전 인증 무효');
 r=await call('POST','login/staff/refresh',undefined,A.sign({role:'teacher',tid:'T1'},-10));ok(r.status===401,'만료 인증 갱신 불가');
 r=await call('POST','login/staff/refresh',undefined,'bad.token');ok(r.status===401,'위조 인증 불가');
 console.log('PASS '+n+': 교사/연구자 180일 자동로그인과 갱신, 구형 이행, 역할 분리, 만료/비밀번호 변경/위조 검사');
};
