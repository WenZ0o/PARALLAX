import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMission } from './lib/orchestrator.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 3000);

async function loadEnv() {
  try {
    const text = await readFile(join(root, '.env'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index < 1) continue;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {}
}

await loadEnv();

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8'
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'content-type': type,
    'x-content-type-options': 'nosniff',
    'cache-control': 'no-store'
  });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error('Request too large.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/api/run') {
      if (req.method !== 'POST') return send(res, 405, JSON.stringify({ error: 'Method not allowed' }));
      const body = await readJson(req);
      const result = await runMission({ objective: String(body.objective || '').trim() });
      return send(res, 200, JSON.stringify(result));
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain');

    const requested = url.pathname === '/' ? '/index.html' : url.pathname;
    const safePath = normalize(requested).replace(/^([.][.][/\\])+/, '');
    const filePath = join(root, safePath);
    if (!filePath.startsWith(root)) return send(res, 403, 'Forbidden', 'text/plain');

    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('Not found');
    const data = await readFile(filePath);
    res.writeHead(200, {
      'content-type': mime[extname(filePath)] || 'application/octet-stream',
      'x-content-type-options': 'nosniff'
    });
    if (req.method === 'HEAD') return res.end();
    res.end(data);
  } catch (error) {
    const status = /not found/i.test(error?.message || '') ? 404 : 500;
    send(res, status, JSON.stringify({ error: error?.message || 'Server error' }));
  }
});

server.listen(port, () => {
  console.log(`PARALLAX online at http://localhost:${port}`);
  console.log(process.env.OPENAI_API_KEY ? 'AI mode: configured' : 'AI mode: no key (Demo mode available)');
});
