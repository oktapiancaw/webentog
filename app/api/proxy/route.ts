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
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return NextResponse.json({ error: 'URL not found' }, { status: 400 });
  }

  try {
    const response = await fetch(targetUrl);

    if (!response.ok) {
      throw new Error('Fail to get file from storage');
    }

    const textData = await response.text();

    try {
      const jsonData = JSON.parse(textData);
      return NextResponse.json(jsonData);
    } catch {
      return new NextResponse(textData, {
        headers: { 'Content-Type': 'text/plain' },
      });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Fail to request' }, { status: 500 });
  }
}
