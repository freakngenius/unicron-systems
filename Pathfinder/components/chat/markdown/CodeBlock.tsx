'use client';

import * as React from 'react';

// Minimal code-block renderer.
//
// PR #38 originally routed through Shiki for syntax highlighting via a
// dynamic `import('shiki')`. Build succeeded but the Vercel deploy phase
// errored — Shiki ships ~5 MB of grammar JSON and pushed the function
// bundle past its size limit. Stripped here to unblock production; PR
// description notes the follow-up path.
//
// Re-introducing colors later: prefer `lowlight` + a tiny language
// subset (ts/tsx/json/sql/bash) registered explicitly. Keep this file
// `'use client'` so the highlighter never enters a server bundle.

export function CodeBlock({
  language,
  code,
}: {
  language: string;
  code: string;
}) {
  void React;
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
