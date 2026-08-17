/**
 * In-memory Firestore stand-in for H-007 wallet transaction tests.
 * Serializes runTransaction like contended document writes.
 * Teklifbul Rule v1.0
 */

type DocData = Record<string, unknown>;

export class FakeDocSnapshot {
  constructor(
    public readonly id: string,
    private readonly _data: DocData | undefined,
    public readonly ref?: FakeDocRef
  ) {}

  get exists(): boolean {
    return this._data !== undefined;
  }

  data(): DocData | undefined {
    return this._data ? { ...this._data } : undefined;
  }
}

export class FakeDocRef {
  constructor(
    private readonly db: FakeFirestore,
    public readonly path: string
  ) {}

  get id(): string {
    const parts = this.path.split('/');
    return parts[parts.length - 1] || '';
  }

  collection(name: string): FakeCollection {
    return new FakeCollection(this.db, `${this.path}/${name}`);
  }

  snapshot(): FakeDocSnapshot {
    return new FakeDocSnapshot(this.id, this.db.read(this.path), this);
  }

  async get(): Promise<FakeDocSnapshot> {
    return this.snapshot();
  }

  applySet(data: DocData, opts?: { merge?: boolean }) {
    const prev = this.db.read(this.path) || {};
    const next = opts?.merge ? { ...prev, ...data } : { ...data };
    this.db.write(this.path, next);
  }

  async set(data: DocData, opts?: { merge?: boolean }) {
    this.applySet(data, opts);
  }

  async update(data: DocData) {
    this.applySet(data, { merge: true });
  }
}

export class FakeCollection {
  constructor(
    private readonly db: FakeFirestore,
    public readonly path: string
  ) {}

  doc(id?: string): FakeDocRef {
    const docId = id && String(id).trim() ? String(id) : this.db.nextId();
    return new FakeDocRef(this.db, `${this.path}/${docId}`);
  }

  async get(): Promise<{
    empty: boolean;
    size: number;
    docs: FakeDocSnapshot[];
    forEach: (cb: (doc: FakeDocSnapshot) => void) => void;
  }> {
    const docs = this.db.listChildren(this.path).map((child) => child.snapshot());
    return {
      empty: docs.length === 0,
      size: docs.length,
      docs,
      forEach: (cb) => docs.forEach(cb),
    };
  }

  where(field: string, op: string, value: unknown): FakeQuery {
    return new FakeQuery(this.db, this.path, [{ field, op, value }]);
  }

  limit(n: number): FakeQuery {
    return new FakeQuery(this.db, this.path, [], n);
  }
}

type FakeFilter = { field: string; op: string; value: unknown };

type FakeOrder = { field: string; dir: 'asc' | 'desc' };

export class FakeQuery {
  constructor(
    private readonly db: FakeFirestore,
    private readonly collectionPathOrGroup: string,
    private readonly filters: FakeFilter[] = [],
    private readonly _limit: number = 500,
    private readonly isGroup = false,
    private readonly orders: FakeOrder[] = [],
    private readonly cursor: FakeDocSnapshot | null = null
  ) {}

  where(field: string, op: string, value: unknown): FakeQuery {
    return new FakeQuery(
      this.db,
      this.collectionPathOrGroup,
      [...this.filters, { field, op, value }],
      this._limit,
      this.isGroup,
      this.orders,
      this.cursor
    );
  }

  orderBy(field: string, dir: 'asc' | 'desc' = 'asc'): FakeQuery {
    return new FakeQuery(
      this.db,
      this.collectionPathOrGroup,
      this.filters,
      this._limit,
      this.isGroup,
      [...this.orders, { field, dir }],
      this.cursor
    );
  }

  limit(n: number): FakeQuery {
    return new FakeQuery(
      this.db,
      this.collectionPathOrGroup,
      this.filters,
      n,
      this.isGroup,
      this.orders,
      this.cursor
    );
  }

  startAfter(doc: FakeDocSnapshot): FakeQuery {
    return new FakeQuery(
      this.db,
      this.collectionPathOrGroup,
      this.filters,
      this._limit,
      this.isGroup,
      this.orders,
      doc
    );
  }

  async get(): Promise<{
    empty: boolean;
    size: number;
    docs: FakeDocSnapshot[];
    forEach: (cb: (doc: FakeDocSnapshot) => void) => void;
  }> {
    const refs = this.isGroup
      ? this.db.listCollectionGroup(this.collectionPathOrGroup)
      : this.db.listChildren(this.collectionPathOrGroup);
    const matched = refs.filter((ref) => {
      const data = ref.snapshot().data() || {};
      return this.filters.every((f) => {
        if (f.op === '==') return data[f.field] === f.value;
        return true;
      });
    });
    const ordered = [...matched].sort((a, b) => {
      for (const order of this.orders) {
        const av = Number((a.snapshot().data() || {})[order.field] || 0);
        const bv = Number((b.snapshot().data() || {})[order.field] || 0);
        if (av !== bv) return order.dir === 'desc' ? bv - av : av - bv;
      }
      if (a.id === b.id) return 0;
      return a.id < b.id ? -1 : 1;
    });
    const afterCursor = this.cursor
      ? ordered.filter((ref) => this.isAfterCursor(ref))
      : ordered;
    const docs = afterCursor.slice(0, this._limit).map((ref) => ref.snapshot());
    return {
      empty: docs.length === 0,
      size: docs.length,
      docs,
      forEach: (cb) => docs.forEach(cb),
    };
  }

  private isAfterCursor(ref: FakeDocRef): boolean {
    if (!this.cursor) return true;
    const cursorData = this.cursor.data() || {};
    const data = ref.snapshot().data() || {};
    for (const order of this.orders) {
      const cv = Number(cursorData[order.field] || 0);
      const rv = Number(data[order.field] || 0);
      if (rv === cv) continue;
      return order.dir === 'desc' ? rv < cv : rv > cv;
    }
    return ref.id > this.cursor.id;
  }
}

export type FakeTransaction = {
  get: (ref: FakeDocRef) => Promise<FakeDocSnapshot>;
  set: (ref: FakeDocRef, data: DocData, opts?: { merge?: boolean }) => void;
  update: (ref: FakeDocRef, data: DocData) => void;
};

export class FakeFirestore {
  private store = new Map<string, DocData>();
  private seq = 0;
  private chain: Promise<unknown> = Promise.resolve();
  failNextCapturePendingRead = false;

  nextId(): string {
    this.seq += 1;
    return `auto_${this.seq}`;
  }

  read(path: string): DocData | undefined {
    const data = this.store.get(path);
    return data ? { ...data } : undefined;
  }

  write(path: string, data: DocData) {
    this.store.set(path, { ...data });
  }

  listChildren(collectionPath: string): FakeDocRef[] {
    const prefix = `${collectionPath}/`;
    const refs: FakeDocRef[] = [];
    for (const path of this.store.keys()) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      if (rest && !rest.includes('/')) {
        refs.push(new FakeDocRef(this, path));
      }
    }
    return refs;
  }

  listCollectionGroup(collectionId: string): FakeDocRef[] {
    const refs: FakeDocRef[] = [];
    for (const path of this.store.keys()) {
      const parts = path.split('/');
      if (parts.length >= 2 && parts[parts.length - 2] === collectionId) {
        refs.push(new FakeDocRef(this, path));
      }
    }
    return refs;
  }

  collection(name: string): FakeCollection {
    return new FakeCollection(this, name);
  }

  collectionGroup(collectionId: string): FakeQuery {
    return new FakeQuery(this, collectionId, [], 500, true);
  }

  async runTransaction<T>(fn: (tx: FakeTransaction) => Promise<T>): Promise<T> {
    const run = this.chain.then(
      () => this.execTx(fn),
      () => this.execTx(fn)
    );
    this.chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private async execTx<T>(fn: (tx: FakeTransaction) => Promise<T>): Promise<T> {
    const writes: Array<() => void> = [];
    const tx: FakeTransaction = {
      get: async (ref: FakeDocRef) => {
        const snap = ref.snapshot();
        const data = snap.data() || {};
        if (
          this.failNextCapturePendingRead &&
          data.billingStatus === 'capture_pending' &&
          data.status === 'reserved'
        ) {
          this.failNextCapturePendingRead = false;
          throw new Error('simulated capture failure');
        }
        return snap;
      },
      set: (ref, data, opts) => {
        writes.push(() => ref.applySet(data, opts));
      },
      update: (ref, data) => {
        writes.push(() => ref.applySet(data, { merge: true }));
      },
    };
    const result = await fn(tx);
    for (const write of writes) write();
    return result;
  }
}

export function walletPath(companyId: string, providerKey: string): string {
  return `companies/${companyId}/aiWallets/${providerKey}`;
}

export function holdPath(companyId: string, holdId: string): string {
  return `companies/${companyId}/aiTokenHolds/${holdId}`;
}

export function seedProviderWallet(
  db: FakeFirestore,
  companyId: string,
  providerKey: string,
  fields: { balanceTokens: number; reservedTokens?: number }
) {
  const data: DocData = {
    provider: providerKey,
    balanceTokens: fields.balanceTokens,
  };
  if (fields.reservedTokens !== undefined) {
    data.reservedTokens = fields.reservedTokens;
  }
  db.write(walletPath(companyId, providerKey), data);
}
