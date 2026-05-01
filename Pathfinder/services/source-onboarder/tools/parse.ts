// services/source-onboarder/tools/parse.ts
//
// parseHtml / parseJson / parseXml. Zero-dep implementations sufficient for
// classification + schema introspection. The agent never executes the parsed
// HTML; we only need text + the form/script signals that distinguish a
// JS-rendered SPA from a static page.

export interface HtmlParseResult {
  text: string;
  hasJsRenderRoot: boolean;       // detected React/Vue/Angular mount node or hydration script
  hasLoginForm: boolean;
  links: string[];
  forms: number;
  scripts: number;
  schemaHints: {
    apiCandidates: string[];     // discovered href/data-url that look like API endpoints
    rssCandidates: string[];     // <link rel="alternate" type="application/rss+xml" ...>
  };
}

const SPA_SIGNALS = [
  /<div\s+id=["']root["']/i,
  /<div\s+id=["']app["']/i,
  /<div\s+id=["']__next["']/i,
  /window\.__INITIAL_STATE__/,
  /window\.__NUXT__/,
  /ng-app=/i,
  /data-react-helmet/i,
  /v-app/i,
];

export function parseHtml(html: string): HtmlParseResult {
  const text = stripTags(html);
  const links = Array.from(html.matchAll(/href=["']([^"']+)["']/gi)).map((m) => m[1]);
  const forms = (html.match(/<form\b/gi) ?? []).length;
  const scripts = (html.match(/<script\b/gi) ?? []).length;
  const hasLoginForm = /\b(login|sign\s*in|password)\b/i.test(html) && forms > 0;
  const hasJsRenderRoot = SPA_SIGNALS.some((re) => re.test(html));
  const apiCandidates = links.filter((l) => /\/api\/|\.json(\?|$)|\/odata\/|\/v\d\//i.test(l));
  const rssCandidates: string[] = [];
  const rssMatches = html.matchAll(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/gi);
  for (const m of rssMatches) {
    const hrefMatch = m[0].match(/href=["']([^"']+)["']/i);
    if (hrefMatch) rssCandidates.push(hrefMatch[1]);
  }
  return {
    text: text.slice(0, 8000),
    hasJsRenderRoot,
    hasLoginForm,
    links,
    forms,
    scripts,
    schemaHints: { apiCandidates, rssCandidates },
  };
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseJson(text: string): unknown {
  return JSON.parse(text);
}

// Lightweight XML parser — produces a tag-tree adequate for sniffing RSS,
// Atom, OData feed shapes. For schema-bearing XML we return only top-level
// element names + counts, which is what the onboarder needs to classify.

export interface XmlParseResult {
  rootName: string;
  isRss: boolean;
  isAtom: boolean;
  isOData: boolean;
  itemCount: number;
  topLevelTags: string[];
  raw: string;
}

export function parseXml(text: string): XmlParseResult {
  const rootMatch = text.match(/<\s*([A-Za-z_][A-Za-z0-9:_\-]*)\b/);
  const rootName = rootMatch ? rootMatch[1] : '';
  const isRss = /<rss\b/i.test(text) || /<channel\b/i.test(text);
  const isAtom = /<feed\b[^>]*xmlns=["'][^"']*atom/i.test(text);
  const isOData = /<feed\b[^>]*xmlns=["'][^"']*odata|<edmx/i.test(text);
  const items =
    text.match(/<item\b/gi)?.length ??
    text.match(/<entry\b/gi)?.length ??
    0;
  const topLevelTags = Array.from(
    new Set(Array.from(text.matchAll(/<\s*([A-Za-z_][A-Za-z0-9:_\-]*)/g)).map((m) => m[1]))
  ).slice(0, 30);
  return {
    rootName,
    isRss,
    isAtom,
    isOData,
    itemCount: items,
    topLevelTags,
    raw: text.slice(0, 4000),
  };
}
