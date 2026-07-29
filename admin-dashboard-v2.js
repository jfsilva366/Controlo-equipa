import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const cfg = window.APP_CONFIG || {};
const supabase = createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
  auth: { persistSession: true, autoRefreshToken: true }
});

const statusLabel = { todo: 'Por iniciar', in_progress: 'Em curso', review: 'A validar', done: 'Validada' };
const priorityLabel = { low: 'Baixa', medium: 'Média', high: 'Alta', critical: 'Crítica' };
const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Lisbon' }).format(new Date());
const dateText = (date, time) => date ? new Intl.DateTimeFormat('pt-PT', {
  day: '2-digit', month: '2-digit', year: 'numeric',
  ...(time ? { hour: '2-digit', minute: '2-digit' } : {})
}).format(new Date(`${date}T${time || '12:00'}`)) : 'Sem prazo';

let adminProfile = null;
let profiles = [];
let tasks = [];
let selectedPerson = 'all';
let taskFilter = 'all';

async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
  if (!profile?.active || profile.role !== 'admin') return;
  adminProfile = profile;
  document.body.classList.add('admin-dashboard-v2');
  mount();
  await load();
}

function mount() {
  const main = document.querySelector('.main');
  if (!main) return;
  if (!document.getElementById('adminV2Shell')) {
    const shell = document.createElement('section');
    shell.className = 'admin-v2-shell';
    shell.id = 'adminV2Shell';
    main.prepend(shell);
  }
  if (!document.querySelector('.admin-v2-dock')) {
    document.body.insertAdjacentHTML('beforeend', `<nav class="admin-v2-dock" aria-label="Menu principal">
      <button class="active" title="Dashboard" data-action="dashboard">⌂</button>
      <button title="Tarefas" data-action="tasks">☑</button>
      <button title="Tarefas de hoje" data-action="today">▣</button>
      <button title="Colaboradores" data-action="people">♙</button>
      <button title="Relatórios" data-action="reports">▥</button>
      <button title="Alertas" data-action="alerts">♧</button>
      <button title="Validações" data-action="validations">✓</button>
      <button title="Alterar tema" data-action="settings">⚙</button>
      <span class="spacer"></span>
      <button title="Sair" data-action="logout">↪</button>
    </nav>`);
  }
  bindDock();
  supabase.channel('admin-v2-live-fixed')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, load)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, load)
    .subscribe();
}

async function load() {
  const [profileResult, taskResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('role', 'collaborator').order('full_name'),
    supabase.from('tasks').select('*').order('due_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false })
  ]);
  if (profileResult.error || taskResult.error) {
    toast((profileResult.error || taskResult.error).message, true);
    return;
  }
  profiles = profileResult.data || [];
  tasks = taskResult.data || [];
  render();
}

function filteredTasks() {
  let list = selectedPerson === 'all' ? tasks : tasks.filter((task) => task.assignee_id === selectedPerson);
  if (taskFilter === 'today') list = list.filter((task) => task.due_date === today());
  if (taskFilter === 'late') list = list.filter((task) => task.due_date && task.due_date < today() && task.status !== 'done');
  if (taskFilter === 'review') list = list.filter((task) => task.status === 'review');
  return list;
}

function render() {
  const shell = document.getElementById('adminV2Shell');
  if (!shell) return;
  const active = tasks.filter((task) => task.status !== 'done').length;
  const completed = tasks.filter((task) => task.status === 'done').length;
  const rate = tasks.length ? Math.round(completed / tasks.length * 100) : 0;
  const inProgress = tasks.filter((task) => task.status === 'in_progress').length;
  const todo = tasks.filter((task) => task.status === 'todo').length;
  const late = tasks.filter((task) => task.due_date && task.due_date < today() && task.status !== 'done');
  const reviews = tasks.filter((task) => task.status === 'review');
  const capacity = profiles.length ? Math.min(100, Math.round(active / (profiles.length * 8) * 100)) : 0;
  const firstName = (adminProfile.full_name || adminProfile.email || 'Utilizador').split(' ')[0];
  const tabs = [{ id: 'all', name: 'Todos', count: tasks.length }, ...profiles.map((profile) => ({
    id: profile.id,
    name: profile.full_name || profile.email,
    count: tasks.filter((task) => task.assignee_id === profile.id).length
  }))];

  shell.innerHTML = `<header class="admin-v2-header">
    <div class="admin-v2-brand"><div class="admin-v2-logo">◇</div><h1>Polo Logístico</h1></div>
    <div class="admin-v2-actions"><span class="admin-v2-date">${new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium' }).format(new Date())}</span><button class="btn primary" id="adminV2NewTask">+ Nova tarefa</button><div class="admin-v2-user"><strong>Olá, ${esc(firstName)}</strong><small>Diretor Logístico</small></div></div>
  </header>
  <section class="admin-v2-panel admin-v2-metrics" id="adminV2Metrics">
    ${metric('Progresso geral', rate, 'Concluído', '#a46b32')}
    ${metric('Carga de trabalho', capacity, 'da capacidade', '#a46b32')}
    ${metric('Em curso', tasks.length ? Math.round(inProgress / tasks.length * 100) : 0, `${inProgress} tarefas`, '#e59a1a')}
    ${metric('Em atraso', tasks.length ? Math.round(late.length / tasks.length * 100) : 0, `${late.length} tarefas`, '#c94b3f')}
    <div class="admin-v2-metric"><div><h3>Distribuição</h3><div class="admin-v2-legend">Por iniciar: <b>${todo}</b><br>Em curso: <b>${inProgress}</b><br>A validar: <b>${reviews.length}</b><br>Validadas: <b>${completed}</b></div><div class="admin-v2-bar"><i style="width:${rate}%"></i></div><small>${rate}% concluído</small></div></div>
  </section>
  <section class="admin-v2-panel" id="adminV2TasksSection">
    <div class="admin-v2-section-head"><h2>Colaboradores</h2><button class="btn" id="adminV2TeamSummary">Ver resumo da equipa</button></div>
    <div class="admin-v2-tabs">${tabs.map((tab) => `<button class="admin-v2-tab ${tab.id === selectedPerson ? 'active' : ''}" data-person="${tab.id}">${esc(tab.name)} (${tab.count})</button>`).join('')}</div>
    <div id="adminV2TaskTable"></div>
  </section>
  <section class="admin-v2-grid2">
    <div class="admin-v2-panel" id="adminV2Alerts"><div class="admin-v2-section-head"><h2>Requer atenção</h2><span>${late.length}</span></div><div class="admin-v2-alert-list">${late.slice(0, 5).map((task) => alertRow(task, false)).join('') || '<div class="admin-v2-empty">Sem tarefas em atraso.</div>'}</div></div>
    <div class="admin-v2-panel" id="adminV2Validations"><div class="admin-v2-section-head"><h2>Pendentes de validação</h2><span>${reviews.length}</span></div><div class="admin-v2-alert-list">${reviews.slice(0, 5).map((task) => alertRow(task, true)).join('') || '<div class="admin-v2-empty">Sem validações pendentes.</div>'}</div></div>
  </section>`;

  document.getElementById('adminV2NewTask').onclick = () => document.getElementById('addTaskBtn')?.click();
  document.getElementById('adminV2TeamSummary').onclick = () => document.getElementById('teamDashboardBtn')?.click();
  setupTabs();
  renderTable();
  shell.querySelectorAll('[data-task-id]').forEach((element) => element.addEventListener('click', () => openTaskDirect(element.dataset.taskId)));
}

function metric(title, value, sub, color) {
  return `<div class="admin-v2-metric"><div><h3>${title}</h3><div class="admin-v2-ring" style="--value:${Math.max(0, Math.min(100, value))};--ring:${color}"><span>${value}%<small>${sub}</small></span></div></div></div>`;
}

function alertRow(task, review) {
  const profile = profiles.find((item) => item.id === task.assignee_id);
  return `<article class="admin-v2-alert ${review ? 'review' : ''}" data-task-id="${task.id}"><i></i><div><strong>${esc(task.title)}</strong><small>${esc(profile?.full_name || profile?.email || 'Sem responsável')} · ${dateText(task.due_date, task.due_time)}</small></div><span>›</span></article>`;
}

function setupTabs() {
  document.querySelectorAll('.admin-v2-tab').forEach((button) => {
    button.onclick = () => {
      selectedPerson = button.dataset.person;
      document.querySelectorAll('.admin-v2-tab').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      renderTable();
    };
  });
}

function renderTable() {
  const box = document.getElementById('adminV2TaskTable');
  if (!box) return;
  const list = filteredTasks();
  const filterText = taskFilter === 'today' ? ' — Hoje' : taskFilter === 'late' ? ' — Em atraso' : taskFilter === 'review' ? ' — A validar' : '';
  box.innerHTML = `<div class="admin-v2-section-head"><h2>Tarefas${filterText}</h2>${taskFilter !== 'all' ? '<button class="btn small" id="adminV2ClearFilter">Ver todas</button>' : ''}</div><table class="admin-v2-table"><thead><tr><th>Tarefa</th><th>Colaborador</th><th>Prioridade</th><th>Prazo</th><th>Estado</th></tr></thead><tbody>${list.map((task) => {
    const profile = profiles.find((item) => item.id === task.assignee_id);
    return `<tr class="admin-v2-task" data-task-id="${task.id}"><td class="admin-v2-task-title"><strong>${esc(task.title)}</strong><small>${esc(task.notes || 'Sem observações')}</small></td><td>${esc(profile?.full_name || profile?.email || '—')}</td><td>${priorityLabel[task.priority] || task.priority}</td><td>${dateText(task.due_date, task.due_time)}</td><td><span class="admin-v2-status ${task.status}">${statusLabel[task.status] || task.status}</span></td></tr>`;
  }).join('') || '<tr><td colspan="5" class="admin-v2-empty">Sem tarefas.</td></tr>'}</tbody></table>`;
  document.getElementById('adminV2ClearFilter')?.addEventListener('click', () => { taskFilter = 'all'; renderTable(); });
  box.querySelectorAll('[data-task-id]').forEach((element) => element.addEventListener('click', () => openTaskDirect(element.dataset.taskId)));
}

async function openTaskDirect(id) {
  const task = tasks.find((item) => item.id === id) || (await supabase.from('tasks').select('*').eq('id', id).single()).data;
  if (!task) {
    toast('Não foi possível abrir a tarefa.', true);
    return;
  }
  const byId = (elementId) => document.getElementById(elementId);
  const activeProfiles = profiles.filter((profile) => profile.active);
  byId('taskPerson').innerHTML = activeProfiles.map((profile) => `<option value="${profile.id}">${esc(profile.full_name || profile.email)}</option>`).join('');
  byId('taskId').value = task.id;
  byId('taskTitle').value = task.title || '';
  byId('taskOwner').value = adminProfile.full_name || adminProfile.email || 'Administrador';
  byId('taskPerson').value = task.assignee_id || '';
  byId('taskPriority').value = task.priority || 'medium';
  byId('taskStatus').value = task.status || 'todo';
  byId('taskDate').value = task.due_date || '';
  byId('taskTime').value = (task.due_time || '').slice(0, 5);
  byId('taskNotes').value = task.notes || '';
  byId('taskDialogTitle').textContent = task.title || 'Editar tarefa';
  ['taskTitle', 'taskPerson', 'taskPriority', 'taskStatus', 'taskDate', 'taskTime', 'taskNotes'].forEach((elementId) => { byId(elementId).disabled = false; });
  byId('collaboratorNote').classList.add('hidden');
  byId('deleteTaskBtn').style.display = 'inline-block';
  byId('attachmentsSection').classList.remove('hidden');
  byId('auditSection').classList.remove('hidden');
  await Promise.all([loadAttachments(task.id), loadHistory(task.id)]);
  byId('taskDialog').showModal();
}

async function loadAttachments(taskId) {
  const list = document.getElementById('attachmentList');
  const { data, error } = await supabase.from('task_attachments').select('*').eq('task_id', taskId).order('created_at', { ascending: false });
  if (error) {
    list.innerHTML = '<div class="empty">Não foi possível carregar os anexos.</div>';
    return;
  }
  list.innerHTML = (data || []).length ? data.map((attachment) => `<div class="attachment-item"><button class="btn small admin-v2-open-attachment" data-path="${esc(attachment.storage_path)}">Abrir</button> ${esc(attachment.file_name)}</div>`).join('') : '<div class="empty">Sem anexos</div>';
  list.querySelectorAll('.admin-v2-open-attachment').forEach((button) => button.onclick = async () => {
    const { data: signed, error: signError } = await supabase.storage.from('task-evidence').createSignedUrl(button.dataset.path, 60);
    if (signError) return toast(signError.message, true);
    window.open(signed.signedUrl, '_blank', 'noopener');
  });
}

async function loadHistory(taskId) {
  const list = document.getElementById('auditList');
  const { data, error } = await supabase.from('task_events').select('*').eq('task_id', taskId).order('created_at', { ascending: false });
  if (error) {
    list.innerHTML = '<div class="empty">Não foi possível carregar o histórico.</div>';
    return;
  }
  list.innerHTML = (data || []).map((event) => `<div class="audit-item"><strong>${event.action === 'created' ? 'Tarefa criada' : 'Tarefa atualizada'}</strong>${event.old_status !== event.new_status ? ` — ${event.old_status ? statusLabel[event.old_status] : '—'} → ${statusLabel[event.new_status]}` : ''}<br><small>${new Intl.DateTimeFormat('pt-PT', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(event.created_at))}</small></div>`).join('') || '<div class="empty">Sem histórico</div>';
}

function bindDock() {
  const dock = document.querySelector('.admin-v2-dock');
  if (!dock || dock.dataset.bound === 'true') return;
  dock.dataset.bound = 'true';
  dock.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const action = button.dataset.action;
    dock.querySelectorAll('button').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    if (action === 'dashboard') {
      taskFilter = 'all';
      window.scrollTo({ top: 0, behavior: 'smooth' });
      renderTable();
    } else if (action === 'tasks') {
      taskFilter = 'all';
      renderTable();
      document.getElementById('adminV2TasksSection')?.scrollIntoView({ behavior: 'smooth' });
    } else if (action === 'today') {
      taskFilter = 'today';
      renderTable();
      document.getElementById('adminV2TasksSection')?.scrollIntoView({ behavior: 'smooth' });
    } else if (action === 'people') {
      document.getElementById('peopleBtn')?.click();
    } else if (action === 'reports') {
      document.getElementById('teamDashboardBtn')?.click();
    } else if (action === 'alerts') {
      taskFilter = 'late';
      renderTable();
      document.getElementById('adminV2Alerts')?.scrollIntoView({ behavior: 'smooth' });
    } else if (action === 'validations') {
      taskFilter = 'review';
      renderTable();
      document.getElementById('adminV2Validations')?.scrollIntoView({ behavior: 'smooth' });
    } else if (action === 'settings') {
      document.getElementById('themeBtn')?.click();
      toast('Tema atualizado.');
    } else if (action === 'logout') {
      document.getElementById('logoutBtn')?.click();
    }
  });
}

function toast(message, error = false) {
  const element = document.getElementById('toast');
  if (!element) return;
  element.textContent = message;
  element.className = `toast show${error ? ' error' : ''}`;
  clearTimeout(element._adminTimer);
  element._adminTimer = setTimeout(() => { element.className = 'toast'; }, 3500);
}

init();