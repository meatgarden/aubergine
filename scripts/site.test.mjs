// Tests of the site's generator, on a made-up site in a temporary folder: English and a
// pretend right-to-left language; and of the sitemap the real site-src/ gives, built in memory.
// Nothing here reads or writes the real site/.
//   node --test scripts/site.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ORIGIN, SITEMAP_STYLE, anchorsOf, buildSite, checkReadmes, codesOf, compareSite, fingerprint, headingAnchor, isDate, markupProblem, writeSite } from './site.mjs';

const made = [];
after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

const LAYOUT = `<!doctype html>
<html lang="{{=lang}}" dir="{{=dir}}">
<head><title>{{=title}}</title><meta name="description" content="{{=description}}">
{{=canonical}}
{{=alternates}}
<link rel="stylesheet" href="/style.css"></head>
<body>
<nav><a href="/">{{nav.home}}</a> <a href="/about/">{{nav.about}}</a></nav>
<!--if:languages--><details class="menu languages"><summary aria-label="{{=langname}}"><span class="long">{{=langname}}</span><span class="short">{{=langshort}}</span></summary><ul>{{=langmenu}}</ul></details><!--/if:languages-->
<!--if:translated--><p class="note" id="note-app">{{note.app}}</p><p class="note" id="note-machine">{{note.machine}}</p><!--/if:translated-->
<main>{{=content}}</main>
</body>
</html>
`;

const EN = {
  'nav.home': 'Home',
  'nav.about': 'About',
  'note.app': 'The app itself is in English.',
  'note.machine': 'A machine translated this page.',
  'home.meta.title': 'Home page',
  'home.meta.description': 'What it is.',
  'home.hello': 'Run many agents.',
  'home.install': 'Install with <code>npm install -g thing</code>.',
  'home.later': 'Read <a href="/about/">more</a>.',
  'about.meta.title': 'About',
  'about.meta.description': 'About it.',
  'about.text': 'Plain words.',
};

/** A site in a temporary folder; `change` edits the files before it is built. */
function makeSite({ en = EN, xx, languages, pages } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'site-test-'));
  made.push(dir);
  mkdirSync(path.join(dir, 'pages'));
  mkdirSync(path.join(dir, 'strings'));
  writeFileSync(path.join(dir, 'layout.html'), LAYOUT);
  writeFileSync(path.join(dir, 'style.css'), 'body{}\n');
  writeFileSync(path.join(dir, 'sitemap.xsl'), '<?xml version="1.0"?>\n');
  const allPages = pages ?? {
    'home.html': '<!--page {"path": "", "order": 0, "updated": "2026-11-20"}-->\n<h1>{{home.hello}}</h1><p>{{home.install}}</p><p>{{home.later}}</p>\n',
    'about.html': '<!--page {"order": 1, "updated": "2026-11-25"}-->\n<h1>{{about.text}}</h1><a href="/">x</a>\n',
  };
  for (const [name, text] of Object.entries(allPages)) writeFileSync(path.join(dir, 'pages', name), text);
  writeFileSync(path.join(dir, 'strings', 'en.json'), JSON.stringify(en));
  const langs = languages ?? [
    { code: 'en', name: 'English', lang: 'en', dir: 'ltr', folder: '' },
    { code: 'xx', name: 'Pretend', lang: 'xx', dir: 'rtl', folder: 'xx' },
  ];
  writeFileSync(path.join(dir, 'languages.json'), JSON.stringify(langs));
  if (xx) writeFileSync(path.join(dir, 'strings', 'xx.json'), JSON.stringify(xx));
  return dir;
}

/** A translation of every English key, made from the English as it is now. */
const fresh = (overrides = {}) => {
  const out = {};
  for (const [key, text] of Object.entries(EN)) out[key] = { text: `XX ${text}`, from: fingerprint(text) };
  return { ...out, ...overrides };
};

const page = (result, file) => result.files.get(file).toString('utf8');

describe('the strings', () => {
  test('a fingerprint is the first twelve characters of the SHA-256 of the English', () => {
    assert.equal(fingerprint('Run many agents.'), fingerprint('Run many agents.'));
    assert.match(fingerprint('x'), /^[0-9a-f]{12}$/);
    assert.notEqual(fingerprint('a'), fingerprint('b'));
  });
  test('only <code> <strong> <em> <br> and <a href> are allowed', () => {
    assert.equal(markupProblem('A <code>x</code>, <strong>y</strong>, <em>z</em>,<br> <a href="/a/">a</a>.'), null);
    assert.match(markupProblem('<span>x</span>'), /<span>/);
    assert.match(markupProblem('<a href="/a/" class="x">a</a>'), /one href/);
    assert.match(markupProblem('<code class="x">a</code>'), /attributes/);
    assert.match(markupProblem('<script>alert(1)</script>'), /<script>/);
    assert.match(markupProblem('1 < 2'), /&lt;/);
  });
  test('the <code> of a string are read in order', () => {
    assert.deepEqual(codesOf('<code>a</code> and <code>b</code>'), ['a', 'b']);
  });
});

describe('a site with English and a pretend right-to-left language', () => {
  test('a fresh translation is used, in its folder, with its lang and dir', () => {
    const result = buildSite(makeSite({ xx: fresh() }));
    assert.deepEqual(result.errors, []);
    const home = page(result, 'xx/index.html');
    assert.match(home, /<html lang="xx" dir="rtl">/);
    assert.match(home, /XX Run many agents\./);
    assert.doesNotMatch(home, /lang="en" dir="ltr">Run many agents/);
    assert.match(page(result, 'xx/about/index.html'), /XX Plain words\./);
    assert.match(page(result, 'index.html'), /<html lang="en" dir="ltr">/);
    assert.deepEqual(result.stale, []);
    assert.deepEqual(result.missing, []);
  });

  test('a stale translation shows the English, marked lang="en", and is listed', () => {
    const result = buildSite(makeSite({ xx: fresh({ 'home.hello': { text: 'XX old words', from: fingerprint('Run some agents.') } }) }));
    assert.deepEqual(result.errors, []);
    const home = page(result, 'xx/index.html');
    assert.match(home, /<span lang="en" dir="ltr">Run many agents\.<\/span>/);
    assert.doesNotMatch(home, /XX old words/);
    assert.deepEqual(result.stale, [{ language: 'xx', key: 'home.hello' }]);
  });

  test('a missing key shows the English, marked lang="en", and is listed', () => {
    const xx = fresh();
    delete xx['about.text'];
    const result = buildSite(makeSite({ xx }));
    assert.deepEqual(result.errors, []);
    assert.match(page(result, 'xx/about/index.html'), /<span lang="en" dir="ltr">Plain words\.<\/span>/);
    assert.deepEqual(result.missing, [{ language: 'xx', key: 'about.text' }]);
  });

  test('a key English does not have is an error', () => {
    const result = buildSite(makeSite({ xx: fresh({ 'home.gone': { text: 'XX', from: fingerprint('x') } }) }));
    assert.ok(result.errors.some((error) => /home\.gone is not an English key/.test(error)), result.errors.join('\n'));
  });

  test('a <code> that is not the English one is an error', () => {
    const result = buildSite(makeSite({ xx: fresh({ 'home.install': { text: 'XX <code>npm installieren -g thing</code>.', from: fingerprint(EN['home.install']) } }) }));
    assert.ok(result.errors.some((error) => /home\.install has a <code> that is not the English one/.test(error)), result.errors.join('\n'));
  });

  test('markup other than the five is an error, in English and in a translation', () => {
    const inEnglish = buildSite(makeSite({ en: { ...EN, 'about.text': 'Plain <span>words</span>.' }, xx: fresh() }));
    assert.ok(inEnglish.errors.some((error) => /en\.json: about\.text has the tag <span>/.test(error)), inEnglish.errors.join('\n'));
    const inXx = buildSite(makeSite({ xx: fresh({ 'about.text': { text: '<img src=x>', from: fingerprint(EN['about.text']) } }) }));
    assert.ok(inXx.errors.some((error) => /xx\.json: about\.text has the tag <img>/.test(error)), inXx.errors.join('\n'));
  });

  test('each page names every language with hreflang, x-default for English, and its own canonical address', () => {
    const result = buildSite(makeSite({ xx: fresh() }));
    for (const file of ['index.html', 'xx/index.html']) {
      const html = page(result, file);
      assert.match(html, /<link rel="alternate" hreflang="en" href="https:\/\/thirstyeggplant\.com\/">/);
      assert.match(html, /<link rel="alternate" hreflang="xx" href="https:\/\/thirstyeggplant\.com\/xx\/">/);
      assert.match(html, /<link rel="alternate" hreflang="x-default" href="https:\/\/thirstyeggplant\.com\/">/);
    }
    assert.match(page(result, 'xx/about/index.html'), /<link rel="canonical" href="https:\/\/thirstyeggplant\.com\/xx\/about\/">/);
    const sitemap = page(result, 'sitemap.xml');
    assert.match(sitemap, /<loc>https:\/\/thirstyeggplant\.com\/xx\/about\/<\/loc>/);
    assert.match(sitemap, /hreflang="x-default" href="https:\/\/thirstyeggplant\.com\/about\/"/);
  });

  test('a translated page carries the two one-line notes; an English page does not', () => {
    const result = buildSite(makeSite({ xx: fresh() }));
    const xx = page(result, 'xx/about/index.html');
    assert.match(xx, /id="note-app">XX The app itself is in English\./);
    assert.match(xx, /id="note-machine">XX A machine translated this page\./);
    assert.doesNotMatch(page(result, 'about/index.html'), /note-app|note-machine/);
  });

  test('the language menu lists both languages, and is not drawn while there is one', () => {
    const result = buildSite(makeSite({ xx: fresh() }));
    const about = page(result, 'about/index.html');
    assert.match(about, /class="menu languages"/);
    assert.match(about, /<a href="\.\/"[^>]*hreflang="en"[^>]*aria-current="true">English<\/a>/);
    assert.match(about, /<a href="\.\.\/xx\/about\/" hreflang="xx" lang="xx" dir="rtl">Pretend<\/a>/);
    const alone = buildSite(makeSite({ languages: [{ code: 'en', name: 'English', lang: 'en', dir: 'ltr', folder: '' }] }));
    assert.deepEqual(alone.errors, []);
    assert.doesNotMatch(page(alone, 'about/index.html'), /menu languages/);
    assert.ok(![...alone.files.keys()].some((file) => file.startsWith('xx/')));
  });

  test('the language button carries the language’s own name and its short code in capitals', () => {
    const result = buildSite(makeSite({ xx: fresh() }));
    assert.match(page(result, 'about/index.html'), /<summary aria-label="English"><span class="long">English<\/span><span class="short">EN<\/span><\/summary>/);
    assert.match(page(result, 'xx/about/index.html'), /<summary aria-label="Pretend"><span class="long">Pretend<\/span><span class="short">XX<\/span><\/summary>/);
  });

  test('links inside a translated page stay in its language, relative to the page', () => {
    const result = buildSite(makeSite({ xx: fresh() }));
    const home = page(result, 'xx/index.html');
    assert.match(home, /<a href="about\/">XX About<\/a>/);
    assert.match(home, /href="\.\.\/style\.css"/);
    assert.match(page(result, 'index.html'), /<a href="\.\/" aria-current="page">Home<\/a>/);
  });
});

describe('the checks', () => {
  test('a {{key}} with no string is an error, and so is an English key no template uses', () => {
    const result = buildSite(makeSite({ en: { ...EN, 'about.unused': 'Nobody says this.' }, pages: { 'home.html': '<!--page {"path": "", "order": 0, "updated": "2026-11-25"}-->\n<h1>{{home.hello}}</h1>{{home.install}}{{home.later}}{{home.nothing}}\n', 'about.html': '<!--page {"order": 1, "updated": "2026-11-25"}-->\n{{about.text}}\n' } }));
    assert.ok(result.errors.some((error) => /\{\{home\.nothing\}\} has no string/.test(error)), result.errors.join('\n'));
    assert.ok(result.errors.some((error) => /about\.unused is used by no template/.test(error)), result.errors.join('\n'));
  });

  test('an internal link or picture that leads nowhere is an error', () => {
    const result = buildSite(makeSite({ pages: { 'home.html': '<!--page {"path": "", "order": 0, "updated": "2026-11-25"}-->\n{{home.hello}}{{home.install}}{{home.later}}<a href="/nowhere/">x</a><img src="/missing.png" alt="">\n', 'about.html': '<!--page {"order": 1, "updated": "2026-11-25"}-->\n{{about.text}}\n' } }));
    assert.ok(result.errors.some((error) => /href="nowhere\/" leads nowhere/.test(error)), result.errors.join('\n'));
    assert.ok(result.errors.some((error) => /src="missing\.png" leads nowhere/.test(error)), result.errors.join('\n'));
  });

  test('the same sources give the same files, and a folder written from them compares equal', () => {
    const dir = makeSite({ xx: fresh() });
    const first = buildSite(dir);
    const second = buildSite(dir);
    assert.deepEqual([...first.files.keys()], [...second.files.keys()]);
    for (const [file, content] of first.files) assert.ok(content.equals(second.files.get(file)), file);
    const out = mkdtempSync(path.join(tmpdir(), 'site-out-'));
    made.push(out);
    writeFileSync(path.join(out, 'left-over.html'), 'old');
    assert.ok(compareSite(first.files, out).some((line) => /left-over\.html/.test(line)));
    writeSite(first.files, out);
    assert.deepEqual(compareSite(first.files, out), []);
    writeFileSync(path.join(out, 'index.html'), 'changed by hand');
    assert.deepEqual(compareSite(first.files, out), ['differs: index.html']);
    assert.equal(readFileSync(path.join(out, 'style.css'), 'utf8'), 'body{}\n');
  });
});

describe('the README and its translations', () => {
  /** A checkout in a temporary folder with a README, one translation and a picture. */
  function makeCheckout({ english, translation }) {
    const root = mkdtempSync(path.join(tmpdir(), 'site-readme-'));
    made.push(root);
    mkdirSync(path.join(root, 'docs', 'i18n'), { recursive: true });
    mkdirSync(path.join(root, 'pics'));
    writeFileSync(path.join(root, 'pics', 'a.png'), 'png');
    writeFileSync(path.join(root, 'README.md'), english);
    if (translation !== undefined) writeFileSync(path.join(root, 'docs', 'i18n', 'README.xx.md'), translation);
    return root;
  }
  const languages = [
    { code: 'en', name: 'English', lang: 'en', dir: 'ltr', folder: '' },
    { code: 'xx', name: 'Pretend', lang: 'xx', dir: 'rtl', folder: 'xx' },
  ];
  const ENGLISH = '# Thing\n\nEnglish · [Pretend](docs/i18n/README.xx.md)\n\n## What it looks like\n\n## Questions about the `thing` command\n\n## Quick start\n\n## Quick start\n';

  test('headings get the anchors GitHub gives them, repeats numbered, and explicit ids count', () => {
    const anchors = anchorsOf(ENGLISH + '\n<a id="here"></a>\n```\n# not a heading\n```\n');
    for (const anchor of ['thing', 'what-it-looks-like', 'questions-about-the-thing-command', 'quick-start', 'quick-start-1', 'here']) assert.ok(anchors.has(anchor), anchor);
    assert.ok(!anchors.has('not-a-heading'));
    assert.equal(headingAnchor('Cómo se ve'), 'cómo-se-ve');
  });

  test('a good translation passes', () => {
    const root = makeCheckout({ english: ENGLISH, translation: '# Thing\n\n<img src="../../pics/a.png">\n[a](../../pics/a.png) [b](../../README.md#quick-start-1) [c](#what-it-looks-like)\n\n<a id="what-it-looks-like"></a>\n\n## Wie es aussieht\n' });
    assert.deepEqual(checkReadmes(root, languages), []);
  });

  test('a missing translation, a picture or anchor that leads nowhere, and an English README without the link are errors', () => {
    assert.match(checkReadmes(makeCheckout({ english: ENGLISH }), languages).join('\n'), /README\.xx\.md does not exist/);
    const errors = checkReadmes(makeCheckout({ english: '# Thing\n', translation: '<img src="../../pics/b.png">\n[x](../../README.md#nowhere) [y](#gone)\n' }), languages).join('\n');
    assert.match(errors, /pics\/b\.png leads nowhere/);
    assert.match(errors, /README\.md#nowhere names no heading or id there/);
    assert.match(errors, /#gone names no heading or id there/);
    assert.match(errors, /README\.md does not link to docs\/i18n\/README\.xx\.md/);
  });
});

/** The <url> entries of a sitemap: each one's address, last change and alternates (hreflang → address). */
function readSitemap(xml) {
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(([, inner]) => ({
    loc: /<loc>([^<]*)<\/loc>/.exec(inner)?.[1],
    lastmod: /<lastmod>([^<]*)<\/lastmod>/.exec(inner)?.[1],
    alternates: [...inner.matchAll(/<xhtml:link rel="alternate" hreflang="([^"]+)" href="([^"]+)"\/>/g)].map(([, lang, href]) => [lang, href]),
  }));
}

/** A page's own canonical address and alternates, from its head. */
function headOf(html) {
  return {
    canonical: /<link rel="canonical" href="([^"]+)">/.exec(html)?.[1],
    alternates: [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map(([, lang, href]) => [lang, href]),
  };
}

/** Whether a text is XML whose elements open and close in order (enough for a file we write ourselves). */
function wellFormed(xml) {
  const body = xml.replace(/^<\?xml [^?]*\?>\s*/, '').replace(/<\?xml-stylesheet [^?]*\?>\s*/, '');
  if (/<\?/.test(body) || /&(?!(amp|lt|gt|quot|apos);)/.test(body)) return false;
  const open = [];
  for (const [, closing, name, selfClosing] of body.matchAll(/<(\/?)([A-Za-z][\w:.-]*)(?:\s[^<>]*?)?(\/?)>/g)) {
    if (selfClosing) continue;
    if (!closing) open.push(name);
    else if (open.pop() !== name) return false;
  }
  return open.length === 0 && body.trim().startsWith('<urlset');
}

describe('the sitemap', () => {
  test('"updated" is a real date, and a page in the sitemap must say it; a translation takes the same date', () => {
    assert.ok(isDate('2026-11-25'));
    for (const wrong of ['2026-11-31', '2026-2-01', '25.11.2026', '', 20261125, null]) assert.ok(!isDate(wrong), String(wrong));
    const without = buildSite(makeSite({ xx: fresh(), pages: { 'home.html': '<!--page {"path": "", "order": 0}-->\n<h1>{{home.hello}}</h1>{{home.install}}{{home.later}}\n', 'about.html': '<!--page {"order": 1, "updated": "yesterday"}-->\n{{about.text}}\n' } }));
    assert.ok(without.errors.some((error) => /home\.html: the first line must say "updated"/.test(error)), without.errors.join('\n'));
    assert.ok(without.errors.some((error) => /about\.html: "updated" must be a date/.test(error)), without.errors.join('\n'));
    const entries = readSitemap(page(buildSite(makeSite({ xx: fresh() })), 'sitemap.xml'));
    assert.deepEqual(entries.map((entry) => [entry.loc, entry.lastmod]), [
      [`${ORIGIN}/`, '2026-11-20'],
      [`${ORIGIN}/xx/`, '2026-11-20'],
      [`${ORIGIN}/about/`, '2026-11-25'],
      [`${ORIGIN}/xx/about/`, '2026-11-25'],
    ]);
  });

  test('a page marked noindex or "sitemap": false is not listed, and needs no date', () => {
    const result = buildSite(makeSite({ xx: fresh(), pages: { 'home.html': '<!--page {"path": "", "order": 0, "updated": "2026-11-25"}-->\n<h1>{{home.hello}}</h1>{{home.install}}{{home.later}}\n', 'about.html': '<!--page {"order": 1, "noindex": true}-->\n{{about.text}}\n' } }));
    assert.deepEqual(result.errors, []);
    assert.deepEqual(readSitemap(page(result, 'sitemap.xml')).map((entry) => entry.loc), [`${ORIGIN}/`, `${ORIGIN}/xx/`]);
  });

  test('it names its stylesheet, which must be among the sources', () => {
    const dir = makeSite({ xx: fresh() });
    const result = buildSite(dir);
    assert.match(page(result, 'sitemap.xml'), new RegExp(`^<\\?xml version="1\\.0" encoding="UTF-8"\\?>\\n<\\?xml-stylesheet type="text/xsl" href="/${SITEMAP_STYLE}"\\?>\\n<urlset `));
    assert.ok(result.files.has(SITEMAP_STYLE));
    rmSync(path.join(dir, SITEMAP_STYLE));
    assert.ok(buildSite(dir).errors.some((error) => error.includes(`${SITEMAP_STYLE} is missing`)));
  });

  describe('of the real site, built in memory from site-src/', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const result = buildSite(path.join(root, 'site-src'));
    const languages = JSON.parse(readFileSync(path.join(root, 'site-src', 'languages.json'), 'utf8'));
    const xml = page(result, 'sitemap.xml');
    const entries = readSitemap(xml);
    const fileOfAddress = (address) => `${address.slice(ORIGIN.length + 1)}index.html`;
    // Every page a search engine may index: an HTML page of the site without noindex.
    const indexable = [...result.files.keys()].filter((file) => file.endsWith('.html') && !/<meta name="robots" content="noindex/.test(page(result, file)));

    test('builds without errors', () => assert.deepEqual(result.errors, []));

    test('is well-formed XML, a standard sitemap with the xhtml namespace', () => {
      assert.ok(wellFormed(xml));
      assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9" xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml">/);
      assert.doesNotMatch(xml, /<priority>|<changefreq>/);
    });

    test('lists every indexable page of every language once, at an absolute address of the site that ends in a slash', () => {
      const locs = entries.map((entry) => entry.loc);
      assert.equal(new Set(locs).size, locs.length, 'an address is listed twice');
      for (const loc of locs) {
        assert.ok(loc.startsWith(`${ORIGIN}/`) && loc.endsWith('/'), loc);
        assert.ok(result.files.has(fileOfAddress(loc)), `${loc} is not a page of the site`);
      }
      assert.deepEqual([...locs].map(fileOfAddress).sort(), [...indexable].sort());
      assert.ok(!locs.some((loc) => loc.includes('404')));
      assert.equal(locs.length % languages.length, 0);
    });

    test('each address has a date and every language as an alternate, itself and x-default included, the same set for each language of a page', () => {
      const groups = new Map();
      for (const entry of entries) {
        assert.ok(isDate(entry.lastmod), `${entry.loc} has no lastmod`);
        assert.deepEqual(entry.alternates.map(([lang]) => lang), [...languages.map((language) => language.lang), 'x-default'], entry.loc);
        assert.ok(entry.alternates.some(([, href]) => href === entry.loc), `${entry.loc} is not among its own alternates`);
        const english = Object.fromEntries(entry.alternates)['x-default'];
        assert.equal(english, Object.fromEntries(entry.alternates).en);
        groups.set(english, [...(groups.get(english) ?? []), entry]);
      }
      for (const [english, group] of groups) {
        assert.equal(group.length, languages.length, english);
        for (const entry of group) {
          assert.deepEqual(entry.alternates, group[0].alternates, `${entry.loc} and ${group[0].loc} name different alternates`);
          assert.equal(entry.lastmod, group[0].lastmod, `${entry.loc} has another date than ${group[0].loc}`);
        }
        assert.deepEqual(group.map((entry) => entry.loc).sort(), group[0].alternates.filter(([lang]) => lang !== 'x-default').map(([, href]) => href).sort());
      }
    });

    test('agrees with each page’s head: its canonical address is its loc, and its alternates are the same', () => {
      for (const entry of entries) {
        const head = headOf(page(result, fileOfAddress(entry.loc)));
        assert.equal(head.canonical, entry.loc);
        assert.deepEqual(head.alternates, entry.alternates, entry.loc);
      }
    });

    test('the look is one theme: no switch by prefers-color-scheme, and color-scheme light on the stylesheet and every page', () => {
      const css = readFileSync(path.join(root, 'site-src', 'style.css'), 'utf8');
      assert.doesNotMatch(css, /prefers-color-scheme/);
      assert.match(css, /color-scheme:\s*light/);
      for (const file of indexable) assert.match(page(result, file), /<meta name="color-scheme" content="light">/, file);
    });

    test('robots.txt names it, and llms.txt lists every page that asks to be listed', () => {
      assert.match(page(result, 'robots.txt'), new RegExp(`^Sitemap: ${ORIGIN}/sitemap\\.xml$`, 'm'));
      assert.match(page(result, 'llms.txt'), new RegExp(`\\(${ORIGIN}/windows/\\)`));
    });
  });
});
