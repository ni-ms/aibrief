import { useEffect } from "react";
import type { Story } from "../../shared/types.ts";

export interface ShortcutHandlers {
  onNext?: () => void;
  onPrev?: () => void;
  onToggleSave?: (story: Story) => void;
  onToggleRead?: (story: Story) => void;
  onDismiss?: (story: Story) => void;
  onOpenOriginal?: (story: Story) => void;
  onFocusSearch?: () => void;
  onToggleCommandPalette?: () => void;
  onToggleHelp?: () => void;
  currentStory?: Story | null;
  isModalOpen?: boolean;
}

export function useShortcuts({
  onNext,
  onPrev,
  onToggleSave,
  onToggleRead,
  onDismiss,
  onOpenOriginal,
  onFocusSearch,
  onToggleCommandPalette,
  onToggleHelp,
  currentStory,
  isModalOpen = false,
}: ShortcutHandlers) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // ⌘K or Ctrl+K opens command palette regardless of focus
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onToggleCommandPalette?.();
        return;
      }

      // If user is typing in an input/textarea/select, don't trigger single-key shortcuts
      const target = event.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (isInput) {
        if (event.key === "Escape") {
          target?.blur();
        }
        return;
      }

      if (isModalOpen) {
        return;
      }

      switch (event.key) {
        case "j":
        case "ArrowDown":
          event.preventDefault();
          onNext?.();
          break;
        case "k":
        case "ArrowUp":
          event.preventDefault();
          onPrev?.();
          break;
        case "s":
          if (currentStory) {
            event.preventDefault();
            onToggleSave?.(currentStory);
          }
          break;
        case "m":
          if (currentStory) {
            event.preventDefault();
            onToggleRead?.(currentStory);
          }
          break;
        case "e":
        case "d":
          if (currentStory) {
            event.preventDefault();
            onDismiss?.(currentStory);
          }
          break;
        case "o":
          if (currentStory) {
            event.preventDefault();
            onOpenOriginal?.(currentStory);
          }
          break;
        case "/":
          event.preventDefault();
          onFocusSearch?.();
          break;
        case "?":
          event.preventDefault();
          onToggleHelp?.();
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    onNext,
    onPrev,
    onToggleSave,
    onToggleRead,
    onDismiss,
    onOpenOriginal,
    onFocusSearch,
    onToggleCommandPalette,
    onToggleHelp,
    currentStory,
    isModalOpen,
  ]);
}
