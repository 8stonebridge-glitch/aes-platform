import { setMaxListeners } from "node:events";
import { startServer } from "./server.js";
// AES opens many concurrent fetch/LLM requests during builds. Raising the
// process-wide listener ceiling avoids noisy AbortSignal warnings under load.
setMaxListeners(50);
startServer();
