import type { FC } from "react";
import React from "react";
import type { ContactRowLike } from "../app/types/appTypes";
import { BottomTabBar } from "../components/BottomTabBar";

interface ContactsPageProps {
  activeGroup: string | null;
  bottomTabActive: "contacts" | "wallet" | null;
  contacts: readonly ContactRowLike[];
  contactsSearch: string;
  contactsSearchInputRef: React.RefObject<HTMLInputElement | null>;
  contactsToolbarStyle: React.CSSProperties;
  conversationsLabel: string;
  groupNames: string[];
  noGroupFilterValue: string;
  openNewContactPage: () => void;
  onboardingContent?: React.ReactNode;
  otherContactsLabel: string;
  renderContactCard: (contact: ContactRowLike) => React.ReactNode;
  setActiveGroup: (value: string | null) => void;
  setContactsSearch: (value: string) => void;
  showGroupFilter: boolean;
  showNoGroupFilter: boolean;
  showBottomTabBar?: boolean;
  showFab?: boolean;
  t: (key: string) => string;
  visibleContacts: {
    conversations: ContactRowLike[];
    others: ContactRowLike[];
  };
}

export const ContactsPage: FC<ContactsPageProps> = ({
  activeGroup,
  bottomTabActive,
  contacts,
  contactsSearch,
  contactsSearchInputRef,
  contactsToolbarStyle,
  conversationsLabel,
  groupNames,
  noGroupFilterValue,
  openNewContactPage,
  onboardingContent,
  otherContactsLabel,
  renderContactCard,
  setActiveGroup,
  setContactsSearch,
  showGroupFilter,
  showNoGroupFilter,
  showBottomTabBar = true,
  showFab = true,
  t,
  visibleContacts,
}) => {
  const totalVisible =
    visibleContacts.conversations.length + visibleContacts.others.length;

  return (
    <>
      {onboardingContent}
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

      {showBottomTabBar ? (
        <BottomTabBar
          activeTab={bottomTabActive}
          contactsLabel={t("contactsTitle")}
          t={t}
          walletLabel={t("wallet")}
        />
      ) : null}

      {showFab ? (
        <button
          type="button"
          className="contacts-fab"
          onClick={openNewContactPage}
          aria-label={t("addContact")}
          title={t("addContact")}
          data-guide="contact-add-button"
        >
          <span aria-hidden="true">+</span>
        </button>
      ) : null}
    </>
  );
};
