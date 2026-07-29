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
  el._inviteTimer = setTimeout(() => { el.className = 'toast'; }, 4500);
}

async function getFunctionError(error, data, fallback) {
  if (data?.error) return data.error;
  const response = error?.context;
  if (response && typeof response.clone === 'function') {
    try {
      const payload = await response.clone().json();
      if (payload?.error) return payload.error;
      if (payload?.message) return payload.message;
    } catch {
      try {
        const text = await response.clone().text();
        if (text) return text;
      } catch { /* sem corpo legível */ }
    }
  }
  return error?.message || fallback;
}

function friendlyInviteError(message = '') {
  const normalized = message.toLowerCase();
  if (normalized.includes('rate limit') || normalized.includes('429')) {
    return 'Limite temporário de emails atingido. Aguarda alguns minutos e usa “Reenviar convite”.';
  }
  if (normalized.includes('already') || normalized.includes('registered')) {
    return 'Este email já tem uma conta criada. Usa a recuperação de palavra-passe.';
  }
  return message;
}

function showActivationPanel() {
  $('loginPanel')?.classList.add('hidden');
  $('registerPanel')?.classList.remove('hidden');
  $('loginTab')?.classList.remove('active');
  $('registerTab')?.classList.remove('hidden');
  $('registerTab')?.classList.add('active');
}

async function sendInvitation(payload, button) {
  const originalText = button?.textContent || '';
  if (button) {
    button.disabled = true;
    button.textContent = 'A enviar…';
  }

  const { data, error } = await supabase.functions.invoke('invite-team-member', {
    body: { ...payload, redirect_to: APP_URL }
  });

  if (button) {
    button.disabled = false;
    button.textContent = originalText;
  }

  if (error || data?.error) {
    const message = await getFunctionError(error, data, 'Não foi possível enviar o convite.');
    throw new Error(friendlyInviteError(message));
  }
  return data;
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

    try {
      await sendInvitation({ email, full_name, department, role }, inviteButton);
      ['inviteEmail', 'inviteName', 'inviteDepartment'].forEach((id) => { $(id).value = ''; });
      showToast(`Convite enviado para ${email}.`);
      $('refreshPeopleBtn')?.click();
    } catch (error) {
      showToast(error.message, true);
      $('refreshPeopleBtn')?.click();
    }
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

async function sendPasswordRecovery(email, button = null) {
  const originalText = button?.textContent || '';
  if (button) {
    button.disabled = true;
    button.textContent = 'A enviar…';
  }
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: APP_URL });
  if (button) {
    button.disabled = false;
    button.textContent = originalText;
  }
  if (error) throw error;
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
    try {
      await sendPasswordRecovery(email, forgotButton);
      const msg = $('loginMessage');
      if (msg) {
        msg.textContent = 'Email enviado. Abre o link recebido para definir a palavra-passe.';
        msg.classList.add('success');
      }
    } catch (error) {
      const msg = $('loginMessage');
      if (msg) msg.textContent = friendlyInviteError(error.message);
    }
  };
}

async function removeUser(userId, displayName) {
  if (!confirm(`Remover definitivamente o acesso de ${displayName}? Esta ação não pode ser anulada.`)) return;
  const { data, error } = await supabase.functions.invoke('remove-team-member', {
    body: { user_id: userId }
  });
  if (error || data?.error) {
    const message = await getFunctionError(error, data, 'Não foi possível remover o utilizador.');
    showToast(message, true);
    return;
  }
  showToast('Utilizador removido definitivamente.');
  $('refreshPeopleBtn')?.click();
}

function addUserActions() {
  const list = $('peopleList');
  if (!list) return;
  list.querySelectorAll('.person-row').forEach((row) => {
    const toggle = row.querySelector('[data-toggle-user]');
    if (!toggle || toggle.disabled) return;
    const userId = toggle.dataset.toggleUser;
    const displayName = row.querySelector('strong')?.textContent?.trim() || 'este utilizador';
    const email = row.querySelector('small')?.textContent?.split(' · ')[0]?.trim();
    const actions = row.querySelector('.person-actions') || row;

    if (!row.querySelector('[data-reset-user]') && email) {
      const resetButton = document.createElement('button');
      resetButton.type = 'button';
      resetButton.className = 'btn small';
      resetButton.textContent = 'Redefinir palavra-passe';
      resetButton.dataset.resetUser = email;
      resetButton.onclick = async () => {
        try {
          await sendPasswordRecovery(email, resetButton);
          showToast(`Email de redefinição enviado para ${email}.`);
        } catch (error) {
          showToast(friendlyInviteError(error.message), true);
        }
      };
      actions.appendChild(resetButton);
    }

    if (!row.querySelector('[data-remove-user]')) {
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'btn small danger';
      removeButton.textContent = 'Remover';
      removeButton.dataset.removeUser = userId;
      removeButton.onclick = () => removeUser(userId, displayName);
      actions.appendChild(removeButton);
    }
  });
}

function addPendingInviteActions() {
  const list = $('inviteList');
  if (!list) return;
  list.querySelectorAll('.person-row').forEach((row) => {
    if (row.querySelector('[data-resend-invite]')) return;
    const cancelButton = row.querySelector('[data-cancel-invite]');
    const email = row.querySelector('small')?.textContent?.split(' · ')[0]?.trim();
    const full_name = row.querySelector('strong')?.textContent?.trim();
    if (!cancelButton || !email || !full_name) return;

    const details = row.querySelector('small')?.textContent?.split(' · ') || [];
    const department = details[1] && details[1] !== 'Sem departamento' ? details[1] : null;
    const role = details[2] === 'Administrador' ? 'admin' : 'collaborator';
    const actions = row.querySelector('.person-actions') || row;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn small primary';
    button.textContent = 'Reenviar convite';
    button.dataset.resendInvite = email;
    button.onclick = async () => {
      try {
        await sendInvitation({ email, full_name, department, role }, button);
        showToast(`Novo convite enviado para ${email}.`);
        $('refreshPeopleBtn')?.click();
      } catch (error) {
        showToast(error.message, true);
      }
    };
    actions.insertBefore(button, actions.firstChild);
  });
}

function enhanceAccessLists() {
  addUserActions();
  addPendingInviteActions();
}

['peopleList', 'inviteList'].forEach((id) => {
  const list = $(id);
  if (!list) return;
  new MutationObserver(enhanceAccessLists).observe(list, { childList: true, subtree: true });
});
enhanceAccessLists();

const inviteInUrl = location.hash.includes('type=invite') || location.hash.includes('type=recovery') || new URLSearchParams(location.search).has('code');
if (inviteInUrl) window.setTimeout(showActivationPanel, 250);

supabase.auth.onAuthStateChange((event, session) => {
  if ((event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') && session && inviteInUrl) {
    window.setTimeout(showActivationPanel, 100);
  }
});
