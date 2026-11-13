import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage } from 'node:http';
import type { Plugin } from 'vite';

// The product roadmap is one JSON file in the repo, so it is versioned with
// the code, survives database resets, and reads the same from every admin.
// This dev-server-only endpoint lets the Dev → Roadmap page edit it. It never
// exists in a production build (`apply: 'serve'`).
const FILE = fileURLToPath(new URL('../../docs/product-roadmap.json', import.meta.url));
const ROUTE = '/__dev/roadmap';

interface RoadmapDoc {
  version: 1;
  updatedAt: string;
  items: unknown[];
}

async function load(): Promise<RoadmapDoc> {
  try {
    return JSON.parse(await readFile(FILE, 'utf8')) as RoadmapDoc;
  } catch {
    return { version: 1, updatedAt: '', items: [] };
  }
}

async function body(req: IncomingMessage): Promise<string> {
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 1_000_000) throw new Error('Roadmap too large');
  }
  return text;
}

export function roadmapFile(): Plugin {
  return {
    name: 'voltara-roadmap-file',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(ROUTE, (req, res) => {
        const send = (status: number, payload: unknown) => {
          res.statusCode = status;
          res.setHeader('content-type', 'application/json');
          res.setHeader('cache-control', 'no-store');
          res.end(JSON.stringify(payload));
        };
        void (async () => {
          try {
            const current = await load();
            if (req.method === 'GET') return send(200, current);
            if (req.method !== 'PUT') return send(405, { error: 'GET or PUT' });

            const next = JSON.parse(await body(req)) as { base?: string; items?: unknown };
            if (!Array.isArray(next.items)) return send(400, { error: 'items must be a list' });
            // Someone else (another tab, another admin, a git pull) changed the
            // file since this page loaded it: hand back the current copy
            // rather than overwrite their edit.
            if ((next.base ?? '') !== current.updatedAt) return send(409, current);

            const saved: RoadmapDoc = {
              version: 1,
              updatedAt: new Date().toISOString(),
              items: next.items,
            };
            await writeFile(FILE, `${JSON.stringify(saved, null, 2)}\n`);
            send(200, saved);
          } catch (err) {
            send(500, { error: err instanceof Error ? err.message : 'Roadmap error' });
          }
        })();
      });
    },
  };
}
