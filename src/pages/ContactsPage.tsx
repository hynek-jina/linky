import type { FC } from "react";
import React from "react";
import { BottomTabBar } from "../components/BottomTabBar";

interface ContactsPageProps {
  contactsToolbarStyle: React.CSSProperties;
  contactsSearchInputRef: React.RefObject<HTMLInputElement | null>;
  contactsSearch: string;
  setContactsSearch: (value: string) => void;
  showGroupFilter: boolean;
  activeGroup: string | null;
  setActiveGroup: (value: string | null) => void;
  showNoGroupFilter: boolean;
  noGroupFilterValue: string;
  groupNames: string[];
  contacts: readonly any[];
  visibleContacts: {
    conversations: any[];
    others: any[];
  };
  conversationsLabel: string;
  otherContactsLabel: string;
  renderContactCard: (contact: any) => React.ReactNode;
  bottomTabActive: "contacts" | "wallet" | null;
  openNewContactPage: () => void;
  navigateToContacts: () => void;
  navigateToWallet: () => void;
  t: (key: string) => string;
}

const ContactsPage: FC<ContactsPageProps> = ({
  contactsToolbarStyle,
  contactsSearchInputRef,
  contactsSearch,
  setContactsSearch,
  showGroupFilter,
  activeGroup,
  setActiveGroup,
  showNoGroupFilter,
  noGroupFilterValue,
  groupNames,
  contacts,
  visibleContacts,
  conversationsLabel,
  otherContactsLabel,
  renderContactCard,
  bottomTabActive,
  openNewContactPage,
  navigateToContacts,
  navigateToWallet,
  t,
}) => {
  const totalVisible =
    visibleContacts.conversations.length + visibleContacts.others.length;

  return (
    <>
      <div className="contacts-toolbar" style={contactsToolbarStyle}>
        <div className="contacts-search-bar" role="search">
          <input
            ref={contactsSearchInputRef}
            type="search"
            placeholder={t("contactsSearchPlaceholder")}
            value={contactsSearch}
            onChange={(e) => setContactsSearch(e.target.value)}
            autoComplete="off"
          />
          {contactsSearch.trim() && (
            <button
              type="button"
              className="contacts-search-clear"
              aria-label={t("contactsSearchClear")}
              onClick={() => {
                setContactsSearch("");
                requestAnimationFrame(() => {
                  contactsSearchInputRef.current?.focus();
                });
              }}
            >
              ×
            </button>
          )}
        </div>

        {showGroupFilter && (
          <nav className="group-filter-bar" aria-label={t("group")}>
            <div className="group-filter-inner">
              <button
                type="button"
                className={
                  activeGroup === null
                    ? "group-filter-btn is-active"
                    : "group-filter-btn"
                }
                onClick={() => setActiveGroup(null)}
              >
                {t("all")}
              </button>
              {showNoGroupFilter && (
                <button
                  type="button"
                  className={
                    activeGroup === noGroupFilterValue
                      ? "group-filter-btn is-active"
                      : "group-filter-btn"
                  }
                  onClick={() => setActiveGroup(noGroupFilterValue)}
                >
                  {t("noGroup")}
                </button>
              )}
              {groupNames.map((group) => (
                <button
                  key={group}
                  type="button"
                  className={
                    activeGroup === group
                      ? "group-filter-btn is-active"
                      : "group-filter-btn"
                  }
                  onClick={() => setActiveGroup(group)}
                  title={group}
                >
                  {group}
                </button>
              ))}
            </div>
          </nav>
        )}
      </div>

      <section className="panel panel-plain">
        <div className="contact-list">
          {contacts.length === 0 || totalVisible === 0 ? (
            <p className="muted">{t("noContactsYet")}</p>
          ) : (
            <>
              {visibleContacts.conversations.length > 0 && (
                <React.Fragment key="conversations">
                  <div
                    className="muted"
                    style={{
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      margin: "6px 0 6px",
                    }}
                  >
                    {conversationsLabel}
                  </div>
                  {visibleContacts.conversations.map(renderContactCard)}
                </React.Fragment>
              )}

              {visibleContacts.others.length > 0 && (
                <React.Fragment key="others">
                  <div
                    className="muted"
                    style={{
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      margin: "10px 0 6px",
                    }}
                  >
                    {otherContactsLabel}
                  </div>
                  {visibleContacts.others.map(renderContactCard)}
                </React.Fragment>
              )}
            </>
          )}
        </div>
      </section>

      <BottomTabBar
        activeTab={bottomTabActive}
        contactsLabel={t("contactsTitle")}
        navigateToContacts={navigateToContacts}
        navigateToWallet={navigateToWallet}
        t={t}
        walletLabel={t("wallet")}
      />

      <button
        type="button"
        className="contacts-fab"
        onClick={openNewContactPage}
        aria-label={t("addContact")}
        title={t("addContact")}
      >
        <span aria-hidden="true">+</span>
      </button>
    </>
  );
};

export default ContactsPage;
