import { afterEach,describe,expect,it,vi } from 'vitest';
import { localTradeChoices,localTradeInstants,resolveLocalTradeInstant } from '../../apps/web/app/trade-time';
afterEach(()=>vi.unstubAllEnvs());
describe('device trade and review time conversion',()=>{
 it('rejects a missing DST hour and requires a choice for a repeated hour',()=>{vi.stubEnv('TZ','America/New_York');expect(localTradeInstants('2026-03-08T02:30')).toEqual([]);expect(localTradeInstants('2026-11-01T01:30')).toEqual(['2026-11-01T05:30:00.000Z','2026-11-01T06:30:00.000Z']);expect(resolveLocalTradeInstant('2026-11-01T01:30','')).toBeUndefined();});
 it('keeps an untouched existing instant including seconds, milliseconds and DST occurrence',()=>{vi.stubEnv('TZ','America/New_York');const original='2026-11-01T06:30:42.123Z';expect(resolveLocalTradeInstant('2026-11-01T01:30',original)).toBe(original);expect(localTradeChoices('2026-11-01T01:30',original)).toEqual(['2026-11-01T05:30:00.000Z',original]);expect(resolveLocalTradeInstant('2026-11-01T02:30',original)).toBe('2026-11-01T07:30:00.000Z');});
 it('finds non-hour DST transitions without assuming a sixty-minute change',()=>{vi.stubEnv('TZ','Australia/Lord_Howe');expect(localTradeInstants('2026-04-05T01:45')).toEqual(['2026-04-04T14:45:00.000Z','2026-04-04T15:15:00.000Z']);});
 it('rejects invalid civil dates instead of normalizing into a different day',()=>{vi.stubEnv('TZ','UTC');expect(localTradeInstants('2026-02-30T10:30')).toEqual([]);expect(localTradeInstants('bad')).toEqual([]);expect(resolveLocalTradeInstant('2026-09-05T10:30','')).toBe('2026-09-05T10:30:00.000Z');});
});
