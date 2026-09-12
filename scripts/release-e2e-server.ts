import { randomUUID } from 'node:crypto';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createServer, request } from 'node:http';
import { Socket } from 'node:net';
import { provisionTestDatabase } from '../tests/support/database';
import bcrypt from 'bcryptjs';
import { e2eBaseURL, e2eWebPort } from '../tests/support/e2e-origin';

const API_PORT = 3211;
const WEB_PORT = 3212;
const GATEWAY_PORT = e2eWebPort;
const children: ChildProcess[] = [];
const containerNames: string[] = [];
const apiImage = process.env.RELEASE_E2E_API_IMAGE;
const webImage = process.env.RELEASE_E2E_WEB_IMAGE;
const apiImageId = process.env.RELEASE_E2E_API_IMAGE_ID;
const webImageId = process.env.RELEASE_E2E_WEB_IMAGE_ID;
const dockerNetwork = process.env.RELEASE_E2E_DOCKER_NETWORK;
const dockerLabel = process.env.RELEASE_E2E_DOCKER_LABEL ?? String(process.pid);
const usesDockerImages = Boolean(apiImage || webImage);
let shuttingDown = false;
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
if (Boolean(apiImage) !== Boolean(webImage)) throw new Error('Both RELEASE_E2E_API_IMAGE and RELEASE_E2E_WEB_IMAGE are required');
if (process.env.CI === 'true' && !usesDockerImages) throw new Error('CI release E2E requires the built API and Web Docker images');
if (usesDockerImages && (!dockerNetwork || !/^container:[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(dockerNetwork))) {
  throw new Error('RELEASE_E2E_DOCKER_NETWORK must identify the test job container');
}
if (usesDockerImages && process.env.CI === 'true' && (!apiImageId || !webImageId)) {
  throw new Error('CI release E2E requires the built API and Web image IDs');
}
if (!/^[A-Za-z0-9_.-]+$/.test(dockerLabel)) throw new Error('RELEASE_E2E_DOCKER_LABEL contains unsupported characters');
if (usesDockerImages) {
  assertDockerImage(apiImage!, apiImageId);
  assertDockerImage(webImage!, webImageId);
}
const database = await provisionTestDatabase('diary_v3_release_e2e');
try {
  await database.pool.query("insert into users(email,password,role) values ($1,$2,'ADMIN')", ['release-admin@example.test', await bcrypt.hash('synthetic-release-admin-password', 4)]);
} catch (error) {
  await database.dispose();
  throw error;
}

function start(command: string, args: string[], env: NodeJS.ProcessEnv) {
  const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: 'inherit' });
  children.push(child);
  child.once('exit', code => {
    if (!shuttingDown) {
      console.error(`${command} exited unexpectedly with ${code}`);
      void shutdown(1);
    }
  });
  child.once('error', error => {
    if (!shuttingDown) {
      console.error(`${command} failed to start: ${error.message}`);
      void shutdown(1);
    }
  });
}

function assertDockerImage(image: string, expectedId: string | undefined) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._/:@-]*$/.test(image)) throw new Error(`Invalid release E2E image reference: ${image}`);
  const result = spawnSync('docker', ['image', 'inspect', '--format', '{{.Id}}', image], { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(`Could not inspect release E2E image ${image}: ${result.stderr || result.error?.message || 'docker image inspect failed'}`);
  const actualId = result.stdout.trim();
  if (expectedId && actualId !== expectedId) throw new Error(`Release E2E image ${image} changed: expected ${expectedId}, found ${actualId}`);
}

function startDockerImage(image: string, expectedId: string | undefined, name: string, env: Record<string, string>) {
  assertDockerImage(image, expectedId);
  containerNames.push(name);
  start('docker', [
    'run', '--rm', '--name', name,
    '--label', `diary-v3.release-e2e=${dockerLabel}`,
    '--network', dockerNetwork!,
    ...Object.entries(env).flatMap(([key, value]) => ['--env', `${key}=${value}`]),
    image,
  ], {});
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

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

if (usesDockerImages) {
  const suffix = `${process.pid}-${randomUUID().slice(0, 8)}`;
  startDockerImage(apiImage!, apiImageId, `diary-v3-release-api-${suffix}`, {
    API_HOST: '0.0.0.0', API_PORT: String(API_PORT), DATABASE_URL: database.url,
    JWT_SECRET: 'release-e2e-only-secret-never-use-in-production-123456',
    MARKET_PROVIDER: 'fixture', NODE_ENV: 'production', WEB_ORIGIN: e2eBaseURL,
    // Synthetic clients declare distinct forwarded addresses so each scenario
    // gets its own rate-limit bucket, mirroring distinct real clients.
    TRUST_X_FORWARDED_FOR: 'true',
  });
  startDockerImage(webImage!, webImageId, `diary-v3-release-web-${suffix}`, {
    HOST: '0.0.0.0', PORT: String(WEB_PORT), API_ORIGIN: `http://127.0.0.1:${API_PORT}`, NODE_ENV: 'production',
  });
} else {
  start('node', ['dist/api/server.js'], {
    API_HOST: '127.0.0.1', API_PORT: String(API_PORT), DATABASE_URL: database.url,
    JWT_SECRET: 'release-e2e-only-secret-never-use-in-production-123456',
    MARKET_PROVIDER: 'fixture', NODE_ENV: 'production', WEB_ORIGIN: e2eBaseURL,
    // Synthetic clients declare distinct forwarded addresses so each scenario
    // gets its own rate-limit bucket, mirroring distinct real clients.
    TRUST_X_FORWARDED_FOR: 'true',
  });
  start('npm', ['run', 'start', '--workspace=@diary/web'], {
    HOST: '127.0.0.1', PORT: String(WEB_PORT), API_ORIGIN: `http://127.0.0.1:${API_PORT}`, NODE_ENV: 'production',
  });
}
try {
  await Promise.all([waitForPort(API_PORT), waitForPort(WEB_PORT)]);
} catch (error) {
  console.error(error);
  await shutdown(1);
}

gateway.listen(GATEWAY_PORT);
console.log(`Release artifact gateway listening on ${e2eBaseURL}`);

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (gateway.listening) gateway.close();
  for (const name of containerNames) {
    const result = spawnSync('docker', ['rm', '-f', name], { encoding: 'utf8' });
    if (result.status !== 0 && !/No such container/.test(result.stderr ?? '')) {
      console.error(`Could not remove release E2E container ${name}: ${result.stderr || result.error?.message || 'docker rm failed'}`);
      code = 1;
    }
  }
  for (const child of children) child.kill('SIGTERM');
  await Promise.all(children.map(child => new Promise<void>(resolve => child.once('exit', () => resolve()))));
  await database.dispose();
  process.exit(code);
}
