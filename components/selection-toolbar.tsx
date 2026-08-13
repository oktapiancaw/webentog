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
import { Download, Ellipsis, TrashIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn, REVEAL_ANIMATION } from '@/lib/utils';

interface SelectionToolbarProps {
  count: number;
  /** How many of the checked rows are folders, for the confirm wording. */
  folderCount: number;
  busy?: boolean;
  onClear: () => void;
  onDelete: () => void;
  onDownload: () => void;
}

export function SelectionToolbar({
  count,
  folderCount,
  busy,
  onClear,
  onDelete,
  onDownload,
}: SelectionToolbarProps) {
  // Same inline swap the row-level delete uses, rather than a second modal.
  const [confirming, setConfirming] = useState(false);

  if (count === 0) return null;

  const items = `${count} item${count === 1 ? '' : 's'}`;

  if (confirming) {
    return (
      <div
        className={cn(
          'flex items-center justify-between gap-3 rounded-md bg-destructive px-3 py-2 text-white',
          REVEAL_ANIMATION
        )}
      >
        <span className="min-w-0 text-sm">
          Delete {items}
          {/* A folder delete is recursive and has no undo, so the count alone
              understates what is about to happen. */}
          {folderCount > 0 &&
            `, including everything inside ${folderCount === 1 ? 'the folder' : `${folderCount} folders`}`}
          ?
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setConfirming(false)}
            className="text-xs hover:underline"
          >
            No
          </button>
          <button
            onClick={() => {
              setConfirming(false);
              onDelete();
            }}
            className="rounded-sm bg-white px-2 py-0.5 text-xs font-medium text-destructive"
          >
            Yes
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-md border bg-accent/40 px-3 py-1.5',
        REVEAL_ANIMATION
      )}
    >
      <span className="text-sm text-strong">{count} selected</span>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="xs" onClick={onClear} disabled={busy}>
          Clear
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={busy}
              aria-label={`Actions for ${items}`}
            >
              <Ellipsis className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={onDownload}>
              <Download /> Download (.zip)
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setConfirming(true)}
            >
              <TrashIcon /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
