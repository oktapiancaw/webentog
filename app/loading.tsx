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

import { PageLoader } from '@/components/page-loader';

/**
 * Shown while a route segment renders on the server. Sits at the app root, so
 * it covers every page that does not define its own — the browser, the admin
 * view and login all share it.
 */
export default function Loading() {
  return <PageLoader />;
}
