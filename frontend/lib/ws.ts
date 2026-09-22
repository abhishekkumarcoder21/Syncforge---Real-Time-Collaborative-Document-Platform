import { RGA, Operation, SerializedRGA } from "./crdt";
import { api } from "./api";

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline"
  | "error";

export interface RemoteUser {
  id: string;
  name: string;
  color: string;
}

export interface RemoteCursor {
  userId: string;
  userName: string;
  position: number; // character index
  color: string;
  updatedAt: number;
}

export interface SyncForgeEvents {
  onStatusChange: (status: ConnectionStatus, latencyMs?: number, pendingCount?: number) => void;
  onTextChange: (text: string, originOp?: Operation) => void;
  onPresenceChange: (users: RemoteUser[]) => void;
  onCursorChange: (cursors: Map<string, RemoteCursor>) => void;
  onError: (msg: string) => void;
}

const USER_COLORS = [
  "#3B82F6", // Blue
  "#10B981", // Green
  "#8B5CF6", // Purple
  "#F59E0B", // Amber
  "#EC4899", // Pink
  "#06B6D4", // Cyan
  "#F97316", // Orange
  "#6366F1", // Indigo
];

export function getUserColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash << 5) - hash + userId.charCodeAt(i);
    hash |= 0;
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

export class SyncForgeClient {
  public docId: string;
  public crdt: RGA;
  public status: ConnectionStatus = "connecting";
  public latency: number = 0;

  private ws: WebSocket | null = null;
  private events: SyncForgeEvents;
  private reconnectAttempts = 0;
  private reconnectTimer: any = null;
  private pingInterval: any = null;
  private lastPingSent: number = 0;
  private isDestroyed = false;

  // Pending operations queue for offline / reconnect resilience
  private pendingOps: Operation[] = [];
  private acknowledgedOpIDs: Set<string> = new Set();

  // Remote presence & cursors
  private presenceUsers: RemoteUser[] = [];
  private remoteCursors: Map<string, RemoteCursor> = new Map();
  private cursorThrottleTimer: any = null;
  private pendingCursorPos: number | null = null;

  // Network simulation (for portfolio demo)
  private simulatedLatencyMs: number = 0;
  private isSimulatedOffline: boolean = false;

  constructor(docId: string, replicaId: string, events: SyncForgeEvents) {
    this.docId = docId;
    this.crdt = new RGA(replicaId);
    this.events = events;
  }

  public async connect() {
    if (this.isDestroyed || this.isSimulatedOffline) return;

    this.updateStatus(this.reconnectAttempts > 0 ? "reconnecting" : "connecting");

    try {
      const ticket = await api.getWsTicket(this.docId);
      if (this.isDestroyed) return;

      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = process.env.NEXT_PUBLIC_WS_HOST || window.location.hostname + ":8080";
      const url = `${wsProtocol}//${host}/ws/documents/${this.docId}?ticket=${ticket}`;

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.updateStatus("connected");
        this.startHeartbeat();

        // Immediately request authoritative server state
        this.sendRaw({
          type: "sync_request",
          payload: {},
        });

        // Flush any un-acknowledged pending operations from prior offline edits
        this.flushPendingOps();
      };

      this.ws.onmessage = (event) => {
        if (this.simulatedLatencyMs > 0) {
          setTimeout(() => this.handleMessage(event.data), this.simulatedLatencyMs);
        } else {
          this.handleMessage(event.data);
        }
      };

      this.ws.onclose = () => {
        this.stopHeartbeat();
        this.ws = null;
        if (!this.isDestroyed && !this.isSimulatedOffline) {
          this.scheduleReconnect();
        } else if (this.isSimulatedOffline) {
          this.updateStatus("offline");
        }
      };

      this.ws.onerror = (e) => {
        console.warn("WebSocket error:", e);
        if (this.ws) {
          this.ws.close();
        }
      };
    } catch (err: any) {
      console.warn("WS connect failed:", err);
      this.updateStatus("error");
      this.scheduleReconnect();
    }
  }

  private handleMessage(rawData: string) {
    try {
      const msg = JSON.parse(rawData);
      switch (msg.type) {
        case "sync_response": {
          if (msg.payload && msg.payload.state) {
            const serverState: SerializedRGA = msg.payload.state;
            this.crdt.loadSerializedState(serverState);
            this.events.onTextChange(this.crdt.getText());
            // Re-apply any local pending edits on top of synced state
            this.replayPendingOps();
          }
          break;
        }

        case "operation": {
          const op: Operation = msg.payload;
          const applied = this.crdt.apply(op);
          if (applied) {
            this.events.onTextChange(this.crdt.getText(), op);
          }
          break;
        }

        case "ack": {
          const ackId = msg.payload?.id;
          if (ackId) {
            const key = `${ackId.r}:${ackId.c}`;
            this.acknowledgedOpIDs.add(key);
            this.pendingOps = this.pendingOps.filter(
              (o) => `${o.id.r}:${o.id.c}` !== key
            );
            this.updateStatus(this.status);
          }
          break;
        }

        case "presence": {
          const rawList = msg.payload || [];
          const users: RemoteUser[] = rawList.map((u: any) => ({
            id: u.user_id || u.id,
            name: u.user_name || u.name || "Collaborator",
            color: getUserColor(u.user_id || u.id),
          }));
          this.presenceUsers = users;
          this.events.onPresenceChange(users);
          break;
        }

        case "cursor": {
          const { user_id, user_name, position } = msg.payload || {};
          if (user_id && user_id !== this.crdt.replicaId) {
            const cur: RemoteCursor = {
              userId: user_id,
              userName: user_name || "Collaborator",
              position: typeof position === "number" ? position : 0,
              color: getUserColor(user_id),
              updatedAt: Date.now(),
            };
            this.remoteCursors.set(user_id, cur);
            this.events.onCursorChange(new Map(this.remoteCursors));
          }
          break;
        }

        case "pong": {
          if (this.lastPingSent > 0) {
            this.latency = Math.max(1, Date.now() - this.lastPingSent);
            this.updateStatus(this.status, this.latency);
          }
          break;
        }

        case "error": {
          this.events.onError(msg.payload?.message || "Server error");
          break;
        }
      }
    } catch (e) {
      console.warn("Failed to parse incoming WS message:", e);
    }
  }

  /**
   * Called when user types a character or string at `index`.
   * Applies locally with optimistic UI update, then queues/sends op.
   */
  public insertText(index: number, text: string) {
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const op = this.crdt.createLocalInsert(index + i, char);
      this.dispatchOperation(op);
    }
    this.events.onTextChange(this.crdt.getText());
  }

  /**
   * Called when user deletes `count` characters starting at `index`.
   */
  public deleteText(index: number, count: number = 1) {
    for (let i = count - 1; i >= 0; i--) {
      const op = this.crdt.createLocalDelete(index + i);
      if (op) {
        this.dispatchOperation(op);
      }
    }
    this.events.onTextChange(this.crdt.getText());
  }

  private dispatchOperation(op: Operation) {
    this.pendingOps.push(op);
    this.updateStatus(this.status);

    if (this.ws && this.ws.readyState === WebSocket.OPEN && !this.isSimulatedOffline) {
      const sendAction = () => {
        this.sendRaw({
          type: "operation",
          payload: op,
        });
      };

      if (this.simulatedLatencyMs > 0) {
        setTimeout(sendAction, this.simulatedLatencyMs);
      } else {
        sendAction();
      }
    }
  }

  private replayPendingOps() {
    for (const op of this.pendingOps) {
      this.crdt.apply(op);
    }
    this.events.onTextChange(this.crdt.getText());
  }

  private flushPendingOps() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    for (const op of this.pendingOps) {
      this.sendRaw({
        type: "operation",
        payload: op,
      });
    }
  }

  /**
   * Throttled cursor position update (100ms max frequency).
   */
  public sendCursor(position: number) {
    this.pendingCursorPos = position;
    if (this.cursorThrottleTimer) return;

    this.cursorThrottleTimer = setTimeout(() => {
      this.cursorThrottleTimer = null;
      if (
        this.pendingCursorPos !== null &&
        this.ws &&
        this.ws.readyState === WebSocket.OPEN &&
        !this.isSimulatedOffline
      ) {
        this.sendRaw({
          type: "cursor",
          payload: this.pendingCursorPos,
        });
      }
    }, 100);
  }

  private sendRaw(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.lastPingSent = Date.now();
        this.sendRaw({ type: "ping", payload: {} });
      }
    }, 15000);
  }

  private stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.isDestroyed || this.isSimulatedOffline) return;

    this.reconnectAttempts++;
    // Exponential backoff: 1s, 2s, 4s, 8s, max 30s + jitter
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000) + Math.random() * 500;

    this.updateStatus("reconnecting");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private updateStatus(status: ConnectionStatus, latency?: number) {
    this.status = status;
    if (latency !== undefined) {
      this.latency = latency;
    }
    this.events.onStatusChange(this.status, this.latency, this.pendingOps.length);
  }

  // --- Portfolio & Engineering Demo Controls ---

  public setSimulatedOffline(offline: boolean) {
    this.isSimulatedOffline = offline;
    if (offline) {
      if (this.ws) {
        this.ws.close();
      }
      this.updateStatus("offline");
    } else {
      this.connect();
    }
  }

  public setSimulatedLatency(latencyMs: number) {
    this.simulatedLatencyMs = latencyMs;
  }

  public getPendingCount(): number {
    return this.pendingOps.length;
  }

  public destroy() {
    this.isDestroyed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.cursorThrottleTimer) {
      clearTimeout(this.cursorThrottleTimer);
      this.cursorThrottleTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
