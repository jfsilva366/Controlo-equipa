(() => {
  function isAdminView() {
    return document.body.classList.contains('admin-collaborator-sections');
  }

  function openTaskForEditing(taskId) {
    const allTasksButton = document.querySelector('#nav button[data-view="all"]');
    if (allTasksButton) allTasksButton.click();

    const card = document.querySelector(`.task-card[data-id="${CSS.escape(taskId)}"]`);
    if (card) {
      card.click();
      return;
    }

    const toast = document.getElementById('toast');
    if (toast) {
      toast.textContent = 'Não foi possível abrir a tarefa. Atualiza a página e tenta novamente.';
      toast.className = 'toast show error';
      window.setTimeout(() => { toast.className = 'toast'; }, 3500);
    }
  }

  function enhanceAdminTasks() {
    if (!isAdminView()) return;

    document.querySelectorAll('.workflow-task-detail').forEach((row) => {
      if (row.dataset.adminEditable === 'true') return;
      row.dataset.adminEditable = 'true';
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');
      row.title = 'Abrir e editar tarefa';

      const main = row.querySelector('.workflow-task-main');
      if (main && !row.querySelector('.admin-edit-task')) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn small primary admin-edit-task';
        button.textContent = 'Editar tarefa';
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          openTaskForEditing(row.dataset.taskId);
        });
        main.appendChild(button);
      }

      row.addEventListener('click', () => openTaskForEditing(row.dataset.taskId));
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openTaskForEditing(row.dataset.taskId);
        }
      });
    });
  }

  const observer = new MutationObserver(enhanceAdminTasks);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  enhanceAdminTasks();
})();