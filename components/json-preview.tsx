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
import { CopyIcon } from 'lucide-react';
import { useState, useEffect } from 'react';
import ShikiHighlighter from 'react-shiki/web';
import { Button } from './ui/button';
import { toast } from 'sonner';

export function JsonPreview({ presignedUrl }: { presignedUrl: string }) {
  const [data, setData] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchJson = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `/api/proxy?url=${encodeURIComponent(presignedUrl)}`
        );

        if (!response.ok) throw new Error('Fail to preview data');

        const jsonData = await response.json();

        setData(JSON.stringify(jsonData, null, 2));
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchJson();
  }, [presignedUrl]);

  if (loading)
    return (
      <div className="text-sm text-muted-foreground">
        loading file content...
      </div>
    );
  if (error) return <div className="text-sm text-red-500">Error: {error}</div>;

  const handleCopyJson = () => {
    navigator.clipboard.writeText(data?.trim() || '');
    setCopied(true);
    toast.success('Json copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div className="flex">
        <Button variant={'ghost'} className="w-full" onClick={handleCopyJson}>
          <CopyIcon className="size-4" />
          Copy json data
        </Button>
      </div>
      <ShikiHighlighter language="json" theme="ayu-dark" className="">
        {data?.trim() || ''}
      </ShikiHighlighter>
    </>
  );
}
