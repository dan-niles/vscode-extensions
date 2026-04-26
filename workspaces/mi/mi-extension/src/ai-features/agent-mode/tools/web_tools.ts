/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { tool, generateText } from 'ai';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { tavily as createTavilyClient } from '@tavily/core';
import { AgentEvent, LoginMethod } from '@wso2/mi-core';
import { logError, logInfo } from '../../copilot/logger';
import { ANTHROPIC_SONNET_4_6, AnthropicModel, getAnthropicProvider, getAnthropicClientForCustomModel } from '../../connection';
import { getLoginMethod, getTavilyApiKey } from '../../auth';
import { PendingPlanApproval } from './plan_mode_tools';
import {
    ToolResult,
    WEB_FETCH_TOOL_NAME,
    WEB_SEARCH_TOOL_NAME,
    WebFetchExecuteFn,
    WebSearchExecuteFn,
} from './types';

type AgentEventHandler = (event: AgentEvent) => void;

type WebApprovalKind = 'web_search' | 'web_fetch';
const MI_DOCS_DOMAIN = 'mi.docs.wso2.com';

function sanitizeDomainList(domains?: string[]): string[] | undefined {
    if (!domains || domains.length === 0) {
        return undefined;
    }

    const sanitized = Array.from(
        new Set(
            domains
                .map((domain) => domain.trim())
                .filter((domain) => domain.length > 0)
        )
    );

    return sanitized.length > 0 ? sanitized : undefined;
}

function extractToolOutput(result: any): unknown {
    try {
        const stepWithToolResults = (result?.steps || []).find((step: any) => Array.isArray(step?.toolResults) && step.toolResults.length > 0);
        if (stepWithToolResults?.toolResults?.[0]) {
            return stepWithToolResults.toolResults[0].output;
        }
    } catch {
        // Ignore extraction issues and fall back to text output.
    }

    return undefined;
}

type BedrockTavilyGate =
    | { isBedrock: false }
    | { isBedrock: true; tavilyKey: string }
    | { isBedrock: true; tavilyKey: null; notConfigured: ToolResult };

/**
 * Returns the resolved Tavily availability for Bedrock auth, or a ready-to-return
 * NOT_CONFIGURED ToolResult that the caller can short-circuit with. For non-Bedrock
 * auth, just signals `isBedrock: false` and the caller proceeds with Anthropic.
 */
async function resolveBedrockTavilyGate(toolKind: 'search' | 'fetch'): Promise<BedrockTavilyGate> {
    const isBedrock = (await getLoginMethod()) === LoginMethod.AWS_BEDROCK;
    if (!isBedrock) {
        return { isBedrock: false };
    }
    const tavilyKey = await getTavilyApiKey();
    if (tavilyKey) {
        return { isBedrock: true, tavilyKey };
    }
    const isSearch = toolKind === 'search';
    return {
        isBedrock: true,
        tavilyKey: null,
        notConfigured: {
            success: false,
            message: `Web ${isSearch ? 'search' : 'fetch'} is not configured. Add a Tavily API key in the AI Panel settings (Web Search section) to enable web ${isSearch ? 'search' : 'fetch'} on AWS Bedrock.`,
            error: isSearch ? 'WEB_SEARCH_NOT_CONFIGURED' : 'WEB_FETCH_NOT_CONFIGURED',
        },
    };
}

/**
 * Format a Tavily search response as a concise markdown summary suitable for the agent.
 * Mirrors the shape (`success/message`) that the Anthropic-backed path returns so
 * downstream code (chat-history persistence, UI rendering) doesn't need to branch.
 *
 * Uses `@tavily/core` directly (the AI SDK wrapper `@tavily/ai-sdk` is ESM-only and
 * doesn't resolve under our CJS webpack config).
 */
async function runTavilySearch(
    apiKey: string,
    params: { query: string; includeDomains?: string[]; excludeDomains?: string[] }
): Promise<ToolResult> {
    try {
        const client = createTavilyClient({ apiKey });
        const response = await client.search(params.query, {
            includeAnswer: true,
            maxResults: 5,
            ...(params.includeDomains ? { includeDomains: params.includeDomains } : {}),
            ...(params.excludeDomains ? { excludeDomains: params.excludeDomains } : {}),
        });

        const lines: string[] = [];
        if (typeof response?.answer === 'string' && response.answer.trim()) {
            lines.push(`Answer: ${response.answer.trim()}`);
        }
        const results = Array.isArray(response?.results) ? response.results : [];
        if (results.length > 0) {
            lines.push('', 'Results:');
            for (const r of results) {
                const title = r?.title || r?.url || 'Untitled';
                const url = r?.url || '';
                const snippet = (r?.content || '').toString().trim();
                lines.push(`- ${title}${url ? ` (${url})` : ''}${snippet ? `\n  ${snippet}` : ''}`);
            }
        }

        const message = lines.length > 0
            ? lines.join('\n')
            : 'Tavily search returned no results.';
        return { success: true, message };
    } catch (error: any) {
        logError('[WebSearchTool] Tavily search failed', error);
        return {
            success: false,
            message: `Web search failed: ${error?.message || String(error)}`,
            error: 'WEB_SEARCH_FAILED',
        };
    }
}

/**
 * Fetch a single URL via Tavily Extract and format the result similarly.
 */
async function runTavilyExtract(apiKey: string, url: string, taskPrompt?: string): Promise<ToolResult> {
    try {
        const client = createTavilyClient({ apiKey });
        const response = await client.extract([url], {
            extractDepth: 'advanced',
            format: 'markdown',
        });

        const failed = Array.isArray(response?.failedResults) ? response.failedResults : [];
        if (failed.length > 0) {
            const detail = failed.map((f) => `${f?.url}: ${f?.error}`).join('; ');
            return {
                success: false,
                message: `Tavily extract failed: ${detail}`,
                error: 'WEB_FETCH_FAILED',
            };
        }

        const results = Array.isArray(response?.results) ? response.results : [];
        const first = results[0];
        if (!first?.rawContent) {
            return {
                success: false,
                message: `Tavily extract returned no content for ${url}.`,
                error: 'WEB_FETCH_EMPTY',
            };
        }

        const header = taskPrompt ? `Task: ${taskPrompt}\nURL: ${url}\n\n` : `URL: ${url}\n\n`;
        return {
            success: true,
            message: `${header}${first.rawContent}`,
        };
    } catch (error: any) {
        logError('[WebFetchTool] Tavily extract failed', error);
        return {
            success: false,
            message: `Web fetch failed: ${error?.message || String(error)}`,
            error: 'WEB_FETCH_FAILED',
        };
    }
}

function getProviderToolFactory(provider: any, candidateNames: string[]): ((args: any) => any) | null {
    for (const candidateName of candidateNames) {
        const factory = provider?.tools?.[candidateName];
        if (typeof factory === 'function') {
            return factory;
        }
    }
    return null;
}

async function requestWebApproval(
    eventHandler: AgentEventHandler,
    pendingApprovals: Map<string, PendingPlanApproval>,
    request: {
        sessionId: string;
        kind: WebApprovalKind;
        approvalTitle: string;
        content: string;
    },
    mainAbortSignal?: AbortSignal
): Promise<boolean> {
    const approvalId = uuidv4();

    eventHandler({
        type: 'plan_approval_requested',
        approvalId,
        approvalKind: request.kind,
        approvalTitle: request.approvalTitle,
        approveLabel: 'Allow',
        rejectLabel: 'Deny',
        allowFeedback: false,
        content: request.content,
    } as any);

    let settled = false;
    const cleanup = (): void => {
        if (settled) return;
        settled = true;
        pendingApprovals.delete(approvalId);
        if (abortHandler && mainAbortSignal) {
            mainAbortSignal.removeEventListener('abort', abortHandler);
        }
    };

    let abortHandler: (() => void) | undefined;

    const approval = await new Promise<{ approved: boolean; feedback?: string }>((resolve, reject) => {
        pendingApprovals.set(approvalId, {
            approvalId,
            approvalKind: request.kind,
            sessionId: request.sessionId,
            resolve: (result) => {
                cleanup();
                resolve(result);
            },
            reject: (error: Error) => {
                cleanup();
                reject(error);
            }
        });

        if (mainAbortSignal) {
            if (mainAbortSignal.aborted) {
                cleanup();
                resolve({ approved: false });
                return;
            }
            abortHandler = () => {
                cleanup();
                resolve({ approved: false });
            };
            mainAbortSignal.addEventListener('abort', abortHandler, { once: true });
        }
    });

    return approval.approved;
}

/**
 * Creates execute function for web_search tool.
 * Requires explicit user consent before any outbound web search.
 */
export function createWebSearchExecute(
    getAnthropicClient: (model: AnthropicModel) => Promise<any>,
    eventHandler: AgentEventHandler,
    pendingApprovals: Map<string, PendingPlanApproval>,
    webAccessPreapproved: boolean,
    sessionId: string,
    mainModelId?: string,
    mainModelIsCustom?: boolean,
    mainAbortSignal?: AbortSignal
): WebSearchExecuteFn {
    return async (args): Promise<ToolResult> => {
        const allowedDomains = sanitizeDomainList(args.allowed_domains);
        const blockedDomains = sanitizeDomainList(args.blocked_domains);

        // Bedrock has no first-party web tools — bail before bothering the user
        // with an approval modal we can't honor.
        const gate = await resolveBedrockTavilyGate('search');
        if (gate.isBedrock && gate.tavilyKey === null) {
            return gate.notConfigured;
        }

        let approved = true;
        if (!webAccessPreapproved) {
            approved = await requestWebApproval(eventHandler, pendingApprovals, {
                sessionId,
                kind: 'web_search',
                approvalTitle: 'Allow Web Search?',
                content: `Agent wants to search the web for: "${args.query}"`,
            }, mainAbortSignal);
        }

        if (!approved) {
            return {
                success: false,
                message: 'User denied permission to perform web search.',
                error: 'WEB_SEARCH_DENIED',
            };
        }

        try {
            logInfo(`[WebSearchTool] Running query: ${args.query} (provider=${gate.isBedrock ? 'tavily' : 'anthropic'})`);

            if (gate.isBedrock) {
                return await runTavilySearch(gate.tavilyKey, {
                    query: args.query,
                    includeDomains: allowedDomains,
                    excludeDomains: blockedDomains,
                });
            }

            const anthropicProvider = await getAnthropicProvider();
            const searchFactory = getProviderToolFactory(anthropicProvider as any, ['webSearch_20250305']);

            if (!searchFactory) {
                throw new Error('Anthropic web search tool is unavailable in this environment.');
            }

            const webSearch = searchFactory({
                maxUses: 5,
                ...(allowedDomains ? { allowedDomains } : {}),
                ...(blockedDomains ? { blockedDomains } : {}),
            });

            const result = await generateText({
                model: mainModelIsCustom && mainModelId
                    ? await getAnthropicClientForCustomModel(mainModelId)
                    : await getAnthropicClient((mainModelId || ANTHROPIC_SONNET_4_6) as AnthropicModel),
                prompt: [
                    `Search query: ${args.query}`,
                    'Use the web_search tool and return concise findings with relevant source links.'
                ].join('\n'),
                tools: {
                    web_search: webSearch,
                },
                abortSignal: mainAbortSignal,
            });

            const toolOutput = extractToolOutput(result);
            const message = typeof toolOutput === 'string'
                ? toolOutput
                : result.text || (toolOutput ? JSON.stringify(toolOutput, null, 2) : 'Web search completed successfully.');

            return {
                success: true,
                message,
            };
        } catch (error: any) {
            logError('[WebSearchTool] Web search failed', error);
            const errorMessage = error?.message || String(error);

            if (errorMessage.includes('responses API is unavailable')) {
                return {
                    success: false,
                    message: 'Web search failed: Anthropic responses API is unavailable in this environment. Upgrade @ai-sdk/anthropic to use web_search and web_fetch tools.',
                    error: 'WEB_SEARCH_API_UNAVAILABLE',
                };
            }

            return {
                success: false,
                message: `Web search failed: ${errorMessage}`,
                error: 'WEB_SEARCH_FAILED',
            };
        }
    };
}

/**
 * Creates execute function for web_fetch tool.
 * Requires explicit user consent before fetching remote content.
 */
export function createWebFetchExecute(
    getAnthropicClient: (model: AnthropicModel) => Promise<any>,
    eventHandler: AgentEventHandler,
    pendingApprovals: Map<string, PendingPlanApproval>,
    webAccessPreapproved: boolean,
    sessionId: string,
    mainModelId?: string,
    mainModelIsCustom?: boolean,
    mainAbortSignal?: AbortSignal
): WebFetchExecuteFn {
    return async (args): Promise<ToolResult> => {
        try {
            const hostname = new URL(args.url).hostname.toLowerCase();
            if (hostname === MI_DOCS_DOMAIN || hostname.endsWith(`.${MI_DOCS_DOMAIN}`)) {
                return {
                    success: false,
                    message: 'Web fetch does not support JavaScript-rendered websites. MI docs (https://mi.docs.wso2.com/en/{version}/) is JS-rendered. Use web_search with allowed_domains=["mi.docs.wso2.com"] instead.',
                    error: 'WEB_FETCH_JS_RENDERED_UNSUPPORTED',
                };
            }
        } catch {
            // URL validity is already enforced by the tool input schema.
        }

        const allowedDomains = sanitizeDomainList(args.allowed_domains);
        const blockedDomains = sanitizeDomainList(args.blocked_domains);

        const gate = await resolveBedrockTavilyGate('fetch');
        if (gate.isBedrock && gate.tavilyKey === null) {
            return gate.notConfigured;
        }

        let approved = true;
        if (!webAccessPreapproved) {
            approved = await requestWebApproval(eventHandler, pendingApprovals, {
                sessionId,
                kind: 'web_fetch',
                approvalTitle: 'Allow Web Fetch?',
                content: `Agent wants to fetch content from: ${args.url}`,
            }, mainAbortSignal);
        }

        if (!approved) {
            return {
                success: false,
                message: 'User denied permission to fetch web content.',
                error: 'WEB_FETCH_DENIED',
            };
        }

        if (gate.isBedrock) {
            logInfo(`[WebFetchTool] Tavily extract: ${args.url}`);
            return await runTavilyExtract(gate.tavilyKey, args.url, args.prompt);
        }

        try {
            logInfo(`[WebFetchTool] Fetching URL: ${args.url}`);
            const anthropicProvider = await getAnthropicProvider();
            const fetchFactory = getProviderToolFactory(anthropicProvider as any, ['webFetch_20250910', 'webFetch_20250305']);

            if (!fetchFactory) {
                throw new Error('Anthropic web fetch tool is unavailable in this environment.');
            }

            const webFetch = fetchFactory({
                maxUses: 3,
                ...(allowedDomains ? { allowedDomains } : {}),
                ...(blockedDomains ? { blockedDomains } : {}),
            });

            const result = await generateText({
                model: mainModelIsCustom && mainModelId
                    ? await getAnthropicClientForCustomModel(mainModelId)
                    : await getAnthropicClient((mainModelId || ANTHROPIC_SONNET_4_6) as AnthropicModel),
                prompt: [
                    `URL: ${args.url}`,
                    `Task: ${args.prompt}`,
                    'Use the web_fetch tool to retrieve and analyze this page.'
                ].join('\n'),
                tools: {
                    web_fetch: webFetch,
                },
                abortSignal: mainAbortSignal,
            });

            const toolOutput = extractToolOutput(result);
            const message = typeof toolOutput === 'string'
                ? toolOutput
                : result.text || (toolOutput ? JSON.stringify(toolOutput, null, 2) : 'Web fetch completed successfully.');

            return {
                success: true,
                message,
            };
        } catch (error: any) {
            logError('[WebFetchTool] Web fetch failed', error);
            const errorMessage = error?.message || String(error);

            if (errorMessage.includes('responses API is unavailable')) {
                return {
                    success: false,
                    message: 'Web fetch failed: Anthropic responses API is unavailable in this environment. Upgrade @ai-sdk/anthropic to use web_search and web_fetch tools.',
                    error: 'WEB_FETCH_API_UNAVAILABLE',
                };
            }

            return {
                success: false,
                message: `Web fetch failed: ${errorMessage}`,
                error: 'WEB_FETCH_FAILED',
            };
        }
    };
}

const webSearchSchema = z.object({
    query: z.string().min(2).describe('The web search query to run.'),
    allowed_domains: z.array(z.string()).optional().describe('Optional allow-list of domains to include in search results (for MI docs, use ["mi.docs.wso2.com"]).'),
    blocked_domains: z.array(z.string()).optional().describe('Optional block-list of domains to exclude from search results.'),
});

export function createWebSearchTool(execute: WebSearchExecuteFn) {
    return (tool as any)({
        description: 'Search the web for up-to-date information when local project context is insufficient. Supports domain allow/block filters. For MI docs, use allowed_domains=["mi.docs.wso2.com"]. Requires user consent before execution; if denied, continue without web access.',
        inputSchema: webSearchSchema,
        execute,
    });
}

const webFetchSchema = z.object({
    url: z.string().url().describe('The URL to fetch and analyze.'),
    prompt: z.string().min(3).describe('What to extract or analyze from the fetched page.'),
    allowed_domains: z.array(z.string()).optional().describe('Optional allow-list of domains that fetch requests can access.'),
    blocked_domains: z.array(z.string()).optional().describe('Optional block-list of domains that fetch requests must avoid.'),
});

export function createWebFetchTool(execute: WebFetchExecuteFn) {
    return (tool as any)({
        description: 'Fetch and analyze content from a specific URL. Supports domain allow/block filters. web_fetch does not support JavaScript-rendered pages (including MI docs), so use web_search with allowed_domains=["mi.docs.wso2.com"] for MI docs. Requires user consent before execution; if denied, continue without web access.',
        inputSchema: webFetchSchema,
        execute,
    });
}
