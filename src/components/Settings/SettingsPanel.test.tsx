import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type {
  ReasoningEffort,
  RemoteConfig,
  SettingsResponse,
} from "../../types";
import { SettingsPanel } from "./SettingsPanel";

vi.mock("../../hooks/useMediaQuery", () => ({
  useMediaQuery: () => true,
}));

vi.mock("../ThemeProvider", () => ({
  useTheme: () => ({ theme: "system", setTheme: vi.fn() }),
}));

const remoteConfig: RemoteConfig = {
  providers: {
    google: {
      name: "google",
      provider: "google",
      type: "google",
      models: ["gemini-3.6-flash", "gemini-3.1-pro-preview"],
      base_url: "",
      has_api_key: true,
      supports_reasoning_effort: true,
      reasoning_efforts: {
        "gemini-3.6-flash": ["minimal", "low", "medium", "high"],
        "gemini-3.1-pro-preview": ["low", "medium", "high"],
      },
    },
  },
  default: {
    provider: "google",
    model: "gemini-3.1-pro-preview",
  },
};

function createSettings(
  model: string,
  reasoningEffort: ReasoningEffort,
): SettingsResponse {
  return {
    path: "/home/user/.mycode/config.json",
    exists: true,
    config: {
      default: {
        provider: "google",
        model,
        reasoning_effort: reasoningEffort,
      },
    },
    options: {
      provider_types: ["google"],
      permission_levels: ["safe"],
      permission_modes: ["ask"],
      reasoning_efforts: ["minimal", "low", "medium", "high", "max"],
    },
    env: {},
    provider_type_env_vars: {},
    provider_type_default_models: {
      google: ["gemini-3.6-flash", "gemini-3.1-pro-preview"],
    },
  };
}

function renderSettings(settings: SettingsResponse) {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(settings), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  render(
    <SettingsPanel
      open
      onClose={() => {}}
      settings={settings}
      remoteConfig={remoteConfig}
    />,
  );
  const reasoningSelect = screen
    .getByText("Reasoning")
    .parentElement?.querySelector("select");
  if (!reasoningSelect) throw new Error("Reasoning select not found");
  return { fetchMock, reasoningSelect };
}

async function saveSettings(user: ReturnType<typeof userEvent.setup>) {
  const saveButton = screen.getAllByRole("button", { name: "Save" }).at(0);
  if (!saveButton) throw new Error("Save button not found");
  await user.click(saveButton);
}

function savedDefault(fetchMock: ReturnType<typeof vi.spyOn>) {
  const request = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
  return JSON.parse(String(request?.body)).config.default as {
    reasoning_effort?: string;
  };
}

describe("SettingsPanel", () => {
  it("uses the configured global model instead of the provider's first model", async () => {
    const user = userEvent.setup();
    const settings = createSettings("gemini-3.1-pro-preview", "max");
    const { fetchMock, reasoningSelect } = renderSettings(settings);

    expect(reasoningSelect).toHaveValue("auto");
    expect(
      within(reasoningSelect).queryByRole("option", { name: "minimal" }),
    ).toBeNull();
    expect(
      within(reasoningSelect).getByRole("option", { name: "high" }),
    ).toBeInTheDocument();

    await saveSettings(user);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(savedDefault(fetchMock).reasoning_effort).toBeUndefined();
  });

  it("preserves a global effort when the project overrides the model", async () => {
    const user = userEvent.setup();
    const settings = createSettings("gemini-3.6-flash", "minimal");
    const { fetchMock, reasoningSelect } = renderSettings(settings);

    expect(reasoningSelect).toHaveValue("minimal");

    await saveSettings(user);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(savedDefault(fetchMock).reasoning_effort).toBe("minimal");
  });
});
