# Implementation Plan: Integrasi AI — Web Terminal Hub

Sumber: `SPEC.md` (disetujui 2026-10-26). Task list detail: `tasks/todo.md`.

## Overview

Web app localhost (Fastify + node-pty + WebSocket di backend, React + xterm.js di frontend) untuk menjalankan AI CLI di terminal asli per tab browser, dengan sidebar project, status animasi per sesi, sesi yang selamat dari refresh, dan daftar CLI via config.

## Keputusan untuk Open Questions spec

Open questions spec belum dijawab eksplisit → plan pakai default berikut. Semua bisa diubah tanpa merombak plan.

| Pertanyaan          | Default dipakai                                                                    | Alasan                                             |
| ------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------- |
| Command Antigravity | Preset dibuat dengan `command` placeholder, ditandai `enabled: false` sampai diisi | `antigravity`/`agy` tidak ditemukan di PATH laptop |
| Lokasi data         | `data/` di folder app (path bisa dioverride env `INTEGRASI_DATA_DIR`)              | sederhana, mudah dipindah nanti                    |
| Shell               | `powershell.exe` (5.1) default, bisa diganti di config (`shell`)                   | `pwsh` tidak terpasang                             |
| Port                | `4317` (env `PORT`)                                                                |                                                    |
| Tutup tab           | konfirmasi → kill proses                                                           | sesuai spec                                        |

Fakta lingkungan (dicek): Node v24.0.1, npm 11.3.0, git 2.49, `claude.exe` ada di PATH. Folder project belum git repo.

## Architecture Decisions

- **npm workspaces** `server/`, `web/`, `shared/` — tipe & schema Zod satu sumber di `shared/`.
- **Sesi milik server, bukan koneksi.** `SessionManager` memegang PTY + ring buffer; WS hanya attach/detach. Ini yang membuat refresh aman.
- **Security dibangun sebelum endpoint pertama yang men-spawn proses** (Task 3). Tidak ada fase "tambahkan auth nanti".
- **Status = pipeline dua sumber:** heuristik (semua CLI) + hooks (Claude). Hooks override heuristik selama sinyal hook masih segar.
- **CLI dijalankan lewat shell** (`powershell.exe -NoLogo -Command <cmd>`) agar PATH/alias user berlaku; `command` hanya dari config.
- **CLI dummy untuk test** (`server/test/fixtures/fake-cli.mjs`) yang meniru output, prompt `(y/n)`, dan exit — test tidak bergantung Claude asli.
- **Vertical slicing:** setelah Task 5 sudah ada terminal PowerShell nyata di browser; tiap task berikutnya menambah satu kemampuan yang bisa dicoba.

## Dependency Graph

```
T1 scaffold
 └─ T2 spike node-pty ─┐
 └─ T3 security ───────┤
                       └─ T4 session backend + WS
                            └─ T5 terminal UI (1 sesi)
                                 ├─ T6 CLI registry ─┐
                                 └─ T7 projects ─────┴─ T8 multi-tab + restore
                                                         └─ T9 kill/exit
                                                              └─ T10 status heuristik + animasi
                                                                   ├─ T11 Claude hooks
                                                                   └─ T12 notifikasi
                                                                        └─ T13 polish UI
                                                                             └─ T14 E2E + success criteria
                                                                                  └─ T15 docs
```

Paralel aman (jika ada >1 sesi kerja): T2 ‖ T3; T6 ‖ T7; T11 ‖ T12.

## Task List

### Phase 1: Foundation

- [ ] T1: Scaffold monorepo + tooling
- [ ] T2: Spike node-pty di Windows/Node 24 (risiko tertinggi, fail fast)
- [ ] T3: Security layer (bind, token, Origin/Host check)

### Checkpoint A: Foundation

- [ ] `npm test`, `npm run typecheck`, `npm run lint` hijau
- [ ] Paket PTY terpilih & terbukti spawn PowerShell
- [ ] Request tanpa token / Origin asing ditolak (test)

### Phase 2: Core flow

- [ ] T4: Session backend (SessionManager, RingBuffer, REST + WS)
- [ ] T5: Terminal UI satu sesi (xterm.js)
- [ ] T6: CLI registry via `data/clis.json`
- [ ] T7: Project store + sidebar
- [ ] T8: Multi-tab + pemulihan sesi setelah refresh
- [ ] T9: Kill sesi, tutup tab, penanganan exit

### Checkpoint B: Core flow

- [ ] Tambah project → pilih Claude Code → `claude` interaktif di folder itu
- [ ] ≥ 2 tab paralel, refresh → pulih dengan scrollback
- [ ] Review dengan pemilik sebelum lanjut

### Phase 3: Status & notifikasi

- [ ] T10: Status heuristik + animasi StatusDot
- [ ] T11: Claude Code hooks → status akurat
- [ ] T12: Notifikasi browser saat `waiting`

### Checkpoint C: Status

- [ ] Claude minta approval → `waiting` ≤ 1 dtk + notifikasi
- [ ] Fake CLI `(y/n)` → `waiting` via heuristik

### Phase 4: Polish & verifikasi

- [ ] T13: Polish UI (tema, warna per-CLI, motion, reduced-motion, shortcut)
- [ ] T14: E2E Playwright + sapu Success Criteria spec
- [ ] T15: README + finalisasi preset Antigravity

### Checkpoint D: Complete

- [ ] 9 Success Criteria `SPEC.md` terpenuhi & tercatat bukti
- [ ] Definition of Done (`.claude/references/definition-of-done.md`) terpenuhi
- [ ] Siap review pemilik

## Risks and Mitigations

| Risk                                                                   | Impact | Mitigation                                                                                                                                   |
| ---------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `node-pty` gagal install di Node 24 Windows (butuh VS Build Tools)     | High   | T2 di awal: coba `@lydell/node-pty` (prebuilt) → `node-pty` → bila keduanya gagal, stop & tanya (opsi: pasang Build Tools, atau Node 22 LTS) |
| Mekanisme injeksi hooks Claude Code tidak sesuai asumsi (`--settings`) | Med    | T11 mulai dengan verifikasi dokumentasi resmi; fallback = heuristik saja untuk Claude                                                        |
| ConPTY quirks (resize, warna, Ctrl+C)                                  | Med    | Test manual di T5 dengan `claude` asli, bukan hanya PowerShell                                                                               |
| Heuristik `waiting` salah deteksi                                      | Low    | Regex per-CLI di config; hooks untuk Claude                                                                                                  |
| Command Antigravity belum diketahui                                    | Low    | Preset `enabled: false` sampai pemilik isi command                                                                                           |
| Memori bocor karena banyak sesi + buffer                               | Low    | Ring buffer dibatasi 1 MB/sesi; sesi exit dibersihkan                                                                                        |

## Open Questions

- Command Antigravity (blocking hanya untuk T15).
- Boleh `git init` di T1? (dibutuhkan agar "test sebelum commit" bermakna) — default: ya, tanya saat T1.

## Catatan Implementasi

- **T2 (2026-10-26):** Paket PTY = `@lydell/node-pty@1.2.0-beta.18` (prebuilt `win32-x64`, tanpa VS Build Tools). Terbukti spawn `powershell.exe`, echo, resize, kill di Node v24.0.1. Kill via ConPTY memberi exit code `-1073741510` (`STATUS_CONTROL_C_EXIT`) → kill yang diminta user dianggap `exited`, bukan `error`.
