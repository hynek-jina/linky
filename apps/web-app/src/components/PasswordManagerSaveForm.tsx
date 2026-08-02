import React from "react";

export interface PasswordManagerSaveFormHandle {
  requestSave: () => void;
}

interface PasswordManagerSaveFormProps {
  password: string;
  username: string;
}

const PASSWORD_MANAGER_SAVE_TARGET = "linky-password-manager-save-target";
const PASSWORD_MANAGER_SAVE_ACTION = "/password-save.html";

export const PasswordManagerSaveForm = React.forwardRef<
  PasswordManagerSaveFormHandle,
  PasswordManagerSaveFormProps
>(function PasswordManagerSaveForm(
  { password, username }: PasswordManagerSaveFormProps,
  ref,
): React.ReactElement {
  const formRef = React.useRef<HTMLFormElement | null>(null);

  React.useImperativeHandle(
    ref,
    () => ({
      requestSave: () => {
        const form = formRef.current;
        if (!form) return;

        if (typeof form.requestSubmit === "function") {
          form.requestSubmit();
          return;
        }

        form.submit();
      },
    }),
    [],
  );

  return (
    <>
      <iframe
        aria-hidden="true"
        className="onboarding-password-save-frame"
        name={PASSWORD_MANAGER_SAVE_TARGET}
        tabIndex={-1}
        title=""
      />

      <form
        ref={formRef}
        className="onboarding-password-save-form"
        method="post"
        action={PASSWORD_MANAGER_SAVE_ACTION}
        target={PASSWORD_MANAGER_SAVE_TARGET}
        autoComplete="on"
        aria-hidden="true"
      >
        <input
          className="onboarding-password-save-input"
          name="username"
          type="text"
          value={username}
          readOnly
          autoComplete="username"
        />
        <input
          className="onboarding-password-save-input"
          name="password"
          type="password"
          value={password}
          readOnly
          autoComplete="current-password"
        />
      </form>
    </>
  );
});
