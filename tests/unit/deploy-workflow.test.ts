import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { productionManifestFiles, validateProductionManifests } from '../../scripts/validate-production-manifests';

const workflow = readFileSync('.forgejo/workflows/deploy.yml', 'utf8');
const regressionWorkflow = readFileSync('.forgejo/workflows/regression.yml', 'utf8');
type WorkflowStep = { name?: string; 'continue-on-error'?: boolean };
type WorkflowDocument = { jobs: Record<string, { steps: WorkflowStep[] }> };
const deploySteps = (parse(workflow) as WorkflowDocument).jobs['verify-build-deploy']!.steps;
const regressionSteps = (parse(regressionWorkflow) as WorkflowDocument).jobs.regression!.steps;
const stagingWorkflow = readFileSync('.forgejo/workflows/staging.yml', 'utf8');

const stepIndex = (steps: WorkflowStep[], name: string) => steps.findIndex(step => step.name === name);
const findStep = (steps: WorkflowStep[], name: string) => steps.find(step => step.name === name);

describe('production delivery safety', () => {
  it('keeps Forgejo workflow syntax valid and deployment serialized', () => {
    expect(() => parse(workflow)).not.toThrow();
    expect(() => parse(regressionWorkflow)).not.toThrow();
    expect(workflow).toContain('group: diary-v3-production-deploy');
    expect(workflow).toContain('cancel-in-progress: false');
  });

  it('runs blocking source and image gates before production mutation', () => {
    const mutation = stepIndex(deploySteps, 'Apply production foundation and run migrations');
    const gates = [
      'Tracked secret scan', 'Install deps', 'Lint', 'Typecheck', 'Unit tests',
      'Contracts check', 'Validate source deployment manifests', 'Build Docker images for release smoke',
      'Blocking release smoke', 'Verify tested Docker images unchanged', 'Push images',
      'Resolve digests and render manifests',
    ];
    expect(mutation).toBeGreaterThan(-1);
    for (const gate of gates) {
      const index = stepIndex(deploySteps, gate);
      expect(index, gate).toBeGreaterThan(-1);
      expect(index, gate).toBeLessThan(mutation);
    }
    expect(findStep(deploySteps, 'Blocking release smoke')?.['continue-on-error']).not.toBe(true);
    expect(workflow).not.toContain('if: ${{ false }}');
  });

  it('keeps advisory regression and restore work outside production', () => {
    for (const removedTier of [
      'API integration tests', 'Full Chromium regression', 'WebKit critical path',
      'PostgreSQL backup and restore smoke', 'Production build',
    ]) expect(workflow).not.toContain(`name: ${removedTier}`);

    expect(regressionWorkflow).toContain("cron: '0 18 * * *'");
    expect(regressionWorkflow).toContain('workflow_dispatch:');
    for (const tier of [
      'PostgreSQL backup and restore smoke', 'API integration tests', 'Full Chromium regression',
      'WebKit critical path', 'Extended release artifact regression',
    ]) {
      const step = findStep(regressionSteps, tier);
      expect(step, tier).toBeTruthy();
      expect(step?.['continue-on-error'], tier).not.toBe(true);
    }
    expect(regressionWorkflow).toContain('npm run test:e2e:release:regression');
  });

  it('blocks on a three-test smoke of the exact Docker API and Web images', () => {
    const smoke = readFileSync('tests/e2e/release-smoke.spec.ts', 'utf8');
    expect(smoke.match(/test\(/g)).toHaveLength(3);
    for (const check of ['/healthz', '/readyz', '/api/auth/me', '/api/auth/register', '/api/diaries/']) {
      expect(smoke).toContain(check);
    }
    expect(workflow).toContain('RELEASE_E2E_API_IMAGE_ID="$RELEASE_API_IMAGE_ID"');
    expect(workflow).toContain('RELEASE_E2E_WEB_IMAGE_ID="$RELEASE_WEB_IMAGE_ID"');
    expect(workflow).toContain('diary-v3-api:$GITHUB_SHA');
    expect(workflow).toContain('diary-v3-web:$GITHUB_SHA');
    expect(workflow).toContain('test "$(docker image inspect --format');
    expect(workflow).toContain('API_IMAGE_REF="$REGISTRY/$OWNER/diary-v3-api@$API_DIGEST"');
    expect(workflow).toContain('WEB_IMAGE_REF="$REGISTRY/$OWNER/diary-v3-web@$WEB_DIGEST"');
    expect(workflow).toContain('--require-digests');
    expect(stepIndex(deploySteps, 'Blocking release smoke')).toBeLessThan(stepIndex(deploySteps, 'Push images'));
    expect(workflow).not.toContain('cut -c1-7');
    expect(workflow).not.toContain('playwright install --with-deps chromium webkit');
  });

  it('keeps deployment migrations, production smoke, and mutation-aware rollback blocking', () => {
    expect(workflow).toContain("if: failure() && env.DEPLOYMENT_MUTATED == 'true'");
    expect(workflow).toContain('API_MUTATED=true');
    expect(workflow).toContain('WEB_MUTATED=true');
    expect(workflow).toContain('CRON_MUTATED=true');
    expect(workflow).toContain('MAIL_WORKER_MUTATED=true');
    expect(workflow).toContain('MAIL_WORKER_EXISTS_BEFORE');
    expect(workflow.indexOf('DEPLOYMENT_MUTATED=true')).toBeGreaterThan(stepIndex(deploySteps, 'Apply production foundation and run migrations'));
    expect(workflow).toContain('wait --for=condition=complete job/diary-v3-migrate --timeout=600s');
    expect(workflow).toContain('Rollback smoke test');
    expect(workflow).toContain('Smoke test production');
    expect(workflow).not.toContain('rollout undo');
  });

  it('checks public routes after deploy and rollback, including the single-origin alias', () => {
    expect(workflow.match(/--max-time 20 https:\/\/trade-basic\.com\/articles/g)).toHaveLength(2);
    expect(workflow.match(/--max-time 20 https:\/\/trade-basic\.com\/\)/g)).toHaveLength(2);
    expect(workflow).toContain("--max-time 20 https://www.trade-basic.com/articles)\" = 301");
    expect(workflow).toContain("'%{redirect_url}' --max-time 20 https://www.trade-basic.com/articles)\" = \"https://trade-basic.com/articles\"");
    expect(workflow).not.toContain('v3.trade-basic.com');
  });

  it('validates every required source manifest', () => {
    expect(() => validateProductionManifests()).not.toThrow();
    expect(productionManifestFiles).toHaveLength(12);
    expect(productionManifestFiles).toContain('ops/k8s/production/08-ai-worker.yaml');
    expect(productionManifestFiles).toContain('ops/k8s/production/09-research-worker.yaml');
    expect(productionManifestFiles).toContain('ops/k8s/production/10-article-translation-worker.yaml');
    expect(productionManifestFiles).toContain('ops/k8s/production/11-mail-worker.yaml');
  });

  it('avoids duplicate typecheck and caches Docker dependencies ahead of source copies', () => {
    const dockerfile = readFileSync('Dockerfile', 'utf8');
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
    const install = dockerfile.indexOf('npm ci --ignore-scripts');
    const source = dockerfile.indexOf('COPY apps ./apps');
    expect(packageJson.scripts.build).toBe('npm run typecheck && npm run build:artifacts');
    expect(packageJson.scripts['build:artifacts']).toContain('scripts/build-api.ts');
    expect(dockerfile).toContain('RUN npm run build:artifacts');
    expect(install).toBeGreaterThan(-1);
    expect(source).toBeGreaterThan(install);
    for (const manifest of ['apps/api/package.json', 'apps/web/package.json', 'packages/api-client/package.json', 'packages/contracts/package.json', 'packages/db/package.json', 'packages/domain/package.json']) {
      expect(dockerfile).toContain(`COPY ${manifest}`);
    }
    expect(regressionWorkflow).toContain('npx playwright install --with-deps chromium webkit');
  });
});

describe('staging delivery safety', () => {
  it('requires an explicit manual dispatch and renders an isolated staging target', () => {
    expect(stagingWorkflow).toContain('workflow_dispatch:');
    expect(stagingWorkflow).not.toContain('\n  push:');
    expect(stagingWorkflow).toContain('STAGING_NAMESPACE: diary-v3-staging');
    expect(stagingWorkflow).toContain('--target=staging');
    expect(stagingWorkflow).toContain('--namespace=diary-v3-staging --require-digests');
    expect(stagingWorkflow).toContain("kubectl get namespace '$STAGING_NAMESPACE'");
    expect(stagingWorkflow).toContain('STAGING_SSH_KEY');
    expect(stagingWorkflow).not.toContain('DEPLOY_SSH_KEY');
    expect(stagingWorkflow).not.toContain('DEPLOY_HOST');
  });

  it('checks environment secrets, pauses scheduled market work and runs an HTTPS smoke', () => {
    for (const contract of ['DATABASE_URL', 'JWT_SECRET', 'WEB_ORIGIN', 'SEC_USER_AGENT', 'POSTGRES_PASSWORD', 'IMAGE_PULL_SECRET']) {
      expect(stagingWorkflow).toContain(contract);
    }
    expect(stagingWorkflow).toContain('test "$MARKET_IMAGE" = "$API_IMAGE"');
    expect(stagingWorkflow).toContain('grep -qx true');
    expect(stagingWorkflow).toContain('scripts/staging-smoke.sh');
    expect(stagingWorkflow).toContain('STAGING_ORIGIN="https://$STAGING_HOSTNAME"');
  });
});
