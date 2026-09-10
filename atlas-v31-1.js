const STORAGE_KEY = "atlas_v31_data";
    const OLD_KEYS = ["atlas_v15_data","altas_v12_data","altas_v11_data","altas_v10_data","altas_v09_data","altas_v08_data","altas_v07_data","altas_v05_data","altas_v04_data","altas_v03_data","altas_v02_data"];

    const $ = selector => document.querySelector(selector);
    const $$ = selector => Array.from(document.querySelectorAll(selector));

    const priorityRank = {"Crítica":4,"Alta":3,"Normal":2,"Baixa":1};
    const statusRank = {"Em curso":4,"Por fazer":3,"Bloqueada":2,"Concluída":0};
    const recurrenceLabel = {none:"Sem repetição",daily:"Diária",weekly:"Semanal",monthly:"Mensal"};

    let state = loadState();
    let currentScreen = "home";
    let calendarCursor = new Date();
    let selectedDate = todayISO();

    function uid(){
      return "id_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    }

    function todayISO(){
      const d = new Date();
      const tz = d.getTimezoneOffset();
      return new Date(d.getTime() - tz * 60000).toISOString().slice(0,10);
    }

    function dateISO(date){
      const tz = date.getTimezoneOffset();
      return new Date(date.getTime() - tz * 60000).toISOString().slice(0,10);
    }

    function formatDate(date){
      if(!date) return "Sem dia";
      return new Date(date + "T00:00:00").toLocaleDateString("pt-PT", {day:"2-digit", month:"short"});
    }

    function formatFullDate(date){
      if(!date) return "Sem dia";
      return new Date(date + "T00:00:00").toLocaleDateString("pt-PT", {weekday:"long", day:"2-digit", month:"long", year:"numeric"});
    }

    function escapeHTML(str){
      return String(str ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
    }

    function normalizePriority(priority){
      if(priority === "Urgente" || priority === "Crítico" || priority === "Critica") return "Crítica";
      if(priority === "Alta") return "Alta";
      if(priority === "Baixa") return "Baixa";
      return "Normal";
    }

    function normalizeStatus(task){
      if(task.status === "Concluído" || task.status === "Concluida" || task.status === "Concluída" || task.done) return "Concluída";
      if(["Por fazer","Em curso","Bloqueada"].includes(task.status)) return task.status;
      return "Por fazer";
    }

    function normalize(input){
      const clean = {
        version:"3.1",
        theme:input?.theme === "light" ? "light" : "dark",
        tasks:Array.isArray(input?.tasks) ? input.tasks : []
      };

      clean.tasks = clean.tasks.map(task => {
        const status = normalizeStatus(task);
        return {
          id:task.id || uid(),
          area:["Trabalho","Pessoal","Loja"].includes(task.area) ? task.area : "Trabalho",
          title:task.title || "Tarefa sem título",
          date:task.date || task.dueDate || todayISO(),
          time:task.time || "",
          priority:["Baixa","Normal","Alta","Crítica"].includes(task.priority) ? task.priority : normalizePriority(task.priority),
          status,
          done:status === "Concluída",
          recurrence:["none","daily","weekly","monthly"].includes(task.recurrence) ? task.recurrence : "none",
          notes:task.notes || "",
          parentId:task.parentId || null,
          recurrenceSpawned:Boolean(task.recurrenceSpawned),
          createdAt:Number(task.createdAt) || Date.now(),
          updatedAt:Number(task.updatedAt) || Number(task.createdAt) || Date.now(),
          completedAt:status === "Concluída" && Number(task.completedAt) ? Number(task.completedAt) : null
        };
      });
      return clean;
    }

    function migrateOldData(old){
      const tasks = [];
      if(Array.isArray(old?.tasks)) tasks.push(...old.tasks);

      if(Array.isArray(old?.workItems)){
        old.workItems.forEach(item => tasks.push({
          id:item.id || uid(), area:"Trabalho", title:item.title || "Pendente de trabalho",
          date:item.dueDate || item.date || todayISO(), time:item.time || "",
          priority:normalizePriority(item.priority), status:item.status === "Concluído" ? "Concluída" : "Por fazer",
          notes:item.notes || "", createdAt:item.createdAt || Date.now()
        }));
      }

      if(Array.isArray(old?.orders)){
        old.orders.forEach(order => tasks.push({
          id:order.id || uid(), area:"Loja", title:`${order.client || "Cliente"} · ${order.product || "Encomenda"}`,
          date:order.dueDate || todayISO(), time:"", priority:order.status === "Por fazer" ? "Alta" : "Normal",
          status:order.status === "Entregue" ? "Concluída" : "Por fazer", createdAt:order.createdAt || Date.now()
        }));
      }

      if(Array.isArray(old?.events)){
        old.events.forEach(event => tasks.push({
          id:event.id || uid(), area:["Trabalho","Pessoal","Loja"].includes(event.area) ? event.area : "Trabalho",
          title:event.title || "Evento", date:event.date || todayISO(), time:event.time || "",
          priority:"Normal", status:"Por fazer", createdAt:event.createdAt || Date.now()
        }));
      }

      return normalize({version:"3.1", theme:old?.alertPrefs?.theme || old?.theme || "dark", tasks});
    }

    function loadState(){
      const current = localStorage.getItem(STORAGE_KEY);
      if(current){
        try{return normalize(JSON.parse(current));}catch(error){}
      }
      for(const key of OLD_KEYS){
        const raw = localStorage.getItem(key);
        if(!raw) continue;
        try{
          const migrated = migrateOldData(JSON.parse(raw));
          localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
          return migrated;
        }catch(error){}
      }
      return normalize({version:"3.1", theme:"dark", tasks:[]});
    }

    function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

    function showToast(message){
      const toast = $("#toast");
      toast.textContent = message;
      toast.classList.add("show");
      clearTimeout(showToast.timer);
      showToast.timer = setTimeout(() => toast.classList.remove("show"), 1800);
    }

    function taskDueDate(task){
      const time = task.time || "23:59";
      const d = new Date(`${task.date}T${time}:00`);
      return Number.isNaN(d.getTime()) ? new Date(`${task.date}T23:59:00`) : d;
    }

    function isOverdue(task){
      return task.status !== "Concluída" && taskDueDate(task).getTime() < Date.now();
    }

    function urgencyScore(task){
      if(task.status === "Concluída") return -999999;
      let score = (priorityRank[task.priority] || 0) * 100 + (statusRank[task.status] || 0) * 10;
      if(isOverdue(task)) score += 1000;
      const diffDays = Math.floor((taskDueDate(task) - new Date()) / 86400000);
      if(diffDays <= 0) score += 120;
      else if(diffDays === 1) score += 70;
      else if(diffDays <= 3) score += 30;
      if(task.area === "Trabalho") score += 12;
      return score;
    }

    function tasksSorted(tasks){
      return [...tasks].sort((a,b) => urgencyScore(b) - urgencyScore(a)
        || taskDueDate(a) - taskDueDate(b)
        || String(a.title).localeCompare(String(b.title)));
    }

    function tasksForDate(date, area=null){
      return tasksSorted(state.tasks.filter(task => task.date === date && (!area || task.area === area)));
    }

    function activeTasksForDate(date, area=null){
      return tasksForDate(date, area).filter(task => task.status !== "Concluída");
    }

    function overdueTasks(){
      return tasksSorted(state.tasks.filter(isOverdue));
    }

    function statusClass(status){
      return "status-" + status.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replaceAll(" ","-");
    }

    function priorityClass(priority){
      return "priority-" + priority.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
    }

    function taskCard(task, compact=false){
      const overdue = isOverdue(task);
      const blocked = task.status === "Bloqueada";
      return `
        <article class="task-card ${task.status === "Concluída" ? "done" : ""} ${overdue ? "overdue" : ""} ${blocked ? "blocked" : ""}">
          <div class="task-title">
            <input type="checkbox" ${task.status === "Concluída" ? "checked" : ""} data-toggle-done="${task.id}" aria-label="Concluir tarefa">
            <strong>${escapeHTML(task.title)}</strong>
          </div>
          <div class="task-meta">
            <span class="pill">${escapeHTML(task.area)}</span>
            <span class="pill">${formatDate(task.date)}</span>
            <span class="pill">${task.time ? escapeHTML(task.time) : "Sem hora"}</span>
            <span class="pill ${priorityClass(task.priority)}">${escapeHTML(task.priority)}</span>
            <span class="pill ${statusClass(task.status)}">${escapeHTML(task.status)}</span>
            ${task.recurrence !== "none" ? `<span class="pill">↻ ${escapeHTML(recurrenceLabel[task.recurrence])}</span>` : ""}
            ${overdue ? `<span class="pill priority-critica">Atrasada</span>` : ""}
          </div>
          ${task.notes ? `<p class="task-notes">${escapeHTML(task.notes)}</p>` : ""}
          <div class="quick-actions">
            ${task.status !== "Concluída" && task.status !== "Em curso" ? `<button class="mini-btn primary" data-status-task="${task.id}" data-status-value="Em curso">Iniciar</button>` : ""}
            ${task.status === "Em curso" ? `<button class="mini-btn primary" data-toggle-done="${task.id}">Concluir</button>` : ""}
            ${overdue ? `<button class="mini-btn" data-move-today="${task.id}">Hoje</button>` : ""}
            <button class="mini-btn" data-edit-task="${task.id}">Editar</button>
            ${compact ? "" : `<button class="mini-btn" data-delete-task="${task.id}">Apagar</button>`}
          </div>
        </article>`;
    }

