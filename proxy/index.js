const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3131;
const CLICKUP_BASE = 'api.clickup.com';
const CLICKUP_TOKEN = process.env.CLICKUP_TOKEN || '';
const FRONTEND_DIST = path.resolve(__dirname, '../frontend/dist');
const INDEX_HTML = path.join(FRONTEND_DIST, 'index.html');

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

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
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
