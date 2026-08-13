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
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/app/actions/auth';
import { listUsers } from '@/app/actions/users';
import { AppShell } from '@/components/app-shell';
import { UsersAdmin } from './users-admin';

/**
 * Server component: the role check runs before anything renders, so a
 * non-admin never receives the user list in the payload at all. The actions
 * behind the table re-check on every call regardless — this redirect is for
 * the person who typed the URL, not the security boundary.
 */
export default async function AdminUsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'admin') redirect('/');

  const users = await listUsers();
  return (
    <AppShell>
      <UsersAdmin initialUsers={users} currentUserId={user.userId} />
    </AppShell>
  );
}
