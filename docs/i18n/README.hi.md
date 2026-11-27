# Aubergine

<sub>यह README के ऊपरी हिस्से का मशीन से किया गया अनुवाद है। ऐप खुद अंग्रेज़ी में है। पूरा README अंग्रेज़ी में: [README.md](../../README.md)।</sub>

**आपके टर्मिनलों और AI कोडिंग एजेंटों के लिए मिशन कंट्रोल।** Claude Code, Codex और सादे टर्मिनल अपने ब्राउज़र में एक ही डैशबोर्ड पर साथ-साथ चलाएँ: जितने चाहें उतने, उन्हीं एजेंटों और मॉडलों के साथ जो आप पहले से इस्तेमाल करते हैं। एक नज़र में देखें कि कौन-सा आपका इंतज़ार कर रहा है, हर एक किस स्टेप पर है, और हर एक ने आपके लिए क्या लिखा है।

- आपके अपने कंप्यूटर पर चलता है, और कहीं नहीं।
- ब्राउज़र बंद करने या Aubergine रीस्टार्ट करने पर भी टर्मिनल चलते रहते हैं।
- सादे शेल के साथ भी काम करता है और एजेंटों के साथ भी।
- Aubergine का अपना कोई मॉडल नहीं है, यह कोई key नहीं रखता और इसमें कोई अकाउंट नहीं है।
- IT की समीक्षा में पास होने के लिए बना है: कुछ कंपनियाँ ऐसे टूल की इजाज़त नहीं देतीं जिनके लिए बनाने वाले के पास अकाउंट चाहिए, जो आपका कोड उसके क्लाउड पर भेजते हैं, या जिनका सोर्स पढ़ा नहीं जा सकता। Aubergine में न अकाउंट है न क्लाउड, और यह पूरा ओपन सोर्स है। इसमें आप जो एजेंट चलाते हैं, उन्हें फिर भी अपनी अलग मंज़ूरी चाहिए।

<img src="../../site/screenshots/canvas.png" alt="Aubergine का कैनवस: बाईं ओर एक कॉलम में तीन कैनवस, टर्मिनलों की सूची जिसमें हर एक क्या कर रहा है, और छह लाइव टर्मिनल, चार अपने-अपने रंगों में, एक जवाब का इंतज़ार करता हुआ।">

<sub>Aubergine के साथ आने वाला डेमो: नकली एजेंट, असली नहीं। ज़्यादा <a href="#what-it-looks-like">यह दिखता कैसा है</a> में।</sub>

---

<a id="what-it-looks-like"></a>

## यह दिखता कैसा है

| | |
|---|---|
| ![Runs: चार कॉलम, शुरू होने का इंतज़ार, चल रहा है, आपका इंतज़ार, पूरा](../../site/screenshots/runs.png) | ![By step: हर वर्कफ़्लो, हर स्टेप के लिए एक कॉलम के साथ](../../site/screenshots/by-step.png) |
| **Runs.** काम बाएँ से दाएँ बढ़ता है: शुरू होने का इंतज़ार, चल रहा है, आपका इंतज़ार, पूरा। | **By step.** हर वर्कफ़्लो, हर स्टेप के लिए एक कॉलम के साथ, और हर रन वहाँ जहाँ वह खड़ा है। |
| ![Workflows: स्टेप की सूचियाँ, कार्ड के रूप में](../../site/screenshots/workflows.png) | ![Library: किसी एजेंट को क्या बताया जाएगा, इंस्टॉल करने से पहले पढ़ें](../../site/screenshots/library.png) |
| **Workflows.** स्टेप की सूचियाँ जिनसे एजेंट एक-एक करके गुज़रता है। | **Library.** कुछ भी इंस्टॉल करने से पहले ठीक वही पढ़ें जो किसी एजेंट को बताया जाएगा। |

### कलर थीम

पेज दस कलर थीम में आता है, चार लाइट और छह डार्क, जो **Settings → Appearance** में चुनी जाती हैं। कोई भी टर्मिनल अपनी थीम भी रख सकता है (उसके मेन्यू में **Theme…**), और बाकी उस डिफ़ॉल्ट पर चलते हैं जो आप टर्मिनलों के लिए सेट करते हैं, या पेज पर। अलग-अलग रंग [सेटिंग्स फ़ाइल](../../README.md#settings) में हाथ से सेट किए जा सकते हैं।

| | | |
|---|---|---|
| ![Light थीम में छह टर्मिनल वाला कैनवस](../../site/screenshots/themes-light.png) | ![Solarized light थीम में वही कैनवस](../../site/screenshots/themes-solarized-light.png) | ![Gruvbox light थीम में वही कैनवस](../../site/screenshots/themes-gruvbox-light.png) |
| **Light** | **Solarized light** | **Gruvbox light** |
| ![Nord थीम में वही कैनवस](../../site/screenshots/themes-nord.png) | ![Dracula थीम में वही कैनवस](../../site/screenshots/themes-dracula.png) | ![Gruvbox dark थीम में वही कैनवस](../../site/screenshots/themes-gruvbox-dark.png) |
| **Nord** | **Dracula** | **Gruvbox dark** |

इनके अलावा [Dark](../../site/screenshots/themes-dark.png), [High contrast light](../../site/screenshots/themes-high-contrast-light.png), [High contrast dark](../../site/screenshots/themes-high-contrast-dark.png) और [Solarized dark](../../site/screenshots/themes-solarized-dark.png)।

<img src="../../site/screenshots/terminal-themes.png" alt="डार्क पेज पर छह टर्मिनल, हर एक अपनी थीम में: Solarized light, Dracula, Gruvbox dark, Nord, Gruvbox light और Solarized dark।">

<sub>डार्क पेज पर छह टर्मिनल, हर एक अपनी थीम में। साधारण शेल में एक काल्पनिक प्रोजेक्ट।</sub>

---

## दो मिनट में शुरू करें

**1. इंस्टॉल करें** (macOS, tmux 3.2 या नए और Node.js 22 या नए के साथ; `brew install tmux node` दोनों ले आता है)

```sh
# Node.js 22 or newer
npm install -g @meatgarden/aubergine
```

या इंस्टॉलर से, जिसे pnpm भी चाहिए और जो सोर्स से बिल्ड करता है:

```sh
curl -fsSL https://raw.githubusercontent.com/thirstyeggplant/aubergine/main/install.sh | sh
```

**2. इसे शुरू करें और अपना ब्राउज़र खोलें**

```sh
aubergine start --open
```

**3. खाली कैनवस के बीच में "Show me around" पर क्लिक करें।**

यह "Demo" नाम का एक कैनवस बनाता है जिसमें कुछ नकली एजेंट होते हैं, और आपको आठ छोटे स्टेप में घुमाता है, लगभग पाँच मिनट। इसमें कुछ भी असली नहीं है, और **Remove the demo** उसे फिर हटा देता है।

**या अपने एजेंट से इंस्टॉल करवाएँ।** इसे उस कोडिंग एजेंट में पेस्ट करें जिसे आप पहले से इस्तेमाल करते हैं। यह जाँचता है कि Aubergine को क्या चाहिए, उसे इंस्टॉल करता है, और आपके प्रोजेक्ट के निर्देशों में कुछ लाइनें जोड़ता है ताकि उसे पता रहे कि Aubergine टर्मिनल में कैसे काम करना है।

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

Aubergine की तरह यह प्रॉम्प्ट भी अंग्रेज़ी में है; आपका एजेंट आपकी भाषा में जवाब दे सकता है। इसे अभी तक किसी असली एजेंट के साथ नहीं चलाया गया है, इसलिए हाँ कहने से पहले पढ़ें कि आपका एजेंट क्या प्रस्ताव देता है। एजेंट टर्मिनल में क्या कर सकता है, यह [एजेंटों के लिए गाइड](../for-agents.md) में है।

कुछ ठीक नहीं है? `aubergine doctor` चलाएँ, या देखें [If something goes wrong](../../README.md#if-something-goes-wrong)। इंस्टॉलर का पूरा ब्योरा [Quick start](../../README.md#quick-start) में है।

---

बाकी सब कुछ अंग्रेज़ी README में है: [README.md](../../README.md)।
