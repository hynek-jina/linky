import type { FC } from "react";
import { Archive, RefreshCcw, Save } from "lucide-react";
import type { ContactId } from "../evolu";

interface Contact {
  archivedAtSec?: number | string | null;
  id: ContactId;
  npub?: string | null;
}

interface ContactFormData {
  name: string;
  npub: string;
  lnAddress: string;
  group: string;
}

interface ContactEditPageProps {
  contactEditsSavable: boolean;
  editingId: ContactId | null;
  form: ContactFormData;
  groupNames: string[];
  handleSaveContact: () => void;
  isSavingContact: boolean;
  blockArchivedContact: () => Promise<void>;
  pendingDeleteId: ContactId | null;
  restoreArchivedContact: () => void;
  requestDeleteCurrentContact: () => void;
  resetEditedContactFieldFromNostr: (
    field: "name" | "lnAddress",
  ) => Promise<void>;
  selectedContact: Contact | null;
  setForm: (value: ContactFormData) => void;
  t: (key: string) => string;
}

export const ContactEditPage: FC<ContactEditPageProps> = ({
  contactEditsSavable,
  editingId,
  form,
  groupNames,
  handleSaveContact,
  isSavingContact,
  blockArchivedContact,
  pendingDeleteId,
  restoreArchivedContact,
  requestDeleteCurrentContact,
  resetEditedContactFieldFromNostr,
  selectedContact,
  setForm,
  t,
}) => {
  const isArchivedContact = Number(selectedContact?.archivedAtSec ?? 0) > 0;
  const canBlockArchivedContact = Boolean(
    String(selectedContact?.npub ?? "").trim(),
  );

  return (
    <section className="panel panel-plain">
      {!selectedContact && <p className="muted">{t("contactNotFound")}</p>}

      <div className="form-grid">
        <div className="form-col">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <label>Jméno</label>
            {String(form.npub ?? "").trim() &&
              String(form.name ?? "").trim() && (
                <button
                  type="button"
                  className="icon-only-ghost"
                  onClick={() => void resetEditedContactFieldFromNostr("name")}
                  title={t("restore")}
                  aria-label={t("restore")}
                >
                  <RefreshCcw size={18} aria-hidden="true" />
                </button>
              )}
          </div>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={t("namePlaceholder")}
          />

          <label>{t("npub")}</label>
          <input
            value={form.npub}
            onChange={(e) => setForm({ ...form, npub: e.target.value })}
            placeholder={t("npubPlaceholder")}
          />

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <label>{t("lightningAddress")}</label>
            {String(form.npub ?? "").trim() &&
              String(form.lnAddress ?? "").trim() && (
                <button
                  type="button"
                  className="icon-only-ghost"
                  onClick={() =>
                    void resetEditedContactFieldFromNostr("lnAddress")
                  }
                  title={t("restore")}
                  aria-label={t("restore")}
                >
                  <RefreshCcw size={18} aria-hidden="true" />
                </button>
              )}
          </div>
          <input
            value={form.lnAddress}
            onChange={(e) => setForm({ ...form, lnAddress: e.target.value })}
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
            {editingId ? (
              contactEditsSavable && (
                <button onClick={handleSaveContact} disabled={isSavingContact}>
                  <span className="btn-label-with-icon">
                    <span className="btn-label-icon" aria-hidden="true">
                      <Save size={18} />
                    </span>
                    <span>
                      {isSavingContact ? t("saving") : t("saveChanges")}
                    </span>
                  </span>
                </button>
              )
            ) : (
              <button
                onClick={handleSaveContact}
                data-guide="contact-save"
                disabled={isSavingContact}
              >
                {isSavingContact ? t("saving") : t("saveContact")}
              </button>
            )}
            {isArchivedContact ? (
              <>
                <button
                  type="button"
                  className="ghost"
                  onClick={restoreArchivedContact}
                  disabled={!editingId}
                  title={t("restoreArchivedContact")}
                >
                  {t("restoreArchivedContact")}
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    void blockArchivedContact();
                  }}
                  disabled={!editingId || !canBlockArchivedContact}
                  title={t("blockContact")}
                >
                  {t("blockContact")}
                </button>
              </>
            ) : (
              <button
                className={pendingDeleteId === editingId ? "danger" : "ghost"}
                onClick={requestDeleteCurrentContact}
                disabled={!editingId}
                title={
                  pendingDeleteId === editingId
                    ? t("archiveArmedHint")
                    : t("archiveContact")
                }
              >
                <span className="btn-label-with-icon">
                  <span className="btn-label-icon" aria-hidden="true">
                    <Archive size={18} />
                  </span>
                  <span>{t("archiveContact")}</span>
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
