import { X } from "lucide-react";

export function ShortcutsHelp({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  const shortcuts = [
    { key: "⌘K / Ctrl+K", desc: "Open Command Palette" },
    { key: "j / ↓", desc: "Next story in the feed" },
    { key: "k / ↑", desc: "Previous story in the feed" },
    { key: "s", desc: "Toggle Save / Bookmark" },
    { key: "m", desc: "Toggle Mark as Read" },
    { key: "e / d", desc: "Dismiss story" },
    { key: "o", desc: "Open original paper or article in new tab" },
    { key: "/", desc: "Focus instant search" },
    { key: "?", desc: "Show / hide keyboard shortcuts" },
    { key: "ESC", desc: "Close dialogs & clear selection" },
  ];

  return (
    <div
      className="command-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard Shortcuts"
    >
      <div className="shortcuts-dialog">
        <div className="shortcuts-header">
          <h3>Keyboard Shortcuts</h3>
          <button
            className="button-icon"
            onClick={onClose}
            aria-label="Close shortcuts"
          >
            <X size={16} />
          </button>
        </div>
        <div className="shortcuts-list">
          {shortcuts.map((s) => (
            <div key={s.key} className="shortcut-row">
              <span className="shortcut-desc">{s.desc}</span>
              <kbd className="shortcut-key">{s.key}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
