import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InputArea } from "./InputArea";

describe("InputArea", () => {
  it("rejects new unsupported media and keeps existing uploads while blocking submission", async () => {
    const user = userEvent.setup();
    window.go = {
      main: {
        App: {
          SelectFiles: vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            data: [
              {
                name: "new.png",
                data: "aW1hZ2U=",
                mime_type: "image/png",
              },
            ],
          }),
        } as never,
      },
    };
    const onSubmit = vi.fn().mockResolvedValue(true);
    const onAttachFiles = vi.fn();
    const image = {
      id: "image-1",
      kind: "image" as const,
      data: "base64",
      mime_type: "image/png",
      name: "diagram.png",
      preview: "blob:diagram",
    };

    const { rerender } = render(
      <InputArea
        loading={false}
        onSubmit={onSubmit}
        onCancel={() => {}}
        files={[]}
        onAttachFiles={onAttachFiles}
        supportsImages={false}
        config={{
          provider: "anthropic",
          model: "text-only",
          cwd: "/workspace",
          reasoningEffort: "",
        }}
        remoteConfig={null}
        onUpdateConfig={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Attach file" }));

    expect(onAttachFiles).not.toHaveBeenCalled();
    expect(screen.getByText("Image unsupported")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "text-only" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "medium" })).toBeNull();

    rerender(
      <InputArea
        loading={false}
        onSubmit={onSubmit}
        onCancel={() => {}}
        files={[image]}
        onAttachFiles={onAttachFiles}
        supportsImages={false}
        config={{
          provider: "anthropic",
          model: "text-only",
          cwd: "/workspace",
          reasoningEffort: "",
        }}
        remoteConfig={null}
        onUpdateConfig={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(onSubmit).not.toHaveBeenCalled());
    expect(screen.getByAltText("diagram.png")).toBeInTheDocument();
    expect(
      screen.getByText("Remove image or switch model"),
    ).toBeInTheDocument();
    expect(screen.getByText("Image unsupported")).toBeInTheDocument();
  });
});
