"use client"

import * as React from "react"
import { 
  Folder, 
  Image as ImageIcon, 
  FileText, 
  FileJson, 
  Film, 
  Download, 
  ArrowRight
} from "lucide-react"
import { Button } from "@/components/ui/button"


// 2. Mock data based on your image
const mockFiles: FileItem[] = [
  { id: "1", name: "campaign_assets", type: "folder", size: "--", lastModified: "2 hours ago" },
  { id: "2", name: "profiles_v2", type: "folder", size: "--", lastModified: "5 hours ago" },
  { id: "3", name: "hero-banner-dark.png", type: "image", size: "1.2 MB", lastModified: "10 mins ago" },
  { id: "4", name: "usage_report_june.pdf", type: "pdf", size: "450 KB", lastModified: "Yesterday" },
  { id: "5", name: "config.json", type: "json", size: "12 KB", lastModified: "3 days ago" },
  { id: "6", name: "intro_animation_v2.mp4", type: "video", size: "42.8 MB", lastModified: "1 week ago" },
];
// Export these types so your parent component can use them
export type FileType = "folder" | "image" | "pdf" | "json" | "video" | "unknown";

export interface FileItem {
  id: string;
  name: string;
  type: FileType;
  size: string;
  lastModified: string;
}

interface StorageBrowserProps {
  files: FileItem[];
  onNavigate?: (folderName: string) => void;
  onDownload?: (fileId: string, fileName: string) => void;
}

const getFileIcon = (type: FileType) => {
  switch (type) {
    case "folder": return <Folder className="size-5 text-amber-500 fill-amber-500" />;
    case "image": return <ImageIcon className="size-5 text-blue-500" />;
    case "pdf": return <FileText className="size-5 text-red-500 fill-red-500/20" />;
    case "json": return <FileJson className="size-5 text-emerald-500" />;
    case "video": return <Film className="size-5 text-indigo-500 fill-indigo-500/20" />;
    default: return <FileText className="size-5 text-muted-foreground" />;
  }
};

export function StorageBrowser({ files = mockFiles, onNavigate, onDownload }: StorageBrowserProps) {
  return (
    <div className="w-full rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="border-b bg-slate-50/50 dark:bg-slate-900/50">
            <tr>
              <th className="h-12 px-6 align-middle font-semibold text-muted-foreground text-xs uppercase tracking-wider">Name</th>
              <th className="h-12 px-6 align-middle font-semibold text-muted-foreground text-xs uppercase tracking-wider">Size</th>
              <th className="h-12 px-6 align-middle font-semibold text-muted-foreground text-xs uppercase tracking-wider">Last Modified</th>
              <th className="h-12 px-6 align-middle font-semibold text-muted-foreground text-xs uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr 
                key={file.id} 
                className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted last:border-0"
              >
                <td className="p-4 px-6 align-middle">
                  <div className="flex items-center gap-3 font-medium">
                    {getFileIcon(file.type)}
                    <span>{file.name}</span>
                  </div>
                </td>
                <td className="p-4 px-6 align-middle text-muted-foreground">
                  {file.size} KB
                </td>
                <td className="p-4 px-6 align-middle text-muted-foreground">
                  {file.lastModified}
                </td>
                <td className="p-4 px-6 align-middle text-right">
                  {/* Conditionally render the download button only if it's NOT a folder */}
                  {file.type === "folder" && (
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" onClick={() => {
                        if (file.type === 'folder' && onNavigate) {
                          onNavigate(file.name);
                        }
                      }}>
                      <ArrowRight className="size-4" />
                      <span className="sr-only">Open {file.name}</span>
                    </Button>
                  )}
                  {file.type !== "folder" && (
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" onClick={() => onDownload?.(file.id, file.name)}>
                      <Download className="size-4" />
                      <span className="sr-only">Download {file.name}</span>
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}