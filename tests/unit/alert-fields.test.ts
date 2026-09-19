import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AlertResponse } from '@diary/contracts/alerts';
import { reminderDrafts, reminderInputs } from '../../apps/web/app/alert-fields';

afterEach(() => vi.unstubAllEnvs());

function alert(overrides: Partial<AlertResponse> = {}): AlertResponse {
  return {
    id: '1', diaryId: '9', message: 'Review the decision', triggerAt: '2026-11-01T06:30:42.123Z',
    isDismissed: false, recurringMode: null, parentId: null, instanceNumber: 1, isPaused: false,
    createdAt: '2026-01-01T00:00:00.000Z', diary: null, ...overrides,
  };
}

describe('Diary reminder draft conversion', () => {
  it('keeps an untouched repeated-hour instant exact through draft and request conversion', () => {
    vi.stubEnv('TZ', 'America/New_York');
    const [draft] = reminderDrafts([alert()]);
    expect(draft).toMatchObject({ time: '2026-11-01T01:30', instant: '2026-11-01T06:30:42.123Z' });
    expect(reminderInputs([draft!])).toEqual([{ message: 'Review the decision', triggerAt: '2026-11-01T06:30:42.123Z' }]);
  });

  it('keeps the root occurrence while excluding dismissed and later recurring children', () => {
    const rows = reminderDrafts([
      alert({ id: 'root', recurringMode: 'WEEK' }),
      alert({ id: 'child', recurringMode: 'WEEK', instanceNumber: 2 }),
      alert({ id: 'dismissed', isDismissed: true }),
    ]);
    expect(rows.map(row => row.key)).toEqual(['root']);
    expect(reminderInputs(rows)[0]).toMatchObject({ recurringMode: 'WEEK' });
  });
});
