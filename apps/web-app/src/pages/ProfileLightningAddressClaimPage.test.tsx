import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileLightningAddressClaimPage } from "./ProfileLightningAddressClaimPage";

const { navigateMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
}));

vi.mock("../hooks/useRouting", () => ({
  useNavigation: () => navigateMock,
}));

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
  writable: true,
});

const translate = (key: string): string => {
  switch (key) {
    case "claimOwnLightningAddressAlreadySet":
      return "Vlastní lightning adresa už je pro tento účet nastavená.";
    case "claimOwnLightningAddressActive":
      return "Aktivní";
    case "claimOwnLightningAddressChecking":
      return "Ověřuji dostupnost a cenu...";
    case "claimOwnLightningAddressConfirm":
      return "Zaplatit a použít";
    case "claimOwnLightningAddressCurrent":
      return "Aktuální adresa";
    case "claimOwnLightningAddressDesired":
      return "Nová adresa";
    case "claimOwnLightningAddressHint":
      return "Zadejte vlastní jméno pro adresu ve tvaru name@linky.fit.";
    case "claimOwnLightningAddressInputLabel":
      return "Požadovaná adresa";
    case "claimOwnLightningAddressPlaceholder":
      return "např. alice";
    case "claimOwnLightningAddressTitle":
      return "Vlastní lightning adresa";
    case "claimOwnLightningAddressOwned":
      return "Zaplacené Linky adresy";
    case "claimOwnLightningAddressOwnedHint":
      return "Vlastní lightning adresa už byla pro tento účet pořízena.";
    case "claimOwnLightningAddressVerifyExisting":
      return "Vyžádat ověření";
    default:
      return key;
  }
};

const setInputValue = (input: HTMLInputElement, value: string): void => {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  );
  const setter = descriptor?.set;
  if (!setter) {
    throw new Error("HTML input value setter missing");
  }
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

const getSingleInput = (container: HTMLElement): HTMLInputElement => {
  const input = container.querySelector("input");
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("claim username input missing");
  }
  return input;
};

const getButtonByText = (
  container: HTMLElement,
  text: string,
): HTMLButtonElement => {
  const buttons = Array.from(container.querySelectorAll("button"));
  const match = buttons.find((button) => button.textContent?.trim() === text);
  if (!(match instanceof HTMLButtonElement)) {
    throw new Error(`button ${text} missing`);
  }
  return match;
};

describe("ProfileLightningAddressClaimPage", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    navigateMock.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("lets users request verification for an address already set on their account", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: true,
              message: "Username already set",
            }),
            {
              headers: { "Content-Type": "application/json" },
              status: 400,
            },
          ),
      ),
    );

    const saveClaimedLightningAddress = vi.fn<
      (lightningAddress: string) => Promise<boolean>
    >(async () => true);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ProfileLightningAddressClaimPage
          cashuBalance={0}
          cashuBalanceAfterMelt={0}
          cashuIsBusy={false}
          effectiveMyLightningAddress={null}
          makeNip98AuthHeader={async () => "nip98-token"}
          ownedLightningAddresses={[]}
          ownedLightningAddressesLoading={false}
          payLightningInvoiceWithCashu={async () => false}
          saveClaimedLightningAddress={saveClaimedLightningAddress}
          serverBaseUrl="https://npub.linky.fit"
          t={translate}
        />,
      );
    });

    await act(async () => {
      setInputValue(getSingleInput(container), "Alice42");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(container.textContent).toContain("Vyžádat ověření");
    expect(container.textContent).not.toContain("Zaplatit a použít");

    await act(async () => {
      getButtonByText(container, "Vyžádat ověření").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(saveClaimedLightningAddress).toHaveBeenCalledWith(
      "alice42@linky.fit",
    );
    expect(navigateMock).toHaveBeenCalledWith({ route: "profileEdit" });
  });

  it("lets users re-request verification for an active owned address", async () => {
    const saveClaimedLightningAddress = vi.fn<
      (lightningAddress: string) => Promise<boolean>
    >(async () => true);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ProfileLightningAddressClaimPage
          cashuBalance={0}
          cashuBalanceAfterMelt={0}
          cashuIsBusy={false}
          effectiveMyLightningAddress="alice42@linky.fit"
          makeNip98AuthHeader={async () => "nip98-token"}
          ownedLightningAddresses={["alice42@linky.fit"]}
          ownedLightningAddressesLoading={false}
          payLightningInvoiceWithCashu={async () => false}
          saveClaimedLightningAddress={saveClaimedLightningAddress}
          serverBaseUrl="https://npub.linky.fit"
          t={translate}
        />,
      );
    });

    expect(container.textContent).toContain("Aktivní");
    expect(container.textContent).toContain("Vyžádat ověření");

    await act(async () => {
      getButtonByText(container, "Vyžádat ověření").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(saveClaimedLightningAddress).toHaveBeenCalledWith(
      "alice42@linky.fit",
    );
    expect(navigateMock).toHaveBeenCalledWith({ route: "profileEdit" });
  });

  it("does not show the claim input while owned addresses are still loading", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ProfileLightningAddressClaimPage
          cashuBalance={0}
          cashuBalanceAfterMelt={0}
          cashuIsBusy={false}
          effectiveMyLightningAddress={null}
          makeNip98AuthHeader={async () => "nip98-token"}
          ownedLightningAddresses={[]}
          ownedLightningAddressesLoading={true}
          payLightningInvoiceWithCashu={async () => false}
          saveClaimedLightningAddress={async () => true}
          serverBaseUrl="https://npub.linky.fit"
          t={translate}
        />,
      );
    });

    expect(container.querySelector("input")).toBeNull();
    expect(container.textContent).toContain("Ověřuji dostupnost a cenu...");
  });
});
