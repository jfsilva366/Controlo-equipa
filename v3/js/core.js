import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const config = window.APP_CONFIG || {};
export const supabase = createClient(config.supabaseUrl, config.supabasePublishableKey, {
  auth: { persistSession: true, autoRefreshToken: true }
});

export const $ = id => document.getElementById(id);
export const state = {
  session: null,
  profile: null,
  profiles: [],
  tasks: [],
  overtime: [],
  view: 'dashboard',
  filter: 'active',
  person: 'all',
  search: '',
  installPrompt: null
};

export const STATUS = { todo:'Por iniciar', in_progress:'Em curso', review:'Concluído', done:'Validado' };
export const PRIORITY = { low:'Baixa', medium:'Média', high:'Alta', critical:'Crítica' };
export const OVERTIME_STATUS = { pending:'Pendente', approved:'Aprovada', rejected:'Rejeitada' };
export const VIEW_META = {
  dashboard:['Centro Operacional','A situação da operação, sem ruído.'],
  tasks:['Tarefas','Planeamento, execução e acompanhamento.'],
  calendar:['Calendário','Próximas tarefas e compromissos operacionais.'],
  overtime:['Horas Extra','Registo, aprovação e controlo mensal.'],
  validations:['Validações','Trabalho concluído a aguardar a tua decisão.'],
  team:['Equipa','Carga de trabalho e gestão de acessos.'],
  more:['Mais','Preferências e estado da aplicação.']
};

export const isAdmin = () => state.profile?.role === 'admin';
export const today = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Lisbon'}).format(new Date());
export const esc = (value='') => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const priorityScore = priority => ({critical:4,high:3,medium:2,low:1}[priority] || 0);
export const initials = (name='Atlas') => name.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase();
export const profileName = id => {
  const profile = state.profiles.find(item=>item.id===id);
  return profile?.full_name || profile?.email || 'Sem colaborador';
};
export const formatDate = date => {
  if (!date) return 'Sem data';
  if (date === today()) return 'Hoje';
  return new Intl.DateTimeFormat('pt-PT',{day:'2-digit',month:'short'}).format(new Date(`${date}T12:00:00`));
};
export const monthStart = () => `${today().slice(0,7)}-01`;
export const toast = message => {
  const element = $('toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(element._timer);
  element._timer = setTimeout(()=>element.classList.remove('show'),2800);
};
export const showScreen = id => ['loading','login','app'].forEach(item=>$(item).classList.toggle('hidden',item!==id));
