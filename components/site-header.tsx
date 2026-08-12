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

import { Button } from '@/components/ui/button';

import { useTheme } from 'next-themes';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { ChevronRight, Copy, Check, PencilIcon, XIcon } from 'lucide-react';
import { Moon, Sun, LogOut } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { toastError } from '@/lib/errors';
import { useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { logoutAction } from '@/app/actions/auth';
import { copyToClipboard } from '@/lib/utils';

interface SiteHeaderProps {
  onNavigate?: (folderName: string) => void;
  currentPath: string;
  bucket?: string;
}

export function SiteHeader({
  currentPath = 'home/documents/projects',
  onNavigate,
  bucket = '',
}: SiteHeaderProps) {
  const { setTheme } = useTheme();
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  // Edit mode and its input value.
  const [isEditing, setIsEditing] = useState(false);
  const [manualPath, setManualPath] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // "home/documents/projects" -> ["home", "documents", "projects"]
  const pathSegments = currentPath.split('/').filter(Boolean);

  const handleEditClick = () => {
    setManualPath(pathSegments.join('/'));
    setIsEditing(true);

    // Wait for the input to render before focusing it.
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  const handleSave = () => {
    let finalPath = manualPath.trim();
    finalPath = finalPath.endsWith('/') ? finalPath : finalPath + '/';
    onNavigate?.(`/${finalPath}`);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') setIsEditing(false);
  };

  const handleLogout = async () => {
    try {
      await logoutAction();
      toast.success('Logged out successfully');
      router.push('/login');
      router.refresh();
    } catch (error) {
      toastError(error, 'Could not log you out.');
    }
  };

  const handleCopyPath = async () => {
    const cleanPath =
      currentPath === '/'
        ? ''
        : currentPath.startsWith('/')
          ? currentPath.substring(1)
          : currentPath;
    const fullPath = bucket
      ? cleanPath
        ? `${bucket}/${cleanPath}`
        : bucket
      : currentPath;

    if (!(await copyToClipboard(fullPath))) {
      toast.error('Could not copy to the clipboard.');
      return;
    }
    setCopied(true);
    toast.success('Path copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b bg-card transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />

        <div className="flex items-center w-full">
          {isEditing ? (
            // Manual path entry
            <div className="flex w-full max-w-md items-center gap-2">
              <span className="font-mono text-muted-foreground">/</span>
              <input
                ref={inputRef}
                type="text"
                className="h-8 flex-1 rounded-md border bg-muted/40 px-2 font-mono text-[13px] text-foreground focus:border-ring focus:outline-none"
                value={manualPath}
                onChange={(e) => setManualPath(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a folder path…"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleSave}
                title="Go"
              >
                <Check className="size-4 text-pulse-green" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setIsEditing(false)}
                title="Cancel"
              >
                <XIcon className="size-4 text-destructive" />
              </Button>
            </div>
          ) : (
            // Breadcrumb
            <nav className="group flex items-center gap-0.5 overflow-hidden">
              <div key="home" className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-7 px-2 font-mono text-[13px] ${
                    pathSegments.length > 0
                      ? 'text-muted-foreground'
                      : 'text-strong'
                  }`}
                  asChild
                  onClick={() => onNavigate?.('/')}
                >
                  <span className="cursor-pointer">{bucket || 'Home'}</span>
                </Button>
                {pathSegments.length > 0 && (
                  <ChevronRight className="size-3.5 text-muted-foreground/50" />
                )}
              </div>

              {pathSegments.map((segment, index) => {
                let href = '/' + pathSegments.slice(0, index + 1).join('/');
                href = href.endsWith('/') ? href : href + '/';
                const isLast = index === pathSegments.length - 1;

                return (
                  <div key={href} className="flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-7 px-2 font-mono text-[13px] ${
                        isLast ? 'text-strong' : 'text-muted-foreground'
                      }`}
                      asChild
                      onClick={() => onNavigate?.(href)}
                    >
                      <span className="cursor-pointer">{segment}</span>
                    </Button>
                    {!isLast && (
                      <ChevronRight className="size-3.5 text-muted-foreground/50" />
                    )}
                  </div>
                );
              })}

              <Button
                variant="ghost"
                size="icon-xs"
                className="ml-1 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                onClick={handleEditClick}
                title="Edit path"
              >
                <PencilIcon className="text-muted-foreground" />
              </Button>
            </nav>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-1 text-muted-foreground hover:text-foreground"
          onClick={handleCopyPath}
          title="Copy path"
        >
          {copied ? (
            <Check className="size-4 text-pulse-green" />
          ) : (
            <Copy className="size-4" />
          )}
          <span className="sr-only">Copy path</span>
        </Button>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            asChild
            size="sm"
            className="hidden text-muted-foreground hover:text-foreground sm:flex"
          >
            <a
              href="https://github.com/oktapiancaw/webentog"
              rel="noopener noreferrer"
              target="_blank"
            >
              GitHub
            </a>
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={handleLogout}
            title="Logout"
          >
            <LogOut className="size-4" />
            <span className="sr-only">Logout</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground"
              >
                <Sun className="size-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
                <Moon className="absolute size-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
                <span className="sr-only">Toggle theme</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setTheme('light')}>
                Light
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme('dark')}>
                Dark
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme('system')}>
                System
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
