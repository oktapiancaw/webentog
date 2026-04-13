# WebEntog 🦆

**Object Storage Management on the browser.**

WebEntog is a lightweight, web-based alternative to desktop object storage clients (like Cyberduck or FileZilla). It is designed for users who need quick, secure access to their cloud storage but are unable or unwilling to download and install dedicated desktop software.

## ✨ Features

- **Authentication:** Secure login system to protect your storage management dashboard.
- **Flexible Persistence:** Toggle between "Persistent Mode" (save connections to a database) or "Non-Persistent Mode" (transient, session-based connections).
- **No Installation Required:** Fully functional in any modern web browser.
- **Dynamic Connections:** Connect to any S3-compatible object storage simply by entering your endpoint, credentials, and bucket name in the UI.
- **Universal Storage Compatibility:** Powered by Apache OpenDAL, enabling potential future support for dozens of storage backends (GCS, Azure, WebDAV, etc.).
- **Secure Execution:** Credentials and native Rust binaries execute securely on the server via Next.js Server Actions, keeping your sensitive keys out of the browser.
- **Direct Downloads:** Generates secure, short-lived pre-signed URLs so your browser downloads files directly from the storage bucket, preventing server bottlenecks.
- **Real-time Search:** Lightning-fast, client-side file filtering.

## 🛠️ Tech Stack

- **Frontend:** Next.js (App Router), React, Tailwind CSS, shadcn/ui
- **Core Logic:** Apache OpenDAL (Node.js Binding)
- **Icons:** Lucide React
- **Deployment:** Docker (Multi-stage build)

## ⚙️ Configuration

WebEntog uses environment variables for security and behavior control. Create a `.env` file in the root directory:

| Variable                | Default | Description                                                        |
| :---------------------- | :------ | :----------------------------------------------------------------- |
| `ADMIN_USERNAME`        | `admin` | The username for the login page.                                   |
| `ADMIN_PASSWORD`        | `admin` | The password for the login page.                                   |
| `PERSISTENT_CONNECTION` | `true`  | Set to `false` to disable the login page and database persistence. |

## 🚀 Getting Started (Local Development)

### Prerequisites

- Node.js (v20+ recommended)
- npm or pnpm

### Installation

1. Clone the repository:

```bash
git clone https://github.com/oktapiancaw/webentog.git
cd webentog
```

2. Install dependencies:
   _(Note: Due to React 19 peer dependencies with certain UI libraries, use the legacy flag if using npm)_

```bash
npm install --legacy-peer-deps
```

3. Setup Environment:

```bash
cp .env.example .env # If available, or create manually
```

4. Start the development server:

```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

> **Note on OpenDAL Native Bindings:** If you encounter a `Cannot find native binding` error during installation, clear your `node_modules` and run `npm rebuild` to ensure the Rust binaries for your operating system are downloaded correctly.

## 🐳 Docker Deployment

WebEntog includes a highly optimized, multi-stage Dockerfile that leverages Next.js standalone output and Debian-slim.

1. Build the image:

```bash
docker build -t webentog .
```

2. Run the container:

```bash
docker run -p 3000:3000 \
  -e ADMIN_USERNAME=myuser \
  -e ADMIN_PASSWORD=mypassword \
  -e PERSISTENT_CONNECTION=true \
  webentog
```

The application will be available at `http://localhost:3000`.

## 🔒 Security Note

WebEntog provides a login layer to protect your storage configurations.

- In **Persistent Mode** (`PERSISTENT_CONNECTION=true`), your connection details (endpoints, keys, etc.) are saved to a local SQLite database (`./data/connections.db`).
- In **Non-Persistent Mode** (`PERSISTENT_CONNECTION=false`), the login page is disabled, and the application treats all traffic as authorized, suitable for single-user transient environments.

## 📄 License

WebEntog is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

WebEntog is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

Copyright (C) 2026 Oktapian Candra Adi Wijaya

You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
