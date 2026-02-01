import type { FC } from "react";

interface ContactFormData {
  name: string;
  npub: string;
  lnAddress: string;
  group: string;
}

interface ContactNewPageProps {
  form: ContactFormData;
  groupNames: string[];
  handleSaveContact: () => void;
  isSavingContact: boolean;
  openScan: () => void;
  scanIsOpen: boolean;
  setForm: (value: ContactFormData) => void;
  t: (key: string) => string;
}

export const ContactNewPage: FC<ContactNewPageProps> = ({
  form,
  groupNames,
  handleSaveContact,
  isSavingContact,
  openScan,
  scanIsOpen,
  setForm,
  t,
}) => {
  return (
    <section className="panel panel-plain">
      <div className="form-grid">
        <div className="form-col">
          <label>{t("name")}</label>
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

          <label>{t("lightningAddress")}</label>
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
            <button onClick={handleSaveContact} disabled={isSavingContact}>
              {isSavingContact ? t("saving") : t("saveContact")}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={openScan}
              disabled={scanIsOpen}
              data-guide="scan-contact-button"
            >
              {t("contactLoadQr")}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
