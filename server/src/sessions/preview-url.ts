import { stripAnsi } from './status-detector';

const LOCAL_URL =
  /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]):(\d{2,5})(?:\/[^\s'"<>`]*)?/g;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}]+$/;

/**
 * Local dev-server URLs printed in terminal output (Vite's "Local: http://localhost:5173/",
 * Next's "- Local: http://localhost:3000", ...), oldest first. Wildcard and IPv6 loopback
 * hosts become `localhost` so the browser can open them; `ignorePorts` drops URLs such as
 * Pangkalan's own hook endpoint. With `streaming`, a URL running into the end of the text is
 * skipped: the rest of it (say, the "73" of port 5173) may still be on its way.
 */
export function extractLocalUrls(
  text: string,
  {
    ignorePorts = [],
    streaming = false,
  }: { ignorePorts?: readonly number[]; streaming?: boolean } = {},
): string[] {
  const plain = stripAnsi(text);
  const urls: string[] = [];
  for (const match of plain.matchAll(LOCAL_URL)) {
    if (streaming && match.index + match[0].length === plain.length) continue;
    const port = Number(match[1]);
    if (port < 1 || port > 65535 || ignorePorts.includes(port)) continue;
    const url = match[0]
      .replace(TRAILING_PUNCTUATION, '')
      .replace(/\/\/(?:0\.0\.0\.0|\[::1?\])/, '//localhost');
    urls.push(url);
  }
  return urls;
}
