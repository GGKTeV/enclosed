import { createStorage } from 'unstorage';
import upstashDriver from 'unstorage/drivers/upstash';
import { defineStorage } from '../storage.models';

export const createUpstashStorage = defineStorage(() => {
  const storage = createStorage({
    driver: upstashDriver({ base: 'enclosed' }),
  });

  return {
    storage,
  };
});
