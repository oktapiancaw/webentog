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

import { useEffect, useState } from 'react';
import { Loader2, RotateCcw, SaveIcon } from 'lucide-react';
import { toast } from 'sonner';
import { toastError } from '@/lib/errors';
import { explainError } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { FileItem } from '@/components/app-browser';
import {
  listObjectVersions,
  restoreObjectVersion,
  saveObjectVersionAs,
  type ConnectionConfig,
  type ListObjectVersionsResult,
  type ObjectVersion,
} from '@/app/actions/object-management';
import { cn } from '@/lib/utils';

interface VersionHistoryDialogProps {
  /** null closes the dialog and drives its open state. */
  file: FileItem | null;
  config: ConnectionConfig;
  onClose: () => void;
  /** Bubbles up so the folder listing refreshes after a restore. */
  onRestored: () => void;
}

/** `report.json` + `abc123` -> `report (v-abc123).json` */
function suggestCopyName(
  key: string,
  versionId: string | null,
  index: number
): string {
  const slash = key.lastIndexOf('/');
  const dir = slash === -1 ? '' : key.slice(0, slash + 1);
  const base = slash === -1 ? key : key.slice(slash + 1);

  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : '';

  const tag = versionId ? versionId.slice(0, 8) : `${index + 1}`;
  return `${dir}${stem} (v-${tag})${ext}`;
}

export function VersionHistoryDialog({
  file,
  config,
  onClose,
  onRestored,
}: VersionHistoryDialogProps) {
  // page.tsx keys this by file id, so a new file remounts and resets all state
  // below. No manual reset in an effect.
  const [versions, setVersions] = useState<ObjectVersion[]>([]);
  const [likelyVersioned, setLikelyVersioned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] =
    useState<ListObjectVersionsResult['unavailable']>(undefined);
  const [busyVersion, setBusyVersion] = useState<string | null>(null);

  // Row with an inline action open, keyed by version id (index when there is
  // none). One at a time, like the sidebar's confirm.
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [saveAsRow, setSaveAsRow] = useState<string | null>(null);
  const [saveAsName, setSaveAsName] = useState('');

  const rowKey = (v: ObjectVersion, i: number) => v.versionId ?? `idx-${i}`;

  const load = async (target: FileItem) => {
    setLoading(true);
    setError('');
    try {
      const result = await listObjectVersions(config, target.id);
      setVersions(result.versions);
      setLikelyVersioned(result.likelyVersioned);
      setUnavailable(result.unavailable);
    } catch (err) {
      setError(explainError(err, 'Could not load version history.').message);
      setVersions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!file) return;

    let active = true;

    listObjectVersions(config, file.id)
      .then((result) => {
        // Drop a stale response if another file opened meanwhile.
        if (!active) return;
        setVersions(result.versions);
        setLikelyVersioned(result.likelyVersioned);
        setUnavailable(result.unavailable);
      })
      .catch((err) => {
        if (!active) return;
        setError(explainError(err, 'Could not load version history.').message);
        setVersions([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [file, config]);

  const handleRestore = async (version: ObjectVersion) => {
    if (!file || !version.versionId) return;
    setBusyVersion(version.versionId);
    try {
      await restoreObjectVersion(config, file.id, version.versionId);
      toast.success('Version restored');
      setConfirmRestore(null);
      onRestored();
      await load(file); // stay open so the new current version is visible
    } catch (err) {
      toastError(err, 'Could not restore that version.');
    } finally {
      setBusyVersion(null);
    }
  };

  const handleSaveAs = async (version: ObjectVersion) => {
    if (!file || !version.versionId) return;
    setBusyVersion(version.versionId);
    try {
      const { path } = await saveObjectVersionAs(
        config,
        file.id,
        version.versionId,
        saveAsName
      );
      toast.success(`Saved as ${path}`);
      setSaveAsRow(null);
      onRestored(); // the new object should show up in the listing
    } catch (err) {
      toastError(err, 'Could not save that version as a new object.');
    } finally {
      setBusyVersion(null);
    }
  };

  return (
    <Dialog open={!!file} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="truncate">{file?.name}</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {file?.id}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading versions…
          </div>
        ) : error ? (
          <div className="py-10 text-center text-sm text-destructive">
            {error}
          </div>
        ) : versions.length === 0 ? (
          <div className="space-y-2 py-10 text-center text-sm text-muted-foreground">
            {unavailable ? (
              <>
                <p>{unavailable.detail}</p>
                <p className="text-xs">
                  {unavailable.reason === 'denied'
                    ? 'Listing versions needs bucket-scoped s3:ListBucketVersions, which is broader than the read access used elsewhere in the app.'
                    : 'The object itself is unaffected.'}
                </p>
              </>
            ) : (
              <p>No versions reported for this object.</p>
            )}
          </div>
        ) : (
          <div className="max-h-[55vh] space-y-2 overflow-auto">
            {unavailable ? (
              <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                <p>{unavailable.detail} Showing the current object only.</p>
                {unavailable.reason === 'denied' && (
                  <p className="mt-1">
                    Listing versions needs bucket-scoped
                    <span className="font-mono"> s3:ListBucketVersions</span>,
                    which is broader than the read access used elsewhere in the
                    app.
                  </p>
                )}
              </div>
            ) : (
              !likelyVersioned && (
                <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                  Only one version found. This bucket may not have versioning
                  enabled.
                </p>
              )
            )}

            {versions.map((version, index) => {
              const key = rowKey(version, index);
              const isBusy = busyVersion === version.versionId;

              return (
                <div
                  key={key}
                  className={cn(
                    'rounded-md border px-3 py-2.5',
                    version.isLikelyCurrent && 'border-primary/40 bg-accent/40'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="truncate font-mono text-xs text-strong"
                          title={version.versionId ?? undefined}
                        >
                          {version.versionId ?? 'unversioned'}
                        </span>
                        {version.isLikelyCurrent && (
                          <span
                            className="shrink-0 rounded-sm bg-primary px-1.5 py-px text-[10px] font-medium text-primary-foreground"
                            title="Most recent by last-modified. Object storage exposes no explicit current-version flag, so this is a heuristic."
                          >
                            Current
                          </span>
                        )}
                        {version.isDeleted && (
                          <span className="shrink-0 rounded-sm bg-destructive px-1.5 py-px text-[10px] font-medium text-white">
                            Delete marker
                          </span>
                        )}
                      </div>
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                        {version.size} • {version.lastModified ?? '--'}
                      </p>
                      {version.etag && (
                        <p
                          className="truncate font-mono text-[11px] text-muted-foreground/70"
                          title={version.etag}
                        >
                          etag {version.etag.replace(/"/g, '')}
                        </p>
                      )}
                    </div>

                    {!version.isDeleted && version.versionId && (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="xs"
                          disabled={isBusy}
                          onClick={() => {
                            setConfirmRestore(null);
                            setSaveAsRow(key);
                            setSaveAsName(
                              suggestCopyName(
                                file!.id,
                                version.versionId,
                                index
                              )
                            );
                          }}
                        >
                          <SaveIcon /> Save as
                        </Button>
                        {!version.isLikelyCurrent && (
                          <Button
                            variant="ghost"
                            size="xs"
                            className="text-destructive hover:text-destructive"
                            disabled={isBusy}
                            onClick={() => {
                              setSaveAsRow(null);
                              setConfirmRestore(key);
                            }}
                          >
                            <RotateCcw /> Restore
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  {saveAsRow === key && (
                    <form
                      className="mt-2.5 flex items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleSaveAs(version);
                      }}
                    >
                      <Input
                        autoFocus
                        value={saveAsName}
                        onChange={(e) => setSaveAsName(e.target.value)}
                        className="h-8 font-mono text-xs"
                        placeholder="new/object/key.ext"
                      />
                      <Button
                        type="submit"
                        size="sm"
                        loading={isBusy}
                        disabled={isBusy || !saveAsName.trim()}
                      >
                        Save
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSaveAsRow(null)}
                      >
                        Cancel
                      </Button>
                    </form>
                  )}

                  {confirmRestore === key && (
                    <div className="mt-2.5 rounded-md bg-destructive px-3 py-2 text-white">
                      {!likelyVersioned && (
                        <p className="mb-1.5 text-xs">
                          This bucket may not have versioning enabled. Restoring
                          overwrites the current file for good, with no way
                          back.
                        </p>
                      )}
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs">Restore this version?</span>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            onClick={() => setConfirmRestore(null)}
                            className="text-xs hover:underline"
                          >
                            No
                          </button>
                          <button
                            onClick={() => handleRestore(version)}
                            disabled={isBusy}
                            className="rounded-sm bg-white px-2 py-0.5 text-xs font-medium text-destructive disabled:opacity-60"
                          >
                            {isBusy ? 'Restoring…' : 'Yes'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
