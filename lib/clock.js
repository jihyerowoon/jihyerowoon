/* 서버 절대시각 자동 진행. Review 12분 후 성찰 대기를 유지하고 교사가 명시적으로 종료한다. */
'use strict';
const C = require('./content');
const K = require('./core');
const EV = require('./events');
const { httpError } = require('./util');
const iso = n => new Date(n).toISOString();
const mins = s => C.LESSONS[s.lesson || 1].min;
function active(s) { return !!(s.settings && s.settings.autoTimer); }
function assertWriting(s) {
  if (active(s) && (s.clock || {}).mode !== 'running') throw httpError(409, '지금은 답안 작성 시간이 아닙니다. 수업 상태를 확인해 주세요.', 'clock_not_running');
}
async function sync(sql, id) {
  let [s] = await sql`select * from sessions where id = ${id}`;
  if (!s || !active(s) || s.status !== 'open' || !['running','catchup'].includes((s.clock || {}).mode) || Date.parse(s.clock.deadline) > Date.now()) return s;
  return sql.begin(async tx => {
    [s] = await tx`select * from sessions where id = ${id} for update`;
    const now = Date.now();
    while (s.status === 'open' && ['running','catchup'].includes((s.clock || {}).mode) && Date.parse(s.clock.deadline) <= now) {
      const end = Date.parse(s.clock.deadline), clock = { ...s.clock };
      const ps = await tx`select p.student_id, p.closed_stages, st.code, st.grp from participants p join students st on st.id=p.student_id where p.session_id=${id}`;
      if (clock.mode === 'catchup') {
        // 예전 수업과의 호환: 기존 5분 보완 타이머가 끝나도 자동 종료하지 않는다.
        clock.mode = 'reflection'; clock.review_allotted_ended_at=iso(end); delete clock.deadline;
      } else if (s.stage < 5) {
        const next = s.stage + 1, opened = { ...s.stage_opened, [next]: iso(end) };
        await K.closeStagesFor(tx, s, ps, s.stage, next, 'AUTO_TIMER');
        clock.deadline = iso(end + mins(s)[next] * 60000);
        await EV.insert(tx,id,[EV.make('STAGE_OPEN',{session:s,writer:'SYSTEM'},{stage:C.STAGES[next].id,transition_reason:'AUTO_TIMER',extra:{from_index:s.stage,stage_index:next,scheduled_at:iso(end)}})]);
        s = { ...s, stage: next, stage_opened: opened };
      } else {
        await K.closeStagesFor(tx,s,ps,5,6,'MAIN_TIME_ENDED');
        // Review 12분이 끝나더라도 학생 성찰 입력을 잠그거나 수업을 자동 종료하지 않는다.
        clock.mode = 'reflection'; clock.main_ended_at = iso(end); clock.review_allotted_ended_at=iso(end); delete clock.deadline;
        // 원본 활동 답안과 입력 시점은 이벤트에 보존하며, 이후 성찰은 별도의 로그로 기록한다.
        const answers = await tx`select st.code, i.item_id, i.draft, i.draft_sel, i.versions, i.rec from item_states i join students st on st.id=i.student_id where i.session_id=${id}`;
        await EV.insert(tx,id,ps.map(p=>EV.make('MAIN_TIME_SNAPSHOT',{session:s,student:{code:p.code,grp:p.grp},writer:'SYSTEM'},{transition_reason:'BEFORE_CATCHUP',extra:{scheduled_at:iso(end),answers:answers.filter(a=>a.code===p.code)}})));
      }
      [s] = await tx`update sessions set stage=${s.stage}, stage_opened=${tx.json(s.stage_opened)}, clock=${tx.json(clock)}, stage_rev=stage_rev+1, rev=rev+1 where id=${id} returning *`;
      await EV.insert(tx,id,[EV.make('CLOCK_CHANGE',{session:s,writer:'SYSTEM'},{transition_reason:clock.mode==='running'?'STAGE_TIMER':'AUTO_'+clock.mode.toUpperCase(),extra:clock})]);
    }
    return s;
  });
}
async function control(sql, s, action, tok) {
  if (!active(s) || s.status !== 'open') throw httpError(409,'자동 수업이 아니거나 종료된 수업입니다.','not_auto_session');
  return sql.begin(async tx=>{
    if(s.class_name)await tx`select pg_advisory_xact_lock(hashtext(${'class-clock:'+s.class_name}))`;
    [s]=await tx`select * from sessions where id=${s.id} for update`;
    const now=Date.now(), c={mode:'waiting',...(s.clock||{})}, opened={...s.stage_opened};
    if(action==='start' && s.class_name){
      const [other]=await tx`select code from sessions where class_name=${s.class_name} and id<>${s.id} and status='open' and clock->>'mode' in ('running','paused','catchup') limit 1`;
      if(other)throw httpError(409,'이 반에는 이미 진행 중인 수업이 있습니다. 기존 수업을 마친 뒤 시작해 주세요.','class_already_running');
      const [waiting]=await tx`select se.code from sessions se where se.class_name=${s.class_name} and se.id<>${s.id} and se.status='open' and se.settings->>'autoTimer'='true' and coalesce(se.clock->>'mode','waiting')='waiting' and exists(select 1 from participants p where p.session_id=se.id) limit 1`;
      if(waiting)throw httpError(409,'이미 학생이 입장한 대기 수업이 있습니다. 그 수업을 열어 시작해 주세요.','students_already_waiting');
    }
    if(action==='start' && c.mode==='waiting') {c.mode='running';c.started_at=iso(now);c.paused_total_ms=0;c.deadline=iso(now+mins(s)[0]*60000);opened[0]=iso(now);}
    else if(action==='demo-next' && s.settings&&s.settings.demoSession===true && c.mode==='running' && s.stage<5){
      const next=s.stage+1;
      const ps=await tx`select p.student_id,p.closed_stages,st.code,st.grp from participants p join students st on st.id=p.student_id where p.session_id=${s.id}`;
      await K.closeStagesFor(tx,s,ps,s.stage,next,'DEMO_MANUAL_NEXT');
      opened[next]=iso(now);
      c.deadline=iso(now+mins(s)[next]*60000);
      const previous=s.stage;
      s={...s,stage:next};
      await EV.insert(tx,s.id,[EV.make('STAGE_OPEN',{session:s,writer:'TEACHER',teacherId:tok.tid},{stage:C.STAGES[next].id,transition_reason:'DEMO_MANUAL_NEXT',extra:{from_index:previous,stage_index:next}})]);
    }
    else if(action==='finish' && c.mode==='reflection' && s.stage===5){c.mode='finished';c.finished_at=iso(now);delete c.deadline;}
    else if(action==='pause' && ['running','catchup'].includes(c.mode)) {c.prior_mode=c.mode;c.mode='paused';c.paused_at=iso(now);c.remaining_ms=Math.max(0,Date.parse(c.deadline)-now);}
    else if(action==='resume' && c.mode==='paused') {const delta=now-Date.parse(c.paused_at);c.paused_total_ms=(c.paused_total_ms||0)+delta;if(opened[s.stage])opened[s.stage]=iso(Date.parse(opened[s.stage])+delta);c.mode=c.prior_mode;c.deadline=iso(now+c.remaining_ms);delete c.paused_at;delete c.remaining_ms;delete c.prior_mode;}
    else throw httpError(409,'수업 상태가 바뀌었습니다. 화면을 확인해 주세요.','clock_conflict');
    const [ns]=await tx`update sessions set stage=${s.stage}, clock=${tx.json(c)}, stage_opened=${tx.json(opened)}, rev=rev+1, stage_rev=stage_rev+1 where id=${s.id} returning *`;
    await EV.insert(tx,s.id,[EV.make('CLOCK_CHANGE',{session:ns,writer:tok.role==='teacher'?'TEACHER':'RESEARCHER',teacherId:tok.tid},{transition_reason:action.toUpperCase(),extra:c})]);
    return ns;
  });
}
module.exports={sync,control,active,assertWriting};
