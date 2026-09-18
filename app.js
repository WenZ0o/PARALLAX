import {
  PAPER_STARTING_CASH,
  calculatePaperEquity,
  calculatePaperPnl,
  validatePaperOrder,
  stopDecision,
  deriveMarketRegime
} from '/lib/trading.js';

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
  'agent-2': 'Architecture: append-only event log → relevance scorer → contradiction registry → retrieval layer. Keep ingestion deterministic; reserve model calls for scoring and reconciliation.',
  'agent-3': 'Risk: “memory” is crowded and vague. Primary failure modes are silent stale-context injection, unverifiable recall quality, and demos that look impressive but lack reproducible metrics.',
  'agent-4': 'Execution: day 1–3 benchmark harness, 4–6 local demo, 7–9 docs + examples, 10–11 stress tests, 12 private testers, 13 fixes, 14 public launch.',
  verify: 'One conflict detected: distribution plan over-indexed on broad launch before benchmark credibility. Repair requested: make benchmark evidence the launch prerequisite.',
  synthesis: 'Merged specialist artifacts after adversarial correction. Launch is gated on a reproducible memory-retention benchmark and failure-mode disclosure.',
  ship: 'Final artifact released to mission console.'
};

async function runDemo() {
  const steps = [
    async () => { setNode('brief',{status:'running',attempt:1,artifact:'Parsing objective…'}); addEvent('brief','Freezing mission scope and constraints.'); await sleep(560); setNode('brief',{status:'complete',confidence:.99,duration:548,artifact:demoArtifacts.brief}); addEvent('brief','Objective locked.','completed'); },
    async () => { setNode('plan',{status:'running',attempt:1,artifact:'Computing dependency graph…'}); addEvent('plan','Decomposing mission into independent work packets.'); await sleep(700); setNode('plan',{status:'complete',confidence:.94,duration:687,artifact:demoArtifacts.plan}); addEvent('plan','Four specialists spawned.','completed'); },
    async () => {
      ['agent-1','agent-2','agent-3','agent-4'].forEach((id,i)=>setNode(id,{status:'running',attempt:1,artifact:`Worker ${i+1} operating in isolated context…`}));
      addEvent('workers','Parallel execution width = 4.');
      await sleep(950);
      setNode('agent-1',{status:'complete',confidence:.91,duration:914,artifact:demoArtifacts['agent-1']}); addEvent('signal','Signal artifact emitted.','completed');
      await sleep(180);
      setNode('agent-2',{status:'complete',confidence:.95,duration:1087,artifact:demoArtifacts['agent-2']}); addEvent('systems','Architecture artifact emitted.','completed');
      await sleep(180);
      setNode('agent-4',{status:'complete',confidence:.90,duration:1254,artifact:demoArtifacts['agent-4']}); addEvent('execution','Execution sequence emitted.','completed');
      await sleep(220);
      setNode('agent-3',{status:'complete',confidence:.88,duration:1470,artifact:demoArtifacts['agent-3']}); addEvent('red team','Failure analysis emitted.','completed');
    },
    async () => { setNode('verify',{status:'review',attempt:1,artifact:'Cross-checking assumptions and contradictions…'}); addEvent('verify','Adversarial gate comparing four artifacts.','review'); await sleep(800); setNode('verify',{status:'blocked',confidence:.86,duration:781,artifact:demoArtifacts.verify}); addEvent('verify','Conflict found. Sending one bounded repair request.','blocked'); },
    async () => { setNode('agent-4',{status:'review',attempt:2,artifact:'Repairing launch order: benchmark proof now gates public distribution.'}); addEvent('repair','EXECUTION revising launch sequence against verifier note.','review'); await sleep(650); setNode('agent-4',{status:'complete',confidence:.96,duration:642,artifact:'Repaired artifact: no public launch until benchmark suite passes and known failure modes are documented.'}); addEvent('repair','Repair accepted.','completed'); setNode('verify',{status:'complete',confidence:.96,duration:1438,artifact:'PASS. Artifacts are now consistent: benchmark credibility precedes distribution.'}); addEvent('verify','Verification gate passed.','completed'); },
    async () => { setNode('synthesis',{status:'running',attempt:1,artifact:'Merging verified artifacts…'}); addEvent('synthesis','Building final decision artifact.'); await sleep(760); setNode('synthesis',{status:'complete',confidence:.94,duration:748,artifact:demoArtifacts.synthesis}); addEvent('synthesis','Mission artifact compiled.','completed'); },
    async () => { setNode('ship',{status:'running',attempt:1,artifact:'Formatting release artifact…'}); addEvent('artifact','Final integrity check.'); await sleep(420); setNode('ship',{status:'complete',confidence:.99,duration:405,artifact:demoArtifacts.ship}); addEvent('artifact','Final artifact released.','completed'); }
  ];

  for (const step of steps) await step();

  const objective = elements.objective.value.trim();
  lastResultText = `# Mission Result\n\n## Decision\nLaunch the memory engine around one measurable promise: **an agent can retain useful project context across sessions without silently injecting stale or contradictory memory.**\n\n## Technical wedge\n- Append-only memory events instead of opaque transcript stuffing.\n- Relevance scoring with explicit decay.\n- Contradictions are preserved and flagged instead of silently overwritten.\n- Retrieval quality is measured with a reproducible benchmark harness.\n\n## Primary failure modes\n- Stale memory gets high confidence and contaminates later work.\n- The product demos well but cannot quantify recall precision.\n- Scope expands into a generic “AI memory platform” before one workflow is excellent.\n\n## 14-day execution\n1. Days 1–3: build the benchmark and baseline.\n2. Days 4–6: ship a local developer demo with inspectable memory events.\n3. Days 7–9: documentation, architecture diagram, three real coding-agent examples.\n4. Days 10–11: contradiction, stale-memory, and long-session stress tests.\n5. Day 12: private test with technical users.\n6. Day 13: fix benchmark failures and sharpen onboarding.\n7. Day 14: public launch with benchmark data, demo video, and known limitations.\n\n## Gate\nDo **not** optimize distribution before the benchmark produces a credible before/after result. The verifier rejected that ordering once during this run.\n\n_Analyzed objective: ${objective}_`;
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


// ─────────────────────────────────────────────────────────────────────────────
// PARALLAX Trading Module — public data + read-only wallet + local paper trades
// ─────────────────────────────────────────────────────────────────────────────
const tradeEls = {
  marketSource: $('#marketSource'),
  refreshMarket: $('#refreshMarket'),
  marketStrip: $('#marketStrip'),
  walletAddress: $('#walletAddress'),
  loadWallet: $('#loadWallet'),
  walletResult: $('#walletResult'),
  paperAsset: $('#paperAsset'),
  paperSide: $('#paperSide'),
  paperNotional: $('#paperNotional'),
  paperStop: $('#paperStop'),
  paperTake: $('#paperTake'),
  paperExecute: $('#paperExecute'),
  paperReset: $('#paperReset'),
  paperEquity: $('#paperEquity'),
  paperCash: $('#paperCash'),
  paperPnl: $('#paperPnl'),
  paperExposure: $('#paperExposure'),
  paperOpen: $('#paperOpen'),
  paperClosed: $('#paperClosed'),
  riskState: $('#riskState'),
  paperPositions: $('#paperPositions'),
  paperStatus: $('#paperStatus'),
  tradeAgents: $('#tradeAgents'),
  routeTradingMission: $('#routeTradingMission')
};

const PAPER_STORAGE_KEY = 'parallax-paper-v1';
let marketSnapshot = { source:'offline', updatedAt:null, assets:[] };
let walletSnapshot = null;
let paperState = loadPaperState();

function loadPaperState() {
  try {
    const raw = localStorage.getItem(PAPER_STORAGE_KEY);
    if (!raw) return { cash:PAPER_STARTING_CASH, positions:[], history:[] };
    const parsed = JSON.parse(raw);
    return {
      cash:Number.isFinite(Number(parsed?.cash)) ? Math.max(0, Number(parsed.cash)) : PAPER_STARTING_CASH,
      positions:Array.isArray(parsed?.positions) ? parsed.positions : [],
      history:Array.isArray(parsed?.history) ? parsed.history.slice(0,100) : []
    };
  } catch {
    return { cash:PAPER_STARTING_CASH, positions:[], history:[] };
  }
}

function savePaperState() {
  try { localStorage.setItem(PAPER_STORAGE_KEY, JSON.stringify(paperState)); } catch {}
}

function usd(value, digits=2) {
  const number=Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:digits,maximumFractionDigits:digits})
    : '—';
}

function price(value) {
  const number=Number(value);
  if (!Number.isFinite(number)) return '—';
  const digits=number>=1000?2:number>=1?3:6;
  return usd(number,digits);
}

function marketBySymbol(symbol) { return marketSnapshot.assets.find((asset)=>asset.symbol===symbol); }
function priceMap() { return Object.fromEntries(marketSnapshot.assets.map((asset)=>[asset.symbol,Number(asset.price)])); }

function renderMarketStrip() {
  if (!tradeEls.marketStrip) return;
  tradeEls.marketStrip.innerHTML=['BTC','ETH','SOL'].map((symbol)=>{
    const asset=marketBySymbol(symbol);
    if (!asset) return `<div class="market-card loading"><span>${symbol}</span><strong>—</strong><small>NO LIVE DATA</small></div>`;
    const change=Number(asset.change24h);
    const changeText=Number.isFinite(change)?`${change>=0?'+':''}${change.toFixed(2)}%`:'24H —';
    const tone=Number.isFinite(change)?(change>=0?'positive':'negative'):'';
    const regime=deriveMarketRegime(change);
    return `<div class="market-card ${tone}">
      <div class="market-card-top"><span>${asset.symbol}</span><small>${escapeHtml(regime.label)}</small></div>
      <strong>${price(asset.price)}</strong>
      <div class="market-change ${tone}">${changeText}</div>
      <div class="market-meter"><i style="width:${Math.min(100,Math.abs(change||0)*10+8)}%"></i></div>
    </div>`;
  }).join('');
}

function renderTradeAgents() {
  if (!tradeEls.tradeAgents) return;
  const assets=marketSnapshot.assets.filter((asset)=>Number.isFinite(Number(asset.change24h)));
  const leader=assets.slice().sort((a,b)=>Math.abs(Number(b.change24h))-Math.abs(Number(a.change24h)))[0];
  const metrics=calculatePaperEquity(paperState,priceMap());
  const exposurePct=metrics.equity>0?(metrics.exposure/metrics.equity)*100:0;
  const walletLine=walletSnapshot?`${walletSnapshot.sol.toFixed(4)} SOL observed`:'No public wallet loaded';
  const marketLine=leader?`${leader.symbol}: ${deriveMarketRegime(leader.change24h).label} (${Number(leader.change24h)>=0?'+':''}${Number(leader.change24h).toFixed(2)}%)`:'Awaiting live market data';
  tradeEls.tradeAgents.innerHTML=`
    <div class="trade-agent"><span>MARKET AGENT</span><strong>${escapeHtml(marketLine)}</strong><p>Public spot data. No order execution.</p></div>
    <div class="trade-agent"><span>WALLET AGENT</span><strong>${escapeHtml(walletLine)}</strong><p>Public Solana balance only; nothing is persisted.</p></div>
    <div class="trade-agent"><span>RISK AGENT</span><strong>${exposurePct.toFixed(1)}% EXPOSURE</strong><p>20% per position / 60% portfolio cap.</p></div>
    <div class="trade-agent"><span>VERIFIER</span><strong>PAPER BOUNDARY VERIFIED</strong><p>No seed phrase, signer, or live-order API exists.</p></div>`;
}

function renderPaperPortfolio() {
  if (!tradeEls.paperPositions) return;
  const prices=priceMap();
  const metrics=calculatePaperEquity(paperState,prices);
  const exposurePct=metrics.equity>0?(metrics.exposure/metrics.equity)*100:0;
  tradeEls.paperEquity.textContent=usd(metrics.equity);
  tradeEls.paperCash.textContent=usd(metrics.cash);
  tradeEls.paperPnl.textContent=`${metrics.unrealizedPnl>=0?'+':''}${usd(metrics.unrealizedPnl)}`;
  tradeEls.paperPnl.classList.toggle('positive-text',metrics.unrealizedPnl>0);
  tradeEls.paperPnl.classList.toggle('negative-text',metrics.unrealizedPnl<0);
  tradeEls.paperExposure.textContent=`${exposurePct.toFixed(1)}%`;
  tradeEls.paperOpen.textContent=String(paperState.positions.length);
  tradeEls.paperClosed.textContent=String(paperState.history.length);
  tradeEls.riskState.textContent=exposurePct>=55?'NEAR LIMIT':exposurePct>=35?'ELEVATED':'NOMINAL';
  tradeEls.riskState.className=exposurePct>=55?'risk-hot':exposurePct>=35?'risk-warm':'';
  if (!paperState.positions.length) {
    tradeEls.paperPositions.innerHTML='<tr><td colspan="8" class="empty-row">No paper positions open.</td></tr>';
  } else {
    tradeEls.paperPositions.innerHTML=paperState.positions.map((position)=>{
      const mark=prices[position.asset]||position.entryPrice;
      const pnl=calculatePaperPnl(position,mark);
      return `<tr>
        <td><strong>${escapeHtml(position.asset)}</strong></td>
        <td><span class="side-chip ${position.side.toLowerCase()}">${position.side}</span></td>
        <td>${price(position.entryPrice)}</td><td>${price(mark)}</td><td>${usd(position.notional)}</td>
        <td class="${pnl>=0?'positive-text':'negative-text'}">${pnl>=0?'+':''}${usd(pnl)}</td>
        <td>${price(position.stopLossPrice)} / ${price(position.takeProfitPrice)}</td>
        <td><button class="close-paper" data-close-paper="${escapeHtml(position.id)}">CLOSE</button></td>
      </tr>`;
    }).join('');
  }
  renderTradeAgents();
}

async function refreshMarketData({silent=false}={}) {
  if (!tradeEls.refreshMarket) return;
  tradeEls.refreshMarket.disabled=true;
  if (!silent) tradeEls.marketSource.textContent='REFRESHING…';
  try {
    const response=await fetch('/api/market',{headers:{accept:'application/json'}});
    const data=await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(data.error||`Market HTTP ${response.status}`);
    marketSnapshot={source:data.source||'public',updatedAt:data.updatedAt||new Date().toISOString(),assets:Array.isArray(data.assets)?data.assets:[]};
    tradeEls.marketSource.textContent=`LIVE / ${String(marketSnapshot.source).toUpperCase()}`;
    renderMarketStrip();
    await processPaperStops();
    renderPaperPortfolio();
    if (walletSnapshot) renderWalletResult();
  } catch (error) {
    marketSnapshot={source:'offline',updatedAt:null,assets:[]};
    tradeEls.marketSource.textContent='MARKET OFFLINE';
    renderMarketStrip(); renderPaperPortfolio();
    if (!silent) toast(error?.message||'Market data unavailable.','error');
  } finally { tradeEls.refreshMarket.disabled=false; }
}

function renderWalletResult() {
  if (!tradeEls.walletResult||!walletSnapshot) return;
  const solMarket=marketBySymbol('SOL');
  const approx=solMarket?walletSnapshot.sol*Number(solMarket.price):null;
  const short=`${walletSnapshot.address.slice(0,6)}…${walletSnapshot.address.slice(-6)}`;
  tradeEls.walletResult.innerHTML=`
    <div><span>ADDRESS</span><strong>${escapeHtml(short)}</strong></div>
    <div><span>SOL BALANCE</span><strong>${walletSnapshot.sol.toLocaleString('en-US',{maximumFractionDigits:6})} SOL</strong></div>
    <div><span>MARK VALUE</span><strong>${approx==null?'—':usd(approx)}</strong></div>
    <div><span>ACCESS</span><strong class="positive-text">READ ONLY</strong></div>`;
}

async function loadPublicWallet() {
  const address=tradeEls.walletAddress.value.trim();
  if (!address) return toast('Enter a Solana public address.','error');
  tradeEls.loadWallet.disabled=true; tradeEls.walletResult.textContent='Reading public balance…';
  try {
    const response=await fetch(`/api/wallet?address=${encodeURIComponent(address)}`);
    const data=await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(data.error||`Wallet HTTP ${response.status}`);
    walletSnapshot=data; renderWalletResult(); renderTradeAgents(); toast('Public wallet balance loaded.');
  } catch (error) {
    walletSnapshot=null; tradeEls.walletResult.textContent=error?.message||'Wallet lookup failed.';
    renderTradeAgents(); toast(error?.message||'Wallet lookup failed.','error');
  } finally { tradeEls.loadWallet.disabled=false; }
}

function openPaperTrade() {
  const asset=tradeEls.paperAsset.value;
  const side=tradeEls.paperSide.value;
  const mark=Number(marketBySymbol(asset)?.price);
  if (!Number.isFinite(mark)||mark<=0) return toast('Live market price required for paper execution.','error');
  const notional=Number(tradeEls.paperNotional.value);
  const stopPct=Number(tradeEls.paperStop.value);
  const takePct=Number(tradeEls.paperTake.value);
  if (!(stopPct>0)||!(takePct>0)) return toast('Stop and take-profit percentages must be positive.','error');
  const metrics=calculatePaperEquity(paperState,priceMap());
  const validation=validatePaperOrder({notional,equity:metrics.equity,exposure:metrics.exposure});
  if (!validation.ok) return toast(validation.error,'error');
  if (notional>paperState.cash) return toast('Not enough paper cash for this simulated position.','error');
  const isShort=side==='SELL';
  const position={
    id:`P${Date.now().toString(36).toUpperCase()}`,asset,side,notional,entryPrice:mark,
    stopLossPrice:isShort?mark*(1+stopPct/100):mark*(1-stopPct/100),
    takeProfitPrice:isShort?mark*(1-takePct/100):mark*(1+takePct/100),
    createdAt:new Date().toISOString()
  };
  paperState.cash-=notional; paperState.positions.push(position); savePaperState(); renderPaperPortfolio();
  toast(`${side} ${asset} paper position opened.`);
}

function closePaperTrade(id,reason='MANUAL') {
  const index=paperState.positions.findIndex((position)=>position.id===id);
  if (index<0) return;
  const position=paperState.positions[index];
  const mark=Number(marketBySymbol(position.asset)?.price)||position.entryPrice;
  const pnl=calculatePaperPnl(position,mark);
  paperState.cash+=Math.max(0,position.notional+pnl);
  paperState.positions.splice(index,1);
  paperState.history.unshift({...position,exitPrice:mark,realizedPnl:pnl,reason,closedAt:new Date().toISOString()});
  paperState.history=paperState.history.slice(0,100);
  savePaperState(); renderPaperPortfolio(); toast(`${position.asset} paper position closed: ${reason}.`);
}

async function processPaperStops() {
  const prices=priceMap();
  const triggers=paperState.positions.map((position)=>({position,reason:stopDecision(position,prices[position.asset])})).filter((item)=>item.reason);
  for (const trigger of triggers) closePaperTrade(trigger.position.id,trigger.reason);
}

function resetPaperPortfolio() {
  if (!confirm('Reset the local paper portfolio to $10,000? No real funds are involved.')) return;
  paperState={cash:PAPER_STARTING_CASH,positions:[],history:[]}; savePaperState(); renderPaperPortfolio(); toast('Paper portfolio reset.');
}

function routeTradingSnapshot() {
  const rows=marketSnapshot.assets.map((asset)=>{
    const change=Number(asset.change24h);
    return `${asset.symbol} ${price(asset.price)} (${Number.isFinite(change)?`${change>=0?'+':''}${change.toFixed(2)}% 24h`:'24h n/a'})`;
  });
  const metrics=calculatePaperEquity(paperState,priceMap());
  const walletLine=walletSnapshot?`${walletSnapshot.sol.toFixed(6)} SOL (public-address read only)`:'not loaded';
  const positions=paperState.positions.length?paperState.positions.map((p)=>`${p.side} ${p.asset} paper notional ${usd(p.notional)} @ ${price(p.entryPrice)}`).join('; '):'none';
  elements.objective.value=[
    'Analyze this crypto market snapshot as a PARALLAX research mission. This is PAPER TRADING ONLY: do not claim to execute real trades and do not request private keys or seed phrases.',
    '',
    `Market data: ${rows.join(' | ')||'live data unavailable'}`,
    `Public Solana wallet observation: ${walletLine}`,
    `Paper portfolio equity: ${usd(metrics.equity)}; exposure: ${metrics.equity?((metrics.exposure/metrics.equity)*100).toFixed(1):'0.0'}%; open positions: ${positions}.`,
    '',
    'Use specialist agents to assess market regime, downside risks, invalidation conditions, and a conservative paper-trade plan. Separate observed data from assumptions.'
  ].join('\n');
  updateCount(); elements.objective.scrollIntoView({behavior:'smooth',block:'center'}); elements.objective.focus();
  toast('Trading snapshot routed to mission input.');
}

tradeEls.refreshMarket?.addEventListener('click',()=>refreshMarketData());
tradeEls.loadWallet?.addEventListener('click',loadPublicWallet);
tradeEls.walletAddress?.addEventListener('keydown',(event)=>{if(event.key==='Enter')loadPublicWallet();});
tradeEls.paperExecute?.addEventListener('click',openPaperTrade);
tradeEls.paperReset?.addEventListener('click',resetPaperPortfolio);
tradeEls.routeTradingMission?.addEventListener('click',routeTradingSnapshot);
tradeEls.paperPositions?.addEventListener('click',(event)=>{const button=event.target.closest('[data-close-paper]');if(button)closePaperTrade(button.dataset.closePaper,'MANUAL');});

renderMarketStrip(); renderPaperPortfolio(); refreshMarketData({silent:true});
setInterval(()=>{if(document.visibilityState==='visible')refreshMarketData({silent:true});},30000);
