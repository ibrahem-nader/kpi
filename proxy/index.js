const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3131;
const CLICKUP_BASE = 'api.clickup.com';
const CLICKUP_TOKEN = process.env.CLICKUP_TOKEN || '';
const FRONTEND_DIST = path.resolve(__dirname, '../frontend/dist');
const INDEX_HTML = path.join(FRONTEND_DIST, 'index.html');
const APP_DATA_DIR = path.resolve(process.env.APP_DATA_DIR || path.join(__dirname, '../data'));
const MANUAL_DATA_FILE = path.join(APP_DATA_DIR, 'manual-data.json');
const RUNTIME_APP_CONFIG = {
  teamId: process.env.TEAM_ID || process.env.VITE_TEAM_ID || '',
  groupId: process.env.GROUP_ID || process.env.VITE_GROUP_ID || '',
  bugsListId: process.env.BUGS_LIST_ID || process.env.VITE_BUGS_LIST_ID || '',
  backlogListId: process.env.BACKLOG_LIST_ID || process.env.VITE_BACKLOG_LIST_ID || '',
  sprintParentId: process.env.SPRINT_PARENT_ID || process.env.VITE_SPRINT_PARENT_ID || '',
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        sendJson(res, 404, { error: 'Not found' });
        return;
      }
      sendJson(res, 500, { error: err.message });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function ensureDataDir() {
  fs.mkdirSync(APP_DATA_DIR, { recursive: true });
}

function defaultManualData() {
  return { competencies: {}, manualKpis: {} };
}

function readManualData() {
  try {
    ensureDataDir();
    if (!fs.existsSync(MANUAL_DATA_FILE)) return defaultManualData();
    const raw = fs.readFileSync(MANUAL_DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw || '{}') || {};
    return {
      competencies: parsed.competencies && typeof parsed.competencies === 'object' ? parsed.competencies : {},
      manualKpis: parsed.manualKpis && typeof parsed.manualKpis === 'object' ? parsed.manualKpis : {},
    };
  } catch {
    return defaultManualData();
  }
}

function writeManualData(data) {
  ensureDataDir();
  const payload = {
    competencies: data?.competencies && typeof data.competencies === 'object' ? data.competencies : {},
    manualKpis: data?.manualKpis && typeof data.manualKpis === 'object' ? data.manualKpis : {},
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(MANUAL_DATA_FILE, JSON.stringify(payload, null, 2));
  return payload;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-ClickUp-Token');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/health') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }

  if (req.url === '/app-config.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    res.end(`window.__APP_CONFIG__ = ${JSON.stringify(RUNTIME_APP_CONFIG)};`);
    return;
  }

  if (req.url === '/api/manual-data') {
    if (req.method === 'GET') {
      sendJson(res, 200, readManualData());
      return;
    }
    if (req.method === 'PUT') {
      readJsonBody(req)
        .then(body => {
          const saved = writeManualData(body);
          sendJson(res, 200, saved);
        })
        .catch(error => {
          sendJson(res, 400, { error: error.message });
        });
      return;
    }
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  if (!req.url.startsWith('/api/v2/')) {
    const reqPath = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
    const normalizedPath = reqPath === '/' ? INDEX_HTML : path.join(FRONTEND_DIST, reqPath.replace(/^\/+/, ''));

    if (!normalizedPath.startsWith(FRONTEND_DIST)) {
      sendJson(res, 403, { error: 'Forbidden' });
      return;
    }

    if (reqPath !== '/' && fs.existsSync(normalizedPath) && fs.statSync(normalizedPath).isFile()) {
      serveFile(res, normalizedPath);
      return;
    }

    if (fs.existsSync(INDEX_HTML)) {
      serveFile(res, INDEX_HTML);
      return;
    }

    sendJson(res, 404, { error: 'Frontend build not found. Run the frontend build before starting the server.' });
    return;
  }

  const token = CLICKUP_TOKEN || req.headers['x-clickup-token'];
  if (!token) {
    sendJson(res, 401, { error: 'No token. Set CLICKUP_TOKEN env var or pass X-ClickUp-Token header.' });
    return;
  }

  const options = {
    hostname: CLICKUP_BASE,
    path: req.url,
    method: 'GET',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
  };

  const proxyReq = https.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (e) => {
    sendJson(res, 502, { error: e.message });
  });

  proxyReq.end();
});

server.listen(PORT, () => {
  console.log(`KPI app server running on http://localhost:${PORT}`);
  console.log(`Token: ${CLICKUP_TOKEN ? 'set via env' : 'expecting X-ClickUp-Token header per request'}`);
});
