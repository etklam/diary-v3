import { useCallback, useEffect, useRef } from 'react';
import { wasExplicitSignOut } from './session';

export const DRAFT_TTL_MS = 86_400_000;
export const DRAFT_DEBOUNCE_MS = 600;

export type DraftEnvelope<T> = { at: number; value: T };
export type DraftSnapshot<T> = { key: string; value: T; dirty: boolean; paused: boolean };

function storage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

export function readDraftEnvelope<T>(key: string, validate?: (value: unknown) => value is T): T | null {
  if (!key) return null;
  try {
    const saved = JSON.parse(storage()?.getItem(key) ?? 'null') as Partial<DraftEnvelope<unknown>> | null;
    if (!saved || typeof saved.at !== 'number' || saved.at > Date.now() || Date.now() - saved.at > DRAFT_TTL_MS || !('value' in saved)) return null;
    if (validate && !validate(saved.value)) return null;
    return saved.value as T;
  } catch {
    return null;
  }
}

export function writeDraftEnvelope<T>(key: string, value: T, at = Date.now()): boolean {
  if (!key || wasExplicitSignOut()) return false;
  try {
    const target = storage();
    if (!target) return false;
    target.setItem(key, JSON.stringify({ at, value } satisfies DraftEnvelope<T>));
    return true;
  } catch {
    return false;
  }
}

export function clearDraftEnvelope(key: string): void {
  if (!key) return;
  try {
    storage()?.removeItem(key);
  } catch {
    // Recovery is best effort when device storage is unavailable.
  }
}

/** Flushes the committed key/value pair captured by a lifecycle effect. */
export function flushCapturedDraft<T>(snapshot: DraftSnapshot<T>, suppressed: ReadonlySet<string> = new Set()): boolean {
  if (!snapshot.key || snapshot.paused || !snapshot.dirty || suppressed.has(snapshot.key)) return false;
  return writeDraftEnvelope(snapshot.key, snapshot.value);
}

type DraftLifecycleOptions<T> = {
  key: string | null;
  value: T;
  dirty: boolean;
  paused: boolean;
};

/**
 * Shares storage ordering only. Each form still owns its payload, dirty rules,
 * restore merge, and save reconciliation.
 */
export function useDraftLifecycle<T>({ key, value, dirty, paused }: DraftLifecycleOptions<T>) {
  const snapshotsRef = useRef(new Map<string, DraftSnapshot<T>>());
  const suppressedRef = useRef(new Set<string>());

  // Keep only committed renders here. Rendering can be abandoned in concurrent
  // mode, so mutating the map during render could bind another account's value
  // to the old key during unmount cleanup.
  useEffect(() => {
    if (!key) return;
    const previous = snapshotsRef.current.get(key);
    if (dirty && previous && !previous.dirty) suppressedRef.current.delete(key);
    snapshotsRef.current.set(key, { key, value, dirty, paused });
  }, [key, value, dirty, paused]);

  useEffect(() => {
    if (!key || paused || !dirty) return;
    const capturedKey = key;
    const capturedValue = value;
    const timer = window.setTimeout(() => {
      flushCapturedDraft({ key: capturedKey, value: capturedValue, dirty: true, paused: false }, suppressedRef.current);
    }, DRAFT_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [key, paused, dirty, value]);

  useEffect(() => {
    const currentKey = key;
    return () => {
      if (!currentKey || wasExplicitSignOut()) return;
      if (suppressedRef.current.delete(currentKey)) {
        snapshotsRef.current.delete(currentKey);
        return;
      }
      const snapshot = snapshotsRef.current.get(currentKey);
      snapshotsRef.current.delete(currentKey);
      if (snapshot) flushCapturedDraft(snapshot, suppressedRef.current);
    };
  }, [key]);

  const flushDraft = useCallback(() => {
    if (!key || paused || !dirty || wasExplicitSignOut()) return false;
    return flushCapturedDraft({ key, value, dirty, paused }, suppressedRef.current);
  }, [key, paused, dirty, value]);

  const suppressDraft = useCallback(() => {
    if (!key) return;
    suppressedRef.current.add(key);
    snapshotsRef.current.delete(key);
    clearDraftEnvelope(key);
  }, [key]);

  return { flushDraft, suppressDraft };
}
