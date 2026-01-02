import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import React, { useMemo, useState } from "react";
import "./App.css";
import type { ContactId } from "./evolu";
import { evolu, useEvolu } from "./evolu";

type LnAddress = {
  address: string;
  isPrimary: boolean;
};

type ContactFormState = {
  name: string;
  npub: string;
  lnAddresses: { address: string; isPrimary: boolean }[];
  email: string;
  phone: string;
};

const makeEmptyForm = (): ContactFormState => ({
  name: "",
  npub: "",
  lnAddresses: [{ address: "", isPrimary: true }],
  email: "",
  phone: "",
});

const App = () => {
  console.log("App component rendering");
  const { insert, update } = useEvolu();

  const [form, setForm] = useState<ContactFormState>(makeEmptyForm());
  const [editingId, setEditingId] = useState<ContactId | null>(null);
  const [mnemonicInput, setMnemonicInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [owner, setOwner] = useState<Awaited<typeof evolu.appOwner> | null>(
    null
  );

  React.useEffect(() => {
    evolu.appOwner.then(setOwner);
  }, []);

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

  const resetForm = () => {
    setForm(makeEmptyForm());
    setEditingId(null);
  };

  const handleLnChange = (index: number, patch: Partial<LnAddress>) => {
    setForm((prev) => {
      const next = prev.lnAddresses.map((ln, i) =>
        i === index ? { ...ln, ...patch } : ln
      );
      return { ...prev, lnAddresses: next };
    });
  };

  const addLnAddress = () => {
    setForm((prev) => ({
      ...prev,
      lnAddresses: [
        ...prev.lnAddresses,
        { address: "", isPrimary: prev.lnAddresses.length === 0 },
      ],
    }));
  };

  const setPrimaryLn = (index: number) => {
    setForm((prev) => ({
      ...prev,
      lnAddresses: prev.lnAddresses.map((ln, i) => ({
        ...ln,
        isPrimary: i === index,
      })),
    }));
  };

  const removeLnAddress = (index: number) => {
    setForm((prev) => ({
      ...prev,
      lnAddresses: prev.lnAddresses.filter((_, i) => i !== index),
    }));
  };

  const handleSaveContact = () => {
    const name = form.name.trim();
    const npub = form.npub.trim();
    const lnAddresses = form.lnAddresses
      .map((ln) => ({ ...ln, address: ln.address.trim() }))
      .filter((ln) => ln.address.length > 0);

    if (!name || !npub) {
      setStatus("Vyplňte jméno i npub.");
      return;
    }

    if (lnAddresses.length === 0) {
      setStatus("Přidejte alespoň jednu LN adresu.");
      return;
    }

    if (lnAddresses.every((ln) => !ln.isPrimary))
      lnAddresses[0].isPrimary = true;

    const payload = {
      name: name as typeof Evolu.NonEmptyString1000.Type,
      npub: npub as typeof Evolu.NonEmptyString1000.Type,
      lnAddresses: JSON.stringify(
        lnAddresses
      ) as typeof Evolu.NonEmptyString1000.Type,
      email: form.email.trim()
        ? (form.email.trim() as typeof Evolu.String1000.Type)
        : null,
      phone: form.phone.trim()
        ? (form.phone.trim() as typeof Evolu.String1000.Type)
        : null,
    };

    if (editingId) {
      const result = update("contact", { id: editingId, ...payload });
      if (result.ok) {
        setStatus("Kontakt byl upraven.");
      } else {
        setStatus(`Chyba: ${String(result.error)}`);
      }
    } else {
      const result = insert("contact", payload);
      if (result.ok) {
        setStatus("Kontakt byl uložen.");
      } else {
        setStatus(`Chyba: ${String(result.error)}`);
      }
    }

    resetForm();
  };

  const startEdit = (contact: (typeof contacts)[number]) => {
    setEditingId(contact.id);
    const lnAddresses = contact.lnAddresses
      ? JSON.parse(contact.lnAddresses)
      : [{ address: "", isPrimary: true }];
    setForm({
      name: contact.name ?? "",
      npub: contact.npub ?? "",
      lnAddresses,
      email: contact.email ?? "",
      phone: contact.phone ?? "",
    });
  };

  const handleDelete = (id: ContactId) => {
    const result = update("contact", { id, isDeleted: Evolu.sqliteTrue });
    if (result.ok) {
      setStatus("Kontakt byl smazán.");
    } else {
      setStatus(`Chyba: ${String(result.error)}`);
    }
  };

  const handleGenerateKeys = () => {
    evolu.resetAppOwner();
    setStatus("Vygenerovali jsme nové klíče. Uložte si je na bezpečném místě.");
  };

  const handleApplyKeys = async () => {
    const value = mnemonicInput.trim();
    if (!value) {
      setStatus("Zadejte klíče (seed).");
      return;
    }

    try {
      await evolu.restoreAppOwner(value as Evolu.Mnemonic);
      setStatus(
        "Klíče byly nastaveny. Vaše kontakty pro tohoto vlastníka se načetly."
      );
    } catch (error) {
      setStatus(`Chyba: ${String(error)}`);
    }
  };

  const copyMnemonic = async () => {
    if (!owner || !owner.mnemonic) return;
    await navigator.clipboard?.writeText(owner.mnemonic);
    setStatus("Klíče zkopírovány do schránky.");
  };
  console.log("Rendering with contacts:", contacts.length, "owner:", owner);
  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Linky · Evolu PWA</p>
          <h1>Správa kontaktů s lokálním uložením</h1>
          <p className="lede">
            Klíče zůstávají u vás. Kontakty se ukládají do Evolu, fungují
            offline a PWA lze nainstalovat na zařízení.
          </p>
        </div>
        <div className="badge-box">
          <span className="badge">PWA ready</span>
          <span className="badge">Local-first</span>
        </div>
      </header>

      <section className="panel key-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Klíče</p>
            <h2>Vygenerujte nebo vložte vlastní seed</h2>
          </div>
          <button
            className="ghost"
            onClick={copyMnemonic}
            disabled={!owner?.mnemonic}
          >
            Zkopírovat aktuální
          </button>
        </div>
        <div className="key-grid">
          <div>
            <label>Aktuální seed</label>
            <div className="mono-box">
              {owner?.mnemonic || "Není k dispozici"}
            </div>
            <small className="hint">
              Změna seedu vás přepne na jiného vlastníka.
            </small>
          </div>
          <div>
            <label>Práce se seedem</label>
            <textarea
              value={mnemonicInput}
              onChange={(e) => setMnemonicInput(e.target.value)}
              placeholder="12 slov oddělených mezerou"
            />
            <div className="key-actions">
              <button onClick={handleGenerateKeys}>
                Vygenerovat nové klíče
              </button>
              <button className="secondary" onClick={handleApplyKeys}>
                Použít zadané klíče
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Kontakty</p>
            <h2>{editingId ? "Upravit kontakt" : "Přidat nový kontakt"}</h2>
          </div>
          {editingId && (
            <button className="ghost" onClick={resetForm}>
              Zrušit úpravy
            </button>
          )}
        </div>
        <div className="form-grid">
          <div className="form-col">
            <label>Jméno*</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Např. Alice"
            />

            <label>npub*</label>
            <input
              value={form.npub}
              onChange={(e) => setForm({ ...form, npub: e.target.value })}
              placeholder="nostr veřejný klíč"
            />

            <label>LN adresy*</label>
            <div className="ln-list">
              {form.lnAddresses.map((ln, index) => (
                <div key={index} className="ln-row">
                  <input
                    value={ln.address}
                    onChange={(e) =>
                      handleLnChange(index, { address: e.target.value })
                    }
                    placeholder="např. alice@zapsat.cz"
                  />
                  <div className="ln-actions">
                    <label className="radio">
                      <input
                        type="radio"
                        name="primary-ln"
                        checked={ln.isPrimary}
                        onChange={() => setPrimaryLn(index)}
                      />
                      hlavní
                    </label>
                    {form.lnAddresses.length > 1 && (
                      <button
                        className="icon"
                        onClick={() => removeLnAddress(index)}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <button className="ghost" onClick={addLnAddress}>
                Přidat další LN adresu
              </button>
            </div>

            <div className="inline">
              <div>
                <label>Email</label>
                <input
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="alice@example.com"
                />
              </div>
              <div>
                <label>Telefon</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+420 ..."
                />
              </div>
            </div>

            <div className="actions">
              <button onClick={handleSaveContact}>
                {editingId ? "Uložit změny" : "Uložit kontakt"}
              </button>
              <button className="secondary" onClick={resetForm}>
                Vyčistit formulář
              </button>
            </div>
            {status && <p className="status">{status}</p>}
          </div>

          <div className="form-col">
            <div className="list-header">
              <h3>Moje kontakty</h3>
              <span className="pill">{contacts.length}</span>
            </div>
            <div className="contact-list">
              {contacts.length === 0 && (
                <p className="muted">Zatím žádné kontakty.</p>
              )}
              {contacts.map((contact) => {
                const lnAddresses: LnAddress[] = contact.lnAddresses
                  ? JSON.parse(contact.lnAddresses)
                  : [];
                return (
                  <article key={contact.id} className="contact-card">
                    <div className="card-header">
                      <div>
                        <h4>{contact.name}</h4>
                        <p className="muted">{contact.npub}</p>
                      </div>
                      <div className="card-actions">
                        <button
                          className="ghost"
                          onClick={() => startEdit(contact)}
                        >
                          Upravit
                        </button>
                        <button
                          className="danger"
                          onClick={() => handleDelete(contact.id)}
                        >
                          Smazat
                        </button>
                      </div>
                    </div>
                    <dl>
                      <div className="row">
                        <dt>LN adresy</dt>
                        <dd className="ln-tags">
                          {lnAddresses.map((ln) => (
                            <span
                              key={ln.address}
                              className={ln.isPrimary ? "tag primary" : "tag"}
                            >
                              {ln.address}
                              {ln.isPrimary && <em>· hlavní</em>}
                            </span>
                          ))}
                        </dd>
                      </div>
                      {contact.email && (
                        <div className="row">
                          <dt>Email</dt>
                          <dd>{contact.email}</dd>
                        </div>
                      )}
                      {contact.phone && (
                        <div className="row">
                          <dt>Telefon</dt>
                          <dd>{contact.phone}</dd>
                        </div>
                      )}
                    </dl>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default App;
