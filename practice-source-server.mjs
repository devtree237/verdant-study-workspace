import { createReadStream, readFileSync, statSync } from 'node:fs';

const localAddresses = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

// The supplied PDFs stay outside the project. A local checkout can opt in to
// serving them to its own browser without copying them into the build.
export function practiceSourceServer() {
  const localConfig = new URL('./.local/practice-books.json', import.meta.url);
  let files = {};
  try { files = JSON.parse(readFileSync(localConfig, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }

  function configure(server) {
    server.middlewares.use((request, response, next) => {
      const path = request.url?.split('?')[0] ?? '';
      const book = path.match(/^\/practice-library\/source\/(chemistry|physics|mathematics)\.pdf$/)?.[1];
      if (!book) return next();
      const file = files[book];
      if (!localAddresses.has(request.socket.remoteAddress) || typeof file !== 'string' ||
          !['GET', 'HEAD'].includes(request.method)) {
        response.writeHead(404).end();
        return;
      }

      let size;
      try {
        const source = statSync(file);
        if (!source.isFile()) throw new Error('Source is unavailable');
        size = source.size;
      } catch {
        response.writeHead(404).end();
        return;
      }

      const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      const start = range ? Number(range[1]) : 0;
      const end = range?.[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if ((request.headers.range && !range) || start > end || start >= size) {
        response.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
        return;
      }

      response.writeHead(range ? 206 : 200, {
        'Content-Type': 'application/pdf',
        'Content-Length': end - start + 1,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, no-store',
        'Cross-Origin-Resource-Policy': 'same-origin',
        ...(range && { 'Content-Range': `bytes ${start}-${end}/${size}` }),
      });
      if (request.method === 'HEAD') { response.end(); return; }
      const stream = createReadStream(file, { start, end });
      response.on('close', () => stream.destroy());
      stream.on('error', error => response.destroy(error));
      stream.pipe(response);
    });
  }

  return { name: 'verdant-local-practice-sources', configureServer: configure, configurePreviewServer: configure };
}
