/**
 * Convex test utilities for creating isolated test environments.
 */

export interface ConvexTestContext {
  orgId: string;
  userId: string;
  sessionId: string;
}

/**
 * Create a test context with isolated IDs.
 */
export function createTestContext(overrides: Partial<ConvexTestContext> = {}): ConvexTestContext {
  const id = Math.random().toString(36).slice(2, 8);
  return {
    orgId: `test_org_${id}`,
    userId: `test_user_${id}`,
    sessionId: `test_session_${id}`,
    ...overrides,
  };
}

/**
 * Create a mock Convex mutation context for unit testing mutations.
 */
export interface MockMutationCtx {
  db: {
    insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
    get: (id: string) => Promise<Record<string, unknown> | null>;
    patch: (id: string, fields: Record<string, unknown>) => Promise<void>;
    delete: (id: string) => Promise<void>;
  };
  auth: {
    getUserIdentity: () => Promise<{ subject: string; tokenIdentifier: string } | null>;
  };
}

export function createMockMutationCtx(
  identity?: { subject: string; tokenIdentifier: string }
): MockMutationCtx {
  const store = new Map<string, Record<string, unknown>>();

  return {
    db: {
      async insert(table: string, doc: Record<string, unknown>): Promise<string> {
        const id = `${table}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        store.set(id, { _id: id, ...doc });
        return id;
      },
      async get(id: string): Promise<Record<string, unknown> | null> {
        return store.get(id) ?? null;
      },
      async patch(id: string, fields: Record<string, unknown>): Promise<void> {
        const existing = store.get(id);
        if (!existing) throw new Error(`Document ${id} not found`);
        store.set(id, { ...existing, ...fields });
      },
      async delete(id: string): Promise<void> {
        store.delete(id);
      },
    },
    auth: {
      async getUserIdentity() {
        return identity ?? null;
      },
    },
  };
}

/**
 * Create a mock Convex query context for unit testing queries.
 */
export interface MockQueryCtx {
  db: {
    get: (id: string) => Promise<Record<string, unknown> | null>;
    query: (table: string) => {
      filter: (fn: (q: unknown) => unknown) => { collect: () => Promise<Record<string, unknown>[]> };
      collect: () => Promise<Record<string, unknown>[]>;
    };
  };
  auth: {
    getUserIdentity: () => Promise<{ subject: string; tokenIdentifier: string } | null>;
  };
}

export function createMockQueryCtx(
  data: Record<string, Record<string, unknown>[]> = {},
  identity?: { subject: string; tokenIdentifier: string }
): MockQueryCtx {
  return {
    db: {
      async get(id: string): Promise<Record<string, unknown> | null> {
        for (const rows of Object.values(data)) {
          const found = rows.find((r) => r._id === id);
          if (found) return found;
        }
        return null;
      },
      query(table: string) {
        const rows = data[table] ?? [];
        return {
          filter(_fn: (q: unknown) => unknown) {
            return {
              async collect() {
                return rows;
              },
            };
          },
          async collect() {
            return rows;
          },
        };
      },
    },
    auth: {
      async getUserIdentity() {
        return identity ?? null;
      },
    },
  };
}
