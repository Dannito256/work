# WhatsApp Bot (Baileys 7.0.0-rc14)

A modular, secure WhatsApp bot built from scratch with **Baileys `7.0.0-rc14`**, plain JavaScript and ES modules. Authentication uses **pairing code only** (no QR codes).

> Version note: the npm release for this Baileys line is published as `7.0.0-rc14` (no dot before `14`). This project pins that exact version in `package.json`. It is not silently replaced with any other build.

---

## Features

- Pairing-code login only (phone number + 8-character code).
- Saved, reusable credentials in `auth/` (never committed).
- Automatic reconnection, logout handling, credential updates and graceful shutdown.
- Modular command and event loaders (`commands/`, `events/`).
- Group administration, moderation, welcome/goodbye, downloaders, music and AI.
- Real audio/video attachments (never sends raw download URLs as text).
- Persistent per-group settings and warning records in `database/settings.json`.
- Input/URL validation, SSRF protection, timeouts, size limits, rate limiting and safe logging.

---

## Requirements

- **Node.js 20 or newer** (Node 22 recommended). Baileys 7 requires a modern Node runtime.
- A working internet connection.
- A WhatsApp account with one free "Linked devices" slot (pairing code links one companion device).

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file
cp .env.example .env

# 3. Edit .env and set at least OWNER_NUMBER and PHONE_NUMBER

# 4. Start the bot
npm start
```

On first run the bot prints a pairing code:

```
============================================
  PAIRING CODE: ABCD-EFGH
  Open WhatsApp > Linked Devices > Link a device
  > Link with phone number instead, then enter this code.
============================================
```

Steps on your phone:

1. Open WhatsApp.
2. Go to **Settings > Linked devices**.
3. Tap **Link a device**.
4. Tap **Link with phone number instead**.
5. Type the code shown in your terminal.

After pairing, credentials are stored under `auth/` and reused automatically on the next start (no new code needed).

---

## Installation per platform

### Linux

```bash
sudo apt update
sudo apt install -y nodejs npm git
# Optional: install nvm and Node 22 if your distro ships an older Node
git clone <your-repo-url> whatsapp-bot
cd whatsapp-bot
npm install
cp .env.example .env
npm start
```

Run it persistently with `pm2` (optional):

```bash
npm install -g pm2
pm2 start index.js --name whatsapp-bot
pm2 save
```

### Windows

1. Install **Node.js 20+** from nodejs.org (LTS installer).
2. Install **Git** (optional, for cloning).
3. Open **PowerShell** in the project folder:

```powershell
npm install
Copy-Item .env.example .env
notepad .env
npm start
```

### Termux (Android)

```bash
pkg update && pkg upgrade -y
pkg install -y nodejs git
git clone <your-repo-url> whatsapp-bot
cd whatsapp-bot
npm install
cp .env.example .env
nano .env
npm start
```

Keep Termux alive while the bot runs:

```bash
termux-wake-lock
```

Avoid using Termux `rm` on `auth/` unless you truly want to log out.

### Hosting panels (Pterodactyl, Bot-Hosting, etc.)

1. Create a **Node.js** server/egg with Node 20+.
2. Upload the project files (or clone from Git) into the server directory.
3. Set the startup file to `index.js`.
4. Start command: `npm start`.
5. Add your variables from `.env` as panel environment variables (most panels read them automatically). If the panel only shows a `start.bat`/`start.sh`, set it to:

```bash
npm install && npm start
```

Note: free panels often block outbound WebSocket traffic; if the connection keeps failing, use a paid host or a VPS.

---

## Configuration (`.env`)

| Variable | Default | Description |
| --- | --- | --- |
| `BOT_NAME` | `Baileys Bot` | Display name used in menus and messages. |
| `PREFIX` | `.` | Command prefix. |
| `OWNER_NUMBER` | `254700000000` | Owner number in international format, digits only. |
| `OWNER_NAME` | `Owner Name` | Owner display name. |
| `PHONE_NUMBER` | `254700000000` | Number that will be paired. Left empty, the bot asks at startup. |
| `USE_PAIRING_CODE` | `true` | Keep this `true`; this bot does not use QR codes. |
| `SESSION_DIR` | `auth` | Folder for saved credentials. |
| `LOG_LEVEL` | `info` | `trace`, `debug`, `info`, `warn`, `error`, `fatal`. |
| `LOG_PRETTY` | `false` | Human-friendly logs (requires `pino-pretty`, optional). |
| `DATABASE_FILE` | `database/settings.json` | Persistent settings/warnings file. |
| `TEMP_DIR` | `tmp` | Temporary download folder. |
| `CONNECT_TIMEOUT_MS` | `60000` | Socket connect timeout. |
| `DEFAULT_QUERY_TIMEOUT_MS` | `60000` | Default query timeout. |
| `KEEP_ALIVE_INTERVAL_MS` | `30000` | Keep-alive ping interval. |
| `MAX_MEDIA_MB` | `64` | Maximum size for any downloaded media. |
| `DOWNLOAD_TIMEOUT_MS` | `120000` | Media download timeout. |
| `RATE_LIMIT_WINDOW_MS` | `10000` | Rate-limit window per user/chat. |
| `RATE_LIMIT_MAX` | `8` | Max commands per window. |
| `GIFTED_API_KEY` | `gifted` | API key for api.gifted.co.ke (free test key is `gifted`). |
| `GIFTED_BASE_URL` | `https://api.gifted.co.ke` | Gifted base URL. |
| `AZBRY_BASE_URL` | `https://api.azbry.com` | azbry base URL. |
| `VIDSSAVE_ENDPOINT` | VidsSave parse endpoint | VidsSave media parse URL. |
| `VIDSSAVE_AUTH` | `20250901majwlqo` | VidsSave auth value (update when it expires). |
| `VIDSSAVE_DOMAIN` | `api-ak.vidssave.com` | VidsSave domain parameter. |
| `VIDSSAVE_ORIGIN` | `source` | VidsSave origin parameter. |

---

## Commands

Prefix defaults to `.`. All commands appear in `.menu`.

### General
| Command | Description |
| --- | --- |
| `.menu` | Show every available command. |
| `.help [command]` | Help for a specific command. |
| `.ping` | Measure bot latency. |
| `.alive` | Check whether the bot is online. |
| `.runtime` | Show uptime. |
| `.owner` | Show owner contact. |
| `.info` | Technical information. |
| `.jid` | Show chat and sender JIDs. |
| `.time` | Server date and time. |
| `.quote` | Random motivational quote. |
| `.echo <text>` | Repeat your text. |

### Group
| Command | Description |
| --- | --- |
| `.groupinfo` | Group details. |
| `.admins` | List admins. |
| `.members` | List members. |
| `.tagall [msg]` | Mention everyone (admin). |
| `.hidetag [msg]` | Mention everyone without visible tags (admin). |

### Admin (admin + bot must be admin)
| Command | Description |
| --- | --- |
| `.promote @user` | Make a member admin. |
| `.demote @user` | Remove admin rights. |
| `.kick @user` | Remove a member. |
| `.add <number>` | Add a user. |
| `.setname <name>` | Change group name. |
| `.setdesc <text>` | Change group description. |
| `.link` | Get the invite link. |
| `.revoke` | Reset the invite link. |

### Moderation (admin)
| Command | Description |
| --- | --- |
| `.antilink on\|off` | Auto-delete links and warn. |
| `.antispam on\|off` | Auto-delete spam bursts. |
| `.mute on\|off` / `.unmute` | Admins-only chat. |
| `.lock` / `.unlock` | WhatsApp announcement mode. |
| `.delete` / `.del` | Delete the message you replied to. |
| `.warn @user` | Warn a member. |
| `.warnings [@user]` | Show warnings. |
| `.resetwarn @user` | Reset warnings for a member. |
| `.clearwarn` | Clear all warnings in the group. |

### Welcome / Goodbye (admin)
| Command | Description |
| --- | --- |
| `.welcome on\|off` | Toggle welcome messages. |
| `.goodbye on\|off` | Toggle goodbye messages. |

Settings are stored per group in `database/settings.json`.

### Downloader
| Command | Description |
| --- | --- |
| `.alldl <url>` | Download from TikTok, Instagram, YouTube, Facebook and more. |
| `.vidssave <url>` | Same, explicitly using the VidsSave service. |
| `.video <youtube-url> [quality]` | Download a YouTube video as MP4. |

### Music
| Command | Description |
| --- | --- |
| `.play <song name>` | Search and send a song as an MP3 audio file. |

### AI
| Command | Description |
| --- | --- |
| `.ai <question>` | Ask the default model (`deepseek`). |
| `.ai <model> <question>` | Ask a specific model (`deepseek`, `gpt4o`, `claude`). |
| `.ai models` | List available models. |

---

## API integrations (honest notes)

- **`.play`** uses `https://api.azbry.com/api/download/ytplay2?q=<song>`, reads `result.download`, verifies the file is really MP3 (magic bytes) and sends it as an audio attachment. Verified working.
- **`.video`** uses the requested `https://api.gifted.co.ke/api/download/savemp4` with `apikey`, `url` and `quality` (default `720`), and reads `result.download_url`. **Note:** at the time of writing, Gifted's `savenow` streaming proxy returns HTTP 500 (`Failed to stream file`), so the download URL is not always servable. To guarantee the command actually delivers a video, the bot automatically falls back to a second source (`api.azbry.com/api/download/ytmp4`), which is verified working. The bot tries the requested API first and only uses the fallback when delivery fails.
- **`.ai`** uses `https://api.gifted.co.ke/api/ai/overchat` with `apikey`, `q` and `model`. The free test key `gifted` works. The response `result` is a string; `available_models` lists `deepseek`, `gpt4o`, `claude`.
- **`.alldl` / `.vidssave`** use the requested VidsSave endpoint with the form fields `auth`, `domain`, `origin=source`, `link`. **Note:** at the time of writing this endpoint returns `{"status":0,"status_code":"analyze_failed"}` for typical links regardless of platform, which means the supplied `auth` value appears expired or the service is temporarily rejecting requests. The command still implements the exact request and parses whatever media URL the response contains. When VidsSave fails and the link is YouTube, the bot falls back to the working sources above. For non-YouTube links, if VidsSave is rejecting requests there is currently no alternative source configured, so the bot reports the failure honestly instead of pretending success.

Configuration for all of the above lives in `.env`, so you can swap keys/endpoints without touching code.

---

## Project structure

```
index.js                 # Entry point
package.json             # ESM project, "npm start"
.env.example             # Environment template
.gitignore               # Ignores auth/, tmp/, node_modules
README.md
config/config.js         # Loads and validates configuration
lib/connection.js        # Baileys socket, pairing, reconnect, shutdown
lib/handler.js           # Command/event loading, dispatch, moderation
lib/store.js             # Persistent settings and warnings
lib/logger.js            # Pino logger
lib/utils.js             # Helpers (JIDs, URLs, formatting, fetch)
lib/media.js             # Download, validate and send media
commands/general.js      # .menu .ping .alive .owner .help .runtime ...
commands/group.js        # .groupinfo .admins .members .tagall .hidetag
commands/admin.js        # .promote .demote .kick .add .setname ...
commands/moderation.js   # .antilink .warn .warnings .mute .lock ...
commands/downloader.js   # .alldl .vidssave .video
commands/ai.js           # .ai
commands/play.js         # .play
events/welcome.js        # Welcome new members
events/goodbye.js        # Goodbye messages
database/settings.json   # Default persistent data
auth/                    # Session credentials (git-ignored)
tmp/                     # Temporary media (git-ignored)
```

---

## Security notes

- Credentials live in `auth/` and are **never** committed (see `.gitignore`). Treat that folder like a password.
- URLs are validated and private/local addresses are rejected before fetching.
- Downloads are streamed with strict size and time limits, then deleted after sending or on failure.
- Administrative commands require group admin rights; the bot verifies its own admin rights before acting.
- Anti-link and anti-spam features store warnings persistently and auto-remove members at the warning limit.
- Never share your `.env` or `auth/` folder. If your session is compromised, log out from WhatsApp > Linked devices.

---

## Troubleshooting

- **"Connection closed" loops:** usually a network/panel issue. Check the logs at `LOG_LEVEL=debug`.
- **Pairing code fails:** make sure the number has the country code and no `+`, `(`, `)` or `-`, and that you have a free linked-device slot.
- **`badSession` / `loggedOut`:** remove the `auth/` folder contents and pair again.
- **`pino-pretty` missing when `LOG_PRETTY=true`:** `npm install pino-pretty` or set `LOG_PRETTY=false`.
- **Media never arrives:** the upstream API may be down. Check the bot's reply for the exact error.

---

## Disclaimer

This project is provided for educational and personal automation use. You are responsible for complying with WhatsApp's Terms of Service and all applicable laws. Using unofficial libraries with WhatsApp can lead to account restrictions; use at your own risk.
