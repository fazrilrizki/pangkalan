# Spec: Integrasi AI — Web Terminal Hub untuk AI CLI

Status: **DRAFT — menunggu review**
Tanggal: 2026-10-26

## Objective

Web app yang jalan di **localhost** untuk menjalankan AI CLI agent (Claude Code, Antigravity, dan CLI lain via config) di **terminal asli dalam tab browser**. Tujuannya menghilangkan kebiasaan ganti-ganti terminal, `cd` ke folder project, dan cek tab satu per satu.

**User:** developer tunggal (pemilik), Windows 11, laptop sendiri. Kelak mungkin dibuka ke user lain; desain v1 tidak boleh menutup jalan itu (misal: logika sesi tidak di-hardcode ke satu user global), tapi v1 **tidak** membangun multi-user.

**Sukses:** pemilik pakai app ini harian untuk kerja dengan agent, tidak buka Windows Terminal lagi untuk itu.

### User Stories

1. **Project sidebar** — Sebagai user, saya tambah project (pilih folder lewat explorer di app), lihat daftarnya di sidebar, hapus/rename, tandai favorit.
2. **Buka sesi** — Saya klik project → pilih CLI → tab terminal baru terbuka dengan CLI jalan di folder project itu.
3. **Multi-tab** — Saya punya banyak tab sekaligus (project/CLI berbeda), pindah antar tab tanpa sesi lain terganggu.
4. **Status animasi** — Tiap tab (dan entri sidebar) tampil status: `working` (denyut biru), `waiting` (glow kuning berkedip), `idle` (hijau statis), `exited/error` (merah).
5. **Notifikasi** — Saat sesi masuk `waiting` dan tab itu tidak aktif / browser tidak fokus → notifikasi browser.
6. **Sesi persisten** — Refresh atau tutup browser tidak membunuh proses. Buka lagi → tab muncul kembali, scrollback terakhir ter-replay, input tersambung lagi.
7. **CLI via config** — Saya tambah CLI baru (nama, command, args, ikon, warna) di file config tanpa ubah kode. Claude Code & Antigravity = preset bawaan.
8. **Tutup sesi** — Saya bisa kill sesi secara eksplisit (konfirmasi dulu).

## Assumptions (koreksi jika salah)

1. Stack: Node.js + TypeScript penuh (backend & frontend) — node-pty paling matang untuk PTY di Windows (ConPTY).
2. Frontend React + Vite + xterm.js. Styling Tailwind CSS.
3. Persistensi sesi = proses PTY hidup di **backend server**, bukan browser. Server mati → sesi mati (v1 tidak survive restart server).
4. Data (project list, config CLI) disimpan di file JSON lokal, bukan database.
5. Shell default Windows: PowerShell. CLI dijalankan lewat shell agar PATH/alias user berlaku.
6. Login/API key tiap CLI memakai yang sudah ada di laptop. App tidak menyimpan kredensial.
7. Browser target: Chrome/Edge terbaru.

## Tech Stack

| Layer        | Pilihan                                            | Catatan             |
| ------------ | -------------------------------------------------- | ------------------- |
| Runtime      | Node.js 24 (sudah terpasang: v24.0.1)              |                     |
| Bahasa       | TypeScript 5.x, strict                             |                     |
| Backend HTTP | Fastify 5                                          | REST + static serve |
| WebSocket    | `@fastify/websocket`                               | stream I/O terminal |
| PTY          | `node-pty` (atau fork prebuilt `@lydell/node-pty`) | lihat Risiko #1     |
| Frontend     | React 19 + Vite 6                                  |                     |
| Terminal UI  | `@xterm/xterm` + addon `fit`, `web-links`, `webgl` |                     |
| Styling      | Tailwind CSS 4 + Framer Motion (animasi status)    |                     |
| State FE     | Zustand                                            | ringan              |
| Validasi     | Zod (config & payload API)                         |                     |
| Test         | Vitest (unit/integration), Playwright (e2e)        |                     |

Versi pasti dikunci saat setup di `package.json`.

## Arsitektur

```
Browser (React)                         Backend (Node, 127.0.0.1:4317)
┌───────────────────────┐   REST    ┌──────────────────────────────┐
│ Sidebar project       │──────────▶│ ProjectStore  (JSON file)    │
│ Tab bar + status anim │           │ CliRegistry   (config JSON)  │
│ xterm.js per tab      │◀────WS───▶│ SessionManager               │
└───────────────────────┘  I/O +    │   ├ Session (node-pty)       │
                           status   │   ├ ring buffer scrollback   │
                                    │   └ StatusDetector           │
                 Claude Code hooks ─▶│ POST /api/hooks/:sessionId   │
                                    └──────────────────────────────┘
```

### Status detection

- **Heuristik (semua CLI):** output mengalir dalam N ms terakhir → `working`; diam > T ms → `idle`; diam + output terakhir cocok regex `waitingPatterns` CLI (dari config) → `waiting`; proses exit → `exited` (kode ≠ 0 → `error`).
- **Hooks (Claude Code):** saat spawn, backend inject hooks `Notification` → `waiting`, `Stop` → `idle`, `UserPromptSubmit` → `working`, yang memanggil `POST /api/hooks/:sessionId`. Sinyal hook mengalahkan heuristik. Mekanisme injeksi persis (flag `--settings` vs file settings sementara) **diverifikasi ke dokumentasi resmi saat implementasi**.
- Config tiap CLI menyatakan `statusMode: "hooks" | "heuristic"`.

### Persistensi sesi

- Session hidup di `SessionManager` terlepas dari koneksi WS.
- Ring buffer scrollback per sesi (default 1 MB). Reconnect → kirim buffer → lanjut stream live.
- Daftar sesi aktif diambil FE via `GET /api/sessions` saat load → tab dipulihkan.
- Banyak klien boleh attach ke sesi yang sama (dua tab browser) — semua terima output; resize ikut klien terakhir yang aktif.

### Config CLI (`data/clis.json`, contoh)

```json
{
  "clis": [
    {
      "id": "claude",
      "name": "Claude Code",
      "command": "claude",
      "args": [],
      "icon": "claude.svg",
      "color": "#D97757",
      "statusMode": "hooks",
      "waitingPatterns": []
    },
    {
      "id": "antigravity",
      "name": "Antigravity",
      "command": "TBD",
      "args": [],
      "icon": "antigravity.svg",
      "color": "#4285F4",
      "statusMode": "heuristic",
      "waitingPatterns": ["\\?\\s*$", "\\(y/n\\)"]
    }
  ]
}
```

Config divalidasi Zod saat start; entri invalid → ditolak dengan pesan jelas, entri lain tetap jalan. Perubahan file di-reload tanpa restart (file watch).

## API (ringkas)

| Method | Path                    | Fungsi                                             |
| ------ | ----------------------- | -------------------------------------------------- |
| GET    | `/api/projects`         | list project                                       |
| POST   | `/api/projects`         | tambah `{name, path}` — path harus folder yang ada |
| PATCH  | `/api/projects/:id`     | rename / favorit                                   |
| DELETE | `/api/projects/:id`     | hapus dari list (tidak menyentuh folder)           |
| GET    | `/api/fs/dirs?path=`    | isi subfolder untuk folder picker (default: home)  |
| GET    | `/api/clis`             | list CLI dari config                               |
| GET    | `/api/sessions`         | list sesi aktif + status                           |
| POST   | `/api/sessions`         | buat sesi `{projectId, cliId}`                     |
| DELETE | `/api/sessions/:id`     | kill sesi                                          |
| POST   | `/api/hooks/:sessionId` | sinyal status dari hooks CLI                       |
| WS     | `/ws/sessions/:id`      | I/O terminal + event status                        |

Pesan WS (JSON): klien → `{type:"input",data}` · `{type:"resize",cols,rows}`; server → `{type:"output",data}` · `{type:"status",status}` · `{type:"exit",code}` · `{type:"replay",data}`.

## Commands

```
Install:    npm install
Dev:        npm run dev          # backend (tsx watch) + frontend (vite) paralel
Build:      npm run build        # tsc + vite build
Start:      npm start            # serve hasil build di http://127.0.0.1:4317
Test:       npm test             # vitest run
Test watch: npm run test:watch
E2E:        npm run test:e2e     # playwright
Lint:       npm run lint         # eslint
Typecheck:  npm run typecheck    # tsc --noEmit
```

## Project Structure

```
integrasi-ai/
├── SPEC.md
├── package.json              → workspace root (npm workspaces)
├── data/                     → runtime data, gitignored kecuali contoh
│   ├── clis.json
│   └── projects.json
├── server/
│   ├── src/
│   │   ├── index.ts          → bootstrap Fastify
│   │   ├── routes/           → REST + WS handler
│   │   ├── sessions/         → SessionManager, Session, RingBuffer, StatusDetector
│   │   ├── projects/         → ProjectStore
│   │   ├── clis/             → CliRegistry + schema Zod
│   │   └── security/         → token & origin check
│   └── test/
├── web/
│   ├── src/
│   │   ├── components/       → Sidebar, TabBar, TerminalPane, StatusDot, ...
│   │   ├── stores/           → Zustand store
│   │   ├── lib/              → api client, ws client
│   │   └── App.tsx
│   └── test/
├── shared/                   → tipe & schema yang dipakai server + web
└── e2e/                      → Playwright
```

## Code Style

- TypeScript strict, ESM, tanpa `any` (pakai `unknown` + narrowing).
- File: `kebab-case.ts`; komponen React: `PascalCase.tsx`; fungsi/variabel `camelCase`; tipe `PascalCase`.
- Prettier default (2 spasi, single quote, trailing comma).
- Tipe & schema bersama di `shared/`, satu sumber kebenaran.

```ts
// server/src/sessions/status-detector.ts
export type SessionStatus = 'working' | 'waiting' | 'idle' | 'exited' | 'error';

export function detectStatus(input: {
  msSinceLastOutput: number;
  lastChunk: string;
  waitingPatterns: RegExp[];
  idleAfterMs: number;
}): SessionStatus {
  if (input.msSinceLastOutput < input.idleAfterMs) return 'working';
  const waiting = input.waitingPatterns.some((p) => p.test(input.lastChunk));
  return waiting ? 'waiting' : 'idle';
}
```

## UI / UX

- Dark theme default, aksen per-CLI dari `color` config.
- Layout: sidebar kiri (project + sesi per project), tab bar atas, terminal penuh di area utama.
- Animasi status: `working` = denyut biru, `waiting` = glow kuning berkedip, `idle` = hijau statis, `exited/error` = merah. Hormati `prefers-reduced-motion` (animasi diganti ikon statis).
- Shortcut keyboard: `Ctrl+Alt+T` sesi baru (project & CLI sama dengan tab aktif), `Ctrl+Alt+]` / `Ctrl+Alt+[` pindah tab, `Ctrl+Alt+1…9` lompat ke tab, `Ctrl+Alt+W` tutup tab (minta konfirmasi kill). _Revisi 2026-10-26: rencana awal `Ctrl+Shift+T/W` dan `Ctrl+Tab` dipakai Chrome sendiri sehingga tidak bisa ditangkap halaman._
- Terminal mendapat fokus otomatis saat tab aktif; shortcut app tidak boleh menelan input yang dibutuhkan CLI.

## Security (wajib walau localhost)

Server ini bisa menjalankan perintah shell, jadi situs web lain yang terbuka di browser tidak boleh bisa mengaksesnya.

- Bind hanya `127.0.0.1`, tidak pernah `0.0.0.0`.
- Token acak dibuat saat server start; dicetak di console sebagai URL `http://127.0.0.1:4317/?token=...`. Semua REST & WS wajib token (header / query WS).
- Validasi header `Origin` di WS dan REST — tolak origin selain app sendiri (cegah cross-site WebSocket hijacking & DNS rebinding; cek juga header `Host`).
- Endpoint hooks pakai secret per-sesi, bukan token utama.
- `command` CLI hanya dari file config, tidak pernah dari payload API.
- Path project divalidasi: harus folder yang ada.

## Testing Strategy

| Level       | Tool                                     | Cakupan                                                                                 |
| ----------- | ---------------------------------------- | --------------------------------------------------------------------------------------- |
| Unit        | Vitest                                   | `StatusDetector`, `RingBuffer`, schema config, `ProjectStore`                           |
| Integration | Vitest + Fastify inject + node-pty nyata | spawn sesi `powershell -c echo`, WS stream, reconnect replay, auth token/origin ditolak |
| E2E         | Playwright                               | tambah project → buka sesi → ketik → refresh → output masih ada → status berubah        |

- Test di `server/test`, `web/test`, `e2e/`.
- Target coverage logika server ≥ 80% (sessions, security). UI tidak dikejar angka coverage.
- Test integrasi pakai CLI dummy (script Node yang meniru prompt/menunggu input), bukan Claude asli.

## Boundaries

- **Always:** jalankan `npm test` + `npm run typecheck` sebelum commit; validasi semua input API dengan Zod; bind 127.0.0.1; cek token & Origin.
- **Ask first:** tambah dependency di luar Tech Stack; ubah format file `data/*.json`; ubah port default; apa pun yang menyimpan kredensial.
- **Never:** jalankan command dari payload API; listen di `0.0.0.0`; commit `data/projects.json` asli atau secret; hapus/skip test yang gagal tanpa persetujuan; menyentuh isi folder project user selain membuka CLI di sana.

## Success Criteria

1. `npm start` → buka URL bertoken → UI tampil < 2 dtk.
2. Tambah project via folder picker → muncul di sidebar, tersimpan setelah restart server.
3. Klik project → pilih Claude Code → terminal muncul dengan `claude` jalan di folder itu, interaktif penuh (warna, slash command, approval, resize).
4. Bisa ≥ 5 sesi paralel tanpa input/output tercampur.
5. Refresh browser → semua tab pulih, scrollback terakhir tampil, input jalan lagi dalam < 1 dtk.
6. Claude Code minta approval → tab berubah `waiting` (glow kuning) ≤ 1 dtk + notifikasi browser jika tab tidak aktif.
7. Tambah entri CLI baru di `data/clis.json` → muncul di picker tanpa restart.
8. Request tanpa token atau dari Origin asing → ditolak (401/403), dibuktikan test.
9. Semua test & typecheck hijau.

## Out of Scope (v1)

Login/auth multi-user · deploy ke server · chat UI custom (mode headless) · file editor / diff viewer · mengelola API key / login CLI · sesi selamat dari restart server · split pane · mobile layout.

## Risiko

1. **node-pty di Windows + Node 24** butuh native build (VS Build Tools + Python) jika tidak ada prebuilt. Mitigasi: coba `@lydell/node-pty` (prebuilt) dulu; spike di task pertama.
2. **Antigravity CLI** — nama command & perilaku prompt belum diketahui; status heuristik bisa kurang akurat.
3. **Heuristik `waiting`** bisa false positive/negative; regex per-CLI bisa di-tune lewat config.

## Open Questions

1. **Antigravity:** command apa yang kamu ketik di terminal untuk menjalankannya? (perlu untuk preset)
2. **Lokasi data:** `data/` di folder app (default spec ini) atau `~/.integrasi-ai/` di home user?
3. **Shell:** PowerShell 5.1 bawaan, PowerShell 7 (`pwsh`), atau Git Bash?
4. **Port:** `4317` oke?
5. **Tutup tab** = kill proses, atau hanya sembunyikan (sesi tetap jalan di background)? Default spec: tanya konfirmasi lalu kill.
