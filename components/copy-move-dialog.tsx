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

import { useEffect, useState } from 'react';
import { ChevronRight, Folder, Loader2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { FileItem } from '@/components/app-browser';
import {
  copyObjectTo,
  listStorageFiles,
  moveObjectTo,
  type ConnectionConfig,
  type FormattedFile,
} from '@/app/actions/object-management';
import { unwrap } from '@/lib/action-result';
import {
  basename,
  cn,
  explainError,
  folderPrefix,
  joinFolder,
  parentPrefix,
  REVEAL_ANIMATION,
} from '@/lib/utils';

export interface CopyMoveTarget {
  file: FileItem;
  mode: 'copy' | 'move';
}

interface CopyMoveDialogProps {
  /** null closes the dialog and drives its open state. */
  target: CopyMoveTarget | null;
  config: ConnectionConfig;
  /** Where browsing starts: the folder the item was acted on from. */
  startPath: string;
  onClose: () => void;
  /** Bubbles up so the listing refreshes once something has landed. */
  onDone: () => void;
}

export function CopyMoveDialog({
  target,
  config,
  startPath,
  onClose,
  onDone,
}: CopyMoveDialogProps) {
  // page.tsx keys this by target, so opening a different item remounts and
  // resets every piece of state below. No manual reset in an effect.
  const [browsePath, setBrowsePath] = useState(startPath);
  const [folders, setFolders] = useState<FormattedFile[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!target) return;

    let active = true;
    // set-state-in-effect: this is the loader for a folder the user just
    // clicked, and the spinner it raises is the whole point. Same shape as
    // page.tsx's fetch effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError('');

    listStorageFiles(config, browsePath)
      .then((result) => {
        // Drop a stale response if the user navigated on while it was in
        // flight — otherwise a slow parent listing lands after a fast child's.
        if (!active) return;
        // Cursor mode splits subfolders out of `items` into `folders`; buffered
        // mode leaves them in. Read both and dedupe rather than branching on
        // the mode here.
        const seen = new Set<string>();
        setFolders(
          [...result.folders, ...result.items].filter((entry) => {
            if (entry.type !== 'folder' || seen.has(entry.id)) return false;
            seen.add(entry.id);
            return true;
          })
        );
        setTruncated(result.foldersTruncated);
      })
      .catch((err) => {
        if (!active) return;
        setError(explainError(err, 'Could not open that folder.').message);
        setFolders([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [target, config, browsePath]);

  if (!target) return null;

  const { file, mode } = target;
  const isFolder = file.type === 'folder';
  const verb = mode === 'copy' ? 'Copy' : 'Move';

  const sourcePrefix = folderPrefix(file.id);
  const destPrefix = folderPrefix(browsePath);
  const destKey = joinFolder(browsePath, basename(file.id));

  // Mirrors the server guard in transferFolder. This one is UX only — greying
  // the row out beats letting the user pick it and reading a refusal.
  const wouldNestInItself = isFolder && destPrefix.startsWith(sourcePrefix);
  // Landing where it already is means a same-key copy or a no-op move.
  const isSamePlace = destPrefix === parentPrefix(file.id);
  const blocked = wouldNestInItself || isSamePlace;

  const segments = browsePath.split('/').filter(Boolean);

  const handleConfirm = async () => {
    setBusy(true);
    setError('');
    try {
      const action = mode === 'copy' ? copyObjectTo : moveObjectTo;
      const { path } = unwrap(
        await action(config, file.id, browsePath, isFolder)
      );
      toast.success(`${mode === 'copy' ? 'Copied' : 'Moved'} to ${path}`);
      onDone();
      onClose();
    } catch (err) {
      // Inline, not only a toast: the user is mid-decision in this dialog, not
      // watching a background result, and a conflict is answered by picking a
      // different folder right here.
      setError(explainError(err, `Could not ${mode} ${file.name}.`).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader className="min-w-0">
          <DialogTitle>
            {/* A key has no spaces to break on, so it needs break-all or it
                widens the dialog past its own max-width. */}
            {verb} <span className="font-mono break-all">{file.name}</span> to…
          </DialogTitle>
          <DialogDescription>
            Pick a destination folder. The item keeps its name.
          </DialogDescription>
        </DialogHeader>

        {/* Breadcrumb: same segment-click shape as the header's path bar. */}
        <nav className="flex min-w-0 flex-wrap items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              // h-auto + whitespace-normal: Button is nowrap and fixed-height
              // by default, so one long segment would run past the dialog.
              'h-auto min-h-7 px-2 py-1 font-mono text-[13px] break-all whitespace-normal',
              segments.length > 0 ? 'text-muted-foreground' : 'text-strong'
            )}
            onClick={() => setBrowsePath('/')}
          >
            {config.bucket || 'Home'}
          </Button>
          {segments.map((segment, index) => (
            <div key={segment + index} className="flex items-center gap-0.5">
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" />
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  // h-auto + whitespace-normal: Button is nowrap and fixed-height
                  // by default, so one long segment would run past the dialog.
                  'h-auto min-h-7 px-2 py-1 font-mono text-[13px] break-all whitespace-normal',
                  index === segments.length - 1
                    ? 'text-strong'
                    : 'text-muted-foreground'
                )}
                onClick={() =>
                  setBrowsePath(`${segments.slice(0, index + 1).join('/')}/`)
                }
              >
                {segment}
              </Button>
            </div>
          ))}
        </nav>

        <div className="max-h-[45vh] min-h-40 min-w-0 overflow-auto rounded-md border">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading folders…
            </div>
          ) : folders.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No subfolders here. {verb} into this folder, or go back up.
            </p>
          ) : (
            folders.map((folder) => {
              // Descending into the folder being moved would offer a
              // destination inside the source tree.
              const forbidden =
                isFolder && folderPrefix(folder.id).startsWith(sourcePrefix);
              return (
                <button
                  key={folder.id}
                  type="button"
                  disabled={forbidden}
                  onClick={() => setBrowsePath(folder.id)}
                  title={
                    forbidden ? 'This is the item being moved.' : undefined
                  }
                  className="flex w-full items-center gap-3 border-b px-3 py-2 text-left last:border-0 hover:bg-accent/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <Folder className="size-4.5 shrink-0 fill-foreground/15 text-foreground" />
                  <span className="min-w-0 truncate text-sm">
                    {folder.name}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Move only. A copy leaves the original and its history exactly where
            they are, so there is nothing to warn about there. */}
        {mode === 'move' && (
          <div
            className={cn(
              'flex items-start gap-2.5 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-destructive',
              REVEAL_ANIMATION
            )}
          >
            <TriangleAlert className="mt-px size-4 shrink-0" />
            <p className="min-w-0 text-xs">
              Only the <em>current</em> version will be moved. Previous versions
              will remain at the old location and become inaccessible.
            </p>
          </div>
        )}

        {truncated && (
          <p
            className={cn(
              'rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground',
              REVEAL_ANIMATION
            )}
          >
            Large directory — some subfolders may be missing from this list.
            {/* ponytail: the picker takes one listing per folder, same as the
                browser's first page. Paging it is worth doing only if someone
                actually hits a folder wide enough for this to bite. */}
          </p>
        )}

        {error && (
          <p
            className={cn(
              'rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive',
              REVEAL_ANIMATION
            )}
          >
            {error}
          </p>
        )}

        {/* min-w-0: DialogContent is a grid, and a grid item defaults to
            min-width:auto — without this the unbreakable destination key sets
            the track width and the buttons get pushed out of the dialog. */}
        <DialogFooter className="min-w-0 sm:items-center sm:justify-between">
          <p
            // Wrapped rather than truncated: the destination is the one thing
            // worth reading before committing, and its tail is the part that
            // says where this actually lands.
            className="min-w-0 font-mono text-xs break-all text-muted-foreground"
            title={destKey}
          >
            {blocked
              ? wouldNestInItself
                ? 'Cannot move a folder into itself.'
                : `Already in ${segments.at(-1) ?? (config.bucket || 'this folder')}.`
              : `→ ${destKey}${isFolder ? '/' : ''}`}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              loading={busy}
              disabled={busy || loading || blocked}
            >
              {verb} here
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
