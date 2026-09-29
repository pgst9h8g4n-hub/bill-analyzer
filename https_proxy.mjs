import { createServer as createHttpsServer } from 'node:https';
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, unlinkSync, statSync } from 'node:fs';
import os from 'node:os';
import { join, dirname, extname } from 'node:path';
import { spawn } from 'node:child_process';

const PORT = 8443;
const CERT_PATH = 'E:/消费记账软件/bill-analyzer/static/localhost.crt';
const KEY_PATH = 'E:/消费记账软件/bill-analyzer/static/localhost.key';
const STATIC_ROOT = 'E:/消费记账软件/bill-analyzer/static';
const BUILD_ROOT = 'E:/消费记账软件/bill-analyzer/build';

// Copy lang data to build dir
const LANG_MAP = [
  ['static/chi_sim.traineddata.gz',       'build/4.0.0_best_int/chi_sim.traineddata.gz'],
  ['static/eng.traineddata.gz',            'build/4.0.0_best_int/eng.traineddata.gz'],
  ['static/chi_sim/4.0.0_best_int/chi_sim.traineddata.gz', 'build/chi_sim/4.0.0_best_int/chi_sim.traineddata.gz'],
  ['static/eng/4.0.0_best_int/eng.traineddata.gz',         'build/eng/4.0.0_best_int/eng.traineddata.gz'],
];
for (const [src, dest] of LANG_MAP) {
  const dstPath = join('E:/消费记账软件/bill-analyzer', dest);
  if (!existsSync(dstPath)) {
    mkdirSync(dirname(dstPath), { recursive: true });
    copyFileSync(join('E:/消费记账软件/bill-analyzer', src), dstPath);
  }
}

const LANG_DATA = {
  '/chi_sim.traineddata.gz':                             'static/chi_sim.traineddata.gz',
  '/eng.traineddata.gz':                                 'static/eng.traineddata.gz',
  '/4.0.0_best_int/chi_sim.traineddata.gz':              'static/chi_sim.traineddata.gz',
  '/4.0.0_best_int/eng.traineddata.gz':                  'static/eng.traineddata.gz',
  '/chi_sim/4.0.0_best_int/chi_sim.traineddata.gz':      'static/chi_sim/4.0.0_best_int/chi_sim.traineddata.gz',
  '/eng/4.0.0_best_int/eng.traineddata.gz':              'static/eng/4.0.0_best_int/eng.traineddata.gz',
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.wasm': 'application/wasm',
  '.gz':   'application/gzip',
  '.txt':  'text/plain',
  '.xml':  'application/xml',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.mp4':  'video/mp4',
  '.mp3':  'audio/mpeg',
};

function getLANIPs() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const [name, iface] of Object.entries(nets)) {
    if (name.includes('Loopback')) continue;
    for (const addr of iface) {
      if (!addr.internal && addr.family === 'IPv4') ips.push(addr.address);
    }
  }
  return [...new Set(ips)];
}

async function ensureCert() {
  const ips = getLANIPs();
  const ipList = [...new Set([...ips, '127.0.0.1'])];
  try {
    const cert = readFileSync(CERT_PATH);
    const key = readFileSync(KEY_PATH);
    createHttpsServer({ key, cert }, () => {}).close();
    return;
  } catch {
    let cnf = `
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
x509_extensions = v3_req
[dn]
CN = Bill Analyzer
[v3_req]
subjectAltName = @alt_names
[alt_names]
DNS.1 = localhost
IP.1 = 127.0.0.1
`;
    let ipIdx = 2;
    ipList.forEach(ip => { cnf += `IP.${ipIdx++} = ${ip}\n`; });
    const cnfPath = join(STATIC_ROOT, 'openssl_auto.cnf');
    writeFileSync(cnfPath, cnf);
    const gen = spawn('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048',
      '-keyout', KEY_PATH, '-out', CERT_PATH,
      '-days', '3650', '-config', cnfPath, '-nodes'
    ], { stdio: 'ignore' });
    await new Promise((resolve, reject) => {
      gen.on('close', code => code === 0 ? resolve() : reject(new Error(`openssl exit ${code}`)));
    });
    unlinkSync(cnfPath);
    console.log('Cert generated with IPs:', ipList.join(', '));
  }
}

function serveStatic(req, res, urlPath) {
  // Language data files (tesseract worker requests)
  const langFile = LANG_DATA[urlPath];
  if (langFile) {
    try {
      const data = readFileSync(join('E:/消费记账软件/bill-analyzer', langFile));
      res.writeHead(200, {
        'content-type': 'application/gzip',
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=31536000, immutable',
        'content-length': data.length,
      });
      res.end(data);
      return;
    } catch (e) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
  }

  // Try to serve from build directory
  const fullPath = join(BUILD_ROOT, urlPath);

  // Check if path exists and is a file
  try {
    const st = statSync(fullPath);
    if (st.isFile()) {
      const data = readFileSync(fullPath);
      const ext = extname(urlPath);
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'content-type': contentType,
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=31536000, immutable',
        'content-length': data.length,
      });
      res.end(data);
      return;
    }
  } catch {}

  // SPA fallback: serve index.html for any non-file path
  try {
    const indexPath = join(BUILD_ROOT, 'index.html');
    const data = readFileSync(indexPath);
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': 'no-cache, no-store, must-revalidate',
    });
    res.end(data);
  } catch {
    res.writeHead(500);
    res.end('Internal Server Error');
  }
}

function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  serveStatic(req, res, url.pathname);
}

async function main() {
  await ensureCert();
  const server = createHttpsServer({
    key: readFileSync(KEY_PATH), cert: readFileSync(CERT_PATH)
  }, handleRequest);
  server.listen(PORT, '0.0.0.0', () => {
    const ips = getLANIPs();
    console.log('HTTPS server at https://localhost:' + PORT + '/');
    ips.forEach(ip => console.log(`  LAN: https://${ip}:${PORT}/`));
  });
}
main().catch(console.error);
