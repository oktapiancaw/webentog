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

import { WebEntogLogo } from '@/components/logo';
import { cn } from '@/lib/utils';

/**
 * Full-screen loading state, shared by the route-level `loading.tsx` and the
 * Suspense boundary around the browser page.
 *
 * No spinner: the whole screen is already blank, so a small rotating icon in
 * the middle of it says less than the mark the user is waiting for. The logo
 * breathes and a track fills underneath, which reads as progress without
 * claiming a percentage nothing here can measure.
 */
export function PageLoader({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex min-h-svh w-full flex-col items-center justify-center gap-5',
        className
      )}
    >
      <WebEntogLogo className="size-12 animate-pulse" />

      {/* Indeterminate: a fixed-width bar sweeping a fixed track. Tailwind has
          no such keyframe, so the animation is declared inline rather than
          added to the global stylesheet for one use. */}
      <div className="h-0.5 w-40 overflow-hidden rounded-full bg-border">
        <div className="h-full w-1/3 rounded-full bg-primary [animation:webentog-sweep_1.1s_ease-in-out_infinite]" />
      </div>

      <span className="text-xs tracking-[0.14em] text-muted-foreground uppercase">
        Loading
      </span>

      <style>{`
        @keyframes webentog-sweep {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
}
