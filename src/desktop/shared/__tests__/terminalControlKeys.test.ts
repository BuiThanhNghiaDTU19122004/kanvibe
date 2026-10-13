import { describe, expect, it } from "vitest";
import {
  isBlockedShortcutEvent,
  isTerminalControlElectronInput,
  resolveTerminalClipboardKey,
} from "@/desktop/shared/keyboardShortcut";
import { DEFAULT_SHORTCUT_BINDINGS, findShortcutCommandForEvent } from "@/desktop/shared/shortcutBindings";

function keyEvent(key: string, modifiers: Partial<Record<"ctrlKey" | "metaKey" | "altKey" | "shiftKey", boolean>> = {}) {
  return { key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...modifiers };
}

function inTerminal<T extends object>(event: T) {
  const xterm = document.createElement("div");
  xterm.className = "xterm";
  const textarea = document.createElement("textarea");
  xterm.appendChild(textarea);
  return { ...event, target: textarea };
}

describe("terminal control keys off macOS", () => {
  it("lets Ctrl+<letter> reach a focused terminal instead of app shortcuts", () => {
    for (const key of ["n", "w", "t", "[", "]"]) {
      expect(findShortcutCommandForEvent(DEFAULT_SHORTCUT_BINDINGS, keyEvent(key, { ctrlKey: true }), "linux")).not.toBeNull();
      expect(findShortcutCommandForEvent(DEFAULT_SHORTCUT_BINDINGS, inTerminal(keyEvent(key, { ctrlKey: true })), "linux")).toBeNull();
    }
    expect(isBlockedShortcutEvent(keyEvent("r", { ctrlKey: true }), "linux")).toBe(true);
    expect(isBlockedShortcutEvent(inTerminal(keyEvent("r", { ctrlKey: true })), "linux")).toBe(false);
  });

  it("keeps Mod+digit dock shortcuts and macOS Cmd shortcuts working inside the terminal", () => {
    expect(findShortcutCommandForEvent(DEFAULT_SHORTCUT_BINDINGS, inTerminal(keyEvent("1", { ctrlKey: true })), "linux")).toBe("taskDetailDock1");
    expect(findShortcutCommandForEvent(DEFAULT_SHORTCUT_BINDINGS, inTerminal(keyEvent("t", { metaKey: true })), "mac")).toBe("terminalTabNew");
  });

  it("matches Electron input the same way", () => {
    expect(isTerminalControlElectronInput({ type: "keyDown", key: "r", control: true }, "linux")).toBe(true);
    expect(isTerminalControlElectronInput({ type: "keyDown", key: "T", control: true, shift: true }, "linux")).toBe(false);
    expect(isTerminalControlElectronInput({ type: "keyDown", key: "r", meta: true }, "mac")).toBe(false);
  });
});

describe("resolveTerminalClipboardKey", () => {
  it("copies with Ctrl+C only while text is selected, otherwise leaves SIGINT", () => {
    expect(resolveTerminalClipboardKey(keyEvent("c", { ctrlKey: true }), true, "linux")).toBe("copy");
    expect(resolveTerminalClipboardKey(keyEvent("c", { ctrlKey: true }), false, "linux")).toBeNull();
  });

  it("pastes with Ctrl+V and leaves Ctrl+Shift+V and macOS alone", () => {
    expect(resolveTerminalClipboardKey(keyEvent("v", { ctrlKey: true }), false, "linux")).toBe("paste");
    expect(resolveTerminalClipboardKey(keyEvent("V", { ctrlKey: true, shiftKey: true }), false, "linux")).toBeNull();
    expect(resolveTerminalClipboardKey(keyEvent("v", { ctrlKey: true }), false, "mac")).toBeNull();
  });
});
