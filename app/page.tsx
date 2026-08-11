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
  useState,
  useEffect,
  useRef,
  Suspense,
  useMemo,
  useCallback,
} from 'react';
import { StorageBrowser, FileItem } from '@/components/app-browser';
import { AppSidebar } from '@/components/app-sidebar';
import type {
  ConnectionConfig,
  FormattedFile,
  ListMode,
  ObjectMetadata,
} from '@/app/actions/object-management';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import {
  countFolderObjects,
  deleteFile,
  getDownloadUrl,
  getObjectMetadata,
  listStorageFiles,
} from './actions/object-management';
import { SearchBrowser } from '@/components/search-browser';
import { Button } from '@/components/ui/button';
import { ScanSearch } from 'lucide-react';
import { toast } from 'sonner';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { FilePreview } from '@/components/file-preview';
import { VersionHistoryDialog } from '@/components/version-history-dialog';
import type { ValidatedPinnedFolder } from './actions/pinned-folders';
import {
  addPin,
  downloadObject,
  loadPins,
  removePin,
} from '@/lib/storage-mode';
import { getLastNameFromPath } from '@/lib/utils';

/** Server rows carry nullable metadata; the table wants display strings. */
const toFileItem = (item: FormattedFile): FileItem => ({
  id: item.id,
  name: item.name,
  fullPath: item.fullPath,
  type: item.type as FileItem['type'],
  size:
    item.size !== null && item.size !== undefined ? String(item.size) : '--',
  lastModified: item.lastModified ? String(item.lastModified) : '--',
});

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

  const [searchText, setSearchText] = useState('');

  const [pageSize, setPageSize] = useState<number>(20);
  // cursorStack[i] produced page i. S3 cursors run forward only, so Prev
  // replays a recorded cursor instead of re-listing.
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  // 'buffered': whole folder in `files`, paged locally. 'cursor': one page at a
  // time. Mirrored in a ref so the fetch effect reads it without re-running.
  const [mode, setMode] = useState<ListMode | null>(null);
  const modeRef = useRef<ListMode | null>(null);
  // Cursor mode only: subfolders from page 1's discovery walk, pinned above the
  // file pages. A 20-row page of a 1000+ object folder rarely contains them.
  const [pinnedFolders, setPinnedFolders] = useState<FileItem[]>([]);
  const [foldersTruncated, setFoldersTruncated] = useState(false);
  // Escape hatch: buffer the whole directory whatever its size. Subfolder
  // prefixes can sort after every file key, so a bounded scan may miss them.
  const [forceFullScan, setForceFullScan] = useState(false);
  // Opt-in folder total, cleared when the folder changes.
  const [folderCount, setFolderCount] = useState<{
    count: number;
    capped: boolean;
  } | null>(null);
  const [isCounting, setIsCounting] = useState(false);

  const [viewingFile, setViewingFile] = useState<FileItem | null>(null);
  const [viewingUrl, setViewingUrl] = useState<string | null>(null);
  const [isViewingLoading, setIsViewingLoading] = useState(false);
  // Fetched apart from the preview URL so a failing stat() cannot block a
  // preview that would otherwise render.
  const [viewingMetadata, setViewingMetadata] = useState<ObjectMetadata | null>(
    null
  );
  const [isMetadataLoading, setIsMetadataLoading] = useState(false);
  const [versionsFile, setVersionsFile] = useState<FileItem | null>(null);
  // Lives here because FilePreview unmounts on close, which would reset the
  // chosen width on every new file.
  const [previewWidth, setPreviewWidth] = useState(460);

  // Saved folder bookmarks. Named `bookmarked*` because `pinnedFolders` above
  // means something else: subfolders found during a cursor-mode walk.
  const [bookmarkedFolders, setBookmarkedFolders] = useState<
    ValidatedPinnedFolder[]
  >([]);
  const [isBookmarksLoading, setIsBookmarksLoading] = useState(false);

  const fetchBookmarks = useCallback(async (cfg: ConnectionConfig) => {
    if (!cfg.id) return;
    setIsBookmarksLoading(true);
    try {
      setBookmarkedFolders(await loadPins(cfg));
    } catch (err) {
      console.error('Failed to load pinned folders:', err);
      toast.error('Failed to load pinned folders');
    } finally {
      setIsBookmarksLoading(false);
    }
  }, []);

  const handleTogglePin = async (file: FileItem) => {
    if (!config?.id) return;
    const connectionId = config.id;
    const existing = bookmarkedFolders.find((p) => p.path === file.id);
    try {
      if (existing) {
        await removePin(existing.id);
        setBookmarkedFolders((prev) =>
          prev.filter((p) => p.id !== existing.id)
        );
        toast.success('Folder unpinned');
      } else {
        const { id } = await addPin(connectionId, file.id);
        setBookmarkedFolders((prev) => [
          ...prev,
          {
            id,
            connection_id: connectionId,
            path: file.id,
            created_at: new Date().toISOString(),
            exists: true,
          },
        ]);
        toast.success('Folder pinned');
      }
    } catch (err) {
      console.error('Failed to toggle pin:', err);
      toast.error('Failed to update pin');
    }
  };

  const handleRemoveBookmark = async (id: number) => {
    try {
      await removePin(id);
      setBookmarkedFolders((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error('Failed to remove pin:', err);
      toast.error('Failed to remove pin');
    }
  };

  const pinnedPaths = useMemo(
    () => new Set(bookmarkedFolders.map((p) => p.path)),
    [bookmarkedFolders]
  );

  const fetchPage = useCallback(
    async (cursor: string | null) => {
      if (!config) return;
      setIsLoading(true);
      setError(null);
      try {
        const {
          items,
          nextCursor: newCursor,
          mode: newMode,
          folders,
          foldersTruncated: truncated,
        } = await listStorageFiles(config, currentPath, {
          cursor,
          limit: pageSize,
          // No cap when forcing: a cap could sit just below the subfolders you
          // are looking for.
          ...(forceFullScan
            ? { bufferThreshold: Number.MAX_SAFE_INTEGER }
            : {}),
        });
        modeRef.current = newMode;
        setMode(newMode);
        // Buffered walked the whole folder, so the total costs nothing.
        if (newMode === 'buffered') {
          setFolderCount({ count: items.length, capped: false });
        }
        // Only page 1 does the discovery walk, so only page 1 reports folders.
        if (cursor === null) {
          setPinnedFolders(folders.map(toFileItem));
          setFoldersTruncated(truncated);
        }
        setFiles(items.map(toFileItem));
        setNextCursor(newCursor);
      } catch (err) {
        setError(
          `Failed to load files. Check your connection settings. ${err}`
        );
        setFiles([]);
        setNextCursor(null);
        toast.error('Failed to load files');
      } finally {
        setIsLoading(false);
      }
    },
    [config, currentPath, pageSize, forceFullScan]
  );

  useEffect(() => {
    if (!config) return;
    // Buffered folders sit in memory and page as a local slice, so a pageIndex
    // change must not trigger another round trip.
    if (modeRef.current === 'buffered') return;
    fetchPage(cursorStack[pageIndex] ?? null);
    // cursorStack is omitted on purpose: goNext pushes a cursor and bumps
    // pageIndex in one tick, so depending on both would double-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, currentPath, pageSize, pageIndex, forceFullScan]);

  /** Back to page 1: folder nav, page-size change, manual refresh. */
  const resetPaging = () => {
    setCursorStack([null]);
    setPageIndex(0);
    setNextCursor(null);
    setFolderCount(null); // a count belongs to one folder, never carry it over
    setPinnedFolders([]); // folders belong to one directory too
    setFoldersTruncated(false);
    setForceFullScan(false); // a new directory starts cheap again
    modeRef.current = null; // re-arm the fetch effect
    setMode(null);
  };

  /**
   * Buffer this directory in full. Must land on page 1, since the full-scan
   * branch runs only without a cursor; forcing from page 3 would do nothing.
   * `setForceFullScan(true)` lands after resetPaging in the same batch.
   */
  const handleScanAll = () => {
    resetPaging();
    setForceFullScan(true);
  };

  const handleCount = async () => {
    if (!config) return;
    setIsCounting(true);
    try {
      setFolderCount(await countFolderObjects(config, currentPath));
    } catch (err) {
      console.error('Failed to count objects:', err);
      toast.error('Failed to count objects');
    } finally {
      setIsCounting(false);
    }
  };

  // Buffered mode searches the whole folder. Cursor mode searches the page in
  // hand: S3 has no substring search, and scanning the folder would re-buffer
  // it, which is what cursor paging avoids.
  const matchesSearch = useCallback(
    (file: FileItem) =>
      !searchQuery ||
      file.name.toLowerCase().includes(searchQuery.toLowerCase()),
    [searchQuery]
  );

  const filteredFiles = useMemo(
    () => files.filter(matchesSearch),
    [files, matchesSearch]
  );

  const isBuffered = mode === 'buffered';

  // Slice unless cursor mode is certain. During a mode reset `files` still holds
  // the previous buffered folder, and returning it whole would paint every row
  // for a frame before the refetch lands.
  const visibleFiles = useMemo(() => {
    if (mode === 'cursor') {
      // Folders stay pinned on every page. Drop any the page also holds so they
      // do not appear twice.
      const shown = pinnedFolders.filter(matchesSearch);
      const pinnedIds = new Set(shown.map((f) => f.id));
      return [...shown, ...filteredFiles.filter((f) => !pinnedIds.has(f.id))];
    }
    const start = pageIndex * pageSize;
    return filteredFiles.slice(start, start + pageSize);
  }, [mode, filteredFiles, pinnedFolders, matchesSearch, pageIndex, pageSize]);

  const hasNextPage =
    mode === 'cursor'
      ? nextCursor !== null
      : (pageIndex + 1) * pageSize < filteredFiles.length;

  const goNext = () => {
    if (!hasNextPage) return;
    // Buffered pages are slices: no cursor to record, no refetch.
    if (isBuffered) return setPageIndex((i) => i + 1);
    if (!nextCursor) return;
    setCursorStack((s) => [...s.slice(0, pageIndex + 1), nextCursor]);
    setPageIndex((i) => i + 1);
  };
  const goPrev = () => setPageIndex((i) => Math.max(0, i - 1));

  const handleSearch = (searchtext: string) => {
    setSearchQuery(searchtext);
    if (isBuffered) setPageIndex(0); // filtering reflows the local pages
  };
  const handleRefresh = () => {
    setSearchQuery('');
    if (pageIndex === 0) {
      fetchPage(null); // already on page 1, so the effect will not refire
    } else {
      resetPaging();
    }
  };

  /**
   * `keepPath` is set when the sidebar restores a connection from `?conn=` on
   * reload, where the path still belongs to that bucket. A connect you click
   * drops back to the bucket root.
   */
  const handleConnect = (newConfig: ConnectionConfig, keepPath = false) => {
    setConfig(newConfig);
    closePreview();
    resetPaging(); // cursors are bucket-scoped, never carry them across
    setBookmarkedFolders([]); // don't show the old connection's pins mid-fetch
    fetchBookmarks(newConfig);
    const params = new URLSearchParams(searchParams);
    if (newConfig.id) params.set('conn', String(newConfig.id));
    if (!keepPath) params.delete('path');
    router.push(`${pathname}?${params.toString()}`);
  };

  const closePreview = () => {
    setViewingFile(null);
    setViewingUrl(null);
    setViewingMetadata(null);
    setIsMetadataLoading(false);
  };

  const handleViewVersions = (file: FileItem) => setVersionsFile(file);
  const closeVersions = () => setVersionsFile(null);

  const handleDelete = async (file: FileItem) => {
    if (!config) return;
    try {
      await deleteFile(config, file.id);
      toast.success(`Deleted ${file.name}`);
      if (viewingFile?.id === file.id) closePreview();
      handleRefresh();
    } catch (error) {
      console.error('Failed to delete file:', error);
      toast.error('Failed to delete file');
    }
  };

  const handleNavigate = (path: string) => {
    setSearchText('');
    setSearchQuery('');
    closePreview();
    resetPaging();

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
      // Routed through our own endpoint so it can set Content-Disposition:
      // attachment. A presigned URL cannot, and browsers ignore the `download`
      // attribute cross-origin, so a raw presigned link opens JSON in a tab.
      await downloadObject(config, fileId);
      toast.success(`Downloading ${fileName}...`);
    } catch (error) {
      console.error('Failed to download file:', error);
      toast.error('Failed to download file. Please check your connection.');
    }
  };
  const handleDownloadFolder = async (path: string) => {
    if (!config) return;

    try {
      toast.loading('Preparing your ZIP...', { id: 'zip-toast' });

      const response = await fetch('/api/download-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, folderPath: path }),
      });

      if (!response.ok) throw new Error('Network response was not ok');

      const blob = await response.blob();

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      a.download = `${getLastNameFromPath(path) || 'folder'}.zip`;
      document.body.appendChild(a);
      a.click();

      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Download started!', { id: 'zip-toast' });
    } catch (error) {
      console.error('Failed to download folder:', error);
      toast.error('Failed to download folder.', { id: 'zip-toast' });
    }
  };

  const handleView = async (file: FileItem) => {
    if (!config) return;
    if (viewingFile?.id === file.id) return closePreview(); // click again to close
    setViewingFile(file);
    setIsViewingLoading(true);
    setViewingUrl(null);
    setViewingMetadata(null);
    setIsMetadataLoading(true);

    // Not awaited with the preview: a failing stat() must not take it down.
    getObjectMetadata(config, file.id)
      .then(setViewingMetadata)
      .catch((err) => console.error('Failed to read object metadata:', err))
      .finally(() => setIsMetadataLoading(false));

    try {
      const url = await getDownloadUrl(config, file.id);
      setViewingUrl(url);
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
        bookmarkedFolders={bookmarkedFolders}
        isBookmarksLoading={isBookmarksLoading}
        onNavigateToBookmark={handleNavigate}
        onRemoveBookmark={handleRemoveBookmark}
      />

      <SidebarInset className="overflow-hidden">
        <SiteHeader
          currentPath={currentPath}
          onNavigate={handleNavigate}
          bucket={config?.bucket}
        />

        {/* File list on the left, preview pane docked on the right */}
        <div className="flex min-h-0 flex-1">
          <main className="@container/main min-w-0 flex-1 overflow-auto px-4 py-4 md:px-6">
            {!config && (
              <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                Pick or create a connection in the sidebar to browse a bucket.
              </div>
            )}

            {config && error && (
              <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {config && !error && (
              <div className="grid gap-3">
                <SearchBrowser
                  searchText={searchText}
                  setSearchText={setSearchText}
                  onSearch={handleSearch}
                  onRefresh={handleRefresh}
                  currentPath={currentPath}
                  config={config}
                  searchesWholeFolder={mode !== 'cursor'}
                />
                {mode === 'cursor' && (
                  <div className="flex items-center justify-between gap-3 rounded-md border border-dashed px-3 py-2">
                    <p className="text-xs text-muted-foreground">
                      Large directory, showing one page at a time.{' '}
                      {foldersTruncated
                        ? 'Subfolders may be missing: object storage can list them after every file key.'
                        : 'Subfolders may be missing until the whole directory is read.'}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={handleScanAll}
                      loading={isLoading}
                      disabled={isLoading}
                    >
                      {!isLoading && <ScanSearch className="size-3.5" />}
                      Scan all
                    </Button>
                  </div>
                )}
                <StorageBrowser
                  files={visibleFiles}
                  isLoading={isLoading}
                  selectedId={viewingFile?.id}
                  onNavigate={handleNavigate}
                  onDownload={handleDownload}
                  onDownloadFolder={handleDownloadFolder}
                  onView={handleView}
                  onViewVersions={handleViewVersions}
                  onDelete={handleDelete}
                  pinnedPaths={pinnedPaths}
                  onTogglePin={handleTogglePin}
                  pageSize={pageSize}
                  pageIndex={pageIndex}
                  hasNextPage={hasNextPage}
                  hasPrevPage={pageIndex > 0}
                  onNext={goNext}
                  onPrev={goPrev}
                  onPageSizeChange={(size) => {
                    setPageSize(size);
                    resetPaging();
                  }}
                  folderCount={folderCount}
                  isCounting={isCounting}
                  onCount={handleCount}
                />
              </div>
            )}
          </main>

          <FilePreview
            file={viewingFile}
            url={viewingUrl}
            isLoading={isViewingLoading}
            onClose={closePreview}
            onDownload={handleDownload}
            metadata={viewingMetadata}
            isMetadataLoading={isMetadataLoading}
            onViewVersions={handleViewVersions}
            width={previewWidth}
            onWidthChange={setPreviewWidth}
          />
        </div>

        {config && (
          <VersionHistoryDialog
            // Remount per file so fetch and confirm state reset without
            // setState-in-effect.
            key={versionsFile?.id ?? 'none'}
            file={versionsFile}
            config={config}
            onClose={closeVersions}
            onRestored={handleRefresh}
          />
        )}
      </SidebarInset>
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
