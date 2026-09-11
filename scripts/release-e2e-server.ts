import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, request } from 'node:http';
import { Socket } from 'node:net';
import { provisionTestDatabase } from '../tests/support/database';

const API_PORT = 3211;
const WEB_PORT = 3212;
const GATEWAY_PORT = 3200;
const children: ChildProcess[] = [];
const database = await provisionTestDatabase('diary_v3_release_e2e');
let shuttingDown = false;

function start(command: string, args: string[], env: NodeJS.ProcessEnv) {
  const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: 'inherit' });
  children.push(child);
  child.once('exit', code => {
    if (code && !shuttingDown) {
      console.error(`${command} exited with ${code}`);
      void shutdown(1);
    }
  });
}

async function waitForPort(port: number) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await new Promise<boolean>(resolve => {
      const socket = new Socket();
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => resolve(false));
      socket.connect(port, '127.0.0.1');
    })) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for port ${port}`);
}

start('node', ['dist/api/server.js'], {
  API_HOST: '127.0.0.1', API_PORT: String(API_PORT), DATABASE_URL: database.url,
  JWT_SECRET: 'release-e2e-only-secret-never-use-in-production-123456',
  MARKET_PROVIDER: 'fixture', NODE_ENV: 'test', WEB_ORIGIN: `http://127.0.0.1:${GATEWAY_PORT}`,
});
start('npm', ['run', 'start', '--workspace=@diary/web'], {
  HOST: '127.0.0.1', PORT: String(WEB_PORT), API_ORIGIN: `http://127.0.0.1:${API_PORT}`, NODE_ENV: 'production',
});
await Promise.all([waitForPort(API_PORT), waitForPort(WEB_PORT)]);

const gateway = createServer((incoming, outgoing) => {
  const api = incoming.url?.startsWith('/api/') || incoming.url?.startsWith('/socket.io/') || incoming.url === '/healthz' || incoming.url === '/readyz';
  const upstream = request({
    hostname: '127.0.0.1', port: api ? API_PORT : WEB_PORT, method: incoming.method,
    path: incoming.url, headers: { ...incoming.headers, host: `127.0.0.1:${api ? API_PORT : WEB_PORT}` },
  }, response => {
    outgoing.writeHead(response.statusCode ?? 502, response.headers);
    response.pipe(outgoing);
  });
  upstream.on('error', error => { outgoing.writeHead(502); outgoing.end(error.message); });
  incoming.pipe(upstream);
});
gateway.listen(GATEWAY_PORT, '127.0.0.1');
console.log(`Release artifact gateway listening on http://127.0.0.1:${GATEWAY_PORT}`);

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  gateway.close();
  for (const child of children) child.kill('SIGTERM');
  await Promise.all(children.map(child => new Promise<void>(resolve => child.once('exit', () => resolve()))));
  await database.dispose();
  process.exit(code);
}
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
