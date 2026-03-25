import { randomBytes, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const KEY_PREFIX = "ac_";
const KEY_BYTE_LENGTH = 24;

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Generate a new API key for a user. Returns the full key (shown once)
 * and the database record. The raw key is never stored.
 */
export async function generateApiKey(
  userId: string,
  name = "Default",
): Promise<{ key: string; id: string; prefix: string }> {
  const raw = KEY_PREFIX + randomBytes(KEY_BYTE_LENGTH).toString("hex");
  const keyHash = hashKey(raw);
  const keyPrefix = raw.slice(0, 8);

  const { data, error } = await supabase
    .from("api_keys")
    .insert({ user_id: userId, key_hash: keyHash, key_prefix: keyPrefix, name })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create API key: ${error.message}`);

  return { key: raw, id: data.id, prefix: keyPrefix };
}

export type ValidatedKey = {
  userId: string;
  apiKeyId: string;
};

/**
 * Validate a raw API key. Returns the owning user and key ID, or null
 * if the key is invalid / revoked.
 */
export async function validateApiKey(
  raw: string,
): Promise<ValidatedKey | null> {
  if (!raw.startsWith(KEY_PREFIX)) return null;

  const keyHash = hashKey(raw);

  const { data, error } = await supabase
    .from("api_keys")
    .select("id, user_id")
    .eq("key_hash", keyHash)
    .is("revoked_at", null)
    .single();

  if (error || !data) return null;

  return { userId: data.user_id, apiKeyId: data.id };
}

/**
 * Touch `last_used_at` for a key. Fire-and-forget; failures are silent.
 */
export function touchKeyUsage(apiKeyId: string): void {
  supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", apiKeyId)
    .then(() => {});
}

/**
 * List all API keys for a user (never exposes the raw key).
 */
export async function listApiKeys(userId: string) {
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, key_prefix, name, last_used_at, created_at, revoked_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to list API keys: ${error.message}`);
  return data ?? [];
}

/**
 * Soft-revoke a key by setting `revoked_at`.
 */
export async function revokeApiKey(
  userId: string,
  keyId: string,
): Promise<boolean> {
  const { error, count } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId)
    .eq("user_id", userId)
    .is("revoked_at", null);

  return !error && (count ?? 0) > 0;
}
