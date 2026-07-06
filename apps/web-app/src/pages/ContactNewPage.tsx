import type { FC } from "react";
import React from "react";
import { ArrowLeft, Save, UserPlus } from "lucide-react";
import { PasteIcon } from "../components/icons";
import { readClipboardText } from "../platform/clipboard";
import { formatShortNpub, getInitials } from "../utils/formatting";

interface ContactFormData {
  name: string;
  npub: string;
  lnAddress: string;
  group: string;
}

interface ContactSearchCandidate {
  lnAddress: string;
  name: string;
  npub: string;
  pictureUrl: string | null;
  query: string;
}

type ContactSearchResult =
  | { kind: "empty" }
  | { kind: "error"; identifier: string }
  | { kind: "found"; contact: ContactSearchCandidate }
  | { kind: "not_found"; query: string };

interface ContactNewPageProps {
  addNewContactFromSearchResult: (
    candidate: ContactSearchCandidate,
  ) => Promise<void>;
  form: ContactFormData;
  groupNames: string[];
  handleSaveContact: () => void;
  isSavingContact: boolean;
  searchNewContact: (query?: string) => Promise<ContactSearchResult>;
  setForm: (value: ContactFormData) => void;
  t: (key: string) => string;
}

export const ContactNewPage: FC<ContactNewPageProps> = ({
  addNewContactFromSearchResult,
  form,
  groupNames,
  handleSaveContact,
  isSavingContact,
  searchNewContact,
  setForm,
  t,
}) => {
  const [step, setStep] = React.useState<"search" | "details">("search");
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const [searchIsBusy, setSearchIsBusy] = React.useState(false);
  const [searchResult, setSearchResult] =
    React.useState<ContactSearchCandidate | null>(null);
  const [manualCreateQuery, setManualCreateQuery] = React.useState<
    string | null
  >(null);
  const lastSearchedQueryRef = React.useRef("");
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);
  const searchQueryRef = React.useRef("");
  const searchRequestSeqRef = React.useRef(0);

  const searchQuery = form.npub.trim();
  const resultAvatarUrl = searchResult?.pictureUrl ?? null;
  const resultDisplayName = String(
    searchResult?.name || searchResult?.query || "",
  ).trim();

  React.useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

  React.useEffect(() => {
    if (step !== "search") return;
    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus({ preventScroll: true });
    }, 120);

    return () => window.clearTimeout(timer);
  }, [step]);

  const clearSearchFeedback = React.useCallback(() => {
    setSearchError(null);
    setSearchResult(null);
    setManualCreateQuery(null);
  }, []);

  const pasteSearch = async () => {
    const text = await readClipboardText();
    if (!text) return;
    setForm({ ...form, npub: text.trim() });
    lastSearchedQueryRef.current = "";
    clearSearchFeedback();
  };

  const runSearch = React.useCallback(
    async (query = searchQuery, options?: { silentEmpty?: boolean }) => {
      const queryText = query.trim();
      if (!queryText) {
        if (!options?.silentEmpty) {
          setSearchError(t("contactSearchEmpty"));
        }
        setSearchResult(null);
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
        setSearchResult(result.contact);
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

  React.useEffect(() => {
    if (step !== "search") return;
    if (!searchQuery) {
      setSearchResult(null);
      setManualCreateQuery(null);
      return;
    }

    if (searchResult?.query.trim() === searchQuery) return;
    if (lastSearchedQueryRef.current === searchQuery) return;

    const timer = window.setTimeout(() => {
      void runSearch(searchQuery, { silentEmpty: true });
    }, 900);

    return () => window.clearTimeout(timer);
  }, [runSearch, searchQuery, searchResult?.query, step]);

  const createManualFromSearch = () => {
    setForm({
      group: "",
      lnAddress: "",
      name: searchQuery,
      npub: "",
    });
    clearSearchFeedback();
    setStep("details");
  };

  const addSearchResult = async () => {
    if (!searchResult) return;
    await addNewContactFromSearchResult(searchResult);
  };
  const canCreateContactFromSearch =
    !searchResult &&
    Boolean(searchQuery) &&
    manualCreateQuery === searchQuery &&
    !searchIsBusy;

  return (
    <section className="panel panel-plain">
      <div className="form-grid">
        <div className="form-col">
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
                  placeholder={t("contactSearchPlaceholder")}
                  autoComplete="off"
                  autoFocus
                  data-guide="contact-search-input"
                />
                <button
                  type="button"
                  className="icon-only-ghost"
                  onClick={() => void pasteSearch()}
                  title={t("paste")}
                  aria-label={t("paste")}
                >
                  <PasteIcon size={18} aria-hidden="true" />
                </button>
              </div>

              {searchResult ? (
                <div className="contact-new-search-result">
                  <div className="contact-new-search-result-main">
                    <div className="contact-avatar is-large" aria-hidden="true">
                      {resultAvatarUrl ? (
                        <img
                          src={resultAvatarUrl}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="contact-avatar-fallback">
                          {getInitials(resultDisplayName)}
                        </span>
                      )}
                    </div>
                    <div className="contact-new-search-result-body">
                      <strong>{resultDisplayName || t("contact")}</strong>
                      {searchResult.lnAddress ? (
                        <span>{searchResult.lnAddress}</span>
                      ) : null}
                      <small title={searchResult.npub}>
                        {formatShortNpub(searchResult.npub)}
                      </small>
                    </div>
                  </div>
                  <div className="contact-new-search-result-action">
                    <button
                      type="button"
                      onClick={() => void addSearchResult()}
                      disabled={isSavingContact}
                    >
                      <span className="btn-label-with-icon">
                        <span className="btn-label-icon" aria-hidden="true">
                          <UserPlus size={18} />
                        </span>
                        <span>
                          {isSavingContact ? t("saving") : t("saveContact")}
                        </span>
                      </span>
                    </button>
                  </div>
                </div>
              ) : null}

              {searchError ? (
                <div className="contact-new-search-empty">
                  <p className="contact-new-validation">{searchError}</p>
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
            </>
          ) : (
            <>
              <label>{t("name")}</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t("namePlaceholder")}
              />

              <label>{t("lightningAddress")}</label>
              <input
                value={form.lnAddress}
                onChange={(e) =>
                  setForm({ ...form, lnAddress: e.target.value })
                }
                placeholder={t("lightningAddressPlaceholder")}
              />

              <label>{t("group")}</label>
              <input
                value={form.group}
                onChange={(e) => setForm({ ...form, group: e.target.value })}
                placeholder={t("groupPlaceholder")}
                list={groupNames.length ? "group-options" : undefined}
              />
              {groupNames.length > 0 && (
                <datalist id="group-options">
                  {groupNames.map((group) => (
                    <option key={group} value={group} />
                  ))}
                </datalist>
              )}

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
