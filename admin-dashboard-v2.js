import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const cfg = window.APP_CONFIG || {};
const supabase = createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, { auth: { persistSession: true, autoRefreshToken: true } });
const statusLabel = { todo: 'Por iniciar', in_progress: 'Em curso', review: 'A validar', done: 'Validada' };
const priorityLabel = { low: 'Baixa', medium: 'Média', high: 'Alta', critical: 'Crítica' };
const esc = (v='') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Lisbon' }).format(new Date());
const dateText = (d,t) => d ? new Intl.DateTimeFormat('pt-PT',{day:'2-digit',month:'2-digit',year:'numeric',...(t?{hour:'2-digit',minute:'2-digit'}:{})}).format(new Date(`${d}T${t||'12:00'}`)) : 'Sem prazo';

async function init(){
  const { data:{session} } = await supabase.auth.getSession();
  if(!session) return;
  const { data:profile } = await supabase.from('profiles').select('*').eq('id',session.user.id).single();
  if(!profile?.active || profile.role !== 'admin') return;
  document.body.classList.add('admin-dashboard-v2');
  mount(profile);
}

function mount(profile){
  const main = document.querySelector('.main');
  if(!main) return;
  const shell = document.createElement('section');
  shell.className = 'admin-v2-shell';
  shell.id = 'adminV2Shell';
  main.prepend(shell);
  document.body.insertAdjacentHTML('beforeend', `<nav class="admin-v2-dock" aria-label="Menu principal">
    <button class="active" title="Dashboard" data-action="dashboard">⌂</button>
    <button title="Tarefas" data-action="tasks">☑</button>
    <button title="Calendário" data-action="today">▣</button>
    <button title="Colaboradores" data-action="people">♙</button>
    <button title="Relatórios" data-action="reports">▥</button>
    <button title="Alertas" data-action="alerts">♧</button>
    <button title="Validações" data-action="validations">✓</button>
    <button title="Definições" data-action="settings">⚙</button>
    <span class="spacer"></span>
    <button title="Sair" data-action="logout">↪</button>
  </nav>`);
  bindDock();
  load(profile);
  supabase.channel('admin-v2-live').on('postgres_changes',{event:'*',schema:'public',table:'tasks'},()=>load(profile)).on('postgres_changes',{event:'*',schema:'public',table:'profiles'},()=>load(profile)).subscribe();
}

async function load(profile){
  const [{data:profiles,error:pe},{data:tasks,error:te}] = await Promise.all([
    supabase.from('profiles').select('*').eq('role','collaborator').order('full_name'),
    supabase.from('tasks').select('*').order('due_date',{ascending:true,nullsFirst:false}).order('created_at',{ascending:false})
  ]);
  if(pe||te) return toast((pe||te).message,true);
  render(profile,profiles||[],tasks||[]);
}

function render(profile,profiles,tasks){
  const shell = document.getElementById('adminV2Shell');
  if(!shell) return;
  const active = tasks.filter(t=>t.status!=='done').length;
  const completed = tasks.filter(t=>t.status==='done').length;
  const rate = tasks.length ? Math.round(completed/tasks.length*100) : 0;
  const inProgress = tasks.filter(t=>t.status==='in_progress').length;
  const todo = tasks.filter(t=>t.status==='todo').length;
  const late = tasks.filter(t=>t.due_date && t.due_date<today() && t.status!=='done');
  const reviews = tasks.filter(t=>t.status==='review');
  const capacity = profiles.length ? Math.min(100,Math.round(active/(profiles.length*8)*100)) : 0;
  const firstName = (profile.full_name||profile.email||'Utilizador').split(' ')[0];
  const tabs = [{id:'all',name:'Todos',count:tasks.length},...profiles.map(p=>({id:p.id,name:p.full_name||p.email,count:tasks.filter(t=>t.assignee_id===p.id).length}))];
  shell.innerHTML = `<header class="admin-v2-header">
    <div class="admin-v2-brand"><div class="admin-v2-logo">◇</div><h1>Polo Logístico</h1></div>
    <div class="admin-v2-actions"><span class="admin-v2-date">${new Intl.DateTimeFormat('pt-PT',{dateStyle:'medium'}).format(new Date())}</span><button class="btn primary" id="adminV2NewTask">+ Nova tarefa</button><div class="admin-v2-user"><strong>Olá, ${esc(firstName)}</strong><small>Diretor Logístico</small></div></div>
  </header>
  <section class="admin-v2-panel admin-v2-metrics">
    ${metric('Progresso geral',rate,'Concluído','#a46b32')}
    ${metric('Carga de trabalho',capacity,'da capacidade','#a46b32')}
    ${metric('Em curso',tasks.length?Math.round(inProgress/tasks.length*100):0,`${inProgress} tarefas`,'#e59a1a')}
    ${metric('Em atraso',tasks.length?Math.round(late.length/tasks.length*100):0,`${late.length} tarefas`,'#c94b3f')}
    <div class="admin-v2-metric"><div><h3>Distribuição</h3><div class="admin-v2-legend">Por iniciar: <b>${todo}</b><br>Em curso: <b>${inProgress}</b><br>A validar: <b>${reviews.length}</b><br>Validadas: <b>${completed}</b></div><div class="admin-v2-bar"><i style="width:${rate}%"></i></div><small>${rate}% concluído</small></div></div>
  </section>
  <section class="admin-v2-panel">
    <div class="admin-v2-section-head"><h2>Colaboradores</h2><button class="btn" id="adminV2TeamSummary">Ver resumo da equipa</button></div>
    <div class="admin-v2-tabs">${tabs.map((t,i)=>`<button class="admin-v2-tab ${i===0?'active':''}" data-person="${t.id}">${esc(t.name)} (${t.count})</button>`).join('')}</div>
    <div id="adminV2TaskTable"></div>
  </section>
  <section class="admin-v2-grid2">
    <div class="admin-v2-panel"><div class="admin-v2-section-head"><h2>Requer atenção</h2><span>${late.length}</span></div><div class="admin-v2-alert-list">${late.slice(0,5).map(t=>alertRow(t,false,profiles)).join('')||'<div class="admin-v2-empty">Sem tarefas em atraso.</div>'}</div></div>
    <div class="admin-v2-panel"><div class="admin-v2-section-head"><h2>Pendentes de validação</h2><span>${reviews.length}</span></div><div class="admin-v2-alert-list">${reviews.slice(0,5).map(t=>alertRow(t,true,profiles)).join('')||'<div class="admin-v2-empty">Sem validações pendentes.</div>'}</div></div>
  </section>`;
  document.getElementById('adminV2NewTask').onclick=()=>document.getElementById('addTaskBtn')?.click();
  document.getElementById('adminV2TeamSummary').onclick=()=>document.getElementById('teamDashboardBtn')?.click();
  setupTabs(tasks,profiles);
  shell.querySelectorAll('[data-task-id]').forEach(el=>el.addEventListener('click',()=>openTask(el.dataset.taskId)));
}

function metric(title,value,sub,color){return `<div class="admin-v2-metric"><div><h3>${title}</h3><div class="admin-v2-ring" style="--value:${Math.max(0,Math.min(100,value))};--ring:${color}"><span>${value}%<small>${sub}</small></span></div></div></div>`}
function alertRow(t,review,profiles){const p=profiles.find(x=>x.id===t.assignee_id);return `<article class="admin-v2-alert ${review?'review':''}" data-task-id="${t.id}"><i></i><div><strong>${esc(t.title)}</strong><small>${esc(p?.full_name||p?.email||'Sem responsável')} · ${dateText(t.due_date,t.due_time)}</small></div><span>›</span></article>`}
function setupTabs(tasks,profiles){
  const renderTable=(person='all')=>{
    const list=person==='all'?tasks:tasks.filter(t=>t.assignee_id===person);
    const box=document.getElementById('adminV2TaskTable');
    box.innerHTML=`<table class="admin-v2-table"><thead><tr><th>Tarefa</th><th>Colaborador</th><th>Prioridade</th><th>Prazo</th><th>Estado</th></tr></thead><tbody>${list.map(t=>{const p=profiles.find(x=>x.id===t.assignee_id);return `<tr class="admin-v2-task" data-task-id="${t.id}"><td class="admin-v2-task-title"><strong>${esc(t.title)}</strong><small>${esc(t.notes||'Sem observações')}</small></td><td>${esc(p?.full_name||p?.email||'—')}</td><td>${priorityLabel[t.priority]||t.priority}</td><td>${dateText(t.due_date,t.due_time)}</td><td><span class="admin-v2-status ${t.status}">${statusLabel[t.status]||t.status}</span></td></tr>`}).join('')||'<tr><td colspan="5" class="admin-v2-empty">Sem tarefas.</td></tr>'}</tbody></table>`;
    box.querySelectorAll('[data-task-id]').forEach(el=>el.addEventListener('click',()=>openTask(el.dataset.taskId)));
  };
  renderTable();
  document.querySelectorAll('.admin-v2-tab').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.admin-v2-tab').forEach(x=>x.classList.remove('active'));btn.classList.add('active');renderTable(btn.dataset.person)});
}

function openTask(id){
  const all=document.querySelector('#nav button[data-view="all"]');
  all?.click();
  let tries=0;
  const timer=setInterval(()=>{const card=document.querySelector(`.task-card[data-id="${CSS.escape(id)}"]`);if(card){clearInterval(timer);card.click()}else if(++tries>15){clearInterval(timer);toast('Não foi possível abrir a tarefa.',true)}},30);
}
function bindDock(){
  document.querySelector('.admin-v2-dock')?.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const a=b.dataset.action;document.querySelectorAll('.admin-v2-dock button').forEach(x=>x.classList.remove('active'));b.classList.add('active');if(a==='tasks')document.querySelector('#nav button[data-view="all"]')?.click();if(a==='today')document.querySelector('#nav button[data-view="today"]')?.click();if(a==='people')document.getElementById('peopleBtn')?.click();if(a==='reports')document.getElementById('teamDashboardBtn')?.click();if(a==='alerts')document.querySelector('#nav button[data-view="late"]')?.click();if(a==='validations')document.querySelector('.admin-v2-grid2 .admin-v2-panel:nth-child(2)')?.scrollIntoView({behavior:'smooth'});if(a==='settings')document.getElementById('themeBtn')?.click();if(a==='logout')document.getElementById('logoutBtn')?.click();});
}
function toast(message,error=false){const t=document.getElementById('toast');if(!t)return;t.textContent=message;t.className=`toast show${error?' error':''}`;setTimeout(()=>t.className='toast',3500)}
init();
