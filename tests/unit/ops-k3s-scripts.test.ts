import { chmod, mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const restoreSmokePath = join(process.cwd(), 'scripts/restore-smoke.sh')
const localClusterPath = join(process.cwd(), 'ops/k3s/create-local-cluster.sh')

async function writeExecutable(path: string, source: string) {
  await writeFile(path, source)
  await chmod(path, 0o755)
}

it('does not remove a pre-existing restore smoke container', async () => {
  const root = await mkdtemp(join(tmpdir(), 'diary-v3-restore-script-'))
  const bin = join(root, 'bin')
  const dockerPath = join(bin, 'docker')
  const dockerLogPath = join(root, 'docker.log')
  await mkdir(bin, { recursive: true })
  await writeFile(dockerLogPath, '')
  await writeExecutable(
    dockerPath,
    `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$FAKE_DOCKER_LOG"
if [[ "$1" == ps ]]; then
  printf '%s\n' "$FAKE_EXISTING_CONTAINER"
  exit 0
fi
if [[ "$1" == rm ]]; then
  exit 0
fi
echo "unexpected docker invocation: $*" >&2
exit 99
`,
  )

  try {
    const result = spawnSync('bash', [restoreSmokePath], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        FAKE_DOCKER_LOG: dockerLogPath,
        FAKE_EXISTING_CONTAINER: 'pre-existing-restore',
        RESTORE_SMOKE_CONTAINER: 'pre-existing-restore',
        TMPDIR: root,
      },
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('already exists')
    expect(await readFile(dockerLogPath, 'utf8')).not.toMatch(/^rm\b/m)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('binds local cluster ports to loopback and writes a private kubeconfig', async () => {
  const root = await mkdtemp(join(tmpdir(), 'diary-v3-local-cluster-'))
  const bin = join(root, 'bin')
  const dockerPath = join(bin, 'docker')
  const kubectlPath = join(bin, 'kubectl')
  const dockerLogPath = join(root, 'docker.log')
  const kubectlLogPath = join(root, 'kubectl.log')
  const kubeconfigPath = join(root, 'kubeconfig.yaml')
  await mkdir(bin, { recursive: true })
  await writeFile(dockerLogPath, '')
  await writeFile(kubectlLogPath, '')
  await writeFile(kubeconfigPath, 'old kubeconfig\n')
  await chmod(kubeconfigPath, 0o644)
  await writeExecutable(
    dockerPath,
    `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$FAKE_DOCKER_LOG"
if [[ "$1" == ps ]]; then
  if [[ -n "\${FAKE_DOCKER_RUNNING:-}" ]]; then printf '%s\n' "$FAKE_DOCKER_RUNNING"; fi
  exit 0
fi
if [[ "$1" == rm || "$1" == run ]]; then exit 0; fi
if [[ "$1" == exec ]]; then
  if [[ "$*" == *' cat /etc/rancher/k3s/k3s.yaml' ]]; then
    cat <<'YAML'
apiVersion: v1
clusters:
- cluster:
    server: https://127.0.0.1:6443
  name: default
contexts:
- context:
    cluster: default
    user: default
  name: default
current-context: default
kind: Config
users:
- name: default
  user:
    token: synthetic
YAML
  fi
  exit 0
fi
echo "unexpected docker invocation: $*" >&2
exit 99
`,
  )
  await writeExecutable(
    kubectlPath,
    `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$FAKE_KUBECTL_LOG"
exit 0
`,
  )

  try {
    const result = spawnSync('bash', [localClusterPath], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        FAKE_DOCKER_LOG: dockerLogPath,
        FAKE_KUBECTL_LOG: kubectlLogPath,
        K3S_CONTAINER: 'synthetic-k3s',
        K3S_API_PORT: '26443',
        K3S_HTTP_PORT: '28088',
        K3S_HTTPS_PORT: '28443',
        KUBECONFIG_PATH: kubeconfigPath,
        KUBE_CONTEXT: 'synthetic-context',
      },
    })
    expect(result.status).toBe(0)
    const dockerLog = await readFile(dockerLogPath, 'utf8')
    expect(dockerLog).toContain('-p 127.0.0.1:26443:6443')
    expect(dockerLog).toContain('-p 127.0.0.1:28088:80')
    expect(dockerLog).toContain('-p 127.0.0.1:28443:443')
    const kubeconfig = await readFile(kubeconfigPath, 'utf8')
    expect(kubeconfig).toContain('https://127.0.0.1:26443')
    expect((await stat(kubeconfigPath)).mode & 0o777).toBe(0o600)
    const kubectlLog = await readFile(kubectlLogPath, 'utf8')
    expect(kubectlLog).toContain(`--kubeconfig ${kubeconfigPath} rename-context default synthetic-context`)
    expect(kubectlLog).toContain(`--kubeconfig ${kubeconfigPath} use-context synthetic-context`)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('reuses an already-running local cluster without recreating it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'diary-v3-local-cluster-reuse-'))
  const bin = join(root, 'bin')
  const dockerPath = join(bin, 'docker')
  const dockerLogPath = join(root, 'docker.log')
  await mkdir(bin, { recursive: true })
  await writeFile(dockerLogPath, '')
  await writeExecutable(
    dockerPath,
    `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$FAKE_DOCKER_LOG"
if [[ "$1" == ps ]]; then printf '%s\n' "$FAKE_DOCKER_RUNNING"; exit 0; fi
echo "unexpected docker invocation: $*" >&2
exit 99
`,
  )

  try {
    const result = spawnSync('bash', [localClusterPath], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        FAKE_DOCKER_LOG: dockerLogPath,
        FAKE_DOCKER_RUNNING: 'synthetic-k3s',
        K3S_CONTAINER: 'synthetic-k3s',
      },
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('synthetic-k3s is already running')
    expect(await readFile(dockerLogPath, 'utf8')).not.toMatch(/\brun\b/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
