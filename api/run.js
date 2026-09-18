import { runMission } from '../lib/orchestrator.js';

export async function POST(request) {
  try {
    const body = await request.json();
    const objective = String(body?.objective || '').trim();

    if (!objective) {
      return Response.json({ error: 'Objective is required.' }, { status: 400 });
    }

    const data = await runMission({ objective });
    return Response.json(data, { status: 200 });
  } catch (error) {
    return Response.json(
      { error: error?.message || 'Mission failed.' },
      { status: 500 }
    );
  }
}

export function GET() {
  return Response.json(
    { error: 'Method not allowed' },
    { status: 405, headers: { Allow: 'POST' } }
  );
}
