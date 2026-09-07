const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export class StoredZipError extends Error {
  constructor(message) {
    super(message);
    this.name = "StoredZipError";
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    table[value] = crc >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function asBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (typeof value === "string") return encoder.encode(value);
  throw new StoredZipError("ZIP content must be a string or Uint8Array.");
}

function validateName(value) {
  const name = String(value || "");
  if (!name || name.startsWith("/") || name.startsWith("\\") || name.includes("\\")
    || /[<>:"|?*\x00-\x1f\x7f]/.test(name)) {
    throw new StoredZipError(`Unsafe ZIP entry name: ${name || "(empty)"}.`);
  }
  const parts = name.split("/");
  if (parts.some((part) => part === "" || part === "." || part === ".."
    || /[. ]$/.test(part)
    || /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part))) {
    throw new StoredZipError(`Unsafe ZIP entry name: ${name}.`);
  }
  if (name.normalize("NFC") !== name || decoder.decode(encoder.encode(name)) !== name) {
    throw new StoredZipError(`ZIP entry name is not canonical UTF-8: ${name}.`);
  }
  return name;
}

function portableNameKey(name) {
  return name.toLocaleLowerCase("en-US");
}

function uint16(value) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function uint32(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
  return bytes;
}

function concat(parts) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

function localHeader(entry) {
  return concat([
    uint32(0x04034b50),
    uint16(20),
    uint16(0x0800),
    uint16(0),
    uint16(0),
    uint16(0x0021),
    uint32(entry.crc),
    uint32(entry.content.length),
    uint32(entry.content.length),
    uint16(entry.nameBytes.length),
    uint16(0),
    entry.nameBytes,
  ]);
}

function centralHeader(entry) {
  return concat([
    uint32(0x02014b50),
    uint16(20),
    uint16(20),
    uint16(0x0800),
    uint16(0),
    uint16(0),
    uint16(0x0021),
    uint32(entry.crc),
    uint32(entry.content.length),
    uint32(entry.content.length),
    uint16(entry.nameBytes.length),
    uint16(0),
    uint16(0),
    uint16(0),
    uint16(0),
    uint32(0),
    uint32(entry.offset),
    entry.nameBytes,
  ]);
}

/** Creates a deterministic ZIP32 archive with stored (method 0) entries. */
export function createStoredZip(entries) {
  if (!Array.isArray(entries) || entries.length === 0) throw new StoredZipError("ZIP requires at least one entry.");
  if (entries.length > 0xffff) throw new StoredZipError("ZIP32 entry limit exceeded.");
  const seen = new Set();
  const normalized = entries.map((entry) => {
    const name = validateName(entry?.name);
    const nameKey = portableNameKey(name);
    if (seen.has(nameKey)) throw new StoredZipError(`Duplicate ZIP entry: ${name}.`);
    seen.add(nameKey);
    const nameBytes = encoder.encode(name);
    if (nameBytes.length > 0xffff) throw new StoredZipError(`ZIP entry name is too long: ${name}.`);
    const content = asBytes(entry.content);
    if (content.length > 0xffffffff) throw new StoredZipError(`ZIP entry is too large: ${name}.`);
    return { name, nameBytes, content, crc: crc32(content), offset: 0 };
  });

  const localParts = [];
  let offset = 0;
  normalized.forEach((entry) => {
    entry.offset = offset;
    const header = localHeader(entry);
    localParts.push(header, entry.content);
    offset += header.length + entry.content.length;
    if (offset > 0xffffffff) throw new StoredZipError("ZIP32 archive size limit exceeded.");
  });
  const centralOffset = offset;
  const centralParts = normalized.map(centralHeader);
  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  if (centralSize > 0xffffffff || centralOffset + centralSize + 22 > 0xffffffff) {
    throw new StoredZipError("ZIP32 archive size limit exceeded.");
  }
  const end = concat([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(normalized.length),
    uint16(normalized.length),
    uint32(centralSize),
    uint32(centralOffset),
    uint16(0),
  ]);
  return concat([...localParts, ...centralParts, end]);
}

function requireRange(bytes, offset, length, label) {
  if (!Number.isInteger(offset) || offset < 0 || offset + length > bytes.length) {
    throw new StoredZipError(`${label} points outside the ZIP data.`);
  }
}

function viewAt(bytes, offset, length, label) {
  requireRange(bytes, offset, length, label);
  return new DataView(bytes.buffer, bytes.byteOffset + offset, length);
}

function findEnd(bytes) {
  const minimum = Math.max(0, bytes.length - 0xffff - 22);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (viewAt(bytes, offset, 4, "EOCD scan").getUint32(0, true) === 0x06054b50) return offset;
  }
  throw new StoredZipError("ZIP end-of-central-directory record was not found.");
}

/** Strict reader for deterministic ZIP32/store archives, including CRC verification. */
export function parseStoredZip(input) {
  const bytes = asBytes(input);
  const endOffset = findEnd(bytes);
  const end = viewAt(bytes, endOffset, 22, "EOCD");
  const disk = end.getUint16(4, true);
  const centralDisk = end.getUint16(6, true);
  const diskEntries = end.getUint16(8, true);
  const totalEntries = end.getUint16(10, true);
  const centralSize = end.getUint32(12, true);
  const centralOffset = end.getUint32(16, true);
  const commentLength = end.getUint16(20, true);
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== totalEntries) {
    throw new StoredZipError("Multi-disk ZIP archives are unsupported.");
  }
  if (commentLength !== 0 || endOffset + 22 !== bytes.length) {
    throw new StoredZipError("Unexpected ZIP data after the end record.");
  }
  if (centralOffset + centralSize !== endOffset) {
    throw new StoredZipError("ZIP central directory bounds are inconsistent.");
  }

  const files = [];
  const seen = new Set();
  let cursor = centralOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    const central = viewAt(bytes, cursor, 46, "Central header");
    if (central.getUint32(0, true) !== 0x02014b50) throw new StoredZipError("Invalid central header signature.");
    const flags = central.getUint16(8, true);
    const method = central.getUint16(10, true);
    const crc = central.getUint32(16, true);
    const compressedSize = central.getUint32(20, true);
    const size = central.getUint32(24, true);
    const nameLength = central.getUint16(28, true);
    const extraLength = central.getUint16(30, true);
    const fileCommentLength = central.getUint16(32, true);
    const localOffset = central.getUint32(42, true);
    if (method !== 0 || compressedSize !== size) throw new StoredZipError("Only stored ZIP entries are supported.");
    if ((flags & 0x0800) === 0) throw new StoredZipError("ZIP entry names must be UTF-8.");
    requireRange(bytes, cursor + 46, nameLength + extraLength + fileCommentLength, "Central entry");
    const name = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
    validateName(name);
    const nameKey = portableNameKey(name);
    if (seen.has(nameKey)) throw new StoredZipError(`Duplicate ZIP entry: ${name}.`);
    seen.add(nameKey);

    const local = viewAt(bytes, localOffset, 30, "Local header");
    if (local.getUint32(0, true) !== 0x04034b50) throw new StoredZipError("Invalid local header signature.");
    if (local.getUint16(6, true) !== flags) throw new StoredZipError("Local and central ZIP flags differ.");
    if (local.getUint16(8, true) !== 0) throw new StoredZipError("Local entry is not stored.");
    const localNameLength = local.getUint16(26, true);
    const localExtraLength = local.getUint16(28, true);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    requireRange(bytes, dataOffset, size, "Stored entry data");
    const localName = decoder.decode(bytes.slice(localOffset + 30, localOffset + 30 + localNameLength));
    if (localName !== name) throw new StoredZipError("Local and central ZIP names differ.");
    const content = bytes.slice(dataOffset, dataOffset + size);
    if (crc32(content) !== crc || local.getUint32(14, true) !== crc) {
      throw new StoredZipError(`CRC mismatch for ${name}.`);
    }
    if (local.getUint32(18, true) !== size || local.getUint32(22, true) !== size) {
      throw new StoredZipError(`Size mismatch for ${name}.`);
    }
    files.push({ name, content, crc32: crc, size });
    cursor += 46 + nameLength + extraLength + fileCommentLength;
  }
  if (cursor !== endOffset) throw new StoredZipError("Central directory entry count or size is inconsistent.");
  return files;
}
