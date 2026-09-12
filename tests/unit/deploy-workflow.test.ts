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

  it('runs restore and browser acceptance before image publication and production mutation', () => {
    const restore = workflow.indexOf('name: PostgreSQL backup and restore smoke');
    const integration = workflow.indexOf('name: API integration tests');
    const build = workflow.indexOf('name: Production build');
    const chromium = workflow.indexOf('name: Full Chromium regression');
    const webkit = workflow.indexOf('name: WebKit critical path');
    const release = workflow.indexOf('name: Release artifact acceptance');
    const imageBuild = workflow.indexOf('name: Build API and Web images');
    const push = workflow.indexOf('name: Push images');
    const deploy = workflow.indexOf('name: Apply production foundation and run migrations');
    for (const index of [restore, integration, build, chromium, webkit, release, imageBuild, push, deploy]) expect(index).toBeGreaterThan(-1);
    expect(restore).toBeLessThan(integration);
    expect(integration).toBeLessThan(build);
    expect(build).toBeLessThan(chromium);
    expect(chromium).toBeLessThan(webkit);
    expect(webkit).toBeLessThan(release);
    expect(release).toBeLessThan(imageBuild);
    expect(imageBuild).toBeLessThan(push);
    expect(push).toBeLessThan(deploy);
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
    expect(workflow).not.toContain('continue-on-error: true');
  });

  it('checks the public article index after deploy and rollback', () => {
    expect(workflow.match(/https:\/\/v3\.trade-basic\.com\/articles/g)).toHaveLength(2);
  });

  it('validates every required source manifest', () => {
    expect(() => validateProductionManifests()).not.toThrow();
    expect(productionManifestFiles).toHaveLength(8);
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
