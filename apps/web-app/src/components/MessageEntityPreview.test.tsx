import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageEntityPreview } from "./MessageEntityPreview";

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

describe("MessageEntityPreview", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders a Cashu entity as a token instead of a contact", async () => {
    const getNpubMessageContactInfo = vi.fn(() => ({
      displayName: "Wrong contact",
      isSaved: true,
      npub: "cashuABC123",
      pictureUrl: null,
    }));
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MessageEntityPreview
          content="cashuABC123"
          getCashuTokenMessageInfo={() => ({
            amount: 21,
            isValid: true,
            mintDisplay: "mint.example",
            mintUrl: "https://mint.example",
            tokenRaw: "cashuABC123",
            unit: "sat",
          })}
          getMintIconUrl={() => ({ url: null })}
          getNpubMessageContactInfo={getNpubMessageContactInfo}
        />,
      );
    });

    expect(container.querySelector(".chat-token-pill")?.textContent).toBe(
      "21 sat",
    );
    expect(container.querySelector(".chat-contact-pill")).toBeNull();
    expect(getNpubMessageContactInfo).not.toHaveBeenCalled();
  });
});
