import EventEmitter from "events";
import { Socket } from "net";

export enum OPCode {
  HANDSHAKE = 0,
  FRAME = 1,
  CLOSE = 2,
  PING = 3,
  PONG = 4
}

const HEADER_LENGTH = 8;

export default class IPCClient extends EventEmitter {
  private socket: Socket;
  private received = Buffer.alloc(0);

  constructor() {
    super();

    this.createSocket();
  }

  private createSocket() {
    this.received = Buffer.alloc(0);
    this.socket = new Socket();
    this.socket.on("connect", () => {
      this.emit("connect");
    });
    this.socket.on("close", (hadError: boolean) => {
      this.emit("close", hadError);
    });
    this.socket.on("error", error => {
      // An EventEmitter throws on "error" without a listener, which would take down the main process
      if (this.listenerCount("error") > 0) {
        this.emit("error", error);
      }
    });
    this.socket.on("data", (buffer: Buffer) => {
      // A chunk can hold several frames or only part of one, so frames are cut out of everything received so far
      this.received = Buffer.concat([this.received, buffer]);
      while (this.received.length >= HEADER_LENGTH) {
        const op = this.received.readInt32LE(0);
        const length = this.received.readInt32LE(4);
        if (length < 0) {
          this.socket.destroy();
          return;
        }
        if (this.received.length < HEADER_LENGTH + length) break;

        const payload = this.received.toString("utf-8", HEADER_LENGTH, HEADER_LENGTH + length);
        this.received = this.received.subarray(HEADER_LENGTH + length);

        let json: unknown;
        try {
          json = JSON.parse(payload);
        } catch {
          /* invalid json provided, ignore */
          continue;
        }
        this.emit("data", op, json);
      }
    });
  }

  public connect(ipcPath: string) {
    if (this.socket.destroyed) {
      this.createSocket();
    }
    this.socket.connect(ipcPath);
  }

  public send(data: unknown, op = OPCode.FRAME): boolean {
    // A socket that isn't writable is going away, its close event is what triggers a reconnect
    if (!this.socket.writable) return false;

    const json = JSON.stringify(data);
    const length = Buffer.byteLength(json);
    const buffer = Buffer.alloc(8 + length);
    buffer.writeInt32LE(op, 0);
    buffer.writeInt32LE(length, 4);
    buffer.write(json, 8, length);

    this.socket.write(buffer);
    return true;
  }

  public close() {
    if (!this.socket.closed) {
      this.send({}, OPCode.CLOSE);
      this.socket.end();
    }
  }

  public disconnect() {
    this.socket.destroy();
  }

  public destroy() {
    this.removeAllListeners();
    this.socket.destroy();
  }
}
