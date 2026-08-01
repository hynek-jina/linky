import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatMessageEditor } from "./ChatMessageEditor";

vi.mock("../app/context/AppShellContexts", () => ({
  useAppShellCore: () => ({
    formatDisplayedAmountText: (amountSat: number) => `${amountSat} sat`,
  }),
}));

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
  writable: true,
});

const FIRST_NPUB =
  "npub180cvv07tqw7jwr9wnh4hp24w3wl74x64l0n6ms4qxp2vj8qz9c8sv96q8j";
const SECOND_NPUB =
  "npub1ds24l0swau3y5z52rap9dde3jg9nuq4lqeutnsuzrscmqkt8zv0q8r3n6l";

describe("ChatMessageEditor", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("removes one contact pill from the draft when clicked", async () => {
    const onChange = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ChatMessageEditor
          disabled={false}
          getCashuTokenMessageInfo={() => null}
          getMintIconUrl={() => ({ url: null })}
          getNpubMessageContactInfo={(npub) => ({
            displayName: npub === FIRST_NPUB ? "Alice" : "Bob",
            isSaved: true,
            npub,
            pictureUrl: null,
          })}
          onCaretChange={() => undefined}
          onChange={onChange}
          onSendShortcut={() => undefined}
          placeholder="Message"
          removeContactLabel="Remove contact from message"
          value={`${FIRST_NPUB} ${SECOND_NPUB} hello`}
        />,
      );
    });

    const firstPill = container.querySelector(".chat-contact-pill");
    expect(firstPill).not.toBeNull();
    await act(async () => {
      firstPill?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith(`${SECOND_NPUB} hello`);
    await act(async () => {
      root.unmount();
    });
  });
});
