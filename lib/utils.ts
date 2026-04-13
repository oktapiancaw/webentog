import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const getLastNameFromPath = (path: string): string | undefined => {
  const parts = path.split('/').filter(Boolean); // Split by '/' and remove empty parts
  return parts[parts.length - 1]; // Access the last element
};

export function formatStorage(kb: number) {
  const bytes = kb * 1024;

  return new Intl.NumberFormat('en-US', {
    style: 'unit',
    unit: 'byte',
    unitDisplay: 'narrow',
    notation: 'compact', // Automatically chooses MB, GB, etc.
    maximumFractionDigits: 1,
  }).format(bytes);
}
