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

import { useRouter } from 'next/navigation';
import { AppSidebar } from '@/components/app-sidebar';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

/**
 * The sidebar and header geometry, shared so the browser and the admin pages
 * cannot drift apart.
 */
export const SHELL_STYLE = {
  '--sidebar-width': 'calc(var(--spacing) * 78)',
  '--header-height': 'calc(var(--spacing) * 12)',
} as React.CSSProperties;

/**
 * Chrome for pages that are not the file browser.
 *
 * The browser page builds its own shell because the sidebar there is wired to
 * live connection state and the layout carries a preview pane. Everything
 * else just needs the same frame around a different middle, so the sidebar
 * and header stay put and only the content changes.
 *
 * The sidebar is read-only here: picking a connection leaves for the browser
 * rather than trying to mount a bucket on a page that cannot show one.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    // Same ceiling as the browser page: the primitive's min-h-svh is a floor,
    // so a long admin table would grow the document and take the header with
    // it. Kept in step with app/page.tsx deliberately.
    <SidebarProvider style={SHELL_STYLE} className="h-svh overflow-hidden">
      <AppSidebar
        variant="inset"
        onConnect={(config) =>
          router.push(config.id ? `/?conn=${config.id}` : '/')
        }
      />

      <SidebarInset className="overflow-hidden">
        {/* No bucket to show, so the breadcrumb is just the way home — but a
            path typed into it still carries over to the browser. */}
        <SiteHeader
          currentPath="/"
          onNavigate={(path) =>
            router.push(
              path && path !== '/'
                ? `/?path=${encodeURIComponent(path.replace(/^\//, ''))}`
                : '/'
            )
          }
        />
        <main className="@container/main min-h-0 min-w-0 flex-1 overflow-auto">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
