import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ContactsPage } from "./ContactsPage";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
  writable: true,
});

describe("ContactsPage", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders active proxy-payment contacts in their own section", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ContactsPage
          activeGroup={null}
          bottomTabActive="contacts"
          contactsSearch=""
          contactsSearchInputRef={{ current: null }}
          conversationsLabel="Conversations"
          filterOptions={[]}
          openNewContactPage={() => undefined}
          otherContactsLabel="Other contacts"
          renderContactCard={(contact) => (
            <div
              key={String(contact.id ?? "")}
              data-contact-id={String(contact.id ?? "")}
            >
              {String(contact.name ?? "")}
            </div>
          )}
          setActiveGroup={() => undefined}
          setContactsSearch={() => undefined}
          showBottomTabBar={false}
          showFab={false}
          showGroupFilter={false}
          t={(key) => (key === "proxyPayments" ? "Proxy payments" : key)}
          visibleContacts={{
            conversations: [{ id: "contact-2", name: "Bob" }],
            others: [{ id: "contact-3", name: "Carol" }],
            pinned: [],
            proxyPayments: [{ id: "contact-1", name: "Alice" }],
          }}
        />,
      );
    });

    expect(
      [...container.querySelectorAll(".contact-list-section-title")].map(
        (element) => element.textContent,
      ),
    ).toEqual(["Proxy payments", "Conversations", "Other contacts"]);
    expect(
      container.querySelectorAll('[data-contact-id="contact-1"]'),
    ).toHaveLength(1);

    await act(async () => root.unmount());
  });
});
