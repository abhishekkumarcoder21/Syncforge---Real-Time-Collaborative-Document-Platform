export interface OpID {
  r: string; // Replica ID
  c: number; // Counter
}

export enum OpType {
  Insert = 0,
  Delete = 1,
}

export interface Operation {
  id: OpID;
  type: OpType;
  parent: OpID;
  char?: number | string; // rune in Go or char
  target?: OpID;
  ts: number; // Lamport timestamp
}

export interface RGANode {
  id: OpID;
  char: string;
  deleted: boolean;
  ts: number;
  next?: RGANode;
  prev?: RGANode;
}

export interface SerializedElement {
  id: OpID;
  ch: number;
  del?: boolean;
  ts: number;
}

export interface SerializedRGA {
  elements: SerializedElement[];
  op_count: number;
}

export function isZeroID(id: OpID): boolean {
  return (!id.r || id.r === "") && (!id.c || id.c === 0);
}

export function opIDEqual(a: OpID, b: OpID): boolean {
  return a.r === b.r && a.c === b.c;
}

export function opIDKey(id: OpID): string {
  return `${id.r}:${id.c}`;
}

export function opIDLess(a: OpID, b: OpID, aTs: number, bTs: number): boolean {
  if (aTs !== bTs) {
    return aTs < bTs;
  }
  return a.r < b.r;
}

export class RGA {
  public replicaId: string;
  private head: RGANode; // Sentinel
  private elements: Map<string, RGANode>;
  private opCounter: number = 0;
  private lamportClock: number = 0;
  private totalOpCount: number = 0;

  constructor(replicaId: string) {
    this.replicaId = replicaId;
    this.head = {
      id: { r: "", c: 0 },
      char: "",
      deleted: false,
      ts: 0,
    };
    this.elements = new Map();
    this.elements.set(opIDKey(this.head.id), this.head);
  }

  public getClock(): number {
    return this.lamportClock;
  }

  public updateClock(receivedTs: number) {
    this.lamportClock = Math.max(this.lamportClock, receivedTs) + 1;
  }

  public nextClock(): number {
    this.lamportClock++;
    return this.lamportClock;
  }

  public nextCounter(): number {
    this.opCounter++;
    return this.opCounter;
  }

  public getOpCount(): number {
    return this.totalOpCount;
  }

  public getHeadID(): OpID {
    return this.head.id;
  }

  /**
   * Apply an operation (from local or remote).
   * Returns true if applied, false if duplicate.
   */
  public apply(op: Operation): boolean {
    this.updateClock(op.ts);

    if (op.type === OpType.Insert) {
      return this.applyInsert(op);
    } else if (op.type === OpType.Delete) {
      return this.applyDelete(op);
    }
    return false;
  }

  private applyInsert(op: Operation): boolean {
    const key = opIDKey(op.id);
    if (this.elements.has(key)) {
      return false; // Duplicate
    }

    const parentKey = opIDKey(op.parent);
    const parent = this.elements.get(parentKey);
    if (!parent) {
      console.warn("Parent element not found for insert:", op.parent);
      return false;
    }

    let charStr = "";
    if (typeof op.char === "number") {
      charStr = String.fromCodePoint(op.char);
    } else if (typeof op.char === "string") {
      charStr = op.char;
    }

    const newNode: RGANode = {
      id: op.id,
      char: charStr,
      deleted: false,
      ts: op.ts,
    };

    let cursor = parent.next;
    while (cursor) {
      if (!this.isDescendantOf(cursor, parent)) {
        break;
      }
      if (opIDLess(op.id, cursor.id, op.ts, cursor.ts)) {
        break;
      }
      cursor = cursor.next;
    }

    if (cursor) {
      newNode.next = cursor;
      newNode.prev = cursor.prev;
      if (cursor.prev) {
        cursor.prev.next = newNode;
      }
      cursor.prev = newNode;
    } else {
      let last: RGANode = parent;
      while (last.next) {
        last = last.next;
      }
      last.next = newNode;
      newNode.prev = last;
    }

    this.elements.set(key, newNode);
    this.totalOpCount++;
    return true;
  }

  private isDescendantOf(elem: RGANode, parent: RGANode): boolean {
    return elem.ts >= parent.ts;
  }

  private applyDelete(op: Operation): boolean {
    if (!op.target) return false;
    const key = opIDKey(op.target);
    const elem = this.elements.get(key);
    if (!elem) {
      return false;
    }
    if (elem.deleted) {
      return false; // Idempotent
    }
    elem.deleted = true;
    this.totalOpCount++;
    return true;
  }

  /**
   * Generates a local insert operation at visible position `index` (0-indexed).
   */
  public createLocalInsert(index: number, char: string): Operation {
    const parentId = this.elementIDAtVisibleIndex(index - 1);
    const ts = this.nextClock();
    const id: OpID = {
      r: this.replicaId,
      c: this.nextCounter(),
    };
    const codePoint = char.codePointAt(0) || 0;

    const op: Operation = {
      id,
      type: OpType.Insert,
      parent: parentId,
      char: codePoint,
      ts,
    };

    this.apply(op);
    return op;
  }

  /**
   * Generates a local delete operation at visible position `index` (0-indexed).
   */
  public createLocalDelete(index: number): Operation | null {
    const targetId = this.elementIDAtVisibleIndex(index);
    if (isZeroID(targetId)) {
      return null;
    }
    const ts = this.nextClock();
    const id: OpID = {
      r: this.replicaId,
      c: this.nextCounter(),
    };

    const op: Operation = {
      id,
      type: OpType.Delete,
      parent: { r: "", c: 0 },
      target: targetId,
      ts,
    };

    this.apply(op);
    return op;
  }

  /**
   * Returns current visible (non-deleted) text.
   */
  public getText(): string {
    let result = "";
    let cur = this.head.next;
    while (cur) {
      if (!cur.deleted) {
        result += cur.char;
      }
      cur = cur.next;
    }
    return result;
  }

  /**
   * Returns the OpID of the character at visible index.
   * If index < 0 or empty, returns head sentinel ID.
   */
  public elementIDAtVisibleIndex(index: number): OpID {
    if (index < 0) {
      return this.head.id;
    }
    let cur = this.head.next;
    let idx = 0;
    while (cur) {
      if (!cur.deleted) {
        if (idx === index) {
          return cur.id;
        }
        idx++;
      }
      cur = cur.next;
    }
    return this.head.id;
  }

  /**
   * Returns visible index for given OpID, or -1 if not found / deleted.
   */
  public visibleIndexOf(id: OpID): number {
    let cur = this.head.next;
    let idx = 0;
    while (cur) {
      if (opIDEqual(cur.id, id)) {
        return cur.deleted ? -1 : idx;
      }
      if (!cur.deleted) {
        idx++;
      }
      cur = cur.next;
    }
    return -1;
  }

  /**
   * Returns metadata about the internal linked list (nodes, tombstones, stats)
   * for the visual CRDT inspector.
   */
  public getInspectorStats(): {
    totalNodes: number;
    visibleChars: number;
    tombstones: number;
    clock: number;
    opCount: number;
    nodes: Array<{ id: OpID; char: string; deleted: boolean; ts: number }>;
  } {
    let totalNodes = 0;
    let visibleChars = 0;
    let tombstones = 0;
    const nodes: Array<{ id: OpID; char: string; deleted: boolean; ts: number }> = [];

    let cur = this.head.next;
    while (cur) {
      totalNodes++;
      if (cur.deleted) {
        tombstones++;
      } else {
        visibleChars++;
      }
      if (nodes.length < 150) { // Limit for UI performance
        nodes.push({
          id: cur.id,
          char: cur.char,
          deleted: cur.deleted,
          ts: cur.ts,
        });
      }
      cur = cur.next;
    }

    return {
      totalNodes,
      visibleChars,
      tombstones,
      clock: this.lamportClock,
      opCount: this.totalOpCount,
      nodes,
    };
  }

  /**
   * Loads serialized RGA state (as received from server sync_response).
   */
  public loadSerializedState(data: SerializedRGA) {
    this.head = {
      id: { r: "", c: 0 },
      char: "",
      deleted: false,
      ts: 0,
    };
    this.elements.clear();
    this.elements.set(opIDKey(this.head.id), this.head);
    this.totalOpCount = data.op_count || 0;

    let prev = this.head;
    let maxTs = 0;
    let maxCounter = 0;

    if (Array.isArray(data.elements)) {
      for (const el of data.elements) {
        const charStr = String.fromCodePoint(el.ch);
        const node: RGANode = {
          id: el.id,
          char: charStr,
          deleted: !!el.del,
          ts: el.ts,
          prev,
        };
        prev.next = node;
        this.elements.set(opIDKey(el.id), node);
        prev = node;

        if (el.ts > maxTs) maxTs = el.ts;
        if (el.id.r === this.replicaId && el.id.c > maxCounter) {
          maxCounter = el.id.c;
        }
      }
    }

    this.lamportClock = Math.max(this.lamportClock, maxTs);
    this.opCounter = Math.max(this.opCounter, maxCounter);
  }
}
