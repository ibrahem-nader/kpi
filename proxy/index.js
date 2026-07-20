const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3131;
const CLICKUP_BASE = 'api.clickup.com';
const CLICKUP_TOKEN = process.env.CLICKUP_TOKEN || '';
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const SUPABASE_TABLE = String(process.env.SUPABASE_TABLE || 'kpi_manual_data').trim();
const SUPABASE_ROW_KEY = String(process.env.SUPABASE_ROW_KEY || 'global').trim();
const hasSupabaseStorage = !!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const FRONTEND_DIST = path.resolve(__dirname, '../frontend/dist');
const INDEX_HTML = path.join(FRONTEND_DIST, 'index.html');
const APP_DATA_DIR = path.resolve(
  process.env.APP_DATA_DIR ||
  process.env.RENDER_DISK_ROOT ||
  path.join(__dirname, '../data')
);
const MANUAL_DATA_FILE = path.join(APP_DATA_DIR, 'manual-data.json');
const SESSION_COOKIE = 'kpi_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const PERSONAL_ACCESS_HEADER = 'x-kpi-personal-access';
const authUsers = parseAuthUsers(process.env.AUTH_USERS_JSON || process.env.KPI_AUTH_USERS || '');
const authEnabled = authUsers.length > 0;
const sessions = new Map();
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

function sendJsonWithHeaders(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
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

function parseAuthUsers(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(user => ({
        username: String(user.username || '').trim(),
        password: String(user.password || ''),
        role: String(user.role || 'employee').trim().toLowerCase(),
        memberId: user.memberId !== undefined && user.memberId !== null ? String(user.memberId) : '',
      }))
      .filter(user => user.username && user.password && ['admin', 'manager', 'employee'].includes(user.role));
  } catch {
    return [];
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return header.split(';').reduce((acc, pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return acc;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (key) acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

function getSessionUser(req) {
  if (!authEnabled) return { username: 'open-access', role: 'admin', memberId: '' };
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session.user;
}

function createSession(user) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, {
    user: {
      username: user.username,
      role: user.role,
      memberId: user.memberId || '',
    },
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

function sessionCookieValue(token) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
}

function clearSession(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) sessions.delete(token);
}

function clearSessionCookieValue() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function requireAuth(req, res) {
  const user = getSessionUser(req);
  if (!user) {
    sendJson(res, 401, { error: 'Authentication required' });
    return null;
  }
  return user;
}

function canWriteManualData(user) {
  return user && (user.role === 'admin' || user.role === 'manager');
}

function isPersonalAccessRequest(req) {
  return String(req.headers[PERSONAL_ACCESS_HEADER] || '') === '1';
}

function ensureDataDir() {
  fs.mkdirSync(APP_DATA_DIR, { recursive: true });
}

function defaultManualData() {
  return { periods: {} };
}

function normalizeManualData(parsed) {
  if (parsed?.periods && typeof parsed.periods === 'object') {
    return { periods: parsed.periods };
  }
  return {
    periods: {
      default: {
        competencies: parsed?.competencies && typeof parsed.competencies === 'object' ? parsed.competencies : {},
        manualKpis: parsed?.manualKpis && typeof parsed.manualKpis === 'object' ? parsed.manualKpis : {},
      },
    },
  };
}

function readManualData() {
  try {
    ensureDataDir();
    if (!fs.existsSync(MANUAL_DATA_FILE)) return defaultManualData();
    const raw = fs.readFileSync(MANUAL_DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw || '{}') || {};
    return normalizeManualData(parsed);
  } catch {
    return defaultManualData();
  }
}

function writeManualData(data) {
  ensureDataDir();
  const payload = {
    periods: data?.periods && typeof data.periods === 'object' ? data.periods : {},
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(MANUAL_DATA_FILE, JSON.stringify(payload, null, 2));
  return payload;
}

function supabaseRequest(method, pathName, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    if (!hasSupabaseStorage) {
      reject(new Error('Supabase storage is not configured'));
      return;
    }
    const baseUrl = new URL(SUPABASE_URL);
    const requestPath = `/rest/v1/${pathName.replace(/^\/+/, '')}`;
    const options = {
      hostname: baseUrl.hostname,
      port: baseUrl.port || (baseUrl.protocol === 'http:' ? 80 : 443),
      path: `${baseUrl.pathname.replace(/\/$/, '')}${requestPath}`,
      method,
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
    };
    const reqClient = baseUrl.protocol === 'http:' ? http : https;
    const req = reqClient.request(options, (supabaseRes) => {
      let data = '';
      supabaseRes.on('data', chunk => { data += chunk; });
      supabaseRes.on('end', () => {
        const text = data || '';
        const ok = supabaseRes.statusCode >= 200 && supabaseRes.statusCode < 300;
        let parsed = null;
        if (text) {
          try { parsed = JSON.parse(text); } catch { parsed = text; }
        }
        if (!ok) {
          reject(new Error(`Supabase ${supabaseRes.statusCode}: ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`));
          return;
        }
        resolve(parsed);
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

async function readManualDataFromSupabase() {
  const query = `${SUPABASE_TABLE}?key=eq.${encodeURIComponent(SUPABASE_ROW_KEY)}&select=periods,updated_at&limit=1`;
  const rows = await supabaseRequest('GET', query);
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return normalizeManualData({ periods: rows[0]?.periods || {} });
}

async function writeManualDataToSupabase(data) {
  const payload = {
    key: SUPABASE_ROW_KEY,
    periods: data?.periods && typeof data.periods === 'object' ? data.periods : {},
    updated_at: new Date().toISOString(),
  };
  await supabaseRequest(
    'POST',
    `${SUPABASE_TABLE}?on_conflict=key`,
    [payload],
    { Prefer: 'resolution=merge-duplicates,return=minimal' }
  );
  return { periods: payload.periods, updatedAt: payload.updated_at };
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-ClickUp-Token');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/health') {
    sendJson(res, 200, { status: 'ok', manualStorage: hasSupabaseStorage ? 'supabase' : 'file' });
    return;
  }

  if (req.url === '/api/auth/status') {
    const user = getSessionUser(req);
    sendJson(res, 200, {
      enabled: authEnabled,
      authenticated: !!user,
      user: user ? {
        username: user.username,
        role: user.role,
        memberId: user.memberId || '',
      } : null,
    });
    return;
  }

  if (req.url === '/api/auth/login') {
    if (!authEnabled) {
      sendJson(res, 200, { enabled: false, authenticated: true, user: { username: 'open-access', role: 'admin', memberId: '' } });
      return;
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }
    readJsonBody(req)
      .then(body => {
        const username = String(body?.username || '').trim();
        const password = String(body?.password || '');
        const matchedUser = authUsers.find(user => user.username === username && user.password === password);
        if (!matchedUser) {
          sendJson(res, 401, { error: 'Invalid username or password' });
          return;
        }
        const token = createSession(matchedUser);
        sendJsonWithHeaders(res, 200, {
          enabled: true,
          authenticated: true,
          user: {
            username: matchedUser.username,
            role: matchedUser.role,
            memberId: matchedUser.memberId || '',
          },
        }, {
          'Set-Cookie': sessionCookieValue(token),
        });
      })
      .catch(error => {
        sendJson(res, 400, { error: error.message });
      });
    return;
  }

  if (req.url === '/api/auth/logout') {
    clearSession(req);
    sendJsonWithHeaders(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookieValue() });
    return;
  }

  if (req.url === '/app-config.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    res.end(`window.__APP_CONFIG__ = ${JSON.stringify(RUNTIME_APP_CONFIG)};`);
    return;
  }

  if (req.url === '/api/manual-data') {
    if (req.method === 'GET') {
      if (authEnabled && !isPersonalAccessRequest(req)) {
        const user = requireAuth(req, res);
        if (!user) return;
      }
      if (hasSupabaseStorage) {
        readManualDataFromSupabase()
          .then(data => sendJson(res, 200, data || defaultManualData()))
          .catch(error => sendJson(res, 500, { error: error.message }))
        return;
      }
      sendJson(res, 200, readManualData());
      return;
    }
    if (req.method === 'PUT') {
      const user = requireAuth(req, res);
      if (!user) return;
      if (!canWriteManualData(user)) {
        sendJson(res, 403, { error: 'Only managers or admins can update manual data' });
        return;
      }
      readJsonBody(req)
        .then(body => {
          if (hasSupabaseStorage) {
            return writeManualDataToSupabase(body).then(saved => sendJson(res, 200, saved));
          }
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

  if (authEnabled && req.url.startsWith('/api/v2/') && !isPersonalAccessRequest(req)) {
    const user = requireAuth(req, res);
    if (!user) return;
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
  console.log(`Manual storage backend: ${hasSupabaseStorage ? 'supabase' : 'file'}`);
  console.log(`Manual data path: ${MANUAL_DATA_FILE}`);
});
