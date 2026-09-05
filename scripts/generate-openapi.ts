import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createOpenApiDocument } from '@diary/contracts/openapi';

const path = new URL('../openapi/openapi.json', import.meta.url);
const content = `${JSON.stringify(createOpenApiDocument(), null, 2)}\n`;
if (process.argv.includes('--check')) {
  const existing = await readFile(path, 'utf8');
  if (existing !== content) throw new Error('OpenAPI drift. Run npm run contracts:generate and review the contract changes.');
} else {
  await mkdir(new URL('../openapi/', import.meta.url), { recursive: true });
  await writeFile(path, content);
}
