// Local Development & Verification Server for PadiFix
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Load .env variables before loading handlers
try {
  const envPath = path.join(ROOT, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const k = trimmed.slice(0, eqIdx).trim();
        const v = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[k]) process.env[k] = v;
      }
    }
  }
} catch (e) {}

const providersHandler = require('../api/providers.js');
const contactMeterHandler = require('../api/contact-meter.js');

const PORT = 8188;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;

  // 1. API: /api/providers
  if (pathname === '/api/providers') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      const mockReq = {
        method: req.method,
        query: Object.fromEntries(parsedUrl.searchParams),
        headers: req.headers,
        body: body ? JSON.parse(body) : {}
      };
      const mockRes = {
        _status: 200,
        _headers: {},
        status(c) { this._status = c; return this; },
        setHeader(k, v) { this._headers[k] = v; return this; },
        json(d) {
          res.writeHead(this._status, { 'Content-Type': 'application/json', ...this._headers });
          res.end(JSON.stringify(d));
        },
        end(data) {
          res.writeHead(this._status, this._headers);
          res.end(data);
        }
      };
      try {
        await providersHandler(mockReq, mockRes);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 2. API: /api/contact-meter
  if (pathname === '/api/contact-meter') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      const mockReq = {
        method: req.method,
        query: Object.fromEntries(parsedUrl.searchParams),
        headers: req.headers,
        body: body ? JSON.parse(body) : {}
      };
      const mockRes = {
        _status: 200,
        _headers: {},
        status(c) { this._status = c; return this; },
        setHeader(k, v) { this._headers[k] = v; return this; },
        json(d) {
          res.writeHead(this._status, { 'Content-Type': 'application/json', ...this._headers });
          res.end(JSON.stringify(d));
        },
        end(data) {
          res.writeHead(this._status, this._headers);
          res.end(data);
        }
      };
      try {
        await contactMeterHandler(mockReq, mockRes);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 3. Static Files
  let filePath = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);
  if (!fs.existsSync(filePath) && fs.existsSync(filePath + '.html')) {
    filePath += '.html';
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`PadiFix Local Server running on http://localhost:${PORT}`);
});
