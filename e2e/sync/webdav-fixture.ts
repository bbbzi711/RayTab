import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

export const username = 'webdav-fixture-user';
export const appPassword = 'webdav-fixture-app-password';

export async function webDavFixture(failure?: 401 | 403) {
  const events: {
    method: string;
    path: string;
    status: number;
    ifMatch?: string;
    ifNoneMatch?: string;
  }[] = [];
  let content: string | undefined;
  let version = 0;
  const authorization = `Basic ${Buffer.from(`${username}:${appPassword}`).toString('base64')}`;
  const server = createServer(async (request, response) => {
    const method = request.method ?? '';
    const path = request.url ?? '';
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type, If-Match, If-None-Match',
    );
    response.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS, PROPFIND');
    response.setHeader('Access-Control-Expose-Headers', 'ETag');
    const send = (status: number, body = '') => {
      events.push({
        method,
        path,
        status,
        ifMatch: request.headers['if-match'],
        ifNoneMatch: request.headers['if-none-match'],
      });
      response.writeHead(status);
      response.end(body);
    };
    if (method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }
    if (request.headers.authorization !== authorization) {
      send(401);
      return;
    }
    if (path === '/dav/' || path === '/') {
      send(method === 'PROPFIND' ? 207 : 403);
      return;
    }
    if (path !== '/dav/raytab.json') {
      send(404);
      return;
    }
    if (failure) {
      send(failure);
      return;
    }
    const etag = `"${version}"`;
    if (method === 'GET') {
      if (content !== undefined) {
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('ETag', etag);
      }
      send(content === undefined ? 404 : 200, content);
      return;
    }
    if (method === 'PUT') {
      if (
        (content === undefined && request.headers['if-none-match'] !== '*') ||
        (content !== undefined && request.headers['if-match'] !== etag)
      ) {
        send(412);
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const created = content === undefined;
      content = Buffer.concat(chunks).toString('utf8');
      response.setHeader('ETag', `"${++version}"`);
      send(created ? 201 : 200);
      return;
    }
    send(405);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    origin,
    url: `${origin}/dav/raytab.json`,
    events,
    content: () => content,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
