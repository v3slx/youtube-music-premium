import EventEmitter from "events";
import IPCClient, { OPCode } from "./ipc";
import { DiscordActivity } from "./types";
import { randomUUID } from "crypto";
import log from "electron-log";
import { existsSync, statSync } from "node:fs";

// How long a pipe gets to accept the connection and answer the handshake
const HANDSHAKE_TIMEOUT_MS = 10 * 1000;

type DiscordFrame = {
  cmd?: string;
  evt?: string | null;
  data?: {
    code?: number;
    message?: string;
    user?: {
      username?: string;
    };
  };
  // CLOSE frames carry their reason at the top level
  code?: number;
  message?: string;
};

function directoryExists(dirPath: string): boolean {
  try {
    return existsSync(dirPath) && statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function getIPCPath(id: number): string {
  if (process.platform === "win32") {
    return `\\\\?\\pipe\\discord-ipc-${id}`;
  }

  const dirtyPrefix = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || process.env.TEMP || "/tmp";
  const prefix = dirtyPrefix.replace(/\/$/, "");
  const discordSnapDir = "snap.discord";

  if (directoryExists(`${prefix}/${discordSnapDir}`)) {
    return `${prefix}/${discordSnapDir}/discord-ipc-${id}`;
  } else {
    return `${prefix}/discord-ipc-${id}`;
  }
}

export default class DiscordClient extends EventEmitter {
  private clientId: string | null = null;
  private connectionPromise: Promise<void> | null = null;
  private ipcClient = new IPCClient();
  private connected = false;
  private destroyed = false;

  public username: string | null = null;

  constructor(clientId: string) {
    super();

    this.clientId = clientId;
  }

  public connect(): Promise<void> {
    if (!this.connectionPromise) {
      this.connectionPromise = this.connectToFirstWorkingPipe().finally(() => {
        this.connectionPromise = null;
      });
    }
    return this.connectionPromise;
  }

  private async connectToFirstWorkingPipe() {
    const problems: string[] = [];
    for (let id = 0; id < 10 && !this.destroyed; id++) {
      const failure = await this.tryPipe(getIPCPath(id));
      if (failure === null) return;
      // A missing pipe only means no Discord instance uses that number, anything else explains why nothing shows up
      if (failure !== "ENOENT") problems.push(`${getIPCPath(id)}: ${failure}`);
    }
    throw new Error(problems.length > 0 ? problems.join("; ") : "no Discord desktop app running");
  }

  /**
   * Resolves with null once Discord has accepted the handshake, otherwise with the reason it didn't
   */
  private tryPipe(ipcPath: string): Promise<string | null> {
    return new Promise(resolve => {
      let settled = false;
      let socketError: string | null = null;
      let refusal: string | null = null;
      let handshakeTimeout: NodeJS.Timeout | null = null;

      const finish = (failure: string | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(handshakeTimeout);
        this.ipcClient.removeAllListeners();
        resolve(failure);
      };

      handshakeTimeout = setTimeout(() => {
        finish("Discord did not answer the handshake");
        this.ipcClient.disconnect();
      }, HANDSHAKE_TIMEOUT_MS);

      this.ipcClient.on("error", (error: NodeJS.ErrnoException) => {
        socketError = error.code ?? error.message;
      });
      this.ipcClient.on("close", () => {
        finish(refusal ?? socketError ?? "connection closed");
      });
      this.ipcClient.on("connect", () => {
        this.ipcClient.send(
          {
            v: 1,
            client_id: this.clientId
          },
          OPCode.HANDSHAKE
        );
      });
      this.ipcClient.on("data", (op: OPCode, frame: DiscordFrame) => {
        switch (op) {
          case OPCode.PING: {
            this.ipcClient.send(frame, OPCode.PONG);
            break;
          }

          case OPCode.CLOSE: {
            refusal = `Discord refused the connection (${frame?.code}: ${frame?.message})`;
            this.ipcClient.disconnect();
            break;
          }

          case OPCode.FRAME: {
            // Only READY means Discord will accept activities, an open pipe alone doesn't
            if (frame?.evt !== "READY") break;
            this.username = frame.data?.user?.username ?? null;
            log.info(`dipc: connected to discord at ${ipcPath}${this.username ? ` as ${this.username}` : ""}`);
            finish(null);
            this.listenToConnection();
            break;
          }

          default: {
            break;
          }
        }
      });

      if (this.destroyed) {
        finish("client destroyed");
        return;
      }
      this.ipcClient.connect(ipcPath);
    });
  }

  private listenToConnection() {
    this.connected = true;

    this.ipcClient.on("error", error => {
      log.warn("dipc: socket error", error);
    });
    this.ipcClient.on("close", () => {
      this.connected = false;
      this.emit("close");
    });
    this.ipcClient.on("data", (op: OPCode, frame: DiscordFrame) => {
      switch (op) {
        case OPCode.PING: {
          this.ipcClient.send(frame, OPCode.PONG);
          break;
        }

        case OPCode.CLOSE: {
          log.warn(`dipc: discord closed the connection (${frame?.code}: ${frame?.message})`);
          this.ipcClient.disconnect();
          break;
        }

        case OPCode.FRAME: {
          // Discord answers every command, without this a rejected activity would fail without a trace
          if (frame?.evt === "ERROR") {
            log.warn(`dipc: discord rejected ${frame.cmd} (${frame.data?.code}: ${frame.data?.message})`);
          }
          break;
        }

        default: {
          break;
        }
      }
    });

    this.emit("connect");
  }

  public close() {
    if (this.connected) {
      this.ipcClient.once("close", () => {
        this.ipcClient.removeAllListeners();
      });
      this.ipcClient.close();
    }
  }

  public destroy() {
    this.destroyed = true;
    this.connected = false;
    this.removeAllListeners();
    this.ipcClient.destroy();
  }

  public setActivity(activity: DiscordActivity) {
    if (!this.connected) return;
    this.ipcClient.send({
      cmd: "SET_ACTIVITY",
      args: {
        pid: process.pid,
        activity
      },
      nonce: randomUUID()
    });
  }

  public clearActivity() {
    if (!this.connected) return;
    this.ipcClient.send({
      cmd: "SET_ACTIVITY",
      args: {
        pid: process.pid
      },
      nonce: randomUUID()
    });
  }
}
