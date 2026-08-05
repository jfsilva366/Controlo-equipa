import { $, supabase, state, STATUS, VIEW_META, isAdmin, today, initials, profileName, toast, showScreen } from './js/core.js';
import { loadProfile, refreshData, subscribeRealtime, saveTask, saveGlobalTasks, deleteTaskRecord, saveOvertime, deleteOvertimeRecord, inviteUser, setUserActive } from './js/data.js';
import { renderAll, visibleTasks } from './js/render.js';

function setView(view){
  state.view=view;
  const [title,subtitle]=VIEW_META[view]||VIEW_META.dashboard;
  $('pageTitle').textContent=title;
  $('pageSubtitle').textContent=subtitle;
  document.querySelectorAll('.view').forEach(element=>element.classList.toggle('hidden',element.id!==`${view}View`));
  document.querySelectorAll('[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===view));
  const showTaskAction=view==='tasks'&&isAdmin();
  $('newTaskBtn').classList.toggle('hidden',!showTaskAction);
  $('mobileAddBtn').classList.toggle('hidden',!showTaskAction);
}

async function refreshAndRender(){
  if(await refreshData()){
    renderAll();
    bindDynamicEvents();
  }
}

async function enter(session){
  const profile=await loadProfile(session);
  if(!profile){
    await supabase.auth.signOut();
    showScreen('login');
    $('loginError').textContent='Acesso indisponível.';
    return;
  }
  $('profileName').textContent=profile.full_name||profile.email;
  $('profileRole').textContent=profile.role==='admin'?'Administrador':'Colaborador';
  $('avatar').textContent=initials(profile.full_name||profile.email);
  $('greeting').textContent=`Bom dia, ${(profile.full_name||profile.email).split(' ')[0]}.`;
  $('currentDate').textContent=new Intl.DateTimeFormat('pt-PT',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
  document.querySelectorAll('.admin-only').forEach(element=>element.classList.toggle('hidden',!isAdmin()));
  showScreen('app');
  setView('dashboard');
  await refreshAndRender();
  subscribeRealtime(refreshAndRender);
}

async function boot(){
  if(!window.APP_CONFIG?.supabaseUrl||!window.APP_CONFIG?.supabasePublishableKey){
    showScreen('login');
    $('loginError').textContent='Configuração Supabase em falta.';
    return;
  }
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) return showScreen('login');
  await enter(session);
}

function departments(){
  return [...new Set(state.profiles.map(profile=>profile.department).filter(Boolean).concat(state.tasks.map(task=>task.area).filter(Boolean)))].sort();
}
function populateTaskOptions(){
  const people=state.profiles.filter(profile=>profile.active&&profile.role==='collaborator');
  $('taskPerson').innerHTML=people.map(person=>`<option value="${person.id}">${person.full_name||person.email}</option>`).join('');
  const list=departments();
  $('taskDepartment').innerHTML=(list.length?list:['Logística']).map(department=>`<option value="${department}">${department}</option>`).join('');
}
function setScope(scope){
  $('taskScope').value=scope;
  document.querySelectorAll('[data-scope]').forEach(button=>button.classList.toggle('active',button.dataset.scope===scope));
  $('personField').classList.toggle('hidden',scope==='global');
}
function resetTaskForm(){
  $('taskId').value='';
  $('taskTitle').value='';
  $('taskPriority').value='medium';
  $('taskDate').value=today();
  $('taskStatus').value='todo';
  $('taskOwner').value=state.profile.full_name||state.profile.email;
  $('dialogTitle').textContent='Nova tarefa';
  $('deleteTaskBtn').classList.add('hidden');
  $('validationActions').classList.add('hidden');
  $('saveTaskBtn').classList.remove('hidden');
  setScope('individual');
}
function openNewTask(){
  resetTaskForm();
  populateTaskOptions();
  ['taskTitle','taskPerson','taskDepartment','taskPriority','taskDate','taskStatus'].forEach(id=>$(id).disabled=false);
  document.querySelector('.type-switch').classList.remove('hidden');
  $('taskDialog').showModal();
}
function openTask(id){
  const task=state.tasks.find(item=>item.id===id);
  if(!task)return;
  resetTaskForm();
  populateTaskOptions();
  $('taskId').value=task.id;
  $('taskTitle').value=task.title||'';
  $('taskPerson').value=task.assignee_id||'';
  $('taskDepartment').value=task.area||departments()[0]||'Logística';
  $('taskPriority').value=task.priority||'medium';
  $('taskDate').value=task.due_date||today();
  $('taskStatus').value=task.status||'todo';
  $('taskOwner').value=profileName(task.created_by);
  $('dialogTitle').textContent=task.title;
  setScope(task.task_scope||'individual');
  document.querySelector('.type-switch').classList.add('hidden');
  $('deleteTaskBtn').classList.toggle('hidden',!isAdmin());
  $('validationActions').classList.toggle('hidden',!(isAdmin()&&task.status==='review'));
  const editable=isAdmin();
  ['taskTitle','taskPerson','taskDepartment','taskPriority','taskDate'].forEach(field=>$(field).disabled=!editable);
  if(!isAdmin()){
    const allowed=task.status==='todo'?['todo','in_progress']:task.status==='in_progress'?['in_progress','review']:[task.status];
    [...$('taskStatus').options].forEach(option=>option.disabled=!allowed.includes(option.value));
  } else {
    [...$('taskStatus').options].forEach(option=>option.disabled=false);
  }
  $('taskDialog').showModal();
}

async function submitTask(){
  const id=$('taskId').value;
  const common={title:$('taskTitle').value.trim(),area:$('taskDepartment').value,priority:$('taskPriority').value,due_date:$('taskDate').value,status:$('taskStatus').value};
  if(!common.title)return toast('Indica a tarefa.');
  if(!isAdmin()){
    const current=state.tasks.find(task=>task.id===id);
    const allowed=current.status==='todo'&&common.status==='in_progress'||current.status==='in_progress'&&common.status==='review'||current.status===common.status;
    if(!allowed)return toast('Transição de estado não permitida.');
    const payload={status:common.status,completed_at:common.status==='review'?new Date().toISOString():null};
    const {error}=await saveTask(payload,id);
    if(error)return toast(error.message);
  } else if(id){
    const payload={...common,assignee_id:$('taskPerson').value};
    if(common.status==='done')payload.validated_by=state.profile.id;
    const {error}=await saveTask(payload,id);
    if(error)return toast(error.message);
  } else if($('taskScope').value==='global'){
    const people=state.profiles.filter(profile=>profile.active&&profile.role==='collaborator');
    if(!people.length)return toast('Não existem colaboradores ativos.');
    const group=crypto.randomUUID();
    const rows=people.map(person=>({...common,assignee_id:person.id,created_by:state.profile.id,task_scope:'global',global_group_id:group}));
    const {error}=await saveGlobalTasks(rows);
    if(error)return toast(error.message);
  } else {
    const {error}=await saveTask({...common,assignee_id:$('taskPerson').value,created_by:state.profile.id,task_scope:'individual'});
    if(error)return toast(error.message);
  }
  $('taskDialog').close();
  toast('Tarefa guardada.');
  await refreshAndRender();
}
async function validateTask(valid){
  const id=$('taskId').value;
  const payload=valid?{status:'done',validated_by:state.profile.id}:{status:'in_progress',validated_by:null,completed_at:null};
  const {error}=await saveTask(payload,id);
  if(error)return toast(error.message);
  $('taskDialog').close();
  toast(valid?'Tarefa validada.':'Tarefa devolvida para execução.');
  await refreshAndRender();
}
async function deleteTask(){
  const task=state.tasks.find(item=>item.id===$('taskId').value);
  if(!task||!confirm('Eliminar esta tarefa?'))return;
  const {error}=await deleteTaskRecord(task);
  if(error)return toast(error.message);
  $('taskDialog').close();
  toast('Tarefa eliminada.');
  await refreshAndRender();
}

function populateOvertimePeople(){
  const people=state.profiles.filter(profile=>profile.active&&profile.role==='collaborator');
  $('overtimePerson').innerHTML=people.map(person=>`<option value="${person.id}">${person.full_name||person.email}</option>`).join('');
}
function openNewOvertime(){
  populateOvertimePeople();
  $('overtimeId').value='';
  $('overtimePerson').value=isAdmin()?(state.profiles.find(profile=>profile.role==='collaborator'&&profile.active)?.id||''):state.profile.id;
  $('overtimeDate').value=today();
  $('overtimeHours').value='';
  $('overtimeWork').value='';
  $('overtimeStatus').value='Pendente';
  $('overtimeReviewActions').classList.add('hidden');
  $('deleteOvertimeBtn').classList.add('hidden');
  $('overtimeDialog').showModal();
}
function openOvertime(id){
  const item=state.overtime.find(entry=>entry.id===id);if(!item)return;
  populateOvertimePeople();
  $('overtimeId').value=item.id;
  $('overtimePerson').value=item.employee_id;
  $('overtimeDate').value=item.work_date;
  $('overtimeHours').value=item.hours;
  $('overtimeWork').value=item.work_done;
  $('overtimeStatus').value=item.status==='approved'?'Aprovada':item.status==='rejected'?'Rejeitada':'Pendente';
  $('overtimeReviewActions').classList.toggle('hidden',!(isAdmin()&&item.status==='pending'));
  $('deleteOvertimeBtn').classList.toggle('hidden',!isAdmin());
  $('overtimePerson').disabled=!isAdmin();
  $('overtimeDialog').showModal();
}
async function submitOvertime(){
  const id=$('overtimeId').value;
  const employeeId=isAdmin()?$('overtimePerson').value:state.profile.id;
  const payload={employee_id:employeeId,work_date:$('overtimeDate').value,hours:Number($('overtimeHours').value),work_done:$('overtimeWork').value.trim(),created_by:state.profile.id};
  if(!payload.hours||!payload.work_done)return toast('Preenche as horas e o trabalho realizado.');
  if(!id)payload.status='pending';
  const {error}=await saveOvertime(payload,id);
  if(error)return toast(error.message);
  $('overtimeDialog').close();toast('Registo guardado.');await refreshAndRender();
}
async function reviewOvertime(status){
  const id=$('overtimeId').value;
  const {error}=await saveOvertime({status,reviewed_by:state.profile.id,reviewed_at:new Date().toISOString()},id);
  if(error)return toast(error.message);
  $('overtimeDialog').close();toast(status==='approved'?'Horas extra aprovadas.':'Horas extra rejeitadas.');await refreshAndRender();
}
async function deleteOvertime(){
  const id=$('overtimeId').value;if(!id||!confirm('Eliminar este registo?'))return;
  const {error}=await deleteOvertimeRecord(id);if(error)return toast(error.message);
  $('overtimeDialog').close();toast('Registo eliminado.');await refreshAndRender();
}

async function submitUser(){
  const payload={full_name:$('userFullName').value.trim(),email:$('userEmail').value.trim(),department:$('userDepartment').value.trim(),role:$('userRole').value};
  const {data,error}=await inviteUser(payload);
  if(error||data?.error)return toast(data?.error||error.message);
  $('userDialog').close();$('userForm').reset();toast('Convite enviado.');await refreshAndRender();
}
async function toggleUser(id,active){
  const {error}=await setUserActive(id,!active);if(error)return toast(error.message);
  toast(active?'Utilizador desativado.':'Utilizador ativado.');await refreshAndRender();
}

function bindDynamicEvents(){
  document.querySelectorAll('[data-task-id]').forEach(element=>element.onclick=()=>openTask(element.dataset.taskId));
  document.querySelectorAll('[data-overtime-id]').forEach(element=>element.onclick=()=>openOvertime(element.dataset.overtimeId));
  document.querySelectorAll('[data-person]').forEach(button=>button.onclick=()=>{state.person=button.dataset.person;renderAll();bindDynamicEvents();});
  document.querySelectorAll('[data-toggle-user]').forEach(button=>button.onclick=()=>toggleUser(button.dataset.toggleUser,button.dataset.active==='true'));
}

$('loginForm').onsubmit=async event=>{event.preventDefault();$('loginError').textContent='';const{data,error}=await supabase.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error)return $('loginError').textContent='Email ou palavra-passe incorretos.';await enter(data.session)};
document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>setView(button.dataset.view));
document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{state.filter=button.dataset.filter;setView('tasks');renderAll();bindDynamicEvents();});
document.querySelectorAll('[data-scope]').forEach(button=>button.onclick=()=>setScope(button.dataset.scope));
document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>$(button.dataset.close).close());
$('newTaskBtn').onclick=$('mobileAddBtn').onclick=openNewTask;
$('taskForm').onsubmit=event=>{event.preventDefault();submitTask();};
$('validateTaskBtn').onclick=()=>validateTask(true);
$('rejectTaskBtn').onclick=()=>validateTask(false);
$('deleteTaskBtn').onclick=deleteTask;
$('newOvertimeBtn').onclick=openNewOvertime;
$('overtimeForm').onsubmit=event=>{event.preventDefault();submitOvertime();};
$('approveOvertimeBtn').onclick=()=>reviewOvertime('approved');
$('rejectOvertimeBtn').onclick=()=>reviewOvertime('rejected');
$('deleteOvertimeBtn').onclick=deleteOvertime;
$('inviteUserBtn').onclick=()=>$('userDialog').showModal();
$('userForm').onsubmit=event=>{event.preventDefault();submitUser();};
$('searchInput').oninput=event=>{state.search=event.target.value.trim();renderAll();bindDynamicEvents();};
$('themeBtn').onclick=()=>{document.body.classList.toggle('light');localStorage.setItem('atlas-theme',document.body.classList.contains('light')?'light':'dark');};
$('logoutBtn').onclick=async()=>{await supabase.auth.signOut();location.reload();};
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();state.installPrompt=event;$('installBtn').classList.remove('hidden');});
$('installBtn').onclick=async()=>{if(!state.installPrompt)return;state.installPrompt.prompt();await state.installPrompt.userChoice;state.installPrompt=null;$('installBtn').classList.add('hidden');};
if(localStorage.getItem('atlas-theme')==='light')document.body.classList.add('light');
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js'));
boot();
