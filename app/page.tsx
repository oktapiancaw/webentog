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

import { useState, useEffect, Suspense, useMemo } from 'react';
import { StorageBrowser, FileItem } from '@/components/app-browser';
import { AppSidebar } from '@/components/app-sidebar';
import { ConnectionConfig } from '@/app/action';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { getDownloadUrl, listStorageFiles } from './action';
import { SearchBrowser } from '@/components/search-browser';
import { toast } from 'sonner';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { Loader2 } from 'lucide-react';

function PageContent() {
  const [config, setConfig] = useState<ConnectionConfig | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const currentPath = searchParams.get('path') || '/';

  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Pagination state
  const [pageSize, setPageSize] = useState<number | 'all'>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Viewing state
  const [viewingFile, setViewingFile] = useState<FileItem | null>(null);
  const [viewingUrl, setViewingUrl] = useState<string | null>(null);
  const [isViewingLoading, setIsViewingLoading] = useState(false);
  const [fileContent, setFileContent] = useState<string | null>(null);

  useEffect(() => {
    if (!config) return;

    async function fetchFiles() {
      setIsLoading(true);
      setError(null);
      try {
        const data = await listStorageFiles(config!, currentPath);
        const safeData: FileItem[] = data.map((item) => ({
          id: item.id,
          name: item.name,
          type: item.type as FileItem['type'],
          size:
            item.size !== null && item.size !== undefined
              ? String(item.size)
              : '--',
          lastModified: item.lastModified ? String(item.lastModified) : '--',
        }));
        setFiles(safeData);
        setCurrentPage(1); // Reset to first page on path change
      } catch (err) {
        setError(
          `Failed to load files. Check your connection settings. ${err}`
        );
        setFiles([]);
        toast.error('Failed to load files');
      } finally {
        setIsLoading(false);
      }
    }

    fetchFiles();
  }, [config, currentPath]);

  const filteredFiles = useMemo(() => {
    if (!searchQuery) return files;
    return files.filter((file) =>
      file.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [files, searchQuery]);

  const paginatedFiles = useMemo(() => {
    if (pageSize === 'all') return filteredFiles;
    const startIndex = (currentPage - 1) * pageSize;
    filteredFiles.sort(
      (a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)
    );
    return filteredFiles.slice(startIndex, startIndex + pageSize);
  }, [filteredFiles, currentPage, pageSize]);

  const handleSearch = (searchtext: string) => {
    setSearchQuery(searchtext);
    setCurrentPage(1); // Reset to first page on search
  };

  const handleConnect = (newConfig: ConnectionConfig) => {
    setConfig(newConfig);
    const params = new URLSearchParams(searchParams);
    params.delete('path');
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleNavigate = (path: string) => {
    const params = new URLSearchParams(searchParams);
    if (path === '/') {
      params.delete('path');
    } else {
      const cleanPath = path.startsWith('/') ? path.substring(1) : path;
      params.set('path', cleanPath);
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleDownload = async (fileId: string, fileName: string) => {
    if (!config) return;

    try {
      const downloadUrl = await getDownloadUrl(config, fileId);

      const link = document.createElement('a');
      link.href = downloadUrl;

      link.download = fileName;
      link.target = '_blank';

      // Append, click, and clean up
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success(`Downloading ${fileName}...`);
    } catch (error) {
      console.error('Failed to download file:', error);
      toast.error('Failed to download file. Please check your connection.');
    }
  };

  const handleView = async (file: FileItem) => {
    if (!config) return;
    setViewingFile(file);
    setIsViewingLoading(true);
    setViewingUrl(null);
    setFileContent(null);
    try {
      const url = await getDownloadUrl(config, file.id);
      setViewingUrl(url);

      if (file.type === 'json' || file.type === 'unknown') {
        const response = await fetch(url);
        const text = await response.text();
        setFileContent(text);
      }
    } catch (error) {
      console.error('Failed to load preview:', error);
      toast.error('Failed to load preview');
    } finally {
      setIsViewingLoading(false);
    }
  };

  return (
    <SidebarProvider
      style={
        {
          '--sidebar-width': 'calc(var(--spacing) * 78)',
          '--header-height': 'calc(var(--spacing) * 12)',
        } as React.CSSProperties
      }
    >
      <AppSidebar
        variant="inset"
        onConnect={handleConnect}
        isLoading={isLoading}
      />

      <SidebarInset className="rounded-none">
        <SiteHeader
          currentPath={currentPath}
          onNavigate={handleNavigate}
          bucket={config?.bucket}
        />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              <div className="px-4 lg:px-6">
                {!config && (
                  <div className="p-8 text-center text-muted-foreground border rounded-none">
                    Please configure your connection settings in the sidebar to
                    view files.
                  </div>
                )}

                {config && error && (
                  <div className="p-4 mb-4 text-red-500 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-none">
                    {error}
                  </div>
                )}

                {config && !error && (
                  <div className=" gap-y-3 grid">
                    <SearchBrowser onSearch={handleSearch} />
                    <StorageBrowser
                      files={paginatedFiles}
                      isLoading={isLoading}
                      onNavigate={handleNavigate}
                      onDownload={handleDownload}
                      onView={handleView}
                      pageSize={pageSize}
                      currentPage={currentPage}
                      totalItems={filteredFiles.length}
                      onPageChange={setCurrentPage}
                      onPageSizeChange={(size) => {
                        setPageSize(size);
                        setCurrentPage(1);
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </SidebarInset>

      <Drawer
        open={!!viewingFile}
        onOpenChange={(open) => !open && setViewingFile(null)}
        direction="right"
      >
        <DrawerContent className="h-full rounded-none">
          <DrawerHeader className="border-b">
            <DrawerTitle className="truncate">{viewingFile?.name}</DrawerTitle>
            <DrawerDescription>
              {viewingFile?.size} • {viewingFile?.lastModified}
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex-1 overflow-auto p-4">
            {isViewingLoading ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
              </div>
            ) : viewingUrl ? (
              <div className="flex h-full flex-col gap-4">
                {viewingFile?.type === 'image' && (
                  <div className="flex h-full items-center justify-center">
                    <img
                      src={viewingUrl}
                      alt={viewingFile.name}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                )}
                {viewingFile?.type === 'video' && (
                  <div className="flex h-full items-center justify-center">
                    <video
                      src={viewingUrl}
                      controls
                      className="max-h-full max-w-full"
                    />
                  </div>
                )}
                {viewingFile?.type === 'pdf' && (
                  <iframe
                    src={viewingUrl}
                    className="h-full w-full border-0"
                    title={viewingFile.name}
                  />
                )}
                {(viewingFile?.type === 'json' ||
                  viewingFile?.type === 'unknown') && (
                  <pre className="rounded-none bg-muted p-4 font-mono text-sm overflow-auto max-h-full">
                    {fileContent}
                  </pre>
                )}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                Failed to load preview
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </SidebarProvider>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PageContent />
    </Suspense>
  );
}
