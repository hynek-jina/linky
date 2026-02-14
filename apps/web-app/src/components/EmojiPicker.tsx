import React, { type FC } from "react";

const STORAGE_KEY = "linky.recent_emojis";
const MAX_RECENT = 10;

const DEFAULT_EMOJIS = [
  "👍",
  "❤️",
  "😂",
  "🔥",
  "🎉",
  "🙏",
  "👀",
  "😮",
  "😢",
  "👎",
];

const EXTENDED_EMOJIS = [
  // Smileys
  "😀",
  "😃",
  "😄",
  "😁",
  "😆",
  "😅",
  "🤣",
  "😂",
  "🙂",
  "😉",
  "😊",
  "😇",
  "🥰",
  "😍",
  "🤩",
  "😘",
  "😋",
  "😛",
  "😜",
  "🤪",
  "😝",
  "🤑",
  "🤗",
  "🤭",
  "🤫",
  "🤔",
  "🤐",
  "🤨",
  "😐",
  "😑",
  "😶",
  "😏",
  "😒",
  "🙄",
  "😬",
  "😮‍💨",
  "🤥",
  "😌",
  "😔",
  "😪",
  "🤤",
  "😴",
  "😷",
  "🤒",
  "🤕",
  "🤢",
  "🤮",
  "🥴",
  "😵",
  "🤯",
  "🥳",
  "🥸",
  "😎",
  "🤓",
  "🧐",
  "😕",
  "😟",
  "🙁",
  "😮",
  "😯",
  "😲",
  "😳",
  "🥺",
  "😦",
  "😧",
  "😨",
  "😰",
  "😥",
  "😢",
  "😭",
  "😱",
  "😖",
  "😣",
  "😞",
  "😓",
  "😩",
  "😫",
  "🥱",
  "😤",
  "😡",
  "😠",
  "🤬",
  "😈",
  "👿",
  "💀",
  "💩",
  "🤡",
  "👹",
  "👻",
  "👽",
  "🤖",
  "🎃",
  // Gestures
  "👋",
  "🤚",
  "🖐️",
  "✋",
  "🖖",
  "👌",
  "🤌",
  "🤏",
  "✌️",
  "🤞",
  "🤟",
  "🤘",
  "🤙",
  "👈",
  "👉",
  "👆",
  "👇",
  "☝️",
  "👍",
  "👎",
  "✊",
  "👊",
  "🤛",
  "🤜",
  "👏",
  "🙌",
  "👐",
  "🤲",
  "🤝",
  "🙏",
  "💪",
  // Hearts & symbols
  "❤️",
  "🧡",
  "💛",
  "💚",
  "💙",
  "💜",
  "🖤",
  "🤍",
  "🤎",
  "💔",
  "❣️",
  "💕",
  "💞",
  "💓",
  "💗",
  "💖",
  "💘",
  "💝",
  "⭐",
  "🌟",
  "✨",
  "💫",
  "🔥",
  "💥",
  "💯",
  "💢",
  "💤",
  // Animals & nature
  "🐶",
  "🐱",
  "🐭",
  "🐰",
  "🦊",
  "🐻",
  "🐼",
  "🐸",
  "🐵",
  "🐔",
  "🐧",
  "🦄",
  "🐝",
  "🦋",
  "🌸",
  "🌺",
  "🌻",
  "🌹",
  "🍀",
  "🌈",
  // Food & drink
  "🍎",
  "🍕",
  "🍔",
  "🌮",
  "🍣",
  "🍦",
  "🍩",
  "🍪",
  "🎂",
  "🍰",
  "☕",
  "🍺",
  "🍷",
  "🥂",
  // Celebration & objects
  "🎉",
  "🎊",
  "🎈",
  "🎁",
  "🏆",
  "🥇",
  "🎯",
  "🎮",
  "🎵",
  "🎶",
  "🔔",
  "📣",
  "💰",
  "💎",
  "🚀",
  "⚡",
  "🌙",
  "☀️",
  "🌍",
  "💡",
  "🔑",
  "🛡️",
  // Flags & misc
  "✅",
  "❌",
  "⚠️",
  "❓",
  "❗",
  "🆗",
  "🆕",
  "🔝",
  "♻️",
  "🏳️",
];

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

function saveRecent(emoji: string) {
  const prev = loadRecent();
  const next = [emoji, ...prev.filter((e) => e !== emoji)].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota errors
  }
}

interface EmojiPickerProps {
  emojis?: readonly string[];
  onSelect: (emoji: string) => void;
}

export const EmojiPicker: FC<EmojiPickerProps> = ({ emojis, onSelect }) => {
  const [expanded, setExpanded] = React.useState(false);

  const recent = React.useMemo(() => loadRecent(), []);
  const quickItems = React.useMemo(() => {
    if (emojis && emojis.length > 0) return emojis;
    if (recent.length >= MAX_RECENT) return recent;
    const fill = DEFAULT_EMOJIS.filter((e) => !recent.includes(e));
    return [...recent, ...fill].slice(0, MAX_RECENT);
  }, [emojis, recent]);

  const handleSelect = React.useCallback(
    (emoji: string) => {
      saveRecent(emoji);
      onSelect(emoji);
    },
    [onSelect],
  );

  if (expanded) {
    return (
      <div
        className="emoji-picker-expanded"
        role="listbox"
        aria-label="Emoji picker"
      >
        {EXTENDED_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="emoji-picker-btn"
            onClick={() => handleSelect(emoji)}
            aria-label={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="emoji-picker" role="listbox" aria-label="Emoji picker">
      {quickItems.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className="emoji-picker-btn"
          onClick={() => handleSelect(emoji)}
          aria-label={emoji}
        >
          {emoji}
        </button>
      ))}
      <button
        type="button"
        className="emoji-picker-btn"
        onClick={() => setExpanded(true)}
        aria-label="More emojis"
      >
        +
      </button>
    </div>
  );
};
