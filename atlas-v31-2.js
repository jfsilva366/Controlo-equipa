    function nextAction(){
      const active = tasksSorted(state.tasks.filter(task => task.status !== "Concluída" && task.status !== "Bloqueada"));
      return active[0] || tasksSorted(state.tasks.filter(task => task.status !== "Concluída"))[0] || null;
    }

    function renderHome(){
      const date = todayISO();
      const groups = [["workToday","Trabalho"],["personalToday","Pessoal"],["shopToday","Loja"]];
      groups.forEach(([id,area]) => {
        const tasks = activeTasksForDate(date, area);
        $("#"+id).innerHTML = tasks.length ? tasks.map(task => taskCard(task,true)).join("") : `<div class="empty">Sem tarefas para hoje.</div>`;
      });

      const todayTasks = activeTasksForDate(date);
      const critical = todayTasks.filter(t => t.priority === "Crítica").length;
      const overdue = overdueTasks().length;
      const doneToday = state.tasks.filter(t => t.status === "Concluída" && t.completedAt && dateISO(new Date(t.completedAt)) === date).length;
      $("#metricToday").textContent = todayTasks.length;
      $("#metricCritical").textContent = critical;
      $("#metricOverdue").textContent = overdue;
      $("#metricDone").textContent = doneToday;

      const next = nextAction();
      $("#nextActionBox").innerHTML = next ? `
        <div class="copy">
          <span>Próxima ação recomendada</span>
          <strong>${escapeHTML(next.title)}</strong>
          <small>${escapeHTML(next.area)} · ${formatDate(next.date)} · ${next.time || "Sem hora"} · ${escapeHTML(next.priority)}${isOverdue(next) ? " · ATRASADA" : ""}</small>
        </div>
        <button class="mini-btn primary" data-edit-task="${next.id}">Abrir</button>`
        : `<div class="copy"><span>Próxima ação</span><strong>Sem pendentes</strong><small>O dia está limpo.</small></div>`;

      $("#todayChip").textContent = new Date().toLocaleDateString("pt-PT", {weekday:"short",day:"2-digit",month:"short"});
    }

    function monthDays(cursor){
      const year = cursor.getFullYear(), month = cursor.getMonth();
      const first = new Date(year, month, 1);
      const startDay = (first.getDay()+6)%7;
      const start = new Date(year, month, 1-startDay);
      const days=[];
      for(let i=0;i<42;i++){
        const d=new Date(start); d.setDate(start.getDate()+i);
        days.push({date:dateISO(d),day:d.getDate(),inMonth:d.getMonth()===month});
      }
      return days;
    }

    function isCriticalDay(date){
      const tasks = tasksForDate(date).filter(task => task.status !== "Concluída");
      if(!tasks.length) return false;
      if(tasks.some(isOverdue)) return true;
      if(tasks.length >= 4) return true;
      return tasks.some(task => task.priority === "Crítica");
    }

    function renderCalendar(){
      $("#monthTitle").textContent = calendarCursor.toLocaleDateString("pt-PT", {month:"long",year:"numeric"});
      const weekday=["S","T","Q","Q","S","S","D"];
      const header=weekday.map(d=>`<div class="weekday">${d}</div>`).join("");
      const body=monthDays(calendarCursor).map(day=>{
        const tasks=tasksForDate(day.date).filter(task=>task.status!=="Concluída");
        const work=tasks.some(t=>t.area==="Trabalho"), personal=tasks.some(t=>t.area==="Pessoal"), shop=tasks.some(t=>t.area==="Loja");
        return `<button class="day ${day.inMonth?"":"muted"} ${day.date===todayISO()?"today":""} ${day.date===selectedDate?"selected":""} ${isCriticalDay(day.date)?"critical":""}" data-select-day="${day.date}">
          <strong>${day.day}</strong><span>${tasks.length?`${tasks.length} tarefa${tasks.length===1?"":"s"}`:""}</span>
          <div class="dot-row">${work?`<i class="dot work"></i>`:""}${personal?`<i class="dot personal"></i>`:""}${shop?`<i class="dot shop"></i>`:""}</div>
        </button>`;
      }).join("");
      $("#calendarGrid").innerHTML=header+body;
      $("#selectedDayTitle").textContent=formatFullDate(selectedDate);
      const selectedTasks=tasksForDate(selectedDate);
      $("#selectedDayTasks").innerHTML=selectedTasks.length?selectedTasks.map(task=>taskCard(task)).join(""):`<div class="empty">Não tens tarefas neste dia.</div>`;
      $$('[data-select-day]').forEach(btn=>btn.addEventListener('click',()=>{selectedDate=btn.dataset.selectDay;render();}));
    }

    function overdueText(task){
      const due = taskDueDate(task);
      const diff = Date.now() - due.getTime();
      const hours = Math.max(1,Math.floor(diff/3600000));
      if(hours < 24) return `Atrasada há ${hours}h.`;
      const days = Math.floor(hours/24);
      return `Atrasada há ${days} dia${days===1?"":"s"}.`;
    }

    function renderAlerts(){
      const overdue=overdueTasks();
      $("#overdueList").innerHTML=overdue.length?overdue.map(task=>`
        <article class="alert-card">
          <strong>${escapeHTML(task.title)}</strong>
          <p>${escapeHTML(task.area)} · ${formatDate(task.date)} · ${task.time||"Sem hora"} · ${escapeHTML(task.priority)} · ${escapeHTML(task.status)}</p>
          <p>${overdueText(task)}</p>
          <div class="btn-row">
            <button class="btn" data-toggle-done="${task.id}">Concluir</button>
            <button class="btn secondary" data-move-today="${task.id}">Passar para hoje</button>
            <button class="btn ghost" data-edit-task="${task.id}">Editar</button>
          </div>
        </article>`).join(""):`<div class="empty">Sem tarefas atrasadas.</div>`;
    }

    function renderMore(){
      document.body.dataset.theme=state.theme;
      const meta=document.querySelector('meta[name="theme-color"]');
      if(meta) meta.setAttribute("content",state.theme==="dark"?"#070707":"#f3f4f6");
    }

    function render(){
      renderMore(); renderHome(); renderCalendar(); renderAlerts(); bindTaskActions();
      $$(".bottom-nav button").forEach(btn=>btn.classList.toggle("active",btn.dataset.screen===currentScreen));
    }

    function nextRecurringDate(date, recurrence){
      const d = new Date(date + "T12:00:00");
      if(recurrence === "daily") d.setDate(d.getDate()+1);
      if(recurrence === "weekly") d.setDate(d.getDate()+7);
      if(recurrence === "monthly") d.setMonth(d.getMonth()+1);
      return dateISO(d);
    }

    function spawnRecurringTask(task){
      if(task.recurrence === "none" || task.recurrenceSpawned) return;
      const nextDate = nextRecurringDate(task.date, task.recurrence);
      state.tasks.push({
        ...task,
        id:uid(),
        date:nextDate,
        status:"Por fazer",
        done:false,
        parentId:task.id,
        recurrenceSpawned:false,
        createdAt:Date.now(),
        updatedAt:Date.now(),
        completedAt:null
      });
      task.recurrenceSpawned=true;
    }

    function setTaskStatus(task,status){
      const wasComplete = task.status === "Concluída";
      task.status=status;
      task.done=status === "Concluída";
      task.updatedAt=Date.now();
      if(status === "Concluída"){
        if(!wasComplete) task.completedAt=Date.now();
        spawnRecurringTask(task);
      } else {
        task.completedAt=null;
      }
    }

    function bindTaskActions(){
      $$('[data-toggle-done]').forEach(el=>el.addEventListener('click',event=>{
        event.preventDefault();
        const task=state.tasks.find(t=>t.id===event.currentTarget.dataset.toggleDone); if(!task)return;
        setTaskStatus(task,task.status==="Concluída"?"Por fazer":"Concluída"); save(); render();
        showToast(task.status==="Concluída"?"Tarefa concluída":"Tarefa reaberta");
      }));

      $$('[data-status-task]').forEach(btn=>btn.addEventListener('click',()=>{
        const task=state.tasks.find(t=>t.id===btn.dataset.statusTask); if(!task)return;
        setTaskStatus(task,btn.dataset.statusValue); save(); render(); showToast(`Estado: ${task.status}`);
      }));

      $$('[data-edit-task]').forEach(btn=>btn.addEventListener('click',()=>openModal(btn.dataset.editTask)));

      $$('[data-delete-task]').forEach(btn=>btn.addEventListener('click',()=>deleteTask(btn.dataset.deleteTask)));

      $$('[data-move-today]').forEach(btn=>btn.addEventListener('click',()=>{
        const task=state.tasks.find(t=>t.id===btn.dataset.moveToday); if(!task)return;
        task.date=todayISO(); task.updatedAt=Date.now(); save(); render(); showToast("Tarefa movida para hoje");
      }));
    }

