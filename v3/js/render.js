import { $, state, STATUS, PRIORITY, OVERTIME_STATUS, isAdmin, today, esc, profileName, priorityScore, formatDate, initials, monthStart } from './core.js';

export function visibleTasks(){
  return state.tasks.filter(task=>isAdmin() || task.assignee_id===state.profile.id);
}
export function visibleOvertime(){
  return state.overtime.filter(item=>isAdmin() || item.employee_id===state.profile.id);
}
export function filteredTasks(){
  let list = visibleTasks();
  if(state.person!=='all') list = list.filter(task=>task.assignee_id===state.person);
  if(state.filter==='active') list = list.filter(task=>task.status!=='done');
  if(state.filter==='today') list = list.filter(task=>task.due_date===today() && task.status!=='done');
  if(state.filter==='late') list = list.filter(task=>task.due_date && task.due_date<today() && task.status!=='done');
  if(state.filter==='critical') list = list.filter(task=>task.priority==='critical' && task.status!=='done');
  if(state.filter==='done') list = list.filter(task=>task.status==='done');
  if(state.search){
    const query = state.search.toLowerCase();
    list = list.filter(task=>[task.title,task.area,profileName(task.assignee_id)].some(value=>String(value||'').toLowerCase().includes(query)));
  }
  return list.sort((a,b)=>priorityScore(b.priority)-priorityScore(a.priority)||(a.due_date||'9999').localeCompare(b.due_date||'9999'));
}

export function taskCard(task,compact=false){
  const overdue = task.due_date && task.due_date<today() && task.status!=='done';
  return `<article class="task-card ${overdue?'overdue':''} ${compact?'compact':''}" data-task-id="${task.id}">
    <div class="priority-rail ${task.priority}"></div>
    <div class="task-copy">
      <div class="task-topline"><span class="priority-text ${task.priority}">${PRIORITY[task.priority]}</span>${task.task_scope==='global'?'<span class="global-mark">GLOBAL</span>':''}</div>
      <h3>${esc(task.title)}</h3>
      <div class="task-meta"><span>${esc(profileName(task.assignee_id))}</span><span>${esc(task.area||'Sem departamento')}</span><span>${overdue?'Em atraso · ':''}${formatDate(task.due_date)}</span></div>
    </div>
    <span class="status-chip ${task.status}">${STATUS[task.status]}</span>
  </article>`;
}

export function overtimeCard(item){
  return `<article class="overtime-card" data-overtime-id="${item.id}">
    <div><span class="status-chip ${item.status}">${OVERTIME_STATUS[item.status]||item.status}</span><h3>${esc(profileName(item.employee_id))}</h3><p>${esc(item.work_done)}</p></div>
    <div class="overtime-value"><b>${Number(item.hours).toFixed(2).replace('.00','')}h</b><span>${formatDate(item.work_date)}</span></div>
  </article>`;
}

function assistantText(active,late,critical,review,pendingOvertime,people){
  if(!active.length && !review.length && !pendingOvertime.length) return 'A operação está limpa: não existem tarefas pendentes, validações ou horas extra por aprovar.';
  const loads = people.map(person=>({name:person.full_name||person.email,count:active.filter(task=>task.assignee_id===person.id).length})).sort((a,b)=>b.count-a.count);
  const highest = loads[0];
  const lowest = loads[loads.length-1];
  const parts = [`Tens ${active.length} tarefa${active.length===1?'':'s'} ativa${active.length===1?'':'s'}`];
  if(critical.length) parts.push(`${critical.length} crítica${critical.length===1?'':'s'}`);
  if(late.length) parts.push(`${late.length} em atraso`);
  if(review.length) parts.push(`${review.length} por validar`);
  if(pendingOvertime.length) parts.push(`${pendingOvertime.length} registo${pendingOvertime.length===1?'':'s'} de horas extra pendente${pendingOvertime.length===1?'':'s'}`);
  let text = `${parts.join(', ')}.`;
  if(highest && lowest && highest.count-lowest.count>=3) text += ` ${highest.name} tem uma carga superior a ${lowest.name}; vale a pena rever a distribuição.`;
  const first = [...active].sort((a,b)=>priorityScore(b.priority)-priorityScore(a.priority)||(a.due_date||'9999').localeCompare(b.due_date||'9999'))[0];
  if(first) text += ` A prioridade imediata deve ser “${first.title}”.`;
  return text;
}

export function renderDashboard(){
  const tasks = visibleTasks();
  const active = tasks.filter(task=>task.status!=='done');
  const late = active.filter(task=>task.due_date && task.due_date<today());
  const critical = active.filter(task=>task.priority==='critical');
  const review = tasks.filter(task=>task.status==='review');
  const overtime = visibleOvertime();
  const pendingOvertime = overtime.filter(item=>item.status==='pending');
  const collaborators = state.profiles.filter(profile=>profile.active && profile.role==='collaborator');
  $('assistantText').textContent = assistantText(active,late,critical,review,pendingOvertime,collaborators);
  $('metricActive').textContent = active.length;
  $('metricCritical').textContent = critical.length;
  $('metricReview').textContent = review.length;
  $('metricOvertime').textContent = pendingOvertime.length;
  const focus = [...active].sort((a,b)=>priorityScore(b.priority)-priorityScore(a.priority)||(a.due_date||'9999').localeCompare(b.due_date||'9999')).slice(0,5);
  $('nowList').innerHTML = focus.map(task=>taskCard(task,true)).join('') || '<div class="empty">Sem ações prioritárias.</div>';
  $('dashboardValidationList').innerHTML = review.slice(0,3).map(task=>taskCard(task,true)).join('') || '<div class="empty compact-empty">Nada por validar.</div>';
  const maxLoad = Math.max(1,...collaborators.map(person=>active.filter(task=>task.assignee_id===person.id).length));
  $('workloadList').innerHTML = collaborators.map(person=>{
    const count = active.filter(task=>task.assignee_id===person.id).length;
    const lateCount = late.filter(task=>task.assignee_id===person.id).length;
    const width = Math.round(count/maxLoad*100);
    return `<article class="load-row"><div class="avatar">${initials(person.full_name||person.email)}</div><div><div class="load-head"><strong>${esc(person.full_name||person.email)}</strong><span>${count} tarefas</span></div><div class="load-track"><i style="width:${width}%"></i></div><small>${lateCount?`${lateCount} em atraso`:'Carga controlada'}</small></div></article>`;
  }).join('') || '<div class="empty compact-empty">Sem colaboradores ativos.</div>';
}

export function renderTasks(){
  const labels={active:'Tarefas ativas',today:'Tarefas de hoje',late:'Tarefas em atraso',critical:'Tarefas críticas',done:'Tarefas validadas'};
  $('taskListTitle').textContent = labels[state.filter]||'Tarefas';
  $('taskList').innerHTML = filteredTasks().map(task=>taskCard(task)).join('') || '<div class="empty">Sem tarefas neste filtro.</div>';
  if(isAdmin()){
    const people = state.profiles.filter(profile=>profile.active&&profile.role==='collaborator');
    $('peopleTabs').innerHTML = [{id:'all',name:'Todos'},...people.map(person=>({id:person.id,name:person.full_name||person.email}))].map(person=>`<button class="${state.person===person.id?'active':''}" data-person="${person.id}">${esc(person.name)}</button>`).join('');
  }
}

export function renderValidations(){
  const review = visibleTasks().filter(task=>task.status==='review');
  $('validationList').innerHTML = review.map(task=>taskCard(task)).join('') || '<div class="empty">Não existem tarefas concluídas por validar.</div>';
}

export function renderCalendar(){
  const start = new Date(`${today()}T12:00:00`);
  const days=[];
  for(let index=0;index<14;index++){
    const date=new Date(start); date.setDate(start.getDate()+index);
    const key=new Intl.DateTimeFormat('sv-SE').format(date);
    const tasks=visibleTasks().filter(task=>task.due_date===key&&task.status!=='done');
    days.push(`<section class="calendar-day"><header><span>${index===0?'Hoje':new Intl.DateTimeFormat('pt-PT',{weekday:'short'}).format(date)}</span><b>${date.getDate()}</b></header><div>${tasks.map(task=>`<button data-task-id="${task.id}"><i class="dot ${task.priority}"></i><span>${esc(task.title)}</span><small>${esc(profileName(task.assignee_id))}</small></button>`).join('')||'<p>Sem tarefas</p>'}</div></section>`);
  }
  $('calendarGrid').innerHTML=days.join('');
}

export function renderOvertime(){
  const list=visibleOvertime();
  const month=list.filter(item=>item.work_date>=monthStart());
  const pending=month.filter(item=>item.status==='pending');
  const approved=month.filter(item=>item.status==='approved');
  $('overtimeMonth').textContent=`${month.reduce((sum,item)=>sum+Number(item.hours),0).toFixed(2).replace('.00','')}h`;
  $('overtimePending').textContent=pending.length;
  $('overtimeApproved').textContent=`${approved.reduce((sum,item)=>sum+Number(item.hours),0).toFixed(2).replace('.00','')}h`;
  $('overtimeList').innerHTML=list.map(overtimeCard).join('')||'<div class="empty">Sem registos de horas extra.</div>';
}

export function renderTeam(){
  if(!isAdmin()) return;
  const people=state.profiles.filter(profile=>profile.role==='collaborator');
  $('teamList').innerHTML=people.map(person=>{
    const tasks=state.tasks.filter(task=>task.assignee_id===person.id);
    const active=tasks.filter(task=>task.status!=='done').length;
    const done=tasks.filter(task=>task.status==='done').length;
    const overtime=state.overtime.filter(item=>item.employee_id===person.id&&item.work_date>=monthStart()&&item.status==='approved').reduce((sum,item)=>sum+Number(item.hours),0);
    return `<article class="team-card ${person.active?'':'inactive'}"><div class="avatar large">${initials(person.full_name||person.email)}</div><div class="team-copy"><h3>${esc(person.full_name||person.email)}</h3><p>${esc(person.department||'Sem departamento')}</p><div class="team-stats"><span><b>${active}</b> ativas</span><span><b>${done}</b> validadas</span><span><b>${overtime.toFixed(2).replace('.00','')}h</b> extra</span></div></div><button data-toggle-user="${person.id}" data-active="${person.active}">${person.active?'Desativar':'Ativar'}</button></article>`;
  }).join('')||'<div class="empty">Sem colaboradores.</div>';
}

export function renderAll(){
  renderDashboard();
  renderTasks();
  renderValidations();
  renderCalendar();
  renderOvertime();
  renderTeam();
  const active=visibleTasks().filter(task=>task.status!=='done').length;
  const review=visibleTasks().filter(task=>task.status==='review').length;
  const pending=visibleOvertime().filter(item=>item.status==='pending').length;
  $('navTasks').textContent=active;
  $('navReview').textContent=review;
  $('navOvertime').textContent=pending;
}
