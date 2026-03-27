/**
 * Create a mock function that records calls and can return preset values.
 */
export interface MockFn<TArgs extends unknown[] = unknown[], TReturn = unknown> {
  (...args: TArgs): TReturn;
  calls: TArgs[];
  callCount: number;
  lastCall: TArgs | undefined;
  reset: () => void;
  mockReturnValue: (value: TReturn) => void;
  mockImplementation: (impl: (...args: TArgs) => TReturn) => void;
}

export function createMock<TArgs extends unknown[] = unknown[], TReturn = unknown>(
  defaultReturn?: TReturn
): MockFn<TArgs, TReturn> {
  let impl: ((...args: TArgs) => TReturn) | null = null;
  let returnValue: TReturn | undefined = defaultReturn;

  const fn = ((...args: TArgs): TReturn => {
    fn.calls.push(args);
    fn.callCount++;
    fn.lastCall = args;
    if (impl) return impl(...args);
    return returnValue as TReturn;
  }) as MockFn<TArgs, TReturn>;

  fn.calls = [];
  fn.callCount = 0;
  fn.lastCall = undefined;

  fn.reset = () => {
    fn.calls = [];
    fn.callCount = 0;
    fn.lastCall = undefined;
  };

  fn.mockReturnValue = (value: TReturn) => {
    returnValue = value;
  };

  fn.mockImplementation = (newImpl: (...args: TArgs) => TReturn) => {
    impl = newImpl;
  };

  return fn;
}

/**
 * Create a mock async function.
 */
export function createAsyncMock<TArgs extends unknown[] = unknown[], TReturn = unknown>(
  defaultReturn?: TReturn
): MockFn<TArgs, Promise<TReturn>> {
  const inner = createMock<TArgs, TReturn>(defaultReturn);
  const asyncFn = (async (...args: TArgs): Promise<TReturn> => {
    return inner(...args);
  }) as unknown as MockFn<TArgs, Promise<TReturn>>;

  asyncFn.calls = inner.calls;
  asyncFn.callCount = inner.callCount;
  asyncFn.lastCall = inner.lastCall;
  asyncFn.reset = inner.reset;
  asyncFn.mockReturnValue = (value: Promise<TReturn>) => {
    value.then((v) => inner.mockReturnValue(v));
  };
  asyncFn.mockImplementation = (impl: (...args: TArgs) => Promise<TReturn>) => {
    inner.mockImplementation((...args: TArgs) => {
      // Store the promise result synchronously for tracking
      const result = impl(...args);
      return result as unknown as TReturn;
    });
  };

  return asyncFn;
}
