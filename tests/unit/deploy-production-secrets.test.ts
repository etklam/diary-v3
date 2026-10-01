import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const scriptPath = join(process.cwd(), 'ops/k3s/deploy-production-secrets.sh')

const fakeKubectl = `#!/usr/bin/env node
const { readFileSync, writeFileSync } = require('node:fs')

const statePath = process.env.FAKE_KUBECTL_STATE
const logPath = process.env.FAKE_KUBECTL_LOG
const state = JSON.parse(readFileSync(statePath, 'utf8'))
const args = process.argv.slice(2)
const record = entry => writeFileSync(logPath, readFileSync(logPath, 'utf8') + JSON.stringify(entry) + '\\n')
const save = () => writeFileSync(statePath, JSON.stringify(state))

record({ args })
if (args[0] === 'get' && args[1] === 'ns') process.exit(0)
if (args[0] === 'get' && args[1] === 'secret') process.exit(state.secrets[args[2]] ? 0 : 1)
if (args[0] === 'create' && args[1] === 'ns') process.exit(0)
if (args[0] === 'create' && args[1] === '-f' && args[2] === '-') {
  const manifest = JSON.parse(readFileSync(0, 'utf8'))
  state.secrets[manifest.metadata.name] = manifest.stringData
  save()
  process.exit(0)
}
console.error('unexpected fake kubectl invocation', args)
process.exit(2)
`

const fakeSsh = `#!/usr/bin/env node
const { readFileSync, appendFileSync } = require('node:fs')
const { spawnSync } = require('node:child_process')

const [host, command] = process.argv.slice(2)
appendFileSync(process.env.FAKE_SSH_LOG, JSON.stringify({ host, command }) + '\\n')
const kubectl = process.env.FAKE_KUBECTL
const invoke = (args, input) => spawnSync(process.execPath, [kubectl, ...args], { input, encoding: 'utf8' })
if (command.includes('get ns diary-v3')) process.exit(invoke(['get', 'ns', 'diary-v3']).status)
const getSecret = command.match(/get secret '?((?:diary-v3)-(?:db|app))'?(?:\\s|$)/)
if (getSecret) process.exit(invoke(['get', 'secret', getSecret[1]]).status)
if (command.includes('create -f -')) process.exit(invoke(['create', '-f', '-'], readFileSync(0)).status)
console.error('unexpected fake ssh command', command)
process.exit(2)
`

async function setupFakes() {
  const root = await mkdtemp(join(tmpdir(), 'diary-v3-secrets-'))
  const bin = join(root, 'bin')
  const fakeSshPath = join(bin, 'ssh')
  const fakeKubectlPath = join(bin, 'kubectl.cjs')
  const statePath = join(root, 'state.json')
  const sshLogPath = join(root, 'ssh.log')
  const kubectlLogPath = join(root, 'kubectl.log')
  await mkdir(bin, { recursive: true })
  await writeFile(fakeSshPath, fakeSsh)
  await writeFile(fakeKubectlPath, fakeKubectl)
  await chmod(fakeSshPath, 0o755)
  await chmod(fakeKubectlPath, 0o755)
  await writeFile(statePath, JSON.stringify({ secrets: {} }))
  await writeFile(sshLogPath, '')
  await writeFile(kubectlLogPath, '')
  return { root, bin, fakeKubectlPath, statePath, sshLogPath, kubectlLogPath }
}

function runScript(fake: Awaited<ReturnType<typeof setupFakes>>, values: { db: string; jwt: string; sec: string }) {
  return spawnSync('bash', [scriptPath], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 10_000,
    env: {
      ...process.env,
      PATH: `${fake.bin}:${process.env.PATH ?? ''}`,
      DEPLOY_HOST: 'fake-host',
      DB_PASSWORD: values.db,
      JWT_SECRET: values.jwt,
      SEC_USER_AGENT: values.sec,
      FAKE_KUBECTL: fake.fakeKubectlPath,
      FAKE_KUBECTL_STATE: fake.statePath,
      FAKE_KUBECTL_LOG: fake.kubectlLogPath,
      FAKE_SSH_LOG: fake.sshLogPath,
    },
  })
}

it('provisions special-character secrets without shell evaluation and retains existing values', async () => {
  const fake = await setupFakes()
  const sentinel = join(fake.root, 'side-effect')
  const first = {
    db: `db'pass\n$(touch ${sentinel})\``,
    jwt: `jwt'pass\n$(touch ${sentinel})\``,
    sec: `Trade basic\ncontact'$(touch ${sentinel})\``,
  }
  try {
    const created = runScript(fake, first)
    expect(created.status).toBe(0)
    expect(created.stderr).toBe('')
    const stateAfterCreate = JSON.parse(await readFile(fake.statePath, 'utf8'))
    expect(stateAfterCreate.secrets['diary-v3-db'].POSTGRES_PASSWORD).toBe(first.db)
    expect(stateAfterCreate.secrets['diary-v3-app'].JWT_SECRET).toBe(first.jwt)
    expect(stateAfterCreate.secrets['diary-v3-app'].SEC_USER_AGENT).toBe(first.sec)
    const databaseUrl = new URL(stateAfterCreate.secrets['diary-v3-app'].DATABASE_URL)
    expect(decodeURIComponent(databaseUrl.password)).toBe(first.db)
    expect(stateAfterCreate.secrets['diary-v3-app'].WEB_ORIGIN).toBe('https://trade-basic.com')
    expect(created.stdout).not.toContain(first.db)
    expect(created.stdout).not.toContain(first.jwt)
    expect(created.stdout).not.toContain(first.sec)
    const sshLog = await readFile(fake.sshLogPath, 'utf8')
    expect(sshLog).not.toContain(first.db)
    expect(sshLog).not.toContain(first.jwt)
    expect(sshLog).not.toContain(first.sec)

    const second = {
      db: 'replacement$(touch should-not-run)`',
      jwt: 'replacement\nsecret',
      sec: 'Replacement contact@example.test',
    }
    const retained = runScript(fake, second)
    expect(retained.status).toBe(0)
    expect(JSON.parse(await readFile(fake.statePath, 'utf8'))).toEqual(stateAfterCreate)
    const kubectlEntries = (await readFile(fake.kubectlLogPath, 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line) as { args: string[] })
    expect(kubectlEntries.filter(entry => entry.args[0] === 'create')).toHaveLength(2)
    await expect(readFile(sentinel, 'utf8')).rejects.toThrow()
  } finally {
    await rm(fake.root, { recursive: true, force: true })
  }
})
