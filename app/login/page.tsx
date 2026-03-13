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

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { loginAction, isPersistentMode } from '@/app/auth-action';
import { toast } from 'sonner';
import { WebEntogLogo } from '@/components/logo';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingMode, setIsCheckingMode] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function checkMode() {
      const persistent = await isPersistentMode();
      if (!persistent) {
        router.push('/');
      } else {
        setIsCheckingMode(false);
      }
    }
    checkMode();
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await loginAction(username, password);
      if (result.success) {
        toast.success('Login successful!');
        router.push('/');
        router.refresh();
      } else {
        toast.error(result.message || 'Login failed');
      }
    } catch (error) {
      toast.error('An unexpected error occurred');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isCheckingMode) {
    return null; // Or a loading spinner
  }

  return (
    <div className="flex flex-col space-y-6 min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <div className="p-6 w-full flex justify-center items-center gap-3">
        <div className="size-12  flex items-center justify-center shrink-0">
          <WebEntogLogo className="size-full" />
        </div>
        <div>
          <h2 className="text-base font-black leading-tight uppercase tracking-wide">
            WebEntog
          </h2>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
            Storage Console
          </p>
        </div>
      </div>
      <div className="w-full max-w-md space-y-8 rounded-none border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="text-center">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Welcome Back
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Please sign in to your account
          </p>
        </div>

        <form onSubmit={handleLogin} className="mt-8 space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>
      </div>
    </div>
  );
}
