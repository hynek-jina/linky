import type { FC } from "react";
import type { ContactId } from "../evolu";

interface Contact {
  id: ContactId;
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
  pendingDeleteId: ContactId | null;
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
  pendingDeleteId,
  requestDeleteCurrentContact,
  resetEditedContactFieldFromNostr,
  selectedContact,
  setForm,
  t,
}) => {
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
                  className="secondary"
                  onClick={() => void resetEditedContactFieldFromNostr("name")}
                  title={t("restore")}
                  aria-label={t("restore")}
                  style={{ paddingInline: 10, minWidth: 40 }}
                >
                  ↺
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
                  className="secondary"
                  onClick={() =>
                    void resetEditedContactFieldFromNostr("lnAddress")
                  }
                  title={t("restore")}
                  aria-label={t("restore")}
                  style={{ paddingInline: 10, minWidth: 40 }}
                >
                  ↺
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
                  {isSavingContact ? t("saving") : t("saveChanges")}
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
            <button
              className={pendingDeleteId === editingId ? "danger" : "ghost"}
              onClick={requestDeleteCurrentContact}
              disabled={!editingId}
              title={
                pendingDeleteId === editingId
                  ? "Klikněte znovu pro smazání"
                  : t("delete")
              }
            >
              {t("delete")}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
