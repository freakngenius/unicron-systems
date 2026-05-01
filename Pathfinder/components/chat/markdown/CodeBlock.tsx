'use client';

import * as React from 'react';

// Lazy-loaded Shiki code block. The shiki module + theme JSON only get
// pulled into the bundle on the first chat response that contains a code
// fence. The synchronous fallback below is what renders during the async
// boot — semantically correct, just unhighlighted.

type Highlighter = {
  codeToHtml: (code: string, opts: { lang: string; theme: string }) => string;
};

let cachedHighlighter: Highlighter | null = null;
let highlighterPromise: Promise<Highlighter> | null = null;

function loadHighlighter(): Promise<Highlighter> {
  if (cachedHighlighter) return Promise.resolve(cachedHighlighter);
  if (highlighterPromise) return highlighterPromise;
  highlighterPromise = import('shiki')
    .then((m) =>
      m.createHighlighter({
        themes: ['github-light'],
        // Cover the languages the chat is most likely to emit. Shiki lazy-
        // loads grammars on demand from the bundled module, so this list is
        // a hint, not a hard limit.
        langs: ['ts', 'tsx', 'js', 'json', 'sql', 'bash', 'sh', 'md', 'python'],
      }),
    )
    .then((hl) => {
      cachedHighlighter = hl as unknown as Highlighter;
      return cachedHighlighter;
    });
  return highlighterPromise;
}

export function CodeBlock({
  language,
  code,
}: {
  language: string;
  code: string;
}) {
  const [html, setHtml] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    loadHighlighter()
      .then((hl) => {
        if (cancelled) return;
        try {
          const out = hl.codeToHtml(code, { lang: language || 'text', theme: 'github-light' });
          setHtml(out);
        } catch {
          // Unsupported language. Fall back to the unhighlighted block.
          setHtml(null);
        }
      })
      .catch(() => {
        // Module load failed (offline build, etc.). Stay unhighlighted.
      });
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  if (html) {
    // shiki already wraps the snippet in <pre><code>…</code></pre> with
    // background-color set inline. We add Tailwind for spacing + radius.
    return (
      <div
        className="my-3 overflow-x-auto rounded-md border border-rule/15 bg-bgAlt text-[12px] leading-[1.55] [&_pre]:bg-transparent [&_pre]:p-3 [&_pre]:m-0"
        data-testid="cell-code"
        data-language={language || 'text'}
        // dangerouslySetInnerHTML is safe here — shiki's output is HTML it
        // generated from the code string we passed it; no user-controlled
        // markup gets through.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <div
      className="my-3 overflow-x-auto rounded-md border border-rule/15 bg-bgAlt"
      data-testid="cell-code"
      data-language={language || 'text'}
    >
      <pre className="m-0 p-3 text-[12px] leading-[1.55] font-mono text-ink">
        <code>{code}</code>
      </pre>
    </div>
  );
}
