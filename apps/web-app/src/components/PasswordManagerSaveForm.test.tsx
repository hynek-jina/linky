import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { PasswordManagerSaveForm } from "./PasswordManagerSaveForm";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
  writable: true,
});

describe("PasswordManagerSaveForm", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("submits to the lightweight password-save page", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <PasswordManagerSaveForm password="example backup" username="Alice" />,
      );
    });

    const form = container.querySelector("form");
    expect(form).toBeInstanceOf(HTMLFormElement);
    expect(form?.method).toBe("post");
    expect(form?.getAttribute("action")).toBe("/password-save.html");
    expect(form?.target).toBe("linky-password-manager-save-target");

    await act(async () => root.unmount());
  });
});
