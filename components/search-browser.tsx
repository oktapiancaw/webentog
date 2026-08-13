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

import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import {
  AlertCircle,
  CheckCircle2,
  CloudUpload,
  FolderPlusIcon,
  RefreshCwIcon,
  SearchIcon,
  UploadIcon,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import {
  ConnectionConfig,
  createFolder,
} from '@/app/actions/object-management';
import { checkUploadBudget, getUploadUrl } from '@/app/actions/uploads';
import { validateObjectName } from '@/lib/utils';
import {
  LARGE_FILE_THRESHOLD_BYTES,
  MAX_UPLOAD_FILES,
  MAX_UPLOAD_FILE_BYTES,
  tooBigMessage,
  validateUploadBatch,
} from '@/lib/upload';
import { toastError } from '@/lib/errors';
import { unwrap } from '@/lib/action-result';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import {
  FileUpload,
  FileUploadDropzone,
  FileUploadItem,
  FileUploadItemDelete,
  FileUploadItemMetadata,
  FileUploadItemPreview,
  FileUploadList,
  FileUploadTrigger,
} from './ui/file-upload';
import z from 'zod';

interface SearchBrowserProps {
  searchText: string;
  setSearchText: (val: string) => void;
  onSearch?: (searchtext: string) => void;
  onRefresh?: () => void;
  currentPath: string;
  config: ConnectionConfig;
  /** false for folders too large to buffer, where filtering sees one page. */
  searchesWholeFolder?: boolean;
}

const formSchema = z.object({
  files: z
    .array(z.custom<File>())
    .min(1, 'Please select at least one file')
    .max(MAX_UPLOAD_FILES, `Please select up to ${MAX_UPLOAD_FILES} files`)
    .refine((files) => validateUploadBatch(files) === null, {
      message: 'That selection is over the upload limits',
      path: ['files'],
    }),
});

type FormValues = z.infer<typeof formSchema>;

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';
interface FileProgress {
  status: UploadStatus;
  progress: number;
  error?: string;
}

/**
 * One row's upload, via XMLHttpRequest — `fetch` has no upload-progress
 * event, and this is what makes the per-file bar move instead of jumping
 * from 0 to 100 on completion.
 */
function uploadViaRoute(
  file: File,
  config: ConnectionConfig,
  folderPath: string,
  regenerateName: boolean,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const body = new FormData();
    body.append('file', file);
    body.append('config', JSON.stringify(config));
    body.append('folderPath', folderPath);
    body.append('regenerateName', String(regenerateName));

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      try {
        reject(
          new Error(JSON.parse(xhr.responseText).error ?? 'Upload failed.')
        );
      } catch {
        reject(new Error('Upload failed.'));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload.'));
    xhr.open('POST', '/api/upload');
    xhr.send(body);
  });
}

/**
 * A large file's bytes go straight to the bucket via a presigned PUT — the
 * app server is never in the path. `xhr.send(file)` sends the raw body, not
 * `FormData`: a presigned PUT's body is the object content itself.
 */
function uploadDirect(
  file: File,
  url: string,
  method: string,
  headers: Record<string, string>,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        onProgress(Math.round((e.loaded / e.total) * 100));
    };
    // Browsers report a CORS rejection and a dropped connection identically —
    // an opaque failed request with no readable status. Naming CORS as the
    // likely cause points straight at the fix (bucket config) instead of
    // leaving a self-hosted deploy staring at "network error."
    const corsHint =
      "Direct upload failed. If this is a self-hosted bucket, check that CORS allows PUT from this app's origin.";
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(corsHint));
    xhr.onerror = () => reject(new Error(corsHint));
    xhr.open(method, url);
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }
    xhr.send(file);
  });
}

/** Picks the transport by size: small files proxy through the app, large ones go direct. */
async function uploadFile(
  file: File,
  config: ConnectionConfig,
  folderPath: string,
  regenerateName: boolean,
  onProgress: (pct: number) => void
): Promise<void> {
  if (file.size > LARGE_FILE_THRESHOLD_BYTES) {
    const { url, method, headers } = unwrap(
      await getUploadUrl(config, folderPath, file.name, regenerateName)
    );
    return uploadDirect(file, url, method, headers, onProgress);
  }
  return uploadViaRoute(file, config, folderPath, regenerateName, onProgress);
}

export function SearchBrowser({
  searchText,
  setSearchText,
  onSearch,
  onRefresh,
  config,
  currentPath,
  searchesWholeFolder = true,
}: SearchBrowserProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [regenerateName, setRegenerateName] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  // Keyed by File identity, which is stable for as long as the same File
  // object sits in the FileUpload list.
  const [progressByFile, setProgressByFile] = useState<Map<File, FileProgress>>(
    new Map()
  );
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      files: [],
    },
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onSearch?.(searchText);
  };

  const handleResetFiles = () => {
    setFiles([]);
    setProgressByFile(new Map());
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();

    const name = folderName.trim();
    const invalid = validateObjectName(name);
    if (invalid) return toast.error(invalid);

    // createDir needs the trailing slash to write a directory marker rather
    // than a zero-byte object that lists as a file.
    const base =
      currentPath === '/' ? '' : `${currentPath.replace(/\/$/, '')}/`;

    setIsCreating(true);
    try {
      unwrap(await createFolder(config, `${base}${name}/`));
      setFolderName('');
      setIsFolderDialogOpen(false);
      onRefresh?.();
      toast.success(`Created ${name}`);
    } catch (error) {
      toastError(error, `Could not create the folder "${name}".`);
    } finally {
      setIsCreating(false);
    }
  };

  const setFileState = (file: File, patch: Partial<FileProgress>) => {
    setProgressByFile((prev) => {
      const next = new Map(prev);
      next.set(file, {
        status: 'idle',
        progress: 0,
        ...next.get(file),
        ...patch,
      });
      return next;
    });
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isUploading) return;

    const invalid = validateUploadBatch(files);
    if (invalid) return toast.error(invalid);

    // The only place the batch-wide count-and-total rule can actually be
    // enforced: upload is one request per file, so by the time a later file
    // in the batch is reached, earlier ones have already gone out.
    try {
      unwrap(await checkUploadBudget(files.map((f) => ({ size: f.size }))));
    } catch (error) {
      toastError(error, 'Could not start the upload.');
      return;
    }

    setIsUploading(true);
    setProgressByFile(
      new Map(files.map((f) => [f, { status: 'idle' as const, progress: 0 }]))
    );

    let failure: string | null = null;
    // Sequential, not Promise.all: one request in flight at a time is what
    // makes "file 2 of 5" a real state instead of five bars moving at once,
    // and it means a dropped connection on file 2 leaves file 3 never
    // started rather than half-attempted.
    for (const file of files) {
      setFileState(file, { status: 'uploading', progress: 0 });
      try {
        await uploadFile(file, config, currentPath, regenerateName, (pct) =>
          setFileState(file, { progress: pct })
        );
        setFileState(file, { status: 'success', progress: 100 });
      } catch (error) {
        failure = error instanceof Error ? error.message : 'Upload failed.';
        setFileState(file, { status: 'error', error: failure });
        // Stop rather than continue past a failure: a dropped connection or a
        // CORS misconfiguration will fail every remaining file the same way,
        // and racing through the rest just multiplies the same error.
        break;
      }
    }

    setIsUploading(false);

    if (!failure) {
      toast.success(
        files.length === 1
          ? 'Uploaded successfully!'
          : `Uploaded ${files.length} files.`
      );
      handleResetFiles();
      setIsDialogOpen(false);
      onRefresh?.();
    } else {
      // The reason itself, not a pointer at the list — the row only shows an
      // icon, so the toast is the only place the cause is readable.
      toast.error(failure);
      onRefresh?.(); // whatever did land before the failure should still show up
    }
  };

  return (
    <div className="flex gap-2">
      <div className="relative w-full">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="searchText"
          value={searchText}
          className="w-full pl-9 font-mono text-sm"
          placeholder={
            searchesWholeFolder ? 'Search this folder…' : 'Search current page…'
          }
          title={
            searchesWholeFolder
              ? 'Filters every object in this folder.'
              : 'This folder is too large to load at once, and object storage has no substring search, so filtering covers the page you are on.'
          }
          onKeyDown={handleKeyDown}
          onChange={(e) => setSearchText(e.target.value)}
        />
      </div>

      <Button
        variant="outline"
        size="icon"
        onClick={() => onRefresh?.()}
        title="Refresh"
      >
        <RefreshCwIcon className="size-4" />
      </Button>
      <Button variant="outline" onClick={() => onSearch?.(searchText)}>
        Search
      </Button>
      <Dialog open={isFolderDialogOpen} onOpenChange={setIsFolderDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" title="New folder">
            <FolderPlusIcon className="size-4" />
          </Button>
        </DialogTrigger>

        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
            <span className="text-sm text-muted-foreground">
              Inside:{' '}
              <span className="font-mono text-foreground">{currentPath}</span>
            </span>
          </DialogHeader>

          <form className="grid gap-4" onSubmit={handleCreateFolder}>
            <Input
              autoFocus
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="Folder name"
              className="font-mono text-sm"
              aria-label="Folder name"
            />
            <DialogFooter className="sm:justify-between">
              <DialogClose asChild>
                <Button variant="secondary" type="button">
                  Close
                </Button>
              </DialogClose>
              <Button type="submit" disabled={!folderName.trim() || isCreating}>
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (isUploading) return; // don't tear down mid-batch
          setIsDialogOpen(open);
        }}
      >
        <DialogTrigger asChild>
          <Button variant="default">
            <UploadIcon className="size-4" />
            Upload
          </Button>
        </DialogTrigger>

        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload files</DialogTitle>
            <span className="text-sm text-muted-foreground">
              Target path:{' '}
              <span className="font-mono text-foreground">{currentPath}</span>
            </span>
          </DialogHeader>

          <p className="mt-2 flex flex-wrap items-center justify-between gap-1 text-xs text-muted-foreground">
            <span>All file types accepted.</span>
            <span>
              Max. {MAX_UPLOAD_FILES} files ·{' '}
              {Math.round(MAX_UPLOAD_FILE_BYTES / (1024 * 1024))}MB each
            </span>
          </p>

          <div className="flex items-center gap-2 py-1">
            <Checkbox
              id="regenerate-name"
              checked={regenerateName}
              disabled={isUploading}
              onCheckedChange={(v) => setRegenerateName(v === true)}
            />
            <label
              htmlFor="regenerate-name"
              className="text-xs text-muted-foreground"
            >
              Regenerate name to avoid conflicts
            </label>
          </div>
          {!regenerateName && (
            <p className="text-xs text-destructive">
              Files with the same name will overwrite existing objects at the
              destination.
            </p>
          )}

          <form
            id="upload-form"
            // min-w-0 matters more than w-full here: DialogContent is a grid,
            // and a grid item defaults to min-width:auto, so without this the
            // form refuses to shrink below its content and a long filename
            // pushes it straight out through the dialog's max-w-lg edge.
            className="w-full min-w-0"
            onSubmit={handleUploadSubmit}
          >
            <FileUpload
              value={files}
              onValueChange={(newFiles) => {
                setFiles(newFiles);
                form.setValue('files', newFiles);
              }}
              maxFiles={MAX_UPLOAD_FILES}
              maxSize={MAX_UPLOAD_FILE_BYTES}
              disabled={isUploading}
              onFileReject={(file, message) => {
                // The primitive's own wording is just "File too large"; say
                // which file and what the actual limit is. Rejecting here
                // means an oversized file never enters the list, so there is
                // nothing to fail later.
                toast.error(
                  message === 'File too large'
                    ? tooBigMessage(file.name)
                    : `${file.name}: ${message}`
                );
                form.setError('files', { message });
              }}
              multiple
            >
              <FileUploadDropzone className="flex-row flex-wrap border-dotted text-center">
                <CloudUpload className="size-4" />
                Drag and drop or
                <FileUploadTrigger asChild>
                  <Button variant="link" size="sm" className="p-0">
                    choose files
                  </Button>
                </FileUploadTrigger>
                to upload
              </FileUploadDropzone>{' '}
              <FileUploadList>
                {files.map((file, index) => {
                  const state = progressByFile.get(file);
                  return (
                    <FileUploadItem key={index} value={file} className="p-2">
                      <FileUploadItemPreview className="size-8" />
                      <FileUploadItemMetadata size="sm" />
                      {state && state.status !== 'idle' && (
                        <div className="flex w-24 shrink-0 items-center justify-end gap-1.5">
                          {state.status === 'uploading' && (
                            <Progress
                              value={state.progress}
                              className="h-1.5"
                            />
                          )}
                          {state.status === 'success' && (
                            <CheckCircle2 className="size-4 text-pulse-green" />
                          )}
                          {state.status === 'error' && (
                            <AlertCircle
                              className="size-4 shrink-0 text-destructive"
                              aria-label={state.error}
                            />
                          )}
                        </div>
                      )}
                      <FileUploadItemDelete asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          disabled={isUploading}
                        >
                          <X className="size-3" />
                        </Button>
                      </FileUploadItemDelete>
                    </FileUploadItem>
                  );
                })}
              </FileUploadList>
            </FileUpload>
            <DialogFooter className="sm:justify-between mt-4">
              <DialogClose asChild>
                <Button
                  variant={'secondary'}
                  type="button"
                  disabled={isUploading}
                  onClick={handleResetFiles}
                >
                  Close
                </Button>
              </DialogClose>
              <Button
                type={'submit'}
                variant={'default'}
                form="upload-form"
                loading={isUploading}
                disabled={!files || files.length < 1 || isUploading}
              >
                {isUploading
                  ? `Uploading ${
                      [...progressByFile.values()].filter(
                        (s) => s.status === 'success' || s.status === 'error'
                      ).length + 1
                    }/${files.length}…`
                  : `Upload ${files.length > 0 ? `(${files.length})` : ''}`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
