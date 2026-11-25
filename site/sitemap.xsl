<?xml version="1.0" encoding="UTF-8"?>
<!--
  Shows sitemap.xml to a person who opens it in a browser: one row per page, its English
  address first, when it last changed, and its other languages beside it. A crawler reads the
  XML and never this. The colors and type are the site's tokens (site-src/style.css, one theme), written
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
        <meta name="color-scheme" content="light"/>
        <meta name="robots" content="noindex"/>
        <title>Sitemap · Aubergine</title>
        <link rel="icon" href="/icon.svg" type="image/svg+xml"/>
        <style>
@font-face { font-family: "Bricolage Grotesque"; font-style: normal; font-display: swap; font-weight: 200 800; src: url(/fonts/bricolage-grotesque-latin-wght-normal.woff2) format("woff2"); }
:root {
  color-scheme: light;
  --cream: #F7F0E4; --lilac: #EEE5EC; --ink: #1F1023; --muted: #58475C; --purple: #5E2580; --lavender: #D6B8E8;
  --font-head: "Bricolage Grotesque", system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif;
  --font-body: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Helvetica Neue", Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  --rule: 2px; --radius: 8px; --gutter: clamp(1rem, 0.4rem + 2.6vw, 3rem);
}
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; background: var(--cream); color: var(--ink); font: 400 1.0625rem/1.6 var(--font-body); -webkit-font-smoothing: antialiased; overflow-wrap: break-word; }
a { color: inherit; text-decoration-thickness: 2px; text-underline-offset: 0.18em; text-decoration-color: var(--purple); }
:focus-visible { outline: 3px solid var(--purple); outline-offset: 3px; border-radius: 4px; }
.wrap { max-width: 84rem; margin-inline: auto; padding-inline: var(--gutter); }
.top { border-block-end: var(--rule) solid var(--ink); }
.top .wrap { display: flex; align-items: center; min-height: 4.25rem; }
.mark { display: inline-flex; align-items: center; gap: 12px; text-decoration: none; font-family: var(--font-head); font-weight: 800; font-size: 1.25rem; letter-spacing: -0.02em; }
.mark img { width: 32px; height: 32px; }
.head { padding-block: clamp(2.5rem, 1.5rem + 3vw, 5rem) 3rem; }
.crumb { font: 700 0.8125rem/1.4 var(--font-mono); text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
h1 { font-family: var(--font-head); font-weight: 800; line-height: 0.94; letter-spacing: -0.045em; margin: 1.5rem 0 0; font-size: clamp(2.375rem, 0.9rem + 5vw, 5.5rem); }
.lead { margin: 2rem 0 0; font-size: clamp(1.25rem, 1.05rem + 0.7vw, 1.625rem); line-height: 1.45; max-width: 44ch; }
.lead + p { margin: 1rem 0 0; color: var(--muted); max-width: 68ch; font-size: 0.9375rem; }
code { font-family: var(--font-mono); font-size: 0.88em; padding: 0.05em 0.35em; border-radius: 4px; background: color-mix(in srgb, var(--ink) 8%, transparent); }
.list { list-style: none; margin: 0; padding: 0; border-block-start: var(--rule) solid var(--ink); }
.list > li { display: grid; gap: 6px 32px; padding-block: 16px; border-block-end: 1px solid #CDBFC6; }
.list > li:last-child { border-block-end: var(--rule) solid var(--ink); }
.list .labels { display: none; }
.address { font-family: var(--font-mono); font-size: 0.9375rem; font-weight: 700; text-decoration: none; overflow-wrap: anywhere; }
.address:hover { text-decoration: underline; text-decoration-color: var(--purple); }
.when { color: var(--muted); font-size: 0.9375rem; font-variant-numeric: tabular-nums; }
.langs { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.langs a { display: inline-block; min-width: 2.8em; padding: 1px 8px; border: var(--rule) solid var(--ink); border-radius: 6px; background: var(--cream); font-family: var(--font-mono); font-size: 0.8125rem; font-weight: 700; line-height: 1.7; text-align: center; text-decoration: none; }
.langs a:hover { background: var(--lilac); }
.label { color: var(--muted); font-size: 0.8125rem; }
@media (min-width: 820px) {
  .list > li { grid-template-columns: minmax(14rem, 1fr) 8rem minmax(0, 1.7fr); align-items: baseline; }
  .list .labels { display: grid; padding-block: 10px; border-block-end: var(--rule) solid var(--ink); }
  .list .labels span { font-family: var(--font-head); font-weight: 700; font-size: 1rem; }
  .list > li:not(.labels) .label { display: none; }
  .list { border-block-start: 0; }
}
@media (max-width: 819px) {
  .when .label::after { content: " "; }
}
.foot { margin-block-start: 4rem; padding-block: 2rem 4rem; border-block-start: var(--rule) solid var(--ink); color: var(--muted); font-size: 0.9375rem; }
        </style>
      </head>
      <body>
        <header class="top">
          <div class="wrap"><a class="mark" href="/"><img src="/icon.svg" alt="" width="32" height="32"/>Aubergine</a></div>
        </header>
        <main class="wrap">
          <div class="head">
            <p class="crumb">Aubergine / Sitemap</p>
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
