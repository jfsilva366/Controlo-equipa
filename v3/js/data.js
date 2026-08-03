import { supabase, state, isAdmin, toast } from './core.js';

export async function loadProfile(session){
  state.session = session;
  const { data, error } = await supabase.from('profiles').select('*').eq('id',session.user.id).single();
  if(error || !data?.active) return null;
  state.profile = data;
  return data;
}

export async function refreshData(){
  const taskQuery = supabase.from('tasks').select('*').order('created_at',{ascending:false});
  const profileQuery = supabase.from('profiles').select('*').order('full_name');
  const overtimeQuery = supabase.from('overtime_entries').select('*').order('work_date',{ascending:false});
  const [tasks, profiles, overtime] = await Promise.all([taskQuery, profileQuery, overtimeQuery]);
  if(tasks.error || profiles.error || overtime.error){
    toast('Erro ao sincronizar dados.');
    return false;
  }
  state.tasks = tasks.data || [];
  state.profiles = profiles.data || [state.profile];
  state.overtime = overtime.data || [];
  return true;
}

export function subscribeRealtime(onChange){
  return supabase.channel('atlas-foundation-live')
    .on('postgres_changes',{event:'*',schema:'public',table:'tasks'},onChange)
    .on('postgres_changes',{event:'*',schema:'public',table:'profiles'},onChange)
    .on('postgres_changes',{event:'*',schema:'public',table:'overtime_entries'},onChange)
    .subscribe();
}

export async function saveTask(payload,id){
  return id
    ? supabase.from('tasks').update(payload).eq('id',id)
    : supabase.from('tasks').insert(payload);
}

export async function saveGlobalTasks(rows){
  return supabase.from('tasks').insert(rows);
}

export async function deleteTaskRecord(task){
  let query = supabase.from('tasks').delete();
  query = task?.task_scope==='global' && task.global_group_id
    ? query.eq('global_group_id',task.global_group_id)
    : query.eq('id',task.id);
  return query;
}

export async function saveOvertime(payload,id){
  return id
    ? supabase.from('overtime_entries').update(payload).eq('id',id)
    : supabase.from('overtime_entries').insert(payload);
}

export async function deleteOvertimeRecord(id){
  return supabase.from('overtime_entries').delete().eq('id',id);
}

export async function inviteUser(payload){
  return supabase.functions.invoke('invite-team-member',{body:payload});
}

export async function setUserActive(id,active){
  if(!isAdmin()) return {error:new Error('Sem permissão.')};
  return supabase.from('profiles').update({active}).eq('id',id);
}
