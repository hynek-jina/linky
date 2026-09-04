import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageActionsMenu } from "./MessageActionsMenu";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
  writable: true,
});

const defaultLabels = {
  copy: "Copy",
  edit: "Edit",
  react: "React",
  reply: "Reply",
  save: "Save",
  share: "Share",
};

type MenuProps = Parameters<typeof MessageActionsMenu>[0];

const renderMenu = async (overrides: Partial<MenuProps> = {}) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <MessageActionsMenu
        canCopy={true}
        canEdit={false}
        canReplyOrReact={true}
        imageActions={null}
        isOpen={true}
        labels={defaultLabels}
        onClose={vi.fn()}
        onCopy={vi.fn()}
        onEdit={vi.fn()}
        onReact={vi.fn()}
        onReply={vi.fn()}
        {...overrides}
      />,
    );
  });

  return root;
};

const menuItemLabels = (): string[] =>
  Array.from(document.body.querySelectorAll(".message-actions-item")).map(
    (item) => item.textContent ?? "",
  );

describe("MessageActionsMenu", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("offers share and save instead of copy for image messages", async () => {
    const onSave = vi.fn();
    const onShare = vi.fn();
    const root = await renderMenu({
      canCopy: false,
      imageActions: { canShare: true, onSave, onShare },
    });

    expect(menuItemLabels()).toEqual(["Reply", "Share", "Save"]);

    const [, shareItem, saveItem] = Array.from(
      document.body.querySelectorAll(".message-actions-item"),
    );
    await act(async () => {
      shareItem?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      saveItem?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
  });

  it("hides the share item when the device cannot share files", async () => {
    const root = await renderMenu({
      canCopy: false,
      imageActions: { canShare: false, onSave: vi.fn(), onShare: vi.fn() },
    });

    expect(menuItemLabels()).toEqual(["Reply", "Save"]);

    await act(async () => {
      root.unmount();
    });
  });
});
