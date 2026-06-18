import type { KvStore } from './kv-store';
import type { SecretStore } from './secret-store';

export const REMOTE_STT_KEY_ID = 'voice.stt.openai-whisper-api.apiKey';

export function createSecretBackedKv(kv: KvStore, secrets: SecretStore): KvStore {
  return {
    get: (key) => (key === REMOTE_STT_KEY_ID ? secrets.getSecret(REMOTE_STT_KEY_ID) : kv.get(key)),
    set: (key, value) => {
      if (key === REMOTE_STT_KEY_ID) {
        if (value) secrets.setSecret(REMOTE_STT_KEY_ID, value);
        else secrets.clearSecret(REMOTE_STT_KEY_ID);
        return;
      }
      kv.set(key, value);
    },
  };
}
