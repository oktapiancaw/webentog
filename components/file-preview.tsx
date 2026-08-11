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
  Download,
  ExternalLink,
  FileQuestion,
  History,
  Loader2,
  Share2Icon,
  X,
} from 'lucide-react';
import { useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { CodePreview } from '@/components/code-preview';
import { FileItem, getFileIcon } from '@/components/app-browser';
import type { ObjectMetadata } from '@/app/actions/object-management';
import { copyToClipboard } from '@/lib/utils';

interface FilePreviewProps {
  file: FileItem | null;
  url: string | null;
  isLoading: boolean;
  onClose: () => void;
  onDownload: (fileId: string, fileName: string) => void;
  /** null while loading or when stat() failed. Metadata is supplementary. */
  metadata: ObjectMetadata | null;
  isMetadataLoading: boolean;
  onViewVersions: (file: FileItem) => void;
  /** Desktop width in px. Owned by the page so it outlives this component. */
  width: number;
  onWidthChange: (width: number) => void;
}

const PREVIEW_MIN_WIDTH = 320;
const PREVIEW_MAX_WIDTH = 900;
/** Never let the drag squeeze the file table below this. */
const LIST_MIN_WIDTH = 360;

const clampWidth = (px: number) => {
  const room =
    typeof window === 'undefined'
      ? PREVIEW_MAX_WIDTH
      : window.innerWidth - LIST_MIN_WIDTH;
  const max = Math.max(PREVIEW_MIN_WIDTH, Math.min(PREVIEW_MAX_WIDTH, room));
  return Math.min(Math.max(px, PREVIEW_MIN_WIDTH), max);
};

/** Truncated middle keeps both ends of an etag/version id readable. */
function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 text-muted-foreground/70">{label}</span>
      <span className="truncate text-muted-foreground" title={value}>
        {value}
      </span>
    </div>
  );
}

function PreviewBody({ file, url }: { file: FileItem; url: string }) {
  switch (file.type) {
    case 'image':
      return (
        <div className="flex h-full items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={file.name}
            className="max-h-full max-w-full rounded-md object-contain"
          />
        </div>
      );
    case 'video':
      return (
        <div className="flex h-full items-center justify-center">
          <video
            src={url}
            controls
            className="max-h-full max-w-full rounded-md"
          />
        </div>
      );
    case 'audio':
      return (
        <div className="flex h-full items-center justify-center">
          <audio src={url} controls className="w-full" />
        </div>
      );
    case 'pdf':
      return (
        <iframe
          src={url}
          className="h-full w-full rounded-md border"
          title={file.name}
        />
      );
    case 'json':
    case 'text':
      return <CodePreview presignedUrl={url} fileName={file.name} />;
    default:
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
          <FileQuestion className="size-8" />
          <p className="text-sm">No inline preview for this file type.</p>
          <Button variant="outline" size="sm" asChild>
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-3.5" />
              Open in new tab
            </a>
          </Button>
        </div>
      );
  }
}

/**
 * Side preview pane: beside the file table on desktop, over it on mobile. Drag
 * the left edge to resize, clamped so the table stays usable.
 */
export function FilePreview({
  file,
  url,
  isLoading,
  onClose,
  onDownload,
  metadata,
  isMetadataLoading,
  onViewVersions,
  width,
  onWidthChange,
}: FilePreviewProps) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  if (!file) return null;

  const copyPath = async () => {
    const ok = await copyToClipboard(file.fullPath);
    toast[ok ? 'success' : 'error'](ok ? 'Path copied' : 'Copy failed');
  };

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startWidth: width };
    // Without this the drag selects table text under the cursor.
    document.body.style.userSelect = 'none';
  };

  const onDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    // Panel is docked right, so moving left (negative delta) widens it.
    const next = drag.current.startWidth - (e.clientX - drag.current.startX);
    onWidthChange(clampWidth(next));
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    document.body.style.userSelect = '';
  };

  const nudge = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step =
      e.key === 'ArrowLeft' ? 32 : e.key === 'ArrowRight' ? -32 : null;
    if (step === null) return;
    e.preventDefault();
    onWidthChange(clampWidth(width + step));
  };

  return (
    <aside
      // Width applies from md up only; below that the panel covers the screen.
      style={{ '--preview-w': `${width}px` } as React.CSSProperties}
      // max-w backstops the JS clamp, which runs only while dragging: shrinking
      // the window later must not let the panel eat the table. md:relative, not
      // md:static, because the absolute resize handle needs this element as its
      // containing block or it anchors to an ancestor and lands on the sidebar.
      className="fixed inset-0 z-30 flex w-full flex-col border-l bg-card md:relative md:z-auto md:w-(--preview-w) md:max-w-[calc(100vw-360px)] md:shrink-0"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize preview panel"
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={startDrag}
        onPointerMove={onDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={nudge}
        className="absolute inset-y-0 left-0 z-10 hidden w-1.5 -translate-x-1/2 cursor-col-resize touch-none transition-colors hover:bg-primary/40 focus-visible:bg-primary/60 focus-visible:outline-none active:bg-primary/60 md:block"
      />
      <header className="flex items-start gap-3 border-b px-4 py-3">
        <div className="mt-0.5 shrink-0">{getFileIcon(file.type)}</div>
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-sm font-medium text-strong"
            title={file.name}
          >
            {file.name}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            {file.size} • {file.lastModified}
          </p>
          {/* Supplementary: missing metadata drops out rather than showing an
              error, since the preview itself still works. */}
          {!isMetadataLoading && metadata && (
            <div className="mt-1.5 space-y-0.5 font-mono text-[11px]">
              {metadata.contentType && (
                <MetaField label="type" value={metadata.contentType} />
              )}
              {metadata.etag && (
                <MetaField
                  label="etag"
                  value={metadata.etag.replace(/"/g, '')}
                />
              )}
              {metadata.version && (
                <MetaField label="ver" value={metadata.version} />
              )}
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          onClick={onClose}
          title="Close preview"
        >
          <X className="size-4" />
          <span className="sr-only">Close preview</span>
        </Button>
      </header>

      <div className="flex items-center gap-2 border-b px-4 py-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDownload(file.id, file.name)}
        >
          <Download className="size-3.5" />
          Download
        </Button>
        <Button variant="ghost" size="sm" onClick={copyPath}>
          <Share2Icon className="size-3.5" />
          Copy path
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onViewVersions(file)}>
          <History className="size-3.5" />
          Versions
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : url ? (
          <PreviewBody file={file} url={url} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Failed to load preview
          </div>
        )}
      </div>
    </aside>
  );
}
