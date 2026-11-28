# Aubergine

<sub>这是 README 开头部分的机器翻译。应用本身是英文的。完整的英文 README 见[这里](../../README.md)。</sub>

**你的终端和 AI 编程智能体的指挥中心。** 在浏览器里的一个仪表盘上并排运行 Claude Code、Codex 和普通终端：想开多少就开多少，用你已经在用的智能体和模型。一眼看清哪一个在等你、每个走到了哪一步、每个为你写了什么。

分享 Aubergine： [X](https://x.com/intent/post?text=Aubergine%3A%20mission%20control%20for%20your%20terminals%20and%20AI%20coding%20agents.%20Free%2C%20local%2C%20open%20source.&url=https%3A%2F%2Fthirstyeggplant.com%2F) · [Bluesky](https://bsky.app/intent/compose?text=Aubergine%3A%20mission%20control%20for%20your%20terminals%20and%20AI%20coding%20agents.%20Free%2C%20local%2C%20open%20source.%20https%3A%2F%2Fthirstyeggplant.com%2F) · [LinkedIn](https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fthirstyeggplant.com%2F) · [Reddit](https://www.reddit.com/submit?url=https%3A%2F%2Fthirstyeggplant.com%2F&title=Aubergine%3A%20mission%20control%20for%20your%20terminals%20and%20AI%20coding%20agents.%20Free%2C%20local%2C%20open%20source.) · [Hacker News](https://news.ycombinator.com/submitlink?u=https%3A%2F%2Fthirstyeggplant.com%2F&t=Aubergine%3A%20mission%20control%20for%20your%20terminals%20and%20AI%20coding%20agents.%20Free%2C%20local%2C%20open%20source.)

- 运行在你自己的电脑上，不在其他任何地方。
- 关掉浏览器或重启 Aubergine，终端照常运行。
- 普通 shell 和智能体都能用。
- Aubergine 自己没有模型，不持有密钥，也没有账号。
- 为通过 IT 审查而做：有些公司不允许需要在开发方注册账号、会把你的代码发送到其云端，或者源码无法阅读的工具。Aubergine 没有账号，没有云，全部开源。你在其中运行的智能体仍需各自获得批准。

<img src="../../site/screenshots/canvas.png" alt="Aubergine 画布：左侧一列三张画布，终端列表注明每个终端在做什么，以及六个实时终端，其中四个有各自的颜色，一个在等待回答。">

<sub>Aubergine 自带的演示：用的是替身智能体，不是真的智能体。更多内容见<a href="#what-it-looks-like">它是什么样子</a>。</sub>

---

<a id="what-it-looks-like"></a>

## 它是什么样子

| | |
|---|---|
| ![Runs：四列，等待开始、运行中、在等你、已完成](../../site/screenshots/runs.png) | ![By step：每个工作流的每个步骤各占一列](../../site/screenshots/by-step.png) |
| **Runs.** 工作从左向右推进：等待开始、运行中、在等你、已完成。 | **By step.** 每个工作流的每个步骤各占一列，每次运行都显示在它所处的位置。 |
| ![Workflows：以卡片呈现的步骤清单](../../site/screenshots/workflows.png) | ![Library：安装前先读一读智能体会被告知什么](../../site/screenshots/library.png) |
| **Workflows.** 智能体逐一完成的步骤清单。 | **Library.** 在安装任何东西之前，准确读到智能体会被告知什么。 |

### 配色主题

页面有十种配色主题，四种浅色，六种深色，在 **Settings → Appearance** 中选择。任何终端也可以有自己的主题（菜单中的 **Theme…**），其他终端则跟随你为终端设置的默认主题，或跟随页面。单个颜色可以在[设置文件](../../README.md#settings)中手动设置。 你自己的主题是一个文件：在十个主题之一上叠加你的颜色，作为你的主题列在它们旁边（[docs/themes.md](../themes.md)）。 项目可以为每种类型设定自己的主题，在你查看它时绘制；带标签的终端可以按该标签获得主题（[docs/themes.md](../themes.md#while-you-look-at-a-project)）。

| | | |
|---|---|---|
| ![采用 Light 主题的画布和六个终端](../../site/screenshots/themes-light.png) | ![同一画布采用 Solarized light 主题](../../site/screenshots/themes-solarized-light.png) | ![同一画布采用 Gruvbox light 主题](../../site/screenshots/themes-gruvbox-light.png) |
| **Light** | **Solarized light** | **Gruvbox light** |
| ![同一画布采用 Nord 主题](../../site/screenshots/themes-nord.png) | ![同一画布采用 Dracula 主题](../../site/screenshots/themes-dracula.png) | ![同一画布采用 Gruvbox dark 主题](../../site/screenshots/themes-gruvbox-dark.png) |
| **Nord** | **Dracula** | **Gruvbox dark** |

另有 [Dark](../../site/screenshots/themes-dark.png)、[High contrast light](../../site/screenshots/themes-high-contrast-light.png)、[High contrast dark](../../site/screenshots/themes-high-contrast-dark.png) 和 [Solarized dark](../../site/screenshots/themes-solarized-dark.png)。

<img src="../../site/screenshots/terminal-themes.png" alt="深色页面上的六个终端，各用自己的主题：Solarized light、Dracula、Gruvbox dark、Nord、Gruvbox light 和 Solarized dark。">

<sub>深色页面上的六个终端，各用自己的主题。一个虚构的项目，运行在普通 shell 中。</sub>

---

## 两分钟上手

**1. 安装**（macOS，需要 tmux 3.2 或更高版本以及 Node.js 22 或更高版本；`brew install tmux node` 可以一次装好两者）

```sh
# Node.js 22 or newer
npm install -g @meatgarden/aubergine
```

或者使用安装脚本，它还需要 pnpm，并从源码构建：

```sh
curl -fsSL https://raw.githubusercontent.com/thirstyeggplant/aubergine/main/install.sh | sh
```

**2. 启动并打开浏览器**

```sh
aubergine start --open
```

**3. 点击空画布中间的“Show me around”。**

它会创建一张名为“Demo”的画布，其中有几个替身智能体，并用八个简短步骤带你走一遍，大约五分钟。其中的一切都不是真的，**Remove the demo** 会再把它移除。

**或者让你的智能体来安装**。把这段话粘贴给你已经在用的编程智能体。它会检查 Aubergine 需要什么、完成安装，并在你项目的指令里加几行，让它知道如何在 Aubergine 终端里工作。

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

和 Aubergine 一样，这段提示词是英文的；你的智能体可以用你的语言回答。它还没有用真实的智能体运行过，所以在同意之前，请先读一读你的智能体提出了什么。智能体在终端里能做什么，见[给智能体的指南](../for-agents.md)。

遇到问题？运行 `aubergine doctor`，或查看 [If something goes wrong](../../README.md#if-something-goes-wrong)。安装脚本的完整说明在 [Quick start](../../README.md#quick-start) 中。

---

其余内容请见[英文 README](../../README.md)。
