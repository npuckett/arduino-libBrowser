#!/usr/bin/env node
/**
 * Tiny static file server for development and E2E tests.
 *
 * Usage:
 *   node scripts/serve.mjs [port]
 *
 * Cross-platform alternative to Start-Server.ps1 (which is Windows-only).
 *
 * The existing Start-Server.ps1 stays for Windows devs; this is additive.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(__dirname, '..');
const port = Number(process.argv[2]) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.gz': 'application/gzip',
  '.map': 'application/json',
};

async function tryFile(path) {
  try {
    const s = await stat(path);
    if (s.isFile()) return path;
  } catch {
    // not found
  }
  return null;
}

function logLine(...args) {
  const ts = new Date().toISOString();
  console.log(`[${ts}]`, ...args);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/' || pathname === '') pathname = '/index.html';

  const target = normalize(join(root, pathname));
  if (!target.startsWith(root + sep) && target !== root) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  let resolved = await tryFile(target);
  if (!resolved) {
    // For SPA-like behavior, fall back to index.html
    if (pathname.startsWith('/output/') || pathname.startsWith('/input/')) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`File not found: ${pathname}`);
      logLine('404', req.method, pathname);
      return;
    }
    pathname = '/index.html';
    resolved = await tryFile(join(root, pathname));
  }
  if (!resolved) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(`File not found: ${pathname}`);
    logLine('404', req.method, pathname);
    return;
  }

  try {
    const body = await readFile(resolved);
    const ext = extname(resolved).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
    });
    res.end(body);
    logLine('200', req.method, pathname, body.length);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    const message = err instanceof Error ? err.message : String(err);
    res.end(`Internal error: ${message}`);
    logLine('500', req.method, pathname, message);
  }
});

server.listen(port, () => {
  logLine(`listening on http://localhost:${port}`);
});
