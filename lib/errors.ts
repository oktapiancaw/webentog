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

import { toast } from 'sonner';
import { explainError } from '@/lib/utils';

/**
 * Where users are told to send bugs. Self-hosters set their own rather than
 * pointing their users at this repo's author.
 */
export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'frostyking77@gmail.com';

export const reportHint = (digest?: string) =>
  digest
    ? `If this keeps happening, please report it to ${SUPPORT_EMAIL} (reference ${digest}).`
    : `If this keeps happening, please report it to ${SUPPORT_EMAIL}.`;

/**
 * One error toast: a readable line, plus where to report it when the cause is
 * not something the user can fix themselves.
 *
 * The original is logged so the detail is still one console away.
 */
export function toastError(
  error: unknown,
  fallback?: string,
  options?: { id?: string }
) {
  console.error(error);
  const { message, unexpected } = explainError(error, fallback);
  toast.error(message, {
    ...options,
    description: unexpected ? reportHint() : undefined,
  });
}
