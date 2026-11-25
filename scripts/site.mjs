#!/usr/bin/env node
// Builds the public site: every file under site/ from site-src/. No dependencies.
//
//   node scripts/site.mjs            write site/
//   node scripts/site.mjs --check    fail when site/ is not what site-src/ gives
// Both also check the README's translations in docs/i18n/ (checkReadmes).
//
// How it is made and what a page may say are in docs/site.md. In short:
//   site-src/layout.html        what every page shares; {{=content}} is the page
//   site-src/pages/<page>.html  a page: a first line <!--page {json}--> and its markup
//   site-src/strings/en.json    the words, one entry per key; English is the original
//   site-src/strings/<l>.json   a translation: { key: { text, from: <fingerprint of the English> } }
//   site-src/languages.json     the languages, English first
//   site-src/llms.txt           English only; {{=pages}} is the list of pages
//   everything else             copied as it is (style.css, icon.svg, fonts/, screenshots/…)
//
// In a template: {{key}} is a string as HTML, {{attr:key}} as an attribute's
// text, {{json:key}} as a JSON string of its text, {{=name}} is made here.
// <!--if:translated-->…<!--/if:translated--> is kept on a translated page only,
// <!--if:languages-->…<!--/if:languages--> only while there is more than one language.
// Made for each page: lang, dir, page, canonical, url, robots, ogType, alternates, langmenu,
// langname (the language's own name), langshort (its code in capitals), title, description.
// Internal addresses are written from the site's root (/install/, /style.css);
// each page gets them relative to itself, and in its own language's folder.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ORIGIN = 'https://thirstyeggplant.com';
const ALLOWED_TAGS = new Set(['code', 'strong', 'em', 'br', 'a']);
/** Files of site-src/ that are sources, not copied as they are. */
const SOURCES = new Set(['layout.html', 'languages.json', 'llms.txt']);
const SOURCE_FOLDERS = new Set(['pages', 'strings']);

/** The short mark of an English sentence a translation was made from. */
export function fingerprint(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 12);
}

/** Why a string's markup is not allowed, or null. Only <code> <strong> <em> <br> <a href>. */
export function markupProblem(text) {
  if (typeof text !== 'string') return 'is not text';
  for (const match of text.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g)) {
    const [whole, closing, tag, rest] = match;
    const name = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return `has the tag <${name}>`;
    if (closing || name !== 'a') {
      if (rest.trim() !== '' && !(name === 'br' && rest.trim() === '/')) return `has attributes on ${whole}`;
    } else if (!/^\s+href="[^"<>]*"$/.test(rest)) return `has an <a> with something other than one href: ${whole}`;
  }
  const left = text.replace(/<\/?[a-zA-Z][\w-]*[^>]*>/g, '');
  if (left.includes('<')) return 'has a < that is not an allowed tag (write &lt;)';
  if (/\{\{|\}\}/.test(text)) return 'has {{ or }}';
  return null;
}

/** What is in each <code> of a string, in order. */
export function codesOf(text) {
  return [...text.matchAll(/<code>([\s\S]*?)<\/code>/g)].map((match) => match[1]);
}

const sameCodes = (a, b) => JSON.stringify([...codesOf(a)].sort()) === JSON.stringify([...codesOf(b)].sort());

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
/** A string's text without markup, entities read. */
export function plainText(html) {
  return html
    .replace(/<br\s*\/?>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
      if (name[0] === '#') return String.fromCodePoint(name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10));
      return ENTITIES[name.toLowerCase()] ?? whole;
    });
}

const escapeAttr = (text) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const jsonText = (text) => JSON.stringify(text).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

function listFiles(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full, base));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

const readJson = (file, errors) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    errors.push(`${file}: ${error.message}`);
    return null;
  }
};

/** Reads site-src/ into what the build needs. */
export function readSource(srcDir) {
  const errors = [];
  const languages = readJson(path.join(srcDir, 'languages.json'), errors) ?? [];
  const en = readJson(path.join(srcDir, 'strings', 'en.json'), errors) ?? {};
  const translations = {};
  for (const language of languages.slice(1)) {
    const file = path.join(srcDir, 'strings', `${language.code}.json`);
    translations[language.code] = existsSync(file) ? (readJson(file, errors) ?? {}) : {};
  }
  const pages = [];
  for (const name of readdirSync(path.join(srcDir, 'pages')).sort()) {
    if (!name.endsWith('.html')) continue;
    const text = readFileSync(path.join(srcDir, 'pages', name), 'utf8');
    const head = /^<!--page (\{[\s\S]*?\})-->\n?/.exec(text);
    if (!head) {
      errors.push(`pages/${name}: the first line must be <!--page {…}-->`);
      continue;
    }
    let meta;
    try {
      meta = JSON.parse(head[1]);
    } catch (error) {
      errors.push(`pages/${name}: ${error.message}`);
      continue;
    }
    pages.push({ id: name.replace(/\.html$/, ''), meta, body: text.slice(head[0].length) });
  }
  pages.sort((a, b) => (a.meta.order ?? 99) - (b.meta.order ?? 99) || a.id.localeCompare(b.id));
  const copied = listFiles(srcDir).filter((file) => !SOURCES.has(file) && !SOURCE_FOLDERS.has(file.split('/')[0]));
  const llms = existsSync(path.join(srcDir, 'llms.txt')) ? readFileSync(path.join(srcDir, 'llms.txt'), 'utf8') : null;
  return { srcDir, errors, languages, en, translations, pages, layout: readFileSync(path.join(srcDir, 'layout.html'), 'utf8'), copied, llms };
}

const PLACEHOLDER = /\{\{(attr:|json:|=)?([A-Za-z0-9_.-]+)\}\}/g;

/** Every string key a template names. */
function keysIn(template) {
  return [...template.matchAll(PLACEHOLDER)].filter((match) => match[1] !== '=').map((match) => match[2]);
}

function keepIf(template, name, keep) {
  const block = new RegExp(`<!--if:${name}-->([\\s\\S]*?)<!--/if:${name}-->\\n?`, 'g');
  return template.replace(block, (_, inner) => (keep ? inner : ''));
}

/** Where a page is published, from the root of its language (no leading slash). */
/** The first part of a page's keys: its own name unless its first line says another ("key"). */
const keyOf = (page) => page.meta.key ?? page.id;
const pagePath = (page) => page.meta.path ?? `${page.id}/`;
const fileOf = (address) => (address === '' || address.endsWith('/') ? `${address}index.html` : address);
const isPageAddress = (address) => address === '/' || address.endsWith('/') || !/\.[a-z0-9]+$/i.test(address.split('/').pop());

function relative(fromDir, to) {
  const rel = path.posix.relative(fromDir || '.', to || '.');
  if (rel === '') return './';
  return (to === '' || to.endsWith('/')) && !rel.endsWith('/') ? `${rel}/` : rel;
}

/** Builds every file of the site. Nothing is written. */
export function buildSite(srcDir) {
  const source = readSource(srcDir);
  const { languages, en, translations, pages } = source;
  const errors = [...source.errors];
  const stale = [];
  const missing = [];
  const files = new Map();

  if (languages.length === 0 || languages[0].code !== 'en' || languages[0].folder !== '') errors.push('languages.json: English must be first, with the folder ""');
  for (const language of languages) {
    for (const field of ['code', 'name', 'lang', 'dir', 'folder']) if (typeof language[field] !== 'string') errors.push(`languages.json: ${language.code ?? '?'} has no ${field}`);
    if (!['ltr', 'rtl'].includes(language.dir)) errors.push(`languages.json: ${language.code} has the direction ${language.dir}`);
  }

  for (const [key, text] of Object.entries(en)) {
    const problem = markupProblem(text);
    if (problem) errors.push(`en.json: ${key} ${problem}`);
  }

  // What each language says, key by key, and which keys fall back to English.
  const wordsOf = { en: Object.fromEntries(Object.keys(en).map((key) => [key, { text: en[key], english: false }])) };
  for (const language of languages.slice(1)) {
    const own = translations[language.code] ?? {};
    const words = {};
    for (const [key, entry] of Object.entries(own)) {
      if (!(key in en)) {
        errors.push(`${language.code}.json: ${key} is not an English key`);
        continue;
      }
      if (!entry || typeof entry !== 'object' || typeof entry.text !== 'string' || typeof entry.from !== 'string') {
        errors.push(`${language.code}.json: ${key} must be { "text": "…", "from": "<fingerprint>" }`);
        continue;
      }
      const problem = markupProblem(entry.text);
      if (problem) errors.push(`${language.code}.json: ${key} ${problem}`);
      if (!sameCodes(entry.text, en[key])) errors.push(`${language.code}.json: ${key} has a <code> that is not the English one (${JSON.stringify(codesOf(entry.text))} for ${JSON.stringify(codesOf(en[key]))})`);
    }
    for (const key of Object.keys(en)) {
      const entry = own[key];
      if (!entry || typeof entry.text !== 'string') {
        missing.push({ language: language.code, key });
        words[key] = { text: en[key], english: true };
      } else if (entry.from !== fingerprint(en[key])) {
        stale.push({ language: language.code, key });
        words[key] = { text: en[key], english: true };
      } else words[key] = { text: entry.text, english: false };
    }
    wordsOf[language.code] = words;
  }

  // Every key a template names must have a string, and every English string must be named.
  // A page's title and description are named by the page itself: <page>.meta.title and <page>.meta.description.
  const named = new Set([...keysIn(source.layout), ...pages.flatMap((page) => [...keysIn(page.body), `${keyOf(page)}.meta.title`, `${keyOf(page)}.meta.description`])]);
  for (const key of [...named].sort()) if (!(key in en)) errors.push(`{{${key}}} has no string in en.json`);
  for (const key of Object.keys(en).sort()) if (!named.has(key)) errors.push(`en.json: ${key} is used by no template`);

  const several = languages.length > 1;
  const urlOf = (language, page) => `${ORIGIN}/${language.folder ? `${language.folder}/` : ''}${pagePath(page)}`;

  for (const language of languages) {
    const words = wordsOf[language.code];
    if (!words) continue;
    const translated = language.code !== 'en';
    for (const page of pages) {
      if (translated && page.meta.englishOnly) continue;
      const own = pagePath(page);
      const out = (language.folder ? `${language.folder}/` : '') + own;
      const outFile = fileOf(out);
      const outDir = path.posix.dirname(outFile) === '.' ? '' : path.posix.dirname(outFile);
      const absolute = Boolean(page.meta.absolute);

      const vars = {
        lang: language.lang,
        dir: language.dir,
        page: page.id,
        canonical: page.meta.englishOnly ? '' : `<link rel="canonical" href="${urlOf(language, page)}">`,
        url: urlOf(language, page),
        robots: page.meta.noindex ? 'noindex' : 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1',
        ogType: page.meta.ogType ?? 'article',
        alternates: page.meta.englishOnly
          ? ''
          : [...languages.map((other) => `<link rel="alternate" hreflang="${other.lang}" href="${urlOf(other, page)}">`), `<link rel="alternate" hreflang="x-default" href="${urlOf(languages[0], page)}">`].join('\n'),
        langmenu: page.meta.englishOnly
          ? ''
          : languages
              .map((other) => {
                const href = `/~/${other.folder ? `${other.folder}/` : ''}${own}`;
                const current = other.code === language.code ? ' aria-current="true"' : '';
                return `<li><a href="${href}" hreflang="${other.lang}" lang="${other.lang}" dir="${other.dir}"${current}>${other.name}</a></li>`;
              })
              .join(''),
        langname: language.name,
        // The language's short code in capitals, for the language button where its name has no room (a phone).
        langshort: language.code.toUpperCase(),
        title: escapeAttr(plainText(words[`${keyOf(page)}.meta.title`]?.text ?? '')),
        description: escapeAttr(plainText(words[`${keyOf(page)}.meta.description`]?.text ?? '')),
      };

      let html = keepIf(source.layout, 'translated', translated);
      html = keepIf(html, 'languages', several && !page.meta.englishOnly);
      html = html.replace('{{=content}}', () => keepIf(keepIf(page.body, 'translated', translated), 'languages', several));
      html = html.replace(PLACEHOLDER, (whole, form, name) => {
        if (form === '=') {
          if (!(name in vars)) {
            errors.push(`${page.id}: {{=${name}}} is not something the build makes`);
            return whole;
          }
          return vars[name];
        }
        const word = words[name];
        if (!word) return whole; // reported above
        if (form === 'attr:') return escapeAttr(plainText(word.text));
        if (form === 'json:') return jsonText(plainText(word.text));
        return word.english && translated ? `<span lang="en" dir="ltr">${word.text}</span>` : word.text;
      });

      // Mark the links to this very page, then make every internal address relative and in this language.
      html = html.replace(/<a href="\/([^"#?]*)"/g, (whole, address) => (address === own ? `${whole} aria-current="page"` : whole));
      html = html.replace(/\b(href|src)="\/([^"]*)"/g, (whole, attr, address) => {
        if (address.startsWith('/')) return whole; // //host
        const [given, rest = ''] = address.split(/(?=[#?])/);
        // /~/… is already in its language (the language menu); every other page address goes into this page's language.
        const inLanguage = given.startsWith('~/');
        const bare = inLanguage ? given.slice(2) : given;
        const target = !inLanguage && isPageAddress(`/${bare}`) && language.folder ? `${language.folder}/${bare}` : bare;
        if (absolute) return `${attr}="/${target}${rest}"`;
        return `${attr}="${relative(outDir, target)}${rest}"`;
      });
      files.set(outFile, Buffer.from(html, 'utf8'));
    }
  }

  // The sitemap, with every language of every page.
  const listed = pages.filter((page) => page.meta.sitemap !== false && !page.meta.noindex);
  const sitemap = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'];
  for (const page of listed) {
    for (const language of languages) {
      sitemap.push('  <url>', `    <loc>${urlOf(language, page)}</loc>`);
      for (const other of languages) sitemap.push(`    <xhtml:link rel="alternate" hreflang="${other.lang}" href="${urlOf(other, page)}"/>`);
      sitemap.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${urlOf(languages[0], page)}"/>`, `    <priority>${page.id === 'home' ? '1.0' : '0.8'}</priority>`, '  </url>');
    }
  }
  sitemap.push('</urlset>', '');
  files.set('sitemap.xml', Buffer.from(sitemap.join('\n'), 'utf8'));

  // llms.txt, English only.
  if (source.llms !== null) {
    const lines = pages.filter((page) => page.meta.llms).map((page) => `- [${page.meta.llms.name}](${urlOf(languages[0], page)})${page.meta.llms.about ? `: ${page.meta.llms.about}` : ''}`);
    files.set('llms.txt', Buffer.from(source.llms.replace('{{=pages}}', lines.join('\n')), 'utf8'));
  }

  for (const file of source.copied) {
    if (files.has(file)) errors.push(`${file} is both copied and made`);
    files.set(file, readFileSync(path.join(srcDir, file)));
  }

  errors.push(...checkLinks(files));
  for (const [file, content] of files) {
    if (!file.endsWith('.html')) continue;
    const left = content.toString('utf8').match(/\{\{[^}]*\}\}/);
    if (left) errors.push(`${file}: ${left[0]} was left in the page`);
  }

  return { files: new Map([...files.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))), errors, stale, missing };
}

/** Every internal link and picture of every page must lead to a file of the site, and a #fragment to an id on that page. */
export function checkLinks(files) {
  const errors = [];
  const ids = new Map();
  for (const [file, content] of files) {
    if (file.endsWith('.html')) ids.set(file, new Set([...content.toString('utf8').matchAll(/\sid="([^"]+)"/g)].map((match) => match[1])));
  }
  for (const [file, content] of files) {
    if (!file.endsWith('.html')) continue;
    const dir = path.posix.dirname(file) === '.' ? '' : path.posix.dirname(file);
    const html = content.toString('utf8').replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
    for (const match of html.matchAll(/\b(href|src)="([^"]*)"/g)) {
      const address = match[2];
      if (/^(https?:|mailto:|data:)/.test(address) || address.startsWith('//')) continue;
      const [bare, fragment] = address.split('#');
      const clean = bare.split('?')[0];
      let target;
      if (clean === '') target = file;
      else {
        let resolved = clean.startsWith('/') ? clean.slice(1) : path.posix.normalize(path.posix.join(dir, clean));
        if (resolved.startsWith('..')) {
          errors.push(`${file}: ${address} leads out of the site`);
          continue;
        }
        resolved = resolved.replace(/^\.\/?/, '');
        if (resolved !== '' && clean.endsWith('/') && !resolved.endsWith('/')) resolved += '/';
        target = fileOf(resolved);
      }
      if (!files.has(target)) {
        errors.push(`${file}: ${match[1]}="${address}" leads nowhere`);
        continue;
      }
      if (fragment && target.endsWith('.html') && !ids.get(target)?.has(fragment)) errors.push(`${file}: ${address} names no id on that page`);
    }
  }
  return errors;
}

/** The anchor GitHub gives a Markdown heading (before a number is added for a repeated one). */
export function headingAnchor(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

/** Every anchor of a Markdown file: its headings as GitHub makes them, and each explicit id. */
export function anchorsOf(markdown) {
  const anchors = new Set();
  const seen = new Map();
  const text = markdown.replace(/^```[\s\S]*?^```/gm, '');
  for (const match of text.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const base = headingAnchor(match[1]);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  for (const match of text.matchAll(/\s(?:id|name)="([^"]+)"/g)) anchors.add(match[1]);
  return anchors;
}

/**
 * The README's translations (docs/i18n/README.<code>.md): one for every language but English, each
 * relative link and picture leading to a file of the checkout, each #fragment to a heading or id of the
 * file it names; and the English README linking to each of them.
 */
export function checkReadmes(root, languages) {
  const errors = [];
  const english = path.join(root, 'README.md');
  const englishText = existsSync(english) ? readFileSync(english, 'utf8') : '';
  const anchorCache = new Map();
  const anchorsOfFile = (file) => {
    if (!anchorCache.has(file)) anchorCache.set(file, anchorsOf(readFileSync(file, 'utf8')));
    return anchorCache.get(file);
  };
  for (const language of languages.slice(1)) {
    const name = `docs/i18n/README.${language.code}.md`;
    const file = path.join(root, name);
    if (!existsSync(file)) {
      errors.push(`${name} does not exist`);
      continue;
    }
    if (!englishText.includes(`(${name})`)) errors.push(`README.md does not link to ${name} under its title`);
    const text = readFileSync(file, 'utf8').replace(/^```[\s\S]*?^```/gm, '').replace(/`[^`\n]*`/g, '');
    const addresses = [...text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g), ...text.matchAll(/\s(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
    for (const address of addresses) {
      if (/^(https?:|mailto:)/.test(address)) continue;
      const [bare, fragment] = address.split('#');
      const target = bare === '' ? file : path.resolve(path.dirname(file), decodeURI(bare));
      if (!target.startsWith(root + path.sep) || !existsSync(target)) {
        errors.push(`${name}: ${address} leads nowhere`);
        continue;
      }
      if (fragment !== undefined && target.endsWith('.md') && !anchorsOfFile(target).has(decodeURIComponent(fragment))) errors.push(`${name}: ${address} names no heading or id there`);
    }
  }
  return errors;
}

/** Which files of a folder differ from the built ones: changed, missing and extra. */
export function compareSite(files, outDir) {
  const differ = [];
  const there = existsSync(outDir) ? new Set(listFiles(outDir)) : new Set();
  for (const [file, content] of files) {
    if (!there.has(file)) differ.push(`missing: ${file}`);
    else if (!readFileSync(path.join(outDir, file)).equals(content)) differ.push(`differs: ${file}`);
  }
  for (const file of there) if (!files.has(file)) differ.push(`not made by the sources: ${file}`);
  return differ;
}

/** Writes the built files into a folder, and removes what the sources no longer make. */
export function writeSite(files, outDir) {
  const there = existsSync(outDir) ? listFiles(outDir) : [];
  for (const file of there) if (!files.has(file)) rmSync(path.join(outDir, file));
  for (const [file, content] of files) {
    const target = path.join(outDir, file);
    if (existsSync(target) && readFileSync(target).equals(content)) continue;
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  // Folders left empty.
  const prune = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) {
        prune(full);
        if (readdirSync(full).length === 0) rmSync(full, { recursive: true });
      }
    }
  };
  if (existsSync(outDir)) prune(outDir);
}

function report(result) {
  const byLanguage = (list) => Object.entries(Object.groupBy(list, (item) => item.language)).map(([language, items]) => `  ${language}: ${items.map((item) => item.key).join(', ')}`);
  if (result.stale.length > 0) console.log(`Stale translations, shown in English until they are made again (${result.stale.length}):\n${byLanguage(result.stale).join('\n')}`);
  if (result.missing.length > 0) console.log(`Missing translations, shown in English (${result.missing.length}):\n${byLanguage(result.missing).join('\n')}`);
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const check = process.argv.includes('--check');
  const result = buildSite(path.join(root, 'site-src'));
  result.errors.push(...checkReadmes(root, readSource(path.join(root, 'site-src')).languages));
  if (result.errors.length > 0) {
    console.error(`The site cannot be built:\n${result.errors.map((error) => `  ${error}`).join('\n')}`);
    process.exit(1);
  }
  report(result);
  const outDir = path.join(root, 'site');
  if (check) {
    const differ = compareSite(result.files, outDir);
    if (differ.length > 0) {
      console.error(`site/ is not what site-src/ gives. Run pnpm site.\n${differ.map((line) => `  ${line}`).join('\n')}`);
      process.exit(1);
    }
    console.log(`site/ is up to date: ${result.files.size} files.`);
    return;
  }
  writeSite(result.files, outDir);
  console.log(`Wrote ${result.files.size} files to site/.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
