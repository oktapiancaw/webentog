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

import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
} from '@/components/ui/sidebar';
import {
  Settings,
  EyeOff,
  Eye,
  Save,
  Plus,
  MoreVertical,
  Check,
  HardDrive,
  Pin,
  PinOff,
  PlugZap,
  Unplug,
  AlertCircle,
} from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  testConnection,
  type ConnectionConfig,
} from '@/app/actions/object-management';
import {
  loadConnections,
  storeConnection,
  removeConnection,
} from '@/lib/storage-mode';
import { toast } from 'sonner';
import { cn, getLastNameFromPath } from '@/lib/utils';
import { WebEntogLogo } from '@/components/logo';
import type { ValidatedPinnedFolder } from '@/app/actions/pinned-folders';

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  onConnect?: (config: ConnectionConfig, keepPath?: boolean) => void;
  /** Leaves the active connection without deleting it. */
  onDisconnect?: () => void;
  isLoading?: boolean;
  bookmarkedFolders?: ValidatedPinnedFolder[];
  isBookmarksLoading?: boolean;
  onNavigateToBookmark?: (path: string) => void;
  onRemoveBookmark?: (id: number) => void;
}

const INITIAL_FORM_STATE = {
  name: '',
  endpoint: '',
  accessKey: '',
  secretKey: '',
  bucket: '',
  region: 'us-east-1',
};

export function AppSidebar({
  onConnect,
  onDisconnect,
  isLoading,
  bookmarkedFolders,
  isBookmarksLoading,
  onNavigateToBookmark,
  onRemoveBookmark,
  ...props
}: AppSidebarProps) {
  const [savedConnections, setSavedConnections] = useState<ConnectionConfig[]>(
    []
  );
  const [activeId, setActiveId] = useState<number | null>(null);

  // Form State
  const [formData, setFormData] =
    useState<ConnectionConfig>(INITIAL_FORM_STATE);
  const [showSecret, setShowSecret] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  // Null until a test has run. Any edit clears it, since "Connected" next to
  // fields that have since changed is a lie.
  const [testResult, setTestResult] = useState<{
    success: boolean;
    error?: string;
  } | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const restoredRef = useRef(false);

  const fetchConnections = async () => {
    const connections = await loadConnections();
    setSavedConnections(connections);
    return connections;
  };

  // A reload wipes the in-memory config but leaves ?conn= and ?path= behind.
  // Reconnect from ?conn= to keep the path valid. If it no longer resolves,
  // drop the stale path rather than browse a bucket we lost.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    const connId = searchParams.get('conn');

    fetchConnections().then((connections) => {
      const match = connections.find((c) => String(c.id) === connId);
      if (match) {
        onConnect?.(match, true);
        if (match.id) setActiveId(match.id);
        toast.success(`Reconnected to ${match.bucket}`);
        return;
      }
      if (connId || searchParams.get('path')) router.replace(pathname);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = (config: ConnectionConfig) => {
    if (onConnect) {
      onConnect(config);
      if (config.id) setActiveId(config.id);
      toast.success(`Connecting to ${config.bucket}...`);
    }
  };

  /** Every field edit goes through here so a stale test result cannot linger. */
  const updateForm = (patch: Partial<ConnectionConfig>) => {
    setTestResult(null);
    setFormData((prev) => ({ ...prev, ...patch }));
  };

  const handleTest = async () => {
    if (!formData.endpoint || !formData.bucket) {
      toast.error('Fill in Endpoint and Bucket first.');
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      setTestResult(await testConnection(formData));
    } catch (error) {
      // testConnection answers rather than throws, so this is the transport
      // itself failing — the server action never got there.
      setTestResult({
        success: false,
        error: 'Could not reach the server to run a test.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleDisconnect = () => {
    setActiveId(null);
    onDisconnect?.();
  };

  const handleSave = async () => {
    if (!formData.name || !formData.endpoint || !formData.bucket) {
      toast.error('Please fill in required fields (Name, Endpoint, Bucket).');
      return;
    }

    setIsSaving(true);
    try {
      await storeConnection(formData);
      await fetchConnections();
      toast.success('Connection saved successfully.');
      setIsSheetOpen(false);
      setFormData(INITIAL_FORM_STATE);
    } catch (error) {
      console.error(error);
      toast.error('Failed to save connection.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await removeConnection(id);
      await fetchConnections();
      toast.success('Connection deleted.');
      if (activeId === id) {
        setActiveId(null);
        router.replace(pathname); // don't leave a dead ?conn= behind
      }
      setConfirmDeleteId(null);
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete connection.');
    }
  };

  const openCreateNew = () => {
    setFormData(INITIAL_FORM_STATE);
    setTestResult(null);
    setIsSheetOpen(true);
  };

  const openEdit = (config: ConnectionConfig) => {
    setFormData(config);
    setTestResult(null);
    setIsSheetOpen(true);
  };

  return (
    <>
      <Sidebar collapsible="offcanvas" {...props}>
        <SidebarHeader className="flex h-(--header-height) items-center justify-center border-b">
          <div className="flex w-full items-center gap-3 px-4">
            <div className="flex size-8 shrink-0 items-center justify-center">
              <WebEntogLogo className="size-full" />
            </div>
            <div>
              <h2 className="text-[15px] leading-tight text-strong">
                WebEntog
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Storage console
              </p>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel className="px-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Connections
            </SidebarGroupLabel>
            <SidebarMenu className="space-y-0.5 px-2">
              {savedConnections.map((conn) => (
                <SidebarMenuItem key={conn.id} className="group/item">
                  <SidebarMenuButton
                    onClick={() => handleConnect(conn)}
                    isActive={activeId === conn.id}
                    className={cn(
                      'h-11 border border-transparent transition-colors',
                      activeId === conn.id && 'border-border bg-accent'
                    )}
                  >
                    <div className="flex w-full items-center gap-3 overflow-hidden">
                      <div
                        className={cn(
                          'flex size-6 shrink-0 items-center justify-center rounded-md border',
                          activeId === conn.id
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {activeId === conn.id ? (
                          <Check className="size-3" />
                        ) : (
                          <HardDrive className="size-3" />
                        )}
                      </div>
                      <div className="flex flex-col items-start overflow-hidden">
                        <span className="w-full truncate text-[13px] text-strong">
                          {conn.name}
                        </span>
                        <span className="w-full truncate font-mono text-[10px] text-muted-foreground">
                          {conn.bucket}
                        </span>
                      </div>
                    </div>
                  </SidebarMenuButton>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuAction className="opacity-0 transition-opacity group-hover/item:opacity-100 data-[state=open]:opacity-100">
                        <MoreVertical className="size-3.5" />
                      </SidebarMenuAction>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem onClick={() => openEdit(conn)}>
                        Edit config
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => conn.id && setConfirmDeleteId(conn.id)}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Inline Delete Confirmation Overlay */}
                  {confirmDeleteId === conn.id && (
                    <div className="absolute inset-0 z-10 flex items-center justify-between rounded-md bg-destructive px-3 text-white duration-200 animate-in fade-in">
                      <span className="text-xs">Delete connection?</span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-[11px] hover:underline"
                        >
                          No
                        </button>
                        <button
                          onClick={() => handleDelete(conn.id!)}
                          className="rounded-sm bg-white px-2 py-0.5 text-[11px] font-medium text-destructive"
                        >
                          Yes
                        </button>
                      </div>
                    </div>
                  )}
                </SidebarMenuItem>
              ))}

              <SidebarMenuItem className="mt-2">
                <Button
                  onClick={openCreateNew}
                  onPointerDown={(e) => e.preventDefault()}
                  variant="outline"
                  className="h-10 w-full border-dashed text-[13px] text-muted-foreground hover:text-foreground"
                >
                  <Plus className="size-3.5" />
                  New connection
                </Button>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>

          {activeId && (
            <SidebarGroup>
              <SidebarGroupLabel className="px-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Pinned folders
              </SidebarGroupLabel>
              <SidebarMenu className="space-y-0.5 px-2">
                {isBookmarksLoading && (
                  <p className="px-2 py-1 text-xs text-muted-foreground">
                    Loading…
                  </p>
                )}

                {!isBookmarksLoading && bookmarkedFolders?.length === 0 && (
                  <p className="px-2 py-1 text-xs text-muted-foreground">
                    No pinned folders yet.
                  </p>
                )}

                {bookmarkedFolders?.map((pin) => (
                  <SidebarMenuItem key={pin.id} className="group/item">
                    <SidebarMenuButton
                      onClick={() =>
                        pin.exists && onNavigateToBookmark?.(pin.path)
                      }
                      disabled={!pin.exists}
                      className={cn(!pin.exists && 'opacity-50')}
                      title={pin.path}
                    >
                      <Pin className="size-3.5 shrink-0" />
                      <span className="truncate text-[13px]">
                        {getLastNameFromPath(pin.path) || pin.path}
                      </span>
                      {/* Never auto-removed: a false exists() can also mean a
                          network blip or a scoped-down credential. */}
                      {!pin.exists && (
                        <span className="ml-auto shrink-0 text-[10px] text-destructive">
                          missing
                        </span>
                      )}
                    </SidebarMenuButton>
                    <SidebarMenuAction
                      onClick={() => onRemoveBookmark?.(pin.id)}
                      className="opacity-0 transition-opacity group-hover/item:opacity-100 focus-visible:opacity-100"
                      title={pin.exists ? 'Unpin' : 'Remove pin'}
                    >
                      <PinOff className="size-3.5" />
                    </SidebarMenuAction>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          )}
        </SidebarContent>

        <SidebarFooter className="border-t p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Session
            </span>
            <div className="flex items-center gap-1.5">
              <div
                className={cn(
                  'size-1.5 rounded-full',
                  activeId ? 'animate-pulse bg-pulse-green' : 'bg-smoke'
                )}
              />
              <span className="font-mono text-[11px] text-muted-foreground">
                {activeId ? 'connected' : 'idle'}
              </span>
              {activeId && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  title="Disconnect — the saved connection is kept"
                  aria-label="Disconnect"
                  onClick={handleDisconnect}
                >
                  <Unplug className="size-3.5" />
                </Button>
              )}
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>

      {/* Connection Module (Sheet) */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent
          side="left"
          className="flex w-(--sidebar-width) flex-col border-r p-0 sm:max-w-(--sidebar-width)"
        >
          <SheetHeader className="border-b bg-muted/40 p-6">
            <div className="mb-1 flex items-center gap-2">
              <Settings className="size-4 text-muted-foreground" />
              <SheetTitle className="text-[15px] text-strong">
                {formData.id ? 'Edit connection' : 'New connection'}
              </SheetTitle>
            </div>
            <SheetDescription className="text-[13px] leading-relaxed">
              S3-compatible object storage parameters. Stored locally on this
              machine.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="grid gap-2.5">
              <Label className="text-[11px] font-medium text-muted-foreground">
                Connection Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={formData.name}
                onChange={(e) => updateForm({ name: e.target.value })}
                placeholder="E.g. Production AWS"
                className="h-10 font-mono text-sm"
              />
            </div>

            <div className="grid gap-2.5">
              <Label className="text-[11px] font-medium text-muted-foreground">
                Endpoint URL <span className="text-destructive">*</span>
              </Label>
              <Input
                value={formData.endpoint}
                onChange={(e) => updateForm({ endpoint: e.target.value })}
                placeholder="https://s3.amazonaws.com"
                className="h-10 font-mono text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2.5">
                <Label className="text-[11px] font-medium text-muted-foreground">
                  Access Key
                </Label>
                <Input
                  value={formData.accessKey}
                  onChange={(e) => updateForm({ accessKey: e.target.value })}
                  className="h-10 font-mono text-sm"
                />
              </div>
              <div className="grid gap-2.5">
                <Label className="text-[11px] font-medium text-muted-foreground">
                  Region
                </Label>
                <Select
                  value={formData.region}
                  onValueChange={(v) => updateForm({ region: v })}
                >
                  <SelectTrigger className="h-10 font-mono text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="us-east-1">us-east-1</SelectItem>
                    <SelectItem value="eu-west-1">eu-west-1</SelectItem>
                    <SelectItem value="ap-southeast-1">
                      ap-southeast-1
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2.5">
              <Label className="text-[11px] font-medium text-muted-foreground">
                Secret Key
              </Label>
              <div className="relative">
                <Input
                  type={showSecret ? 'text' : 'password'}
                  value={formData.secretKey}
                  onChange={(e) => updateForm({ secretKey: e.target.value })}
                  placeholder="••••••••••••••••"
                  className="h-10 pr-10 font-mono text-sm"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowSecret(!showSecret)}
                >
                  {showSecret ? (
                    <Eye className="size-4" />
                  ) : (
                    <EyeOff className="size-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="grid gap-2.5">
              <Label className="text-[11px] font-medium text-muted-foreground">
                Bucket Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={formData.bucket}
                onChange={(e) => updateForm({ bucket: e.target.value })}
                className="h-10 font-mono text-sm"
              />
            </div>
          </div>

          <SheetFooter className="border-t bg-muted/40 p-6">
            <div className="grid w-full gap-3">
              {/* A test proves nothing about fields edited since it ran, so
                  updateForm clears this on every keystroke. */}
              {testResult && (
                <p
                  className={cn(
                    'flex items-start gap-2 text-[13px] leading-relaxed',
                    testResult.success ? 'text-pulse-green' : 'text-destructive'
                  )}
                  role="status"
                >
                  {testResult.success ? (
                    <Check className="mt-0.5 size-3.5 shrink-0" />
                  ) : (
                    <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                  )}
                  {testResult.success
                    ? 'Connected. The bucket is reachable with these settings.'
                    : testResult.error}
                </p>
              )}

              <Button
                variant="outline"
                className="h-10 w-full"
                loading={isTesting}
                disabled={isSaving || isTesting}
                onClick={handleTest}
              >
                {!isTesting && <PlugZap className="size-4" />}
                Test connection
              </Button>

              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="h-10"
                  onClick={() => setIsSheetOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  loading={isSaving}
                  disabled={isSaving || isTesting}
                  className="h-10"
                  onClick={handleSave}
                >
                  {!isSaving && <Save className="size-4" />}
                  Save config
                </Button>
              </div>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
