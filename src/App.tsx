import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import React, { useMemo, useState } from "react";
import "./App.css";
import type { ContactId } from "./evolu";
import { evolu, useEvolu } from "./evolu";
import { getInitialLang, persistLang, translations, type Lang } from "./i18n";
import { INITIAL_MNEMONIC_STORAGE_KEY } from "./mnemonic";

type ContactFormState = {
  name: string;
  npub: string;
  lnAddress: string;
};

const makeEmptyForm = (): ContactFormState => ({
  name: "",
  npub: "",
  lnAddress: "",
});

type ActiveSection = "contacts" | "settings";

const App = () => {
  console.log("App component rendering");
  const { insert, update } = useEvolu();

  const [form, setForm] = useState<ContactFormState>(makeEmptyForm());
  const [editingId, setEditingId] = useState<ContactId | null>(null);
  const [activeSection, setActiveSection] = useState<ActiveSection>("contacts");
  const [isContactFormOpen, setIsContactFormOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<ContactId | null>(
    null
  );
  const [isPasteArmed, setIsPasteArmed] = useState(false);
  const [lang, setLang] = useState<Lang>(() => getInitialLang());
  const [owner, setOwner] = useState<Awaited<typeof evolu.appOwner> | null>(
    null
  );

  const t = <K extends keyof typeof translations.cs>(key: K) =>
    translations[lang][key];

  React.useEffect(() => {
    evolu.appOwner.then(setOwner);
  }, []);

  React.useEffect(() => {
    persistLang(lang);
    try {
      document.documentElement.lang = lang;
    } catch {
      // ignore
    }
  }, [lang]);

  React.useEffect(() => {
    if (!pendingDeleteId) return;
    const timeoutId = window.setTimeout(() => {
      setPendingDeleteId(null);
    }, 5000);
    return () => window.clearTimeout(timeoutId);
  }, [pendingDeleteId]);

  React.useEffect(() => {
    if (!isPasteArmed) return;
    const timeoutId = window.setTimeout(() => {
      setIsPasteArmed(false);
    }, 5000);
    return () => window.clearTimeout(timeoutId);
  }, [isPasteArmed]);

  React.useEffect(() => {
    if (!status) return;
    const timeoutId = window.setTimeout(() => {
      setStatus(null);
    }, 5000);
    return () => window.clearTimeout(timeoutId);
  }, [status]);

  // Query pro všechny aktivní kontakty
  const contactsQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("contact")
          .selectAll()
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .orderBy("createdAt", "desc")
      ),
    []
  );

  const contacts = useQuery(contactsQuery);

  const clearContactForm = () => {
    setForm(makeEmptyForm());
    setEditingId(null);
  };

  const closeContactForm = () => {
    clearContactForm();
    setIsContactFormOpen(false);
  };

  const openNewContactForm = () => {
    setActiveSection("contacts");
    setIsContactFormOpen(true);
    setPendingDeleteId(null);
    setIsPasteArmed(false);
    setEditingId(null);
    setForm(makeEmptyForm());
  };

  const toggleSettings = () => {
    setActiveSection((current) => {
      const next = current === "settings" ? "contacts" : "settings";
      if (next === "settings") {
        closeContactForm();
      }
      setPendingDeleteId(null);
      setIsPasteArmed(false);
      return next;
    });
  };

  const goHome = () => {
    setActiveSection("contacts");
    setPendingDeleteId(null);
    setIsPasteArmed(false);
    closeContactForm();
  };

  const handleDelete = (id: ContactId) => {
    const result = update("contact", { id, isDeleted: Evolu.sqliteTrue });
    if (result.ok) {
      setStatus(t("contactDeleted"));
      return;
    }
    setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
  };

  const requestDelete = (id: ContactId) => {
    if (pendingDeleteId === id) {
      setPendingDeleteId(null);
      handleDelete(id);
      return;
    }

    setPendingDeleteId(id);
    setStatus(t("deleteArmedHint"));
  };

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard?.writeText(value);
      setStatus(t("copiedToClipboard"));
    } catch {
      setStatus(t("copyFailed"));
    }
  };

  const applyKeysFromText = async (value: string) => {
    try {
      const mnemonicResult = Evolu.Mnemonic.fromUnknown(value);
      if (!mnemonicResult.ok) {
        setStatus(Evolu.createFormatTypeError()(mnemonicResult.error));
        return;
      }

      const mnemonic = mnemonicResult.value;
      setStatus(t("keysPasting"));
      await evolu.restoreAppOwner(mnemonic, { reload: false });
      try {
        localStorage.setItem(INITIAL_MNEMONIC_STORAGE_KEY, mnemonic);
      } catch {
        // ignore
      }
      globalThis.location.reload();
    } catch (error) {
      setStatus(`${t("errorPrefix")}: ${String(error)}`);
    }
  };

  const pasteKeysFromClipboard = async () => {
    if (!navigator.clipboard?.readText) {
      setStatus(t("pasteNotAvailable"));
      return;
    }

    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        setStatus(t("pasteEmpty"));
        return;
      }
      await applyKeysFromText(text);
    } catch {
      setStatus(t("pasteNotAvailable"));
    }
  };

  const requestPasteKeys = async () => {
    if (isPasteArmed) {
      setIsPasteArmed(false);
      await pasteKeysFromClipboard();
      return;
    }
    setIsPasteArmed(true);
    setStatus(t("pasteArmedHint"));
  };

  const startEdit = (contact: (typeof contacts)[number]) => {
    setActiveSection("contacts");
    setIsContactFormOpen(true);
    setPendingDeleteId(null);
    setIsPasteArmed(false);

    setEditingId(contact.id);
    setForm({
      name: (contact.name ?? "") as string,
      npub: (contact.npub ?? "") as string,
      lnAddress: (contact.lnAddress ?? "") as string,
    });
  };

  const handleSaveContact = () => {
    const name = form.name.trim();
    const npub = form.npub.trim();
    const lnAddress = form.lnAddress.trim();

    if (!name && !npub && !lnAddress) {
      setStatus(t("fillAtLeastOne"));
      return;
    }

    const payload = {
      name: name ? (name as typeof Evolu.NonEmptyString1000.Type) : null,
      npub: npub ? (npub as typeof Evolu.NonEmptyString1000.Type) : null,
      lnAddress: lnAddress
        ? (lnAddress as typeof Evolu.NonEmptyString1000.Type)
        : null,
    };

    if (editingId) {
      const result = update("contact", { id: editingId, ...payload });
      if (result.ok) {
        setStatus(t("contactUpdated"));
      } else {
        setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
      }
    } else {
      const result = insert("contact", payload);
      if (result.ok) {
        setStatus(t("contactSaved"));
      } else {
        setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
      }
    }

    closeContactForm();
  };

  const copyMnemonic = async () => {
    if (!owner || !owner.mnemonic) return;
    await navigator.clipboard?.writeText(owner.mnemonic);
    setStatus(t("keysCopied"));
  };
  console.log("Rendering with contacts:", contacts.length, "owner:", owner);
  return (
    <div className="page">
      <header className="hero">
        <div className="hero-content">
          <button className="title-button" onClick={goHome}>
            {t("appTitle")}
          </button>
          <p className="eyebrow">{t("appTagline")}</p>
        </div>
        <div className="hero-actions">
          <button
            className="ghost gear-button"
            onClick={toggleSettings}
            aria-label={
              activeSection === "settings" ? t("close") : t("settings")
            }
            title={activeSection === "settings" ? t("close") : t("settings")}
          >
            <span className="gear-icon">⚙︎</span>
            <span className="gear-label">{t("settings")}</span>
          </button>
        </div>
      </header>

      {activeSection === "settings" && (
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">{t("settings")}</p>
              <h2>{t("keys")}</h2>
            </div>
            <div className="badge-box">
              <button
                className="ghost"
                onClick={copyMnemonic}
                disabled={!owner?.mnemonic}
              >
                {t("copyCurrent")}
              </button>
              <button
                className={isPasteArmed ? "danger" : "ghost"}
                onClick={requestPasteKeys}
                aria-label={t("paste")}
                title={isPasteArmed ? t("pasteArmedHint") : t("paste")}
              >
                {t("paste")}
              </button>
            </div>
          </div>

          <div className="panel-header">
            <div>
              <h2>{t("language")}</h2>
            </div>
            <div className="badge-box">
              <button
                className={lang === "cs" ? "" : "secondary"}
                onClick={() => setLang("cs")}
              >
                {t("czech")}
              </button>
              <button
                className={lang === "en" ? "" : "secondary"}
                onClick={() => setLang("en")}
              >
                {t("english")}
              </button>
            </div>
          </div>

          {status && <p className="status">{status}</p>}
        </section>
      )}

      {activeSection === "contacts" && (
        <>
          <section className="panel">
            <div className="list-header">
              <h3>{t("list")}</h3>

              <button onClick={openNewContactForm}>{t("addContact")}</button>
            </div>
            <div className="contact-list">
              {contacts.length === 0 && (
                <p className="muted">{t("noContactsYet")}</p>
              )}
              {contacts.map((contact) => {
                const isDeleteArmed = pendingDeleteId === contact.id;
                return (
                  <article key={contact.id} className="contact-card">
                    <div className="card-header">
                      <div className="card-main">
                        <div className="card-title-row">
                          {contact.name ? <h4>{contact.name}</h4> : null}
                          <div className="contact-badges">
                            {contact.lnAddress ? (
                              <button
                                type="button"
                                className="tag tag-button"
                                onClick={() => {
                                  setPendingDeleteId(null);
                                  copyToClipboard(contact.lnAddress!);
                                }}
                                title="Kliknutím zkopírujete lightning adresu"
                              >
                                {contact.lnAddress}
                              </button>
                            ) : null}
                            {contact.npub ? (
                              <button
                                type="button"
                                className="tag tag-button"
                                onClick={() => {
                                  setPendingDeleteId(null);
                                  copyToClipboard(contact.npub!);
                                }}
                                title="Kliknutím zkopírujete npub"
                              >
                                {t("npub")}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <div className="card-actions">
                        <button
                          className="ghost"
                          onClick={() => startEdit(contact)}
                          aria-label={t("edit")}
                        >
                          <span className="btn-icon" aria-hidden="true">
                            ✎
                          </span>
                          <span className="btn-label">{t("edit")}</span>
                        </button>
                        <button
                          className={isDeleteArmed ? "danger" : "ghost"}
                          onClick={() => requestDelete(contact.id)}
                          aria-label={isDeleteArmed ? t("delete") : t("delete")}
                          title={
                            isDeleteArmed
                              ? "Klikněte znovu pro smazání"
                              : t("delete")
                          }
                        >
                          <span
                            className={
                              isDeleteArmed
                                ? "btn-icon danger-armed"
                                : "btn-icon"
                            }
                            aria-hidden="true"
                          >
                            🗑
                          </span>
                          <span className="btn-label">{t("delete")}</span>
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            {status && <p className="status">{status}</p>}
          </section>

          {isContactFormOpen && (
            <section className="panel">
              <div className="panel-header keep-right">
                <div>
                  <p className="eyebrow">{t("contact")}</p>
                  <h2>{editingId ? t("editContact") : t("newContact")}</h2>
                </div>
                <button className="ghost" onClick={closeContactForm}>
                  {t("close")}
                </button>
              </div>

              <div className="form-grid">
                <div className="form-col">
                  <label>Jméno</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Např. Alice"
                  />

                  <label>npub</label>
                  <input
                    value={form.npub}
                    onChange={(e) => setForm({ ...form, npub: e.target.value })}
                    placeholder="nostr veřejný klíč"
                  />

                  <label>{t("lightningAddress")}</label>
                  <input
                    value={form.lnAddress}
                    onChange={(e) =>
                      setForm({ ...form, lnAddress: e.target.value })
                    }
                    placeholder="např. alice@zapsat.cz"
                  />

                  <div className="actions">
                    <button onClick={handleSaveContact}>
                      {editingId ? t("saveChanges") : t("saveContact")}
                    </button>
                    <button className="secondary" onClick={clearContactForm}>
                      {t("clearForm")}
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
};

export default App;
