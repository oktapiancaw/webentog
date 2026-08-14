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

import {
  Folder,
  Image as ImageIcon,
  FileText,
  FileJson,
  FileCode,
  Film,
  Music,
  Download,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Eye,
  Share2Icon,
  TrashIcon,
  Ellipsis,
  History,
  Pin,
  PinOff,
  Sigma,
  PencilLine,
  Copy as CopyIcon,
  FolderInput,
  ArrowUp,
  ArrowDown,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import * as React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  cn,
  copyToClipboard,
  formatStorage,
  PAGE_SIZES,
  pageWindow,
  REVEAL_ANIMATION,
  validateObjectName,
  type FileType,
  type SortColumn,
  type SortDirection,
} from '@/lib/utils';

export type { FileType };

export interface FileItem {
  id: string;
  fullPath: string;
  name: string;
  type: FileType;
  size: string;
  /** Raw bytes behind `size`. Sort-only, never rendered. */
  sizeBytes: number | null;
  lastModified: string;
}

interface StorageBrowserProps {
  files: FileItem[];
  isLoading?: boolean;
  selectedId?: string | null;
  onNavigate?: (folderName: string) => void;
  onDownload?: (fileId: string, fileName: string) => void;
  onDownloadFolder?: (path: string) => void;
  onView?: (file: FileItem) => void;
  onViewVersions?: (file: FileItem) => void;
  onDelete?: (file: FileItem) => void;
  /** Recursive — the folder and everything under it. */
  onDeleteFolder?: (file: FileItem) => void;
  /** `newName` is a single segment, never a path. */
  onRename?: (file: FileItem, newName: string) => void;
  /** Both open the destination picker; the item keeps its name either way. */
  onCopyRequest?: (file: FileItem) => void;
  onMoveRequest?: (file: FileItem) => void;
  /** Folders only — opens this browser in a second tab at that folder. */
  onOpenInNewTab?: (file: FileItem) => void;
  /** Bulk-action selection. Separate from `selectedId`, which is the preview. */
  checkedIds: Set<string>;
  onToggleChecked: (file: FileItem) => void;
  onToggleCheckAll: () => void;
  /** null = the server's default order. */
  sortColumn: SortColumn | null;
  sortDirection: SortDirection;
  onSortClick: (column: SortColumn) => void;
  /**
   * False while only one page of a large folder is in memory. Sorting then
   * would reorder 20 rows and look like it reordered the folder.
   */
  canSort: boolean;
  /** Keyed by S3 key (FileItem.id), matching what the pins table stores. */
  pinnedPaths?: Set<string>;
  onTogglePin?: (file: FileItem) => void;
  pageSize: number;
  pageIndex: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  /** Null when the total is unknown — cursor paging without a folder count. */
  totalPages: number | null;
  onNext: () => void;
  onPrev: () => void;
  /** Jump to a 0-indexed page. */
  onGoToPage: (index: number) => void;
  onPageSizeChange: (size: number) => void;
  /** null until counted. Counting walks the whole folder, so it is opt-in. */
  folderCount: { count: number; totalBytes: number } | null;
  isCounting: boolean;
  onCount: () => void;
}

/**
 * One row action, rendered into either menu.
 *
 * The row has two triggers now — the "..." button and right-click — and both
 * must offer the same things. Describing the items once and rendering them
 * twice is what stops the two from drifting apart on the next edit; they were
 * hand-written JSX branches before, and duplicating those would have meant
 * four branches to keep in step.
 */
interface RowAction {
  key: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  separatorBefore?: boolean;
}

/** Header order, and the column each one sorts by. */
const SORT_COLUMNS: { key: SortColumn; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'size', label: 'Size' },
  { key: 'lastModified', label: 'Last Modified' },
];

const ICONS: Record<FileType, React.ElementType> = {
  folder: Folder,
  image: ImageIcon,
  pdf: FileText,
  json: FileJson,
  video: Film,
  audio: Music,
  text: FileCode,
  unknown: FileText,
};

// DESIGN.md: icons are single-color grey line art. Only the folder takes a
// fill, so directories stand out without a second accent color.
export const getFileIcon = (type: FileType) => {
  const Icon = ICONS[type] ?? FileText;
  return (
    <Icon
      className={cn(
        'size-4.5 text-muted-foreground',
        type === 'folder' && 'text-foreground fill-foreground/15'
      )}
    />
  );
};

export function StorageBrowser({
  files,
  isLoading,
  selectedId,
  onNavigate,
  onDownload,
  onDownloadFolder,
  onView,
  onViewVersions,
  onDelete,
  onDeleteFolder,
  onRename,
  onCopyRequest,
  onMoveRequest,
  onOpenInNewTab,
  checkedIds,
  onToggleChecked,
  onToggleCheckAll,
  sortColumn,
  sortDirection,
  onSortClick,
  canSort,
  pinnedPaths,
  onTogglePin,
  pageSize,
  pageIndex,
  hasNextPage,
  hasPrevPage,
  totalPages,
  onNext,
  onPrev,
  onGoToPage,
  onPageSizeChange,
  folderCount,
  isCounting,
  onCount,
}: StorageBrowserProps) {
  // Same inline confirm as connection deletion in app-sidebar.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // Rename swaps the row for an input, reusing the confirm row's mechanic.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const copyPath = async (path: string) => {
    const ok = await copyToClipboard(path);
    toast[ok ? 'success' : 'error'](
      ok ? 'Path copied' : 'Could not copy to the clipboard.'
    );
  };

  const startRename = (file: FileItem) => {
    setConfirmDeleteId(null);
    setRenamingId(file.id);
    setRenameValue(file.name);
  };

  const submitRename = (file: FileItem) => {
    const name = renameValue.trim();
    setRenamingId(null);
    if (!name || name === file.name) return;
    const invalid = validateObjectName(name);
    if (invalid) return toast.error(invalid);
    onRename?.(file, name);
  };

  const rowActions = (file: FileItem): RowAction[] => {
    if (file.type === 'folder') {
      const pinned = pinnedPaths?.has(file.id);
      return [
        {
          key: 'open',
          icon: ArrowRight,
          label: 'Open',
          onSelect: () => onNavigate?.(file.id),
        },
        {
          key: 'open-new-tab',
          icon: ExternalLink,
          label: 'Open in new tab',
          onSelect: () => onOpenInNewTab?.(file),
        },
        {
          key: 'pin',
          icon: pinned ? PinOff : Pin,
          label: pinned ? 'Unpin folder' : 'Pin folder',
          onSelect: () => onTogglePin?.(file),
        },
        {
          key: 'copy-path',
          icon: Share2Icon,
          label: 'Copy path',
          onSelect: () => copyPath(file.fullPath),
        },
        {
          key: 'rename',
          icon: PencilLine,
          label: 'Rename',
          onSelect: () => startRename(file),
        },
        {
          key: 'copy-to',
          icon: CopyIcon,
          label: 'Copy to…',
          onSelect: () => onCopyRequest?.(file),
        },
        {
          key: 'move-to',
          icon: FolderInput,
          label: 'Move to…',
          onSelect: () => onMoveRequest?.(file),
        },
        {
          key: 'download-zip',
          icon: Download,
          label: 'Download (.zip)',
          onSelect: () => onDownloadFolder?.(file.fullPath),
          separatorBefore: true,
        },
        {
          key: 'delete',
          icon: TrashIcon,
          label: 'Delete',
          onSelect: () => setConfirmDeleteId(file.id),
          destructive: true,
        },
      ];
    }

    return [
      {
        key: 'preview',
        icon: Eye,
        label: 'Preview',
        onSelect: () => onView?.(file),
      },
      {
        key: 'versions',
        icon: History,
        label: 'Versions',
        onSelect: () => onViewVersions?.(file),
      },
      {
        key: 'copy-path',
        icon: Share2Icon,
        label: 'Copy path',
        onSelect: () => copyPath(file.fullPath),
      },
      {
        key: 'download',
        icon: Download,
        label: 'Download',
        onSelect: () => onDownload?.(file.id, file.name),
      },
      {
        key: 'rename',
        icon: PencilLine,
        label: 'Rename',
        onSelect: () => startRename(file),
      },
      {
        key: 'copy-to',
        icon: CopyIcon,
        label: 'Copy to…',
        onSelect: () => onCopyRequest?.(file),
      },
      {
        key: 'move-to',
        icon: FolderInput,
        label: 'Move to…',
        onSelect: () => onMoveRequest?.(file),
      },
      {
        key: 'delete',
        icon: TrashIcon,
        label: 'Delete',
        onSelect: () => setConfirmDeleteId(file.id),
        destructive: true,
        separatorBefore: true,
      },
    ];
  };

  // Every row already checked, so the header box toggles off rather than on.
  // Guarded on length: `every` on an empty page is vacuously true, which would
  // paint the header checked while nothing is selected.
  const allVisibleChecked =
    files.length > 0 && files.every((f) => checkedIds.has(f.id));
  const someVisibleChecked = files.some((f) => checkedIds.has(f.id));
  const hasChecked = checkedIds.size > 0;

  const renderRows = () => {
    if (isLoading) {
      return Array.from({ length: pageSize }).map((_, i) => (
        <tr key={`skeleton-${i}`} className="border-b last:border-0">
          <td className="w-10 px-4 py-2.5">
            <Skeleton className="size-4 rounded-sm" />
          </td>
          <td className="px-4 py-2.5">
            <div className="flex items-center gap-3">
              <Skeleton className="size-4 rounded-sm" />
              <Skeleton className="h-3.5 w-40" />
            </div>
          </td>
          <td className="px-4 py-2.5">
            <Skeleton className="h-3 w-12" />
          </td>
          <td className="px-4 py-2.5">
            <Skeleton className="h-3 w-24" />
          </td>
          <td className="px-4 py-2.5 text-right">
            <div className="flex justify-end">
              <Skeleton className="size-7" />
            </div>
          </td>
        </tr>
      ));
    }

    if (files.length === 0) {
      return (
        <tr>
          <td
            colSpan={5}
            className="p-10 text-center text-sm text-muted-foreground"
          >
            Nothing here. This directory is empty.
          </td>
        </tr>
      );
    }

    return files.map((file) => {
      const isSelected = selectedId === file.id;

      if (confirmDeleteId === file.id) {
        const isFolder = file.type === 'folder';
        return (
          <tr key={file.id} className="border-b last:border-0">
            <td colSpan={5} className="bg-destructive px-4 py-2.5 text-white">
              {/* The animation goes on the inner div, not the cell: transforms
                  on a table-cell are unreliable across browsers. */}
              <div
                className={cn(
                  'flex items-center justify-between gap-3',
                  REVEAL_ANIMATION
                )}
              >
                <span className="min-w-0 truncate text-sm">
                  Delete <span className="font-mono">{file.name}</span>
                  {/* A folder delete is recursive and has no undo, so say so
                      rather than asking the same question as a file. */}
                  {isFolder && ' and everything inside it'}?
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="text-xs hover:underline"
                  >
                    No
                  </button>
                  <button
                    onClick={() => {
                      setConfirmDeleteId(null);
                      if (isFolder) onDeleteFolder?.(file);
                      else onDelete?.(file);
                    }}
                    className="rounded-sm bg-white px-2 py-0.5 text-xs font-medium text-destructive"
                  >
                    Yes
                  </button>
                </div>
              </div>
            </td>
          </tr>
        );
      }

      if (renamingId === file.id) {
        return (
          <tr key={file.id} className="border-b last:border-0 bg-accent">
            <td colSpan={5} className="px-4 py-2">
              <div className={cn('flex items-center gap-3', REVEAL_ANIMATION)}>
                {getFileIcon(file.type)}
                <Input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitRename(file);
                    if (e.key === 'Escape') setRenamingId(null);
                  }}
                  className="h-7 font-mono text-sm"
                  aria-label={`Rename ${file.name}`}
                />
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7"
                    onClick={() => setRenamingId(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="h-7"
                    onClick={() => submitRename(file)}
                  >
                    Save
                  </Button>
                </div>
              </div>
            </td>
          </tr>
        );
      }

      return (
        // Radix's ContextMenu is what anchors a menu to the cursor; a
        // DropdownMenu can only anchor to a rendered trigger, so right-click
        // would have popped it open over the "..." button instead. Root renders
        // no DOM and Content is portalled, so <tbody> still sees only <tr>.
        <ContextMenu key={file.id}>
          <ContextMenuTrigger asChild>
            <tr
              // Not data-state: Radix's ContextMenuTrigger owns that attribute
              // on its trigger and overwrites it with open/closed.
              data-selected={isSelected || undefined}
              className={cn(
                'group border-b transition-colors last:border-0 hover:bg-accent/50',
                isSelected && 'bg-accent'
              )}
            >
              {/* Outside the clickable name cell so checking a row never also
              opens the preview or navigates into the folder. */}
              <td className="w-10 px-4 py-2.5 align-middle">
                <Checkbox
                  checked={checkedIds.has(file.id)}
                  onCheckedChange={() => onToggleChecked(file)}
                  aria-label={`Select ${file.name}`}
                  className={cn(
                    'transition-opacity',
                    // Hidden until hover, like the row's own "..." trigger — but
                    // never once a selection exists, or unchecking turns into a
                    // hunt for a box that vanished when the pointer left.
                    !hasChecked &&
                      'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=checked]:opacity-100'
                  )}
                />
              </td>
              <td
                onClick={() =>
                  file.type === 'folder'
                    ? onNavigate?.(file.id)
                    : onView?.(file)
                }
                className="relative cursor-pointer px-4 py-2.5 align-middle"
              >
                {isSelected && (
                  <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" />
                )}
                <div className="flex items-center gap-3">
                  {getFileIcon(file.type)}
                  <span
                    className="max-w-50 truncate text-sm text-strong md:max-w-md"
                    title={file.name}
                  >
                    {file.name}
                  </span>
                </div>
              </td>
              <td className="px-4 py-2.5 align-middle font-mono text-xs text-muted-foreground">
                {file.size}
              </td>
              <td className="px-4 py-2.5 align-middle font-mono text-xs text-muted-foreground">
                {file.lastModified}
              </td>
              <td className="px-4 py-2.5 text-right align-middle">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      id={file.id}
                      className="size-7 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                    >
                      <Ellipsis className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    {rowActions(file).map((action) => (
                      <React.Fragment key={action.key}>
                        {action.separatorBefore && <DropdownMenuSeparator />}
                        <DropdownMenuItem
                          variant={
                            action.destructive ? 'destructive' : 'default'
                          }
                          onClick={action.onSelect}
                        >
                          <action.icon /> {action.label}
                        </DropdownMenuItem>
                      </React.Fragment>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </tr>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-44">
            {rowActions(file).map((action) => (
              <React.Fragment key={action.key}>
                {action.separatorBefore && <ContextMenuSeparator />}
                <ContextMenuItem
                  variant={action.destructive ? 'destructive' : 'default'}
                  onClick={action.onSelect}
                >
                  <action.icon /> {action.label}
                </ContextMenuItem>
              </React.Fragment>
            ))}
          </ContextMenuContent>
        </ContextMenu>
      );
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="w-full overflow-hidden rounded-xl border bg-card text-card-foreground">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="h-9 w-10 px-4 align-middle">
                  <Checkbox
                    // A dash, not a tick, once the page is partly selected —
                    // a full tick after unchecking one row would claim the
                    // whole page is still selected.
                    checked={
                      allVisibleChecked
                        ? true
                        : someVisibleChecked
                          ? 'indeterminate'
                          : false
                    }
                    onCheckedChange={onToggleCheckAll}
                    disabled={isLoading || files.length === 0}
                    // "This page", not "this folder": in cursor mode the client
                    // has never seen the pages it has not fetched.
                    aria-label="Select everything on this page"
                    title={
                      someVisibleChecked && !allVisibleChecked
                        ? 'Select the rest of this page'
                        : 'Select everything on this page'
                    }
                  />
                </th>
                {SORT_COLUMNS.map(({ key, label }) => {
                  const active = sortColumn === key;
                  return (
                    <th
                      key={key}
                      aria-sort={
                        active
                          ? sortDirection === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                      className={cn(
                        'h-9 select-none px-4 align-middle text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground',
                        canSort
                          ? 'cursor-pointer hover:text-foreground'
                          : 'cursor-default opacity-50',
                        active && 'text-strong'
                      )}
                      onClick={() => canSort && onSortClick(key)}
                      title={
                        canSort
                          ? undefined
                          : 'Only this page is loaded. Use "Scan all" to sort the whole folder.'
                      }
                    >
                      <span className="inline-flex items-center gap-1">
                        {label}
                        {active &&
                          (sortDirection === 'asc' ? (
                            <ArrowUp className="size-3" />
                          ) : (
                            <ArrowDown className="size-3" />
                          ))}
                      </span>
                    </th>
                  );
                })}
                <th className="h-9 px-4 text-right align-middle text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>{renderRows()}</tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col items-center justify-between gap-3 px-1 sm:flex-row">
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            Rows per page
          </span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange(Number(v))}
          >
            <SelectTrigger size="sm" className="w-18">
              <SelectValue placeholder={String(pageSize)} />
            </SelectTrigger>
            <SelectContent>
              {/* Same list the `?size=` allowlist uses, so they cannot drift. */}
              {PAGE_SIZES.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Cursor paging never reads the whole folder, so a total is opt-in. */}
          <span className="ml-1 font-mono text-xs text-muted-foreground">
            {files.length} shown
          </span>
          {folderCount ? (
            <span
              className="font-mono text-xs text-muted-foreground"
              title="Direct children only — subfolders count as one entry and their contents are not included"
            >
              · {folderCount.count} total ·{' '}
              {formatStorage(folderCount.totalBytes)}
            </span>
          ) : (
            <Button
              variant="ghost"
              size="xs"
              onClick={onCount}
              loading={isCounting}
              disabled={isCounting}
              title="Walks the whole folder to count objects and add up their size"
            >
              {!isCounting && <Sigma className="size-3" />}
              Count
            </Button>
          )}
        </div>

        {(hasPrevPage || hasNextPage) && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              disabled={!hasPrevPage || isLoading}
              onClick={onPrev}
            >
              <ChevronLeft className="size-4" />
            </Button>
            {/* With no known total, the strip grows one page ahead of where
                the cursor has reached instead of claiming a last page. */}
            {pageWindow(
              pageIndex + 1,
              totalPages ?? pageIndex + (hasNextPage ? 2 : 1)
            ).map((page, i) =>
              page === 'gap' ? (
                <span
                  key={`gap-${i}`}
                  aria-hidden
                  className="px-0.5 font-mono text-xs text-muted-foreground"
                >
                  …
                </span>
              ) : (
                <Button
                  key={page}
                  variant={page === pageIndex + 1 ? 'outline' : 'ghost'}
                  size="icon"
                  aria-label={`Page ${page}`}
                  aria-current={page === pageIndex + 1 ? 'page' : undefined}
                  className={cn(
                    'size-8 font-mono text-xs text-muted-foreground',
                    page === pageIndex + 1 && 'bg-accent text-strong'
                  )}
                  disabled={isLoading}
                  onClick={() => onGoToPage(page - 1)}
                >
                  {page}
                </Button>
              )
            )}
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              disabled={!hasNextPage || isLoading}
              onClick={onNext}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
