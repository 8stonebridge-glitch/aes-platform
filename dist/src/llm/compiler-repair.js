import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getGenerationGroundTruthForPacks } from "./current-api-context.js";
import { getLLM, isLLMAvailable, safeLLMCall } from "./provider.js";
import { detectContractPackIdsForFile, } from "../contracts/framework-contract-layer.js";
function stripFences(text) {
    return text
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
}
function extractCandidatePaths(errorOutput) {
    const paths = new Set();
    const add = (value) => {
        const normalized = value
            .replace(/^\/vercel\/path0\//, "")
            .replace(/^\.\//, "")
            .trim();
        if (/\.(?:ts|tsx|js|jsx)$/.test(normalized)) {
            paths.add(normalized);
        }
    };
    const directMatches = errorOutput.matchAll(/(?:^|\n)\.\/([^\n:]+\.(?:ts|tsx|js|jsx))/g);
    for (const match of directMatches) {
        add(match[1]);
    }
    const tscMatches = errorOutput.matchAll(/(?:^|\n)([A-Za-z0-9_./-]+\.(?:ts|tsx|js|jsx))\(\d+,\d+\):/g);
    for (const match of tscMatches) {
        add(match[1]);
    }
    const vercelMatches = errorOutput.matchAll(/\/vercel\/path0\/([^\]:]+\.(?:ts|tsx|js|jsx))/g);
    for (const match of vercelMatches) {
        add(match[1]);
    }
    return Array.from(paths).slice(0, 3);
}
function loadCandidates(workspacePath, paths) {
    return paths.flatMap((relativePath) => {
        try {
            return [{
                    path: relativePath,
                    content: readFileSync(join(workspacePath, relativePath), "utf-8"),
                }];
        }
        catch {
            return [];
        }
    });
}
export async function repairFilesForCompilerErrors(args) {
    if (!isLLMAvailable()) {
        return {
            repaired: false,
            filesChanged: [],
            summary: "LLM unavailable for compiler repair.",
        };
    }
    const candidates = loadCandidates(args.workspacePath, extractCandidatePaths(args.errorOutput));
    if (candidates.length === 0) {
        return {
            repaired: false,
            filesChanged: [],
            summary: "No repairable source files were identified from compiler output.",
        };
    }
    const llm = getLLM();
    if (!llm) {
        return {
            repaired: false,
            filesChanged: [],
            summary: "LLM unavailable for compiler repair.",
        };
    }
    const repairPackIds = Array.from(new Set(candidates.flatMap((candidate) => detectContractPackIdsForFile(candidate.path, candidate.content))));
    const groundTruth = await getGenerationGroundTruthForPacks(repairPackIds);
    const hermesHints = args.hermesHints && args.hermesHints.length > 0
        ? `HERMES REPAIR HINTS:\n${args.hermesHints.map((hint) => `- ${hint}`).join("\n")}`
        : "HERMES REPAIR HINTS:\n- No prior fix available.";
    const system = `${groundTruth}

You repair generated Next.js applications after compile or build failures.
Return strict JSON with this shape only:
{"files":[{"path":"relative/path.tsx","content":"full file content","reason":"short explanation"}]}

Rules:
- Only return files from the provided candidate list.
- Return full file contents, not patches.
- Keep existing behavior unless required to satisfy the compiler/build error.
- Prefer deterministic fixes: add missing imports, add "use client", correct Clerk useAuth() bindings, correct broken JSX/TS syntax, and align with installed APIs.
- Do not invent new dependencies unless the error explicitly requires it.
- If no file change is needed, return {"files":[]}.`;
    const user = `Compiler/build output:
${args.errorOutput}

${hermesHints}

Candidate files:
${candidates.map((candidate) => `FILE: ${candidate.path}\n${candidate.content}`).join("\n\n")}`;
    const response = await safeLLMCall("compiler-repair", () => llm.invoke([
        { role: "system", content: system },
        { role: "user", content: user },
    ]));
    if (!response) {
        return {
            repaired: false,
            filesChanged: [],
            summary: "Compiler repair model did not return a response.",
        };
    }
    const text = typeof response.content === "string"
        ? response.content
        : String(response.content);
    let parsed;
    try {
        parsed = JSON.parse(stripFences(text));
    }
    catch {
        return {
            repaired: false,
            filesChanged: [],
            summary: "Compiler repair model returned invalid JSON.",
        };
    }
    const allowedPaths = new Set(candidates.map((candidate) => candidate.path));
    const changedFiles = [];
    for (const file of parsed.files || []) {
        if (!allowedPaths.has(file.path))
            continue;
        const absolutePath = join(args.workspacePath, file.path);
        const current = readFileSync(absolutePath, "utf-8");
        if (typeof file.content !== "string" || file.content.trim() === current.trim())
            continue;
        writeFileSync(absolutePath, file.content.trimEnd() + "\n");
        changedFiles.push(file.path);
    }
    return {
        repaired: changedFiles.length > 0,
        filesChanged: changedFiles,
        summary: changedFiles.length > 0
            ? `Patched ${changedFiles.length} file(s): ${changedFiles.join(", ")}`
            : "Compiler repair model produced no file changes.",
    };
}
