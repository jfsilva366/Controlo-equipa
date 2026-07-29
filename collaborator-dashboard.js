import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const cfg = window.APP_CONFIG || {};
const supabase = createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
  auth: { persistSession: true, autoRefreshToken: true }
});

const statusLabels = { todo:'Por iniciar', in_progress:'Em curso', review:'Terminada — a validar', done:'Validada' };
const priorityLabels = { low:'Baixa', medium:'Média', high:'Alta', critical:'Crítica' };
const esc = (v='') => String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const today = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Lisbon'}).format(new Date());
const formatDate = (d,t) => d ? new Intl.DateTimeFormat('pt-PT',{day:'2-digit',month:'short',year:'numeric',...(t?{hour:'2-digit',minute:'2-digit'}:{})}).format(new Date(`${d}T${t||'12:00'}`)) : 'Sem prazo';

function toast(message,error=false){
  const el=document.getElementById('toast'); if(!el)return;
  el.textContent=message; el.className=`toast show${error?' error':''}`;
  clearTimeout(el._cdTimer); el._cdTimer=setTimeout(()=>el.className='toast',3200);
}

async function init(){
  const {data:{session}}=await supabase.auth.getSession(); if(!session)return;
  const {data:profile}=await supabase.from('profiles').select('id,role,active,full_name,email').eq('id',session.user.id).single();
  if(!profile?.active||profile.role!=='collaborator')return;

  document.body.classList.add('collaborator-dashboard-v2');
  const userName=profile.full_name||profile.email||'utilizador';
  const title=document.getElementById('pageTitle');
  const subtitle=document.getElementById('pageSubtitle');
  const eyebrow=document.querySelector('.topbar .eyebrow');
  if(eyebrow)eyebrow.remove();
  if(title)title.textContent=`Olá, ${userName}`;
  if(subtitle)subtitle.remove();
  document.getElementById('personFilter')?.classList.add('hidden');
  document.getElementById('priorityFilter')?.classList.add('hidden');
  document.getElementById('resetFiltersBtn')?.classList.add('hidden');
  document.getElementById('nav')?.classList.add('collaborator-nav-hidden');

  let tasks=[];
  let selected=null;

  async function load(){
    const {data,error}=await supabase.from('tasks').select('*').eq('assignee_id',session.user.id).order('due_date',{ascending:true,nullsFirst:false}).order('created_at',{ascending:false});
    if(error){toast(error.message,true);return;}
    tasks=data||[]; render();
  }

  function metricCard(label,value,total,cls){
    const pct=total?Math.round(value/total*100):0;
    return `<article class="collab-metric"><div class="metric-ring ${cls}" style="--pct:${pct}"><span><b>${value}</b><small>tarefas</small></span></div><strong>${label}</strong><small>${pct}% do total</small></article>`;
  }

  function render(){
    const total=tasks.length;
    const todo=tasks.filter(t=>t.status==='todo').length;
    const progress=tasks.filter(t=>t.status==='in_progress').length;
    const late=tasks.filter(t=>t.due_date&&t.due_date<today()&&!['review','done'].includes(t.status)).length;
    const done=tasks.filter(t=>t.status==='done').length;
    const rate=total?Math.round(done/total*100):0;
    const stats=document.querySelector('.stats');
    if(stats)stats.innerHTML=`${metricCard('A iniciar',todo,total,'ring-todo')}${metricCard('Em curso',progress,total,'ring-progress')}${metricCard('Em atraso',late,total,'ring-late')}<article class="collab-metric"><div class="metric-ring ring-done" style="--pct:${rate}"><span><b>${rate}%</b><small>concluído</small></span></div><strong>Taxa de conclusão</strong><small>${done} de ${total}</small></article>`;

    const search=document.getElementById('searchInput')?.value.trim().toLowerCase()||'';
    const visible=tasks.filter(t=>[t.title,t.notes,statusLabels[t.status],priorityLabels[t.priority]].join(' ').toLowerCase().includes(search));
    const board=document.getElementById('board'); if(!board)return;
    board.innerHTML=`<section class="collaborator-list collab-task-panel"><div class="collab-panel-head"><div><small>Execução diária</small><h3>Minhas tarefas</h3></div><span>${visible.length} ${visible.length===1?'tarefa':'tarefas'}</span></div><div class="collab-table-head"><span>Tarefa</span><span>Prioridade</span><span>Prazo</span><span>Estado</span><span></span></div>${visible.length?visible.map(row).join(''):'<div class="empty">Sem tarefas para apresentar.</div>'}</section>`;
    board.querySelectorAll('[data-open-task]').forEach(el=>el.addEventListener('click',()=>openDetail(el.dataset.openTask)));
  }

  function row(t){
    const isLate=t.due_date&&t.due_date<today()&&!['review','done'].includes(t.status);
    return `<button class="collab-task-line" data-open-task="${t.id}" type="button"><span class="task-icon">□</span><span class="task-copy"><strong>${esc(t.title)}</strong><small>${esc(t.notes||'Sem descrição adicional')}</small></span><span><i class="tag ${t.priority}">${priorityLabels[t.priority]}</i></span><span class="${isLate?'late':''}">${formatDate(t.due_date,t.due_time)}</span><span><i class="workflow-status status-${t.status}">${statusLabels[t.status]}</i></span><span class="task-arrow">›</span></button>`;
  }

  async function openDetail(id){
    selected=tasks.find(t=>t.id===id); if(!selected)return;
    let modal=document.getElementById('collabDetailDialog');
    if(!modal){modal=document.createElement('dialog');modal.id='collabDetailDialog';modal.className='collab-detail-dialog';document.body.appendChild(modal);}
    const next=selected.status==='todo'?'in_progress':selected.status==='in_progress'?'review':null;
    const nextLabel=selected.status==='todo'?'Iniciar tarefa':selected.status==='in_progress'?'Terminar e enviar para validação':'';
    modal.innerHTML=`<div class="collab-detail-head"><button data-close-detail type="button">←</button><div><small>Detalhe da tarefa</small><h3>${esc(selected.title)}</h3></div><button data-close-detail type="button">×</button></div><div class="collab-detail-body"><section class="detail-summary"><div><small>Prioridade</small><b class="tag ${selected.priority}">${priorityLabels[selected.priority]}</b></div><div><small>Prazo</small><b>${formatDate(selected.due_date,selected.due_time)}</b></div><div><small>Estado atual</small><b class="workflow-status status-${selected.status}">${statusLabels[selected.status]}</b></div></section><section><h4>Descrição</h4><p>${esc(selected.notes||'Sem descrição adicional.')}</p></section><section><h4>Anexos</h4><div id="collabAttachments" class="detail-list"><span>A carregar…</span></div></section><section><h4>Histórico</h4><div id="collabHistory" class="detail-list"><span>A carregar…</span></div></section></div><div class="collab-detail-foot">${next?`<button class="btn primary block" data-progress-task="${next}">${nextLabel}</button>`:'<div class="workflow-waiting">${selected.status==='review'?'A aguardar validação do administrador.':'Tarefa validada.'}</div>'}</div>`;
    modal.querySelectorAll('[data-close-detail]').forEach(b=>b.onclick=()=>modal.close());
    modal.querySelector('[data-progress-task]')?.addEventListener('click',async(e)=>{
      const button=e.currentTarget; button.disabled=true;
      const nextStatus=button.dataset.progressTask;
      const {error}=await supabase.from('tasks').update({status:nextStatus}).eq('id',selected.id).eq('assignee_id',session.user.id);
      if(error){toast(error.message,true);button.disabled=false;return;}
      toast(nextStatus==='in_progress'?'Tarefa iniciada.':'Tarefa enviada para validação.'); modal.close(); await load();
    });
    modal.showModal();
    loadDetailData(selected.id);
  }

  async function loadDetailData(taskId){
    const [a,e]=await Promise.all([
      supabase.from('task_attachments').select('*').eq('task_id',taskId).order('created_at',{ascending:false}),
      supabase.from('task_events').select('*').eq('task_id',taskId).order('created_at',{ascending:false})
    ]);
    const at=document.getElementById('collabAttachments');
    if(at)at.innerHTML=a.error||!a.data?.length?'<span>Sem anexos.</span>':a.data.map(x=>`<button type="button" data-file="${esc(x.storage_path)}">📎 ${esc(x.file_name)}</button>`).join('');
    at?.querySelectorAll('[data-file]').forEach(b=>b.onclick=async()=>{const {data,error}=await supabase.storage.from('task-evidence').createSignedUrl(b.dataset.file,60);if(error){toast(error.message,true);return;}window.open(data.signedUrl,'_blank','noopener');});
    const hi=document.getElementById('collabHistory');
    if(hi)hi.innerHTML=e.error||!e.data?.length?'<span>Sem histórico.</span>':e.data.map(x=>`<article><b>${x.old_status!==x.new_status?`${statusLabels[x.old_status]||'Criada'} → ${statusLabels[x.new_status]}`:'Tarefa atualizada'}</b><small>${new Intl.DateTimeFormat('pt-PT',{dateStyle:'short',timeStyle:'short'}).format(new Date(x.created_at))}</small></article>`).join('');
  }

  document.getElementById('searchInput')?.addEventListener('input',render);
  supabase.channel(`collab-dashboard-v2-${session.user.id}`).on('postgres_changes',{event:'*',schema:'public',table:'tasks',filter:`assignee_id=eq.${session.user.id}`},load).subscribe();
  await load();
}

init();