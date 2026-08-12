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

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SUPPORT_EMAIL } from '@/lib/errors';
import { explainError } from '@/lib/utils';

/**
 * Without this file a thrown server action reaches the user as React's
 * production stub — "Minified React error #441" — because React strips server
 * messages from the client bundle on purpose. The digest is the only thread
 * back to the real stack in the server log, so it is shown rather than hidden.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const { message } = explainError(error, 'Something went wrong.');

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border p-6">
        <div className="flex items-center gap-3">
          <AlertTriangle className="size-5 text-destructive" />
          <h1 className="text-base font-medium text-strong">{message}</h1>
        </div>

        <p className="mt-3 text-sm text-muted-foreground">
          Your connections and files were not changed. Try again, and if it
          keeps happening please report it to{' '}
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
              `Webentog error${error.digest ? ` (${error.digest})` : ''}`
            )}`}
            className="text-strong underline underline-offset-4"
          >
            {SUPPORT_EMAIL}
          </a>
          .
        </p>

        {error.digest && (
          <p className="mt-3 text-xs text-muted-foreground">
            Include this reference — it points at the full error in the server
            log: <span className="font-mono text-strong">{error.digest}</span>
          </p>
        )}

        <Button className="mt-5 w-full" onClick={reset}>
          <RefreshCw className="size-4" />
          Try again
        </Button>
      </div>
    </div>
  );
}
