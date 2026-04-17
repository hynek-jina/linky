import type {
  CredentialStoreLike,
  NavigatorWithOptionalUserAgentData,
  PasswordCredentialConstructorLike,
  PasswordCredentialRequestOptions,
} from "../types/browser";
import { isNativePlatform } from "./runtime";

export interface PasswordManagerCredential {
  accountName: string;
  seed: string;
}

export interface RequestPasswordManagerCredentialOptions {
  mediation?: "optional" | "required" | "silent";
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const normalizeStoredValue = (value: unknown): string => {
  return String(value ?? "").trim();
};

const applyOffscreenPromptStyles = (element: HTMLElement): void => {
  element.style.position = "fixed";
  element.style.left = "-10000px";
  element.style.top = "0";
  element.style.width = "1px";
  element.style.height = "1px";
  element.style.opacity = "0.01";
  element.style.pointerEvents = "none";
};

interface PasswordManagerBridgeElements {
  cleanup: () => void;
  displayNameInput: HTMLInputElement;
  form: HTMLFormElement;
  passwordInput: HTMLInputElement;
  submitButton: HTMLButtonElement;
  usernameInput: HTMLInputElement;
}

interface CreatePasswordManagerBridgeOptions extends PasswordManagerCredential {
  visible?: boolean;
}

let activePasswordManagerBridgeCleanup: (() => void) | null = null;

const isPasswordCredentialConstructor = (
  value: unknown,
): value is PasswordCredentialConstructorLike => {
  return typeof value === "function";
};

const getCredentialsContainer = (): CredentialStoreLike | null => {
  if (typeof navigator === "undefined") return null;

  const credentials = navigator.credentials;
  if (!isRecord(credentials)) return null;

  const container: CredentialStoreLike = {};

  const rawGet = Reflect.get(credentials, "get");
  if (typeof rawGet === "function") {
    container.get = (options) => Reflect.apply(rawGet, credentials, [options]);
  }

  const rawStore = Reflect.get(credentials, "store");
  if (typeof rawStore === "function") {
    container.store = (credential) =>
      Reflect.apply(rawStore, credentials, [credential]);
  }

  return container.get || container.store ? container : null;
};

const getPasswordCredentialConstructor =
  (): PasswordCredentialConstructorLike | null => {
    const constructor = Reflect.get(globalThis, "PasswordCredential");
    return isPasswordCredentialConstructor(constructor) ? constructor : null;
  };

const getBrowserNavigator = (): NavigatorWithOptionalUserAgentData | null => {
  if (typeof navigator === "undefined") return null;
  return navigator;
};

const isMacPlatformValue = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  return normalized.includes("mac") || normalized.includes("darwin");
};

export const isMacBrowserPlatform = (): boolean => {
  const nav = getBrowserNavigator();
  if (!nav) return false;

  const userAgentDataPlatform = nav.userAgentData?.platform;
  if (
    typeof userAgentDataPlatform === "string" &&
    isMacPlatformValue(userAgentDataPlatform)
  ) {
    return true;
  }

  if (typeof nav.platform === "string" && isMacPlatformValue(nav.platform)) {
    return true;
  }

  const userAgent = String(nav.userAgent ?? "").toLowerCase();
  return userAgent.includes("macintosh") || userAgent.includes("mac os x");
};

export const isSafariBrowser = (): boolean => {
  const nav = getBrowserNavigator();
  if (!nav) return false;

  const userAgent = String(nav.userAgent ?? "").toLowerCase();
  if (!userAgent.includes("safari")) return false;
  if (userAgent.includes("chrome")) return false;
  if (userAgent.includes("crios")) return false;
  if (userAgent.includes("fxios")) return false;
  if (userAgent.includes("edg")) return false;
  if (userAgent.includes("opr")) return false;
  return true;
};

export const isStandaloneWebApp = (): boolean => {
  if (isNativePlatform()) return false;
  const nav = getBrowserNavigator();
  if (!nav) return false;

  if (nav.standalone === true) return true;

  return Boolean(globalThis.matchMedia?.("(display-mode: standalone)").matches);
};

export const shouldOfferOnboardingPasswordManagerSave = (): boolean => {
  if (isNativePlatform()) return false;
  return isStandaloneWebApp() || isMacBrowserPlatform();
};

export const shouldPreferPasswordManagerFormSave = (): boolean => {
  return isSafariBrowser();
};

export const supportsPasswordManagerCredentialAccess = (): boolean => {
  const credentials = getCredentialsContainer();
  return Boolean(credentials?.get);
};

export const supportsPasswordManagerCredentialStore = (): boolean => {
  const credentials = getCredentialsContainer();
  return Boolean(credentials?.store && getPasswordCredentialConstructor());
};

const createPasswordManagerBridgeElements = ({
  accountName,
  seed,
  visible = false,
}: CreatePasswordManagerBridgeOptions): PasswordManagerBridgeElements | null => {
  if (typeof document === "undefined") {
    return null;
  }

  const normalizedSeed = normalizeStoredValue(seed);
  if (!normalizedSeed) {
    return null;
  }

  const normalizedAccountName = normalizeStoredValue(accountName) || "Linky";
  const form = document.createElement("form");
  const usernameInput = document.createElement("input");
  const displayNameInput = document.createElement("input");
  const passwordInput = document.createElement("input");
  const submitButton = document.createElement("button");

  form.action = "/api/pm-noop";
  form.method = "post";
  form.autocomplete = "on";
  if (visible) {
    form.style.position = "fixed";
    form.style.left = "50%";
    form.style.top = "50%";
    form.style.width = "min(360px, calc(100vw - 32px))";
    form.style.padding = "16px";
    form.style.transform = "translate(-50%, -50%)";
    form.style.borderRadius = "16px";
    form.style.background = "rgba(15, 23, 42, 0.98)";
    form.style.boxShadow = "0 24px 64px rgba(15, 23, 42, 0.35)";
    form.style.zIndex = "2147483647";
    form.style.opacity = "0.01";
  } else {
    applyOffscreenPromptStyles(form);
  }

  usernameInput.type = "text";
  usernameInput.name = "username";
  usernameInput.id = "linky-password-manager-username";
  usernameInput.autocomplete = "username";
  usernameInput.value = normalizedAccountName;
  usernameInput.defaultValue = normalizedAccountName;
  usernameInput.setAttribute("value", normalizedAccountName);
  usernameInput.spellcheck = false;
  usernameInput.autocapitalize = "none";

  displayNameInput.type = "text";
  displayNameInput.name = "displayName";
  displayNameInput.id = "linky-password-manager-display-name";
  displayNameInput.autocomplete = "name";
  displayNameInput.value = normalizedAccountName;
  displayNameInput.defaultValue = normalizedAccountName;
  displayNameInput.setAttribute("value", normalizedAccountName);
  displayNameInput.spellcheck = false;
  displayNameInput.autocapitalize = "words";

  passwordInput.type = "password";
  passwordInput.name = "password";
  passwordInput.id = "linky-password-manager-password";
  passwordInput.autocomplete = "new-password";
  passwordInput.value = normalizedSeed;
  passwordInput.defaultValue = normalizedSeed;
  passwordInput.setAttribute("value", normalizedSeed);

  submitButton.type = "submit";
  submitButton.textContent = "Save";

  form.append(usernameInput, displayNameInput, passwordInput, submitButton);
  document.body.append(form);
  activePasswordManagerBridgeCleanup?.();
  activePasswordManagerBridgeCleanup = () => {
    form.remove();
    activePasswordManagerBridgeCleanup = null;
  };

  return {
    cleanup: () => {
      activePasswordManagerBridgeCleanup?.();
    },
    displayNameInput,
    form,
    passwordInput,
    submitButton,
    usernameInput,
  };
};

export const savePasswordManagerCredential = async ({
  accountName,
  seed,
}: PasswordManagerCredential): Promise<boolean> => {
  const credentials = getCredentialsContainer();
  const PasswordCredential = getPasswordCredentialConstructor();
  const bridge = createPasswordManagerBridgeElements({
    accountName,
    seed,
  });

  if (!credentials?.store || !PasswordCredential || !bridge) {
    return false;
  }

  try {
    const credential = new PasswordCredential(bridge.form);
    await credentials.store(credential);
    return true;
  } catch {
    return false;
  } finally {
    bridge.cleanup();
  }
};

export const submitPasswordManagerFallbackForm = ({
  accountName,
  seed,
}: PasswordManagerCredential): boolean => {
  const bridge = createPasswordManagerBridgeElements({
    accountName,
    seed,
  });
  if (!bridge) {
    return false;
  }

  const targetName = `linky-pm-sink-${Date.now()}`;
  const iframe = document.createElement("iframe");

  iframe.name = targetName;
  iframe.tabIndex = -1;
  applyOffscreenPromptStyles(iframe);

  bridge.form.target = targetName;
  document.body.append(iframe);

  if (typeof bridge.form.requestSubmit === "function") {
    bridge.form.requestSubmit();
  } else {
    bridge.submitButton.click();
  }

  globalThis.setTimeout(() => {
    bridge.cleanup();
    iframe.remove();
  }, 30000);

  return true;
};

export const submitTopLevelPasswordManagerSaveForm = ({
  accountName,
  seed,
}: PasswordManagerCredential): boolean => {
  const bridge = createPasswordManagerBridgeElements({
    accountName,
    seed,
    visible: true,
  });
  if (!bridge) {
    return false;
  }

  globalThis.setTimeout(() => {
    if (typeof bridge.form.requestSubmit === "function") {
      bridge.form.requestSubmit();
    } else {
      bridge.submitButton.click();
    }
  }, 80);

  return true;
};

export const requestStoredPasswordManagerCredential = async ({
  mediation = "optional",
}: RequestPasswordManagerCredentialOptions = {}): Promise<PasswordManagerCredential | null> => {
  const credentials = getCredentialsContainer();
  if (!credentials?.get) return null;

  const requestOptions: Array<PasswordCredentialRequestOptions | undefined> = [
    {
      mediation,
      password: true,
    },
    {
      password: true,
    },
    undefined,
  ];

  try {
    for (const options of requestOptions) {
      const credential = await credentials.get(options);
      if (!isRecord(credential)) {
        continue;
      }

      const seed = normalizeStoredValue(Reflect.get(credential, "password"));
      if (!seed) continue;

      const accountName =
        normalizeStoredValue(Reflect.get(credential, "name")) ||
        normalizeStoredValue(Reflect.get(credential, "id")) ||
        "Linky";
      return {
        accountName,
        seed,
      };
    }
    return null;
  } catch {
    return null;
  }
};
