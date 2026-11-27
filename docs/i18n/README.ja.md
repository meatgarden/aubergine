# Aubergine

<sub>これは README の冒頭部分を機械翻訳したものです。アプリ本体は英語です。完全な英語の README は[こちら](../../README.md)。</sub>

**ターミナルと AI コーディングエージェントの司令塔。** Claude Code、Codex、普通のターミナルを、ブラウザーの1つのダッシュボードに並べて動かせます。いつも使っているエージェントとモデルのまま、好きなだけ。どれがあなたを待っているか、それぞれがどのステップにいるか、それぞれがあなたのために何を書いたかをひと目で確認できます。

Aubergine を共有: [X](https://x.com/intent/post?text=Aubergine%3A%20mission%20control%20for%20your%20terminals%20and%20AI%20coding%20agents.%20Free%2C%20local%2C%20open%20source.&url=https%3A%2F%2Fthirstyeggplant.com%2F) · [Bluesky](https://bsky.app/intent/compose?text=Aubergine%3A%20mission%20control%20for%20your%20terminals%20and%20AI%20coding%20agents.%20Free%2C%20local%2C%20open%20source.%20https%3A%2F%2Fthirstyeggplant.com%2F) · [LinkedIn](https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fthirstyeggplant.com%2F) · [Reddit](https://www.reddit.com/submit?url=https%3A%2F%2Fthirstyeggplant.com%2F&title=Aubergine%3A%20mission%20control%20for%20your%20terminals%20and%20AI%20coding%20agents.%20Free%2C%20local%2C%20open%20source.) · [Hacker News](https://news.ycombinator.com/submitlink?u=https%3A%2F%2Fthirstyeggplant.com%2F&t=Aubergine%3A%20mission%20control%20for%20your%20terminals%20and%20AI%20coding%20agents.%20Free%2C%20local%2C%20open%20source.)

- あなた自身のコンピューターで動き、ほかのどこでも動きません。
- ブラウザーを閉じても Aubergine を再起動しても、ターミナルは動き続けます。
- 普通のシェルでもエージェントでも使えます。
- Aubergine は自分のモデルを持たず、キーを持たず、アカウントもありません。
- IT 部門の審査を通るように作られています。作り手のアカウントが必要なツール、あなたのコードを作り手のクラウドに送るツール、ソースを読めないツールを認めていない会社もあります。Aubergine にはアカウントもクラウドもなく、すべてがオープンソースです。その中で動かすエージェントには、それぞれの承認が引き続き必要です。

<img src="../../site/screenshots/canvas.png" alt="Aubergine のキャンバス：左に縦一列に並んだ3つのキャンバス、それぞれが何をしているかを示すターミナルの一覧、そして6つのライブのターミナル。4つは独自の色で、1つは答えを待っています。">

<sub>Aubergine に付属するデモです。本物のエージェントではなく、代役のエージェントが動いています。詳しくは<a href="#what-it-looks-like">どんな見た目か</a>を参照してください。</sub>

---

<a id="what-it-looks-like"></a>

## どんな見た目か

| | |
|---|---|
| ![Runs：開始待ち、実行中、あなた待ち、完了の4つの列](../../site/screenshots/runs.png) | ![By step：ワークフローごとに、ステップごとの列](../../site/screenshots/by-step.png) |
| **Runs.** 仕事は左から右へ進みます：開始待ち、実行中、あなた待ち、完了。 | **By step.** ワークフローごとにステップごとの列があり、すべての実行が今いる位置に表示されます。 |
| ![Workflows：カードとして並ぶステップの一覧](../../site/screenshots/workflows.png) | ![Library：インストール前に読む、エージェントに伝えられる内容](../../site/screenshots/library.png) |
| **Workflows.** エージェントが1つずつ進むステップの一覧。 | **Library.** 何かをインストールする前に、エージェントに何が伝えられるかを正確に読めます。 |

### カラーテーマ

ページには10種類のカラーテーマがあります。ライトが4つ、ダークが6つで、**Settings → Appearance** で選びます。どのターミナルにも専用のテーマを設定でき（メニューの **Theme…**）、ほかのターミナルはターミナル用に設定した既定のテーマか、ページのテーマに従います。個々の色は[設定ファイル](../../README.md#settings)で手動で指定できます。

| | | |
|---|---|---|
| ![Light テーマのキャンバスと6つのターミナル](../../site/screenshots/themes-light.png) | ![Solarized light テーマの同じキャンバス](../../site/screenshots/themes-solarized-light.png) | ![Gruvbox light テーマの同じキャンバス](../../site/screenshots/themes-gruvbox-light.png) |
| **Light** | **Solarized light** | **Gruvbox light** |
| ![Nord テーマの同じキャンバス](../../site/screenshots/themes-nord.png) | ![Dracula テーマの同じキャンバス](../../site/screenshots/themes-dracula.png) | ![Gruvbox dark テーマの同じキャンバス](../../site/screenshots/themes-gruvbox-dark.png) |
| **Nord** | **Dracula** | **Gruvbox dark** |

ほかに [Dark](../../site/screenshots/themes-dark.png)、[High contrast light](../../site/screenshots/themes-high-contrast-light.png)、[High contrast dark](../../site/screenshots/themes-high-contrast-dark.png)、[Solarized dark](../../site/screenshots/themes-solarized-dark.png) もあります。

<img src="../../site/screenshots/terminal-themes.png" alt="ダークのページに6つのターミナル。それぞれ専用のテーマ：Solarized light、Dracula、Gruvbox dark、Nord、Gruvbox light、Solarized dark。">

<sub>ダークのページの6つのターミナル。それぞれ専用のテーマで表示。架空のプロジェクトを普通のシェルで。</sub>

---

## 2分で始める

**1. インストール**（tmux 3.2 以降と Node.js 22 以降の入った macOS。`brew install tmux node` で両方が入ります）

```sh
# Node.js 22 or newer
npm install -g @meatgarden/aubergine
```

または、pnpm も必要でソースからビルドするインストーラーを使います：

```sh
curl -fsSL https://raw.githubusercontent.com/thirstyeggplant/aubergine/main/install.sh | sh
```

**2. 起動してブラウザーを開く**

```sh
aubergine start --open
```

**3. 空のキャンバスの中央にある「Show me around」をクリックします。**

代役のエージェントがいくつか並ぶ「Demo」という名前のキャンバスが作られ、8つの短いステップで案内します。約5分です。中に本物はなく、**Remove the demo** でまた取り除けます。

**エージェントにインストールしてもらうこともできます**。いま使っているコーディングエージェントに、これを貼り付けてください。Aubergine に必要なものを確認してインストールし、Aubergine のターミナルでの作業のしかたがわかるよう、プロジェクトの指示に数行を追加します。

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

Aubergine と同じく、プロンプトは英語です。エージェントはお使いの言語で答えられます。まだ本物のエージェントで実行したことはないので、承認する前に、エージェントの提案を読んでください。エージェントがターミナルでできることは[エージェント向けのガイド](../for-agents.md)にあります。

うまくいかないときは、`aubergine doctor` を実行するか、[If something goes wrong](../../README.md#if-something-goes-wrong) を参照してください。インストーラーの詳しい説明は [Quick start](../../README.md#quick-start) にあります。

---

ほかのすべては[英語の README](../../README.md) にあります。
