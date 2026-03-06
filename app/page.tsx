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

import { useState, useEffect } from 'react';
import { StorageBrowser, FileItem } from '@/components/app-browser';
import { AppSidebar, ConnectionConfig } from '@/components/app-sidebar';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { getDownloadUrl, listStorageFiles } from './action';
import { SearchBrowser } from '@/components/search-browser';

export default function Page() {
  const [config, setConfig] = useState<ConnectionConfig | null>(null);
  const [currentPath, setCurrentPath] = useState<string>('/');
  const [filteredFiles, setFilteredFiles] = useState<FileItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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
        setFilteredFiles(safeData);
      } catch (err) {
        setError(
          `Failed to load files. Check your connection settings. ${err}`
        );
        setFiles([]);
      } finally {
        setIsLoading(false);
      }
    }

    fetchFiles();
  }, [config, currentPath]);

  const handleSearch = (searchtext: string) => {
    if (searchtext.length > 0) {
      const filteredFiles = files.filter((file) =>
        file.name.toLowerCase().includes(searchtext.toLowerCase())
      );
      setFilteredFiles(filteredFiles);
      console.log('a');
    } else {
      setFilteredFiles(files);
    }
  };

  const handleConnect = (newConfig: ConnectionConfig) => {
    setConfig(newConfig);
    setCurrentPath('/');
  };

  const handleNavigate = (folderName: string) => {
    console.log(folderName);
    setCurrentPath(`${folderName}/`);
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
    } catch (error) {
      console.error('Failed to download file:', error);
      // Optional: You could add a toast notification here to alert the user
      alert('Failed to download file. Please check your connection.');
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
      <AppSidebar variant="inset" onConnect={handleConnect} />

      <SidebarInset>
        <SiteHeader currentPath={currentPath} onNavigate={handleNavigate} />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              <div className="px-4 lg:px-6">
                {!config && (
                  <div className="p-8 text-center text-muted-foreground border rounded-xl border-dashed">
                    Please configure your connection settings in the sidebar to
                    view files.
                  </div>
                )}

                {config && isLoading && (
                  <div className="p-8 text-center text-muted-foreground">
                    Loading directory contents...
                  </div>
                )}

                {config && error && (
                  <div className="p-4 mb-4 text-red-500 bg-red-50 dark:bg-red-950/20 rounded-xl border border-red-200 dark:border-red-900">
                    {error}
                  </div>
                )}

                {config && !isLoading && !error && (
                  <div className=" gap-y-3 grid">
                    <SearchBrowser onSearch={handleSearch} />
                    <StorageBrowser
                      files={filteredFiles}
                      onNavigate={handleNavigate}
                      onDownload={handleDownload}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
