import React, { type FC } from "react";

const DEFAULT_EMOJIS = ["❤️", "👍", "👎", "😂", "😮", "😢"];

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

interface EmojiPickerProps {
  emojis?: readonly string[];
  onSelect: (emoji: string) => void;
}

export const EmojiPicker: FC<EmojiPickerProps> = ({ emojis, onSelect }) => {
  const [expanded, setExpanded] = React.useState(false);
  const quickItems = React.useMemo(() => {
    if (emojis && emojis.length > 0) return emojis;
    return DEFAULT_EMOJIS;
  }, [emojis]);

  const handleSelect = React.useCallback(
    (emoji: string) => {
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
