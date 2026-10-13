import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { usePolledResource, usePolledValue } from "@/desktop/renderer/hooks/usePolledValue";

const EMPTY: string[] = [];
const POLL_MS = 10;

function ValueProbe({ read, onRender }: { read: () => Promise<string[]>; onRender: () => void }) {
  const value = usePolledValue(read, EMPTY, POLL_MS, true);
  onRender();
  return <span data-testid="value">{value.join(",")}</span>;
}

function ResourceProbe({ read }: { read: () => Promise<string[]> }) {
  const { value, updatedAt } = usePolledResource(read, EMPTY, POLL_MS, true);
  return <span data-testid="resource">{value.join(",")}|{updatedAt ?? "none"}</span>;
}

describe("usePolledValue", () => {
  beforeEach(() => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not re-render the consumer when a poll returns the same data", async () => {
    const read = vi.fn(async () => ["session-1"]);
    const onRender = vi.fn();
    render(<ValueProbe read={read} onRender={onRender} />);

    await waitFor(() => expect(screen.getByTestId("value").textContent).toBe("session-1"));
    await waitFor(() => expect(read.mock.calls.length).toBeGreaterThanOrEqual(4));
    const rendersAfterSettling = onRender.mock.calls.length;
    const readsAfterSettling = read.mock.calls.length;
    await waitFor(() => expect(read.mock.calls.length).toBeGreaterThanOrEqual(readsAfterSettling + 3));

    expect(onRender.mock.calls.length).toBe(rendersAfterSettling);
  });

  it("re-renders when the polled data changes", async () => {
    let current = ["a"];
    const read = vi.fn(async () => current);
    render(<ValueProbe read={read} onRender={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("value").textContent).toBe("a"));

    current = ["a", "b"];

    await waitFor(() => expect(screen.getByTestId("value").textContent).toBe("a,b"));
  });

  it("still advances updatedAt for resource consumers that show the last check time", async () => {
    const read = vi.fn(async () => ["same"]);
    render(<ResourceProbe read={read} />);
    await waitFor(() => expect(screen.getByTestId("resource").textContent).toMatch(/^same\|\d{4}-/));
    const firstText = screen.getByTestId("resource").textContent;

    await waitFor(() => expect(screen.getByTestId("resource").textContent).not.toBe(firstText));
  });
});
