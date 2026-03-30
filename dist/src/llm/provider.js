import { ChatOpenAI } from "@langchain/openai";
let _model = null;
let _cachedApiKey = null;
export function getLLM() {
    // If no API key configured, return null (signals fallback to keyword/template)
    const apiKey = process.env.OPENAI_API_KEY || process.env.AES_OPENAI_API_KEY;
    if (!apiKey)
        return null;
    // Refresh singleton if the API key changed at runtime
    if (_model && _cachedApiKey !== apiKey) {
        _model = null;
    }
    if (!_model) {
        _cachedApiKey = apiKey;
        _model = new ChatOpenAI({
            modelName: process.env.AES_LLM_MODEL || "gpt-4o",
            temperature: 0.1, // Low temperature for deterministic structured output
            apiKey,
            maxConcurrency: 10,
        });
    }
    return _model;
}
export function isLLMAvailable() {
    return getLLM() !== null;
}
/** Reset the cached model instance — used in tests */
export function resetLLM() {
    _model = null;
    _cachedApiKey = null;
}
// ─── Concurrency semaphore ──────────────────────────────────────────
const MAX_CONCURRENT_LLM_CALLS = 10;
let _activeCallCount = 0;
const _waitQueue = [];
const _slotHolders = new Map();
let _nextSlotId = 1;
let _totalAcquired = 0;
let _totalReleased = 0;
let _totalTimedOut = 0;
const SLOT_ACQUIRE_TIMEOUT_MS = 60_000; // max wait to acquire a slot
const LLM_CALL_TIMEOUT_MS = 45_000; // max time for any LLM call
export async function acquireLLMSlot(label = "unknown") {
    if (_activeCallCount < MAX_CONCURRENT_LLM_CALLS) {
        _activeCallCount++;
        _totalAcquired++;
        const id = _nextSlotId++;
        _slotHolders.set(id, { acquiredAt: Date.now(), label });
        return id;
    }
    // Wait until a slot opens, with timeout
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            // Remove from queue on timeout
            const idx = _waitQueue.findIndex((w) => w.resolve === doResolve);
            if (idx !== -1)
                _waitQueue.splice(idx, 1);
            _totalTimedOut++;
            reject(new Error(`LLM slot acquire timeout after ${SLOT_ACQUIRE_TIMEOUT_MS}ms (active: ${_activeCallCount}, queued: ${_waitQueue.length})`));
        }, SLOT_ACQUIRE_TIMEOUT_MS);
        const doResolve = () => {
            clearTimeout(timer);
            _activeCallCount++;
            _totalAcquired++;
            const id = _nextSlotId++;
            _slotHolders.set(id, { acquiredAt: Date.now(), label });
            resolve(id);
        };
        _waitQueue.push({ resolve: doResolve, enqueuedAt: Date.now() });
    });
}
export function releaseLLMSlot(slotId) {
    _activeCallCount = Math.max(0, _activeCallCount - 1);
    _totalReleased++;
    if (slotId !== undefined)
        _slotHolders.delete(slotId);
    if (_waitQueue.length > 0) {
        const next = _waitQueue.shift();
        next.resolve();
    }
}
/** Race a promise against a timeout; resolves to null on timeout. */
export function withLLMTimeout(promise, ms = LLM_CALL_TIMEOUT_MS) {
    return Promise.race([
        promise,
        new Promise((resolve) => setTimeout(() => resolve(null), ms)),
    ]);
}
/**
 * Safe LLM call wrapper — acquires semaphore slot, enforces timeout,
 * guarantees release in finally block. Use this for ALL pipeline LLM calls.
 */
export async function safeLLMCall(label, fn, timeoutMs = LLM_CALL_TIMEOUT_MS) {
    const slotId = await acquireLLMSlot(label);
    try {
        const result = await withLLMTimeout(fn(), timeoutMs);
        return result;
    }
    catch (err) {
        console.error(`[LLM] ${label} failed: ${err?.message || err}`);
        return null;
    }
    finally {
        releaseLLMSlot(slotId);
    }
}
/** Observability snapshot for the LLM semaphore */
export function getLLMSemaphoreStats() {
    const now = Date.now();
    const holders = [..._slotHolders.entries()].map(([id, h]) => ({
        slotId: id,
        label: h.label,
        heldMs: now - h.acquiredAt,
    }));
    const oldestHolder = holders.length > 0
        ? holders.reduce((a, b) => (a.heldMs > b.heldMs ? a : b))
        : null;
    return {
        maxSlots: MAX_CONCURRENT_LLM_CALLS,
        activeSlots: _activeCallCount,
        queueLength: _waitQueue.length,
        totalAcquired: _totalAcquired,
        totalReleased: _totalReleased,
        totalTimedOut: _totalTimedOut,
        slotLeakDetected: _totalAcquired - _totalReleased - _activeCallCount !== 0,
        holders,
        oldestHolder,
    };
}
/** Force-release all slots — emergency recovery only */
export function resetLLMSemaphore() {
    _activeCallCount = 0;
    _waitQueue.length = 0;
    _slotHolders.clear();
    _totalTimedOut = 0;
}
