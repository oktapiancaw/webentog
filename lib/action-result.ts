// Copyright (C) 2026 Oktapiancaw

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import { explainError } from '@/lib/utils';

/**
 * How a server action reports a failure the user is supposed to read.
 *
 * Throwing does not work for that. React strips error messages out of
 * production bundles and hands the client a numbered stub with a digest, so
 * `throw new Error('That user already owns this connection.')` arrives as
 * nothing — the real text only ever shows up in the server log. A returned
 * value is ordinary data and survives the trip.
 *
 * Actions still throw for genuinely unexpected failures; those have nothing
 * worth showing anyway, and the digest-only stub is the right amount of
 * detail to hand a browser.
 */
export type ActionResult<T> =
  { ok: true; value: T } | { ok: false; error: string };

/**
 * Server side: run an action body and turn an expected failure into a result.
 *
 * The message is passed through `explainError` first, so a curated message
 * reaches the user intact while a stray `TypeError` or a driver's stack trace
 * degrades to `fallback` instead of leaking internals.
 */
export async function attempt<T>(
  label: string,
  fallback: string,
  body: () => Promise<T>
): Promise<ActionResult<T>> {
  try {
    return { ok: true, value: await body() };
  } catch (error) {
    console.error(`${label}:`, error);
    return { ok: false, error: explainError(error, fallback).message };
  }
}

/**
 * Client side: unpack a result, or throw so the surrounding try/catch and
 * `toastError` keep working unchanged.
 *
 * The throw happens in the browser, so this message is not stripped.
 */
export function unwrap<T>(result: ActionResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
