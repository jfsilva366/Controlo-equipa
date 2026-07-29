import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const cfg = window.APP_CONFIG || {};
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
      body: {
        email,
        full_name,
        department,
        role,
        redirect_to: `${location.origin}/`
      }
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
  if (note) note.textContent = 'Define uma palavra-passe para concluir a ativação do acesso enviado pelo diretor.';
  const nameField = $('registerName')?.closest('.field');
  const emailField = $('registerEmail')?.closest('.field');
  nameField?.classList.add('hidden');
  emailField?.classList.add('hidden');
  const passwordLabel = $('registerPassword')?.closest('.field')?.querySelector('label');
  if (passwordLabel) passwordLabel.textContent = 'Nova palavra-passe';
  if ($('registerBtn')) $('registerBtn').textContent = 'Definir palavra-passe e entrar';
}

if ($('registerBtn')) {
  $('registerBtn').onclick = async () => {
    const password = $('registerPassword').value;
    if (password.length < 8) {
      const msg = $('registerMessage');
      if (msg) msg.textContent = 'A palavra-passe deve ter pelo menos 8 caracteres.';
      return;
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      const msg = $('registerMessage');
      if (msg) msg.textContent = error.message;
      return;
    }
    showToast('Acesso ativado. Já podes utilizar a aplicação.');
    history.replaceState({}, '', location.pathname);
    location.reload();
  };
}

const inviteInUrl = location.hash.includes('type=invite') || location.hash.includes('type=recovery') || new URLSearchParams(location.search).has('code');
if (inviteInUrl) {
  window.setTimeout(showActivationPanel, 250);
}

supabase.auth.onAuthStateChange((event, session) => {
  if ((event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') && session && inviteInUrl) {
    window.setTimeout(showActivationPanel, 100);
  }
});
