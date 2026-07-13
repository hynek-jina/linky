import { describe, expect, it } from "vitest";
import {
  getMessageEditorCaret,
  getMessageEditorEntityRanges,
  getMessageEditorValue,
  setMessageEditorCaret,
} from "./messageEditorDom";

const createEditor = () => {
  const editor = document.createElement("div");
  const pill = document.createElement("span");
  pill.dataset.messageEntityValue = "npub1contact";
  pill.contentEditable = "false";
  pill.textContent = "Karel";
  editor.append(
    document.createTextNode("Ahoj "),
    pill,
    document.createTextNode(" !"),
  );
  document.body.append(editor);
  return editor;
};

describe("message editor DOM", () => {
  it("serializes a contact pill back to its npub", () => {
    const editor = createEditor();
    expect(getMessageEditorValue(editor)).toBe("Ahoj npub1contact !");
    expect(getMessageEditorEntityRanges(editor)).toEqual([
      { start: 5, end: 17, value: "npub1contact" },
    ]);
  });

  it("keeps logical caret offsets across an atomic pill", () => {
    const editor = createEditor();
    setMessageEditorCaret(editor, 17);
    expect(getMessageEditorCaret(editor)).toBe(17);
  });
});
