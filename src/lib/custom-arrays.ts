export class BoolArray {
	private _bytes: Uint8Array;

	constructor(size: number);
	constructor(buffer: ArrayBuffer);
	constructor(x: any) {
		this._bytes = new Uint8Array(x);
	}

	get buffer(): ArrayBuffer {
		return this._bytes.buffer;
	}

	get length(): number {
		return this._bytes.length;
	}

	get(idx: number): boolean {
		return this._bytes[idx] === 1;
	}

	set(idx: number, value: boolean): void {
		this._bytes[idx] = value ? 1 : 0;
	}

	fill(value: boolean): void {
		this._bytes.fill(value ? 1 : 0);
	}

	*[Symbol.iterator]() {
		for (let i = 0; i < this.length; i++) {
			yield this.get(i);
		}
	}
}

export class ByteStringArray {
	private _bytes: Uint8Array;

	constructor(size: number, chars: number);
	constructor(buffer: ArrayBuffer, chars: number);
	constructor(x: number | ArrayBuffer, public chars: number) {
		if (typeof x === "number") {
			this._bytes = new Uint8Array(x * chars);
		} else {
			this._bytes = new Uint8Array(x);
		}
	}

	get buffer(): ArrayBuffer {
		return this._bytes.buffer;
	}

	get length(): number {
		return this._bytes.buffer.byteLength / this.chars;
	}

	private encode(s: string): Uint8Array {
		return new TextEncoder().encode(s);
	}

	get(idx: number): string {
		const view = new Uint8Array(
			this.buffer,
			this.chars * idx,
			this.chars,
		);
		return new TextDecoder().decode(view).replace(/\x00/g, "");
	}

	set(idx: number, value: string): void {
		const view = new Uint8Array(
			this.buffer,
			this.chars * idx,
			this.chars,
		);
		view.fill(0); // clear current
		view.set(this.encode(value));
	}

	fill(value: string): void {
		const encoded = this.encode(value);
		for (let i = 0; i < this.length; i++) {
			this._bytes.set(encoded, i * this.chars);
		}
	}

	*[Symbol.iterator]() {
		for (let i = 0; i < this.length; i++) {
			yield this.get(i);
		}
	}
}

export class UnicodeStringArray {
	private _data: Int32Array;
	BYTES_PER_ELEMENT = 4;
	byteOffset = 0;

	constructor(size: number, chars: number);
	constructor(buffer: ArrayBuffer, chars: number);
	constructor(x: number | ArrayBuffer, public chars: number) {
		if (typeof x === "number") {
			this._data = new Int32Array(x * chars);
		} else {
			this._data = new Int32Array(x);
		}
	}

	get buffer(): ArrayBuffer {
		return this._data.buffer;
	}

	get length(): number {
		return this._data.length / this.chars;
	}

	private encode(s: string): Int32Array {
		let out = new Int32Array(this.chars);
		for (let i = 0; i < this.chars; i++) {
			out[i] = s.codePointAt(i)!;
		}
		return out;
	}

	get(idx: number): string {
		const offset = this.chars * idx;
		let result = "";
		for (let i = 0; i < this.chars; i++) {
      if (isNaN(this._data[offset + i])) { 
        result += ""; 
      }
      else {
        result += String.fromCodePoint(this._data[offset + i]);
      }
		}
		return result.replace(/\u0000/g, "");
	}

	set(value: string | Int32Array, idx: number): void {
		const offset = this.chars * idx;
    if (typeof value == "string") {
		  const view = this._data.subarray(offset, offset + this.chars);
		  view.fill(0); // clear current
      view.set(this.encode(value));
    }
    else {
		  const view = this._data.subarray(offset, offset + value.length);
		  view.fill(0); // clear current
      view.set(value);
    }
	}

  subarray(begin: number, end: number): Int32Array {
    return this._data.subarray(begin * this.chars, end * this.chars);
  }

	fill(value: string): void {
		const encoded = this.encode(value);
		for (let i = 0; i < this.length; i++) {
			this._data.set(encoded, i * this.chars);
		}
	}

	*[Symbol.iterator]() {
		for (let i = 0; i < this.length; i++) {
			yield this.get(i);
		}
	}
}

const HEADER_LENGTH = 4
const read4Bytes = (buf: Uint8Array) => {
  return new Int32Array(buf)[0];
}
const decode: (data: Uint8Array) => [number[], number[]] = (data: Uint8Array) => {
  let ptr = 0;
  const dataEnd = ptr + data.length;
  const length = read4Bytes(data.slice(0, HEADER_LENGTH));

  if (data.length < HEADER_LENGTH) {
    throw new Error('corrupt buffer, missing or truncated header');
  }

  ptr += HEADER_LENGTH;

  const lengths = Array<number>()
  const idxs = Array<number>()
  for (let i = 0; i < length; i += 1) {
    if (ptr + 4 > dataEnd) {
      throw new Error('corrupt buffer, data seem truncated');
    }
    const l = read4Bytes(data.slice(ptr, ptr + 4));
    ptr += 4;
    if (ptr + l > dataEnd) {
      throw new Error('corrupt buffer, data seem truncated');
    }
    lengths.push(l)
    idxs.push(ptr)
    ptr += l;
  }

  return [lengths, idxs];
}

const concat = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const result = new Uint8Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
}

export class VLenByteStringArray  {
  private _bytes: Uint8Array;
  private _idxs: number[]; 
  private _lengths: number[];

	constructor(size: number);
	constructor(buffer: ArrayBuffer);
	constructor(x: number | ArrayBuffer) {
		if (typeof x === "number") {
			this._bytes = new Uint8Array(x);
      this._idxs = Array.from({ length: x }, (_, index) => index);
      this._lengths = Array(x).fill(1);
		} else {
			this._bytes = new Uint8Array(x);
      [this._lengths, this._idxs] = decode(this._bytes)
		}
	}

	get buffer(): ArrayBuffer {
		return this._bytes.buffer;
	}

	get length(): number {
    if (this._idxs === null) return 0;
		return this._idxs.length;
	}

	get(idx: number): Uint8Array{
		const view = new Uint8Array(
			this.buffer,
			this._idxs[idx],
			this._lengths[idx],
		);
		return view;
	}

	set(value: Uint8Array | VLenByteStringArray, idx: number): void {
    if (value instanceof Uint8Array) {
      const till = new Uint8Array(this.buffer, 0, this._idxs[idx]);
      const after = new Uint8Array(this.buffer, this._idxs[idx] + this._lengths[idx]);
		  const sample = concat(new Uint8Array((new Int32Array([value.length])).buffer), value);

      const old_len = this._lengths[idx];
      this._lengths[idx] = value.length
		  for (let i = idx + 1; i < this._idxs.length; i++) {
        this._idxs[i] += this._lengths[idx] - old_len
      }

      this._bytes = concat(concat(till, sample), after)
    }
    else {
      for (let i = 0; i < value.length; i++) {
        this.set(value.get(i), i);
      }
    }
	}

  subarray(begin: number, end: number|null = null): Uint8Array {
    return this._bytes.subarray(this._idxs[begin],);
  }

	fill(value: Uint8Array): void {
		for (let i = 0; i < this.length; i++) {
			this._bytes.set(value, this._idxs[i]);
		}
	}

	*[Symbol.iterator]() {
		for (let i = 0; i < this.length; i++) {
			yield this.get(i);
		}
	} 
}
