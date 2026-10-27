# Pangkalan Remote — pantau & jawab sesi AI dari HP

## Context

Sesi ideasi (`/idea-refine`): apa pembeda Pangkalan dari terminal biasa? Pemakai: developer lain juga (dibagikan). Sukses: menjalankan banyak agen paralel. Sakit utama: review perubahan + akses dari jauh. Budget: 1-3 hari.

Keunggulan unik Pangkalan = server tahu **status semantik** tiap sesi (hooks Claude / heuristik) dan semua sesi hidup di satu proses. Terminal biasa tidak bisa memberi tahu "sesi #3 menunggu izin" ke HP-mu. Pemilik memilih **Remote HP via Tailscale dulu**; adu agen (worktree) jadi fase 2.

## Problem Statement

Bagaimana developer bisa melihat dan menjawab sesi AI yang menunggu input dari HP, tanpa membuka laptop dan tanpa membuka server ke internet?

## Recommended Direction

`tailscale serve` di laptop → HTTPS `https://<mesin>.<tailnet>.ts.net` hanya di tailnet, proxy ke `127.0.0.1:4317`. Server tetap listen di 127.0.0.1 (tidak berubah). Mode remote **mati default**, aktif lewat env.

Gerbang ganda untuk request remote: token (yang sudah ada) **dan** header identitas `Tailscale-User-Login` yang di-set `tailscale serve`, harus cocok allowlist. Request via Tailscale Funnel (publik) tidak membawa header itu → ditolak. Jadi token bocor saja tidak cukup.

UI mobile sudah responsif. Tambahan: bar tombol cepat (`y`, `n`, `Enter`, `Esc`, `↑`, `↓`, `Ctrl+C`) di atas keyboard HP, karena mengetik key khusus di xterm mobile menyiksa.

## Implementasi

### 1. Config remote — `server/src/config.ts`

- Env baru: `PANGKALAN_REMOTE_ORIGIN` (mis. `https://laptop.tail1234.ts.net`) dan `PANGKALAN_REMOTE_USERS` (daftar login dipisah koma, mis. `fazril@github`).
- `ServerConfig` tambah `remote: { origin: string; users: string[] } | null`. Null bila salah satu kosong. Remote origin wajib `https://` dan host berakhiran `.ts.net`, selain itu throw saat start (fail loud).
- `allowedOrigins` ditambah remote origin bila aktif.

### 2. Gerbang identitas — `server/src/security/auth.ts`

- `SecurityOptions` tambah `remote`.
- Di hook `onRequest`, setelah cek Host: bila `request.headers.host === remoteHost`, wajibkan `tailscale-user-login` ada dan ada di `remote.users`, selain itu 403. Berlaku untuk **semua** path (termasuk static), bukan hanya `/api`.
- `/api/hooks/*` tetap hanya dari host lokal: tolak bila datang lewat host remote (Claude memanggil 127.0.0.1, jadi tidak ada yang rusak).
- Log server tiap login remote baru (user + IP) agar ada jejak.

### 3. Startup — `server/src/index.ts`

- Bila remote aktif, cetak juga URL remote bertoken + peringatan singkat: "Remote aktif untuk: <users>. Jalankan: tailscale serve --bg 4317".

### 4. Tombol cepat mobile — `web/src/components/QuickKeys.tsx` (baru)

- Bar tombol, tampil hanya `md:hidden` saat ada sesi aktif. Kirim lewat jalur input WS yang sudah ada (`{ type: 'input', data }` di `web/src/lib/ws-client.ts`; skema `clientMessageSchema` di `shared/src/protocol.ts`).
- Mapping: `y\r`, `n\r`, `\r`, `\x1b`, `\x1b[A`, `\x1b[B`, `\x03`.
- Dipasang di `web/src/components/TerminalPane.tsx` / `App.tsx` di bawah terminal. Ikuti token warna & `icon-btn` dari `web/src/index.css`, tap target ≥44px.

### 5. Notifikasi ke HP

- Notifikasi browser (`web/src/hooks/use-waiting-notifications.ts`) sudah jalan selama tab HP terbuka. **Push saat tab tertutup (Web Push/service worker) tidak dikerjakan** di MVP. Lihat Not Doing.

### 6. Docs

- README: bagian "Akses dari HP (Tailscale)": langkah `tailscale serve`, env, peringatan keamanan.
- Simpan one-pager ini ke `docs/ideas/remote-hp.md` beserta catatan fase 2 (adu agen).

## Key Assumptions to Validate

- [ ] `tailscale serve` (Windows) mengirim header `Tailscale-User-Login` ke backend → cek dengan endpoint debug sementara / log header sekali.
- [ ] `Host` yang diteruskan serve = `<mesin>.<tailnet>.ts.net` (bukan `127.0.0.1`) → bila ternyata 127.0.0.1, gerbang harus pakai header `X-Forwarded-Host`; verifikasi sebelum menulis cek.
- [ ] WebSocket lewat serve HTTPS berjalan (wss) → buka terminal dari HP.
- [ ] xterm di Chrome Android/Safari iOS bisa diketik cukup baik dengan QuickKeys → coba jawab prompt izin Claude dari HP.

## MVP Scope

Masuk: mode remote opt-in, gerbang token + identitas Tailscale, QuickKeys mobile, docs.
Keluar: semuanya di bawah.

## Not Doing (and Why)

- **Web Push saat tab tertutup**: butuh service worker + VAPID + subscription store. Fase 2 bila MVP terbukti dipakai.
- **Bind ke 0.0.0.0 / LAN tanpa Tailscale**: membuka shell ke jaringan tanpa identitas. Tidak akan didukung.
- **Tailscale Funnel (publik)**: ditolak oleh desain, karena tidak ada header identitas.
- **Sistem login/akun sendiri**: identitas didelegasikan ke Tailscale, jadi tidak perlu password store.
- **Adu agen + worktree per sesi**: arah fase 2, bisa pakai CLI berbeda maupun model berbeda (`args` per peserta). Sudah dikerjakan (2026-10-27); lihat bagian "Adu agen" di README.
- **Inbox persetujuan khusus**: sidebar + status dot sudah memberi daftar sesi menunggu. Evaluasi ulang setelah dipakai dari HP.

## Open Questions

- Rotasi token: perlu tombol "cabut semua akses remote" (hapus `data/.token` + restart sudah cukup untuk MVP?)

## Verification

1. Unit (`npm test`): test baru di sebelah test security yang ada:
   - remote nonaktif → host `.ts.net` 403;
   - remote aktif + header user cocok + token → 200;
   - header hilang / user lain → 403;
   - `/api/hooks/*` via host remote → 403;
   - origin remote tidak valid (`http://`, bukan `.ts.net`) → `loadConfig` throw.
2. Regresi: `npm run typecheck`, `npm run lint`, `npm run test:e2e` tetap hijau (localhost tidak berubah).
3. Manual end-to-end: `npm run build && npm start` dengan env remote → `tailscale serve --bg 4317` → buka URL dari HP di tailnet → buat sesi Claude → picu prompt izin → jawab via QuickKeys `y`. Coba juga dari perangkat dengan akun tailnet lain → harus 403.
