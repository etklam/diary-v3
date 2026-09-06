import base from '../../playwright.config';
import { defineConfig } from '@playwright/test';
export default defineConfig({ ...base, testDir: '../../tests/e2e', webServer: undefined, use: {...base.use,channel:'chrome'}, reporter:[['list']], outputDir:'../../test-results/ui-consistency' });
