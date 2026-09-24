/** Loader for Open-HFT session recordings (.hbr) written by runner/src/record.rs.
 *
 * Layout: "HFTREC01" | u32 header length | JSON header | pad to 8 | little-endian arrays.
 */

export type TypedArray =
  | Float64Array
  | Float32Array
  | Int32Array
  | Uint32Array
  | Int8Array
  | Uint8Array;

export interface ArrayDesc {
  name: string;
  dtype: "f64" | "f32" | "i32" | "u32" | "i8" | "u8";
  shape: number[];
  offset: number;
  length: number;
}

export interface Hbr {
  meta: Record<string, any>;
  arrays: Map<string, { data: TypedArray; shape: number[] }>;
}

const CTORS = {
  f64: Float64Array,
  f32: Float32Array,
  i32: Int32Array,
  u32: Uint32Array,
  i8: Int8Array,
  u8: Uint8Array,
} as const;

export function parseHbr(buf: ArrayBuffer): Hbr {
  const magic = new TextDecoder().decode(new Uint8Array(buf, 0, 8));
  if (magic !== "HFTREC01") throw new Error(`not an hbr file (magic ${magic})`);
  const hlen = new DataView(buf).getUint32(8, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 12, hlen)));
  let start = 12 + hlen;
  start += (8 - (start % 8)) % 8;
  const arrays = new Map<string, { data: TypedArray; shape: number[] }>();
  for (const a of header.arrays as ArrayDesc[]) {
    const C = CTORS[a.dtype];
    const n = a.length / C.BYTES_PER_ELEMENT;
    const abs = start + a.offset;
    // arrays are 8-byte aligned in the file, so a view without copying is valid
    const data = new C(buf, abs, n) as TypedArray;
    arrays.set(a.name, { data, shape: a.shape });
  }
  return { meta: header.meta, arrays };
}

export async function fetchHbr(url: string, onProgress?: (loaded: number, total: number) => void): Promise<Hbr> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const total = Number(res.headers.get("content-length") ?? 0);
  if (!res.body || !onProgress) return parseHbr(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(loaded, total);
  }
  const out = new Uint8Array(loaded);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return parseHbr(out.buffer);
}

function getDtype(arr: TypedArray): "f64" | "f32" | "i32" | "u32" | "i8" | "u8" {
  if (arr instanceof Float64Array) return "f64";
  if (arr instanceof Float32Array) return "f32";
  if (arr instanceof Int32Array) return "i32";
  if (arr instanceof Uint32Array) return "u32";
  if (arr instanceof Int8Array) return "i8";
  if (arr instanceof Uint8Array) return "u8";
  return "f32";
}

/**
 * Serializes an Hbr structure into a binary HFTREC01 ArrayBuffer.
 */
export function encodeHbr(hbr: Hbr): ArrayBuffer {
  const arrayDescs: ArrayDesc[] = [];
  let currentOffset = 0;

  for (const [name, entry] of hbr.arrays.entries()) {
    const data = entry.data;
    const dtype = getDtype(data);
    const byteLen = data.byteLength;
    arrayDescs.push({
      name,
      dtype,
      shape: entry.shape,
      offset: currentOffset,
      length: byteLen,
    });
    // Pad each array so the next array is aligned to 8 bytes
    const pad = (8 - (byteLen % 8)) % 8;
    currentOffset += byteLen + pad;
  }

  const headerObj = {
    meta: hbr.meta,
    arrays: arrayDescs,
  };

  const headerStr = JSON.stringify(headerObj);
  const headerBytes = new TextEncoder().encode(headerStr);
  const hlen = headerBytes.length;

  let start = 12 + hlen;
  const padH = (8 - (start % 8)) % 8;
  start += padH;

  const totalSize = start + currentOffset;
  const buf = new ArrayBuffer(totalSize);
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);

  // Magic
  const magic = new TextEncoder().encode("HFTREC01");
  u8.set(magic, 0);

  // Header length
  dv.setUint32(8, hlen, true);

  // JSON header
  u8.set(headerBytes, 12);

  // Arrays
  for (const desc of arrayDescs) {
    const entry = hbr.arrays.get(desc.name);
    if (!entry) continue;
    const arrU8 = new Uint8Array(entry.data.buffer, entry.data.byteOffset, entry.data.byteLength);
    u8.set(arrU8, start + desc.offset);
  }

  return buf;
}
