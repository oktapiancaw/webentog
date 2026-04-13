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

import { useState, useCallback } from 'react';

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
}

const formSchema = z.object({
  files: z
    .array(z.custom<File>())
    .min(1, 'Please select at least one file')
    .max(2, 'Please select up to 2 files')
    .refine((files) => files.every((file) => file.size <= 5 * 1024 * 1024), {
      message: 'File size must be less than 5MB',
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
}: SearchBrowserProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false); // New state
  const [files, setFiles] = useState<File[]>([]);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      files: [],
    },
  });

  // const [searchText, setSearchText] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onSearch?.(searchText);
  };
  console.log('hey');

  const handleResetFiles = () => {
    setFiles([]);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (files.length === 0) {
      alert('Please select at least one file.');
      return;
    }

    const formData = new FormData();
    // Append all files for the backend to process
    files.forEach((file) => {
      formData.append('files', file);
    });

    try {
      // Assuming 'config' comes from your context/props
      const response = await uploadFiles(config, formData, currentPath);

      if (response.success) {
        // 2. Clear the files
        handleResetFiles();

        // 3. Close the dialog
        setIsDialogOpen(false);

        // 4. Trigger your refresh logic to show the new files
        onRefresh?.();

        toast.success('Uploaded successfully!');
      }
    } catch (error) {
      console.error(error);
      toast.error('Upload failed');
    }
  };
  return (
    <div className="flex space-x-2">
      <Input
        id="searchText"
        value={searchText}
        className="w-full rounded-none font-mono text-sm"
        placeholder="Search your file.."
        onKeyDown={handleKeyDown}
        onChange={(e) => setSearchText(e.target.value)}
      />

      <Button
        variant={'secondary'}
        className="justify-center gap-2 rounded-none font-semibold uppercase tracking-wider text-xs"
        onClick={() => onRefresh?.()}
      >
        <RefreshCwIcon className="size-4" />
      </Button>
      <Button
        variant={'default'}
        className="justify-center gap-2 rounded-none font-semibold uppercase tracking-wider text-xs"
        onClick={() => onSearch?.(searchText)}
      >
        Search
        <SearchIcon className="size-4" />
      </Button>
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button
            variant="secondary"
            className="justify-center gap-2 rounded-none font-semibold uppercase tracking-wider text-xs"
          >
            Upload
            <UploadIcon className="size-4" />
          </Button>
        </DialogTrigger>

        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload File</DialogTitle>
            Upload file to this path {currentPath}
          </DialogHeader>

          <p className="text-pretty mt-2 text-xs leading-5 text-muted-foreground sm:flex sm:items-center sm:justify-between">
            <span>Accepted all type files.</span>
            <span className="pl-1 sm:pl-0">Max. size: 10MB</span>
          </p>

          <form
            id="upload-form"
            className="w-full"
            onSubmit={handleUploadSubmit}
          >
            {/*   */}
            <FileUpload
              value={files}
              onValueChange={(newFiles) => {
                setFiles(newFiles);
                form.setValue('files', newFiles); // Sync with react-hook-form
              }}
              accept="image/*"
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
