/**
 * GithubService — manages GitHub repo operations (create, push).
 *
 * Uses the GitHub REST API with a personal access token.
 * Supports both personal repos and org repos (via AES_GITHUB_ORG).
 */
export class GithubService {
    token;
    constructor() {
        const token = process.env.GITHUB_TOKEN || process.env.AES_GITHUB_TOKEN;
        if (!token)
            throw new Error("GITHUB_TOKEN not configured");
        this.token = token;
    }
    /**
     * Create a new GitHub repository.
     */
    async createRepo(name, description, isPrivate = false) {
        const org = process.env.AES_GITHUB_ORG;
        const endpoint = org
            ? `https://api.github.com/orgs/${org}/repos`
            : "https://api.github.com/user/repos";
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.token}`,
                "Content-Type": "application/json",
                Accept: "application/vnd.github+json",
            },
            body: JSON.stringify({
                name,
                description,
                private: isPrivate,
                auto_init: false,
            }),
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`GitHub create repo failed (${response.status}): ${error}`);
        }
        const data = await response.json();
        return {
            full_name: data.full_name,
            clone_url: data.clone_url,
            html_url: data.html_url,
            name: data.name,
            id: data.id,
            owner_login: data.owner?.login,
            owner_id: data.owner?.id,
            default_branch: data.default_branch || "main",
        };
    }
    /**
     * Fetch contents of a directory from a GitHub repo.
     * Returns an array of { path, content } for each file found.
     * Recurses into subdirectories up to maxDepth.
     */
    async fetchDirectoryContents(repo, path, branch = "main", maxDepth = 3) {
        const org = process.env.AES_GITHUB_ORG;
        const fullRepo = org ? `${org}/${repo}` : repo;
        const results = [];
        await this._fetchDirRecursive(fullRepo, path, branch, results, 0, maxDepth);
        return results;
    }
    async _fetchDirRecursive(fullRepo, path, branch, results, depth, maxDepth) {
        if (depth > maxDepth)
            return;
        const endpoint = `https://api.github.com/repos/${fullRepo}/contents/${path}?ref=${branch}`;
        const response = await fetch(endpoint, {
            headers: {
                Authorization: `Bearer ${this.token}`,
                Accept: "application/vnd.github+json",
            },
        });
        if (!response.ok) {
            // Directory may not exist — not fatal
            console.warn(`[github] Failed to fetch ${path} from ${fullRepo}: ${response.status}`);
            return;
        }
        const data = await response.json();
        // If it's a single file (not array), fetch its content
        if (!Array.isArray(data)) {
            if (data.type === "file" && data.content) {
                results.push({
                    path: data.path,
                    content: Buffer.from(data.content, "base64").toString("utf-8"),
                });
            }
            return;
        }
        // It's a directory listing
        for (const entry of data) {
            if (entry.type === "file") {
                // Only fetch source files (ts, tsx, js, jsx, json, yaml, css)
                const ext = entry.name.split(".").pop()?.toLowerCase() || "";
                const sourceExts = ["ts", "tsx", "js", "jsx", "json", "yaml", "yml", "css", "md"];
                if (!sourceExts.includes(ext))
                    continue;
                // Fetch individual file content
                const fileResp = await fetch(entry.url, {
                    headers: {
                        Authorization: `Bearer ${this.token}`,
                        Accept: "application/vnd.github+json",
                    },
                });
                if (fileResp.ok) {
                    const fileData = await fileResp.json();
                    if (fileData.content) {
                        results.push({
                            path: fileData.path,
                            content: Buffer.from(fileData.content, "base64").toString("utf-8"),
                        });
                    }
                }
            }
            else if (entry.type === "dir") {
                // Skip node_modules, dist, .next, etc.
                const skipDirs = ["node_modules", "dist", ".next", ".git", "__pycache__", "coverage"];
                if (!skipDirs.includes(entry.name)) {
                    await this._fetchDirRecursive(fullRepo, entry.path, branch, results, depth + 1, maxDepth);
                }
            }
        }
    }
    /**
     * Fetch a single file's content from a GitHub repo.
     */
    async fetchFileContent(repo, path, branch = "main") {
        const org = process.env.AES_GITHUB_ORG;
        const fullRepo = org ? `${org}/${repo}` : repo;
        const endpoint = `https://api.github.com/repos/${fullRepo}/contents/${path}?ref=${branch}`;
        const response = await fetch(endpoint, {
            headers: {
                Authorization: `Bearer ${this.token}`,
                Accept: "application/vnd.github+json",
            },
        });
        if (!response.ok)
            return null;
        const data = await response.json();
        if (data.content) {
            return Buffer.from(data.content, "base64").toString("utf-8");
        }
        return null;
    }
    /**
     * Push a local workspace to a remote GitHub repo.
     *
     * Expects the workspace to already have git initialized with at least
     * one commit. Adds the remote, renames the branch, and pushes.
     */
    async pushWorkspace(workspacePath, remoteUrl, branch = "main") {
        const { execSync } = await import("child_process");
        // Configure git with token for auth
        const authedUrl = remoteUrl.replace("https://", `https://x-access-token:${this.token}@`);
        // Check if 'origin' remote already exists and remove it
        try {
            execSync("git remote get-url origin", {
                cwd: workspacePath,
                stdio: "pipe",
            });
            execSync("git remote remove origin", {
                cwd: workspacePath,
                stdio: "pipe",
            });
        }
        catch {
            // No existing origin — that's fine
        }
        execSync(`git remote add origin ${authedUrl}`, {
            cwd: workspacePath,
            stdio: "pipe",
        });
        execSync(`git branch -M ${branch}`, {
            cwd: workspacePath,
            stdio: "pipe",
        });
        execSync(`git push -u origin ${branch}`, {
            cwd: workspacePath,
            stdio: "pipe",
        });
    }
}
export function isGithubConfigured() {
    return !!(process.env.GITHUB_TOKEN || process.env.AES_GITHUB_TOKEN);
}
