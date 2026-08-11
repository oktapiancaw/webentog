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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { useState } from 'react';
import { toast } from 'sonner';
import { cn, type FileType } from '@/lib/utils';

export type { FileType };

export interface FileItem {
  id: string;
  fullPath: string;
  name: string;
  type: FileType;
  size: string;
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
  /** Keyed by S3 key (FileItem.id), matching what the pins table stores. */
  pinnedPaths?: Set<string>;
  onTogglePin?: (file: FileItem) => void;
  pageSize: number;
  pageIndex: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  onNext: () => void;
  onPrev: () => void;
  onPageSizeChange: (size: number) => void;
  /** null until counted. Counting walks the whole folder, so it is opt-in. */
  folderCount: { count: number; capped: boolean } | null;
  isCounting: boolean;
  onCount: () => void;
}

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
  pinnedPaths,
  onTogglePin,
  pageSize,
  pageIndex,
  hasNextPage,
  hasPrevPage,
  onNext,
  onPrev,
  onPageSizeChange,
  folderCount,
  isCounting,
  onCount,
}: StorageBrowserProps) {
  // Same inline confirm as connection deletion in app-sidebar.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const copyPath = (path: string) => {
    navigator.clipboard.writeText(path);
    toast.success('Path copied');
  };

  const renderRows = () => {
    if (isLoading) {
      return Array.from({ length: pageSize }).map((_, i) => (
        <tr key={`skeleton-${i}`} className="border-b last:border-0">
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
            colSpan={4}
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
        return (
          <tr key={file.id} className="border-b last:border-0">
            <td colSpan={4} className="bg-destructive px-4 py-2.5 text-white">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm">
                  Delete <span className="font-mono">{file.name}</span>?
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
                      onDelete?.(file);
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

      return (
        <tr
          key={file.id}
          data-state={isSelected ? 'selected' : undefined}
          className={cn(
            'group border-b transition-colors last:border-0 hover:bg-accent/50',
            isSelected && 'bg-accent'
          )}
        >
          <td
            onClick={() =>
              file.type === 'folder' ? onNavigate?.(file.id) : onView?.(file)
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
                <DropdownMenuGroup>
                  {file.type === 'folder' ? (
                    <>
                      <DropdownMenuItem onClick={() => onNavigate?.(file.id)}>
                        <ArrowRight /> Open
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onTogglePin?.(file)}>
                        {pinnedPaths?.has(file.id) ? (
                          <>
                            <PinOff /> Unpin folder
                          </>
                        ) : (
                          <>
                            <Pin /> Pin folder
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => copyPath(file.fullPath)}>
                        <Share2Icon /> Copy path
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <>
                      <DropdownMenuItem onClick={() => onView?.(file)}>
                        <Eye /> Preview
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onViewVersions?.(file)}>
                        <History /> Versions
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => copyPath(file.fullPath)}>
                        <Share2Icon /> Copy path
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onDownload?.(file.id, file.name)}
                      >
                        <Download /> Download
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuGroup>

                <DropdownMenuSeparator />

                {file.type === 'folder' ? (
                  <DropdownMenuItem
                    onClick={() => onDownloadFolder?.(file.fullPath)}
                  >
                    <Download /> Download (.zip)
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => setConfirmDeleteId(file.id)}
                  >
                    <TrashIcon /> Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </td>
        </tr>
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
                {['Name', 'Size', 'Last Modified'].map((label) => (
                  <th
                    key={label}
                    className="h-9 px-4 align-middle text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground"
                  >
                    {label}
                  </th>
                ))}
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
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
          {/* Cursor paging never reads the whole folder, so a total is opt-in. */}
          <span className="ml-1 font-mono text-xs text-muted-foreground">
            {files.length} shown
          </span>
          {folderCount ? (
            <span className="font-mono text-xs text-muted-foreground">
              · {folderCount.count}
              {folderCount.capped && '+'} total
            </span>
          ) : (
            <Button
              variant="ghost"
              size="xs"
              onClick={onCount}
              loading={isCounting}
              disabled={isCounting}
              title="Walks the whole folder to count objects"
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
            <span className="font-mono text-xs text-muted-foreground">
              Page {pageIndex + 1}
            </span>
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
