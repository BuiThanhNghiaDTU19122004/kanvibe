export function hasAgentAutoStart(location: Pick<Location, "hash" | "search">): boolean {
  const queryIndex = location.hash.indexOf("?");
  const query = queryIndex >= 0 ? location.hash.slice(queryIndex + 1) : location.search;
  return new URLSearchParams(query).get("autostart") === "1";
}

export function consumeAgentAutoStart() {
  const queryIndex = window.location.hash.indexOf("?");
  if (queryIndex < 0) return;
  const params = new URLSearchParams(window.location.hash.slice(queryIndex + 1));
  params.delete("autostart");
  const query = params.toString();
  const hash = `${window.location.hash.slice(0, queryIndex)}${query ? `?${query}` : ""}`;
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}${hash}`);
}
