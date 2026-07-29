import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const cfg = window.APP_CONFIG || {};
const APP_URL = 'https://controlo-equipa-logistica.netlify.app/';
const supabase = createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
const $ = (id) => document.getElementById(id);

function showToast(message, error = false) {
  const el = $('toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast show${error ? ' error' : ''}`;
  clearTimeout(el._inviteTimer);
  el._inviteTimer = setTimeout(() => { el.className = 'toast'; }, 4000);
}

function showActivationPanel() {
  $('loginPanel')?.classList.add('hidden');
  $('registerPanel')?.classList.remove('hidden');
  $('loginTab')?.classList.remove('active');
  $('registerTab')?.classList.remove('hidden');
  $('registerTab')?.classList.add('active');
}

const inviteButton = $('createInviteBtn');
if (inviteButton) {
  inviteButton.textContent = 'Criar acesso e enviar convite';
  inviteButton.onclick = async () => {
    const email = $('inviteEmail').value.trim().toLowerCase();
    const full_name = $('inviteName').value.trim();
    const department = $('inviteDepartment').value.trim() || null;
    const role = $('inviteRole').value;
    if (!email || !full_name) {
      showToast('Preenche o nome e o email.', true);
      return;
    }

    inviteButton.disabled = true;
    inviteButton.textContent = 'A enviar convite…';
    const { data, error } = await supabase.functions.invoke('invite-team-member', {
      body: { email, full_name, department, role, redirect_to: APP_URL }
    });
    inviteButton.disabled = false;
    inviteButton.textContent = 'Criar acesso e enviar convite';

    if (error || data?.error) {
      showToast(data?.error || error?.message || 'Não foi possível criar o acesso.', true);
      return;
    }

    ['inviteEmail', 'inviteName', 'inviteDepartment'].forEach((id) => { $(id).value = ''; });
    showToast(`Convite enviado para ${email}.`);
    $('refreshPeopleBtn')?.click();
  };
}

const registerTab = $('registerTab');
if (registerTab) registerTab.classList.add('hidden');

const registerPanel = $('registerPanel');
if (registerPanel) {
  const note = registerPanel.querySelector('.access-note');
  if (note) note.textContent = 'Define uma palavra-passe para concluir a ativação do acesso.';
  $('registerName')?.closest('.field')?.classList.add('hidden');
  $('registerEmail')?.closest('.field')?.classList.add('hidden');
  const passwordLabel = $('registerPassword')?.closest('.field')?.querySelector('label');
  if (passwordLabel) passwordLabel.textContent = 'Nova palavra-passe';
  if ($('registerBtn')) $('registerBtn').textContent = 'Definir palavra-passe e entrar';
}

if ($('registerBtn')) {
  $('registerBtn').onclick = async () => {
    const password = $('registerPassword').value;
    const msg = $('registerMessage');
    if (password.length < 8) {
      if (msg) msg.textContent = 'A palavra-passe deve ter pelo menos 8 caracteres.';
      return;
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      if (msg) msg.textContent = error.message;
      return;
    }
    showToast('Palavra-passe definida. Já podes utilizar a aplicação.');
    history.replaceState({}, '', location.pathname);
    location.reload();
  };
}

const loginButton = $('loginBtn');
if (loginButton && !$('forgotPasswordBtn')) {
  const forgotButton = document.createElement('button');
  forgotButton.id = 'forgotPasswordBtn';
  forgotButton.type = 'button';
  forgotButton.className = 'btn block';
  forgotButton.style.marginTop = '10px';
  forgotButton.textContent = 'Definir ou recuperar palavra-passe';
  loginButton.insertAdjacentElement('afterend', forgotButton);

  forgotButton.onclick = async () => {
    const email = $('loginEmail')?.value.trim().toLowerCase();
    if (!email) {
      const msg = $('loginMessage');
      if (msg) msg.textContent = 'Introduz primeiro o email do colaborador.';
      return;
    }
    forgotButton.disabled = true;
    forgotButton.textContent = 'A enviar email…';
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: APP_URL });
    forgotButton.disabled = false;
    forgotButton.textContent = 'Definir ou recuperar palavra-passe';
    const msg = $('loginMessage');
    if (error) {
      if (msg) msg.textContent = error.message;
      return;
    }
    if (msg) {
      msg.textContent = 'Email enviado. Abre o link recebido para definir a palavra-passe.';
      msg.classList.add('success');
    }
  };
}

async function removeUser(userId, displayName) {
  if (!confirm(`Remover definitivamente o acesso de ${displayName}? Esta ação não pode ser anulada.`)) return;
  const { data, error } = await supabase.functions.invoke('remove-team-member', {
    body: { user_id: userId }
  });
  if (error || data?.error) {
    showToast(data?.error || error?.message || 'Não foi possível remover o utilizador.', true);
    return;
  }
  showToast('Utilizador removido definitivamente.');
  $('refreshPeopleBtn')?.click();
}

function addRemoveButtons() {
  const list = $('peopleList');
  if (!list) return;
  list.querySelectorAll('.person-row').forEach((row) => {
    if (row.dataset.removeReady === 'true') return;
    const toggle = row.querySelector('[data-toggle-user]');
    if (!toggle) return;
    row.dataset.removeReady = 'true';
    if (toggle.disabled) return;

    const userId = toggle.dataset.toggleUser;
    const displayName = row.querySelector('strong')?.textContent?.trim() || 'este utilizador';
    const actions = row.querySelector('.person-actions') || row;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn small danger';
    button.textContent = 'Remover';
    button.dataset.removeUser = userId;
    button.onclick = () => removeUser(userId, displayName);
    actions.appendChild(button);
  });
}

const peopleList = $('peopleList');
if (peopleList) {
  new MutationObserver(addRemoveButtons).observe(peopleList, { childList: true, subtree: true });
  addRemoveButtons();
}

const inviteInUrl = location.hash.includes('type=invite') || location.hash.includes('type=recovery') || new URLSearchParams(location.search).has('code');
if (inviteInUrl) window.setTimeout(showActivationPanel, 250);

supabase.auth.onAuthStateChange((event, session) => {
  if ((event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') && session && inviteInUrl) {
    window.setTimeout(showActivationPanel, 100);
  }
});
