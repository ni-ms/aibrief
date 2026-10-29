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
    { key: "⌘K / Ctrl+K", desc: "Open Command Palette & Quick-Add" },
    { key: "j / ↓", desc: "Select next story in feed" },
    { key: "k / ↑", desc: "Select previous story in feed" },
    { key: "s", desc: "Save / bookmark selected story" },
    { key: "m", desc: "Toggle read / unread status" },
    { key: "e / d", desc: "Dismiss story & advance" },
    { key: "o", desc: "Open original source link" },
    { key: "[", desc: "Collapse / expand left sidebar" },
    { key: "/", desc: "Focus search bar" },
    { key: "?", desc: "Show / hide this shortcuts guide" },
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
            onClick={onClose}
            aria-label="Close shortcuts guide"
            style={{ color: "var(--quiet)", padding: "2px" }}
          >
            <X size={16} />
          </button>
        </div>
        <div className="shortcuts-list">
          {shortcuts.map((item) => (
            <div key={item.key} className="shortcut-row">
              <span className="shortcut-desc">{item.desc}</span>
              <kbd className="shortcut-key">{item.key}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
