import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RemoteConfig, SettingsResponse } from "../../types";
import { SettingsPanel } from "./SettingsPanel";

vi.mock("../../hooks/useMediaQuery", () => ({
  useMediaQuery: () => true,
}));

vi.mock("../ThemeProvider", () => ({
  useTheme: () => ({ theme: "system", setTheme: vi.fn() }),
}));

describe("SettingsPanel", () => {
  it("uses the effective default model and does not save an invalid effort", async () => {
    const user = userEvent.setup();
    const settings: SettingsResponse = {
      path: "/home/user/.mycode/config.json",
      exists: true,
      config: {
        default: {
          provider: "google",
          model: "gemini-3.1-pro-preview",
          reasoning_effort: "max",
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
      provider_type_default_models: {},
    };
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

    const reasoningField = screen.getByText("Reasoning").parentElement;
    expect(reasoningField).not.toBeNull();
    const reasoningSelect = within(reasoningField as HTMLElement).getByRole(
      "combobox",
    );
    expect(reasoningSelect).toHaveValue("auto");
    expect(
      within(reasoningSelect).queryByRole("option", { name: "minimal" }),
    ).toBeNull();
    expect(
      within(reasoningSelect).getByRole("option", { name: "high" }),
    ).toBeInTheDocument();

    const saveButton = screen.getAllByRole("button", { name: "Save" }).at(0);
    expect(saveButton).toBeDefined();
    await user.click(saveButton as HTMLElement);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const request = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(request?.body)) as {
      config: { default?: { reasoning_effort?: string } };
    };
    expect(body.config.default?.reasoning_effort).toBeUndefined();
  });
});
