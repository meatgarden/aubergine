# Aubergine

<sub>これは README の冒頭部分を機械翻訳したものです。アプリ本体は英語です。完全な英語の README は[こちら](../../README.md)。</sub>

**すべてのターミナルを、横に並べて。エージェントは持ち込みで。** Aubergine は、すべてのターミナルをブラウザーの1つのキャンバスに並べます。いつも使っているエージェントとモデルのまま好きなだけ動かし、どれがあなたを待っているか、それぞれがどのステップにいるか、それぞれがあなたのために何を書いたかをひと目で確認できます。

- あなた自身のコンピューターで動き、ほかのどこでも動きません。
- ブラウザーを閉じても Aubergine を再起動しても、ターミナルは動き続けます。
- 普通のシェルでもエージェントでも使えます。
- Aubergine は自分のモデルを持たず、キーを持たず、アカウントもありません。

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

うまくいかないときは、`aubergine doctor` を実行するか、[If something goes wrong](../../README.md#if-something-goes-wrong) を参照してください。インストーラーの詳しい説明は [Quick start](../../README.md#quick-start) にあります。

---

ほかのすべては[英語の README](../../README.md) にあります。
