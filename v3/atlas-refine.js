(() => {
  const byId = id => document.getElementById(id);

  function currentView() {
    const active = document.querySelector('[data-view].active');
    return active?.dataset.view || 'dashboard';
  }

  function syncPrimaryAction() {
    const tasksOpen = currentView() === 'tasks';
    const desktop = byId('newTaskBtn');
    const mobile = byId('mobileAddBtn');
    desktop?.classList.toggle('context-hidden', !tasksOpen);
    mobile?.classList.toggle('context-hidden', !tasksOpen);
  }

  document.addEventListener('click', event => {
    const viewButton = event.target.closest('[data-view]');
    if (viewButton) requestAnimationFrame(syncPrimaryAction);
  });

  const observer = new MutationObserver(syncPrimaryAction);
  document.querySelectorAll('[data-view]').forEach(button => {
    observer.observe(button, { attributes: true, attributeFilter: ['class'] });
  });

  window.addEventListener('DOMContentLoaded', syncPrimaryAction);
  window.addEventListener('pageshow', syncPrimaryAction);
  syncPrimaryAction();
})();
