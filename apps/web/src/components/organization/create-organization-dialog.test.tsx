// @vitest-environment jsdom

import { appStore } from "@/app/store";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../../messages/en.json";
import { CreateOrganizationDialog } from "./create-organization-dialog";

const mocks = vi.hoisted(() => ({
  create: vi.fn(async () => ({ data: { id: "org-new", slug: "acme" } })),
  setActive: vi.fn(async () => ({ data: { success: true } })),
  toastError: vi.fn(),
  assign: vi.fn(),
}));

vi.mock("auth/client", () => ({
  authClient: {
    organization: { create: mocks.create, setActive: mocks.setActive },
  },
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError },
}));

function renderDialog() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CreateOrganizationDialog />
    </NextIntlClientProvider>,
  );
}

const nameInput = () =>
  screen.getByLabelText("Organization Name") as HTMLInputElement;

beforeEach(() => {
  // jsdom has no navigation; the flow ends in window.location.assign (same
  // as accepting an organization invitation).
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { origin: "http://localhost:3000", assign: mocks.assign },
  });
  appStore.setState({ openCreateOrganization: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  appStore.setState({ openCreateOrganization: false });
});

describe("CreateOrganizationDialog", () => {
  it("renders real copy rather than leaked translation keys", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).not.toMatch(/Organization\.create\.[a-zA-Z.]+/);
    expect(screen.getByPlaceholderText("Acme Corp")).toBeTruthy();
    expect(
      screen.getByText(
        "Used in URLs and references. Must be unique. Left empty, it is derived from the name.",
      ),
    ).toBeTruthy();
  });

  it("creates an organization, deriving the slug from the name, and lands on its settings page", async () => {
    renderDialog();
    fireEvent.change(nameInput(), { target: { value: "  Acme Corp " } });
    fireEvent.click(screen.getByTestId("create-organization-submit"));

    // No slug typed: the dialog derives one — the create endpoint requires
    // a slug and Better Auth does not generate it.
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith({
        name: "Acme Corp",
        slug: "acme-corp",
      }),
    );
    // Creation alone does not move this session into the new organization;
    // the dialog switches explicitly, like the workspace switcher.
    await waitFor(() =>
      expect(mocks.setActive).toHaveBeenCalledWith({
        organizationId: "org-new",
      }),
    );
    await waitFor(() =>
      expect(mocks.assign).toHaveBeenCalledWith("/organization/settings"),
    );
    expect(appStore.getState().openCreateOrganization).toBe(false);
  });

  it("reports and stays put when the created organization cannot be switched to", async () => {
    mocks.setActive.mockResolvedValueOnce({
      error: { message: "switch unavailable" },
    } as never);

    renderDialog();
    fireEvent.change(nameInput(), { target: { value: "Acme Corp" } });
    fireEvent.click(screen.getByTestId("create-organization-submit"));

    await waitFor(() => expect(mocks.setActive).toHaveBeenCalled());
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Organization created but failed to switch",
    );
    expect(mocks.assign).not.toHaveBeenCalled();
  });

  it("passes a provided slug lowercased and trimmed", async () => {
    renderDialog();
    fireEvent.change(nameInput(), { target: { value: "Acme Corp" } });
    fireEvent.change(screen.getByLabelText("URL Slug"), {
      target: { value: "  Acme-Industries " },
    });
    fireEvent.click(screen.getByTestId("create-organization-submit"));

    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith({
        name: "Acme Corp",
        slug: "acme-industries",
      }),
    );
    await waitFor(() =>
      expect(mocks.assign).toHaveBeenCalledWith("/organization/settings"),
    );
  });

  it("keeps the dialog open with the draft intact when creation fails", async () => {
    mocks.create.mockResolvedValueOnce({
      error: { message: "Organization already exists" },
    } as never);

    renderDialog();
    fireEvent.change(nameInput(), { target: { value: "Acme Corp" } });
    fireEvent.change(screen.getByLabelText("URL Slug"), {
      target: { value: "acme-corp" },
    });
    fireEvent.click(screen.getByTestId("create-organization-submit"));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Organization already exists",
    );
    expect(mocks.assign).not.toHaveBeenCalled();
    expect(appStore.getState().openCreateOrganization).toBe(true);
    expect(nameInput().value).toBe("Acme Corp");
    expect((screen.getByLabelText("URL Slug") as HTMLInputElement).value).toBe(
      "acme-corp",
    );
  });

  it("keeps submit disabled until a name is entered", () => {
    renderDialog();
    const submit = screen.getByTestId(
      "create-organization-submit",
    ) as HTMLButtonElement;
    expect(submit.hasAttribute("disabled")).toBe(true);

    fireEvent.change(nameInput(), { target: { value: "Acme Corp" } });
    expect(submit.hasAttribute("disabled")).toBe(false);
  });

  it("resets the form when the dialog is reopened", async () => {
    renderDialog();
    fireEvent.change(nameInput(), { target: { value: "Abandoned attempt" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(appStore.getState().openCreateOrganization).toBe(false);

    await act(async () => {
      appStore.setState({ openCreateOrganization: true });
    });
    expect(nameInput().value).toBe("");
  });
});
