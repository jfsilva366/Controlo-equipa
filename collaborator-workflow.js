import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const cfg = window.APP_CONFIG || {};
const supabase = createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
  auth: { persistSession: true, autoRefreshToken: true }
});

const statusLabels = {
  todo: 'Por iniciar',
  in_progress: 'Em curso',
  review: 'Terminada — a validar',
  done: 'Validada'
};

const priorityLabels = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  critical: 'Crítica'
};

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[char]));

function formatDate(date, time) {
  if (!date) return 'Sem prazo';
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    ...(time ? { hour: '2-digit', minute: '2-digit' } : {})
  }).format(new Date(`${date}T${time || '12:00'}`));
}

function showToast(message, error = false) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast show${error ? ' error' : ''}`;
  clearTimeout(toast._workflowTimer);
  toast._workflowTimer = setTimeout(() => { toast.className = 'toast'; }, 3500);
}

function updateStatusWording() {
  const select = document.getElementById('taskStatus');
  if (select) {
    const review = select.querySelector('option[value="review"]');
    const done = select.querySelector('option[value="done"]');
    if (review) review.textContent = 'Terminada — a validar';
    if (done) done.textContent = 'Validada';
  }
}

function taskDetails(task, showAssignee = false, assigneeName = '') {
  const late = task.due_date && task.due_date < new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Lisbon' }).format(new Date()) && task.status !== 'done';
  return `<article class="workflow-task-detail" data-task-id="${task.id}">
    <div class="workflow-task-main">
      <strong>${escapeHtml(task.title)}</strong>
      <div class="workflow-task-meta">
        <span class="tag ${task.priority}">${priorityLabels[task.priority]}</span>
        <span class="workflow-status status-${task.status}">${statusLabels[task.status]}</span>
        <span class="${late ? 'late' : ''}">${formatDate(task.due_date, task.due_time)}</span>
      </div>
      ${showAssignee ? `<small>${escapeHtml(assigneeName)}</small>` : ''}
      ${task.notes ? `<p>${escapeHtml(task.notes)}</p>` : ''}
    </div>
  </article>`;
}

async function initialise() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, active')
    .eq('id', session.user.id)
    .single();

  updateStatusWording();
  if (!profile?.active) return;

  if (profile.role === 'collaborator') {
    await initialiseCollaborator(session);
  } else if (profile.role === 'admin') {
    await initialiseAdmin();
  }
}

async function initialiseCollaborator(session) {
  document.body.classList.add('collaborator-task-view');
  const title = document.getElementById('pageTitle');
  const subtitle = document.getElementById('pageSubtitle');
  if (title) title.textContent = 'As minhas tarefas';
  if (subtitle) subtitle.textContent = 'Consulta todas as tarefas e atualiza o estado de execução.';

  document.getElementById('personFilter')?.classList.add('hidden');
  document.getElementById('priorityFilter')?.classList.add('hidden');
  document.getElementById('resetFiltersBtn')?.classList.add('hidden');

  let tasks = [];
  let rendering = false;

  async function loadTasks() {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('assignee_id', session.user.id)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) {
      showToast(error.message, true);
      return;
    }
    tasks = data || [];
    renderTasks();
  }

  function actionFor(task) {
    if (task.status === 'todo') {
      return `<button class="btn small primary workflow-action" data-task-id="${task.id}" data-next-status="in_progress">Iniciar</button>`;
    }
    if (task.status === 'in_progress') {
      return `<button class="btn small primary workflow-action" data-task-id="${task.id}" data-next-status="review">Terminar tarefa</button>`;
    }
    if (task.status === 'review') return '<span class="workflow-waiting">A aguardar validação</span>';
    return '<span class="workflow-validated">Validada</span>';
  }

  function renderTasks() {
    const board = document.getElementById('board');
    if (!board) return;
    rendering = true;

    const search = document.getElementById('searchInput')?.value.trim().toLowerCase() || '';
    const visible = tasks.filter((task) => [task.title, task.notes, statusLabels[task.status]]
      .join(' ').toLowerCase().includes(search));

    board.innerHTML = `<section class="collaborator-list">
      <div class="collaborator-list-head">
        <span>Tarefa</span><span>Prazo</span><span>Estado</span><span>Ação</span>
      </div>
      ${visible.length ? visible.map((task) => {
        const late = task.due_date && task.due_date < new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Lisbon' }).format(new Date()) && task.status !== 'done';
        return `<article class="collaborator-task-row">
          <div class="collaborator-task-main">
            <strong>${escapeHtml(task.title)}</strong>
            <div><span class="tag ${task.priority}">${priorityLabels[task.priority]}</span>${task.notes ? `<small>${escapeHtml(task.notes)}</small>` : ''}</div>
          </div>
          <div class="collaborator-task-deadline ${late ? 'late' : ''}">${formatDate(task.due_date, task.due_time)}</div>
          <div><span class="workflow-status status-${task.status}">${statusLabels[task.status]}</span></div>
          <div class="collaborator-task-action">${actionFor(task)}</div>
        </article>`;
      }).join('') : '<div class="empty">Sem tarefas para apresentar.</div>'}
    </section>`;

    board.querySelectorAll('.workflow-action').forEach((button) => {
      button.addEventListener('click', async () => {
        button.disabled = true;
        const nextStatus = button.dataset.nextStatus;
        button.textContent = nextStatus === 'in_progress' ? 'A iniciar…' : 'A terminar…';
        const { error } = await supabase
          .from('tasks')
          .update({ status: nextStatus })
          .eq('id', button.dataset.taskId)
          .eq('assignee_id', session.user.id);

        if (error) {
          showToast(error.message, true);
          button.disabled = false;
          button.textContent = nextStatus === 'in_progress' ? 'Iniciar' : 'Terminar tarefa';
          return;
        }
        showToast(nextStatus === 'in_progress' ? 'Tarefa iniciada.' : 'Tarefa terminada e enviada para validação.');
        await loadTasks();
      });
    });

    requestAnimationFrame(() => { rendering = false; });
  }

  document.getElementById('searchInput')?.addEventListener('input', renderTasks);
  const board = document.getElementById('board');
  if (board) {
    new MutationObserver(() => {
      if (!rendering && !board.querySelector('.collaborator-list')) renderTasks();
    }).observe(board, { childList: true });
  }

  supabase.channel(`collaborator-workflow-${session.user.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `assignee_id=eq.${session.user.id}` }, loadTasks)
    .subscribe();

  await loadTasks();
}

async function initialiseAdmin() {
  document.body.classList.add('admin-collaborator-sections');
  let profiles = [];
  let tasks = [];
  let rendering = false;
  const openSections = new Set();

  async function loadAdminData() {
    const [{ data: profileData, error: profileError }, { data: taskData, error: taskError }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, active, role').eq('role', 'collaborator').order('full_name'),
      supabase.from('tasks').select('*').order('due_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false })
    ]);
    if (profileError || taskError) {
      showToast((profileError || taskError).message, true);
      return;
    }
    profiles = profileData || [];
    tasks = taskData || [];
    renderAdminSections();
  }

  function renderAdminSections() {
    const board = document.getElementById('board');
    if (!board) return;
    rendering = true;
    const query = document.getElementById('searchInput')?.value.trim().toLowerCase() || '';
    const priority = document.getElementById('priorityFilter')?.value || '';

    const sections = profiles.map((person) => {
      const personTasks = tasks.filter((task) => task.assignee_id === person.id)
        .filter((task) => !priority || task.priority === priority)
        .filter((task) => !query || [task.title, task.notes, statusLabels[task.status], person.full_name, person.email]
          .join(' ').toLowerCase().includes(query));
      const isOpen = openSections.has(person.id);
      return `<section class="admin-person-section ${isOpen ? 'open' : ''}">
        <button class="admin-person-header" type="button" data-person-id="${person.id}" aria-expanded="${isOpen}">
          <span>${escapeHtml(person.full_name || person.email)}</span>
          <span class="admin-person-count">${personTasks.length} ${personTasks.length === 1 ? 'tarefa' : 'tarefas'}</span>
          <span class="admin-person-chevron">⌄</span>
        </button>
        <div class="admin-person-tasks">
          ${personTasks.length ? personTasks.map((task) => taskDetails(task)).join('') : '<div class="empty">Sem tarefas para apresentar.</div>'}
        </div>
      </section>`;
    }).join('');

    board.innerHTML = `<div class="admin-person-list">${sections || '<div class="empty">Sem colaboradores ativos.</div>'}</div>`;

    board.querySelectorAll('.admin-person-header').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.personId;
        if (openSections.has(id)) openSections.delete(id); else openSections.add(id);
        renderAdminSections();
      });
    });

    board.querySelectorAll('.workflow-task-detail').forEach((row) => {
      row.addEventListener('click', () => {
        const card = document.querySelector(`.task-card[data-id="${row.dataset.taskId}"]`);
        if (card) card.click();
      });
    });

    requestAnimationFrame(() => { rendering = false; });
  }

  document.getElementById('searchInput')?.addEventListener('input', renderAdminSections);
  document.getElementById('priorityFilter')?.addEventListener('change', renderAdminSections);
  document.getElementById('personFilter')?.classList.add('hidden');

  const board = document.getElementById('board');
  if (board) {
    new MutationObserver(() => {
      if (!rendering && !board.querySelector('.admin-person-list')) renderAdminSections();
    }).observe(board, { childList: true });
  }

  supabase.channel('admin-collaborator-sections')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, loadAdminData)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, loadAdminData)
    .subscribe();

  await loadAdminData();
}

initialise();