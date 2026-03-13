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

export function WebEntogLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Cloud Base - Teal-600 */}
      <path
        d="M12 68C12 55 22 54 22 54C22 35 42 30 50 40C58 30 78 35 78 54C78 54 88 55 88 68C88 78 78 82 70 82H30C22 82 12 78 12 68Z"
        fill="#0D9488"
      />

      {/* Sturdy Muscovy Duck (Entog) Silhouette - Navy Blue */}
      <path
        d="M44 55C44 32 50 22 62 22L82 32L62 42C54 42 52 48 52 65H44V55Z"
        fill="#1E1B4B"
      />
    </svg>
  );
}
