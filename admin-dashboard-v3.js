import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const cfg = window.APP_CONFIG || {};
const supabase = createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, { auth: { persistSession: true, autoRefreshToken: true } });
const labels = { todo: 'Por iniciar', in_progress: 'Em curso', review: 'A validar', done: 'Validada' };
const priorities = { low: 'Baixa', medium: 'Média', high: 'Alta', critical: 'Crítica' };
const esc = (v='') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Lisbon'}).format(new Date());
const formatDate = (d,t) => d ? new Intl.DateTimeFormat('pt-PT',{day:'2-digit',month:'2-digit',year:'numeric',...(t?{hour:'2-digit',minute:'2-digit'}:{})}).format(new Date(`${d}T${t||'12:00'}`)) : 'Sem prazo';

let me=null, people=[], tasks=[], person='all', filter='active', section='tasks';

async function init(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) return;
  const {data:profile}=await supabase.from('profiles').select('*').eq('id',session.user.id).single();
  if(!profile?.active || profile.role!=='admin') return;
  me=profile;
  document.body.classList.remove('admin-dashboard-v2');
  document.querySelector('.admin-v2-dock')?.remove();
  document.getElementById('adminV2Shell')?.remove();
  document.body.classList.add('admin-v3');
  mount();
  await load();
  supabase.channel('admin-v3-live').on('postgres_changes',{event:'*',schema:'public',table:'tasks'},load).on('postgres_changes',{event:'*',schema:'public',table:'profiles'},load).subscribe();
}

function mount(){
  const main=document.querySelector('.main');
  if(!document.getElementById('adminV3Shell')) main.insertAdjacentHTML('afterbegin','<section id="adminV3Shell" class="v3-shell"></section>');
  document.querySelector('.v3-nav')?.remove();
  document.body.insertAdjacentHTML('beforeend',`<nav class="v3-nav">
    <button class="active" data-section="tasks">Tarefas</button>
    <button data-section="validations">Validações</button>
    <button data-action="people">Equipa</button>
    <button data-action="reports">Relatórios</button>
    <button data-action="settings">Tema</button>
    <button data-action="logout">Sair</button>
  </nav>`);
  document.querySelector('.v3-nav').onclick=(e)=>{
    const b=e.target.closest('button'); if(!b)return;
    if(b.dataset.section){ section=b.dataset.section; document.querySelectorAll('.v3-nav button').forEach(x=>x.classList.toggle('active',x===b)); render(); }
    if(b.dataset.action==='people') document.getElementById('peopleBtn')?.click();
    if(b.dataset.action==='reports') document.getElementById('teamDashboardBtn')?.click();
    if(b.dataset.action==='settings') document.getElementById('themeBtn')?.click();
    if(b.dataset.action==='logout') document.getElementById('logoutBtn')?.click();
  };
}

async function load(){
  const [p,t]=await Promise.all([
    supabase.from('profiles').select('*').eq('role','collaborator').order('full_name'),
    supabase.from('tasks').select('*').order('due_date',{ascending:true,nullsFirst:false}).order('created_at',{ascending:false})
  ]);
  if(p.error||t.error) return toast((p.error||t.error).message,true);
  people=p.data||[]; tasks=t.data||[]; render();
}

function taskList(){
  let list=person==='all'?tasks:tasks.filter(t=>t.assignee_id===person);
  if(filter==='active') list=list.filter(t=>t.status!=='done');
  if(filter==='today') list=list.filter(t=>t.due_date===today()&&t.status!=='done');
  if(filter==='late') list=list.filter(t=>t.due_date&&t.due_date<today()&&t.status!=='done');
  if(filter==='critical') list=list.filter(t=>t.priority==='critical'&&t.status!=='done');
  return list;
}

function nameFor(id){const p=people.find(x=>x.id===id);return p?.full_name||p?.email||'Sem responsável'}
function priorityScore(t){return (t.due_date&&t.due_date<today()?100:0)+({critical:40,high:30,medium:20,low:10}[t.priority]||0)+(t.status==='in_progress'?5:0)}

function render(){
  const shell=document.getElementById('adminV3Shell'); if(!shell)return;
  const active=tasks.filter(t=>t.status!=='done').length;
  const late=tasks.filter(t=>t.due_date&&t.due_date<today()&&t.status!=='done').length;
  const review=tasks.filter(t=>t.status==='review').length;
  const first=(me.full_name||me.email||'João').split(' ')[0];
  const tabs=[{id:'all',name:'Todos',count:active},...people.map(p=>({id:p.id,name:p.full_name||p.email,count:tasks.filter(t=>t.assignee_id===p.id&&t.status!=='done').length}))];
  const priorityQueue=tasks.filter(t=>t.status!=='done').sort((a,b)=>priorityScore(b)-priorityScore(a)).slice(0,3);
  const validations=tasks.filter(t=>t.status==='review');

  shell.innerHTML=`<header class="v3-header"><div class="v3-brand"><small>Operação logística</small><h1>Polo Logístico</h1></div><div class="v3-top-actions"><button class="v3-btn primary" id="v3New">+ Nova tarefa</button><div class="v3-user"><strong>Olá, ${esc(first)}</strong><span>Administrador</span></div></div></header>
  <section class="v3-kpis"><div class="v3-kpi"><span>Tarefas ativas</span><b>${active}</b></div><div class="v3-kpi"><span>Em atraso</span><b>${late}</b></div><div class="v3-kpi"><span>A validar</span><b>${review}</b></div></section>
  <section class="v3-panel ${section==='tasks'?'':'v3-section-hidden'}"><div class="v3-panel-head"><h2>Prioridade máxima</h2><span>${priorityQueue.length}</span></div><div class="v3-priority-list">${priorityQueue.map((t,i)=>priorityCard(t,i+1)).join('')||'<div class="v3-empty">Sem tarefas prioritárias.</div>'}</div></section>
  <section class="v3-panel ${section==='tasks'?'':'v3-section-hidden'}"><div class="v3-panel-head"><h2>Tarefas</h2><div class="v3-filter-row">${['active','today','late','critical'].map(f=>`<button class="v3-filter ${filter===f?'active':''}" data-filter="${f}">${{active:'Ativas',today:'Hoje',late:'Em atraso',critical:'Críticas'}[f]}</button>`).join('')}</div></div><div class="v3-tabs">${tabs.map(t=>`<button class="v3-tab ${person===t.id?'active':''}" data-person="${t.id}">${esc(t.name)} (${t.count})</button>`).join('')}</div><div class="v3-task-list">${taskList().map(taskCard).join('')||'<div class="v3-empty">Sem tarefas neste filtro.</div>'}</div></section>
  <section class="v3-panel ${section==='validations'?'':'v3-section-hidden'}"><div class="v3-panel-head"><h2>Pendentes de validação</h2><span>${validations.length}</span></div><div class="v3-validation-list">${validations.map(validationCard).join('')||'<div class="v3-empty">Sem tarefas para validar.</div>'}</div></section>`;

  document.getElementById('v3New').onclick=()=>document.getElementById('addTaskBtn')?.click();
  shell.querySelectorAll('[data-person]').forEach(b=>b.onclick=()=>{person=b.dataset.person;render()});
  shell.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;render()});
  shell.querySelectorAll('[data-task]').forEach(el=>el.onclick=(e)=>{if(e.target.closest('[data-validate]'))return;openTask(el.dataset.task)});
  shell.querySelectorAll('[data-validate]').forEach(b=>b.onclick=()=>validateTask(b.dataset.validate));
}

function priorityCard(t,n){return `<article class="v3-priority-item" data-task="${t.id}"><span class="v3-rank">${n}</span><div><strong>${esc(t.title)}</strong><small>${esc(nameFor(t.assignee_id))} · ${formatDate(t.due_date,t.due_time)}</small></div><span class="v3-badge ${t.status}">${labels[t.status]||t.status}</span></article>`}
function taskCard(t){return `<article class="v3-task-card" data-task="${t.id}"><div class="v3-task-main"><strong>${esc(t.title)}</strong><small>${esc(nameFor(t.assignee_id))} · ${formatDate(t.due_date,t.due_time)}</small><small class="v3-priority ${t.priority}">${priorities[t.priority]||t.priority}</small></div><div class="v3-task-side"><span class="v3-badge ${t.status}">${labels[t.status]||t.status}</span><span>Editar ›</span></div></article>`}
function validationCard(t){return `<article class="v3-validation-item" data-task="${t.id}"><div><strong>${esc(t.title)}</strong><small>${esc(nameFor(t.assignee_id))} · concluída pelo colaborador</small></div><div class="v3-validation-actions"><button class="v3-btn" data-task="${t.id}">Rever</button><button class="v3-btn primary" data-validate="${t.id}">Validar</button></div></article>`}

async function validateTask(id){
  const {error}=await supabase.from('tasks').update({status:'done'}).eq('id',id);
  if(error)return toast(error.message,true);
  toast('Tarefa validada.'); await load();
}

async function openTask(id){
  const t=tasks.find(x=>x.id===id); if(!t)return;
  const $=id=>document.getElementById(id);
  $('taskPerson').innerHTML=people.filter(p=>p.active).map(p=>`<option value="${p.id}">${esc(p.full_name||p.email)}</option>`).join('');
  $('taskId').value=t.id; $('taskTitle').value=t.title||''; $('taskOwner').value=me.full_name||me.email;
  $('taskPerson').value=t.assignee_id||''; $('taskPriority').value=t.priority||'medium'; $('taskStatus').value=t.status||'todo';
  $('taskDate').value=t.due_date||''; $('taskTime').value=(t.due_time||'').slice(0,5); $('taskNotes').value=t.notes||'';
  $('taskDialogTitle').textContent=t.title||'Editar tarefa'; ['taskTitle','taskPerson','taskPriority','taskStatus','taskDate','taskTime','taskNotes'].forEach(id=>$(id).disabled=false);
  $('collaboratorNote').classList.add('hidden'); $('deleteTaskBtn').style.display='inline-block'; $('attachmentsSection').classList.remove('hidden'); $('auditSection').classList.remove('hidden');
  $('taskDialog').showModal();
}

function toast(message,error=false){const t=document.getElementById('toast');if(!t)return;t.textContent=message;t.className=`toast show${error?' error':''}`;clearTimeout(t._v3);t._v3=setTimeout(()=>t.className='toast',3200)}
init();
