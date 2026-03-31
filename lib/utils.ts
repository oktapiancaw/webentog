import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const getLastNameFromPath = (path: string): string | undefined => {
  const parts = path.split('/').filter(Boolean); // Split by '/' and remove empty parts
  return parts[parts.length - 1]; // Access the last element
};
