import process from 'node:process';
import { handle } from 'hono/vercel';
import { getConfig } from '../packages/app-server/src/modules/app/config/config';
import { createServer } from '../packages/app-server/src/modules/app/server';
import { createFsLiteStorage } from '../packages/app-server/src/modules/storage/factories/fs-lite.storage';
import { createUpstashStorage } from '../packages/app-server/src/modules/storage/factories/upstash.storage';

const missingStorageResponse = Response.json(
  {
    error: 'Missing persistent storage configuration. Install the Upstash integration on this Vercel project so UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are available.',
  },
  { status: 500 },
);

let requestHandler: ReturnType<typeof handle> | undefined;

function getRequestHandler() {
  if (requestHandler) {
    return requestHandler;
  }

  const appConfig = getConfig({ env: process.env });
  const hasUpstashEnv = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  const isVercelRuntime = process.env.VERCEL === '1';

  if (isVercelRuntime && !hasUpstashEnv) {
    return () => missingStorageResponse;
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

export default function handler(request: Request) {
  return getRequestHandler()(request);
}
