# DESIGN.md

Arah desain Pangkalan, ditranskripsi dari jawaban pemilik project (2026-10-26).

## Identitas

- Produk: alat kerja lokal untuk menjalankan AI CLI di terminal dalam tab browser. Terminal adalah pusatnya; UI lain hanya bingkai.
- Kepribadian: hangat & personal. Terasa seperti alat milik sendiri, bukan dashboard korporat.

## Palet

- Dasar: netral grafit, sedikit hangat (bukan abu kebiruan).
- Satu aksen: teal hangat `#4FA59A` (versi lebih gelap `#2A7268` di tema terang agar lolos kontras). Dipakai hemat: tombol utama, tab aktif, fokus.
- Warna status sesi (biru bekerja, kuning menunggu, hijau siap, merah error, abu selesai) adalah informasi, bukan palet dekoratif.

## Tipografi

- UI: font sistem Windows, `Segoe UI Variable`. Native, tanpa unduhan, menyatu dengan OS.
- Mono (path, shortcut, terminal): `Cascadia Code`, bawaan Windows Terminal.

## Tema

- Toggle terang/gelap, default mengikuti sistem. Kedua tema penuh, termasuk tema terminal xterm.

## Dial

Dial: ENERGY 1 / RHYTHM 1 / MOTION 1

Alasan: alat kerja yang dipakai berjam-jam; perhatian harus di terminal. Satu-satunya gerak berulang adalah indikator status sesi (bekerja / menunggu) karena itu menandai keadaan nyata.
