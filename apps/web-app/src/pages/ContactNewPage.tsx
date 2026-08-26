import type { FC } from "react";
import React from "react";
import { ArrowLeft, Save, User, UserPlus } from "lucide-react";
import { getContactQueryPrefill } from "../app/lib/contactQueryPrefill";
import { PasteIcon } from "../components/icons";
import { readClipboardText } from "../platform/clipboard";
import {
  formatShortLightningAddress,
  formatShortNpub,
  getInitials,
  normalizeLocale,
} from "../utils/formatting";
import { normalizeContactGroups } from "../utils/contactGroups";

export interface ContactFormData {
  name: string;
  npub: string;
  lnAddress: string;
  groups: string[];
}

interface ContactFieldsProps {
  form: ContactFormData;
  groupNames: string[];
  includeNpub?: boolean;
  lightningLabelAction?: React.ReactNode;
  nameLabelAction?: React.ReactNode;
  setForm: (value: ContactFormData) => void;
  t: (key: string) => string;
}

export function ContactFields({
  form,
  groupNames,
  includeNpub = false,
  lightningLabelAction,
  nameLabelAction,
  setForm,
  t,
}: ContactFieldsProps) {
  const [groupInput, setGroupInput] = React.useState("");
  const allGroups = normalizeContactGroups([...form.groups, ...groupNames]);
  const addGroup = (value: string) => {
    const groups = normalizeContactGroups([...form.groups, value]);
    if (groups.length === form.groups.length) return;
    setForm({ ...form, groups });
    setGroupInput("");
  };
  const removeGroup = (value: string) => {
    setForm({
      ...form,
      groups: form.groups.filter((group) => group !== value),
    });
  };
  const renderLabel = (label: string, action: React.ReactNode | undefined) =>
    action === undefined ? (
      <label>{label}</label>
    ) : (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <label>{label}</label>
        {action}
      </div>
    );

  return (
    <>
      {renderLabel(t("name"), nameLabelAction)}
      <input
        value={form.name}
        onChange={(event) => setForm({ ...form, name: event.target.value })}
        placeholder={t("namePlaceholder")}
      />

      {includeNpub ? (
        <>
          <label>{t("npub")}</label>
          <input
            value={form.npub}
            onChange={(event) => setForm({ ...form, npub: event.target.value })}
            placeholder={t("npubPlaceholder")}
          />
        </>
      ) : null}

      {renderLabel(t("lightningAddress"), lightningLabelAction)}
      <input
        value={form.lnAddress}
        onChange={(event) =>
          setForm({ ...form, lnAddress: event.target.value })
        }
        placeholder={t("lightningAddressPlaceholder")}
      />

      <label>{t("group")}</label>
      {allGroups.length > 0 ? (
        <div className="contact-group-selector" aria-label={t("group")}>
          {allGroups.map((group) => {
            const isSelected = form.groups.includes(group);
            return (
              <button
                className={
                  isSelected
                    ? "group-filter-btn contact-group-pill is-active"
                    : "group-filter-btn contact-group-pill"
                }
                key={group}
                type="button"
                onClick={() =>
                  isSelected ? removeGroup(group) : addGroup(group)
                }
                aria-pressed={isSelected}
              >
                {group}
              </button>
            );
          })}
        </div>
      ) : null}
      <input
        value={groupInput}
        onChange={(event) => setGroupInput(event.target.value)}
        onBlur={() => addGroup(groupInput)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== ",") return;
          event.preventDefault();
          addGroup(groupInput);
        }}
        placeholder={t("groupPlaceholder")}
      />
    </>
  );
}

interface ContactSearchCandidate {
  existingContactId?: string;
  isExactMatch: boolean;
  lnAddress: string;
  name: string;
  npub: string;
  pictureUrl: string | null;
  query: string;
}

interface ContactSuggestionCandidate extends Omit<
  ContactSearchCandidate,
  "isExactMatch"
> {
  lastSeenAtSec: number;
}

type ContactSearchResult =
  | { kind: "empty" }
  | { kind: "error"; identifier: string }
  | { kind: "found"; contacts: ContactSearchCandidate[] }
  | { kind: "not_found"; query: string };

interface ContactSearchResults {
  contacts: ContactSearchCandidate[];
  query: string;
}

interface ContactNewPageProps {
  addNewContactFromSearchResult: (
    candidate: ContactSearchCandidate,
  ) => Promise<void>;
  contactSuggestions: readonly ContactSuggestionCandidate[];
  form: ContactFormData;
  groupNames: string[];
  handleSaveContact: () => void;
  isSavingContact: boolean;
  lang: string;
  searchNewContact: (query?: string) => Promise<ContactSearchResult>;
  setForm: (value: ContactFormData) => void;
  t: (key: string) => string;
}

export const ContactNewPage: FC<ContactNewPageProps> = ({
  addNewContactFromSearchResult,
  contactSuggestions,
  form,
  groupNames,
  handleSaveContact,
  isSavingContact,
  lang,
  searchNewContact,
  setForm,
  t,
}) => {
  const [step, setStep] = React.useState<"search" | "details">("search");
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const [searchIsBusy, setSearchIsBusy] = React.useState(false);
  const [searchResults, setSearchResults] =
    React.useState<ContactSearchResults | null>(null);
  const [manualCreateQuery, setManualCreateQuery] = React.useState<
    string | null
  >(null);
  const lastSearchedQueryRef = React.useRef("");
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);
  const searchQueryRef = React.useRef("");
  const searchRequestSeqRef = React.useRef(0);

  const searchQuery = form.npub.trim();
  const showSuggestions = step === "search" && contactSuggestions.length > 0;

  React.useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

  React.useEffect(() => {
    if (form.lnAddress.trim()) {
      setStep("details");
    }
  }, [form.lnAddress]);

  React.useEffect(() => {
    if (step !== "search") return;
    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus({ preventScroll: true });
    }, 120);

    return () => window.clearTimeout(timer);
  }, [step]);

  const clearSearchFeedback = React.useCallback(() => {
    setSearchError(null);
    setSearchResults(null);
    setManualCreateQuery(null);
  }, []);

  const runSearch = React.useCallback(
    async (query = searchQuery, options?: { silentEmpty?: boolean }) => {
      const queryText = query.trim();
      if (!queryText) {
        if (!options?.silentEmpty) {
          setSearchError(t("contactSearchEmpty"));
        }
        setSearchResults(null);
        setManualCreateQuery(null);
        return;
      }

      const requestSeq = searchRequestSeqRef.current + 1;
      searchRequestSeqRef.current = requestSeq;
      lastSearchedQueryRef.current = queryText;
      setSearchIsBusy(true);
      clearSearchFeedback();
      const result = await searchNewContact(queryText);

      if (requestSeq !== searchRequestSeqRef.current) return;
      if (searchQueryRef.current !== queryText) {
        setSearchIsBusy(false);
        return;
      }

      setSearchIsBusy(false);

      if (result.kind === "found") {
        setManualCreateQuery(null);
        setSearchResults({ contacts: result.contacts, query: queryText });
        return;
      }

      if (result.kind === "error") {
        setManualCreateQuery(null);
        setSearchError(
          t("nip05ResolveFailed").replace("{identifier}", result.identifier),
        );
        return;
      }

      if (result.kind === "not_found") {
        setSearchError(null);
        setManualCreateQuery(queryText);
      }
    },
    [clearSearchFeedback, searchNewContact, searchQuery, t],
  );

  const pasteSearch = async () => {
    const text = await readClipboardText();
    const queryText = String(text ?? "").trim();
    if (!queryText) return;
    searchQueryRef.current = queryText;
    setForm({ ...form, npub: queryText });
    await runSearch(queryText);
  };

  React.useEffect(() => {
    if (step !== "search") return;
    if (!searchQuery) {
      setSearchResults(null);
      setManualCreateQuery(null);
      return;
    }

    if (searchResults?.query === searchQuery) return;
    if (lastSearchedQueryRef.current === searchQuery) return;

    const timer = window.setTimeout(() => {
      void runSearch(searchQuery, { silentEmpty: true });
    }, 900);

    return () => window.clearTimeout(timer);
  }, [runSearch, searchQuery, searchResults?.query, step]);

  const createManualFromSearch = () => {
    const prefill = getContactQueryPrefill(searchQuery);
    setForm({
      groups: [],
      lnAddress: prefill.lnAddress,
      name: prefill.name,
      npub: "",
    });
    clearSearchFeedback();
    setStep("details");
  };

  const addSuggestion = async (suggestion: ContactSuggestionCandidate) => {
    await addNewContactFromSearchResult({
      ...suggestion,
      isExactMatch: false,
    });
  };
  const formatSuggestionLastSeen = (lastSeenAtSec: number): string => {
    if (!Number.isFinite(lastSeenAtSec) || lastSeenAtSec <= 0) {
      return t("contactSuggestionActiveRecently");
    }

    const date = new Date(lastSeenAtSec * 1000);
    const today = new Date();
    const todayStartMs = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    ).getTime();
    const dateStartMs = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    ).getTime();
    const dayDiff = Math.round(
      (todayStartMs - dateStartMs) / (24 * 60 * 60 * 1000),
    );

    const lowerLocale = normalizeLocale(lang);
    if (dayDiff === 0) {
      return `${t("contactSuggestionLastSeen")} ${t("today").toLocaleLowerCase(lowerLocale)}`;
    }
    if (dayDiff === 1) {
      return `${t("contactSuggestionLastSeen")} ${t("yesterday").toLocaleLowerCase(lowerLocale)}`;
    }

    const locale = normalizeLocale(lang);
    const formatted = new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "long",
      ...(date.getFullYear() === today.getFullYear()
        ? {}
        : { year: "numeric" }),
    }).format(date);

    return `${t("contactSuggestionLastSeen")} ${formatted}`;
  };
  const canCreateContactFromSearch =
    !searchResults &&
    Boolean(searchQuery) &&
    manualCreateQuery === searchQuery &&
    !searchIsBusy;
  const showSearchLoader =
    Boolean(searchQuery) &&
    !searchResults &&
    !searchError &&
    manualCreateQuery !== searchQuery;

  return (
    <section className="panel panel-plain">
      <div className="form-grid">
        <div className="form-col contact-new-form-col">
          {step === "search" ? (
            <>
              <label>{t("contactSearchLabel")}</label>
              <p className="contact-new-step-hint">{t("contactSearchHint")}</p>
              <div className="contact-new-identifier-input-row">
                <input
                  ref={searchInputRef}
                  value={form.npub}
                  onChange={(e) => {
                    lastSearchedQueryRef.current = "";
                    clearSearchFeedback();
                    setForm({ ...form, npub: e.target.value });
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    void runSearch();
                  }}
                  onPaste={(event) => {
                    const pastedText = event.clipboardData.getData("text");
                    const queryText = pastedText.trim();
                    if (!queryText) return;
                    event.preventDefault();
                    searchQueryRef.current = queryText;
                    setForm({ ...form, npub: queryText });
                    void runSearch(queryText);
                  }}
                  placeholder={t("contactSearchPlaceholder")}
                  autoComplete="off"
                  autoFocus
                  data-guide="contact-search-input"
                />
                <button
                  type="button"
                  className="icon-only-ghost"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => void pasteSearch()}
                  title={t("paste")}
                  aria-label={t("paste")}
                >
                  <PasteIcon size={18} aria-hidden="true" />
                </button>
              </div>

              {searchResults ? (
                <div className="contact-new-search-results">
                  {searchResults.contacts.map((candidate) => {
                    const displayName = String(
                      candidate.name || candidate.query || "",
                    ).trim();
                    return (
                      <div
                        className={
                          candidate.isExactMatch
                            ? "contact-new-search-result is-exact"
                            : "contact-new-search-result"
                        }
                        key={candidate.npub}
                      >
                        <div className="contact-new-search-result-main">
                          <div
                            className="contact-avatar is-large"
                            aria-hidden="true"
                          >
                            {candidate.pictureUrl ? (
                              <img
                                src={candidate.pictureUrl}
                                alt=""
                                loading="lazy"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <span className="contact-avatar-fallback">
                                {getInitials(displayName)}
                              </span>
                            )}
                          </div>
                          <div className="contact-new-search-result-body">
                            <strong>{displayName || t("contact")}</strong>
                            {candidate.lnAddress ? (
                              <span title={candidate.lnAddress}>
                                {formatShortLightningAddress(
                                  candidate.lnAddress,
                                )}
                              </span>
                            ) : null}
                            <small title={candidate.npub}>
                              {formatShortNpub(candidate.npub)}
                            </small>
                          </div>
                        </div>
                        <div className="contact-new-search-result-action">
                          <button
                            type="button"
                            onClick={() =>
                              void addNewContactFromSearchResult(candidate)
                            }
                            disabled={isSavingContact}
                          >
                            <span className="btn-label-with-icon">
                              <span
                                className="btn-label-icon"
                                aria-hidden="true"
                              >
                                {candidate.existingContactId ? (
                                  <User size={18} />
                                ) : (
                                  <UserPlus size={18} />
                                )}
                              </span>
                              <span>
                                {isSavingContact
                                  ? t("saving")
                                  : candidate.existingContactId
                                    ? t("openContact")
                                    : t("saveContact")}
                              </span>
                            </span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {searchError ? (
                <div className="contact-new-search-empty">
                  <p className="contact-new-validation">{searchError}</p>
                </div>
              ) : null}

              {showSearchLoader ? (
                <div className="contact-new-search-loading" role="status">
                  <span className="btn-spinner" aria-hidden="true" />
                  <span>{t("contactSearching")}</span>
                </div>
              ) : null}

              {canCreateContactFromSearch ? (
                <div className="contact-new-search-empty">
                  <button
                    type="button"
                    className="ghost"
                    onClick={createManualFromSearch}
                    disabled={searchIsBusy}
                  >
                    {t("contactSearchCreateFromQuery")}
                  </button>
                </div>
              ) : null}
              {showSuggestions ? (
                <div className="contact-new-suggestions">
                  <div className="contact-new-suggestions-title">
                    {t("contactSuggestionsTitle")}
                  </div>
                  <div className="contact-new-suggestion-list">
                    {contactSuggestions.map((suggestion) => {
                      const displayName = String(
                        suggestion.name || suggestion.query || "",
                      ).trim();
                      const avatarUrl = suggestion.pictureUrl ?? null;

                      return (
                        <div
                          className="contact-new-suggestion"
                          key={suggestion.npub}
                        >
                          <div className="contact-new-suggestion-main">
                            <span className="contact-avatar" aria-hidden="true">
                              {avatarUrl ? (
                                <img
                                  src={avatarUrl}
                                  alt=""
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <span className="contact-avatar-fallback">
                                  {getInitials(displayName)}
                                </span>
                              )}
                            </span>
                            <span className="contact-new-suggestion-body">
                              <strong>{displayName || t("contact")}</strong>
                              <span title={suggestion.lnAddress}>
                                {formatShortLightningAddress(
                                  suggestion.lnAddress,
                                )}
                              </span>
                              <small>
                                {formatSuggestionLastSeen(
                                  suggestion.lastSeenAtSec,
                                )}
                              </small>
                            </span>
                          </div>
                          <div className="contact-new-suggestion-action">
                            <button
                              type="button"
                              onClick={() => void addSuggestion(suggestion)}
                              disabled={isSavingContact}
                            >
                              <span className="btn-label-with-icon">
                                <span
                                  className="btn-label-icon"
                                  aria-hidden="true"
                                >
                                  <UserPlus size={18} />
                                </span>
                                <span>
                                  {isSavingContact
                                    ? t("saving")
                                    : t("saveContact")}
                                </span>
                              </span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <ContactFields
                form={form}
                groupNames={groupNames}
                setForm={setForm}
                t={t}
              />

              <div className="actions">
                <button onClick={handleSaveContact} disabled={isSavingContact}>
                  <span className="btn-label-with-icon">
                    <span className="btn-label-icon" aria-hidden="true">
                      <Save size={18} />
                    </span>
                    <span>
                      {isSavingContact ? t("saving") : t("saveContact")}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setStep("search")}
                  disabled={isSavingContact}
                >
                  <span className="btn-label-with-icon">
                    <span className="btn-label-icon" aria-hidden="true">
                      <ArrowLeft size={18} />
                    </span>
                    <span>{t("back")}</span>
                  </span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
};
