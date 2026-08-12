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

import { SUPPORT_EMAIL } from '@/lib/errors';

/**
 * Last resort: a crash in the root layout replaces <html> entirely, so this
 * cannot use the app's providers, fonts or components. Inline styles only —
 * a stylesheet may be exactly what failed to load.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          background: '#08090a',
          color: '#d0d6e0',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          margin: 0,
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 16, fontWeight: 510, color: '#ffffff' }}>
            Webentog could not start.
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: '#8a8f98' }}>
            Something failed before the app finished loading. Reload the page,
            and if it keeps happening please report it to{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: '#d0d6e0' }}>
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
          {error.digest && (
            <p
              style={{
                fontSize: 12,
                color: '#62666d',
                fontFamily: 'ui-monospace, monospace',
              }}
            >
              Reference: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              marginTop: 16,
              padding: '8px 16px',
              borderRadius: 6,
              border: '1px solid #23252a',
              background: 'transparent',
              color: '#d0d6e0',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
