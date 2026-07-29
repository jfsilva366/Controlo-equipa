import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const $ = (id) => document.getElementById(id);
const cfg = window.APP_CONFIG || {};
const configured = /^https:\/\/.+\.supabase\.co$/.test(cfg.supabaseUrl || '') && (cfg.supabasePublishableKey || '').length > 20;
const supabase = configured ? createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, { auth: { persistSession: true, autoRefreshToken: true } }) : null;
const state = { session: null, profile: null, profiles: [], tasks: [], invitations: [], view: 'all', channel: null };
const statusMap = { todo: 'Por iniciar', in_progress: 'Em curso', review: 'A validar', done: 'Concluída' };
const priorityMap = { low: 'Baixa', medium: 'Média', high: 'Alta', critical: 'Crítica' };
const columns = ['todo', 'in_progress', 'review', 'done'];

function toast(message, error = false) { const el = $('toast'); el.textContent = message; el.className = `toast show${error ? ' error' : ''}`; clearTimeout(el._timer); el._timer = setTimeout(() => { el.className = 'toast'; }, 3000); }
function setMessage(id, text, success = false) { const el = $(id); el.textContent = text || ''; el.className = `form-message${success ? ' success' : ''}`; }
function localDate() { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Lisbon' }).format(new Date()); }
function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
function initials(value = '') { return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?'; }
function formatDate(date, time) { if (!date) return 'Sem prazo'; const options = { day: '2-digit', month: '2-digit', year: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}) }; return new Intl.DateTimeFormat('pt-PT', options).format(new Date(`${date}T${time || '12:00'}`)); }
function isAdmin() { return state.profile?.role === 'admin' && state.profile?.active; }
function profileName(id) { const profile = state.profiles.find((item) => item.id === id); return profile?.full_name || profile?.email || 'Utilizador'; }
function setBusy(text = 'A sincronizar…') { $('syncStatus').textContent = text; }
function setSynced() { $('syncStatus').textContent = `Sincronizado às ${new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit' }).format(new Date())}`; }
function showAuth() { $('loadingScreen').classList.add('hidden'); $('appShell').classList.add('hidden'); $('mobileTop').classList.add('hidden'); $('loginScreen').classList.remove('hidden'); }
function showApp() { $('loadingScreen').classList.add('hidden'); $('loginScreen').classList.add('hidden'); $('appShell').classList.remove('hidden'); $('mobileTop').classList.remove('hidden'); }

async function boot() { if (!configured) { $('configWarning').classList.remove('hidden'); showAuth(); return; } const { data: { session } } = await supabase.auth.getSession(); session ? await enterApp(session) : showAuth(); }
async function enterApp(session) {
  state.session = session;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
  if (error || !data) { await supabase.auth.signOut(); showAuth(); setMessage('loginMessage', 'Perfil não encontrado. Contacta o administrador.'); return; }
  if (!data.active) { await supabase.auth.signOut(); showAuth(); setMessage('loginMessage', 'A conta ainda não está ativa.'); return; }
  state.profile = data;
  $('userName').textContent = data.full_name || data.email;
  $('userRole').textContent = data.role === 'admin' ? 'Administrador' : data.department || 'Colaborador';
  $('userAvatar').textContent = initials(data.full_name || data.email);
  document.querySelectorAll('.admin-only').forEach((el) => el.classList.toggle('hidden', !isAdmin()));
  showApp(); await refreshData(); subscribeRealtime();
}

async function refreshData() {
  setBusy();
  const queries = [supabase.from('tasks').select('*').order('created_at', { ascending: false })];
  if (isAdmin()) queries.push(supabase.from('profiles').select('*').order('full_name'), supabase.from('invitations').select('*').order('created_at', { ascending: false }));
  const results = await Promise.all(queries);
  const failed = results.find((result) => result.error);
  if (failed) { toast(failed.error.message, true); setSynced(); return; }
  state.tasks = results[0].data || [];
  if (isAdmin()) { state.profiles = results[1].data || []; state.invitations = results[2].data || []; } else { state.profiles = [state.profile]; }
  populateFilters(); render(); setSynced();
}

function subscribeRealtime() {
  if (state.channel) supabase.removeChannel(state.channel);
  state.channel = supabase.channel('team-control-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, refreshData)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, refreshData)
    .subscribe((status) => { $('connectionDot').style.background = status === 'SUBSCRIBED' ? 'var(--good)' : 'var(--warn)'; });
}

function populateFilters() {
  const activeProfiles = state.profiles.filter((profile) => profile.active);
  $('personFilter').innerHTML = '<option value="">Todos</option>' + activeProfiles.map((profile) => `<option value="${profile.id}">${escapeHtml(profile.full_name || profile.email)}</option>`).join('');
  const assignable = activeProfiles.filter((profile) => profile.id !== state.profile.id || profile.role !== 'admin');
  $('taskPerson').innerHTML = assignable.map((profile) => `<option value="${profile.id}">${escapeHtml(profile.full_name || profile.email)}</option>`).join('');
}

function filteredTasks() {
  const query = $('searchInput').value.trim().toLowerCase(); const person = $('personFilter').value; const priority = $('priorityFilter').value; const today = localDate();
  return state.tasks.filter((task) => {
    const searchText = [task.title, task.notes, profileName(task.assignee_id), profileName(task.created_by)].join(' ').toLowerCase();
    if ((query && !searchText.includes(query)) || (person && task.assignee_id !== person) || (priority && task.priority !== priority)) return false;
    if (state.view === 'today' && task.due_date !== today) return false;
    if (state.view === 'late' && !(task.due_date && task.due_date < today && task.status !== 'done')) return false;
    if (state.view === 'critical' && task.priority !== 'critical') return false;
    if (state.view === 'completed' && task.status !== 'done') return false;
    return true;
  });
}

function renderWorkloadAlert() {
  const box = $('workloadAlert');
  if (!isAdmin()) { box.classList.add('hidden'); return; }
  const collaborators = state.profiles.filter((p) => p.active && p.role === 'collaborator');
  if (collaborators.length < 2) { box.classList.add('hidden'); return; }
  const loads = collaborators.map((p) => ({ profile: p, count: state.tasks.filter((t) => t.assignee_id === p.id && t.status !== 'done').length })).sort((a, b) => b.count - a.count);
  const leader = loads[0]; const others = loads.slice(1); const otherAverage = others.reduce((sum, item) => sum + item.count, 0) / others.length;
  const overloaded = leader.count >= 4 && leader.count >= otherAverage + 2 && leader.count >= Math.max(1, otherAverage * 1.5);
  if (!overloaded) { box.classList.add('hidden'); return; }
  box.innerHTML = `<strong>Alerta privado de distribuição</strong><br>${escapeHtml(leader.profile.full_name || leader.profile.email)} tem <strong>${leader.count} tarefas ativas</strong>, enquanto os restantes colaboradores têm uma média de <strong>${otherAverage.toFixed(1)}</strong>. Considera redistribuir trabalho.`;
  box.classList.remove('hidden');
}

function render() {
  const today = localDate(); const all = state.tasks; const active = all.filter((task) => task.status !== 'done').length; const dueToday = all.filter((task) => task.due_date === today && task.status !== 'done').length; const late = all.filter((task) => task.due_date && task.due_date < today && task.status !== 'done').length; const done = all.filter((task) => task.status === 'done').length;
  $('statActive').textContent = active; $('statToday').textContent = dueToday; $('statLate').textContent = late; $('statRate').textContent = `${all.length ? Math.round((done / all.length) * 100) : 0}%`;
  $('navAll').textContent = all.length; $('navToday').textContent = dueToday; $('navLate').textContent = late; $('navCritical').textContent = all.filter((task) => task.priority === 'critical' && task.status !== 'done').length; $('navCompleted').textContent = done;
  renderWorkloadAlert();
  const data = filteredTasks();
  $('board').innerHTML = columns.map((status) => { const list = data.filter((task) => task.status === status); return `<section class="column"><div class="column-head"><span>${statusMap[status]}</span><span>${list.length}</span></div><div class="column-body">${list.length ? list.map(taskCard).join('') : '<div class="empty">Sem tarefas</div>'}</div></section>`; }).join('');
  document.querySelectorAll('.task-card').forEach((card) => { card.onclick = () => openTask(card.dataset.id); });
}

function taskCard(task) {
  const late = task.due_date && task.due_date < localDate() && task.status !== 'done';
  return `<article class="task-card" data-id="${task.id}"><div class="task-title">${escapeHtml(task.title)}</div><div class="task-meta"><span class="tag ${task.priority}">${priorityMap[task.priority]}</span></div><div class="task-person">Atribuída a: ${escapeHtml(profileName(task.assignee_id))}</div><div class="task-due ${late ? 'late' : ''}">${formatDate(task.due_date, task.due_time)}</div></article>`;
}

function clearTaskForm() {
  ['taskId', 'taskTitle', 'taskOwner', 'taskDate', 'taskTime', 'taskNotes'].forEach((id) => { $(id).value = ''; });
  $('taskPriority').value = 'medium'; $('taskStatus').value = 'todo'; $('attachmentList').innerHTML = ''; $('auditList').innerHTML = ''; $('attachmentsSection').classList.add('hidden'); $('auditSection').classList.add('hidden'); $('deleteTaskBtn').style.display = 'none';
}
function lockTaskFields(locked) { ['taskTitle', 'taskPerson', 'taskPriority', 'taskDate', 'taskTime'].forEach((id) => { $(id).disabled = locked; }); $('collaboratorNote').classList.toggle('hidden', !locked); }
function openNewTask() {
  clearTaskForm(); lockTaskFields(false); $('taskDialogTitle').textContent = 'Nova tarefa'; $('taskOwner').value = state.profile.full_name || state.profile.email;
  const firstCollaborator = state.profiles.find((p) => p.active && p.role === 'collaborator'); if (firstCollaborator) $('taskPerson').value = firstCollaborator.id;
  $('taskDialog').showModal();
}
async function openTask(id) {
  const task = state.tasks.find((item) => item.id === id); if (!task) return; clearTaskForm();
  $('taskId').value = task.id; $('taskTitle').value = task.title || ''; $('taskOwner').value = profileName(task.created_by); $('taskPriority').value = task.priority; $('taskStatus').value = task.status; $('taskDate').value = task.due_date || ''; $('taskTime').value = (task.due_time || '').slice(0, 5); $('taskNotes').value = task.notes || ''; $('taskPerson').value = task.assignee_id;
  $('taskDialogTitle').textContent = task.title; lockTaskFields(!isAdmin()); $('deleteTaskBtn').style.display = isAdmin() ? 'inline-block' : 'none'; $('attachmentsSection').classList.remove('hidden'); $('auditSection').classList.remove('hidden'); $('taskDialog').showModal(); await Promise.all([loadAttachments(id), loadAudit(id)]);
}

async function saveTask() {
  const id = $('taskId').value; const title = $('taskTitle').value.trim(); const assignee_id = $('taskPerson').value;
  if (!title || !assignee_id) { toast('Preenche a tarefa e seleciona quem a vai receber.', true); return; }
  const payload = isAdmin() ? { title, assignee_id, priority: $('taskPriority').value, status: $('taskStatus').value, due_date: $('taskDate').value || null, due_time: $('taskTime').value || null, notes: $('taskNotes').value.trim() || null } : { status: $('taskStatus').value, notes: $('taskNotes').value.trim() || null };
  setBusy('A guardar…'); const result = id ? await supabase.from('tasks').update(payload).eq('id', id) : await supabase.from('tasks').insert(payload);
  if (result.error) { toast(result.error.message, true); setSynced(); return; } $('taskDialog').close(); toast('Tarefa guardada.'); await refreshData();
}
async function deleteTask() { const id = $('taskId').value; if (!id || !confirm('Eliminar definitivamente esta tarefa?')) return; const { error } = await supabase.from('tasks').delete().eq('id', id); if (error) { toast(error.message, true); return; } $('taskDialog').close(); toast('Tarefa eliminada.'); await refreshData(); }

async function loadAttachments(taskId) { const { data, error } = await supabase.from('task_attachments').select('*').eq('task_id', taskId).order('created_at', { ascending: false }); if (error) return; $('attachmentList').innerHTML = (data || []).length ? data.map((a) => `<div class="attachment-item"><button class="btn small" data-path="${escapeHtml(a.storage_path)}">Abrir</button> ${escapeHtml(a.file_name)} <small>${Math.round((a.file_size || 0) / 1024)} KB</small></div>`).join('') : '<div class="empty">Sem anexos</div>'; $('attachmentList').querySelectorAll('button').forEach((button) => { button.onclick = async () => { const { data: signed, error: signError } = await supabase.storage.from('task-evidence').createSignedUrl(button.dataset.path, 60); if (signError) { toast(signError.message, true); return; } window.open(signed.signedUrl, '_blank', 'noopener'); }; }); }
async function uploadAttachment() { const taskId = $('taskId').value; const file = $('attachmentFile').files[0]; if (!taskId || !file) { toast('Seleciona um ficheiro.', true); return; } if (file.size > 6291456) { toast('O ficheiro excede 6 MB.', true); return; } const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_'); const path = `${taskId}/${crypto.randomUUID()}-${safeName}`; setBusy('A carregar anexo…'); let result = await supabase.storage.from('task-evidence').upload(path, file); if (result.error) { setSynced(); toast(result.error.message, true); return; } result = await supabase.from('task_attachments').insert({ task_id: taskId, file_name: file.name, storage_path: path, mime_type: file.type, file_size: file.size }); if (result.error) { setSynced(); toast(result.error.message, true); return; } $('attachmentFile').value = ''; toast('Anexo carregado.'); await loadAttachments(taskId); setSynced(); }
async function loadAudit(taskId) { const { data, error } = await supabase.from('task_events').select('*').eq('task_id', taskId).order('created_at', { ascending: false }); if (error) return; $('auditList').innerHTML = (data || []).map((event) => `<div class="audit-item"><strong>${event.action === 'created' ? 'Tarefa criada' : 'Tarefa atualizada'}</strong>${event.old_status !== event.new_status ? ` — ${event.old_status ? statusMap[event.old_status] : '—'} → ${statusMap[event.new_status]}` : ''}<br><small>${new Intl.DateTimeFormat('pt-PT', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(event.created_at))}</small></div>`).join('') || '<div class="empty">Sem histórico</div>'; }

async function openPeople() { await refreshData(); $('peopleList').innerHTML = state.profiles.map((p) => `<div class="person-row"><div><strong>${escapeHtml(p.full_name || p.email)}</strong><br><small>${escapeHtml(p.email)} · ${p.role === 'admin' ? 'Administrador' : 'Colaborador'} · ${p.active ? 'Ativo' : 'Inativo'}</small></div><button class="btn small" data-user="${p.id}" data-active="${!p.active}">${p.active ? 'Desativar' : 'Ativar'}</button></div>`).join(''); $('peopleList').querySelectorAll('button').forEach((button) => { button.onclick = async () => { const { error } = await supabase.from('profiles').update({ active: button.dataset.active === 'true' }).eq('id', button.dataset.user); if (error) { toast(error.message, true); return; } await openPeople(); }; }); $('inviteList').innerHTML = state.invitations.filter((i) => !i.accepted_at).map((i) => `<div class="person-row"><div><strong>${escapeHtml(i.full_name)}</strong><br><small>${escapeHtml(i.email)} · ${i.role}</small></div></div>`).join('') || '<div class="empty">Sem convites pendentes</div>'; }
async function createInvite() { const email = $('inviteEmail').value.trim().toLowerCase(); const full_name = $('inviteName').value.trim(); if (!email || !full_name) { toast('Preenche nome e email.', true); return; } const { error } = await supabase.from('invitations').upsert({ email, full_name, department: $('inviteDepartment').value.trim() || null, role: $('inviteRole').value }, { onConflict: 'email' }); if (error) { toast(error.message, true); return; } ['inviteEmail', 'inviteName', 'inviteDepartment'].forEach((id) => { $(id).value = ''; }); toast('Email autorizado.'); await openPeople(); }
function exportCsv() { const rows = [['Tarefa', 'Responsável', 'Atribuída a', 'Prioridade', 'Estado', 'Data limite', 'Hora', 'Observações'], ...state.tasks.map((task) => [task.title, profileName(task.created_by), profileName(task.assignee_id), priorityMap[task.priority], statusMap[task.status], task.due_date || '', (task.due_time || '').slice(0, 5), task.notes || ''])]; const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(';')).join('\n'); const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' })); link.download = `tarefas_${localDate()}.csv`; link.click(); URL.revokeObjectURL(link.href); }

$('loginTab').onclick = () => { $('loginPanel').classList.remove('hidden'); $('registerPanel').classList.add('hidden'); $('loginTab').classList.add('active'); $('registerTab').classList.remove('active'); };
$('registerTab').onclick = () => { $('registerPanel').classList.remove('hidden'); $('loginPanel').classList.add('hidden'); $('registerTab').classList.add('active'); $('loginTab').classList.remove('active'); };
$('loginBtn').onclick = async () => { setMessage('loginMessage', ''); const { data, error } = await supabase.auth.signInWithPassword({ email: $('loginEmail').value.trim(), password: $('loginPassword').value }); if (error) { setMessage('loginMessage', error.message); return; } await enterApp(data.session); };
$('registerBtn').onclick = async () => { const email = $('registerEmail').value.trim().toLowerCase(); const password = $('registerPassword').value; const full_name = $('registerName').value.trim(); if (password.length < 8) { setMessage('registerMessage', 'A palavra-passe deve ter pelo menos 8 caracteres.'); return; } const { data: invite, error: inviteError } = await supabase.rpc('is_email_invited', { candidate_email: email }); if (inviteError) { setMessage('registerMessage', 'Não foi possível validar o convite. Tenta novamente.'); return; } if (!invite) { setMessage('registerMessage', 'Este email ainda não foi autorizado.'); return; } const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name } } }); if (error) { setMessage('registerMessage', error.message); return; } setMessage('registerMessage', 'Conta criada. Confirma o email e depois entra.', true); };
$('addTaskBtn').onclick = openNewTask; $('mobileAddBtn').onclick = openNewTask; $('saveTaskBtn').onclick = saveTask; $('deleteTaskBtn').onclick = deleteTask; $('uploadAttachmentBtn').onclick = uploadAttachment; $('peopleBtn').onclick = () => { $('peopleDialog').showModal(); openPeople(); }; $('refreshPeopleBtn').onclick = openPeople; $('createInviteBtn').onclick = createInvite; $('exportCsvBtn').onclick = exportCsv; $('refreshBtn').onclick = refreshData; $('logoutBtn').onclick = async () => { await supabase.auth.signOut(); location.reload(); }; $('menuBtn').onclick = () => { $('sidebar').classList.toggle('open'); };
$('resetFiltersBtn').onclick = () => { $('searchInput').value = ''; $('personFilter').value = ''; $('priorityFilter').value = ''; render(); };
['searchInput', 'personFilter', 'priorityFilter'].forEach((id) => { $(id).oninput = render; $(id).onchange = render; });
document.querySelectorAll('[data-close]').forEach((button) => { button.onclick = () => $(button.dataset.close).close(); });
$('nav').querySelectorAll('button').forEach((button) => { button.onclick = () => { state.view = button.dataset.view; $('nav').querySelectorAll('button').forEach((item) => item.classList.remove('active')); button.classList.add('active'); const labels = { all: 'Todas as tarefas', today: 'Para hoje', late: 'Em atraso', critical: 'Críticas', completed: 'Concluídas' }; $('pageTitle').textContent = labels[state.view]; $('sidebar').classList.remove('open'); render(); }; });
supabase?.auth.onAuthStateChange(async (event, session) => { if (event === 'SIGNED_IN' && session && !state.profile) await enterApp(session); if (event === 'SIGNED_OUT') showAuth(); });
boot();