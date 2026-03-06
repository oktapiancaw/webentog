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

import * as React from 'react';
import { useState } from 'react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from '@/components/ui/sidebar';
import {
  Settings,
  EyeOff,
  ArrowRightToLine,
  Database,
  Eye,
} from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface ConnectionConfig {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  onConnect?: (config: ConnectionConfig) => void;
}
export function AppSidebar({ onConnect, ...props }: AppSidebarProps) {
  const [endpoint, setEndpoint] = useState(
    'https://s3.us-east-1.amazonaws.com'
  );
  const [accessKey, setAccessKey] = useState('AKIA27XQ5Z7Y4EXAMPLE');
  const [secretKey, setSecretKey] = useState('');
  const [bucket, setBucket] = useState('prod-assets-v1');
  const [region, setRegion] = useState('us-east-1');

  const [showSecret, setShowSecret] = useState(false);

  const handleConnect = () => {
    const config = { endpoint, accessKey, secretKey, bucket, region };
    console.log('Submitting connection config:', config);

    if (onConnect) {
      onConnect(config);
    }
  };
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="pb-10">
        <div className="px-2 flex items-center gap-2 mt-2">
          <Database className="size-6 text-blue-600" />
          <div>
            <h2 className="text-lg font-bold leading-none">Object Storage</h2>
            <p className="text-[10px] font-semibold text-muted-foreground tracking-wider mt-1 uppercase">
              Management Console
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <div className="flex flex-col gap-5 p-4 mt-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Settings className="size-4" />
            <span>Connection Settings</span>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="endpoint" className="text-xs text-muted-foreground">
              Endpoint URL
            </Label>
            <Input
              id="endpoint"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label
              htmlFor="access-key"
              className="text-xs text-muted-foreground"
            >
              Access Key
            </Label>
            <Input
              id="access-key"
              value={accessKey}
              onChange={(e) => setAccessKey(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label
              htmlFor="secret-key"
              className="text-xs text-muted-foreground"
            >
              Secret Key
            </Label>
            <div className="relative">
              <Input
                id="secret-key"
                type={showSecret ? 'text' : 'password'}
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder="*******************"
                className="pr-10"
              />
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowSecret(!showSecret)}
                type="button"
              >
                {/* Swap icon based on visibility state */}
                {showSecret ? (
                  <Eye className="size-4 text-muted-foreground" />
                ) : (
                  <EyeOff className="size-4 text-muted-foreground" />
                )}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="bucket" className="text-xs text-muted-foreground">
                Bucket Name
              </Label>
              <Input
                id="bucket"
                value={bucket}
                onChange={(e) => setBucket(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="region" className="text-xs text-muted-foreground">
                Region
              </Label>
              {/* Select uses onValueChange instead of onChange */}
              <Select value={region} onValueChange={setRegion}>
                <SelectTrigger id="region">
                  <SelectValue placeholder="Select region" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="us-east-1">us-east-1</SelectItem>
                  <SelectItem value="eu-west-1">eu-west-1</SelectItem>
                  <SelectItem value="ap-southeast-1">ap-southeast-1</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </SidebarContent>

      <SidebarFooter className="border-t p-4">
        <div className="flex flex-col gap-3">
          <Button
            className="w-full justify-center gap-2 bg-[#2524D1] hover:bg-blue-800 text-white"
            onClick={handleConnect}
          >
            <ArrowRightToLine className="size-4" />
            Connect to Storage
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
