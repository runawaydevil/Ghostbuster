import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const siteCssPath = join(scriptDirectory, '..', 'templates', 'site.css');
let embeddedSiteCssCache: string | undefined;

export function loadEmbeddedSiteCss(): string {
  if (embeddedSiteCssCache === undefined) {
    embeddedSiteCssCache = readFileSync(siteCssPath, 'utf-8');
  }

  return embeddedSiteCssCache;
}
