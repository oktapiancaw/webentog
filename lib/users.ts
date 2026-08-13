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

/**
 * Credential rules, shared by the admin form and the server actions behind it.
 *
 * The server copy is the one that counts — a server action is reachable
 * without the form — but running the same function in the dialog means the
 * user sees the rule before submitting rather than as a failed request.
 */

/** Long enough to matter, short enough to fit the varchar(255) column. */
export function validateUsername(username: string): string | null {
  const name = username.trim();
  if (!name) return 'Username cannot be empty.';
  if (name.length < 3) return 'Username must be at least 3 characters.';
  if (name.length > 64) return 'Username must be 64 characters or fewer.';
  if (!/^[a-zA-Z0-9._@-]+$/.test(name)) {
    return 'Username can use letters, numbers, and . _ @ - only.';
  }
  return null;
}

/**
 * The display name is optional, so an empty value is valid and stored as null
 * rather than as an empty string — one representation of "not set", not two.
 */
export function validateFullName(fullName: string): string | null {
  const name = fullName.trim();
  if (!name) return null;
  if (name.length > 120) return 'Full name must be 120 characters or fewer.';
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    return 'Full name cannot contain control characters.';
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) return 'Password cannot be empty.';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  // bcrypt silently ignores everything past 72 bytes, which would make two
  // different long passwords interchangeable. Refuse rather than truncate.
  if (new TextEncoder().encode(password).length > 72) {
    return 'Password must be 72 bytes or fewer (a bcrypt limit).';
  }
  return null;
}
