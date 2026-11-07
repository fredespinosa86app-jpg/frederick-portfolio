// SE-P1: the owner's private documents (internal-docs/, the review pack, KNOWN-ISSUES.md, the full README ...) are NOT in the public repository.
// Tools and tests look for them in: $PRIVATE_DOCS, else ../private-docs next to the repository folder. When absent (for example in GitHub Actions) they say so and skip.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PRIVATE_FILES = ['SECURITY-REVIEW-PACK.md', 'SECURITY-FINAL-REPORT.md', 'SECURITY-REVIEW-OWNER-CHECKLIST.md', 'KNOWN-ISSUES.md', 'README-FULL.md'];
export const PRIVATE_DIRS = ['internal-docs'];
export const privateRoot = () => { const c = [process.env.PRIVATE_DOCS, path.resolve(root, '..', 'private-docs')].filter(Boolean); return c.find(d => fs.existsSync(path.join(d, 'SECURITY-REVIEW-PACK.md'))) || null; };
/* every private file as a path relative to the private root, e.g. 'internal-docs/open-items.md' */
export const privateList = () => { const r = privateRoot(); if (!r) return []; const out = PRIVATE_FILES.filter(f => fs.existsSync(path.join(r, f))); for (const d of PRIVATE_DIRS) if (fs.existsSync(path.join(r, d))) for (const f of fs.readdirSync(path.join(r, d))) out.push(d + '/' + f); return out.sort(); };
