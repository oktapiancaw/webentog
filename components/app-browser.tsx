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
  Film,
  Download,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Eye,
  Share2Icon,
  TrashIcon,
  Ellipsis,
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
import { toast } from 'sonner';

export type FileType =
  | 'folder'
  | 'image'
  | 'pdf'
  | 'json'
  | 'video'
  | 'unknown';

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
  onNavigate?: (folderName: string) => void;
  onDownload?: (fileId: string, fileName: string) => void;
  onDownloadFolder?: (path: string) => void;
  onView?: (file: FileItem) => void;
  pageSize: number | 'all';
  currentPage: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number | 'all') => void;
}

const getFileIcon = (type: FileType) => {
  const baseClass = 'size-5 text-slate-700 dark:text-slate-400';
  switch (type) {
    case 'folder':
      return (
        <Folder
          className={`${baseClass} fill-slate-700/20 dark:fill-slate-400/20`}
        />
      );
    case 'image':
      return <ImageIcon className={baseClass} />;
    case 'pdf':
      return (
        <FileText
          className={`${baseClass} fill-slate-700/20 dark:fill-slate-400/20`}
        />
      );
    case 'json':
      return <FileJson className={baseClass} />;
    case 'video':
      return (
        <Film
          className={`${baseClass} fill-slate-700/20 dark:fill-slate-400/20`}
        />
      );
    default:
      return <FileText className="size-5 text-muted-foreground" />;
  }
};

export function StorageBrowser({
  files,
  isLoading,
  onNavigate,
  onDownload,
  onDownloadFolder,
  onView,
  pageSize,
  currentPage,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: StorageBrowserProps) {
  const totalPages = pageSize === 'all' ? 1 : Math.ceil(totalItems / pageSize);
  const copyPath = (path: string) => {
    navigator.clipboard.writeText(path);
    toast.success('Path copied');
  };
  const renderRows = () => {
    if (isLoading) {
      return Array.from({ length: pageSize === 'all' ? 10 : pageSize }).map(
        (_, i) => (
          <tr key={`skeleton-${i}`} className="border-b last:border-0">
            <td className="p-4 px-6">
              <div className="flex items-center gap-3">
                <Skeleton className="h-5 w-5 rounded-none" />
                <Skeleton className="h-4 w-32 rounded-none" />
              </div>
            </td>
            <td className="p-4 px-6">
              <Skeleton className="h-4 w-12 rounded-none" />
            </td>
            <td className="p-4 px-6">
              <Skeleton className="h-4 w-24 rounded-none" />
            </td>
            <td className="p-4 px-6 text-right">
              <div className="flex justify-end">
                <Skeleton className="h-8 w-8 rounded-none" />
              </div>
            </td>
          </tr>
        )
      );
    }

    if (files.length === 0) {
      return (
        <tr>
          <td colSpan={4} className="p-8 text-center text-muted-foreground">
            No files or folders found in this directory.
          </td>
        </tr>
      );
    }

    return files.map((file) => (
      <tr
        key={file.id}
        className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted last:border-0"
      >
        <td
          onClick={() =>
            file.type === 'folder' ? onNavigate?.(file.id) : onView?.(file)
          }
          className="p-4 px-6 align-middle cursor-pointer"
        >
          <div className="flex items-center gap-3 font-medium">
            {getFileIcon(file.type)}
            <span className="truncate max-w-50 md:max-w-md" title={file.name}>
              {file.name}
            </span>
          </div>
        </td>
        <td className="p-4 px-6 align-middle text-muted-foreground">
          {file.size}
        </td>
        <td className="p-4 px-6 align-middle text-muted-foreground">
          {file.lastModified}
        </td>
        <td className="p-4 px-6 align-middle text-right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" id={file.id}>
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuGroup>
                {file.type === 'folder' ? (
                  <>
                    <DropdownMenuItem onClick={() => onNavigate?.(file.id)}>
                      <ArrowRight /> Open
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => copyPath(file.fullPath)}>
                      <Share2Icon /> Copy
                    </DropdownMenuItem>
                  </>
                ) : (
                  <>
                    <DropdownMenuItem onClick={() => onView?.(file)}>
                      <Eye /> View
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => copyPath(file.fullPath)}>
                      <Share2Icon /> Copy
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
                <DropdownMenuItem variant="destructive">
                  <TrashIcon /> Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
      </tr>
    ));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="w-full rounded-none border bg-card text-card-foreground shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="border-b bg-slate-50/50 dark:bg-slate-900/50">
              <tr>
                <th className="h-12 px-6 align-middle font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                  Name
                </th>
                <th className="h-12 px-6 align-middle font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                  Size
                </th>
                <th className="h-12 px-6 align-middle font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                  Last Modified
                </th>
                <th className="h-12 px-6 align-middle font-semibold text-muted-foreground text-xs uppercase tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>{renderRows()}</tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2 py-1">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            Rows per page
          </span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) =>
              onPageSizeChange(v === 'all' ? 'all' : Number(v))
            }
          >
            <SelectTrigger className="h-8 w-17.5 rounded-none">
              <SelectValue placeholder={String(pageSize)} />
            </SelectTrigger>
            <SelectContent className="rounded-none">
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground ml-2">
            Total: {totalItems}
          </span>
        </div>

        {pageSize !== 'all' && totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-none"
              disabled={currentPage === 1 || isLoading}
              onClick={() => onPageChange(currentPage - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-none"
              disabled={currentPage === totalPages || isLoading}
              onClick={() => onPageChange(currentPage + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
