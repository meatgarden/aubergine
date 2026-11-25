<?xml version="1.0" encoding="UTF-8"?>
<!--
  Shows sitemap.xml to a person who opens it in a browser: one row per page, its English
  address first, when it last changed, and its other languages beside it. A crawler reads the
  XML and never this. The colors and type are the site's tokens (site-src/style.css), written
  here because a stylesheet of the page may not load for a transformed document. No script.
-->
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xhtml="http://www.w3.org/1999/xhtml"
  exclude-result-prefixes="sm xhtml">
  <xsl:output method="html" encoding="UTF-8" indent="yes" doctype-system="about:legacy-compat"/>

  <xsl:variable name="origin" select="'https://thirstyeggplant.com'"/>
  <!-- The English address of each page: the one its x-default names. -->
  <xsl:variable name="pages" select="/sm:urlset/sm:url[sm:loc = xhtml:link[@hreflang = 'x-default']/@href]"/>

  <xsl:template match="/">
    <html lang="en" dir="ltr">
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <meta name="color-scheme" content="dark light"/>
        <meta name="robots" content="noindex"/>
        <title>Sitemap · Aubergine</title>
        <link rel="icon" href="/icon.svg" type="image/svg+xml"/>
        <style>
@font-face { font-family: "Bricolage Grotesque"; font-style: normal; font-display: swap; font-weight: 200 800; src: url(/fonts/bricolage-grotesque-latin-wght-normal.woff2) format("woff2"); }
:root {
  color-scheme: dark;
  --ground: #120f14; --raised: #1a161d; --line: #2c2531; --text: #f2ebf1; --quiet: #a89dab;
  --aubergine: #c690c1; --deep: #5a2956;
  --face-head: "Bricolage Grotesque", system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif;
  --face-text: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Helvetica Neue", Arial, sans-serif;
  --face-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  --corner: 10px;
}
@media (prefers-color-scheme: light) {
  :root { color-scheme: light; --ground: #faf6f2; --raised: #ffffff; --line: #e7ddd9; --text: #201a22; --quiet: #655a6b; --aubergine: #6b2f66; --deep: #ead9e8; }
}
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; background: var(--ground); color: var(--text); font: 400 1.0625rem/1.65 var(--face-text); -webkit-font-smoothing: antialiased; overflow-wrap: break-word; }
a { color: var(--aubergine); text-underline-offset: 0.2em; text-decoration-thickness: 1px; transition: color 120ms; }
a:hover { text-decoration-thickness: 2px; }
:focus-visible { outline: 2px solid var(--aubergine); outline-offset: 3px; border-radius: 4px; }
.wrap { max-width: 72rem; margin-inline: auto; padding-inline: 20px; }
.top { border-block-end: 1px solid var(--line); }
.top .wrap { display: flex; align-items: center; min-height: 64px; }
.mark { display: inline-flex; align-items: center; gap: 10px; color: var(--text); text-decoration: none; font-family: var(--face-head); font-weight: 750; font-size: 1.328rem; letter-spacing: -0.02em; }
.mark img { width: 28px; height: 28px; }
h1 { font-family: var(--face-head); font-weight: 750; line-height: 1.12; letter-spacing: -0.02em; margin: 0; font-size: clamp(2.075rem, 6vw, 3.242rem); }
.head { padding-block: 56px 32px; }
.lead { margin: 20px 0 0; font-size: 1.328rem; line-height: 1.5; max-width: 34em; }
.lead + p { margin: 12px 0 0; color: var(--quiet); max-width: 68ch; font-size: 0.94rem; }
code { font-family: var(--face-mono); font-size: 0.88em; padding: 0.05em 0.35em; border: 1px solid var(--line); border-radius: 5px; background: var(--raised); }
.list { list-style: none; margin: 0; padding: 0; border-block-start: 1px solid var(--line); }
.list > li { display: grid; gap: 6px 32px; padding-block: 16px; border-block-end: 1px solid var(--line); }
.list .labels { display: none; }
.address { font-family: var(--face-mono); font-size: 0.94rem; font-weight: 600; text-decoration: none; overflow-wrap: anywhere; }
.address:hover { text-decoration: underline; }
.when { color: var(--quiet); font-size: 0.94rem; font-variant-numeric: tabular-nums; }
.langs { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.langs a { display: inline-block; min-width: 2.6em; padding: 1px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--raised); color: var(--text); font-family: var(--face-mono); font-size: 0.8rem; line-height: 1.7; text-align: center; text-decoration: none; transition: border-color 120ms, color 120ms; }
.langs a:hover { border-color: var(--aubergine); color: var(--aubergine); }
.label { color: var(--quiet); font-size: 0.85rem; }
@media (min-width: 820px) {
  .list > li { grid-template-columns: minmax(14rem, 1fr) 8rem minmax(0, 1.7fr); align-items: baseline; }
  .list .labels { display: grid; padding-block: 10px; }
  .list .labels span { color: var(--quiet); font-size: 0.85rem; }
  .list > li:not(.labels) .label { display: none; }
}
@media (max-width: 819px) {
  .when .label::after { content: " "; }
}
.foot { padding-block: 32px 64px; color: var(--quiet); font-size: 0.94rem; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
        </style>
      </head>
      <body>
        <header class="top">
          <div class="wrap"><a class="mark" href="/"><img src="/icon.svg" alt="" width="28" height="28"/>Aubergine</a></div>
        </header>
        <main class="wrap">
          <div class="head">
            <h1>Sitemap</h1>
            <p class="lead">Every page of the site, each with its translations beside it.</p>
            <p>Search engines read this file as it is, in XML; this view of it is for people. <xsl:value-of select="count($pages)"/> pages in <xsl:value-of select="count($pages[1]/xhtml:link[@hreflang != 'x-default'])"/> languages, <xsl:value-of select="count(/sm:urlset/sm:url)"/> addresses.</p>
          </div>
          <ul class="list">
            <li class="labels" aria-hidden="true"><span>Page, in English</span><span>Last changed</span><span>Other languages</span></li>
            <xsl:for-each select="$pages">
              <li>
                <a class="address" href="{sm:loc}">
                  <xsl:variable name="path" select="substring-after(sm:loc, $origin)"/>
                  <xsl:value-of select="$path"/>
                </a>
                <span class="when"><span class="label">Last changed</span><xsl:choose><xsl:when test="sm:lastmod"><time datetime="{sm:lastmod}"><xsl:value-of select="sm:lastmod"/></time></xsl:when><xsl:otherwise>–</xsl:otherwise></xsl:choose></span>
                <ul class="langs">
                  <xsl:attribute name="aria-label">Other languages of <xsl:value-of select="substring-after(sm:loc, $origin)"/></xsl:attribute>
                  <xsl:for-each select="xhtml:link[@hreflang != 'x-default' and @href != current()/sm:loc]">
                    <li><a href="{@href}" hreflang="{@hreflang}" title="{@href}"><xsl:value-of select="@hreflang"/></a></li>
                  </xsl:for-each>
                </ul>
              </li>
            </xsl:for-each>
          </ul>
          <p class="foot">The file is <code>sitemap.xml</code>, named in <a href="/robots.txt">robots.txt</a>. Back to <a href="/">Aubergine</a>.</p>
        </main>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
