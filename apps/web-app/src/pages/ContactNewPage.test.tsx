import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ContactNewPage } from "./ContactNewPage";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
  writable: true,
});

describe("ContactNewPage", () => {
  afterEach(() => {
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
            group: "",
            lnAddress: "alice@example.com",
            name: "",
            npub: "",
          }}
          groupNames={[]}
          handleSaveContact={() => {}}
          isSavingContact={false}
          lang="cs"
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
});
