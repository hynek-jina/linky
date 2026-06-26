import type { FC } from "react";
import { ScanLine, Save } from "lucide-react";
import { PasteIcon } from "../components/icons";
import { readClipboardText } from "../platform/clipboard";

interface ContactFormData {
  name: string;
  npub: string;
  lnAddress: string;
  group: string;
}

interface ContactNewPageProps {
  autofillNewContactFromIdentifier: (identifier?: string) => Promise<void>;
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
  autofillNewContactFromIdentifier,
  form,
  groupNames,
  handleSaveContact,
  isSavingContact,
  openScan,
  scanIsOpen,
  setForm,
  t,
}) => {
  const pasteIdentifier = async () => {
    const text = await readClipboardText();
    if (!text) return;
    const identifier = text.trim();
    setForm({ ...form, npub: identifier });
    void autofillNewContactFromIdentifier(identifier);
  };

  return (
    <section className="panel panel-plain">
      <div className="form-grid">
        <div className="form-col">
          <div className="contact-new-identifier-row">
            <label>{t("npub")}</label>
            <button
              type="button"
              className="icon-only-ghost"
              onClick={() => void pasteIdentifier()}
              title={t("paste")}
              aria-label={t("paste")}
            >
              <PasteIcon size={18} aria-hidden="true" />
            </button>
          </div>
          <input
            value={form.npub}
            onChange={(e) => setForm({ ...form, npub: e.target.value })}
            onBlur={() => {
              void autofillNewContactFromIdentifier();
            }}
            placeholder={t("npubPlaceholder")}
          />

          <label>{t("name")}</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={t("namePlaceholder")}
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
              <span className="btn-label-with-icon">
                <span className="btn-label-icon" aria-hidden="true">
                  <Save size={18} />
                </span>
                <span>{isSavingContact ? t("saving") : t("saveContact")}</span>
              </span>
            </button>
            <button
              type="button"
              className="secondary"
              onClick={openScan}
              disabled={scanIsOpen}
              data-guide="scan-contact-button"
            >
              <span className="btn-label-with-icon">
                <span className="btn-label-icon" aria-hidden="true">
                  <ScanLine size={18} />
                </span>
                <span>{t("contactLoadQr")}</span>
              </span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
