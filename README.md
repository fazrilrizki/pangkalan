# Pangkalan

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

| Field             | Arti                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| `id`              | kebab-case, unik                                                                                                     |
| `command`, `args` | dijalankan lewat `shell` (`& 'command' 'arg'…`), jadi PATH, alias, dan profile PowerShell-mu berlaku                 |
| `color`           | warna aksen tab (`#rrggbb`)                                                                                          |
| `statusMode`      | `heuristic` (dari output terminal) atau `hooks` (khusus Claude Code, lihat di bawah)                                 |
| `waitingPatterns` | regex; bila output terakhir cocok lalu terminal diam → status _menunggu input_                                       |
| `promptArgs`      | opsional; cara memberi prompt awal, `{prompt}` = isi prompt, mis. `["{prompt}"]` untuk Claude Code. Dipakai Adu agen |
| `enabled`         | `false` untuk menyembunyikan CLI dari pilihan                                                                        |

Entri yang tidak valid dilewati dan alasannya dicatat di log server; entri lain tetap jalan. `shell` harus PowerShell (`powershell.exe` atau `pwsh`).

### Antigravity

Preset `antigravity` masih **nonaktif** karena command-nya belum diketahui (tidak ditemukan di PATH saat setup). Isi `command` dengan perintah yang kamu ketik di terminal untuk menjalankannya, ubah `enabled` menjadi `true`, lalu sesuaikan `waitingPatterns` dengan teks prompt konfirmasinya.

### Status akurat untuk Claude Code (`statusMode: "hooks"`)

Untuk CLI ber-mode `hooks`, server menulis file settings sementara (di folder temp sistem) berisi [HTTP hooks](https://code.claude.com/docs/en/hooks) yang memanggil balik `/api/hooks/:id`, lalu menjalankan Claude dengan `--settings <file>`. Settings milikmu (`~/.claude/settings.json`) tidak diubah, dan hooks-mu sendiri tetap jalan. File dihapus saat sesi berakhir. Bila hooks tidak bisa dipakai (mis. `allowedHttpHookUrls` membatasi URL), status otomatis jatuh ke heuristik.

## Adu agen

Satu prompt dikerjakan 2–4 agen sekaligus, lalu kamu pilih hasil terbaik. Klik project, lalu chip **Adu agen**.

1. Tulis prompt, pilih CLI tiap peserta. Kolom argumen tambahan bisa dipakai untuk membedakan model, misalnya `--model opus` lawan `--model sonnet` pada CLI yang sama.
2. Pangkalan membuat satu git worktree dan satu branch per peserta (`adu/<id>-<huruf>-<cli>`) dari commit terakhir branch aktif. Worktree disimpan di `data/worktrees/`, di luar repo-mu.
3. Prompt dikirim sebagai argumen awal bila CLI punya `promptArgs` (Claude Code: `["{prompt}"]`). Ini cara yang paling andal, karena CLI sendiri yang menangani dialog pembukanya. Tanpa `promptArgs`, prompt diketik ke terminal begitu CLI diam dan tidak sedang menampilkan menu pilihan. Bila belum terkirim, bar adu menampilkan tombol **kirim prompt**.
4. Bar di atas terminal: **Berdampingan / Satu-satu**, **Bandingkan**, **Batalkan**.
5. **Bandingkan** menampilkan diff tiap peserta terhadap commit awal, termasuk file yang belum di-commit. **Pilih sebagai pemenang** akan menghentikan semua peserta, meng-commit hasil masing-masing ke branch-nya, lalu merge pemenang ke branch asal (`--no-ff`) dan menghapus worktree.

Merge ditolak tanpa mengubah apa pun bila branch asal sedang tidak aktif atau punya perubahan yang belum di-commit. Bila merge konflik, merge dibatalkan dan worktree tetap ada. Branch semua peserta tidak dihapus; hapus sendiri dengan `git branch -D adu/...` bila tidak perlu.

Project harus berupa repo git dengan minimal satu commit. Perubahan yang belum di-commit di folder project tidak ikut terlihat oleh peserta.

## Preview web

Lihat hasil perubahan tampilan tanpa pindah ke tab browser lain. Klik **Preview** di ujung kanan bar tab atau tekan `Ctrl+Alt+P`. Panel muncul di kanan terminal; geser pembatasnya untuk mengubah lebar (atau fokus lalu tombol panah, klik dua kali untuk 50:50).

- **URL otomatis.** Pangkalan membaca output terminal dan memakai URL `localhost` / `127.0.0.1` / `0.0.0.0` terakhir yang muncul, misalnya `Local: http://localhost:5173/` dari `npm run dev`. Dev server boleh jalan di tab lain dari project yang sama. Sesi aktif yang punya URL sendiri (mis. peserta adu agen di port berbeda) memakai URL-nya sendiri.
- **URL manual.** Ketik di kolom alamat lalu Enter; disimpan per project di `data/projects.json` dan mengalahkan deteksi otomatis. **Pakai otomatis** menghapusnya. Ini berguna bila Claude Code menjalankan dev server sebagai background task, sehingga URL-nya tidak tampil di terminal.
- **Ukuran layar.** Desktop, Tablet (820px), atau HP (390px) untuk mengecek tampilan responsif.
- Perubahan kode langsung terlihat lewat HMR dev server. Tombol muat ulang tersedia untuk server tanpa HMR.

Batasan: preview hanya jalan saat Pangkalan dibuka di laptop (dari HP, `localhost` berarti HP itu sendiri). Situs yang mengirim `X-Frame-Options` atau CSP `frame-ancestors` menolak ditampilkan di iframe; buka lewat tombol **Buka di tab baru**.

## Akses dari HP (Tailscale)

Pantau dan jawab sesi yang menunggu input dari HP, tanpa membuka server ke internet. Mode ini **mati secara default**.

1. Pasang [Tailscale](https://tailscale.com/download) di laptop dan HP, login ke tailnet yang sama. Di [pengaturan DNS tailnet](https://login.tailscale.com/admin/dns), nyalakan MagicDNS dan HTTPS Certificates.
2. Di Pangkalan (`npm start`), klik ikon HP di sidebar. Panel memeriksa ketiga syarat di atas dan menunjukkan yang belum beres.
3. Nyalakan **Izinkan akses dari HP**. Pangkalan menjalankan `tailscale serve --bg 4317` dan mengisi daftar akun dengan login Tailscale pemilik laptop.
4. Scan QR di panel dari HP.

Server tetap listen di `127.0.0.1`; Tailscale yang meneruskan HTTPS dari tailnet. Status panel disimpan di `data/remote.json` dan berlaku lagi setelah restart.

Pengaturan akses hanya bisa diubah dari laptop. Dari HP, panel hanya menampilkan informasi, supaya akses remote tidak bisa memperluas aksesnya sendiri. Mematikan akses, menghapus akun dari daftar, atau **Buat token baru** langsung memutus terminal yang sedang terbuka di HP.

Request remote wajib membawa token **dan** header `Tailscale-User-Login` yang ada di daftar akun. Header itu di-set oleh `tailscale serve` untuk pengguna tailnet. Trafik Tailscale Funnel (publik) tidak membawanya, jadi ditolak. Endpoint hooks tidak bisa diakses dari remote.

> Siapa pun di daftar akun bisa menjalankan shell di laptopmu. Isi hanya dengan akunmu sendiri.

Alternatif tanpa panel: jalankan server dengan `PANGKALAN_REMOTE_ORIGIN='https://laptop.tail1234.ts.net'` dan `PANGKALAN_REMOTE_USERS='kamu@github'` (pisahkan koma), lalu `tailscale serve --bg 4317` sendiri. Env ini menimpa `data/remote.json` saat start.

Di layar sempit, di bawah terminal ada tombol cepat (`y`, `n`, `Enter`, `Esc`, `↑`, `↓`, `Tab`, `^C`) untuk menjawab prompt tanpa keyboard khusus.

## Shortcut

| Tombol                      | Aksi                                                 |
| --------------------------- | ---------------------------------------------------- |
| `Ctrl+Alt+T`                | Sesi baru dengan project & CLI yang sama             |
| `Ctrl+Alt+W`                | Tutup tab aktif (konfirmasi bila proses masih jalan) |
| `Ctrl+Alt+]` / `Ctrl+Alt+[` | Tab berikut / sebelumnya                             |
| `Ctrl+Alt+1…9`              | Lompat ke tab                                        |
| `Ctrl+Alt+P`                | Tampilkan / sembunyikan preview web                  |

`Ctrl+Shift+T/W` dan `Ctrl+Tab` tidak dipakai karena dicadangkan Chrome. Pada layout keyboard yang memakai AltGr (`Ctrl+Alt`) untuk karakter `[`/`]`, gunakan `Ctrl+Alt+angka`.

## Keamanan

- Listen hanya di `127.0.0.1:4317` (`PORT` untuk mengganti). Akses remote hanya lewat `tailscale serve` dengan allowlist user (lihat di atas).
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
