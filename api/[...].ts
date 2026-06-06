import process from 'node:process';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handle } from '@hono/node-server/vercel';
import { Hono } from 'hono';
import { getConfig } from '../packages/app-server/src/modules/app/config/config';
import { createServer } from '../packages/app-server/src/modules/app/server';
import { createFsLiteStorage } from '../packages/app-server/src/modules/storage/factories/fs-lite.storage';
import { createUpstashStorage } from '../packages/app-server/src/modules/storage/factories/upstash.storage';

const missingStorageError = {
  error: 'Missing persistent storage configuration. Install the Upstash integration on this Vercel project so UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are available.',
};

let requestHandler: ReturnType<typeof handle> | undefined;

function getRequestHandler() {
  if (requestHandler) {
    return requestHandler;
  }

  const appConfig = getConfig({ env: process.env });
  const hasUpstashEnv = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  const isVercelRuntime = process.env.VERCEL === '1';

  if (isVercelRuntime && !hasUpstashEnv) {
    const app = new Hono();

    app.get('/api/ping', context => context.json({ status: 'ok' }));
    app.all('/api/*', context => context.json(missingStorageError, 503));

    requestHandler = handle(app);

    return requestHandler;
  }

  const { storage } = hasUpstashEnv
    ? createUpstashStorage()
    : createFsLiteStorage({ config: appConfig });

  const { app } = createServer({
    config: appConfig,
    storageFactory: () => ({ storage }),
  });

  requestHandler = handle(app);

  return requestHandler;
}

export default function handler(request: IncomingMessage, response: ServerResponse) {
  return getRequestHandler()(request, response);
}
