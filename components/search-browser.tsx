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

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchIcon, UploadIcon } from 'lucide-react';

interface SearchBrowserProps {
  onSearch?: (searchtext: string) => void;
}
export function SearchBrowser({ onSearch }: SearchBrowserProps) {
  const [searchText, setSearchText] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onSearch?.(searchText);
  };

  return (
    <div className="flex space-x-2">
      <Input
        id="searchText"
        value={searchText}
        className="w-full rounded-none font-mono text-sm"
        placeholder="Search your file.."
        onKeyDown={handleKeyDown}
        onChange={(e) => setSearchText(e.target.value)}
      />

      <Button
        variant={'default'}
        className="justify-center gap-2 rounded-none font-semibold uppercase tracking-wider text-xs"
        onClick={() => onSearch?.(searchText)}
      >
        Search
        <SearchIcon className="size-4" />
      </Button>

      <Button
        variant={'secondary'}
        className="justify-center gap-2 rounded-none font-semibold uppercase tracking-wider text-xs"
      >
        Upload
        <UploadIcon className="size-4" />
      </Button>
    </div>
  );
}
