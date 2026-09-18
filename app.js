const $ = (selector) => document.querySelector(selector);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const elements = {
  objective: $('#objective'),
  charCount: $('#charCount'),
  runButton: $('#runButton'),
  runLabel: $('#runLabel'),
  graph: $('#graph'),
  graphFrame: $('.graph-frame'),
  graphStatus: $('#graphStatus'),
  result: $('#result'),
  copyResult: $('#copyResult'),
  trace: $('#trace'),
  runId: $('#runId'),
  eventCount: $('#eventCount'),
  metricState: $('#metricState'),
  metricActive: $('#metricActive'),
  metricComplete: $('#metricComplete'),
  metricElapsed: $('#metricElapsed'),
  metricTokens: $('#metricTokens'),
  parallelWidth: $('#parallelWidth'),
  modeNote: $('#modeNote'),
  inspectorStatus: $('#inspectorStatus'),
  inspectorAvatar: $('#inspectorAvatar'),
  inspectorKicker: $('#inspectorKicker'),
  inspectorName: $('#inspectorName'),
  inspectState: $('#inspectState'),
  inspectConfidence: $('#inspectConfidence'),
  inspectAttempt: $('#inspectAttempt'),
  inspectDuration: $('#inspectDuration'),
  inspectAssignment: $('#inspectAssignment'),
  inspectArtifact: $('#inspectArtifact'),
  inspectDeps: $('#inspectDeps')
};

const presets = {
  product: 'Map a launch strategy for an open-source agent memory engine. Identify the strongest technical wedge, likely failure modes, distribution channels, and a 14-day execution plan.',
  research: 'Investigate why adaptive multi-agent graphs can outperform fixed linear workflows. Separate strong evidence, plausible hypotheses, and implementation risks, then propose three experiments.',
  system: 'Design a production-ready architecture for a local-first multi-agent coding system with isolated workers, adversarial verification, retry limits, observability, and safe deployment gates.'
};

const baseNodes = [
  { id: 'brief', label: 'BRIEF', role: 'SCOPE LOCK', x: 42, y: 194, w: 104, h: 56, assignment: 'Freeze the user objective and prevent scope drift.', deps: ['USER OBJECTIVE'] },
  { id: 'plan', label: 'PLAN', role: 'ORCHESTRATOR', x: 194, y: 194, w: 112, h: 56, assignment: 'Decompose the mission into independent specialist work packets.', deps: ['BRIEF'] },
  { id: 'agent-1', label: 'SIGNAL', role: 'SPECIALIST', x: 374, y: 56, w: 116, h: 54, assignment: 'Research external signals, evidence, and relevant patterns.', deps: ['PLAN'] },
  { id: 'agent-2', label: 'SYSTEMS', role: 'SPECIALIST', x: 374, y: 145, w: 116, h: 54, assignment: 'Map constraints, dependencies, technical choices, and failure modes.', deps: ['PLAN'] },
  { id: 'agent-3', label: 'RED TEAM', role: 'SPECIALIST', x: 374, y: 234, w: 116, h: 54, assignment: 'Attack assumptions and identify reasons the mission could fail.', deps: ['PLAN'] },
  { id: 'agent-4', label: 'EXECUTION', role: 'SPECIALIST', x: 374, y: 323, w: 116, h: 54, assignment: 'Convert findings into a concrete implementation and rollout sequence.', deps: ['PLAN'] },
  { id: 'verify', label: 'VERIFY', role: 'ADVERSARIAL GATE', x: 580, y: 194, w: 120, h: 56, assignment: 'Cross-check specialist artifacts for contradictions, omissions, and unsupported claims.', deps: ['SIGNAL', 'SYSTEMS', 'RED TEAM', 'EXECUTION'] },
  { id: 'synthesis', label: 'SYNTHESIS', role: 'MERGE', x: 756, y: 194, w: 126, h: 56, assignment: 'Resolve verified artifacts into one coherent mission result.', deps: ['VERIFY'] },
  { id: 'ship', label: 'ARTIFACT', role: 'OUTPUT', x: 934, y: 194, w: 112, h: 56, assignment: 'Publish the final artifact only after it passes the verification gate.', deps: ['SYNTHESIS'] }
];

const edgeDefs = [
  ['brief','plan'],
  ['plan','agent-1'],['plan','agent-2'],['plan','agent-3'],['plan','agent-4'],
  ['agent-1','verify'],['agent-2','verify'],['agent-3','verify'],['agent-4','verify'],
  ['verify','synthesis'],['synthesis','ship']
];

let mode = 'demo';
let running = false;
let startedAt = 0;
let elapsedTimer = null;
let selectedNode = 'brief';
let events = [];
let runCounter = 0;
let nodeState = {};
let lastResultText = '';

function freshState() {
  nodeState = Object.fromEntries(baseNodes.map((node) => [node.id, {
    status: 'idle', confidence: null, attempt: 0, duration: null, artifact: 'Awaiting execution signal.'
  }]));
}
freshState();

function edgePath(a, b) {
  const sx = a.x + a.w;
  const sy = a.y + a.h / 2;
  const ex = b.x;
  const ey = b.y + b.h / 2;
  const dx = Math.max(36, (ex - sx) * .48);
  return `M ${sx} ${sy} C ${sx + dx} ${sy}, ${ex - dx} ${ey}, ${ex} ${ey}`;
}

function edgeStatus(from, to) {
  const a = nodeState[from]?.status;
  const b = nodeState[to]?.status;
  if (from === 'verify' && b === 'running') return 'active';
  if (a === 'running' || b === 'running' || a === 'review' || b === 'review') return 'active';
  if (a === 'blocked' || b === 'blocked') return 'repair';
  if (a === 'complete' && b === 'complete') return 'complete';
  return '';
}

function renderGraph() {
  const byId = Object.fromEntries(baseNodes.map((n) => [n.id, n]));
  const edges = edgeDefs.map(([from, to], index) => {
    const status = edgeStatus(from, to);
    const path = edgePath(byId[from], byId[to]);
    const particle = status === 'active' ? `<circle class="packet" r="2.6"><animateMotion dur="1.05s" repeatCount="indefinite" path="${path}" /></circle>` : '';
    return `<path id="edge-${index}" class="edge ${status}" d="${path}" />${particle}`;
  }).join('');

  const nodes = baseNodes.map((node, index) => {
    const state = nodeState[node.id] || { status: 'idle' };
    const selected = selectedNode === node.id ? 'selected' : '';
    return `<g class="node ${state.status} ${selected}" data-node="${node.id}" transform="translate(${node.x},${node.y})" tabindex="0" role="button" aria-label="Inspect ${node.label}">
      <rect class="node-rect" rx="2" width="${node.w}" height="${node.h}" />
      <circle class="status-led" cx="12" cy="13" r="3" />
      <text class="node-index" x="${node.w - 13}" y="16" text-anchor="end">${String(index + 1).padStart(2,'0')}</text>
      <text class="node-label" x="12" y="34">${node.label}</text>
      <text class="node-role" x="12" y="47">${node.role}</text>
    </g>`;
  }).join('');

  elements.graph.innerHTML = `<svg viewBox="0 0 1090 438" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <defs>
      <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" fill="#35404d" /></marker>
    </defs>
    <g opacity=".5">${[70,145,220,295,370].map(y=>`<path d="M25 ${y} H1060" stroke="rgba(255,255,255,.025)" stroke-width="1"/>`).join('')}</g>
    <g>${edges}</g>
    <g>${nodes}</g>
  </svg>`;

  elements.graph.querySelectorAll('.node').forEach((el) => {
    const open = () => selectNode(el.dataset.node);
    el.addEventListener('click', open);
    el.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') open(); });
  });
  updateMetrics();
}

function selectNode(id) {
  selectedNode = id;
  const node = baseNodes.find((n) => n.id === id);
  const state = nodeState[id];
  if (!node || !state) return;
  elements.inspectorAvatar.textContent = node.label.replace(/[^A-Z]/g,'').slice(0,2) || node.label.slice(0,2);
  elements.inspectorKicker.textContent = node.role;
  elements.inspectorName.textContent = node.label;
  elements.inspectorStatus.textContent = state.status.toUpperCase();
  elements.inspectState.textContent = state.status.toUpperCase();
  elements.inspectConfidence.textContent = state.confidence == null ? '—' : `${Math.round(state.confidence * 100)}%`;
  elements.inspectAttempt.textContent = `${state.attempt} / 2`;
  elements.inspectDuration.textContent = state.duration == null ? '—' : `${state.duration}ms`;
  elements.inspectAssignment.textContent = node.assignment;
  elements.inspectArtifact.textContent = state.artifact || 'No artifact emitted.';
  elements.inspectDeps.innerHTML = node.deps.map((dep) => `<span>${escapeHtml(dep)}</span>`).join('');
  renderGraph();
}

function setNode(id, patch) {
  nodeState[id] = { ...nodeState[id], ...patch };
  renderGraph();
  if (selectedNode === id) selectNode(id);
}

function updateMetrics() {
  const states = Object.values(nodeState).map((x) => x.status);
  const active = states.filter((s) => s === 'running' || s === 'review').length;
  const complete = states.filter((s) => s === 'complete').length;
  elements.metricActive.textContent = String(active);
  elements.metricComplete.textContent = `${complete} / ${baseNodes.length}`;
  const hasBlocked = states.includes('blocked');
  elements.metricState.textContent = running ? (hasBlocked ? 'REPAIR' : 'RUNNING') : (complete === baseNodes.length ? 'COMPLETE' : 'IDLE');
  elements.graphFrame.classList.toggle('running', running);
}

function addEvent(stage, message, status = 'running') {
  const elapsed = startedAt ? Date.now() - startedAt : 0;
  events.push({ stage, message, status, elapsed });
  elements.eventCount.textContent = `${events.length} EVENT${events.length === 1 ? '' : 'S'}`;
  elements.trace.innerHTML = events.map((event) => `<div class="trace-line ${event.status}">
    <span class="time">+${(event.elapsed / 1000).toFixed(2)}s</span>
    <span class="stage">${escapeHtml(event.stage.toUpperCase())}</span>
    <span class="message">${escapeHtml(event.message)}</span>
  </div>`).join('');
  elements.trace.scrollTop = elements.trace.scrollHeight;
}

function resetRun() {
  freshState();
  events = [];
  startedAt = Date.now();
  runCounter += 1;
  elements.runId.textContent = `RUN PXL-${String(runCounter).padStart(3,'0')}`;
  elements.eventCount.textContent = '0 EVENTS';
  elements.trace.innerHTML = '<div class="trace-empty">Mission accepted. Initializing graph…</div>';
  elements.result.className = 'result empty-state';
  elements.result.innerHTML = '<div class="empty-symbol">∷</div><p>Mission in progress.</p><span>Artifacts will appear after verification.</span>';
  elements.metricTokens.textContent = mode === 'demo' ? 'SIM' : '…';
  elements.graphStatus.textContent = 'GRAPH EXECUTING';
  lastResultText = '';
  selectedNode = 'brief';
  clearInterval(elapsedTimer);
  elapsedTimer = setInterval(() => {
    elements.metricElapsed.textContent = `${((Date.now() - startedAt) / 1000).toFixed(1).padStart(4,'0')}s`;
  }, 100);
  renderGraph();
  selectNode('brief');
}

function finishRun() {
  running = false;
  clearInterval(elapsedTimer);
  elements.metricElapsed.textContent = `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
  elements.graphStatus.textContent = 'GRAPH COMPLETE';
  elements.runButton.disabled = false;
  elements.runLabel.textContent = 'EXECUTE MISSION';
  renderGraph();
}

const demoArtifacts = {
  brief: 'Objective frozen. Scope: technical wedge, failure modes, distribution, and 14-day launch sequence. No autonomous external actions permitted.',
  plan: 'Four independent work packets issued: signal analysis, systems architecture, adversarial failure analysis, and execution design.',
  'agent-1': 'Signal map: strongest wedge is durable, inspectable memory for coding agents. Distribution should lead with a measurable before/after benchmark and a self-contained local demo.',
  'agent-2': 'Architecture: append-only memory events instead of opaque transcript stuffing.\n- Relevance scoring with explicit decay.\n- Contradictions are preserved and flagged instead of silently overwritten.\n- Retrieval quality is measured with a reproducible benchmark harness.\n\n## Primary failure modes\n- Stale memory gets high confidence and contaminates later work.\n- The product demos well but cannot quantify recall precision.\n- Scope expands into a generic “AI memory platform” before one workflow is excellent.\n\n## 14-day execution\n1. Days 1–3: build the benchmark and baseline.\n2. Days 4–6: ship a local developer demo with inspectable memory events.\n3. Days 7–9: documentation, architecture diagram, three real coding-agent examples.\n4. Days 10–11: contradiction, stale-memory, and long-session stress tests.\n5. Day 12: private test with technical users.\n6. Day 13: fix benchmark failures and sharpen onboarding.\n7. Day 14: public launch with benchmark data, demo video, and known limitations.\n\n## Gate\nDo **not** optimize distribution before the benchmark produces a credible before/after result. The verifier rejected that ordering once during this run.\n\n_Analyzed objective: ${objective}_`;
  showResult(lastResultText);
  elements.metricTokens.textContent = 'SIM';
}

async function runAI() {
  const objective = elements.objective.value.trim();
  if (!objective) throw new Error('Enter an objective first.');

  setNode('brief',{status:'complete',attempt:1,confidence:.99,duration:1,artifact:'Objective sent to server-side orchestrator.'});
  setNode('plan',{status:'running',attempt:1,artifact:'Server is generating a specialist graph…'});
  addEvent('brief','Objective locked and sent to server.','completed');
  addEvent('plan','Waiting for Planner and parallel workers…');

  const response = await fetch('/api/run', {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({ objective })
  });
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(data.error || `Server returned HTTP ${response.status}.`);

  const agents = Array.isArray(data.agents) ? data.agents.slice(0,4) : [];
  setNode('plan',{status:'complete',attempt:1,confidence:.95,duration:null,artifact:`Planner created ${agents.length} specialist tasks.`});
  addEvent('plan',`${agents.length} specialists returned from orchestrator.`,'completed');
  await sleep(350);

  agents.forEach((agent,index) => {
    const id = `agent-${index+1}`;
    const base = baseNodes.find(n=>n.id===id);
    if (base) {
      base.label = String(agent.role || `AGENT ${index+1}`).toUpperCase().slice(0,13);
      base.assignment = agent.goal || base.assignment;
      base.deps = ['PLAN'];
    }
    setNode(id,{status:'running',attempt:1,artifact:'Replaying completed server artifact…'});
  });
  addEvent('workers','Replaying parallel specialist results.');
  await sleep(500);
  agents.forEach((agent,index) => {
    const id = `agent-${index+1}`;
    setNode(id,{status:'complete',attempt:1,confidence:.9,duration:agent.durationMs || null,artifact:agent.output || 'Artifact completed.'});
    addEvent(agent.role || id,'Specialist artifact accepted.','completed');
  });
  for (let i=agents.length;i<4;i++) setNode(`agent-${i+1}`,{status:'complete',attempt:0,confidence:null,duration:0,artifact:'Unused for this mission.'});

  await sleep(420);
  setNode('verify',{status:'review',attempt:1,artifact:'Loading verifier audit…'}); addEvent('verify','Adversarial verification result received.','review');
  await sleep(520);
  setNode('verify',{status:'complete',attempt:1,confidence:.94,duration:null,artifact:data.verifier || 'Verification complete.'}); addEvent('verify','Verification gate complete.','completed');
  setNode('synthesis',{status:'running',attempt:1,artifact:'Loading synthesis…'}); addEvent('synthesis','Compiling final response.');
  await sleep(520);
  setNode('synthesis',{status:'complete',attempt:1,confidence:.94,duration:null,artifact:data.result || 'Synthesis complete.'}); addEvent('synthesis','Final synthesis accepted.','completed');
  setNode('ship',{status:'complete',attempt:1,confidence:.99,duration:1,artifact:'Mission result available in console.'}); addEvent('artifact','Mission result published.','completed');

  lastResultText = data.result || 'No result returned.';
  showResult(lastResultText);
  elements.metricTokens.textContent = Number(data.metrics?.totalTokens || 0).toLocaleString();
  elements.parallelWidth.textContent = String(data.metrics?.parallelWidth || agents.length || 0).padStart(2,'0');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

function renderMarkdown(markdown) {
  const lines = escapeHtml(markdown).split('\n');
  const out = [];
  let inList = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^###\s+/.test(line)) { if (inList){out.push('</ul>');inList=false;} out.push(`<h3>${inline(line.replace(/^###\s+/,''))}</h3>`); continue; }
    if (/^##\s+/.test(line)) { if (inList){out.push('</ul>');inList=false;} out.push(`<h2>${inline(line.replace(/^##\s+/,''))}</h2>`); continue; }
    if (/^#\s+/.test(line)) { if (inList){out.push('</ul>');inList=false;} out.push(`<h1>${inline(line.replace(/^#\s+/,''))}</h1>`); continue; }
    if (/^[-*]\s+/.test(line)) { if(!inList){out.push('<ul>');inList=true;} out.push(`<li>${inline(line.replace(/^[-*]\s+/,''))}</li>`); continue; }
    if (/^\d+\.\s+/.test(line)) { if(!inList){out.push('<ul>');inList=true;} out.push(`<li>${inline(line.replace(/^\d+\.\s+/,''))}</li>`); continue; }
    if (inList){out.push('</ul>');inList=false;}
    if (!line.trim()) { out.push('<div style="height:5px"></div>'); continue; }
    out.push(`<p>${inline(line)}</p>`);
  }
  if (inList) out.push('</ul>');
  return out.join('');
}

function inline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/`(.+?)`/g,'<code>$1</code>')
    .replace(/_(.+?)_/g,'<em>$1</em>');
}

function showResult(markdown) {
  elements.result.className = 'result';
  elements.result.innerHTML = renderMarkdown(markdown);
}

function toast(message, type='') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(), 2600);
}

async function executeMission() {
  if (running) return;
  if (!elements.objective.value.trim()) return toast('Enter a mission objective.','error');
  running = true;
  elements.runButton.disabled = true;
  elements.runLabel.textContent = mode === 'demo' ? 'RUNNING DEMO' : 'RUNNING AI';
  resetRun();
  try {
    if (mode === 'demo') await runDemo(); else await runAI();
  } catch (error) {
    addEvent('system', error?.message || 'Mission failed.', 'blocked');
    elements.graphStatus.textContent = 'GRAPH HALTED';
    toast(error?.message || 'Mission failed.','error');
  } finally {
    finishRun();
  }
}

function updateCount() { elements.charCount.textContent = `${elements.objective.value.length} / 6000`; }
function updateClock() { $('#clock').textContent = new Date().toLocaleTimeString('en-GB', {hour12:false}); }

$('.segmented').addEventListener('click',(event)=>{
  const button = event.target.closest('.mode-btn'); if(!button || running) return;
  mode = button.dataset.mode;
  document.querySelectorAll('.mode-btn').forEach(b=>b.classList.toggle('active',b===button));
  elements.modeNote.textContent = mode === 'demo'
    ? 'Runs locally with deterministic simulated agents. No key required.'
    : 'Uses the server-side OPENAI_API_KEY. Workers execute in parallel.';
  elements.metricTokens.textContent = mode === 'demo' ? '—' : 'API';
});

document.querySelectorAll('.preset').forEach((button)=>button.addEventListener('click',()=>{
  elements.objective.value = presets[button.dataset.preset] || elements.objective.value;
  updateCount();
}));

elements.objective.addEventListener('input',updateCount);
elements.runButton.addEventListener('click',executeMission);
elements.copyResult.addEventListener('click', async ()=>{
  if (!lastResultText) return toast('No mission result to copy.');
  try { await navigator.clipboard.writeText(lastResultText); toast('Artifact copied.'); }
  catch { toast('Clipboard unavailable.','error'); }
});

document.addEventListener('keydown',(event)=>{
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') executeMission();
});

updateCount(); updateClock(); setInterval(updateClock,1000); renderGraph(); selectNode('brief');
