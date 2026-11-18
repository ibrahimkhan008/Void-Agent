// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { ChatComposer } = await import("./chat-composer");

const MODELS = [
  {
    id: "auto",
    name: "Auto",
    description: "Picks the best model for each task",
  },
  { id: "claude", name: "Claude", description: "Thoughtful writing and code" },
];

describe("ChatComposer", () => {
  afterEach(cleanup);

  it("sends on Enter with the picked model and clears the field", async () => {
    const onSend = vi.fn();
    const { getByLabelText, getByDisplayValue } = render(
      <ChatComposer models={MODELS} onSend={onSend} />,
    );
    const box = getByLabelText("Message") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "hello world" } });
    expect(getByDisplayValue("hello world")).toBeTruthy();
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("hello world", { model: MODELS[0] });
    expect(box.value).toBe("");
  });

  it("keeps send disabled while the message is empty", () => {
    render(<ChatComposer models={MODELS} />);
    const send = screen.getByLabelText("Send message") as HTMLButtonElement;
    expect(send.disabled).toBe(true);
  });

  it("shift+enter inserts a newline instead of sending", () => {
    const onSend = vi.fn();
    const { getByLabelText } = render(
      <ChatComposer models={MODELS} onSend={onSend} />,
    );
    fireEvent.keyDown(getByLabelText("Message"), {
      key: "Enter",
      shiftKey: true,
    });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("morphs the approval button to granted after loadMs", async () => {
    vi.useFakeTimers();
    const onRequestApproval = vi.fn();
    const { getByRole } = render(
      <ChatComposer
        models={MODELS}
        loadMs={1300}
        onRequestApproval={onRequestApproval}
      />,
    );
    const approval = getByRole("button", { name: /Request approval/ });
    expect(approval.getAttribute("data-approval")).toBe("idle");
    expect(approval.getAttribute("aria-busy")).toBe("false");
    fireEvent.click(approval);
    expect(onRequestApproval).toHaveBeenCalled();
    expect(approval.getAttribute("aria-busy")).toBe("true");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1301);
    });
    expect(approval.getAttribute("data-approval")).toBe("granted");
    vi.useRealTimers();
  });

  it("opens the model menu, picks a model and reports onModelChange", async () => {
    const onModelChange = vi.fn();
    const { getByRole } = render(
      <ChatComposer models={MODELS} onModelChange={onModelChange} />,
    );
    const modelButton = getByRole("button", { name: "Auto" });
    fireEvent.click(modelButton);
    const listbox = getByRole("listbox", { name: "Model picker" });
    expect(listbox).toBeTruthy();
    fireEvent.click(screen.getByText("Claude"));
    expect(onModelChange).toHaveBeenCalledWith(MODELS[1]);
    expect(() => getByRole("listbox", { name: "Model picker" })).toThrow();
  });

  it("toggles connected apps through the menuitemcheckbox", () => {
    const onAppsChange = vi.fn();
    const { getByRole } = render(
      <ChatComposer
        apps={[
          { id: "gmail", name: "Gmail" },
          { id: "slack", name: "Slack" },
        ]}
        connectedApps={["gmail"]}
        onAppsChange={onAppsChange}
      />,
    );
    fireEvent.click(getByRole("button", { name: "Connect apps" }));
    fireEvent.click(getByRole("menuitemcheckbox", { name: /Slack/ }));
    expect(onAppsChange).toHaveBeenCalledWith(["gmail", "slack"]);
  });

  it("picks a folder and reports null when picking the active folder again", () => {
    const onFolderChange = vi.fn();
    const { getByRole } = render(
      <ChatComposer
        folders={["Documents", "Projects"]}
        onFolderChange={onFolderChange}
      />,
    );
    fireEvent.click(getByRole("button", { name: /Work in a folder/ }));
    fireEvent.click(getByRole("option", { name: "Documents" }));
    expect(onFolderChange).toHaveBeenCalledWith("Documents");
    fireEvent.click(getByRole("button", { name: "Documents" }));
    fireEvent.click(getByRole("option", { name: "Documents" }));
    expect(onFolderChange).toHaveBeenCalledWith(null);
  });

  it("swaps the send button for recording controls while recording", () => {
    const { getByLabelText, queryByLabelText } = render(<ChatComposer />);
    fireEvent.click(getByLabelText("Voice input"));
    expect(getByLabelText("Discard recording")).toBeTruthy();
    expect(getByLabelText("Use recording")).toBeTruthy();
    expect(queryByLabelText("Send message")).toBeNull();
    fireEvent.click(getByLabelText("Discard recording"));
    expect(getByLabelText("Send message")).toBeTruthy();
  });
});
