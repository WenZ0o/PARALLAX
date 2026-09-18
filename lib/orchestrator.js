const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna';

function clip(value, max = 14000) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max)}\n...[truncated]` : text;
}

export function extractText(response) {
  if (!response || !Array.isArray(response.output)) return '';
  for (const item of response.output) {
    if (!Array.isArray(item?.content)) continue;
    for (const part of item.content) {
      if (part?.type === 'output_text' && typeof part.text === 'string') return part.text;
    }
  }
  return '';
}

export function parsePlannerJson(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || raw;

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end + 1));
    throw new Error('Planner did not return valid JSON.');
  }
}

export function normalizeAgents(value) {
  const list = Array.isArray(value?.agents) ? value.agents : [];
  const seen = new Set();
  const normalized = [];

  for (const raw of list.slice(0, 4)) {
    const base = String(raw?.id || raw?.role || `agent-${normalized.length + 1}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || `agent-${normalized.length + 1}`;
    const id = seen.has(base) ? `${base}-${normalized.length + 1}` : base;
    seen.add(id);
    normalized.push({
      id,
      role: clip(raw?.role || 'Specialist', 80),
      goal: clip(raw?.goal || 'Investigate the assigned slice of the objective.', 500),
      deliverable: clip(raw?.deliverable || 'A concise, evidence-based artifact.', 300)
    });
  }

  if (normalized.length < 2) {
    normalized.push(
      { id: 'analyst', role: 'Systems Analyst', goal: 'Map constraints, dependencies, and likely failure modes.', deliverable: 'Constraint and dependency map.' },
      { id: 'builder', role: 'Solution Builder', goal: 'Produce the most practical implementation path.', deliverable: 'Actionable implementation artifact.' }
    );
  }

  return normalized.slice(0, 4);
}

async function callOpenAI({ apiKey, model, system, user }) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      input: [
        { role: 'developer', content: [{ type: 'input_text', text: system }] },
        { role: 'user', content: [{ type: 'input_text', text: user }] }
      ]
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `OpenAI request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }

  const text = extractText(data);
  if (!text) throw new Error('OpenAI response contained no output text.');
  return { text, usage: data.usage || null, id: data.id || null };
}

function usageTotal(usage) {
  if (!usage) return 0;
  return Number(usage.total_tokens || 0);
}

export async function runMission({ objective, apiKey = process.env.OPENAI_API_KEY, model = DEFAULT_MODEL }) {
  const mission = clip(objective, 6000).trim();
  if (!mission) throw new Error('Objective is required.');
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured. Use Demo mode or add a key on the server.');

  const startedAt = Date.now();
  const timeline = [];
  let totalTokens = 0;

  timeline.push({ stage: 'brief', status: 'completed', at: Date.now(), message: 'Objective locked and normalized.' });

  const planner = await callOpenAI({
    apiKey,
    model,
    system: [
      'You are PARALLAX Planner, a lead agent that never solves the task itself.',
      'Decompose the objective into 2-4 independent specialist tasks that can run in parallel.',
      'Avoid duplicated responsibilities. Prefer complementary perspectives.',
      'Return ONLY valid JSON with this exact top-level shape:',
      '{"mission":"short mission label","agents":[{"id":"short-id","role":"role name","goal":"specific task","deliverable":"expected artifact"}]}.'
    ].join('\n'),
    user: mission
  });
  totalTokens += usageTotal(planner.usage);
  const plan = parsePlannerJson(planner.text);
  const agents = normalizeAgents(plan);
  timeline.push({ stage: 'plan', status: 'completed', at: Date.now(), message: `${agents.length} specialists spawned.` });

  const workerResults = await Promise.all(agents.map(async (agent) => {
    const start = Date.now();
    timeline.push({ stage: agent.id, status: 'running', at: start, message: `${agent.role} started.` });
    const result = await callOpenAI({
      apiKey,
      model,
      system: [
        `You are ${agent.role}, one specialist inside a multi-agent system.`,
        `Your assigned goal: ${agent.goal}`,
        `Expected deliverable: ${agent.deliverable}`,
        'Work only on your slice. Do not pretend to have tools, sources, or data you do not actually have.',
        'State assumptions and uncertainty. Return a compact but useful artifact in Markdown.'
      ].join('\n'),
      user: `Global objective:\n${mission}`
    });
    totalTokens += usageTotal(result.usage);
    const completed = Date.now();
    timeline.push({ stage: agent.id, status: 'completed', at: completed, message: `${agent.role} completed in ${completed - start} ms.` });
    return { ...agent, output: result.text, durationMs: completed - start, responseId: result.id };
  }));

  const evidencePacket = workerResults
    .map((r, index) => `### SPECIALIST ${index + 1}: ${r.role}\nGOAL: ${r.goal}\n\n${clip(r.output, 10000)}`)
    .join('\n\n');

  timeline.push({ stage: 'verify', status: 'running', at: Date.now(), message: 'Adversarial verifier checking conflicts and omissions.' });
  const verifier = await callOpenAI({
    apiKey,
    model,
    system: [
      'You are PARALLAX Verifier. You do not solve the original task from scratch.',
      'Audit specialist artifacts for contradictions, unsupported claims, missing constraints, duplicated work, and implementation risk.',
      'Return Markdown with sections: Verdict, Conflicts, Missing, Keep, Repair Notes.',
      'Be specific. If an artifact is sound, say so. Do not manufacture problems.'
    ].join('\n'),
    user: `OBJECTIVE:\n${mission}\n\nARTIFACTS:\n${evidencePacket}`
  });
  totalTokens += usageTotal(verifier.usage);
  timeline.push({ stage: 'verify', status: 'completed', at: Date.now(), message: 'Verification gate passed to synthesis.' });

  timeline.push({ stage: 'synthesis', status: 'running', at: Date.now(), message: 'Synthesizer assembling final decision artifact.' });
  const synthesis = await callOpenAI({
    apiKey,
    model,
    system: [
      'You are PARALLAX Synthesizer.',
      'Produce the final answer to the user objective using the specialist artifacts and verifier audit.',
      'Resolve contradictions explicitly. Keep uncertainty visible. Prefer concrete next actions over filler.',
      'Return polished Markdown. Do not mention internal chain-of-thought; summarize conclusions and evidence only.'
    ].join('\n'),
    user: `OBJECTIVE:\n${mission}\n\nSPECIALIST ARTIFACTS:\n${evidencePacket}\n\nVERIFIER AUDIT:\n${clip(verifier.text, 10000)}`
  });
  totalTokens += usageTotal(synthesis.usage);
  timeline.push({ stage: 'synthesis', status: 'completed', at: Date.now(), message: 'Mission artifact compiled.' });

  return {
    mission: plan?.mission || 'PARALLAX mission',
    objective: mission,
    model,
    agents: workerResults,
    verifier: verifier.text,
    result: synthesis.text,
    metrics: {
      agentCount: workerResults.length,
      totalTokens,
      durationMs: Date.now() - startedAt,
      parallelWidth: workerResults.length
    },
    timeline
  };
}
