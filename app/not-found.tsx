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

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WebEntogLogo } from '@/components/logo';

/**
 * Replaces Next's stock 404, which is unstyled black-on-white and reads as a
 * broken deployment rather than a wrong address.
 *
 * Deliberately does not mention buckets or objects: this fires on an unknown
 * *route*, and a missing object inside a bucket is a different failure the
 * browser reports inline. Saying "file not found" here would send someone
 * looking for a storage problem that does not exist.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border p-6">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-medium text-strong">
            <span className="font-mono text-4xl text-muted-foreground mr-2">
              404
            </span>{' '}
            no page at this address
          </h1>
        </div>

        <p className="mt-3 text-sm text-muted-foreground">
          The link may be out of date, or the address may have a typo. Nothing
          is wrong with your connections or your files.
        </p>

        <Button asChild className="mt-5 w-full">
          <Link href="/">
            <ArrowLeft className="size-4" />
            Back to the browser
          </Link>
        </Button>

        <div className="flex w-full items-center gap-3 px-4 pt-5 border-t mt-6">
          <div className="flex size-8 shrink-0 items-center justify-center">
            <WebEntogLogo className="size-full" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">
              <span className="text-[15px] leading-tight text-strong mr-1">
                WebEntog
              </span>
              · Storage console
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
