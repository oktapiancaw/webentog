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
import { useState, useEffect } from 'react';
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
  saveConnection,
  getConnections,
  deleteConnection,
  ConnectionConfig,
} from '@/app/actions/object-management';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { WebEntogLogo } from '@/components/logo';

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  onConnect?: (config: ConnectionConfig) => void;
  isLoading?: boolean;
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
  isLoading,
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
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  useEffect(() => {
    fetchConnections();
  }, []);

  const fetchConnections = async () => {
    const connections = await getConnections();
    setSavedConnections(connections);
  };

  const handleConnect = (config: ConnectionConfig) => {
    if (onConnect) {
      onConnect(config);
      if (config.id) setActiveId(config.id);
      toast.success(`Connecting to ${config.bucket}...`);
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.endpoint || !formData.bucket) {
      toast.error('Please fill in required fields (Name, Endpoint, Bucket).');
      return;
    }

    setIsSaving(true);
    try {
      await saveConnection(formData);
      await fetchConnections();
      toast.success('Connection saved successfully.');
      setIsSheetOpen(false);
      setFormData(INITIAL_FORM_STATE);
    } catch (error) {
      toast.error('Failed to save connection.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteConnection(id);
      await fetchConnections();
      toast.success('Connection deleted.');
      if (activeId === id) setActiveId(null);
      setConfirmDeleteId(null);
    } catch (error) {
      toast.error('Failed to delete connection.');
    }
  };

  const openCreateNew = () => {
    setFormData(INITIAL_FORM_STATE);
    setIsSheetOpen(true);
  };

  const openEdit = (config: ConnectionConfig) => {
    setFormData(config);
    setIsSheetOpen(true);
  };

  return (
    <>
      <Sidebar collapsible="offcanvas" {...props}>
        <SidebarHeader className="border-b h-(--header-height) flex items-center justify-center">
          <div className="px-4 w-full flex items-center gap-3">
            <div className="size-9 flex items-center justify-center shrink-0">
              <WebEntogLogo className="size-full" />
            </div>
            <div>
              <h2 className="text-sm font-black leading-tight uppercase tracking-tighter">
                WebEntog
              </h2>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                Storage Console
              </p>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel className="px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70">
              Connections
            </SidebarGroupLabel>
            <SidebarMenu className="px-2 space-y-0.5">
              {savedConnections.map((conn) => (
                <SidebarMenuItem key={conn.id} className="group/item">
                  <SidebarMenuButton
                    onClick={() => handleConnect(conn)}
                    isActive={activeId === conn.id}
                    className={cn(
                      'rounded-none h-11 border border-transparent transition-all',
                      activeId === conn.id
                        ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-900'
                    )}
                  >
                    <div className="flex items-center gap-3 w-full overflow-hidden">
                      <div
                        className={cn(
                          'size-6 flex items-center justify-center shrink-0 rounded-none border',
                          activeId === conn.id
                            ? 'bg-slate-900 border-slate-900 text-white dark:bg-slate-400 dark:border-slate-50 dark:text-slate-900'
                            : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-muted-foreground'
                        )}
                      >
                        {activeId === conn.id ? (
                          <Check className="size-3" />
                        ) : (
                          <HardDrive className="size-3" />
                        )}
                      </div>
                      <div className="flex flex-col items-start overflow-hidden">
                        <span className="text-xs font-bold truncate w-full uppercase tracking-wide">
                          {conn.name}
                        </span>
                        <span className="text-[9px] text-muted-foreground truncate w-full font-mono">
                          {conn.bucket}
                        </span>
                      </div>
                    </div>
                  </SidebarMenuButton>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuAction className="rounded-none opacity-0 group-hover/item:opacity-100 transition-opacity">
                        <MoreVertical className="size-3.5" />
                      </SidebarMenuAction>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="rounded-none w-40"
                    >
                      <DropdownMenuItem
                        onClick={() => openEdit(conn)}
                        className="rounded-none text-xs font-semibold uppercase tracking-wider"
                      >
                        Edit Config
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => conn.id && setConfirmDeleteId(conn.id)}
                        className="rounded-none text-xs font-semibold uppercase tracking-wider text-red-600 focus:text-red-600"
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Inline Delete Confirmation Overlay */}
                  {confirmDeleteId === conn.id && (
                    <div className="absolute inset-0 z-10 bg-red-600 text-white flex items-center justify-between px-3 animate-in fade-in duration-200">
                      <span className="text-[10px] font-bold uppercase tracking-widest">
                        Delete?
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-[9px] font-bold uppercase hover:underline"
                        >
                          No
                        </button>
                        <button
                          onClick={() => handleDelete(conn.id!)}
                          className="text-[9px] font-bold bg-white text-red-600 px-2 py-0.5 uppercase"
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
                  className="w-full h-10 border-dashed rounded-none border-slate-300 dark:border-slate-700 hover:border-slate-900 dark:hover:border-slate-100 hover:bg-transparent text-xs font-bold uppercase tracking-widest transition-all"
                >
                  <Plus className="size-3.5 mr-2" />
                  New Connection
                </Button>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="p-4 border-t bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
                Session Status
              </span>
              <div className="flex items-center gap-1.5">
                <div
                  className={cn(
                    'size-1.5 rounded-full',
                    activeId
                      ? 'bg-emerald-500 animate-pulse'
                      : 'bg-slate-300 dark:bg-slate-700'
                  )}
                />
                <span className="text-[9px] font-bold uppercase tracking-wider">
                  {activeId ? 'Active' : 'Idle'}
                </span>
              </div>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>

      {/* Connection Module (Sheet) */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent
          side="left"
          className="rounded-none border-r w-(--sidebar-width) sm:max-w-(--sidebar-width) p-0 flex flex-col"
        >
          <SheetHeader className="p-6 border-b bg-slate-50 dark:bg-slate-900/50">
            <div className="flex items-center gap-2 mb-2">
              <Settings className="size-4 text-slate-900 dark:text-slate-100" />
              <SheetTitle className="text-sm font-black uppercase tracking-widest">
                {formData.id ? 'Edit Connection' : 'Create Connection'}
              </SheetTitle>
            </div>
            <SheetDescription className="text-[11px] font-medium leading-relaxed uppercase tracking-tight">
              Configure your S3-compatible object storage parameters. These
              settings are stored locally.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="grid gap-2.5">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">
                Connection Name <span className="text-red-500">*</span>
              </Label>
              <Input
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="E.g. Production AWS"
                className="rounded-none font-mono text-sm h-10"
              />
            </div>

            <div className="grid gap-2.5">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">
                Endpoint URL <span className="text-red-500">*</span>
              </Label>
              <Input
                value={formData.endpoint}
                onChange={(e) =>
                  setFormData({ ...formData, endpoint: e.target.value })
                }
                placeholder="https://s3.amazonaws.com"
                className="rounded-none font-mono text-sm h-10"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2.5">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">
                  Access Key
                </Label>
                <Input
                  value={formData.accessKey}
                  onChange={(e) =>
                    setFormData({ ...formData, accessKey: e.target.value })
                  }
                  className="rounded-none font-mono text-sm h-10"
                />
              </div>
              <div className="grid gap-2.5">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">
                  Region
                </Label>
                <Select
                  value={formData.region}
                  onValueChange={(v) => setFormData({ ...formData, region: v })}
                >
                  <SelectTrigger className="rounded-none font-mono text-sm h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-none">
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
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">
                Secret Key
              </Label>
              <div className="relative">
                <Input
                  type={showSecret ? 'text' : 'password'}
                  value={formData.secretKey}
                  onChange={(e) =>
                    setFormData({ ...formData, secretKey: e.target.value })
                  }
                  placeholder="••••••••••••••••"
                  className="pr-10 rounded-none font-mono text-sm h-10"
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
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">
                Bucket Name <span className="text-red-500">*</span>
              </Label>
              <Input
                value={formData.bucket}
                onChange={(e) =>
                  setFormData({ ...formData, bucket: e.target.value })
                }
                className="rounded-none font-mono text-sm h-10"
              />
            </div>
          </div>

          <SheetFooter className="p-6 border-t bg-slate-50 dark:bg-slate-900/50">
            <div className="grid grid-cols-2 gap-3 w-full">
              <Button
                variant="outline"
                className="rounded-none uppercase text-[10px] font-black tracking-[0.2em] h-11"
                onClick={() => setIsSheetOpen(false)}
              >
                Cancel
              </Button>
              <Button
                loading={isSaving}
                className="rounded-none bg-slate-900 dark:bg-slate-100 dark:text-slate-900 uppercase text-[10px] font-black tracking-[0.2em] h-11"
                onClick={handleSave}
              >
                {!isSaving && <Save className="size-4 mr-2" />}
                Save Config
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
