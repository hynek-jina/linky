export const getMessageEditorNodeValue = (node: Node): string => {
  if (node instanceof HTMLElement) {
    const entityValue = node.dataset.messageEntityValue;
    if (entityValue !== undefined) return entityValue;
    if (node.tagName === "BR") return "\n";
  }
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  return Array.from(node.childNodes).map(getMessageEditorNodeValue).join("");
};

export const getMessageEditorValue = (editor: HTMLElement): string =>
  Array.from(editor.childNodes).map(getMessageEditorNodeValue).join("");

export interface MessageEditorEntityRange {
  end: number;
  start: number;
  value: string;
}

export const getMessageEditorEntityRanges = (
  editor: HTMLElement,
): MessageEditorEntityRange[] => {
  const ranges: MessageEditorEntityRange[] = [];
  let offset = 0;
  for (const child of Array.from(editor.childNodes)) {
    const value = getMessageEditorNodeValue(child);
    if (
      child instanceof HTMLElement &&
      child.dataset.messageEntityValue !== undefined
    ) {
      ranges.push({ start: offset, end: offset + value.length, value });
    }
    offset += value.length;
  }
  return ranges;
};

const getOffsetWithinNode = (
  root: Node,
  target: Node,
  targetOffset: number,
): number | null => {
  if (root === target) {
    if (root.nodeType === Node.TEXT_NODE) {
      return Math.min(targetOffset, root.textContent?.length ?? 0);
    }
    return Array.from(root.childNodes)
      .slice(0, targetOffset)
      .reduce(
        (total, child) => total + getMessageEditorNodeValue(child).length,
        0,
      );
  }

  let offset = 0;
  for (const child of Array.from(root.childNodes)) {
    const nestedOffset = getOffsetWithinNode(child, target, targetOffset);
    if (nestedOffset !== null) return offset + nestedOffset;
    offset += getMessageEditorNodeValue(child).length;
  }
  return null;
};

export const getMessageEditorCaret = (editor: HTMLElement): number => {
  const selection = window.getSelection();
  if (!selection?.anchorNode || !editor.contains(selection.anchorNode)) {
    return getMessageEditorValue(editor).length;
  }
  return (
    getOffsetWithinNode(editor, selection.anchorNode, selection.anchorOffset) ??
    getMessageEditorValue(editor).length
  );
};

export const setMessageEditorCaret = (
  editor: HTMLElement,
  requestedOffset: number,
): void => {
  const selection = window.getSelection();
  if (!selection) return;

  const offset = Math.max(0, requestedOffset);
  let consumed = 0;
  const range = document.createRange();

  for (const child of Array.from(editor.childNodes)) {
    const valueLength = getMessageEditorNodeValue(child).length;
    if (child.nodeType === Node.TEXT_NODE && offset <= consumed + valueLength) {
      range.setStart(child, Math.max(0, offset - consumed));
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    if (offset <= consumed + valueLength) {
      const childIndex = Array.from(editor.childNodes).indexOf(child);
      range.setStart(editor, offset === consumed ? childIndex : childIndex + 1);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    consumed += valueLength;
  }

  range.selectNodeContents(editor);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
};

export const insertMessageEditorText = (
  editor: HTMLElement,
  text: string,
): void => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return;
  range.deleteContents();
  const textNode = document.createTextNode(text);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
};
