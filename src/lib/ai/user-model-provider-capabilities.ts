const USER_PROVIDER_MAX_MODELS = 100;
const USER_PROVIDER_MAX_MODEL_ID_LENGTH = 200;

export type UserProviderModelCapability = {
  supportsToolCalling: boolean;
};

export type StoredUserProviderModel =
  | string
  | { id: string; supportsToolCalling: boolean };

export type UserProviderModelCatalog = {
  modelIds: string[];
  capabilities: Record<string, UserProviderModelCapability>;
};

const safeModelId = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return id.length > 0 && id.length <= USER_PROVIDER_MAX_MODEL_ID_LENGTH
    ? id
    : null;
};

/**
 * Read persisted model entries while keeping legacy string[] rows safe.
 * Legacy rows default to no tool support; capability is never inferred from a
 * provider name, model name, or remote endpoint response.
 */
export function parseUserProviderModelCatalog(
  value: unknown,
): UserProviderModelCatalog {
  if (!Array.isArray(value)) return { modelIds: [], capabilities: {} };

  const modelIds: string[] = [];
  const capabilities: Record<string, UserProviderModelCapability> = {};
  for (const entry of value.slice(0, USER_PROVIDER_MAX_MODELS)) {
    const id =
      typeof entry === "string"
        ? safeModelId(entry)
        : entry && typeof entry === "object"
          ? safeModelId((entry as { id?: unknown }).id)
          : null;
    if (!id || modelIds.includes(id)) continue;
    modelIds.push(id);
    capabilities[id] = {
      supportsToolCalling:
        Boolean(entry) &&
        typeof entry === "object" &&
        (entry as { supportsToolCalling?: unknown }).supportsToolCalling ===
          true,
    };
  }
  return { modelIds, capabilities };
}

/** Reject capability claims for models that discovery did not return. */
export function validateUserProviderCapabilities(
  value: unknown,
  discoveredModelIds: string[],
): Record<string, UserProviderModelCapability> | null {
  if (value === undefined) {
    return Object.fromEntries(
      discoveredModelIds.map((id) => [id, { supportsToolCalling: false }]),
    );
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const input = value as Record<string, unknown>;
  const discovered = new Set(discoveredModelIds);
  if (Object.keys(input).some((id) => !discovered.has(id))) return null;

  const result: Record<string, UserProviderModelCapability> = {};
  for (const id of discoveredModelIds) {
    const capability = input[id];
    if (capability === undefined) {
      result[id] = { supportsToolCalling: false };
      continue;
    }
    if (
      !capability ||
      typeof capability !== "object" ||
      Array.isArray(capability)
    ) {
      return null;
    }
    const keys = Object.keys(capability);
    if (
      keys.some((key) => key !== "supportsToolCalling") ||
      typeof (capability as { supportsToolCalling?: unknown })
        .supportsToolCalling !== "boolean"
    ) {
      return null;
    }
    result[id] = {
      supportsToolCalling: (capability as { supportsToolCalling: boolean })
        .supportsToolCalling,
    };
  }
  return result;
}

export function serializeUserProviderModelCatalog(
  modelIds: string[],
  capabilities: Record<string, UserProviderModelCapability>,
): StoredUserProviderModel[] {
  return modelIds.map((id) => ({
    id,
    supportsToolCalling: capabilities[id]?.supportsToolCalling === true,
  }));
}
