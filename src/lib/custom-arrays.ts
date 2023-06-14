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

	set(idx: number, value: string | Int32Array): void {
		const offset = this.chars * idx;
		const view = this._data.subarray(offset, offset + this.chars);
		view.fill(0); // clear current
    if (typeof value == "string") view.set(this.encode(value));
    else view.set(value);
	}

  subarray(begin: number, end: number): Int32Array {
    return this._data.subarray(begin, end);
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

export class VLenByteStringArray extends ByteStringArray {
  constructor(size: number);
	constructor(x: number | ArrayBuffer) {
    const [decoded_buffer, length] = VLenByteStringArray.decode(buffer as Uint8Array);
    super(decoded_buffer, decoded_buffer.length / length)
	}

  static decode(data: Uint8Array): [Uint8Array, number] {
    let ptr = 0;
    const dataEnd = ptr + data.length;
    const length = read4Bytes(data.slice(0, HEADER_LENGTH));

    if (data.length < HEADER_LENGTH) {
      throw new Error('corrupt buffer, missing or truncated header');
    }

    ptr += HEADER_LENGTH;

    const output = new Array<Uint8Array>(length);
    for (let i = 0; i < length; i += 1) {
      if (ptr + 4 > dataEnd) {
        throw new Error('corrupt buffer, data seem truncated');
      }
      const l = read4Bytes(data.slice(ptr, ptr + 4));
      ptr += 4;
      if (ptr + l > dataEnd) {
        throw new Error('corrupt buffer, data seem truncated');
      }
      output[i] = data.slice(ptr, ptr + l);
      ptr += l;
    }

    const maxLength = output.reduce((max, entry) => Math.max(max, entry.length), 0)

    const paddedOutput = output.map((entry) => {
      if (entry.length < maxLength) {
        const paddedEntry = new Uint8Array(maxLength);
        paddedEntry.set(entry, 0); // Copy existing values to padded entry
        return paddedEntry;
      }
      return entry; // No padding required for this entry
    });

    // Concatenate all arrays
    const totalLength = paddedOutput.reduce((total, arr) => total + arr.length, 0);
    const concatenatedArray = new Uint8Array(totalLength);
    let offset = 0;
    paddedOutput.forEach((uint8Array) => {
      concatenatedArray.set(uint8Array, offset);
      offset += uint8Array.length;
    });

    return [concatenatedArray, output.length];
  }
}
