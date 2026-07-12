/**
 * Controlled listbox rendered above the input area for slash / @ completion.
 * The textarea keeps focus and drives all keyboard state; this component only
 * renders items and reports pointer interactions.
 */

import { useEffect } from "react";
import { cn } from "../../utils/cn";

export interface CompletionItem {
  id: string;
  label: string;
  hint?: string;
}

export function completionItemDomId(menuId: string, index: number): string {
  return `${menuId}-item-${index}`;
}

interface CompletionMenuProps {
  menuId: string;
  items: CompletionItem[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onHighlight: (index: number) => void;
}

export function CompletionMenu({
  menuId,
  items,
  activeIndex,
  onSelect,
  onHighlight,
}: CompletionMenuProps) {
  useEffect(() => {
    document
      .getElementById(completionItemDomId(menuId, activeIndex))
      ?.scrollIntoView({ block: "nearest" });
  }, [menuId, activeIndex]);

  return (
    <div className="absolute inset-x-0 bottom-full z-20 mb-2">
      <div
        id={menuId}
        role="listbox"
        aria-label="Completions"
        className="max-h-60 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md"
      >
        {items.map((item, index) => (
          // biome-ignore lint/a11y/useFocusableInteractive: option row in an aria-activedescendant listbox, not individually focusable
          // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard is handled on the controlling textarea
          <div
            key={item.id}
            id={completionItemDomId(menuId, index)}
            role="option"
            aria-selected={index === activeIndex}
            className={cn(
              "flex cursor-pointer items-baseline gap-2 rounded-sm px-2 py-1.5 select-none",
              index === activeIndex && "bg-muted",
            )}
            // Keep the textarea focused (and the soft keyboard open) when
            // tapping an item.
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(index)}
            onPointerMove={() => onHighlight(index)}
          >
            <span className="min-w-0 truncate font-mono text-[13px] text-foreground">
              {item.label}
            </span>
            {item.hint && (
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                {item.hint}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
