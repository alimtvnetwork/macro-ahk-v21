/**
 * Riseup Macro SDK — API Registry
 *
 * Config-driven endpoint definitions. Each entry defines URL pattern,
 * method, auth requirement, and optional retry/timeout overrides.
 *
 * URL params use `{paramName}` placeholders, resolved at call time.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export interface EndpointConfig {
    readonly url: string;
    readonly method: HttpMethod;
    readonly auth: boolean;
    readonly description: string;
    readonly timeoutMs?: number;
    readonly retries?: number;
}

export interface EndpointGroup {
    readonly [endpointName: string]: EndpointConfig;
}

export interface ApiRegistry {
    readonly [groupName: string]: EndpointGroup;
}

/* ------------------------------------------------------------------ */
/*  Registry                                                           */
/* ------------------------------------------------------------------ */

export const apiRegistry: ApiRegistry = Object.freeze({
    credits: Object.freeze({
        fetchWorkspaces: Object.freeze({
            url: "/user/workspaces",
            method: "GET" as const,
            auth: true,
            description: "Fetch all user workspaces with credit info",
        }),
        fetchBalance: Object.freeze({
            url: "/workspaces/{wsId}/credit-balance",
            method: "GET" as const,
            auth: true,
            description: "Fetch credit balance for a specific workspace",
        }),
        resolve: Object.freeze({
            url: "/workspaces/{wsId}/credit-balance",
            method: "GET" as const,
            auth: true,
            description: "Resolve workspace credit balance with fallback",
        }),
    }),

    workspace: Object.freeze({
        move: Object.freeze({
            url: "/projects/{projectId}/move-to-workspace",
            method: "PUT" as const,
            auth: true,
            description: "Move project to a different workspace",
        }),
        rename: Object.freeze({
            url: "/user/workspaces/{wsId}",
            method: "PUT" as const,
            auth: true,
            description: "Rename a workspace",
        }),
        markViewed: Object.freeze({
            url: "/projects/{projectId}/mark-viewed",
            method: "POST" as const,
            auth: true,
            description: "Mark project as recently viewed (returns workspace_id)",
        }),
        probe: Object.freeze({
            url: "/user/workspaces",
            method: "GET" as const,
            auth: true,
            description: "Probe workspace list for connectivity check",
            timeoutMs: 8_000,
        }),
        resolveByProject: Object.freeze({
            url: "/projects/{projectId}/workspace",
            method: "GET" as const,
            auth: true,
            description: "Resolve workspace for a given project",
        }),
        switchContext: Object.freeze({
            url: "/workspaces/{wsId}/workspace-access-requests",
            method: "GET" as const,
            auth: true,
            description: "Switch active workspace context without moving a project (fallback when no project ID available)",
        }),
    }),
});

/* ------------------------------------------------------------------ */
/*  URL resolver                                                       */
/* ------------------------------------------------------------------ */

export function resolveUrl(
    urlTemplate: string,
    params?: Record<string, string>,
): string {
    if (!params) {
        return urlTemplate;
    }

    let resolved = urlTemplate;

    for (const key of Object.keys(params)) {
        resolved = resolved.replace(`{${key}}`, encodeURIComponent(params[key]));
    }

    return resolved;
}
