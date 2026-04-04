/**
 * Shared markdown detection utilities.
 * Used by both webClient.ts and MessageBubble.tsx.
 */

export const MARKDOWN_PATTERNS: RegExp[] = [
  /^#{1,6}\s/m,           // headings
  /\*\*[^*]+\*\*/,         // bold
  /\*[^*]+\*/,             // italic
  /^[-*+]\s/m,             // unordered list
  /^\d+\.\s/m,             // ordered list
  /^```[\s\S]*?```/m,      // code blocks
  /`[^`]+`/,               // inline code
  /^\|.*\|$/m,             // table rows
  /\[.+\]\(.+\)/,          // links
  /^>\s/m,                 // blockquotes
];

/**
 * Detect if content looks like Markdown.
 * Simple heuristic: check for common markdown patterns.
 * Returns true if at least 2 patterns match.
 */
export function detectMarkdown(content: string): boolean {
  if (!content || content.length < 10) return false;
  let matchCount = 0;
  for (const p of MARKDOWN_PATTERNS) {
    if (p.test(content)) matchCount++;
  }
  return matchCount >= 2;
}
