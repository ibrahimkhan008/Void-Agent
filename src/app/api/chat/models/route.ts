import { getSession } from "auth/server";
import { filterEnabledChatProviders } from "lib/ai/model-provider-availability";
import {
  customModelProvider,
  ensureDynamicProvidersHydrated,
} from "lib/ai/models";
import { sortProvidersFlareFirst } from "lib/ai/sort-providers";
import {
  siteConfigRepository,
  userModelProviderRepository,
} from "lib/db/repository";

export const GET = async () => {
  // Requires a session: this payload reveals which provider API keys are
  // configured on the deployment plus internal capability flags — useful
  // recon for anonymous attackers choosing abuse targets.
  const session = await getSession();
  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  await ensureDynamicProvidersHydrated();
  let modelsConfig: Awaited<ReturnType<typeof siteConfigRepository.getConfig>>;
  try {
    modelsConfig = await siteConfigRepository.getConfig("models");
  } catch {
    return Response.json(
      { error: "Model provider settings are unavailable" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const providers = filterEnabledChatProviders(
    customModelProvider.modelsInfo,
    modelsConfig,
  ).sort((a, b) => {
    if (a.hasAPIKey && !b.hasAPIKey) return -1;
    if (!a.hasAPIKey && b.hasAPIKey) return 1;
    return 0;
  });
  // Pin the Flare provider at the top so the first provider cached
  // by the chat-models SWR (which seeds `appStore.chatModel`) is Flare
  // when present.
  let personalProviders: Awaited<
    ReturnType<typeof userModelProviderRepository.listForUser>
  > = [];
  try {
    personalProviders = await userModelProviderRepository.listForUser(
      session.user.id,
    );
  } catch {
    return Response.json(
      { error: "Personal model providers are unavailable" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const personalProviderCatalog = personalProviders.map((provider) => ({
    provider: `user-${provider.id}`,
    displayName: provider.name,
    hasAPIKey: provider.hasApiKey,
    models: provider.modelIds.map((name) => ({
      name,
      isToolCallUnsupported: true,
      isImageInputUnsupported: true,
      isBlackboxModel: false,
      supportedFileMimeTypes: [],
    })),
  }));
  return Response.json(
    sortProvidersFlareFirst([...providers, ...personalProviderCatalog]),
  );
};
