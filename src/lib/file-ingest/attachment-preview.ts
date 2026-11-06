/** Resolve an attachment label and extension without treating URL query data as a filename. */
export function getAttachmentPreviewIdentity(
  title: string | undefined,
  rawUrl: string,
) {
  let urlName = "";
  try {
    const pathname = new URL(rawUrl, "https://void-agent.invalid").pathname;
    const encodedName = pathname.split("/").filter(Boolean).at(-1) ?? "";
    urlName = decodeURIComponent(encodedName);
  } catch {
    urlName = rawUrl.split(/[?#]/, 1)[0]?.split("/").at(-1) ?? "";
  }

  const name = title?.trim() || urlName || "attachment";
  const cleanName = name.split(/[?#]/, 1)[0] ?? name;
  const extension = cleanName.includes(".")
    ? (cleanName.split(".").at(-1)?.toUpperCase() ?? "FILE")
    : "FILE";
  return { name, extension };
}
