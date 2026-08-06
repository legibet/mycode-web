/**
 * Config normalization utilities: reasoning effort validation and
 * reconciling local state with server-provided defaults.
 */

import type { LocalConfig, ReasoningEffort, RemoteConfig } from "../types";

export function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return (
    value === "auto" ||
    value === "none" ||
    value === "minimal" ||
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "xhigh" ||
    value === "max"
  );
}

export function getReasoningEffortOptions(
  remoteConfig: RemoteConfig | null,
  providerName: string,
  model: string,
): ReasoningEffort[] {
  const providerInfo = remoteConfig?.providers?.[providerName];
  if (!providerInfo?.supports_reasoning_effort) return [];

  if (providerInfo.reasoning_efforts !== undefined) {
    const efforts = providerInfo.reasoning_efforts[model] || [];
    return efforts.length ? ["auto", ...efforts] : [];
  }

  const reasoningModels = providerInfo.reasoning_models || [];
  return reasoningModels.includes(model)
    ? remoteConfig?.reasoning_effort_options || []
    : [];
}

export function getDefaultReasoningEffort(
  remoteConfig: RemoteConfig | null,
  providerName: string,
  model: string,
): ReasoningEffort | "" {
  const providerInfo = remoteConfig?.providers?.[providerName];
  const options = getReasoningEffortOptions(remoteConfig, providerName, model);
  if (!options.length) return "";

  const effort =
    providerInfo?.reasoning_effort || remoteConfig?.default_reasoning_effort;

  return isReasoningEffort(effort) && options.includes(effort) ? effort : "";
}

export function normalizeConfigWithRemoteDefaults(
  config: LocalConfig,
  remoteConfig: RemoteConfig,
): LocalConfig {
  const providers = remoteConfig?.providers || {};
  const providerChanged = !config.provider || !providers[config.provider];
  const provider = providerChanged
    ? remoteConfig?.default?.provider || ""
    : config.provider;
  const providerInfo = providers[provider];
  const modelChanged = !providerInfo?.models?.includes(config.model);
  const model = modelChanged ? providerInfo?.models?.[0] || "" : config.model;
  const effortOptions = getReasoningEffortOptions(
    remoteConfig,
    provider,
    model,
  );
  const reasoningEffort =
    providerChanged ||
    modelChanged ||
    (config.reasoningEffort && !effortOptions.includes(config.reasoningEffort))
      ? ""
      : config.reasoningEffort;

  return {
    ...config,
    provider,
    model,
    reasoningEffort,
  };
}
