import process from 'node:process';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { Hono } from 'hono';
import { getConfig } from '../packages/app-server/src/modules/app/config/config';
import { createServer } from '../packages/app-server/src/modules/app/server';
import { createFsLiteStorage } from '../packages/app-server/src/modules/storage/factories/fs-lite.storage';
import { createUpstashStorage } from '../packages/app-server/src/modules/storage/factories/upstash.storage';

const missingStorageError = {
  error: 'Missing persistent storage configuration. Install the Upstash integration on this Vercel project so UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are available.',
};

let app: Hono | undefined;

function getApp() {
  if (app) {
    return app;
  }

  const appConfig = getConfig({ env: process.env });
  const hasUpstashEnv = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  const isVercelRuntime = process.env.VERCEL === '1';

  if (isVercelRuntime && !hasUpstashEnv) {
    app = new Hono();

    app.get('/api/ping', context => context.json({ status: 'ok' }));
    app.all('/api/*', context => context.json(missingStorageError, 503));

    return app;
  }

  const { storage } = hasUpstashEnv
    ? createUpstashStorage()
    : createFsLiteStorage({ config: appConfig });

  ({ app } = createServer({
    config: appConfig,
    storageFactory: () => ({ storage }),
  }));

  return app;
}

function createFetchRequest(request: IncomingMessage) {
  const headers = new Headers();

  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    const key = request.rawHeaders[index];
    const value = request.rawHeaders[index + 1];

    if (key && value && !key.startsWith(':')) {
      headers.append(key, value);
    }
  }

  const host = headers.get('host') ?? process.env.VERCEL_URL ?? 'localhost';
  const protocol = headers.get('x-forwarded-proto') ?? 'https';
  const url = new URL(request.url ?? '/', `${protocol}://${host}`);
  const method = request.method ?? 'GET';
  const init: RequestInit & { duplex?: 'half' } = { headers, method };

  if (method !== 'GET' && method !== 'HEAD') {
    init.body = Readable.toWeb(request) as unknown as BodyInit;
    init.duplex = 'half';
  }

  return new Request(url, init);
}

function applyHeaders(fetchResponse: Response, serverResponse: ServerResponse) {
  fetchResponse.headers.forEach((value, key) => {
    if (key !== 'set-cookie') {
      serverResponse.setHeader(key, value);
    }
  });

  const cookies = (fetchResponse.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.();

  if (cookies?.length) {
    serverResponse.setHeader('set-cookie', cookies);

    return;
  }

  const cookie = fetchResponse.headers.get('set-cookie');

  if (cookie) {
    serverResponse.setHeader('set-cookie', cookie);
  }
}

async function sendFetchResponse(fetchResponse: Response, serverResponse: ServerResponse) {
  serverResponse.statusCode = fetchResponse.status;

  if (fetchResponse.statusText) {
    serverResponse.statusMessage = fetchResponse.statusText;
  }

  applyHeaders(fetchResponse, serverResponse);

  if (!fetchResponse.body) {
    serverResponse.end();

    return;
  }

  const body = Buffer.from(await fetchResponse.arrayBuffer());

  if (!serverResponse.hasHeader('content-length')) {
    serverResponse.setHeader('content-length', body.byteLength);
  }

  serverResponse.end(body);
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  const fetchRequest = createFetchRequest(request);
  const fetchResponse = await getApp().fetch(fetchRequest);

  await sendFetchResponse(fetchResponse, response);
}
