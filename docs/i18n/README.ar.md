# Aubergine

<sub>هذه ترجمة آلية للجزء الأول من ملف README. التطبيق نفسه باللغة الإنجليزية. ملف README الكامل بالإنجليزية: <a href="../../README.md">README.md</a>.</sub>

**كل طرفياتك، جنبًا إلى جنب. أحضِر وكلاءك الخاصين.** يضع Aubergine كل طرفياتك على لوحة واحدة في متصفحك. شغّل منها ما شئت، بالوكلاء والنماذج التي تستخدمها أصلًا، واعرف بنظرة واحدة أيهم ينتظرك، وفي أي خطوة كلٌّ منهم، وما كتبه كلٌّ منهم لك.

- يعمل على حاسوبك أنت، ولا مكان غيره.
- تبقى الطرفيات تعمل حين تغلق المتصفح أو تعيد تشغيل Aubergine.
- يعمل مع الصدفات العادية ومع الوكلاء.
- ليس لـ Aubergine نموذج خاص به، ولا يحتفظ بأي مفتاح، وليس فيه حساب.

<img src="../../site/screenshots/canvas.png" alt="لوحة Aubergine: ثلاث لوحات في عمود على اليسار، وقائمة الطرفيات مع ما تفعله كل منها، وست طرفيات حيّة، أربع منها بألوان خاصة بها، وواحدة تنتظر جوابًا.">

<sub>العرض التجريبي المرفق مع Aubergine: وكلاء بدلاء، لا وكلاء حقيقيون. المزيد في <a href="#what-it-looks-like">كيف يبدو</a>.</sub>

---

<a id="what-it-looks-like"></a>

## كيف يبدو

| | |
|---|---|
| ![Runs: أربعة أعمدة، بانتظار البدء، قيد التشغيل، بانتظارك، منتهية](../../site/screenshots/runs.png) | ![By step: كل سير عمل مع عمود لكل خطوة](../../site/screenshots/by-step.png) |
| **Runs.** ينتقل العمل من اليسار إلى اليمين: بانتظار البدء، قيد التشغيل، بانتظارك، منتهية. | **By step.** كل سير عمل مع عمود لكل خطوة، وكل تشغيل حيث يقف. |
| ![Workflows: قوائم خطوات على شكل بطاقات](../../site/screenshots/workflows.png) | ![Library: ما سيُقال لوكيل، تقرؤه قبل التثبيت](../../site/screenshots/library.png) |
| **Workflows.** قوائم خطوات يمرّ بها وكيل، خطوةً خطوة. | **Library.** اقرأ بالضبط ما سيُقال لوكيل قبل أن تثبّت أي شيء. |

### أنماط الألوان

تأتي الصفحة في عشرة أنماط ألوان، أربعة فاتحة وستة داكنة، تُختار في **Settings → Appearance**. ويمكن لأي طرفية أن يكون لها نمطها الخاص (**Theme…** في قائمتها)، وتتبع الطرفيات الأخرى النمط الافتراضي الذي تضبطه للطرفيات، أو الصفحة. ويمكن ضبط ألوان منفردة يدويًا في [ملف الإعدادات](../../README.md#settings).

| | | |
|---|---|---|
| ![اللوحة مع ست طرفيات في نمط Light](../../site/screenshots/themes-light.png) | ![اللوحة نفسها في نمط Solarized light](../../site/screenshots/themes-solarized-light.png) | ![اللوحة نفسها في نمط Gruvbox light](../../site/screenshots/themes-gruvbox-light.png) |
| **Light** | **Solarized light** | **Gruvbox light** |
| ![اللوحة نفسها في نمط Nord](../../site/screenshots/themes-nord.png) | ![اللوحة نفسها في نمط Dracula](../../site/screenshots/themes-dracula.png) | ![اللوحة نفسها في نمط Gruvbox dark](../../site/screenshots/themes-gruvbox-dark.png) |
| **Nord** | **Dracula** | **Gruvbox dark** |

وأيضًا [Dark](../../site/screenshots/themes-dark.png), [High contrast light](../../site/screenshots/themes-high-contrast-light.png), [High contrast dark](../../site/screenshots/themes-high-contrast-dark.png) و [Solarized dark](../../site/screenshots/themes-solarized-dark.png).

<img src="../../site/screenshots/terminal-themes.png" alt="صفحة داكنة فيها ست طرفيات، لكل منها نمطها الخاص: Solarized light وDracula وGruvbox dark وNord وGruvbox light وSolarized dark.">

<sub>ست طرفيات على صفحة داكنة، لكل منها نمطها الخاص. مشروع مختلق في صدفات عادية.</sub>

---

## ابدأ في دقيقتين

**1. التثبيت** (macOS مع tmux 3.2 أو أحدث، ومعه Node.js 22 أو أحدث؛ الأمر `brew install tmux node` يثبّت الاثنين)

```sh
# Node.js 22 or newer
npm install -g @meatgarden/aubergine
```

أو بالمثبِّت، الذي يحتاج أيضًا إلى pnpm ويبني من الشيفرة المصدرية:

```sh
curl -fsSL https://raw.githubusercontent.com/thirstyeggplant/aubergine/main/install.sh | sh
```

**2. شغّله وافتح متصفحك**

```sh
aubergine start --open
```

**3. انقر «Show me around»** (عرّفني بالمكان) في وسط اللوحة الفارغة.

يصنع لوحة اسمها «Demo» فيها بضعة وكلاء بدلاء ويمرّ بك في ثماني خطوات قصيرة، نحو خمس دقائق. لا شيء فيها حقيقي، و**Remove the demo** يزيلها من جديد.

هل هناك خلل؟ شغّل `aubergine doctor`، أو انظر [If something goes wrong](../../README.md#if-something-goes-wrong). المثبِّت موصوف بالكامل تحت [Quick start](../../README.md#quick-start).

---

لكل ما سوى ذلك، اقرأ [ملف README الكامل بالإنجليزية](../../README.md).
