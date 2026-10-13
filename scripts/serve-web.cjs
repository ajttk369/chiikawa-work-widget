const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon' };
const allowedFiles = new Set([
  'index.html', 'schedule.js', 'web/host.js', 'web/web.css',
  'renderer/index.html', 'renderer/widget.js', 'renderer/widget.css',
  'renderer/settings.html', 'renderer/settings.js', 'renderer/settings.css', 'renderer/web-bridge.js',
  'assets/meadow-atlas.png', 'assets/characters-atlas-v2.png', 'assets/food-atlas.png',
  'assets/chiikawa.ico', 'assets/chiikawa-favicon.png', 'assets/chiikawa-touch.png',
  'node_modules/lucide/dist/umd/lucide.min.js'
]);
const server = http.createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (!allowedFiles.has(file)) { response.writeHead(404); response.end('Not found'); return; }
    const data = await fs.readFile(path.join(ROOT, file));
    response.writeHead(200, {
      'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer'
    });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' ? 404 : 400); response.end('Unable to load file');
  }
});
let port = 5178;
server.on('error', error => {
  if (error.code === 'EADDRINUSE' && port < 5190) server.listen(++port, '127.0.0.1');
  else { console.error(error.message); process.exitCode = 1; }
});
server.listen(port, '127.0.0.1', () => console.log(`Web widget: http://127.0.0.1:${server.address().port}`));
