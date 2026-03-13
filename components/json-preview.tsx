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
import { useState, useEffect } from 'react';

export function JsonPreview({ presignedUrl }: { presignedUrl: string }) {
  const [data, setData] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchJson = async () => {
      try {
        setLoading(true);
        // Panggil API Proxy kita, dan sisipkan presignedUrl di parameternya
        // Jangan lupa di-encode agar URL S3 yang panjang tidak memutus string
        const response = await fetch(
          `/api/proxy?url=${encodeURIComponent(presignedUrl)}`
        );

        if (!response.ok) throw new Error('Gagal memuat preview');

        const jsonData = await response.json();

        // Ubah JSON object menjadi string dengan indentasi 2 spasi agar rapi
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
      <div className="text-sm text-muted-foreground">Memuat isi file...</div>
    );
  if (error) return <div className="text-sm text-red-500">Error: {error}</div>;

  return (
    <div className="bg-slate-950 p-4 rounded-md overflow-auto max-h-[500px]">
      <pre className="text-sm text-green-400 font-mono">{data}</pre>
    </div>
  );
}
