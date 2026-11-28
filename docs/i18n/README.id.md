# Aubergine

<sub>Ini adalah terjemahan mesin dari bagian awal README. Aplikasinya sendiri berbahasa Inggris. README lengkap dalam bahasa Inggris: <a href="../../README.md">README.md</a>.</sub>

**Pusat kendali untuk terminal dan agen coding AI Anda.** Jalankan Claude Code, Codex, dan terminal biasa berdampingan di satu dasbor di browser: sebanyak yang Anda mau, dengan agen dan model yang sudah Anda pakai. Lihat sekilas mana yang menunggu Anda, di langkah mana masing-masing berada, dan apa yang sudah ditulis masing-masing untuk Anda.

Bagikan Aubergine: [X](https://x.com/intent/post?text=Aubergine%3A%20mission%20control%20for%20your%20terminals%20and%20AI%20coding%20agents.%20Free%2C%20local%2C%20open%20source.&url=https%3A%2F%2Fthirstyeggplant.com%2F) · [Bluesky](https://bsky.app/intent/compose?text=Aubergine%3A%20mission%20control%20for%20your%20terminals%20and%20AI%20coding%20agents.%20Free%2C%20local%2C%20open%20source.%20https%3A%2F%2Fthirstyeggplant.com%2F) · [LinkedIn](https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fthirstyeggplant.com%2F) · [Reddit](https://www.reddit.com/submit?url=https%3A%2F%2Fthirstyeggplant.com%2F&title=Aubergine%3A%20mission%20control%20for%20your%20terminals%20and%20AI%20coding%20agents.%20Free%2C%20local%2C%20open%20source.) · [Hacker News](https://news.ycombinator.com/submitlink?u=https%3A%2F%2Fthirstyeggplant.com%2F&t=Aubergine%3A%20mission%20control%20for%20your%20terminals%20and%20AI%20coding%20agents.%20Free%2C%20local%2C%20open%20source.)

- Berjalan di komputer Anda sendiri, dan tidak di tempat lain.
- Terminal tetap berjalan saat Anda menutup browser atau memulai ulang Aubergine.
- Bekerja dengan shell biasa maupun dengan agen.
- Aubergine tidak punya model sendiri, tidak menyimpan kunci, dan tidak punya akun.
- Dibuat agar lolos tinjauan IT: sebagian perusahaan tidak mengizinkan alat yang memerlukan akun di pembuatnya, mengirim kode Anda ke cloud-nya, atau kode sumbernya tidak bisa dibaca. Aubergine tidak punya akun dan tidak punya cloud, dan seluruhnya open source. Agen yang Anda jalankan di dalamnya tetap perlu persetujuannya sendiri.

<img src="../../site/screenshots/canvas.png" alt="Kanvas Aubergine: tiga kanvas dalam satu kolom di kiri, daftar terminal beserta apa yang sedang dikerjakan masing-masing, dan enam terminal yang hidup, empat dengan warnanya sendiri, satu menunggu jawaban.">

<sub>Demo yang disertakan dengan Aubergine: agen pengganti, bukan agen sungguhan. Selengkapnya di <a href="#what-it-looks-like">Seperti apa tampilannya</a>.</sub>

---

<a id="what-it-looks-like"></a>

## Seperti apa tampilannya

| | |
|---|---|
| ![Runs: empat kolom, menunggu dimulai, berjalan, menunggu Anda, selesai](../../site/screenshots/runs.png) | ![By step: setiap workflow dengan satu kolom untuk tiap langkah](../../site/screenshots/by-step.png) |
| **Runs.** Pekerjaan bergerak dari kiri ke kanan: menunggu dimulai, berjalan, menunggu Anda, selesai. | **By step.** Setiap workflow dengan satu kolom untuk tiap langkah, dan setiap run di posisinya. |
| ![Workflows: daftar langkah sebagai kartu](../../site/screenshots/workflows.png) | ![Library: apa yang akan disampaikan kepada agen, dibaca sebelum menginstal](../../site/screenshots/library.png) |
| **Workflows.** Daftar langkah yang dilalui agen, satu per satu. | **Library.** Baca persis apa yang akan disampaikan kepada agen sebelum Anda menginstal apa pun. |

### Tema warna

Halaman ini hadir dalam sepuluh tema warna, empat terang dan enam gelap, dipilih di **Settings → Appearance**. Terminal mana pun juga bisa punya tema sendiri (**Theme…** di menunya), dan yang lain mengikuti tema bawaan yang Anda atur untuk terminal, atau halaman. Warna satu per satu bisa diatur sendiri di [berkas pengaturan](../../README.md#settings). Tema Anda sendiri adalah sebuah file: salah satu dari sepuluh dengan warna Anda di atasnya, tercantum di samping mereka sebagai milik Anda ([docs/themes.md](../themes.md)). Sebuah proyek dapat memiliki tema sendiri untuk tiap jenis, yang digambar selama Anda melihatnya, dan terminal yang punya tag dapat diberi tema menurut tag itu ([docs/themes.md](../themes.md#while-you-look-at-a-project)).

| | | |
|---|---|---|
| ![Kanvas dengan enam terminal dalam tema Light](../../site/screenshots/themes-light.png) | ![Kanvas yang sama dalam tema Solarized light](../../site/screenshots/themes-solarized-light.png) | ![Kanvas yang sama dalam tema Gruvbox light](../../site/screenshots/themes-gruvbox-light.png) |
| **Light** | **Solarized light** | **Gruvbox light** |
| ![Kanvas yang sama dalam tema Nord](../../site/screenshots/themes-nord.png) | ![Kanvas yang sama dalam tema Dracula](../../site/screenshots/themes-dracula.png) | ![Kanvas yang sama dalam tema Gruvbox dark](../../site/screenshots/themes-gruvbox-dark.png) |
| **Nord** | **Dracula** | **Gruvbox dark** |

Juga [Dark](../../site/screenshots/themes-dark.png), [High contrast light](../../site/screenshots/themes-high-contrast-light.png), [High contrast dark](../../site/screenshots/themes-high-contrast-dark.png) dan [Solarized dark](../../site/screenshots/themes-solarized-dark.png).

<img src="../../site/screenshots/terminal-themes.png" alt="Halaman gelap dengan enam terminal, masing-masing dalam tema sendiri: Solarized light, Dracula, Gruvbox dark, Nord, Gruvbox light, dan Solarized dark.">

<sub>Enam terminal di halaman gelap, masing-masing dalam tema sendiri. Proyek karangan di shell biasa.</sub>

---

## Mulai dalam dua menit

**1. Instal** (macOS dengan tmux 3.2 atau lebih baru dan Node.js 22 atau lebih baru; `brew install tmux node` memasang keduanya)

```sh
# Node.js 22 or newer
npm install -g @meatgarden/aubergine
```

Atau dengan installer, yang juga memerlukan pnpm dan membangun dari kode sumber:

```sh
curl -fsSL https://raw.githubusercontent.com/thirstyeggplant/aubergine/main/install.sh | sh
```

**2. Jalankan dan buka browser**

```sh
aubergine start --open
```

**3. Klik "Show me around"** (Tunjukkan sekeliling) di tengah kanvas kosong.

Ia membuat kanvas bernama "Demo" dengan beberapa agen pengganti dan memandu Anda dalam delapan langkah singkat, sekitar lima menit. Tidak ada yang sungguhan di dalamnya, dan **Remove the demo** menghapusnya lagi.

**Atau minta agen Anda menginstalnya.** Tempelkan ini ke agen coding yang sudah Anda pakai. Ia memeriksa apa yang dibutuhkan Aubergine, menginstalnya, dan menambahkan beberapa baris ke instruksi proyek Anda agar ia tahu cara bekerja di terminal Aubergine.

```text
Install Aubergine on this computer for me, then learn how to work in it.
Aubergine shows my terminals and coding agents side by side in a browser page. It runs only on this computer and is built for macOS.

1. Check what it needs: tmux 3.2 or newer and Node.js 22 or newer. Run `tmux -V` and `node --version`. If one is missing or too old, tell me the command that would install it (with Homebrew: `brew install tmux node`) and wait for my answer. Do not use sudo.
2. Install it: `npm install -g @meatgarden/aubergine`
3. Run `aubergine doctor` and read what it says. Fix what is yours to fix and tell me the rest.
4. Do not start the server yourself: it runs until it is stopped, and it opens my browser. Tell me to run `aubergine start --open` in a terminal of my own, and to click "Show me around" on the empty canvas.
5. So that you and later agents know how to work in an Aubergine terminal, run `aubergine guide --snippet` and add the lines it prints to this project's instructions for agents (the file you read at the start of every conversation). Show me the change before you save it.
6. From now on, whenever the environment variable AUBERGINE_SESSION_ID is set, you are in an Aubergine terminal: run `aubergine guide` once, before other work, and report to me as it says.

Finish by telling me what you installed, what you changed, and anything that did not work.
```

Prompt ini berbahasa Inggris, seperti Aubergine; agen Anda bisa menjawab dalam bahasa Anda. Prompt ini belum pernah dijalankan dengan agen sungguhan, jadi baca apa yang diusulkan agen Anda sebelum Anda setuju. Apa yang bisa dilakukan agen di terminal ada di [panduan untuk agen](../for-agents.md).

Ada yang tidak beres? Jalankan `aubergine doctor`, atau lihat [If something goes wrong](../../README.md#if-something-goes-wrong) (Jika ada yang salah). Installer dijelaskan selengkapnya di [Quick start](../../README.md#quick-start).

---

Untuk semua hal lainnya, baca [README lengkap dalam bahasa Inggris](../../README.md).
