/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { TraceAnimationEvent, traceAnimationChanged } from '@wso2/ballerina-core';
import { RPCLayer } from '../../RPCLayer';
import { VisualizerWebview } from '../../views/visualizer/webview';
import { Span, TraceServer } from './trace-server';

const FADE_OUT_DELAY_MS = 3000;
const SAFETY_TIMEOUT_MS = 5000;
const EVENT_STAGGER_DELAY_MS = 400;

// Track active spans and their cleanup timers + event info for deactivation
const activeSpans = new Map<string, { timer: NodeJS.Timeout; event: TraceAnimationEvent }>();
let unsubscribe: (() => void) | undefined;

// Dedup: track span IDs already processed to prevent duplicate animations
const processedSpanIds = new Set<string>();

// Unified event queue: ALL event types (chat, tool, invoke_agent) are staggered
// in chronological order so the full LLM → tool → LLM sequence is visible.
const eventQueue: Array<{ event: TraceAnimationEvent; span: Span }> = [];
let eventQueueTimer: NodeJS.Timeout | undefined;
let lastEventActivationTime = 0;

// Track the last chat span so tools can extend its lifetime
let lastChatSpanId: string | undefined;

/**
 * Extract sorted tool names from a chat span's gen_ai.input.tools attribute.
 */
function extractToolNamesFromChatSpan(span: Span): string[] {
    const toolsAttr = span.attributes?.find(a => a.key === 'gen_ai.input.tools');
    if (!toolsAttr?.value) {
        return [];
    }
    try {
        const tools = JSON.parse(toolsAttr.value);
        if (Array.isArray(tools)) {
            return tools
                .map((t: any) => t.function?.name || t.name || '')
                .filter(Boolean)
                .sort();
        }
    } catch {
        // Not valid JSON, ignore
    }
    return [];
}

/**
 * Find parent span's tool names for an execute_tool span.
 * Looks through the trace store for the parent chat span.
 */
function findParentToolNames(span: Span): string[] {
    // Walk up the span hierarchy to find a chat span with tool definitions
    const traces = TraceServer.getTraces();
    for (const trace of traces) {
        if (trace.traceId !== span.traceId) {
            continue;
        }
        // Find the parent span chain
        let current = span;
        while (current.parentSpanId) {
            const parent = trace.spans.find(s => s.spanId === current.parentSpanId);
            if (!parent) {
                break;
            }
            if (parent.name.startsWith('chat')) {
                return extractToolNamesFromChatSpan(parent);
            }
            current = parent;
        }
    }
    return [];
}

/**
 * Determine span type from span name.
 */
function getSpanType(name: string): TraceAnimationEvent['type'] | null {
    if (name.startsWith('invoke_agent')) {
        return 'invoke_agent';
    }
    if (name.startsWith('chat')) {
        return 'chat';
    }
    if (name.startsWith('execute_tool')) {
        return 'execute_tool';
    }
    return null;
}

/**
 * Send a trace animation notification to the visualizer webview.
 */
function sendAnimationEvent(event: TraceAnimationEvent) {
    try {
        console.log(`[TraceAnim] SEND ${event.active ? 'ON' : 'OFF'} type=${event.type} tool=${event.activeToolName ?? '-'} span=${event.spanId.slice(0, 8)} toolNames=[${event.toolNames}]`);
        RPCLayer._messenger.sendNotification(
            traceAnimationChanged,
            { type: 'webview', webviewType: VisualizerWebview.viewType },
            event
        );
    } catch (err) {
        console.error('[TraceAnim] Failed to send notification:', err);
    }
}

/**
 * Schedule deactivation of a span after a delay.
 */
function scheduleDeactivation(spanId: string, event: TraceAnimationEvent, delay = FADE_OUT_DELAY_MS) {
    // Clear any existing timer
    const existing = activeSpans.get(spanId);
    if (existing) {
        clearTimeout(existing.timer);
    }

    const timer = setTimeout(() => {
        activeSpans.delete(spanId);
        if (spanId === lastChatSpanId) {
            lastChatSpanId = undefined;
        }
        sendAnimationEvent({ ...event, active: false });
    }, delay);

    activeSpans.set(spanId, { timer, event });
}

/**
 * Extend the last chat span's deactivation timer.
 * Called when tools start so the chat entry outlives tool execution
 * and the model can re-glow after tools finish.
 */
function extendChatSpanLifetime() {
    if (!lastChatSpanId || !activeSpans.has(lastChatSpanId)) return;
    const { event } = activeSpans.get(lastChatSpanId)!;
    scheduleDeactivation(lastChatSpanId, event, SAFETY_TIMEOUT_MS);
}

/**
 * Deactivate all active tool spans immediately.
 * Called when a new chat span is processed, signaling the LLM is thinking again.
 * Does NOT touch the event queue — future events should still be processed.
 */
function deactivateAllTools() {
    for (const [spanId, { timer, event }] of activeSpans.entries()) {
        if (event.type === 'execute_tool') {
            clearTimeout(timer);
            activeSpans.delete(spanId);
            sendAnimationEvent({ ...event, active: false });
        }
    }
}

/**
 * Process the next event from the unified queue.
 * Handles the full LLM → tool → LLM → tool sequence with proper transitions.
 */
function processNextEvent() {
    eventQueueTimer = undefined;
    if (eventQueue.length === 0) {
        return;
    }

    const { event, span } = eventQueue.shift()!;
    lastEventActivationTime = Date.now();
    console.log(`[TraceAnim] DEQUEUE type=${event.type} tool=${event.activeToolName ?? '-'} span=${span.spanId.slice(0, 8)} remaining=${eventQueue.length}`);

    // Type-specific pre-activation logic
    if (event.type === 'chat') {
        // LLM is thinking again → deactivate any lingering tools
        deactivateAllTools();
        lastChatSpanId = span.spanId;
    } else if (event.type === 'execute_tool') {
        // Tool starting → keep the chat span alive so model re-glows after tools
        extendChatSpanLifetime();
    }

    sendAnimationEvent(event);

    // Schedule deactivation
    if (span.endTime) {
        scheduleDeactivation(span.spanId, event);
    } else {
        scheduleDeactivation(span.spanId, event, SAFETY_TIMEOUT_MS);
    }

    // Process next event after stagger delay
    if (eventQueue.length > 0) {
        eventQueueTimer = setTimeout(processNextEvent, EVENT_STAGGER_DELAY_MS);
    }
}

/**
 * Enqueue an event for staggered processing.
 * Inserts in sorted order by span startTime to maintain chronological order
 * even when OTLP batches arrive out of order.
 */
function enqueueEvent(event: TraceAnimationEvent, span: Span) {
    // Insert in sorted order by startTime
    const spanTime = span.startTime ? new Date(span.startTime).getTime() : Infinity;
    let insertIdx = eventQueue.length;
    for (let i = 0; i < eventQueue.length; i++) {
        const qTime = eventQueue[i].span.startTime
            ? new Date(eventQueue[i].span.startTime!).getTime()
            : Infinity;
        if (spanTime < qTime) {
            insertIdx = i;
            break;
        }
    }
    eventQueue.splice(insertIdx, 0, { event, span });
    console.log(`[TraceAnim] ENQUEUE type=${event.type} tool=${event.activeToolName ?? '-'} span=${span.spanId.slice(0, 8)} idx=${insertIdx} queueLen=${eventQueue.length}`);

    // Start processing if queue was idle
    if (!eventQueueTimer) {
        const elapsed = Date.now() - lastEventActivationTime;
        if (elapsed >= EVENT_STAGGER_DELAY_MS || lastEventActivationTime === 0) {
            processNextEvent();
        } else {
            eventQueueTimer = setTimeout(processNextEvent, EVENT_STAGGER_DELAY_MS - elapsed);
        }
    }
}

/**
 * Process incoming spans and generate animation events.
 * Sorts spans chronologically and enqueues ALL events (chat, tool, invoke_agent)
 * through a unified queue so the full LLM → tool → LLM sequence is animated.
 */
function processSpans(spans: Span[]) {
    const toolSpans = spans.filter(s => s.name.startsWith('execute_tool'));
    console.log(`[TraceAnim] BATCH ${spans.length} spans (${toolSpans.length} tools): [${spans.map(s => `${s.name}(${s.spanId.slice(0, 8)})`).join(', ')}]`);

    // Sort by startTime to ensure chronological order within a batch
    const sorted = [...spans].sort((a, b) => {
        if (!a.startTime || !b.startTime) {
            return 0;
        }
        return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    });

    for (const span of sorted) {
        // Skip spans already processed (handles OTLP retries / duplicate delivery)
        if (processedSpanIds.has(span.spanId)) {
            // If span now has endTime and is still active, update its deactivation timer
            if (span.endTime && activeSpans.has(span.spanId)) {
                const { event } = activeSpans.get(span.spanId)!;
                scheduleDeactivation(span.spanId, event);
            }
            continue;
        }
        processedSpanIds.add(span.spanId);

        const spanType = getSpanType(span.name);
        if (!spanType) {
            continue;
        }

        let toolNames: string[] = [];
        let activeToolName: string | undefined;
        let systemInstructions: string | undefined;

        if (spanType === 'chat') {
            toolNames = extractToolNamesFromChatSpan(span);
            systemInstructions = span.attributes?.find(a => a.key === 'gen_ai.system_instructions')?.value;
        } else if (spanType === 'execute_tool') {
            activeToolName = span.attributes?.find(a => a.key === 'gen_ai.tool.name')?.value;
            toolNames = findParentToolNames(span);
            console.log(`[TraceAnim] RESOLVE tool span=${span.spanId.slice(0, 8)} activeToolName=${activeToolName ?? 'MISSING'} parentToolNames=[${toolNames}]`);
        } else if (spanType === 'invoke_agent') {
            toolNames = [];
        }

        const event: TraceAnimationEvent = {
            type: spanType,
            toolNames,
            activeToolName,
            spanId: span.spanId,
            active: true,
            systemInstructions,
        };

        enqueueEvent(event, span);
    }
}

/**
 * Initialize the trace animation bridge.
 * Listens for new spans from the TraceServer and sends animation notifications.
 */
export function initTraceAnimation() {
    disposeTraceAnimation();
    unsubscribe = TraceServer.onNewSpans(processSpans);
}

/**
 * Clean up the trace animation bridge.
 */
export function disposeTraceAnimation() {
    if (unsubscribe) {
        unsubscribe();
        unsubscribe = undefined;
    }
    // Clear all active timers
    for (const { timer } of activeSpans.values()) {
        clearTimeout(timer);
    }
    activeSpans.clear();
    // Clear event queue
    if (eventQueueTimer) {
        clearTimeout(eventQueueTimer);
        eventQueueTimer = undefined;
    }
    eventQueue.length = 0;
    lastEventActivationTime = 0;
    lastChatSpanId = undefined;
    processedSpanIds.clear();
}
