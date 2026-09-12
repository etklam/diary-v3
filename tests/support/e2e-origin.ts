const rawPort = process.env.E2E_WEB_PORT ?? '3200';
const port = Number(rawPort);
const host = process.env.E2E_WEB_HOST ?? '127.0.0.1';

if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('E2E_WEB_PORT must be an integer between 1024 and 65535');
}
if (host !== '127.0.0.1' && host !== 'localhost') {
  throw new Error('E2E_WEB_HOST must be localhost or 127.0.0.1');
}

export const e2eWebPort = port;
export const e2eBaseURL = `http://${host}:${port}`;
