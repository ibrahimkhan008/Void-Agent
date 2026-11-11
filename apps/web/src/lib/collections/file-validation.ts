const MAX_UNCOMPRESSED_DOCX_BYTES = 100 * 1024 * 1024;
const MAX_DOCX_ENTRIES = 10_000;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

export type CollectionFileValidation =
  | { valid: true; contentType: string }
  | { valid: false; reason: string };

const contentTypes: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".json": "application/json",
  ".yaml": "application/yaml",
  ".yml": "application/yaml",
};

function containsDocxStructure(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minimumEocdOffset = Math.max(0, bytes.length - 22 - 65_535);
  let eocdOffset = -1;
  for (
    let offset = bytes.length - 22;
    offset >= minimumEocdOffset;
    offset -= 1
  ) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0 || eocdOffset + 22 > bytes.length) return false;

  const disk = view.getUint16(eocdOffset + 4, true);
  const centralDisk = view.getUint16(eocdOffset + 6, true);
  const entriesOnDisk = view.getUint16(eocdOffset + 8, true);
  const entryCount = view.getUint16(eocdOffset + 10, true);
  const directorySize = view.getUint32(eocdOffset + 12, true);
  const directoryOffset = view.getUint32(eocdOffset + 16, true);
  const commentLength = view.getUint16(eocdOffset + 20, true);
  if (
    disk !== 0 ||
    centralDisk !== 0 ||
    entriesOnDisk !== entryCount ||
    entryCount === 0 ||
    entryCount > MAX_DOCX_ENTRIES ||
    directoryOffset + directorySize > eocdOffset ||
    eocdOffset + 22 + commentLength !== bytes.length
  ) {
    return false;
  }

  let offset = directoryOffset;
  let totalUncompressedBytes = 0;
  let hasContentTypes = false;
  let hasDocument = false;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > directoryOffset + directorySize) return false;
    if (view.getUint32(offset, true) !== 0x02014b50) return false;
    const flags = view.getUint16(offset + 8, true);
    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const entryCommentLength = view.getUint16(offset + 32, true);
    const diskNumber = view.getUint16(offset + 34, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const entryLength = 46 + nameLength + extraLength + entryCommentLength;
    if (
      offset + entryLength > directoryOffset + directorySize ||
      (flags & 0x0001) !== 0 ||
      (compressionMethod !== 0 && compressionMethod !== 8) ||
      diskNumber !== 0 ||
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      (compressedSize === 0 && uncompressedSize > 0) ||
      localHeaderOffset + 30 > directoryOffset ||
      view.getUint32(localHeaderOffset, true) !== 0x04034b50
    ) {
      return false;
    }
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength);
    const name = new TextDecoder("utf-8", { fatal: true }).decode(nameBytes);
    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const localFlags = view.getUint16(localHeaderOffset + 6, true);
    const localCompressionMethod = view.getUint16(localHeaderOffset + 8, true);
    const localDataOffset =
      localHeaderOffset + 30 + localNameLength + localExtraLength;
    if (
      localNameLength !== nameLength ||
      (localFlags & 0x0001) !== 0 ||
      localCompressionMethod !== compressionMethod ||
      localDataOffset + compressedSize > directoryOffset ||
      !bytes
        .subarray(localHeaderOffset + 30, localDataOffset - localExtraLength)
        .every((byte, index) => byte === nameBytes[index])
    ) {
      return false;
    }
    if (
      name.startsWith("/") ||
      name.includes("\\") ||
      name.split("/").some((part) => part === "..")
    ) {
      return false;
    }
    totalUncompressedBytes += uncompressedSize;
    if (totalUncompressedBytes > MAX_UNCOMPRESSED_DOCX_BYTES) return false;
    if (
      uncompressedSize > 1024 * 1024 &&
      compressedSize > 0 &&
      uncompressedSize / compressedSize > 100
    )
      return false;
    hasContentTypes ||= name === "[Content_Types].xml";
    hasDocument ||= name === "word/document.xml";
    offset += entryLength;
  }
  return (
    offset === directoryOffset + directorySize && hasContentTypes && hasDocument
  );
}

export async function validateCollectionFile(
  file: File,
): Promise<CollectionFileValidation> {
  if (
    !file.name ||
    file.name.length > 255 ||
    /[\\/\u0000-\u001f\u007f]/u.test(file.name) ||
    file.name === "." ||
    file.name === ".."
  ) {
    return { valid: false, reason: "Invalid filename" };
  }
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  const expectedType = contentTypes[extension];
  if (!expectedType)
    return { valid: false, reason: "Unsupported file extension" };
  if (file.size > MAX_FILE_BYTES)
    return { valid: false, reason: "File exceeds the 20 MiB limit" };
  if (file.size === 0) return { valid: false, reason: "File is empty" };

  const declaredType = file.type.toLowerCase();
  const genericType =
    !declaredType || declaredType === "application/octet-stream";
  const matchesDeclaredType =
    genericType ||
    declaredType === expectedType ||
    (extension === ".json" && declaredType === "text/plain") ||
    ((extension === ".md" ||
      extension === ".csv" ||
      extension === ".yaml" ||
      extension === ".yml") &&
      declaredType === "text/plain");
  if (!matchesDeclaredType) {
    return { valid: false, reason: "File type does not match its extension" };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (extension === ".pdf") {
    const header = new TextDecoder("ascii").decode(
      bytes.subarray(0, Math.min(bytes.length, 1_024)),
    );
    if (!header.includes("%PDF-"))
      return { valid: false, reason: "Invalid PDF signature" };
  } else if (extension === ".docx") {
    if (
      bytes.length < 22 ||
      new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
        0,
        true,
      ) !== 0x04034b50
    ) {
      return { valid: false, reason: "Invalid DOCX ZIP signature" };
    }
    try {
      if (!containsDocxStructure(bytes))
        return { valid: false, reason: "Invalid or unsafe DOCX archive" };
    } catch {
      return { valid: false, reason: "Invalid DOCX archive" };
    }
  } else {
    if (bytes.includes(0))
      return { valid: false, reason: "Text files cannot contain NUL bytes" };
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return { valid: false, reason: "Text file is not valid UTF-8" };
    }
  }
  return { valid: true, contentType: expectedType };
}
