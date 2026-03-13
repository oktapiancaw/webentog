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
'use server';

import { cookies } from 'next/headers';

const SESSION_COOKIE_NAME = 'auth_session';

export async function isPersistentMode() {
  return process.env.PERSISTENT_CONNECTION !== 'false';
}

export async function loginAction(
  usernameInput: string,
  passwordInput: string
) {
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminUsername || !adminPassword) {
    console.error(
      'ADMIN_USERNAME or ADMIN_PASSWORD not set in environment variables'
    );
    return { success: false, message: 'Server configuration error' };
  }

  if (usernameInput === adminUsername && passwordInput === adminPassword) {
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, 'true', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 1 week
      path: '/',
    });
    return { success: true };
  }

  return { success: false, message: 'Invalid username or password' };
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  return { success: true };
}

export async function isAuthenticated() {
  if (process.env.PERSISTENT_CONNECTION === 'false') return true;

  const cookieStore = await cookies();
  return cookieStore.has(SESSION_COOKIE_NAME);
}
