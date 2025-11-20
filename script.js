// script.js — front-end only scheduler (FCFS, SJF, SJTR, PRIORITY, RR)

const algoButtons = document.querySelectorAll('.algo-btn');
const formTitle = document.getElementById('form-title');
const quantumField = document.getElementById('quantum-field');
const processContainer = document.getElementById('process-container');
const addProcessBtn = document.getElementById('add-process');
const clearProcessesBtn = document.getElementById('clear-processes');
const form = document.getElementById('schedule-form');
const ganttDiv = document.getElementById('gantt');
const metricsDiv = document.getElementById('metrics');
const resetBtn = document.getElementById('reset');

let selectedAlgo = 'FCFS';

// --- UI: algorithm switching ---
algoButtons.forEach(btn=>{
  btn.addEventListener('click', ()=>{
    algoButtons.forEach(b=>b.classList.remove('algo-active'));
    btn.classList.add('algo-active');
    selectedAlgo = btn.dataset.type;
    formTitle.textContent = `${selectedAlgo} Parameters`;
    quantumField.classList.toggle('hidden', selectedAlgo !== 'RR');

    // update existing rows to show/hide priority input by recreating rows with same values
    recreateRowsKeepingValues();
  });
});

// --- helper to create a row ---
function makeRow(pid='P'+(Math.floor(Math.random()*900)+100), arrival=0, burst=1, priority=0){
  const row = document.createElement('div');
  row.className = 'process-row';

  // build inner HTML with priority only if selectedAlgo === 'PRIORITY'
  row.innerHTML = `
    <input class="pid" type="text" placeholder="PID" value="${pid}" />
    <input class="arrival" type="number" placeholder="Arrival" min="0" value="${arrival}" />
    <input class="burst" type="number" placeholder="Burst" min="1" value="${burst}" />
    ${selectedAlgo === 'PRIORITY' ? `<input class="priority" type="number" placeholder="Priority" value="${priority}" />` : ''}
    <button type="button" class="remove">X</button>
  `;

  row.querySelector('.remove').addEventListener('click', ()=>row.remove());
  return row;
}

// --- recreate rows keeping values (called when algorithm changes) ---
function recreateRowsKeepingValues(){
  const old = Array.from(document.querySelectorAll('.process-row'));
  const values = old.map(r=>{
    return {
      pid: r.querySelector('.pid')?.value || '',
      arrival: r.querySelector('.arrival')?.value || '0',
      burst: r.querySelector('.burst')?.value || '1',
      priority: r.querySelector('.priority')?.value || '0'
    };
  });
  processContainer.innerHTML = '';
  if(values.length===0) addProcessRow(); 
  else values.forEach(v => processContainer.appendChild(makeRow(v.pid, Number(v.arrival), Number(v.burst), Number(v.priority))));
}

// --- add / clear rows handlers ---
function addProcessRow(){
  processContainer.appendChild(makeRow());
}
addProcessBtn.addEventListener('click', addProcessRow);
clearProcessesBtn.addEventListener('click', ()=>{ processContainer.innerHTML=''; addProcessRow(); });

// --- seed example processes ---
function seedExample(){
  processContainer.innerHTML = '';
  // order: pid, arrival, burst, priority
  processContainer.appendChild(makeRow('P1',0,5,1));
  processContainer.appendChild(makeRow('P2',1,3,2));
  processContainer.appendChild(makeRow('P3',2,8,3));
  processContainer.appendChild(makeRow('P4',3,6,2));
}
seedExample();

// --- read processes from UI ---
function readProcesses(){
  const rows = Array.from(document.querySelectorAll('.process-row'));
  const procs = rows.map(r=>{
    return {
      pid: r.querySelector('.pid')?.value.trim() || null,
      arrival: Number(r.querySelector('.arrival')?.value || 0),
      burst: Number(r.querySelector('.burst')?.value || 0),
      priority: r.querySelector('.priority') ? Number(r.querySelector('.priority').value || 0) : 0
    };
  }).filter(p => p.pid && Number.isFinite(p.burst) && p.burst > 0);
  return procs;
}

// ---------- Scheduling algorithms ----------

// FCFS (non-preemptive)
function fcfs(procs){
  const p = [...procs].sort((a,b)=> a.arrival - b.arrival);
  let time = 0;
  const gantt=[];
  for(const proc of p){
    if(time < proc.arrival) {
      // idle until arrival
      gantt.push({pid: 'idle', start: time, end: proc.arrival});
      time = proc.arrival;
    }
    gantt.push({pid: proc.pid, start: time, end: time + proc.burst});
    time += proc.burst;
  }
  return gantt;
}

// SJF non-preemptive
function sjf_nonpreemptive(procs){
  const n = procs.length;
  const state = procs.map(p=>({...p}));
  let time = 0;
  const completed = new Set();
  const gantt = [];
  while(completed.size < n){
    const available = state.filter(s => s.arrival <= time && !completed.has(s.pid));
    if(available.length === 0){
      const next = Math.min(...state.filter(s=>!completed.has(s.pid)).map(s=>s.arrival));
      gantt.push({pid:'idle', start: time, end: next});
      time = next;
      continue;
    }
    available.sort((a,b)=> a.burst - b.burst || a.arrival - b.arrival || a.pid.localeCompare(b.pid));
    const cur = available[0];
    gantt.push({pid: cur.pid, start: time, end: time + cur.burst});
    time += cur.burst;
    completed.add(cur.pid);
  }
  return gantt;
}

// SJTR (preemptive SJF / Shortest Remaining Time) — integer time steps
function sjtr_preemptive(procs){
  const state = procs.map(p=>({...p, remaining: p.burst}));
  let time = 0;
  const gantt = [];
  let last = null, segStart = 0;
  const allDone = ()=> state.every(s=>s.remaining === 0);
  while(!allDone()){
    const available = state.filter(s => s.arrival <= time && s.remaining > 0);
    if(available.length === 0){
      const future = state.filter(s => s.remaining > 0).map(s => s.arrival);
      const next = Math.min(...future);
      if(last !== null){ gantt.push({pid:last, start:segStart, end:time}); last = null; }
      gantt.push({pid:'idle', start:time, end:next});
      time = next;
      continue;
    }
    available.sort((a,b)=> a.remaining - b.remaining || a.arrival - b.arrival || a.pid.localeCompare(b.pid));
    const cur = available[0];
    if(cur.pid !== last){
      if(last !== null) gantt.push({pid:last, start:segStart, end:time});
      last = cur.pid; segStart = time;
    }
    // execute one time unit
    cur.remaining -= 1;
    time += 1;
  }
  if(last !== null) gantt.push({pid:last, start:segStart, end:time});
  return gantt;
}

// Priority non-preemptive (lower number = higher priority)
function priority_nonpreemptive(procs){
  const n = procs.length;
  const state = procs.map(p=>({...p}));
  let time = 0;
  const completed = new Set();
  const gantt = [];
  while(completed.size < n){
    const available = state.filter(s => s.arrival <= time && !completed.has(s.pid));
    if(available.length === 0){
      const next = Math.min(...state.filter(s=>!completed.has(s.pid)).map(s=>s.arrival));
      gantt.push({pid:'idle', start:time, end: next}); time = next; continue;
    }
    available.sort((a,b)=> (a.priority - b.priority) || a.arrival - b.arrival || a.pid.localeCompare(b.pid));
    const cur = available[0];
    gantt.push({pid: cur.pid, start: time, end: time + cur.burst});
    time += cur.burst;
    completed.add(cur.pid);
  }
  return gantt;
}

// Round Robin (preemptive)
function round_robin(procs, quantum){
  const state = procs.map(p=>({...p, remaining: p.burst}));
  let time = 0;
  const gantt = [];
  const queue = [];
  const enqueued = new Set();

  function enqueueArrivals(upto){
    state.filter(s=>s.arrival <= upto && s.remaining > 0 && !enqueued.has(s.pid)).forEach(s=>{ queue.push(s.pid); enqueued.add(s.pid); });
  }

  enqueueArrivals(0);
  if(queue.length === 0){
    const next = Math.min(...state.map(s=>s.arrival));
    gantt.push({pid:'idle', start: time, end: next});
    time = next;
    enqueueArrivals(time);
  }

  while(state.some(s=>s.remaining > 0)){
    if(queue.length === 0){
      const next = Math.min(...state.filter(s=>s.remaining>0 && !enqueued.has(s.pid)).map(s=>s.arrival));
      gantt.push({pid:'idle', start: time, end: next});
      time = next;
      enqueueArrivals(time);
      continue;
    }
    const pid = queue.shift();
    const proc = state.find(s => s.pid === pid);
    if(!proc || proc.remaining <= 0) continue;
    const exec = Math.min(quantum, proc.remaining);
    gantt.push({pid: proc.pid, start: time, end: time + exec});
    proc.remaining -= exec;
    time += exec;
    enqueueArrivals(time);
    if(proc.remaining > 0) queue.push(proc.pid);
  }

  return gantt;
}

// ---------- compute metrics ----------
function computeMetrics(gantt, procs){
  // completion time = last end for each pid
  const completion = {};
  for(const seg of gantt){
    if(seg.pid === 'idle') continue;
    completion[seg.pid] = (completion[seg.pid] === undefined) ? seg.end : Math.max(completion[seg.pid], seg.end);
  }
  const out = {};
  for(const p of procs){
    const comp = completion[p.pid] ?? p.arrival;
    const tat = comp - p.arrival;
    const wt = tat - p.burst;
    out[p.pid] = { arrival: p.arrival, burst: p.burst, completion: comp, turnaround: tat, waiting: wt };
  }
  return out;
}

// ---------- UI rendering ----------
function clearOutput(){ ganttDiv.innerHTML = ''; metricsDiv.innerHTML = ''; }

function colorFor(pid){
  if(pid === 'idle') return '#d1d5db';
  const colors = ['#3f51b5','#06b6d4','#10b981','#ef4444','#f59e0b','#8b5cf6','#ec4899','#64748b'];
  let sum = 0; for(const ch of pid) sum += ch.charCodeAt(0);
  return colors[sum % colors.length];
}

function renderGantt(gantt){
  ganttDiv.innerHTML = '';
  if(!gantt || gantt.length === 0) return;
  // simple horizontal blocks; also show time ticks below (text)
  for(const seg of gantt){
    const block = document.createElement('div');
    block.className = 'seg';
    block.style.background = colorFor(seg.pid);
    block.textContent = seg.pid === 'idle' ? `idle (${seg.start}-${seg.end})` : `${seg.pid} (${seg.start}-${seg.end})`;
    ganttDiv.appendChild(block);
  }
}

function renderMetrics(metrics){
  let html = '<table><thead><tr><th>PID</th><th>Arrival</th><th>Burst</th><th>Completion</th><th>Turnaround</th><th>Waiting</th></tr></thead><tbody>';
  const pids = Object.keys(metrics).sort();
  let totalWT = 0, totalTAT = 0;
  for(const pid of pids){
    const m = metrics[pid];
    html += `<tr><td>${pid}</td><td>${m.arrival}</td><td>${m.burst}</td><td>${m.completion}</td><td>${m.turnaround}</td><td>${m.waiting}</td></tr>`;
    totalWT += m.waiting; totalTAT += m.turnaround;
  }
  const n = pids.length || 1;
  html += `</tbody></table><div style="margin-top:8px">Average Waiting: <strong>${(totalWT/n).toFixed(2)}</strong> &nbsp; Average Turnaround: <strong>${(totalTAT/n).toFixed(2)}</strong></div>`;
  metricsDiv.innerHTML = html;
}

// ---------- form submit ----------
form.addEventListener('submit', (e)=>{
  e.preventDefault();
  clearOutput();
  const procs = readProcesses();
  if(procs.length === 0){ alert('Add at least one valid process (PID & burst).'); return; }

  let gantt = [];
  if(selectedAlgo === 'FCFS') gantt = fcfs(procs);
  else if(selectedAlgo === 'SJF') gantt = sjf_nonpreemptive(procs);
  else if(selectedAlgo === 'SJTR') gantt = sjtr_preemptive(procs);
  else if(selectedAlgo === 'PRIORITY') gantt = priority_nonpreemptive(procs);
  else if(selectedAlgo === 'RR') {
    const q = Math.max(1, Number(document.getElementById('quantum').value) || 1);
    gantt = round_robin(procs, q);
  }

  // remove zero-length segments and merge consecutive same-pid contiguous segments (for nicer Gantt)
  const cleaned = [];
  for(const s of gantt){
    if(s.end <= s.start) continue;
    const last = cleaned[cleaned.length - 1];
    if(last && last.pid === s.pid && last.end === s.start){
      last.end = s.end;
    } else cleaned.push({...s});
  }

  renderGantt(cleaned);
  const metrics = computeMetrics(cleaned, procs);
  renderMetrics(metrics);
});

// ---------- reset / utils ----------
resetBtn.addEventListener('click', ()=>{
  selectedAlgo = 'FCFS';
  document.querySelectorAll('.algo-btn').forEach(b=>b.classList.remove('algo-active'));
  document.querySelector('.algo-btn[data-type="FCFS"]').classList.add('algo-active');
  formTitle.textContent = 'FCFS Parameters';
  quantumField.classList.add('hidden');
  seedExample();
  clearOutput();
});

