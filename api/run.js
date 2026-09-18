import { runMission } from '../lib/orchestrator.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const objective = String(body.objective || '').trim();
    if (!objective) {
      res.status(400).json({ error: 'Objective is required.' });
      return;
    }

    const data = await runMission({ objective });
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Mission failed.' });
  }
}
