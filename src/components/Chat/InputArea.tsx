/**
 * Chat input area: Lexical composer plus upload attachments (image/PDF/text).
 * Inline @workspace references live inside the composer; this component owns
 * the upload strip, drag-and-drop, and the bottom action row.
 */

import { ArrowUp, FileText, Paperclip, Square, X } from "lucide-react";
import {
  type ChangeEvent,
  type DragEvent,
  memo,
  useCallback,
  useRef,
  useState,
} from "react";
import type {
  AttachedFile,
  ComposerSubmission,
  LocalConfig,
  RemoteConfig,
} from "../../types";
import { cn } from "../../utils/cn";
import type { SlashCommand } from "../../utils/completion";
import { randomId } from "../../utils/id";
import { Composer, type ComposerHandle } from "./Composer";
import { EffortTrigger, ModelTrigger } from "./InputPills";

// File pickers only understand MIME types and extensions, so keep the text
// allowlist explicit here.
const TEXT_FILE_ACCEPT = [
  "text/*",
  ".txt",
  ".md",
  ".mdx",
  ".rst",
  ".json",
  ".jsonl",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".cfg",
  ".conf",
  ".xml",
  ".html",
  ".htm",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".py",
  ".rb",
  ".php",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".swift",
  ".c",
  ".cc",
  ".cpp",
  ".cxx",
  ".h",
  ".hh",
  ".hpp",
  ".m",
  ".mm",
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
  ".ps1",
  ".sql",
  ".graphql",
  ".gql",
  ".proto",
  ".csv",
  ".tsv",
  ".log",
  ".env",
  ".gitignore",
  ".gitattributes",
  ".editorconfig",
  ".npmrc",
  ".yarnrc",
  ".pnpmrc",
].join(",");

interface InputAreaProps {
  loading: boolean;
  onSubmit: (submission: ComposerSubmission) => Promise<boolean>;
  onCancel: () => void;
  supportsImages?: boolean;
  supportsDocuments?: boolean;
  files?: AttachedFile[];
  onAttachFiles?: (files: AttachedFile[]) => void;
  onRemoveFile?: (id: string) => void;
  config: LocalConfig;
  remoteConfig: RemoteConfig | null;
  onUpdateConfig: (config: LocalConfig) => void;
  onSlashCommand?: (name: SlashCommand["name"]) => void;
  disabledReason?: string | undefined;
  disabled?: boolean | undefined;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function readFileAsUtf8(file: File): Promise<string | null> {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      await file.arrayBuffer(),
    );
  } catch {
    return null;
  }
}

async function processFiles(
  files: File[],
  {
    supportsImages,
    supportsDocuments,
  }: { supportsImages: boolean; supportsDocuments: boolean },
): Promise<AttachedFile[]> {
  const attachedFiles = await Promise.all(
    files.map(async (file) => {
      if (file.type.startsWith("image/")) {
        if (!supportsImages) return null;
        return {
          id: randomId(),
          kind: "image" as const,
          data: await readFileAsBase64(file),
          mime_type: file.type,
          name: file.name,
          preview: URL.createObjectURL(file),
        };
      }

      const isPdfFile =
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf");
      if (isPdfFile) {
        if (!supportsDocuments) return null;
        return {
          id: randomId(),
          kind: "document" as const,
          data: await readFileAsBase64(file),
          mime_type: "application/pdf" as const,
          name: file.name,
        };
      }

      const text = await readFileAsUtf8(file);
      if (text === null) return null;
      return {
        id: randomId(),
        kind: "text" as const,
        text,
        name: file.name,
      };
    }),
  );
  return attachedFiles.filter((file) => file !== null);
}

export const InputArea = memo(function InputArea({
  loading,
  onSubmit,
  onCancel,
  supportsImages = false,
  supportsDocuments = false,
  files = [],
  onAttachFiles,
  onRemoveFile,
  config,
  remoteConfig,
  onUpdateConfig,
  onSlashCommand,
  disabledReason,
  disabled: disabledProp = false,
}: InputAreaProps) {
  const composerRef = useRef<ComposerHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const [hasContent, setHasContent] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const disabled = disabledProp || Boolean(disabledReason);

  // Composer calls this on Enter; the send button routes through the same path.
  const handleSubmission = useCallback(
    async (submission: ComposerSubmission): Promise<boolean> => {
      if (loading || disabled) return false;
      if (
        !submission.text.trim() &&
        submission.workspaceFiles.length === 0 &&
        files.length === 0
      ) {
        return false;
      }
      // Inline references the current model can't ingest block the send
      // instead of being silently dropped (that would break the sentence).
      const blockedKind = submission.workspaceFiles.find(
        (ref) =>
          (ref.kind === "image" && !supportsImages) ||
          (ref.kind === "document" && !supportsDocuments),
      )?.kind;
      if (blockedKind) {
        setSubmitError(
          `Current model does not support ${
            blockedKind === "image" ? "image" : "PDF"
          } input — remove the reference or switch model.`,
        );
        return false;
      }
      setSubmitError(null);
      return onSubmit(submission);
    },
    [
      loading,
      disabled,
      files.length,
      supportsImages,
      supportsDocuments,
      onSubmit,
    ],
  );

  const handleHasContentChange = useCallback((next: boolean) => {
    setHasContent(next);
    setSubmitError(null);
  }, []);

  const attachFiles = useCallback(
    async (incoming: File[]) => {
      if (disabled) return;
      const nextFiles = await processFiles(incoming, {
        supportsImages,
        supportsDocuments,
      });
      if (nextFiles.length) onAttachFiles?.(nextFiles);
    },
    [disabled, onAttachFiles, supportsDocuments, supportsImages],
  );

  const handlePasteFiles = useCallback(
    (incoming: File[]) => {
      void attachFiles(incoming);
    },
    [attachFiles],
  );

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(e.target.files ?? []);
    e.target.value = "";
    await attachFiles(incoming);
  };

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) setDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setDragging(false);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setDragging(false);
    await attachFiles(Array.from(e.dataTransfer.files));
  };

  const hasInput = hasContent || files.length > 0;
  const accept = [
    TEXT_FILE_ACCEPT,
    supportsImages ? "image/*" : null,
    supportsDocuments ? ".pdf,application/pdf" : null,
  ]
    .filter(Boolean)
    .join(",");

  return (
    <div className="mx-auto max-w-4xl max-md:max-w-none px-5 max-md:px-3 max-md:pb-2">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop drop target */}
      <div
        role="presentation"
        className={cn(
          "relative rounded-lg bg-card border shadow-sm transition-[border-color,background-color,box-shadow] duration-200",
          "focus-within:shadow-md focus-within:border-accent/40",
          dragging ? "border-accent/50 bg-accent/5" : "border-border",
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {(disabledReason || submitError) && (
          <div className="border-b border-border/30 px-3.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
            {disabledReason || submitError}
          </div>
        )}

        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-2.5 pb-1">
            {files.map((file) => (
              <div key={file.id} className="relative group/thumb shrink-0">
                {file.kind === "image" ? (
                  <img
                    src={file.preview}
                    alt={file.name}
                    className="size-14 rounded-lg object-cover border border-border/30"
                  />
                ) : (
                  <div className="h-14 min-w-28 rounded-lg border border-border/30 bg-muted/30 px-3 flex items-center gap-2 text-xs text-foreground/80">
                    <FileText className="size-4 shrink-0 text-accent/80" />
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
                        {file.kind === "document" ? "PDF" : "Text"}
                      </div>
                      <div className="line-clamp-2 break-all">{file.name}</div>
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => onRemoveFile?.(file.id)}
                  aria-label={`Remove ${file.name}`}
                  className="absolute -top-1 -right-1 size-4 bg-foreground text-background rounded-full flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 max-md:opacity-100 transition-opacity"
                >
                  <X className="size-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple
          aria-label="Attach files"
          className="hidden"
          onChange={handleFileChange}
        />

        <Composer
          ref={composerRef}
          disabled={disabled}
          placeholder={disabledReason || "Message…"}
          loading={loading}
          cwd={config.cwd}
          supportsImages={supportsImages}
          supportsDocuments={supportsDocuments}
          hasUploads={files.length > 0}
          onSubmit={handleSubmission}
          onSlashCommand={onSlashCommand}
          onPasteFiles={handlePasteFiles}
          onHasContentChange={handleHasContentChange}
        />

        {/* Bottom row: attach + model · effort + send */}
        <div className="flex items-center gap-1 px-1.5 pb-1.5">
          <button
            type="button"
            aria-label="Attach file"
            disabled={loading || disabled}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "size-7 flex items-center justify-center rounded-md transition-colors shrink-0",
              loading || disabled
                ? "text-muted-foreground/20"
                : "text-muted-foreground/60 hover:text-foreground hover:bg-muted/70",
            )}
            title="Attach file"
          >
            <Paperclip className="size-3.5" />
          </button>

          <div className="flex items-center gap-0.5 min-w-0 flex-1 overflow-hidden">
            <ModelTrigger
              config={config}
              remoteConfig={remoteConfig}
              onUpdateConfig={onUpdateConfig}
            />
            <EffortTrigger
              config={config}
              remoteConfig={remoteConfig}
              onUpdateConfig={onUpdateConfig}
            />
          </div>

          {loading ? (
            <button
              type="button"
              aria-label="Stop generating"
              onClick={onCancel}
              className="size-7 flex items-center justify-center rounded-md text-destructive/70 hover:text-destructive hover:bg-destructive/10 active:scale-95 transition-[color,background-color,scale] duration-150 shrink-0"
              title="Stop"
            >
              <Square className="size-3 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              aria-label="Send message"
              onClick={() => composerRef.current?.submit()}
              disabled={!hasInput || disabled}
              className={cn(
                "size-7 flex items-center justify-center rounded-md transition-[color,background-color,opacity,scale] duration-150 shrink-0",
                hasInput && !disabled
                  ? "bg-accent text-accent-foreground hover:opacity-90 active:scale-95"
                  : "text-muted-foreground/30 bg-muted/40",
              )}
              title="Send"
            >
              <ArrowUp className="size-3.5" strokeWidth={2.5} />
            </button>
          )}
        </div>

        {dragging && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-accent/5 pointer-events-none z-10">
            <span className="text-sm text-accent font-medium">
              Drop file here
            </span>
          </div>
        )}
      </div>
    </div>
  );
});
