    function setScreen(screen){
      currentScreen=screen;
      $$('.screen').forEach(section=>section.classList.toggle('active',section.id===screen));
      $$('.bottom-nav button').forEach(btn=>btn.classList.toggle('active',btn.dataset.screen===screen));
      window.scrollTo({top:0,behavior:'smooth'});
    }

    function fillTaskForm(task=null){
      $("#taskId").value=task?.id||"";
      $("#taskArea").value=task?.area||"Trabalho";
      $("#taskTitle").value=task?.title||"";
      $("#taskDate").value=task?.date||selectedDate||todayISO();
      $("#taskTime").value=task?.time||"";
      $("#taskPriority").value=task?.priority||"Normal";
      $("#taskStatus").value=task?.status||"Por fazer";
      $("#taskRecurrence").value=task?.recurrence||"none";
      $("#taskNotes").value=task?.notes||"";
      $("#taskModalTitle").textContent=task?"Editar tarefa":"Nova tarefa";
      $("#saveTaskBtn").textContent=task?"Guardar alterações":"Criar tarefa";
      $("#deleteTaskBtn").style.display=task?"inline-flex":"none";
    }

    function openModal(taskId=null){
      const task=taskId?state.tasks.find(t=>t.id===taskId):null;
      fillTaskForm(task||null);
      $("#taskModal").classList.add("open");
      $("#taskModal").setAttribute("aria-hidden","false");
      setTimeout(()=>$("#taskTitle").focus(),80);
    }

    function closeModal(){
      $("#taskModal").classList.remove("open");
      $("#taskModal").setAttribute("aria-hidden","true");
      $("#taskForm").reset();
      fillTaskForm(null);
    }

    function saveTask(event){
      event.preventDefault();
      const id=$("#taskId").value;
      const existing=id?state.tasks.find(t=>t.id===id):null;
      const values={
        area:$("#taskArea").value,
        title:$("#taskTitle").value.trim(),
        date:$("#taskDate").value,
        time:$("#taskTime").value,
        priority:$("#taskPriority").value,
        status:$("#taskStatus").value,
        recurrence:$("#taskRecurrence").value,
        notes:$("#taskNotes").value.trim()
      };
      if(!values.title||!values.date)return;

      if(existing){
        const previousStatus=existing.status;
        Object.assign(existing,values,{updatedAt:Date.now()});
        existing.done=existing.status==="Concluída";
        if(existing.status==="Concluída"){
          if(previousStatus!=="Concluída") existing.completedAt=Date.now();
          spawnRecurringTask(existing);
        } else existing.completedAt=null;
      } else {
        const task={id:uid(),...values,done:values.status==="Concluída",parentId:null,recurrenceSpawned:false,createdAt:Date.now(),updatedAt:Date.now(),completedAt:values.status==="Concluída"?Date.now():null};
        state.tasks.push(task);
        if(task.status==="Concluída") spawnRecurringTask(task);
      }
      save(); closeModal(); render(); showToast(existing?"Tarefa atualizada":"Tarefa criada");
    }

    function deleteTask(id){
      const task=state.tasks.find(t=>t.id===id); if(!task)return;
      if(!confirm(`Apagar “${task.title}”?`))return;
      state.tasks=state.tasks.filter(t=>t.id!==id); save(); closeModal(); render(); showToast("Tarefa apagada");
    }

    function exportBackup(){
      const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
      const url=URL.createObjectURL(blob),a=document.createElement("a");
      a.href=url;a.download=`atlas_v31_backup_${todayISO()}.json`;a.click();URL.revokeObjectURL(url);
    }

    function importBackup(file){
      if(!file)return;
      const reader=new FileReader();
      reader.onload=()=>{try{state=normalize(JSON.parse(reader.result));save();render();showToast("Backup importado");}catch(error){alert("Não foi possível importar este ficheiro.");}};
      reader.readAsText(file);
    }

    function clearDone(){
      const done=state.tasks.filter(t=>t.status==="Concluída").length;
      if(!done){showToast("Não há tarefas concluídas");return;}
      if(!confirm(`Limpar ${done} tarefa(s) concluída(s)?`))return;
      state.tasks=state.tasks.filter(t=>t.status!=="Concluída");save();render();showToast("Concluídas removidas");
    }

    function resetData(){
      if(!confirm("Apagar todos os dados do Atlas?"))return;
      state=normalize({version:"3.1",theme:state.theme,tasks:[]});save();render();showToast("Dados apagados");
    }

    $$(".bottom-nav button,[data-screen]").forEach(btn=>btn.addEventListener("click",()=>setScreen(btn.dataset.screen)));
    $("#openTaskModal").addEventListener("click",()=>openModal());
    $("#closeTaskModal").addEventListener("click",closeModal);
    $("#deleteTaskBtn").addEventListener("click",()=>{const id=$("#taskId").value;if(id)deleteTask(id);});
    $("#taskModal").addEventListener("click",event=>{if(event.target.id==="taskModal")closeModal();});
    $("#taskForm").addEventListener("submit",saveTask);

    $("#prevMonth").addEventListener("click",()=>{calendarCursor.setMonth(calendarCursor.getMonth()-1);render();});
    $("#nextMonth").addEventListener("click",()=>{calendarCursor.setMonth(calendarCursor.getMonth()+1);render();});
    $("#themeDark").addEventListener("click",()=>{state.theme="dark";save();render();showToast("Modo escuro ativo");});
    $("#themeLight").addEventListener("click",()=>{state.theme="light";save();render();showToast("Modo claro ativo");});
    $("#exportData").addEventListener("click",exportBackup);
    $("#importData").addEventListener("change",event=>importBackup(event.target.files[0]));
    $("#clearDone").addEventListener("click",clearDone);
    $("#resetData").addEventListener("click",resetData);

    fillTaskForm(null);
    render();

    if("serviceWorker" in navigator){
      window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js").catch(error=>console.log("Service Worker não registado:",error)));
    }
