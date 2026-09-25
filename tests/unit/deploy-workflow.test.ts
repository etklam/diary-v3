import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { productionManifestFiles, validateProductionManifests } from '../../scripts/validate-production-manifests';

const workflow = readFileSync('.forgejo/workflows/deploy.yml', 'utf8');
const stagingWorkflow = readFileSync('.forgejo/workflows/staging.yml', 'utf8');

describe('production delivery safety', () => {
  it('keeps verification ahead of every production mutation', () => {
    const deploy = workflow.indexOf('name: Apply production foundation and run migrations');
    for (const gate of ['name: Lint', 'name: Typecheck', 'name: Unit tests', 'name: Contracts check', 'name: API integration tests', 'name: Production build', 'name: Release artifact acceptance']) {
      expect(workflow.indexOf(gate), gate).toBeGreaterThan(-1);
      expect(workflow.indexOf(gate), gate).toBeLessThan(deploy);
    }
    expect(workflow).not.toContain('if: ${{ false }}');
  });

  it('keeps extended test tiers advisory so they cannot block deployment', () => {
    // The disposable PostgreSQL step exports DATABASE_URL at the job level with
    // the disposable credential; per-step DATABASE_URL overrides must not return.
    expect(workflow).toContain('DATABASE_URL=postgresql://diary:ci_disposable_only@127.0.0.1:5432/diary_v3');
    expect(workflow).not.toContain('diary:***@127.0.0.1');
    for (const tier of ['name: API integration tests', 'name: Full Chromium regression', 'name: WebKit critical path', 'name: Release artifact acceptance']) {
      const at = workflow.indexOf(tier);
      expect(at, tier).toBeGreaterThan(-1);
      expect(workflow.slice(at, at + 200), tier).toContain('continue-on-error: true');
    }
    // Core gates stay blocking: lint/typecheck/unit/contracts/manifests/build
    // and image-integrity steps carry no continue-on-error.
    for (const gate of ['name: Lint', 'name: Typecheck', 'name: Unit tests', 'name: Production build', 'name: Verify tested Docker images unchanged']) {
      const at = workflow.indexOf(gate);
      expect(at, gate).toBeGreaterThan(-1);
      expect(workflow.slice(at, at + 200), gate).not.toContain('continue-on-error: true');
    }
  });

  it('tests the exact Docker images that are published before production mutation', () => {
    const restore = workflow.indexOf('name: PostgreSQL backup and restore smoke');
    const integration = workflow.indexOf('name: API integration tests');
    const build = workflow.indexOf('name: Production build');
    const chromium = workflow.indexOf('name: Full Chromium regression');
    const webkit = workflow.indexOf('name: WebKit critical path');
    const imageBuild = workflow.indexOf('name: Build Docker images for release acceptance');
    const release = workflow.indexOf('name: Release artifact acceptance');
    const imageVerify = workflow.indexOf('name: Verify tested Docker images unchanged');
    const push = workflow.indexOf('name: Push images');
    const deploy = workflow.indexOf('name: Apply production foundation and run migrations');
    for (const index of [restore, integration, build, chromium, webkit, imageBuild, release, imageVerify, push, deploy]) expect(index).toBeGreaterThan(-1);
    expect(restore).toBeLessThan(integration);
    expect(integration).toBeLessThan(build);
    expect(build).toBeLessThan(chromium);
    expect(chromium).toBeLessThan(webkit);
    expect(webkit).toBeLessThan(imageBuild);
    expect(imageBuild).toBeLessThan(release);
    expect(release).toBeLessThan(imageVerify);
    expect(imageVerify).toBeLessThan(push);
    expect(push).toBeLessThan(deploy);
    expect(workflow).toContain('diary-v3-api:$GITHUB_SHA');
    expect(workflow).toContain('diary-v3-web:$GITHUB_SHA');
    expect(workflow).toContain('RELEASE_E2E_API_IMAGE_ID="$RELEASE_API_IMAGE_ID"');
    expect(workflow).toContain('RELEASE_E2E_WEB_IMAGE_ID="$RELEASE_WEB_IMAGE_ID"');
    expect(workflow).not.toContain('cut -c1-7');
  });

  it('does not rollback pre-deploy failures and tracks each mutated workload', () => {
    expect(workflow).toContain("if: failure() && env.DEPLOYMENT_MUTATED == 'true'");
    expect(workflow).toContain('API_MUTATED=true');
    expect(workflow).toContain('WEB_MUTATED=true');
    expect(workflow).toContain('CRON_MUTATED=true');
    expect(workflow.indexOf('DEPLOYMENT_MUTATED=true')).toBeGreaterThan(workflow.indexOf('name: Apply production foundation and run migrations'));
  });

  it('restores recorded images and verifies rollback health', () => {
    expect(workflow).toContain('API_IMAGE_BEFORE');
    expect(workflow).toContain('WEB_IMAGE_BEFORE');
    expect(workflow).toContain('CRON_IMAGE_BEFORE');
    expect(workflow).toContain('Rollback smoke test');
    expect(workflow).not.toContain('rollout undo');
  });

  it('checks the public article index after deploy and rollback', () => {
    expect(workflow.match(/https:\/\/v3\.trade-basic\.com\/articles/g)).toHaveLength(2);
  });

  it('validates every required source manifest', () => {
    expect(() => validateProductionManifests()).not.toThrow();
    expect(productionManifestFiles).toHaveLength(11);
    expect(productionManifestFiles).toContain('ops/k8s/production/08-ai-worker.yaml');
    expect(productionManifestFiles).toContain('ops/k8s/production/09-research-worker.yaml');
    expect(productionManifestFiles).toContain('ops/k8s/production/10-article-translation-worker.yaml');
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
    expect(stagingWorkflow).toContain("grep -qx true");
    expect(stagingWorkflow).toContain('scripts/staging-smoke.sh');
    expect(stagingWorkflow).toContain('STAGING_ORIGIN="https://$STAGING_HOSTNAME"');
  });
});
