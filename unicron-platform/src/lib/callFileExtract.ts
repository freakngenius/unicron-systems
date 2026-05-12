// callFileExtract.ts — browser-side extraction for transcript/summary uploads
// Item 1 of the Atrium usefulness pass (2026-05-12).
//
// Handles .txt, .md, .markdown, .docx, .vtt, .srt. Returns clean text plus a
// best-effort metadata pass (title, date, participants) that the modal uses
// to pre-fill its fields. The extractor is intentionally heuristic — every
// field is editable by the operator before submit.

export interface ExtractResult {
  text: string;
  title?: string;
  date?: string;         // ISO yyyy-mm-dd
  participants?: string[];
}

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

function detectIsoDate(s: string): string | undefined {
  // Look for yyyy-mm-dd or yyyy_mm_dd in the first 200 chars or filename.
  const m = s.match(/(\d{4})[-_.](\d{2})[-_.](\d{2})/);
  if (!m) return undefined;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return undefined;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function detectTitle(text: string, filename: string): string | undefined {
  // Prefer first markdown heading; fall back to filename without extension.
  const headingMatch = text.match(/^\s{0,3}#{1,3}\s+(.+)$/m);
  if (headingMatch) return headingMatch[1].trim().slice(0, 120);
  const trimmedName = stripExt(filename).replace(/[_-]+/g, ' ').trim();
  return trimmedName || undefined;
}

function detectParticipants(text: string): string[] {
  const out: string[] = [];
  // Pattern 1: explicit Attendees:/Participants: line.
  const attLine = text.match(/^(?:Attendees|Participants|Present)\s*[:\-]\s*(.+)$/im);
  if (attLine) {
    const parts = attLine[1].split(/[,;]| and /).map((p) => p.trim()).filter(Boolean);
    out.push(...parts);
  }
  // Pattern 2: speaker tags like "Kyle Kesterson:" at the start of a line.
  if (out.length === 0) {
    const seen = new Set<string>();
    const speakerMatches = text.matchAll(/^([A-Z][a-zA-Z'\-]+(?:\s+[A-Z][a-zA-Z'\-]+){0,3})\s*:\s/gm);
    for (const m of speakerMatches) {
      const name = m[1].trim();
      // Filter obvious junk like "VTT" / "WEBVTT" / single-word common words.
      if (name.length < 3 || /^(WEBVTT|NOTE|STYLE|REGION|CUE|SPEAKER)$/i.test(name)) continue;
      const key = name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(name);
      }
      if (out.length >= 12) break;
    }
  }
  return out;
}

function stripVttSrtTimestamps(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const cleaned: string[] = [];
  let lastWasBlank = false;
  for (const ln of lines) {
    const trimmed = ln.trim();
    if (!trimmed) {
      if (!lastWasBlank) cleaned.push('');
      lastWasBlank = true;
      continue;
    }
    // VTT header
    if (/^WEBVTT/i.test(trimmed)) continue;
    // SRT cue index (a bare integer)
    if (/^\d+$/.test(trimmed)) continue;
    // VTT/SRT timestamp lines (00:00:00.000 --> 00:00:01.000)
    if (/^\d{1,2}:\d{2}(:\d{2})?[.,]\d{1,3}\s*-->/.test(trimmed)) continue;
    // VTT NOTE / STYLE / REGION blocks
    if (/^(NOTE|STYLE|REGION)\b/i.test(trimmed)) continue;
    cleaned.push(trimmed);
    lastWasBlank = false;
  }
  return cleaned.join('\n').replace(/\n{3,}/g, '\n\n');
}

async function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsText(file);
  });
}

async function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsArrayBuffer(file);
  });
}

async function extractDocx(file: File): Promise<string> {
  const arrayBuffer = await readAsArrayBuffer(file);
  // Mammoth has a browser bundle. Dynamic import keeps it out of the main chunk.
  const mammoth = await import('mammoth/mammoth.browser.js').catch(() => import('mammoth'));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lib: any = (mammoth as any).default ?? mammoth;
  const { value } = await lib.extractRawText({ arrayBuffer });
  return value as string;
}

export async function extractFromFile(file: File): Promise<ExtractResult> {
  const name = file.name.toLowerCase();
  let text = '';

  if (name.endsWith('.docx')) {
    text = await extractDocx(file);
  } else if (name.endsWith('.vtt') || name.endsWith('.srt')) {
    const raw = await readAsText(file);
    text = stripVttSrtTimestamps(raw);
  } else if (name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.markdown')) {
    text = await readAsText(file);
  } else {
    // Fallback: try reading as text. Will still surface in the textarea so the
    // operator can scrub it before submit.
    text = await readAsText(file);
  }

  // Metadata heuristics: filename first, content second.
  const filenameDate = detectIsoDate(file.name);
  const contentDate = !filenameDate ? detectIsoDate(text.slice(0, 400)) : undefined;
  const date = filenameDate ?? contentDate;
  const title = detectTitle(text, file.name);
  const participants = detectParticipants(text);

  return { text, title, date, participants };
}
