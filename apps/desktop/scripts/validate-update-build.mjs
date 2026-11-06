const platform = process.argv[2];
const feedValue = process.env.DESKTOP_UPDATE_FEED_URL?.trim();

if (!feedValue) {
  throw new Error(
    "DESKTOP_UPDATE_FEED_URL must be set to an HTTPS update directory before packaging.",
  );
}

let feed;
try {
  feed = new URL(feedValue);
} catch {
  throw new Error("DESKTOP_UPDATE_FEED_URL must be a valid HTTPS URL.");
}

if (
  feed.protocol !== "https:" ||
  !feed.hostname ||
  feed.username ||
  feed.password ||
  feed.search ||
  feed.hash ||
  feed.pathname
    .split("/")
    .some((segment) => segment === "." || segment === "..")
) {
  throw new Error(
    "Desktop update feeds must use HTTPS and cannot include credentials, query strings, or fragments.",
  );
}

if (platform === "win") {
  const publisher = process.env.VOID_AGENT_WINDOWS_PUBLISHER_NAME?.trim();
  if (!publisher || !/^CN=.+/.test(publisher)) {
    throw new Error(
      "Set VOID_AGENT_WINDOWS_PUBLISHER_NAME to the signing certificate subject DN before packaging Windows updates.",
    );
  }
}

if (
  platform === "mac" &&
  !process.env.CSC_NAME?.trim() &&
  !process.env.CSC_LINK?.trim()
) {
  throw new Error(
    "A signed macOS build is required for automatic updates; set CSC_NAME or CSC_LINK.",
  );
}

console.info(
  `Desktop ${platform} packaging is configured for an HTTPS update feed.`,
);
