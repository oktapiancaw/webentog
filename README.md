# WebEntog 🦆

**Object storage management in your browser.**

Point it at any S3-compatible bucket (AWS, MinIO, Ceph RGW, Garage) and browse, preview, upload, and restore objects without leaving the tab.

---

## What you can do

| | |
| :-- | :-- |
| 📂 **Browse** | Folders first, with a breadcrumb path you can type into |
| 👁️ **Preview** | Images, video, audio, PDF, JSON, and 30+ code/text formats in a side panel you can drag wider |
| 🕓 **Versions** | List every version of an object, restore an old one, or save it out as a new key |
| 📌 **Pins** | Bookmark folders per connection so deep prefixes stay one click away |
| ⬆️ **Upload** | Drag and drop up to 5 files at once |
| ⬇️ **Download** | Single objects, or a whole folder zipped on the fly |
| 🎨 **Themes** | Dark by default, light if you prefer it |

---

## Quick start

```bash
git clone https://github.com/oktapiancaw/webentog.git
cd webentog
npm install --legacy-peer-deps
npm run dev
```

Open <http://localhost:3000>, click **New connection** in the sidebar, and fill in your endpoint, keys, and bucket.

> React 19 peer ranges trip up some UI libraries, hence `--legacy-peer-deps`.

<details>
<summary><b>Hit <code>Cannot find native binding</code>?</b></summary>

OpenDAL ships Rust binaries per platform. Delete `node_modules` and run `npm rebuild` so npm fetches the one matching your OS.

</details>

---

## Configuration

Create a `.env` in the project root:

| Variable | Default | What it does |
| :-- | :-- | :-- |
| `ADMIN_USERNAME` | `admin` | Login username |
| `ADMIN_PASSWORD` | `admin` | Login password |
| `JWT_SECRET` | `secret-change-me` | Signs the session cookie. Change it before you expose the app. |
| `PERSISTENT_CONNECTION` | `true` | Picks where connections and pins live. See below. |

### Two storage modes

<details open>
<summary><b>Persistent</b> (<code>PERSISTENT_CONNECTION=true</code>)</summary>

Your connections and pinned folders go into SQLite at `./data/connections.db`. The login page guards access, and a JWT cookie keeps you signed in for 7 days.

Mount `./data` as a volume so your setup survives a container rebuild. The included `docker-compose.yaml` already does this.

</details>

<details>
<summary><b>Non-persistent</b> (<code>PERSISTENT_CONNECTION=false</code>)</summary>

Nothing reaches disk. SQLite never opens, the login page disappears, and every request counts as authorized. Connections and pins sit in the browser's `sessionStorage`, so closing the tab wipes them.

Use this for a throwaway container or a single-user box behind its own auth.

</details>

---

## Docker

```bash
docker compose up -d
```

Or build it yourself:

```bash
docker build -t webentog .
docker run -p 3000:3000 \
  -e ADMIN_USERNAME=myuser \
  -e ADMIN_PASSWORD=mypassword \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  -e PERSISTENT_CONNECTION=true \
  -v ./data:/app/data \
  webentog
```

The multi-stage build uses Next.js standalone output on Debian slim.

---

## How listing works

Buckets get large, so WebEntog picks a strategy per folder:

- **Under 100 entries:** it reads the whole folder, sorts folders first, and pages in memory. Search covers every object.
- **Over 100 entries:** it pages through S3 cursors, one request per page. Search covers the page you are on.

Large folders show a **Scan all** button. Object storage can list subfolder prefixes after every file key, so a subfolder inside a 10,000-object directory may not surface until you read the whole directory. That button reads it, at one request per 1,000 objects.

The **Count** button in the footer walks the folder to tally objects. It stops at 5,000 and shows `5000+` rather than pretending it finished.

---

## Object versions

Open a file, then click **Versions**.

Restoring writes the chosen version back over the current key, which adds a new version on top rather than deleting history. On a bucket without versioning it overwrites for good, so the confirm dialog says so before you commit.

**Save as** copies a version to a new key and refuses to land on one that already exists.

> Listing versions needs bucket-scoped `s3:ListBucketVersions`, which is broader than the object reads everything else uses. Without it, the dialog shows the current object and explains which grant is missing.

---

## Scripts

```bash
npm run dev     # dev server
npm run build   # production build
npm start       # serve the build
npm run lint    # eslint + prettier
npm test        # node:test, no framework
```

---

## Security

Storage credentials sit unencrypted in `./data/connections.db` under persistent mode. Protect that file the way you would an SSH key: keep it off shared volumes and out of backups you do not control.

Set `JWT_SECRET` to something random. The default signs every session with a string published in this repository.

Presigned preview URLs expire after an hour.

---

## License

WebEntog is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

WebEntog is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

Copyright (C) 2026 Oktapian Candra Adi Wijaya

You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
