import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../App.css";
import { MessageActionsMenu } from "./MessageActionsMenu";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
  writable: true,
});

describe("MessageActionsMenu", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("keeps the conversation visible through its backdrop", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MessageActionsMenu
          canEdit={false}
          canReplyOrReact={true}
          isOpen={true}
          labels={{
            copy: "Copy",
            edit: "Edit",
            react: "React",
            reply: "Reply",
          }}
          onClose={vi.fn()}
          onCopy={vi.fn()}
          onEdit={vi.fn()}
          onReact={vi.fn()}
          onReply={vi.fn()}
        />,
      );
    });
    // The menu portals to document.body, so query there rather than the container.
    const backdrop = document.body.querySelector(".message-actions-backdrop");

    expect(backdrop).not.toBeNull();
    if (!backdrop) return;

    expect(getComputedStyle(backdrop).backgroundColor).toBe(
      "rgba(0, 0, 0, 0.4)",
    );

    await act(async () => {
      root.unmount();
    });
  });
});
