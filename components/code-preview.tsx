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

import { CheckIcon, CopyIcon, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import ShikiHighlighter from 'react-shiki/web';
import { useTheme } from 'next-themes';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { copyToClipboard, languageFromName } from '@/lib/utils';

interface CodePreviewProps {
  presignedUrl: string;
  /** File name, used only to pick the highlighting language. */
  fileName?: string;
}

export function CodePreview({ presignedUrl, fileName = '' }: CodePreviewProps) {
  const [data, setData] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { resolvedTheme } = useTheme();

  const language = languageFromName(fileName);

  useEffect(() => {
    const controller = new AbortController();

    const fetchContent = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await fetch(
          `/api/proxy?url=${encodeURIComponent(presignedUrl)}`,
          { signal: controller.signal }
        );
        if (!response.ok) throw new Error('Failed to load file content');

        const text = await response.text();
        // Pretty-print JSON. Everything else stays verbatim.
        if (language === 'json') {
          try {
            setData(JSON.stringify(JSON.parse(text), null, 2));
            return;
          } catch {
            /* not valid JSON, fall through to raw text */
          }
        }
        setData(text);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    fetchContent();
    return () => controller.abort();
  }, [presignedUrl, language]);

  const handleCopy = async () => {
    if (!(await copyToClipboard(data.trim()))) {
      toast.error('Copy failed');
      return;
    }
    setCopied(true);
    toast.success('Content copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading)
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading file content…
      </div>
    );

  if (error)
    return (
      <div className="flex h-full items-center justify-center text-sm text-destructive">
        {error}
      </div>
    );

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          {language}
        </span>
        <Button variant="ghost" size="sm" onClick={handleCopy}>
          {copied ? (
            <CheckIcon className="size-3.5 text-pulse-green" />
          ) : (
            <CopyIcon className="size-3.5" />
          )}
          Copy
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/40 text-[13px]">
        <ShikiHighlighter
          language={language}
          theme={resolvedTheme === 'light' ? 'github-light' : 'vesper'}
          showLanguage={false}
          className="[&_pre]:!bg-transparent [&_pre]:!p-4 font-mono"
        >
          {data.trim()}
        </ShikiHighlighter>
      </div>
    </div>
  );
}
