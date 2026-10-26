# Integrasi AI

Web app lokal untuk menjalankan AI CLI (Claude Code, Antigravity, atau CLI lain) di **terminal asli dalam tab browser**. Pilih project, pilih CLI, kerja. Tidak perlu lagi buka banyak jendela terminal dan `cd` ke folder project.

- Sidebar project (favorit di atas), klik → pilih CLI → terminal terbuka di folder itu
- Banyak tab sekaligus; status tiap sesi tampil sebagai animasi: **biru berdenyut** = bekerja, **kuning berkedip** = menunggu input, **hijau** = siap, **merah/abu** = berhenti
- Notifikasi browser saat sesi yang tidak sedang dilihat menunggu input
- Refresh / tutup browser tidak mematikan proses; tab dan scrollback pulih saat dibuka lagi
- Daftar CLI diatur lewat `data/clis.json`, berubah tanpa restart

> Hanya untuk localhost. Server bisa menjalankan perintah shell, jadi ia hanya listen di `127.0.0.1` dan setiap request wajib membawa token.

## Kebutuhan

- Windows 10/11 (shell default PowerShell)
- Node.js 24+
- CLI yang ingin dipakai sudah terpasang dan login di laptop (mis. `claude`)

## Mulai

```powershell
npm install
npm run build
npm start
```

Console mencetak URL seperti `http://127.0.0.1:4317/?token=…`. Buka URL itu sekali. Token lalu disimpan di browser dan dihapus dari address bar, jadi selanjutnya cukup buka `http://127.0.0.1:4317`. Token disimpan di `data/.token` dan tetap sama antar-restart. Hapus file itu untuk membuat token baru.

### Mode pengembangan

```powershell
npm run dev    # server (tsx watch) + Vite di http://127.0.0.1:5173
```

Buka URL bertoken versi `5173` yang dicetak console. Catatan: `tsx watch` me-restart server setiap file server berubah, dan restart **mematikan semua sesi**. Ini hanya terjadi di mode dev.

## Menambah CLI

Saat pertama jalan, `data/clis.example.json` disalin ke `data/clis.json`. Edit file itu; perubahan dibaca otomatis.

```json
{
  "shell": { "file": "powershell.exe", "args": ["-NoLogo"] },
  "clis": [
    {
      "id": "codex",
      "name": "Codex",
      "command": "codex",
      "args": [],
      "color": "#10A37F",
      "statusMode": "heuristic",
      "waitingPatterns": ["\\(y/n\\)", "Allow .*\\?"],
      "enabled": true
    }
  ]
}
```

| Field             | Arti                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| `id`              | kebab-case, unik                                                                                     |
| `command`, `args` | dijalankan lewat `shell` (`& 'command' 'arg'…`), jadi PATH, alias, dan profile PowerShell-mu berlaku |
| `color`           | warna aksen tab (`#rrggbb`)                                                                          |
| `statusMode`      | `heuristic` (dari output terminal) atau `hooks` (khusus Claude Code, lihat di bawah)                 |
| `waitingPatterns` | regex; bila output terakhir cocok lalu terminal diam → status _menunggu input_                       |
| `enabled`         | `false` untuk menyembunyikan CLI dari pilihan                                                        |

Entri yang tidak valid dilewati dan alasannya dicatat di log server; entri lain tetap jalan. `shell` harus PowerShell (`powershell.exe` atau `pwsh`).

### Antigravity

Preset `antigravity` masih **nonaktif** karena command-nya belum diketahui (tidak ditemukan di PATH saat setup). Isi `command` dengan perintah yang kamu ketik di terminal untuk menjalankannya, ubah `enabled` menjadi `true`, lalu sesuaikan `waitingPatterns` dengan teks prompt konfirmasinya.

### Status akurat untuk Claude Code (`statusMode: "hooks"`)

Untuk CLI ber-mode `hooks`, server menulis file settings sementara (di folder temp sistem) berisi [HTTP hooks](https://code.claude.com/docs/en/hooks) yang memanggil balik `/api/hooks/:id`, lalu menjalankan Claude dengan `--settings <file>`. Settings milikmu (`~/.claude/settings.json`) tidak diubah, dan hooks-mu sendiri tetap jalan. File dihapus saat sesi berakhir. Bila hooks tidak bisa dipakai (mis. `allowedHttpHookUrls` membatasi URL), status otomatis jatuh ke heuristik.

## Shortcut

| Tombol                      | Aksi                                                 |
| --------------------------- | ---------------------------------------------------- |
| `Ctrl+Alt+T`                | Sesi baru dengan project & CLI yang sama             |
| `Ctrl+Alt+W`                | Tutup tab aktif (konfirmasi bila proses masih jalan) |
| `Ctrl+Alt+]` / `Ctrl+Alt+[` | Tab berikut / sebelumnya                             |
| `Ctrl+Alt+1…9`              | Lompat ke tab                                        |

`Ctrl+Shift+T/W` dan `Ctrl+Tab` tidak dipakai karena dicadangkan Chrome. Pada layout keyboard yang memakai AltGr (`Ctrl+Alt`) untuk karakter `[`/`]`, gunakan `Ctrl+Alt+angka`.

## Keamanan

- Listen hanya di `127.0.0.1:4317` (`PORT` untuk mengganti).
- Semua `/api` dan `/ws` wajib token; header `Origin` dan `Host` dicek untuk mencegah situs lain di browsermu (cross-site WebSocket, DNS rebinding) mengakses server.
- Perintah yang dijalankan hanya berasal dari `data/clis.json`, tidak pernah dari request.
- Endpoint hooks memakai secret per sesi, bukan token utama.
- Hapus project hanya menghapus dari daftar, tidak menyentuh folder.

## Struktur

```
server/   Fastify + WebSocket + node-pty (sesi, status, config CLI, project, keamanan)
web/      React + xterm.js + Tailwind + Zustand
shared/   tipe & schema Zod bersama
e2e/      Playwright (memakai Chrome terpasang)
data/     runtime: clis.json, projects.json, .token (gitignored kecuali contoh)
```

## Test

```powershell
npm test            # unit + integration (PTY sungguhan, fake CLI)
npm run test:e2e    # Playwright dengan server production
npm run typecheck
npm run lint
```

## Troubleshooting

- **`npm install` gagal di node-pty**: proyek memakai `@lydell/node-pty` yang menyertakan binary prebuilt untuk win32-x64, jadi Visual Studio Build Tools tidak diperlukan. Pastikan arsitektur Node x64/arm64.
- **"Token tidak valid"**: buka lagi URL bertoken dari console server.
- **Status selalu "bekerja" atau tidak pernah "menunggu"**: sesuaikan `waitingPatterns` CLI tersebut di `data/clis.json`.
