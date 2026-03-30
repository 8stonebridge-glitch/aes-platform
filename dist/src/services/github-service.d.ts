/**
 * GithubService — manages GitHub repo operations (create, push).
 *
 * Uses the GitHub REST API with a personal access token.
 * Supports both personal repos and org repos (via AES_GITHUB_ORG).
 */
export declare class GithubService {
    private token;
    constructor();
    /**
     * Create a new GitHub repository.
     */
    createRepo(name: string, description: string, isPrivate?: boolean): Promise<{
        full_name: string;
        clone_url: string;
        html_url: string;
    }>;
    /**
     * Fetch contents of a directory from a GitHub repo.
     * Returns an array of { path, content } for each file found.
     * Recurses into subdirectories up to maxDepth.
     */
    fetchDirectoryContents(repo: string, path: string, branch?: string, maxDepth?: number): Promise<{
        path: string;
        content: string;
    }[]>;
    private _fetchDirRecursive;
    /**
     * Fetch a single file's content from a GitHub repo.
     */
    fetchFileContent(repo: string, path: string, branch?: string): Promise<string | null>;
    /**
     * Push a local workspace to a remote GitHub repo.
     *
     * Expects the workspace to already have git initialized with at least
     * one commit. Adds the remote, renames the branch, and pushes.
     */
    pushWorkspace(workspacePath: string, remoteUrl: string, branch?: string): Promise<void>;
}
export declare function isGithubConfigured(): boolean;
