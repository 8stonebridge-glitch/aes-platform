/**
 * GithubService — manages GitHub repo operations (create, push).
 *
 * Uses the GitHub REST API with a personal access token.
 * Supports both personal repos and org repos (via AES_GITHUB_ORG).
 */

export class GithubService {
  private token: string;

  constructor() {
    const token = process.env.GITHUB_TOKEN || process.env.AES_GITHUB_TOKEN;
    if (!token) throw new Error("GITHUB_TOKEN not configured");
    this.token = token;
  }

  /**
   * Create a new GitHub repository.
   */
  async createRepo(
    name: string,
    description: string,
    isPrivate: boolean = false,
  ): Promise<{ full_name: string; clone_url: string; html_url: string }> {
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
      throw new Error(
        `GitHub create repo failed (${response.status}): ${error}`,
      );
    }

    const data = await response.json();
    return {
      full_name: data.full_name,
      clone_url: data.clone_url,
      html_url: data.html_url,
    };
  }

  /**
   * Push a local workspace to a remote GitHub repo.
   *
   * Expects the workspace to already have git initialized with at least
   * one commit. Adds the remote, renames the branch, and pushes.
   */
  async pushWorkspace(
    workspacePath: string,
    remoteUrl: string,
    branch: string = "main",
  ): Promise<void> {
    const { execSync } = await import("child_process");

    // Configure git with token for auth
    const authedUrl = remoteUrl.replace(
      "https://",
      `https://x-access-token:${this.token}@`,
    );

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
    } catch {
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

export function isGithubConfigured(): boolean {
  return !!(process.env.GITHUB_TOKEN || process.env.AES_GITHUB_TOKEN);
}
