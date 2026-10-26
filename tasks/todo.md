# Todo: Integrasi AI — Web Terminal Hub

Rencana & alasan: `tasks/plan.md`. Spec: `SPEC.md`.
Setiap task juga wajib lolos Definition of Done (`.claude/references/definition-of-done.md`, bagian Correctness & Quality).

Perintah standar verifikasi: `npm test` · `npm run typecheck` · `npm run lint` · `npm run build`.

---

## Phase 1: Foundation

### Task 1: Scaffold monorepo + tooling

**Description:** Siapkan npm workspaces `server/`, `web/`, `shared/` dengan TypeScript strict, Vitest, ESLint, Prettier, dan script `dev`/`build`/`test`/`typecheck`/`lint`. Server Fastify minimal dengan `GET /api/health`; web Vite + React menampilkan halaman kosong ber-Tailwind. `git init` + `.gitignore` (minta izin dulu).

**Acceptance criteria:**

- [ ] `npm run dev` menjalankan server (127.0.0.1:4317) dan Vite bersamaan; `GET /api/health` → `{ok:true}`
- [ ] Web memanggil `/api/health` lewat proxy Vite dan menampilkan status
- [ ] Semua script di Commands spec ada dan berjalan

**Verification:**

- [ ] `npm test` (1 test health via Fastify inject) hijau
- [ ] `npm run typecheck && npm run lint && npm run build` hijau
- [ ] Manual: buka http://127.0.0.1:5173, lihat "server ok"

**Dependencies:** None
**Files likely touched:** `package.json`, `tsconfig.base.json`, `server/src/index.ts`, `web/src/App.tsx`, `.gitignore` (+ config tool)
**Estimated scope:** M (config banyak, logika sedikit)

---

### Task 2: Spike node-pty di Windows/Node 24

**Description:** Pastikan PTY bisa dipakai. Coba `@lydell/node-pty` dulu, lalu `node-pty`. Bungkus dalam `server/src/sessions/pty.ts` (interface tipis `spawnPty({file,args,cwd,cols,rows,env})`) agar paket bisa diganti. Catat hasil di `tasks/plan.md`.

**Acceptance criteria:**

- [ ] Satu paket PTY terpasang tanpa error di mesin ini
- [ ] Spawn `powershell.exe` → tulis `echo hello` → output berisi `hello`; resize tidak error; kill → event exit
- [ ] Bila kedua paket gagal: STOP, laporkan error persis, tanya pemilik

**Verification:**

- [ ] `npm test -w server -- pty` (integration test nyata) hijau
- [ ] Keputusan paket tercatat di plan

**Dependencies:** T1
**Files likely touched:** `server/package.json`, `server/src/sessions/pty.ts`, `server/test/pty.test.ts`
**Estimated scope:** S

---

### Task 3: Security layer

**Description:** Server bind hanya `127.0.0.1`. Token acak (32 byte) dibuat saat start, dicetak sebagai URL `http://127.0.0.1:4317/?token=...`. Hook Fastify memvalidasi token (header `Authorization: Bearer` atau query `token` khusus WS), header `Host` (`127.0.0.1:PORT`/`localhost:PORT`), dan `Origin` (harus origin app; dev: juga Vite 5173). Web menyimpan token dari query ke `sessionStorage` lalu menghapusnya dari URL.

**Acceptance criteria:**

- [ ] Request tanpa/salah token → 401; Origin asing → 403; Host asing → 403
- [ ] `/api/health` tetap butuh token (tidak ada endpoint terbuka selain asset statis)
- [ ] Web dengan token valid tetap bisa memanggil API

**Verification:**

- [ ] `npm test -w server -- security` (≥ 6 kasus: ok, no token, bad token, bad origin, bad host, WS tanpa token) hijau
- [ ] Manual: `curl http://127.0.0.1:4317/api/health` → 401

**Dependencies:** T1
**Files likely touched:** `server/src/security/auth.ts`, `server/src/index.ts`, `server/test/security.test.ts`, `web/src/lib/api.ts`
**Estimated scope:** M

---

### Checkpoint A: Foundation

- [ ] `npm test`, `npm run typecheck`, `npm run lint` hijau
- [ ] Paket PTY terpilih & terbukti
- [ ] Security test hijau

---

## Phase 2: Core flow

### Task 4: Session backend (SessionManager + RingBuffer + REST + WS)

**Description:** `RingBuffer` (batas byte, default 1 MB). `Session` membungkus PTY + buffer + daftar klien WS. `SessionManager` membuat/list/kill sesi. Endpoint `POST/GET/DELETE /api/sessions` (sementara `POST` menerima `{cwd}` dan menjalankan shell default — CLI & project datang di T6/T7) dan `WS /ws/sessions/:id` dengan protokol pesan spec. Attach → kirim `replay` isi buffer, lalu stream `output`.

**Acceptance criteria:**

- [ ] Buat sesi → WS input `echo hi\r` → terima output `hi`
- [ ] Putus WS → sambung lagi → `replay` berisi output sebelumnya, input jalan lagi
- [ ] Dua klien attach sesi yang sama → keduanya terima output; payload invalid ditolak Zod

**Verification:**

- [ ] `npm test -w server -- sessions` (unit RingBuffer + integration WS nyata) hijau
- [ ] `npm run typecheck` hijau

**Dependencies:** T2, T3
**Files likely touched:** `server/src/sessions/ring-buffer.ts`, `server/src/sessions/session-manager.ts`, `server/src/routes/sessions.ts`, `shared/src/protocol.ts`, `server/test/sessions.test.ts`
**Estimated scope:** M

---

### Task 5: Terminal UI satu sesi

**Description:** Komponen `TerminalPane` (xterm.js + fit + web-links + webgl fallback canvas) yang attach ke sesi via WS client dengan auto-reconnect. Tombol sementara "Sesi baru" membuat sesi PowerShell di folder app.

**Acceptance criteria:**

- [ ] PowerShell interaktif penuh di browser: warna, Ctrl+C, resize jendela mengikuti
- [ ] Refresh halaman → terminal sama muncul dengan scrollback (id sesi disimpan sementara di URL/sessionStorage)
- [ ] Manual: jalankan `claude` di terminal ini → UI Claude tampil & bisa dipakai

**Verification:**

- [ ] `npm test -w web` (unit WS client: reconnect & parsing pesan) hijau
- [ ] `npm run build` hijau
- [ ] Manual check tiga poin di atas

**Dependencies:** T4
**Files likely touched:** `web/src/components/TerminalPane.tsx`, `web/src/lib/ws-client.ts`, `web/src/App.tsx`, `web/test/ws-client.test.ts`
**Estimated scope:** M

---

### Task 6: CLI registry via config

**Description:** Schema Zod CLI di `shared/` (`id,name,command,args,icon,color,statusMode,waitingPatterns,enabled`) + `shell` global. `CliRegistry` membaca `data/clis.json` (buat dari `data/clis.example.json` jika belum ada), file-watch & reload; entri invalid di-skip dengan log jelas. `GET /api/clis`. `POST /api/sessions` sekarang menerima `cliId` dan menjalankan `shell -NoLogo -Command <command args>`. Picker CLI sederhana di UI.

**Acceptance criteria:**

- [ ] Preset Claude Code (enabled) & Antigravity (`enabled:false`, command placeholder) tersedia
- [ ] Ubah `data/clis.json` → `GET /api/clis` berubah tanpa restart; entri rusak tidak menjatuhkan entri lain
- [ ] `cliId` tak dikenal/disabled → 400; command tidak pernah diterima dari payload

**Verification:**

- [ ] `npm test -w server -- clis` (schema, reload, invalid entry, unknown cliId) hijau
- [ ] Manual: pilih Claude Code → `claude` jalan

**Dependencies:** T5
**Files likely touched:** `shared/src/cli-schema.ts`, `server/src/clis/cli-registry.ts`, `server/src/routes/clis.ts`, `data/clis.example.json`, `server/test/clis.test.ts`
**Estimated scope:** M

---

### Task 7: Project store + sidebar

**Description:** `ProjectStore` (JSON `data/projects.json`, tulis atomik: tmp + rename). REST `GET/POST/PATCH/DELETE /api/projects`; path wajib folder yang ada. Sidebar: daftar project (favorit di atas), form tambah (input path), rename, hapus (konfirmasi), klik → picker CLI → `POST /api/sessions {projectId, cliId}` dengan `cwd` = path project.

**Acceptance criteria:**

- [ ] Tambah project path valid → muncul di sidebar & bertahan setelah restart server; path tidak ada → error jelas di UI
- [ ] Rename/favorit/hapus bekerja; hapus tidak menyentuh folder di disk
- [ ] Klik project → pilih Claude → `claude` jalan dengan cwd folder project (cek via `/status` atau `pwd`)

**Verification:**

- [ ] `npm test -w server -- projects` (CRUD, path invalid, persist) hijau
- [ ] Manual: alur tiga poin di atas

**Dependencies:** T5 (bisa paralel dengan T6; integrasi `cliId` setelah T6)
**Files likely touched:** `server/src/projects/project-store.ts`, `server/src/routes/projects.ts`, `web/src/components/Sidebar.tsx`, `web/src/stores/app-store.ts`, `server/test/projects.test.ts`
**Estimated scope:** M

---

### Task 8: Multi-tab + pemulihan sesi

**Description:** `TabBar` + store Zustand untuk banyak sesi. Satu `TerminalPane` per sesi tetap ter-mount (disembunyikan saat tidak aktif) agar tidak kehilangan state. Saat load: `GET /api/sessions` → buat tab untuk tiap sesi aktif → attach & replay. Sidebar menampilkan sesi di bawah project-nya.

**Acceptance criteria:**

- [ ] ≥ 5 sesi paralel, output tidak tercampur, pindah tab tidak mengganggu sesi lain
- [ ] Tutup browser lalu buka lagi → semua tab pulih dengan scrollback, input jalan < 1 dtk
- [ ] Tab menampilkan nama project + ikon/warna CLI

**Verification:**

- [ ] `npm test -w web` (store: add/remove/restore tab) hijau
- [ ] Manual: 5 sesi, refresh, cek tiap tab

**Dependencies:** T6, T7
**Files likely touched:** `web/src/components/TabBar.tsx`, `web/src/stores/app-store.ts`, `web/src/App.tsx`, `web/test/app-store.test.ts`
**Estimated scope:** M

---

### Task 9: Kill sesi, tutup tab, penanganan exit

**Description:** Tutup tab → dialog konfirmasi (custom, bukan `window.confirm`) → `DELETE /api/sessions/:id` → kill pohon proses (bukan hanya shell). Proses exit sendiri → event `exit{code}` → tab menampilkan status exited/error + tombol "Jalankan ulang" & "Tutup". Sesi exit dibersihkan dari manager setelah klien menutup tab.

**Acceptance criteria:**

- [ ] Kill menghentikan CLI anak (tidak ada proses `claude` yatim — cek Task Manager / `Get-Process`)
- [ ] CLI keluar sendiri → tab merah/abu + kode exit tampil; "Jalankan ulang" membuat sesi baru di project & CLI yang sama
- [ ] Batal di dialog → sesi tetap hidup

**Verification:**

- [ ] `npm test -w server -- sessions` (kill, exit event, cleanup) hijau
- [ ] Manual: kill sesi Claude, cek proses

**Dependencies:** T8
**Files likely touched:** `server/src/sessions/session-manager.ts`, `web/src/components/ConfirmDialog.tsx`, `web/src/components/TabBar.tsx`, `server/test/sessions.test.ts`
**Estimated scope:** M

---

### Checkpoint B: Core flow

- [ ] Semua test, typecheck, lint, build hijau
- [ ] Alur utama: tambah project → Claude Code → kerja → refresh → pulih
- [ ] Review dengan pemilik sebelum Phase 3

---

## Phase 3: Status & notifikasi

### Task 10: Status heuristik + animasi StatusDot

**Description:** `StatusDetector` (fungsi murni, lihat Code Style spec) dijalankan per sesi dengan timer; perubahan status dikirim `{type:"status"}` ke semua klien & ikut di `GET /api/sessions`. Komponen `StatusDot` (Framer Motion) di tab & sidebar: working=denyut biru, waiting=glow kuning berkedip, idle=hijau statis, exited/error=merah.

**Acceptance criteria:**

- [ ] Fake CLI yang mencetak terus → `working`; diam → `idle`; mencetak `(y/n)` lalu diam → `waiting`
- [ ] Status konsisten antara tab dan sidebar, dan setelah refresh
- [ ] Event status hanya dikirim saat berubah (tidak spam)

**Verification:**

- [ ] `npm test -w server -- status` (unit detector + integration fake CLI) hijau
- [ ] Manual: lihat animasi tiap status

**Dependencies:** T9
**Files likely touched:** `server/src/sessions/status-detector.ts`, `server/src/sessions/session-manager.ts`, `web/src/components/StatusDot.tsx`, `server/test/status.test.ts`, `server/test/fixtures/fake-cli.mjs`
**Estimated scope:** M

---

### Task 11: Claude Code hooks

**Description:** Langkah pertama: verifikasi di dokumentasi resmi Claude Code cara meng-inject hooks per proses (`--settings <file>` atau alternatif) dan nama event (`Notification`, `Stop`, `UserPromptSubmit`). Saat spawn CLI `statusMode:"hooks"`, server membuat file settings sementara per sesi berisi hooks yang memanggil `POST /api/hooks/:sessionId` dengan secret per-sesi. Sinyal hook override heuristik.

**Acceptance criteria:**

- [ ] Claude minta approval → status `waiting` ≤ 1 dtk; selesai menjawab → `idle`; submit prompt → `working`
- [ ] Secret salah / sesi tak dikenal → 401/404; file settings sementara dihapus saat sesi berakhir
- [ ] Settings user sendiri (`~/.claude/settings.json`) tidak diubah
- [ ] Bila injeksi tidak didukung: STOP, laporkan, fallback heuristik

**Verification:**

- [ ] `npm test -w server -- hooks` (endpoint + override) hijau
- [ ] Manual dengan `claude` asli: minta edit file → lihat glow kuning

**Dependencies:** T10
**Files likely touched:** `server/src/sessions/claude-hooks.ts`, `server/src/routes/hooks.ts`, `server/src/sessions/session-manager.ts`, `server/test/hooks.test.ts`
**Estimated scope:** M

---

### Task 12: Notifikasi browser

**Description:** Minta izin Notification API lewat tombol (bukan otomatis saat load). Saat sesi berubah ke `waiting` dan (tab tidak aktif ATAU dokumen tidak fokus) → notifikasi "⏳ {project} · {CLI} menunggu input"; klik → fokus tab tersebut. Toggle on/off disimpan di localStorage (try/catch).

**Acceptance criteria:**

- [ ] Notifikasi muncul hanya untuk sesi yang tidak sedang dilihat
- [ ] Klik notifikasi → window fokus & tab sesi aktif
- [ ] Izin ditolak / localStorage gagal → app tetap jalan tanpa error

**Verification:**

- [ ] `npm test -w web -- notify` (logika kapan notifikasi dikirim) hijau
- [ ] Manual: dua tab, buat yang tidak aktif masuk waiting

**Dependencies:** T10 (paralel dengan T11)
**Files likely touched:** `web/src/lib/notify.ts`, `web/src/components/NotifyToggle.tsx`, `web/test/notify.test.ts`
**Estimated scope:** S

---

### Checkpoint C: Status

- [ ] Semua test hijau
- [ ] Success Criteria #6 spec terbukti dengan Claude asli
- [ ] Review dengan pemilik

---

## Phase 4: Polish & verifikasi

### Task 13: Polish UI

**Description:** Pakai skill `frontend-ui-engineering`. Dark theme dengan token warna, aksen per-CLI dari config, transisi tab/sidebar halus, empty state ("Tambah project pertama"), `prefers-reduced-motion` → animasi status jadi ikon statis, shortcut `Ctrl+Shift+T/W`, `Ctrl+Tab`, `Ctrl+Shift+Tab` yang tidak menelan input terminal. Fokus keyboard & label aksesibel.

**Acceptance criteria:**

- [ ] Shortcut bekerja; input terminal biasa (Ctrl+C, Ctrl+R, dll) tetap sampai ke CLI
- [ ] Reduced-motion menonaktifkan animasi berdenyut/berkedip
- [ ] Semua tombol ikon punya label aksesibel; navigasi keyboard sidebar → tab → terminal

**Verification:**

- [ ] `npm run build && npm run lint` hijau
- [ ] Manual: review visual bersama pemilik

**Dependencies:** T12
**Files likely touched:** `web/src/index.css`, `web/src/components/*.tsx`, `web/src/lib/shortcuts.ts`
**Estimated scope:** M

---

### Task 14: E2E Playwright + sapu Success Criteria

**Description:** Playwright e2e memakai fake CLI: tambah project → buka sesi → ketik → status berubah → refresh → output & tab pulih → kill. Ditambah cek otomatis/manual tiap 9 Success Criteria spec (termasuk 5 sesi paralel dan timing), hasil dicatat di `tasks/verification.md`.

**Acceptance criteria:**

- [ ] `npm run test:e2e` hijau di mesin ini
- [ ] Tiap Success Criteria spec punya bukti (test name atau langkah manual + hasil)
- [ ] Kegagalan dicatat jujur, tidak di-skip

**Verification:**

- [ ] `npm run test:e2e` hijau
- [ ] `tasks/verification.md` lengkap

**Dependencies:** T13
**Files likely touched:** `e2e/main-flow.spec.ts`, `playwright.config.ts`, `tasks/verification.md`
**Estimated scope:** S

---

### Task 15: README + preset Antigravity

**Description:** README: cara install, start, buka URL bertoken, menambah CLI di `data/clis.json` (contoh lengkap), troubleshooting node-pty. Isi preset Antigravity setelah pemilik memberi command-nya, lalu `enabled:true` dan tune `waitingPatterns`.

**Acceptance criteria:**

- [ ] Orang baru bisa menjalankan app dari README saja
- [ ] Antigravity bisa dipilih & jalan (atau tercatat jelas masih menunggu command)

**Verification:**

- [ ] Manual: ikuti README dari clone bersih
- [ ] Manual: sesi Antigravity jalan

**Dependencies:** T14, jawaban pemilik soal command Antigravity
**Files likely touched:** `README.md`, `data/clis.example.json`
**Estimated scope:** S

---

### Checkpoint D: Complete

- [ ] 9 Success Criteria spec terpenuhi
- [ ] Definition of Done terpenuhi
- [ ] Review akhir pemilik
