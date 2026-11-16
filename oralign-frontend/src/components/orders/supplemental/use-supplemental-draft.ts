'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { useUpdateSupplementalOrder } from '@/lib/hooks/use-supplemental-orders';
import type {
  SupplementalKind,
  SupplementalOrderView,
  UpdateSupplementalOrderDto,
} from '@/lib/types';
import type { ContactChange } from './contacts-picker';
import type { DraftSetter } from './steps/step-props';
import { AUTOSAVE_DELAY_MS } from './supplemental-constants';
import { draftFromView, toUpdateDto, type SupplementalDraft } from './supplemental-draft';
import { replaceTeeth, upsertContact } from './tooth-details';
import type { TeethChange } from './teeth-picker';

export type SaveStatus = 'idle' | 'saving' | 'error';

const payloadKeyOf = (payload: UpdateSupplementalOrderDto) => JSON.stringify(payload);

/**
 * Editing state of one draft request, with autosave.
 *
 * The draft is seeded once from the server view; after that the local
 * state is the source of truth (a save response never overwrites what the
 * doctor is typing). Every change schedules a save 1.5 s after the last
 * keystroke; `flush()` saves now (step change, submit). Saves never
 * overlap: a change made while one runs is sent right after it, and only
 * the latest state is sent. `flush()` resolves to false when the save
 * failed — it never throws. Leaving the wizard inside the app sends
 * whatever the server has not confirmed (a pending debounce or a failed
 * save); leaving the site with unsaved answers asks first.
 */
export function useSupplementalDraft(view: SupplementalOrderView, kind: SupplementalKind) {
  const { mutateAsync: saveRequest } = useUpdateSupplementalOrder();
  const requestId = view.order.id;
  const parentOrderId = view.parentOrder.id;
  const patientId = view.order.patientId;

  const [draft, setDraft] = useState<SupplementalDraft>(() => draftFromView(view));
  const [savedKey, setSavedKey] = useState(() =>
    payloadKeyOf(toUpdateDto(draftFromView(view), kind)),
  );
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<unknown>(null);

  const payload = useMemo(() => toUpdateDto(draft, kind), [draft, kind]);
  const payloadKey = useMemo(() => payloadKeyOf(payload), [payload]);
  const dirty = payloadKey !== savedKey;

  // Save loop bookkeeping, only touched from handlers and async code.
  const confirmedKey = useRef(savedKey);
  const pending = useRef<{ payload: UpdateSupplementalOrderDto; key: string } | null>(null);
  const running = useRef<Promise<boolean> | null>(null);

  const drain = useCallback(async (): Promise<boolean> => {
    while (pending.current && pending.current.key !== confirmedKey.current) {
      const next = pending.current;
      setStatus('saving');
      try {
        await saveRequest({ requestId, parentOrderId, patientId, data: next.payload });
        confirmedKey.current = next.key;
        setSavedKey(next.key);
        setSavedAt(new Date().toISOString());
        setSaveError(null);
      } catch (error) {
        setSaveError(error);
        setStatus('error');
        return false;
      }
    }
    setStatus('idle');
    return true;
  }, [saveRequest, requestId, parentOrderId, patientId]);

  const enqueue = useCallback(
    (entry: { payload: UpdateSupplementalOrderDto; key: string }): Promise<boolean> => {
      pending.current = entry;
      running.current ??= drain().finally(() => {
        running.current = null;
      });
      return running.current;
    },
    [drain],
  );

  const save = useCallback(
    (): Promise<boolean> => enqueue({ payload, key: payloadKey }),
    [enqueue, payload, payloadKey],
  );

  const autosave = useDebouncedCallback(() => void save(), AUTOSAVE_DELAY_MS);

  const flush = useCallback((): Promise<boolean> => {
    autosave.cancel();
    return save();
  }, [autosave, save]);

  const set = useCallback<DraftSetter>(
    (field, value) => {
      setDraft((current) => ({ ...current, [field]: value }));
      autosave();
    },
    [autosave],
  );

  const setTeeth = useCallback<TeethChange>(
    (purpose, toothNumbers) => {
      setDraft((current) => ({
        ...current,
        teeth: replaceTeeth(current.teeth, purpose, toothNumbers),
      }));
      autosave();
    },
    [autosave],
  );

  const setContact = useCallback<ContactChange>(
    (purpose, pair, amountMm) => {
      setDraft((current) => ({
        ...current,
        contacts: upsertContact(current.contacts, purpose, pair, amountMm),
      }));
      autosave();
    },
    [autosave],
  );

  // The latest payload, for the unmount below (refs change outside render).
  const latest = useRef({ payload, key: payloadKey });
  useEffect(() => {
    latest.current = { payload, key: payloadKey };
  }, [payload, payloadKey]);

  // Leaving the wizard inside the app (sidebar, back button): send what
  // the server has not confirmed — a debounce still pending, or answers
  // whose save failed (the debounce alone would drop those).
  const sendUnconfirmed = useCallback(() => {
    autosave.cancel();
    const last = latest.current;
    if (last.key !== confirmedKey.current) void enqueue(last);
  }, [autosave, enqueue]);
  useEffect(() => sendUnconfirmed, [sendUnconfirmed]);

  // Leaving the site (reload, tab close) with unsaved answers: ask first.
  const unsafeToLeave = dirty || status === 'saving';
  useEffect(() => {
    if (!unsafeToLeave) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsafeToLeave]);

  return { draft, set, setTeeth, setContact, flush, dirty, status, savedAt, saveError };
}
