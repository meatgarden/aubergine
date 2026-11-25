# Aubergine

<sub>README 앞부분을 기계 번역한 것입니다. 앱 자체는 영어로 되어 있습니다. 영어로 된 전체 README: <a href="../../README.md">README.md</a>.</sub>

**모든 터미널을 브라우저 속 하나의 캔버스에.** 여러 코딩 에이전트를 나란히 실행하고, 어느 것이 여러분을 기다리는지, 각각 어느 단계에 있는지, 각각 여러분을 위해 무엇을 써 두었는지 한눈에 확인하세요.

- 여러분의 컴퓨터에서만 실행되며, 다른 어디에서도 실행되지 않습니다.
- 브라우저를 닫거나 Aubergine을 다시 시작해도 터미널은 계속 실행됩니다.
- 일반 셸에서도, 에이전트에서도 동작합니다.
- 원하는 만큼의 터미널을 나란히 놓을 수 있습니다.
- 에이전트와 모델은 직접 가져오세요. Aubergine에는 자체 모델이 없고, 키를 보관하지 않으며, 계정도 없습니다.

<img src="../../site/screenshots/canvas.png" alt="Aubergine 캔버스: 왼쪽 열에 캔버스 세 개, 각 터미널이 무엇을 하고 있는지 보여 주는 터미널 목록, 그리고 실시간 터미널 여섯 개. 그중 네 개는 저마다의 색이 있고, 하나는 답을 기다리고 있습니다.">

<sub>Aubergine에 포함된 데모입니다. 진짜 에이전트가 아닌 대역 에이전트입니다. 더 많은 화면은 <a href="#what-it-looks-like">실제 모습</a>에 있습니다.</sub>

---

<a id="what-it-looks-like"></a>

## 실제 모습

| | |
|---|---|
| ![Runs: 네 개의 열, 시작 대기, 실행 중, 여러분을 기다리는 중, 완료](../../site/screenshots/runs.png) | ![By step: 워크플로마다 단계별 열](../../site/screenshots/by-step.png) |
| **Runs.** 작업은 왼쪽에서 오른쪽으로 이동합니다. 시작 대기, 실행 중, 여러분을 기다리는 중, 완료. | **By step.** 워크플로마다 단계별로 열이 있고, 모든 실행이 현재 위치에 놓입니다. |
| ![Workflows: 카드로 된 단계 목록](../../site/screenshots/workflows.png) | ![Library: 설치하기 전에 읽는, 에이전트가 듣게 될 내용](../../site/screenshots/library.png) |
| **Workflows.** 에이전트가 하나씩 거쳐 가는 단계 목록. | **Library.** 무엇이든 설치하기 전에, 에이전트가 듣게 될 내용을 정확히 읽어 보세요. |

---

## 2분 만에 시작하기

**1. 설치** (tmux 3.2 이상과 Node.js 22 이상이 설치된 macOS. `brew install tmux node`로 둘 다 설치할 수 있습니다)

```sh
# Node.js 22 or newer
npm install -g @meatgarden/aubergine
```

또는 pnpm도 필요하고 소스에서 빌드하는 설치 프로그램으로:

```sh
curl -fsSL https://raw.githubusercontent.com/thirstyeggplant/aubergine/main/install.sh | sh
```

**2. 시작하고 브라우저 열기**

```sh
aubergine start --open
```

**3. 빈 캔버스 가운데에서 "Show me around"(둘러보기)를 클릭하세요.**

대역 에이전트 몇 개가 있는 "Demo"라는 캔버스를 만들고, 여덟 개의 짧은 단계로 5분 정도 안내합니다. 그 안의 어떤 것도 진짜가 아니며, **Remove the demo**로 다시 없앨 수 있습니다.

뭔가 이상한가요? `aubergine doctor`를 실행하거나 [If something goes wrong](../../README.md#if-something-goes-wrong)(문제가 생기면)을 보세요. 설치 프로그램에 대한 전체 설명은 [Quick start](../../README.md#quick-start)에 있습니다.

---

그 밖의 모든 내용은 [영어로 된 전체 README](../../README.md)를 읽어 보세요.
