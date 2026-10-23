"use client";

import { useActionState, useCallback, useTransition, type FormEvent } from "react";

/**
 * Forms that keep showing what was saved (Batch 2 item 4).
 *
 * React 19 resets a <form action={fn}> after the action finishes. Inputs go back to their defaultValue — and a
 * <select defaultValue> goes back to the value it had when it first rendered (React only applies a select's default
 * on mount), so a saved choice such as the Management weekly weekday looked like it had not saved.
 *
 *   const { state, pending, onSubmit } = useSavedForm(saveAction, initial);
 *   <form onSubmit={onSubmit} key={savedKey(savedValuesFromServer)}> … defaultValue={saved…} … </form>
 *
 * onSubmit runs the action without the automatic reset (what you typed stays, also when the server says no);
 * the key re-mounts the form with the server's saved values after a successful save (normalised, e.g. "7:30" → "07:30").
 * Keep useSavedForm in a component that does NOT re-mount (so the "Saved" message survives the key change).
 */
export function useSavedForm<S>(action: (prev: Awaited<S>, fd: FormData) => S | Promise<S>, initial: Awaited<S>) {
  const [state, dispatch, pending] = useActionState<S, FormData>(action, initial);
  const [, start] = useTransition();
  const onSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
      const fd = submitter ? new FormData(e.currentTarget, submitter) : new FormData(e.currentTarget);
      start(() => dispatch(fd));
    },
    [dispatch],
  );
  return { state, pending, onSubmit };
}

/** A key that changes whenever the saved values change. */
export function savedKey(values: unknown): string {
  const s = JSON.stringify(values) ?? "";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return `s${(h >>> 0).toString(36)}${s.length}`;
}
