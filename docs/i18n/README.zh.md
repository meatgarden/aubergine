# Aubergine

<sub>这是 README 开头部分的机器翻译。应用本身是英文的。完整的英文 README 见[这里](../../README.md)。</sub>

**所有终端，并排摆开。自带你的智能体。** Aubergine 把你所有的终端放在浏览器里的一张画布上。想开多少就开多少，用你已经在用的智能体和模型，一眼看清哪一个在等你、每个走到了哪一步、每个为你写了什么。

- 运行在你自己的电脑上，不在其他任何地方。
- 关掉浏览器或重启 Aubergine，终端照常运行。
- 普通 shell 和智能体都能用。
- Aubergine 自己没有模型，不持有密钥，也没有账号。

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

遇到问题？运行 `aubergine doctor`，或查看 [If something goes wrong](../../README.md#if-something-goes-wrong)。安装脚本的完整说明在 [Quick start](../../README.md#quick-start) 中。

---

其余内容请见[英文 README](../../README.md)。
