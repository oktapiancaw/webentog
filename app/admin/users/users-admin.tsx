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
'use client';

import { useState } from 'react';
import { Plus, TrashIcon, UserCog } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  createUser,
  deleteUser,
  listUsers,
  updateUser,
  type PublicUser,
} from '@/app/actions/users';
import type { UserRole } from '@/lib/db/types';
import { toastError } from '@/lib/errors';
import { unwrap } from '@/lib/action-result';
import {
  validateFullName,
  validatePassword,
  validateUsername,
} from '@/lib/users';
import { cn } from '@/lib/utils';

interface Props {
  initialUsers: PublicUser[];
  currentUserId: number;
}

const BLANK = {
  username: '',
  fullName: '',
  password: '',
  role: 'user' as UserRole,
};

export function UsersAdmin({ initialUsers, currentUserId }: Props) {
  const [users, setUsers] = useState(initialUsers);
  const [editing, setEditing] = useState<PublicUser | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [isSaving, setIsSaving] = useState(false);
  // Same inline Yes/No the connection and file rows use.
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const refresh = async () => setUsers(await listUsers());

  const openCreate = () => {
    setEditing(null);
    setForm(BLANK);
    setIsOpen(true);
  };

  const openEdit = (user: PublicUser) => {
    setEditing(user);
    // Password stays blank on edit: an empty field means "leave it alone",
    // never "set the password to empty".
    setForm({
      username: user.username,
      fullName: user.full_name ?? '',
      password: '',
      role: user.role,
    });
    setIsOpen(true);
  };

  const handleSave = async () => {
    const nameError =
      validateUsername(form.username) ?? validateFullName(form.fullName);
    if (nameError) return toast.error(nameError);
    // On create a password is required; on edit, blank means unchanged.
    if (!editing || form.password) {
      const pwError = validatePassword(form.password);
      if (pwError) return toast.error(pwError);
    }

    setIsSaving(true);
    try {
      if (editing) {
        unwrap(
          await updateUser(editing.id, {
            username: form.username,
            fullName: form.fullName,
            role: form.role,
            ...(form.password ? { password: form.password } : {}),
          })
        );
        toast.success(`Updated ${form.username}.`);
      } else {
        unwrap(
          await createUser(
            form.username,
            form.password,
            form.role,
            form.fullName
          )
        );
        toast.success(`Created ${form.username}.`);
      }
      setIsOpen(false);
      setForm(BLANK);
      await refresh();
    } catch (error) {
      toastError(error, 'Could not save that user.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (user: PublicUser) => {
    setConfirmDeleteId(null);
    try {
      unwrap(await deleteUser(user.id));
      toast.success(`Deleted ${user.username}.`);
      await refresh();
    } catch (error) {
      toastError(error, `Could not delete ${user.username}.`);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-[15px] text-strong">
              <UserCog className="size-4 text-muted-foreground" />
              Users
            </h1>
            <p className="text-[13px] text-muted-foreground">
              Each user keeps their own connections and pinned folders.
            </p>
          </div>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          New user
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Username</th>
              <th className="px-4 py-2.5 font-medium">Full name</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium">Granted access</th>
              <th className="px-4 py-2.5 font-medium">Created</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {users.map((user) =>
              confirmDeleteId === user.id ? (
                <tr key={user.id} className="border-b last:border-0">
                  <td
                    colSpan={6}
                    className="bg-destructive px-4 py-2.5 text-white"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-sm">
                        Delete{' '}
                        <span className="font-mono">{user.username}</span>?
                        Their pins go with them; connections they own move to
                        you.
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-xs hover:underline"
                        >
                          No
                        </button>
                        <button
                          onClick={() => handleDelete(user)}
                          className="rounded-sm bg-white px-2 py-0.5 text-xs font-medium text-destructive"
                        >
                          Yes
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr
                  key={user.id}
                  className="group border-b transition-colors last:border-0 hover:bg-accent/50"
                >
                  <td className="px-4 py-2.5 font-mono text-[13px] text-strong">
                    {user.username}
                    {user.id === currentUserId && (
                      <span className="ml-2 text-[11px] text-muted-foreground">
                        you
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-[13px] text-muted-foreground">
                    {user.full_name || <span className="text-fog">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={cn(
                        'rounded-[4px] px-1.5 py-0.5 text-[11px]',
                        user.role === 'admin'
                          ? 'bg-foreground/10 text-strong'
                          : 'bg-foreground/5 text-muted-foreground'
                      )}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="max-w-64 px-4 py-2.5">
                    {/* Grants only. An admin already reaches everything, and a
                        connection someone owns is not access they were given. */}
                    {user.role === 'admin' ? (
                      <span className="text-[11px] text-muted-foreground">
                        all connections
                      </span>
                    ) : user.grantedConnections.length === 0 ? (
                      <span className="text-fog">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {user.grantedConnections.map((name) => (
                          <span
                            key={name}
                            className="max-w-40 truncate rounded-[4px] bg-foreground/5 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                            title={name}
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {user.created_at.slice(0, 10)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7"
                        onClick={() => openEdit(user)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-destructive"
                        aria-label={`Delete ${user.username}`}
                        // Deleting yourself would leave a valid cookie for a
                        // row that no longer exists; the server refuses too.
                        disabled={user.id === currentUserId}
                        onClick={() => setConfirmDeleteId(user.id)}
                      >
                        <TrashIcon className="size-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit user' : 'New user'}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label className="text-[11px] text-muted-foreground">
                Username
              </Label>
              <Input
                autoFocus
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="font-mono text-sm"
              />
            </div>

            <div className="grid gap-2">
              <Label className="text-[11px] text-muted-foreground">
                Full name <span className="text-fog">(optional)</span>
              </Label>
              <Input
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                placeholder="Shown instead of the username where there is room"
                className="text-sm"
              />
            </div>

            <div className="grid gap-2">
              <Label className="text-[11px] text-muted-foreground">
                Password{editing && ' (leave blank to keep the current one)'}
              </Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={editing ? '••••••••' : 'At least 8 characters'}
                className="font-mono text-sm"
              />
            </div>

            <div className="grid gap-2">
              <Label className="text-[11px] text-muted-foreground">Role</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v as UserRole })}
              >
                <SelectTrigger className="font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">user</SelectItem>
                  <SelectItem value="admin">admin</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                An admin sees every connection and can manage users and access.
              </p>
            </div>
          </div>

          <DialogFooter className="sm:justify-between">
            <DialogClose asChild>
              <Button variant="secondary" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button onClick={handleSave} loading={isSaving} disabled={isSaving}>
              {editing ? 'Save changes' : 'Create user'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
