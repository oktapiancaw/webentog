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
import { ChevronRight, Copy, Check, PencilIcon, XIcon } from 'lucide-react'; // Optional: for path arrows
import { Moon, Sun, LogOut } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { logoutAction } from '@/app/actions/auth';

interface SiteHeaderProps {
  onNavigate?: (folderName: string) => void;
  setCurrentPath?: (path: String) => void;
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
  // State untuk mengatur mode edit dan nilai input
  const [isEditing, setIsEditing] = useState(false);
  const [manualPath, setManualPath] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Split the path into an array: ["home", "documents", "projects"]
  const pathSegments = currentPath.split('/').filter(Boolean);

  const handleEditClick = () => {
    setManualPath(pathSegments.join('/')); // Set nilai awal saat diklik
    setIsEditing(true); // Ubah mode ke input

    // Memberikan sedikit waktu (delay) agar elemen input selesai di-render sebelum difokuskan
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
      toast.error('Failed to logout');
      console.error(error);
    }
  };

  const handleCopyPath = () => {
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

    navigator.clipboard.writeText(fullPath);
    setCopied(true);
    toast.success('Path copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header className="flex  h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1 rounded-none" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />

        {/* Breadcrumb Path as Buttons */}
        <div className="flex items-center w-full">
          {isEditing ? (
            // --- MODE INPUT MANUAL ---
            <div className="flex items-center gap-2 w-full max-w-md">
              <span className="text-muted-foreground font-medium">/</span>
              <input
                ref={inputRef}
                type="text"
                className="flex-1 h-8 px-2 text-sm border rounded-md bg-transparent text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                value={manualPath}
                onChange={(e) => setManualPath(e.target.value)} // Sekarang ketikan tidak akan ter-reset
                onKeyDown={handleKeyDown}
                placeholder="Ketik path folder..."
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={handleSave}
              >
                <Check className="h-4 w-4 text-green-600 dark:text-green-500" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setIsEditing(false)}
              >
                <XIcon className="h-4 w-4 text-red-600 dark:text-red-500" />
              </Button>
            </div>
          ) : (
            // --- MODE BREADCRUMB NORMAL ---
            <nav className="flex items-center gap-1 overflow-hidden group">
              {/* ... (Kode bagian Home dan map pathSegments tetap sama persis seperti sebelumnya) ... */}

              <div key="home" className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-8 px-2 capitalize rounded-none ${
                    pathSegments.length > 0
                      ? 'font-medium text-foreground'
                      : 'font-base text-muted-foreground'
                  }`}
                  asChild
                  onClick={() => onNavigate?.('/')}
                >
                  <span className="hover:cursor-pointer">Home</span>
                </Button>
                {pathSegments.length > 0 && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                )}
              </div>

              {pathSegments.map((segment, index) => {
                let href = '/' + pathSegments.slice(0, index + 1).join('/');
                href = href.endsWith('/') ? href : href + '/';
                const isLast = index === pathSegments.length - 1;

                return (
                  <div key={href} className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-8 px-2 capitalize rounded-none ${
                        isLast
                          ? 'font-medium text-foreground'
                          : 'font-base text-muted-foreground'
                      }`}
                      asChild
                      onClick={() => onNavigate?.(href)}
                    >
                      <span className="hover:cursor-pointer">{segment}</span>
                    </Button>
                    {!isLast && (
                      <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                    )}
                  </div>
                );
              })}

              {/* Tombol Edit sekarang menggunakan handleEditClick */}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={handleEditClick}
                title="Edit path secara manual"
              >
                <PencilIcon className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </nav>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-none ml-1 text-muted-foreground hover:text-foreground"
          onClick={handleCopyPath}
          title="Copy path"
        >
          {copied ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          <span className="sr-only">Copy path</span>
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            asChild
            size="sm"
            className="hidden sm:flex rounded-none"
          >
            <a
              href="https://github.com/oktapiancaw/webentog"
              rel="noopener noreferrer"
              target="_blank"
              className="dark:text-foreground"
            >
              GitHub
            </a>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className=" h-8 w-8 rounded-none text-muted-foreground hover:text-foreground"
            onClick={handleLogout}
            title="Logout"
          >
            <LogOut className="h-4 w-4" />
            <span className="sr-only">Logout</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="rounded-none border-none"
              >
                <Sun className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
                <Moon className="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
                <span className="sr-only">Toggle theme</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-none">
              <DropdownMenuItem
                onClick={() => setTheme('light')}
                className="rounded-none"
              >
                Light
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setTheme('dark')}
                className="rounded-none"
              >
                Dark
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setTheme('system')}
                className="rounded-none"
              >
                System
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
