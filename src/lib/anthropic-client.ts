import Anthropic from '@anthropic-ai/sdk';
import type { AnthropicModelId } from './anthropic-models';
import { getDecryptedAnthropicKey, getSettingsView } from './settings';

export type ClientForUser = {
  client: Anthropic;
  model: AnthropicModelId;
};

/**
 * Construct an Anthropic SDK client using the user's encrypted API key
 * and their selected model. Throws if no key is set so the caller can
 * surface a clear "set your API key" error to the UI.
 *
 * The decrypted key never leaves this function's scope — it's passed into
 * the SDK constructor and held by the client instance only. Per
 * CLAUDE.md, "Per-user Anthropic API key decrypted only at SDK
 * construction; never logged."
 */
export async function getClientForUser(userId: string): Promise<ClientForUser> {
  const [apiKey, view] = await Promise.all([
    getDecryptedAnthropicKey(userId),
    getSettingsView(userId),
  ]);
  if (!apiKey) {
    throw new Error('anthropic_api_key_not_set');
  }
  if (!view) {
    throw new Error('user_settings_not_found');
  }
  const client = new Anthropic({ apiKey });
  return { client, model: view.selectedModel };
}
