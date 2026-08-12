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
  deleteFolder,
  getDownloadUrl,
  getObjectMetadata,
  listStorageFiles,
  renameFile,
  renameFolder,
} from './actions/object-management';
import { SearchBrowser } from '@/components/search-browser';
import { Button } from '@/components/ui/button';
import { ScanSearch } from 'lucide-react';
import { toast } from 'sonner';
import { toastError } from '@/lib/errors';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { FilePreview } from '@/components/file-preview';
import { VersionHistoryDialog } from '@/components/version-history-dialog';
import type { ValidatedPinnedFolder } from './actions/pinned-folders';
import {
  addPin,
  downloadObject,
  loadPins,
  removePin,
  removePinsUnder,
} from '@/lib/storage-mode';
import {
  explainError,
  getLastNameFromPath,
  parsePagingParams,
  walkCursorStack,
} from '@/lib/utils';

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

  // Page and size live in the URL, not in state, so a view is linkable and
  // browser back/forward walks pages the same way it walks folders.
  const { pageIndex, pageSize } = parsePagingParams(searchParams);
  // cursorStack[i] produced page i. S3 cursors run forward only, so Prev
  // replays a recorded cursor instead of re-listing.
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
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
      toastError(err, 'Could not load your pinned folders.');
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
      toastError(err, 'Could not update that pin.');
    }
  };

  const handleRemoveBookmark = async (id: number) => {
    try {
      await removePin(id);
      setBookmarkedFolders((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      toastError(err, 'Could not remove that pin.');
    }
  };

  const pinnedPaths = useMemo(
    () => new Set(bookmarkedFolders.map((p) => p.path)),
    [bookmarkedFolders]
  );

  /** Writes the page into the URL; the fetch effect reacts to it from there. */
  const goToPage = useCallback(
    (index: number, replace = false) => {
      // Clicking the page you are on would otherwise push a history entry that
      // goes nowhere, so Back would appear dead.
      if (index === pageIndex) return;
      const params = new URLSearchParams(searchParams);
      if (index <= 0) params.delete('page');
      else params.set('page', String(index + 1));
      const url = `${pathname}?${params.toString()}`;
      if (replace) router.replace(url);
      else router.push(url);
    },
    [searchParams, pathname, router, pageIndex]
  );

  const listPage = useCallback(
    (cfg: ConnectionConfig, cursor: string | null) =>
      listStorageFiles(cfg, currentPath, {
        cursor,
        limit: pageSize,
        // No cap when forcing: a cap could sit just below the subfolders you
        // are looking for.
        ...(forceFullScan ? { bufferThreshold: Number.MAX_SAFE_INTEGER } : {}),
      }),
    [currentPath, pageSize, forceFullScan]
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
        } = await listPage(config, cursor);
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
        setError(explainError(err, 'Could not load this folder.').message);
        setFiles([]);
        setNextCursor(null);
        toastError(err, 'Could not load this folder.');
      } finally {
        setIsLoading(false);
      }
    },
    [config, listPage]
  );

  /**
   * A `?page=N` deep link (or back/forward into one) arrives with no cursor
   * stack, so page N cannot be fetched directly. Buffered folders slice
   * locally, so page 1 already holds it. Cursor folders have to be walked
   * forward one request at a time: `startAfter` is positional and there is no
   * way to jump.
   */
  const restorePage = useCallback(
    async (target: number) => {
      if (!config) return;
      setIsLoading(true);
      setError(null);
      let stack: (string | null)[] = [null];
      let buffered = false;
      try {
        // The walk lists pages 0..target-1 only for the cursor each one hands
        // to the next; fetchPage below is what lands on page `target`.
        // ponytail: a buffered folder pays one throwaway listing here, since
        // the mode is only known once the first listing comes back.
        ({ stack, buffered } = await walkCursorStack(
          (cursor) => listPage(config, cursor),
          target
        ));
      } catch (err) {
        setError(explainError(err, 'Could not load this folder.').message);
        setFiles([]);
        setNextCursor(null);
        setIsLoading(false);
        toastError(err, 'Could not load this folder.');
        return;
      }
      setCursorStack(stack);
      if (!buffered && stack.length - 1 < target) {
        // Fewer pages exist than the link claims — objects were removed since
        // it was made, and S3 cursors are positional, not a snapshot. Land on
        // the last real page rather than an empty one, and correct the URL in
        // place so Prev/Next stay consistent. The effect refires and fetches.
        setIsLoading(false);
        goToPage(stack.length - 1, true);
        return;
      }
      await fetchPage(stack[stack.length - 1]);
    },
    [config, listPage, fetchPage, goToPage]
  );

  const pathRef = useRef(currentPath);

  useEffect(() => {
    if (!config) return;
    const pathChanged = pathRef.current !== currentPath;
    pathRef.current = currentPath;
    if (pathChanged) {
      // Browser back/forward and manual URL edits land here without going
      // through handleNavigate, so this effect resets paging itself instead
      // of relying on the imperative resetPaging() call in the click handler.
      setCursorStack([null]);
      setNextCursor(null);
      setFolderCount(null);
      setPinnedFolders([]);
      setFoldersTruncated(false);
      setForceFullScan(false);
      modeRef.current = null;
      setMode(null);
      // Back into a `?path=x&page=3` entry throws away the stack with the
      // folder, so the new folder's page 3 has to be walked to.
      // set-state-in-effect: restorePage is a loader like fetchPage below, and
      // its setIsLoading is what tells the table to show a skeleton.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (pageIndex > 0) restorePage(pageIndex);
      else fetchPage(null);
      return;
    }
    // Buffered folders sit in memory and page as a local slice, so a pageIndex
    // change must not trigger another round trip.
    if (modeRef.current === 'buffered') return;
    const cursor = cursorStack[pageIndex];
    if (cursor === undefined) return void restorePage(pageIndex);
    fetchPage(cursor);
    // cursorStack is omitted on purpose: goNext pushes a cursor and bumps
    // pageIndex in one tick, so depending on both would double-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, currentPath, pageSize, pageIndex, forceFullScan]);

  /**
   * Back to page 1: folder nav, page-size change, manual refresh. Callers own
   * the URL side (`page` removal), since they each push it in one go.
   */
  const resetPaging = () => {
    setCursorStack([null]);
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
    if (pageIndex > 0) goToPage(0);
  };

  const handleCount = async () => {
    if (!config) return;
    setIsCounting(true);
    try {
      setFolderCount(await countFolderObjects(config, currentPath));
    } catch (err) {
      toastError(err, 'Could not count this folder.');
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
      // Page 1 only: the folders come from page 1's discovery walk, so
      // prepending them to page 2+ would repeat rows the user already saw and
      // push the genuine page-2 items down. Page 2+ shows exactly the server's
      // page. Drop any folder the page already holds so it is not listed twice.
      if (pageIndex > 0) return filteredFiles;
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

  // Null means "unknown": cursor mode only learns the total if the user asks
  // for a count, and a capped count is a floor, not a total. The pager renders
  // a growing strip in that case rather than inventing a last page.
  const totalPages =
    mode === 'cursor'
      ? folderCount && !folderCount.capped
        ? Math.max(1, Math.ceil(folderCount.count / pageSize))
        : null
      : Math.max(1, Math.ceil(filteredFiles.length / pageSize));

  const goNext = () => {
    if (!hasNextPage) return;
    // Buffered pages are slices: no cursor to record, no refetch.
    if (!isBuffered) {
      if (!nextCursor) return;
      setCursorStack((s) => [...s.slice(0, pageIndex + 1), nextCursor]);
    }
    goToPage(pageIndex + 1);
  };
  const goPrev = () => {
    if (pageIndex > 0) goToPage(pageIndex - 1);
  };

  const handleSearch = (searchtext: string) => {
    setSearchQuery(searchtext);
    // filtering reflows the local pages
    if (isBuffered && pageIndex > 0) goToPage(0);
  };
  const handleRefresh = () => {
    setSearchQuery('');
    if (pageIndex === 0) {
      fetchPage(null); // already on page 1, so the effect will not refire
    } else {
      resetPaging();
      goToPage(0);
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
    // keepPath is the `?conn=` reload restore, where `page` is part of the same
    // link and must survive. A connect you click starts at the bucket root.
    if (!keepPath) {
      params.delete('path');
      params.delete('page');
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  /**
   * Leaves the connection without deleting it: the saved row is untouched, so
   * clicking it again reconnects. Clears the URL too, or a reload would
   * auto-reconnect from `?conn=` and undo it.
   */
  const handleDisconnect = () => {
    setConfig(null);
    closePreview();
    resetPaging();
    setFiles([]);
    setBookmarkedFolders([]);
    setError(null);
    setSearchText('');
    setSearchQuery('');
    const params = new URLSearchParams(searchParams);
    params.delete('conn');
    params.delete('path');
    params.delete('page');
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
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
      toastError(error, `Could not delete ${file.name}.`);
    }
  };

  /**
   * Recursive, and cascades the pin: a bookmark pointing into a folder we just
   * wiped would render as "missing" for no reason. Local state is filtered too
   * so the sidebar updates without waiting for the next pin refetch.
   */
  const handleDeleteFolder = async (file: FileItem) => {
    if (!config) return;
    try {
      await deleteFolder(config, file.id);
      if (config.id) {
        const removed = await removePinsUnder(config.id, file.id);
        if (removed.length > 0) {
          const gone = new Set(removed);
          setBookmarkedFolders((prev) => prev.filter((p) => !gone.has(p.path)));
        }
      }
      toast.success(`Deleted ${file.name}`);
      if (viewingFile?.id.startsWith(file.id)) closePreview();
      handleRefresh();
    } catch (error) {
      toastError(error, `Could not delete ${file.name}.`);
    }
  };

  /**
   * `newName` is one segment; the server derives the target key from the
   * existing one, so a rename can never become a move.
   *
   * A pinned folder keeps its old path — the pin is left stale and shows as
   * "missing" until re-pinned. Cascading a rename into the pins table is a
   * follow-up, not part of shipping rename itself.
   */
  const handleRename = async (file: FileItem, newName: string) => {
    if (!config) return;
    const isFolder = file.type === 'folder';
    try {
      if (isFolder) await renameFolder(config, file.id, newName);
      else await renameFile(config, file.id, newName);
      toast.success(`Renamed to ${newName}`);
      if (viewingFile?.id.startsWith(file.id)) closePreview();
      handleRefresh();
    } catch (error) {
      toastError(error, `Could not rename ${file.name}.`);
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
    params.delete('page'); // a new folder always opens on page 1
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
      toastError(error, `Could not download ${fileName}.`);
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
      toastError(error, 'Could not build the ZIP for this folder.', {
        id: 'zip-toast',
      });
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
      toastError(error, `Could not open a preview of ${file.name}.`);
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
        onDisconnect={handleDisconnect}
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
                  onDeleteFolder={handleDeleteFolder}
                  onRename={handleRename}
                  pinnedPaths={pinnedPaths}
                  onTogglePin={handleTogglePin}
                  pageSize={pageSize}
                  pageIndex={pageIndex}
                  hasNextPage={hasNextPage}
                  hasPrevPage={pageIndex > 0}
                  totalPages={totalPages}
                  onNext={goNext}
                  onPrev={goPrev}
                  onGoToPage={goToPage}
                  onPageSizeChange={(size) => {
                    resetPaging();
                    const params = new URLSearchParams(searchParams);
                    params.set('size', String(size));
                    params.delete('page'); // a resize reflows every page boundary
                    router.push(`${pathname}?${params.toString()}`);
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
