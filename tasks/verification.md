# Verifikasi Success Criteria — SPEC.md

Tanggal: 2026-10-26 · Mesin: Windows 11, Node v24.0.1, Chrome (channel `chrome` untuk Playwright)

Hasil suite terakhir: server 62 test ✓ · web 22 test ✓ · e2e 4 test ✓ · `typecheck` ✓ · `lint` ✓ · `build` ✓

| #   | Kriteria                                               | Status                                  | Bukti                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------ | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `npm start` → URL bertoken → UI tampil < 2 dtk         | ✓ (waktu tidak diukur presisi)          | E2E memakai server production (`e2e/start-server.mjs`) dan memuat halaman di tiap test tanpa timeout; manual di dev juga terasa instan. Belum ada angka load awal yang terukur.                                                                                        |
| 2   | Project tersimpan setelah restart server               | ✓                                       | `server/test/projects.test.ts` › "persists projects across instances"; manual: project `integrasi-ai` tetap ada setelah belasan restart `tsx watch`.                                                                                                                   |
| 3   | Claude Code jalan interaktif di folder project         | ✓ sebagian                              | Manual (Chrome): `claude` terbuka di `C:\self-project\integrasi-ai`, UI TUI tampil dengan warna, navigasi keyboard + Enter jalan, exit kembali ke shell. Slash command & approval **belum** dicoba karena prompt trust folder sengaja dijawab "No".                    |
| 4   | ≥ 5 sesi paralel tanpa tercampur                       | ✓                                       | `e2e/main-flow.spec.ts` › "five sessions run in parallel without mixing input": tiap tab `exit N` dan banner menampilkan kode N di tab yang benar. Manual: 7 tab dengan marker `MARK-n` masing-masing.                                                                 |
| 5   | Refresh → tab pulih + scrollback, input jalan < 1 dtk  | ✓                                       | E2E main flow: pulih dalam **74–86 ms**, input setelah reload sampai ke proses yang sama. `server/test/sessions.test.ts` › replay scrollback.                                                                                                                          |
| 6   | Claude minta approval → `waiting` ≤ 1 dtk + notifikasi | ⚠ belum diverifikasi dengan Claude asli | Jalur sudah dites dengan panggilan hook tiruan (`server/test/hooks.test.ts`): Notification `permission_prompt` → `waiting`, Stop → `idle`. Format hook (`type: "http"`, `--settings`) sesuai dokumentasi resmi Claude Code. Langkah manual untuk pemilik ada di bawah. |
| 7   | CLI baru di `data/clis.json` muncul tanpa restart      | ✓                                       | E2E › "a CLI added to clis.json shows up without restarting"; `server/test/clis.test.ts` › reload otomatis & entri rusak di-skip.                                                                                                                                      |
| 8   | Tanpa token / Origin asing ditolak                     | ✓                                       | `server/test/security.test.ts` (401/403 untuk token hilang/salah, Origin asing, Host asing, WS tanpa token, dev origin di production); E2E › "rejects the API without the token".                                                                                      |
| 9   | Semua test & typecheck hijau                           | ✓                                       | Lihat ringkasan di atas.                                                                                                                                                                                                                                               |

## Bug yang ditemukan saat verifikasi (sudah diperbaiki)

- **Server crash saat resize ke PTY yang baru exit** (ditemukan E2E paralel). Satu sesi bisa menjatuhkan semua sesi. Diperbaiki di `pty.ts` + guard di handler WS; ada regression test.
- **pid PTY = 0** sehingga kill pohon proses tidak jalan (ditemukan test lifecycle). Sekarang pid dibaca lazily.
- **Exit code CLI hilang** (PowerShell meratakan ke 1). Sekarang `; exit $LASTEXITCODE`.
- **Ketikan pertama setelah pindah tab hilang** (manual). Fokus kini dipindah sinkron.
- **Tombol banner exit tertutup layer canvas xterm** (manual). Pane diberi `isolate`.

## Langkah verifikasi manual untuk pemilik (#3 dan #6)

1. `npm run build && npm start`, buka URL bertoken yang dicetak.
2. Klik project → **Claude Code**. Jika muncul prompt trust, pilih sesuai keputusanmu.
3. Minta Claude mengedit file (mis. "tambahkan komentar di README"). Saat prompt approval muncul, dot tab harus berubah **kuning berkedip** dalam ~1 dtk.
4. Pindah ke tab lain dulu (atau ke jendela lain), ulangi langkah 3 → notifikasi browser muncul (aktifkan lewat ikon lonceng dulu).
5. Jawab approval → dot biru berdenyut saat bekerja → hijau saat selesai.
6. Coba `/help` atau slash command lain untuk memastikan input interaktif penuh.
