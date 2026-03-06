
# WebEntog 🦆

**Object Storage Management on the browser.**

WebEntog is a lightweight, web-based alternative to desktop object storage clients (like Cyberduck or FileZilla). It is designed for users who need quick, secure access to their cloud storage but are unable or unwilling to download and install dedicated desktop software.



## ✨ Features

* **No Installation Required:** Fully functional in any modern web browser.
* **Dynamic Connections:** Connect to any S3-compatible object storage simply by entering your endpoint, credentials, and bucket name in the UI.
* **Universal Storage Compatibility:** Powered by Apache OpenDAL, enabling potential future support for dozens of storage backends (GCS, Azure, WebDAV, etc.).
* **Secure Execution:** Credentials and native Rust binaries execute securely on the server via Next.js Server Actions, keeping your sensitive keys out of the browser.
* **Direct Downloads:** Generates secure, short-lived pre-signed URLs so your browser downloads files directly from the storage bucket, preventing server bottlenecks.
* **Real-time Search:** Lightning-fast, client-side file filtering.

## 🛠️ Tech Stack

* **Frontend:** Next.js (App Router), React, Tailwind CSS, shadcn/ui
* **Core Logic:** Apache OpenDAL (Node.js Binding)
* **Icons:** Lucide React
* **Deployment:** Docker (Multi-stage build)

## 🚀 Getting Started (Local Development)

### Prerequisites
* Node.js (v20+ recommended)
* npm or pnpm

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/webentog.git
cd webentog
```

2. Install dependencies:
*(Note: Due to React 19 peer dependencies with certain UI libraries, use the legacy flag if using npm)*
```bash
npm install --legacy-peer-deps
```


3. Start the development server:
```bash
npm run dev
```


4. Open [http://localhost:3000](https://www.google.com/search?q=http://localhost:3000) in your browser.

> **Note on OpenDAL Native Bindings:** If you encounter a `Cannot find native binding` error during installation, clear your `node_modules` and run `npm rebuild` to ensure the Rust binaries for your operating system are downloaded correctly.

## 🐳 Docker Deployment

WebEntog includes a highly optimized, multi-stage Dockerfile that leverages Next.js standalone output and Debian-slim to ensure native OpenDAL bindings work flawlessly.

1. Build the image:
```bash
docker build -t webentog .
```


2. Run the container:
```bash
docker run -p 3000:3000 webentog
```


The application will be available at `http://localhost:3000`.

## 🔒 Security Note

WebEntog does not persist your storage credentials. The connection state is held in the browser's active session and passed securely to the Next.js server per request. Refreshing the page will require you to re-enter your connection details.

## 📄 License

WebEntog is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

WebEntog is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

Copyright (C) 2026 Oktapian Candra Adi Wijaya

You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.