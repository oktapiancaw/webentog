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
import {
  CloudUpload,
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
import { ConnectionConfig, uploadFiles } from '@/app/actions/object-management';
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
    .max(5, 'Please select up to 5 files')
    .refine((files) => files.every((file) => file.size <= 10 * 1024 * 1024), {
      message: 'File size must be less than 10MB',
      path: ['files'],
    }),
});

type FormValues = z.infer<typeof formSchema>;

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
  const [files, setFiles] = useState<File[]>([]);
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
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (files.length === 0) {
      toast.error('Please select at least one file.');
      return;
    }

    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });

    try {
      const response = await uploadFiles(config, formData, currentPath);

      if (response.success) {
        handleResetFiles();

        setIsDialogOpen(false);

        onRefresh?.();

        toast.success('Uploaded successfully!');
      }
    } catch (error) {
      console.error(error);
      toast.error('Upload failed');
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
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="default">
            <UploadIcon className="size-4" />
            Upload
          </Button>
        </DialogTrigger>

        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload files</DialogTitle>
            <span className="text-sm text-muted-foreground">
              Target path:{' '}
              <span className="font-mono text-foreground">{currentPath}</span>
            </span>
          </DialogHeader>

          <p className="mt-2 flex flex-wrap items-center justify-between gap-1 text-xs text-muted-foreground">
            <span>All file types accepted.</span>
            <span>Max. 5 files · 10MB each</span>
          </p>

          <form
            id="upload-form"
            className="w-full"
            onSubmit={handleUploadSubmit}
          >
            <FileUpload
              value={files}
              onValueChange={(newFiles) => {
                setFiles(newFiles);
                form.setValue('files', newFiles);
              }}
              maxFiles={5}
              maxSize={10 * 1024 * 1024}
              onFileReject={(_, message) => {
                form.setError('files', {
                  message,
                });
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
                {files.map((file, index) => (
                  <FileUploadItem key={index} value={file} className="p-2">
                    <FileUploadItemPreview className="size-8" />
                    <FileUploadItemMetadata size="sm" />
                    <FileUploadItemDelete asChild>
                      <Button variant="ghost" size="icon" className="size-6">
                        <X className="size-3" />
                      </Button>
                    </FileUploadItemDelete>
                  </FileUploadItem>
                ))}
              </FileUploadList>
            </FileUpload>
            <DialogFooter className="sm:justify-between mt-4">
              <DialogClose asChild>
                <Button
                  variant={'secondary'}
                  type="button"
                  onClick={handleResetFiles}
                >
                  Close
                </Button>
              </DialogClose>
              <Button
                type={'submit'}
                variant={'default'}
                form="upload-form"
                disabled={!files || files.length < 1}
              >
                Upload {files.length > 0 && `(${files.length})`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
