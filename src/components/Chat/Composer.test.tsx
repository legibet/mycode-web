import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { Composer, type ComposerHandle } from "./Composer";

describe("Composer", () => {
  it("submits a selected workspace file and keeps it when rejected", async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          entries: [
            {
              name: "main.ts",
              path: "src/main.ts",
              kind: "text",
            },
          ],
          truncated: false,
          error: "",
        }),
      ),
    );
    const composerRef = createRef<ComposerHandle>();
    let resolveSubmission: ((accepted: boolean) => void) | undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSubmission = resolve;
        }),
    );

    render(
      <Composer
        ref={composerRef}
        disabled={false}
        placeholder="Message…"
        loading={false}
        cwd="/workspace"
        supportsImages
        supportsDocuments
        hasUploads={false}
        onSubmit={onSubmit}
        onPasteFiles={() => {}}
        onHasContentChange={() => {}}
      />,
    );

    const editor = screen.getByRole("textbox");
    await user.click(editor);
    await user.paste("review @src/ma");
    await user.click(await screen.findByRole("option", { name: /main\.ts/ }));

    expect(editor).toHaveTextContent("review @src/main.ts");
    composerRef.current?.submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit).toHaveBeenCalledWith({
      text: "review @src/main.ts ",
      workspaceFiles: [{ path: "src/main.ts", name: "main.ts", kind: "text" }],
    });

    await act(async () => resolveSubmission?.(false));

    expect(editor).toHaveTextContent("review @src/main.ts");
  });
});
