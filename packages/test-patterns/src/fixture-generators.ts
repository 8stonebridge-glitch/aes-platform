/**
 * Generate a fixture user object.
 */
export interface FixtureUser {
  id: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "member" | "viewer";
  orgId: string;
}

let _userCounter = 0;

export function generateUser(overrides: Partial<FixtureUser> = {}): FixtureUser {
  _userCounter++;
  return {
    id: `user_${_userCounter}`,
    name: `Test User ${_userCounter}`,
    email: `user${_userCounter}@test.aes.dev`,
    role: "member",
    orgId: "org_default",
    ...overrides,
  };
}

/**
 * Generate a fixture organization object.
 */
export interface FixtureOrg {
  id: string;
  name: string;
  slug: string;
  plan: "free" | "pro" | "enterprise";
}

let _orgCounter = 0;

export function generateOrg(overrides: Partial<FixtureOrg> = {}): FixtureOrg {
  _orgCounter++;
  return {
    id: `org_${_orgCounter}`,
    name: `Test Org ${_orgCounter}`,
    slug: `test-org-${_orgCounter}`,
    plan: "free",
    ...overrides,
  };
}

/**
 * Generate a batch of fixture records.
 */
export function generateBatch<T>(
  generator: (overrides?: Partial<T>) => T,
  count: number,
  overrides?: Partial<T>
): T[] {
  return Array.from({ length: count }, () => generator(overrides));
}

/**
 * Reset fixture counters (call between test suites).
 */
export function resetFixtureCounters(): void {
  _userCounter = 0;
  _orgCounter = 0;
}
