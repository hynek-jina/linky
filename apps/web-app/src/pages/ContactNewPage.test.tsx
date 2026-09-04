import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContactNewPage } from "./ContactNewPage";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
  writable: true,
});

describe("ContactNewPage", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("opens contact details when a lightning address is prefilled", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ContactNewPage
          addNewContactFromSearchResult={async () => {}}
          contactSuggestions={[]}
          form={{
            groups: [],
            lnAddress: "alice@example.com",
            name: "",
            npub: "",
          }}
          groupNames={[]}
          handleSaveContact={() => {}}
          isSavingContact={false}
          searchNewContact={async () => ({ kind: "empty" })}
          setForm={() => {}}
          t={(key) => key}
        />,
      );
    });

    const inputs = container.querySelectorAll("input");
    expect(inputs).toHaveLength(3);
    expect(inputs[1]?.value).toBe("alice@example.com");

    await act(async () => root.unmount());
  });

  it("lists search candidates and highlights the verified exact match", async () => {
    vi.useFakeTimers();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const exact = {
      isExactMatch: true,
      lnAddress: "alice@linky.fit",
      name: "Alice",
      npub: "npub1alice",
      pictureUrl: null,
      query: "alice",
    };
    const similar = {
      isExactMatch: false,
      lnAddress: "",
      name: "Alice Cooper",
      npub: "npub1cooper",
      pictureUrl: null,
      query: "alice",
    };

    await act(async () => {
      root.render(
        <ContactNewPage
          addNewContactFromSearchResult={async () => {}}
          contactSuggestions={[]}
          form={{ groups: [], lnAddress: "", name: "", npub: "alice" }}
          groupNames={[]}
          handleSaveContact={() => {}}
          isSavingContact={false}
          searchNewContact={async () => ({
            contacts: [exact, similar],
            kind: "found",
          })}
          setForm={() => {}}
          t={(key) => key}
        />,
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });

    const rows = container.querySelectorAll(".contact-new-search-result");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.classList.contains("is-exact")).toBe(true);
    expect(rows[0]?.textContent).toContain("Alice");
    expect(rows[1]?.classList.contains("is-exact")).toBe(false);
    expect(rows[1]?.textContent).toContain("Alice Cooper");

    await act(async () => root.unmount());
  });
});
