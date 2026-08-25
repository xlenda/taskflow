const fs = require('fs');
const http = require('http');
const path = require('path');

const root = path.resolve(process.argv[2] || 'dist');
const port = Number(process.argv[3]);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('invalid_port');
}
if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error('missing_export_index');

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp',
};

const server = http.createServer((req, res) => {
  if (req.url === '/__celeste_health') {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    res.end('ok');
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  } catch (_error) {
    res.writeHead(400);
    res.end();
    return;
  }
  const relative = pathname.replace(/^\/+/, '');
  let file = path.resolve(root, relative || 'index.html');
  const rootPrefix = `${root}${path.sep}`;
  if (file !== root && !file.startsWith(rootPrefix)) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(root, 'index.html');
    const stat = fs.statSync(file);
    res.writeHead(200, {
      'Content-Type': contentTypes[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-store',
    });
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(file).pipe(res);
  } catch (_error) {
    res.writeHead(500);
    res.end();
  }
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Celeste export ready on http://127.0.0.1:${port}\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
