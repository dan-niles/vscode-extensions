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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styled from "@emotion/styled";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Branch, Flow, InlineAgentChatState, TraceAnimationEvent } from "@wso2/ballerina-core";
import { Icon, ProgressRing, ThemeColors } from "@wso2/ui-toolkit";
import ChatInterface from "../AgentChatPanel/Components/ChatInterface";
import { Diagram, setTraceAnimationActive, setTraceAnimationInactive } from "@wso2/bi-diagram";
import { TraceVisualizer, TraceData } from "@wso2/trace-visualizer";

type LeftPanelMode =
    | { type: 'diagram' }
    | { type: 'trace'; traceData: TraceData; focusSpanId?: string }
    | { type: 'session'; traces: TraceData[]; sessionId: string };

// --- Layout ---

const Container = styled.div`
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100%;
    background-color: var(--vscode-editor-background);
`;

const ContentArea = styled.div`
    display: flex;
    flex: 1;
    overflow: hidden;
`;

const LeftPanel = styled.div<{ collapsed?: boolean }>`
    overflow: hidden;
    min-height: 0; /* Required for flex children to properly constrain height */
    position: relative;
    display: flex;
    flex-direction: column;
    transition: width 0.2s ease;
`;

const LeftPanelHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--vscode-panel-border);
    flex-shrink: 0;
`;

const AgentName = styled.span`
    font-size: 13px;
    font-weight: 600;
    color: var(--vscode-foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const StatusBadge = styled.span<{ status: string }>`
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    line-height: 1;
    padding: 3px 8px;
    border-radius: 10px;
    flex-shrink: 0;
    background-color: ${(props: { status: string }) =>
        props.status === "ready"
            ? "rgba(var(--vscode-testing-iconPassed-rgb, 0, 128, 0), 0.12)"
            : props.status === "error"
                ? "rgba(var(--vscode-testing-iconFailed-rgb, 255, 0, 0), 0.12)"
                : "rgba(var(--vscode-progressBar-background-rgb, 0, 120, 212), 0.12)"};
    color: ${(props: { status: string }) =>
        props.status === "ready"
            ? "var(--vscode-testing-iconPassed)"
            : props.status === "error"
                ? "var(--vscode-testing-iconFailed)"
                : "var(--vscode-progressBar-background)"};

    &::before {
        content: '';
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background-color: currentColor;
    }
`;

const PanelButton = styled.button`
    background: none;
    border: 1px solid var(--vscode-panel-border);
    color: var(--vscode-foreground);
    font-size: 12px;
    padding: 4px 8px;
    cursor: pointer;
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;

    &:hover {
        background-color: var(--vscode-list-hoverBackground);
    }
`;

const DiagramArea = styled.div`
    flex: 1;
    min-height: 0; /* Required for flex children to properly constrain height */
    overflow: hidden;
    position: relative;
`;

const CollapsedPanel = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px 4px;
    border-right: 1px solid var(--vscode-panel-border);
    flex-shrink: 0;
`;

const ExpandButton = styled(PanelButton)`
    padding: 4px 6px;
`;

const ResizeHandle = styled.div`
    width: 4px;
    cursor: col-resize;
    background-color: transparent;
    transition: background-color 0.15s;
    flex-shrink: 0;
    position: relative;

    &:hover,
    &.active {
        background-color: var(--vscode-sash-hoverBorder, var(--vscode-focusBorder));
    }
`;

const RightPanel = styled.div`
    flex: 1;
    min-width: 350px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-left: 1px solid var(--vscode-panel-border);
`;

// --- Loading states ---

const LoadingContainer = styled.div`
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    height: 100%;
    width: 100%;
    gap: 16px;
`;

const LoadingText = styled.div`
    color: var(--vscode-descriptionForeground);
    font-size: 14px;
    text-align: center;
`;

const ShowTerminalLink = styled.button`
    background: none;
    border: none;
    color: ${ThemeColors.PRIMARY};
    cursor: pointer;
    font-size: 12px;
    padding: 4px 8px;
    border-radius: 4px;
    margin-top: 4px;

    &:hover {
        background: var(--vscode-toolbar-hoverBackground);
    }
`;

const ErrorContainer = styled.div`
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    height: 100%;
    padding: 24px;
    gap: 12px;
`;

const ErrorText = styled.div`
    color: var(--vscode-errorForeground);
    font-size: 13px;
    text-align: center;
    max-width: 400px;
    word-break: break-word;
`;

const RetryButton = styled.button`
    background: none;
    border: 1px solid var(--vscode-panel-border);
    color: var(--vscode-foreground);
    font-size: 12px;
    padding: 6px 14px;
    cursor: pointer;
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    gap: 6px;

    &:hover {
        background-color: var(--vscode-list-hoverBackground);
    }
`;

// --- Component ---

function getStatusLabel(status: string): string {
    switch (status) {
        case "generating":
            return "Generating";
        case "building":
            return "Building";
        case "ready":
            return "Ready";
        case "error":
            return "Error";
        default:
            return "Initializing";
    }
}

export function InlineAgentChatView() {
    const { rpcClient } = useRpcContext();
    const [chatState, setChatState] = useState<InlineAgentChatState | null>(null);
    const leftPanelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let mounted = true;

        // Listen for state push notifications
        rpcClient.onInlineAgentChatStateChanged((state: InlineAgentChatState) => {
            if (mounted) {
                setChatState(state);
            }
        });

        // Fetch current state on mount (in case notifications were sent before we mounted)
        rpcClient.getInlineAgentChatState().then((state) => {
            if (mounted && state) {
                setChatState(state);
            }
        });

        return () => { mounted = false; };
    }, [rpcClient]);

    // Listen for trace animation events to animate the agent node
    useEffect(() => {
        let mounted = true;

        rpcClient.onTraceAnimationChanged((event: TraceAnimationEvent) => {
            if (!mounted) return;
            if (event.active) {
                setTraceAnimationActive(event.toolNames, event.type, event.activeToolName, event.systemInstructions);
            } else {
                setTraceAnimationInactive(event.type, event.activeToolName);
            }
        });

        return () => { mounted = false; };
    }, [rpcClient]);

    // Handle trace export events from TraceVisualizer
    // The component dispatches CustomEvents and calls window.traceVisualizerAPI
    // which we forward to the extension via RPC for file save dialogs
    useEffect(() => {
        const agentChatClient = rpcClient.getAgentChatRpcClient();

        const handleExportTrace = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail?.traceData) {
                agentChatClient.exportTraceJson({ traceData: detail.traceData });
            }
        };

        const handleExportSession = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail?.sessionTraces && detail?.currentSessionId) {
                agentChatClient.exportSessionJson({
                    sessionTraces: detail.sessionTraces,
                    sessionId: detail.currentSessionId,
                });
            }
        };

        // Use the typed global declared by @wso2/trace-visualizer
        window.traceVisualizerAPI = {
            requestSessionTraces: () => { /* no-op — we pass traces directly */ },
            exportTrace: (traceData) => {
                agentChatClient.exportTraceJson({ traceData });
            },
            exportSession: (sessionTraces, sessionId) => {
                agentChatClient.exportSessionJson({ sessionTraces, sessionId });
            },
            exportTraceAsEvalset: (traceData) => {
                agentChatClient.exportTraceAsEvalset({ traceData });
            },
            exportSessionAsEvalset: (sessionTraces, sessionId) => {
                agentChatClient.exportSessionAsEvalset({ sessionTraces, sessionId });
            },
        };

        window.addEventListener('exportTrace', handleExportTrace);
        window.addEventListener('exportSession', handleExportSession);

        return () => {
            window.removeEventListener('exportTrace', handleExportTrace);
            window.removeEventListener('exportSession', handleExportSession);
            delete window.traceVisualizerAPI;
        };
    }, [rpcClient]);

    const handleShowTerminal = () => {
        rpcClient.showInlineAgentTerminal();
    };

    const handleRetry = () => {
        rpcClient.retryInlineAgentChat();
    };

    // Left panel mode: diagram (default), trace details, or session overview
    const [leftPanelMode, setLeftPanelMode] = useState<LeftPanelMode>({ type: 'diagram' });

    const handleShowTrace = async (traceId: string, focusSpanId?: string) => {
        try {
            const response = await rpcClient.getAgentChatRpcClient().getTraceDataForViewer({ traceId });
            setLeftPanelMode({ type: 'trace', traceData: response.traceData, focusSpanId });
            if (isLeftPanelCollapsed) {
                setIsLeftPanelCollapsed(false);
            }
        } catch (error) {
            console.error('Failed to load trace data:', error);
        }
    };

    const handleShowSessionOverview = async () => {
        try {
            const response = await rpcClient.getAgentChatRpcClient().getSessionTracesForViewer({});
            setLeftPanelMode({ type: 'session', traces: response.traces, sessionId: response.sessionId });
            if (isLeftPanelCollapsed) {
                setIsLeftPanelCollapsed(false);
            }
        } catch (error) {
            console.error('Failed to load session traces:', error);
        }
    };

    const handleBackToDiagram = () => {
        setLeftPanelMode({ type: 'diagram' });
    };

    // Build a minimal Flow model containing just the agent call node
    // Strip branches/children to prevent dangling connector lines
    const agentFlowModel = useMemo<Flow | null>(() => {
        if (!chatState?.agentNode) {
            return null;
        }
        const cleanNode = {
            ...chatState.agentNode,
            branches: [] as Branch[], // Remove branches to prevent child node rendering
            returning: true, // Prevent end node from being added
        };
        return {
            fileName: "__inline_agent_chat__",
            nodes: [cleanNode],
        };
    }, [chatState?.agentNode]);

    const [leftPanelWidth, setLeftPanelWidth] = useState<number | null>(null);
    const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);
    const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        const leftPanel = leftPanelRef.current;
        if (!leftPanel) return;

        resizeRef.current = {
            startX: e.clientX,
            startWidth: leftPanel.getBoundingClientRect().width,
        };

        const handle = e.currentTarget;
        handle.classList.add("active");

        const handleMouseMove = (e: MouseEvent) => {
            if (!resizeRef.current) return;
            const delta = e.clientX - resizeRef.current.startX;
            const newWidth = Math.max(200, resizeRef.current.startWidth + delta);
            setLeftPanelWidth(newWidth);
        };

        const handleMouseUp = () => {
            resizeRef.current = null;
            handle.classList.remove("active");
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    }, []);

    const status = chatState?.status ?? "generating";
    const agentName = chatState?.agentVarName ?? "Agent";

    return (
        <Container>
            <ContentArea>
                {isLeftPanelCollapsed ? (
                    <CollapsedPanel>
                        <ExpandButton onClick={() => setIsLeftPanelCollapsed(false)} title="Expand diagram panel">
                            <span className="codicon codicon-chevron-right" style={{ fontSize: 16 }} />
                        </ExpandButton>
                    </CollapsedPanel>
                ) : (
                    <>
                        <LeftPanel ref={leftPanelRef} style={{ width: leftPanelWidth ?? "60%" }}>
                            <LeftPanelHeader>
                                {leftPanelMode.type !== 'diagram' ? (
                                    <>
                                        <PanelButton onClick={handleBackToDiagram} title="Back to agent diagram">
                                            <span className="codicon codicon-arrow-left" style={{ fontSize: 14 }} />
                                            <Icon
                                                name="bi-ai-agent"
                                                sx={{ width: 16, height: 16 }}
                                                iconSx={{ fontSize: "16px", color: "var(--vscode-terminal-ansiBrightCyan)" }}
                                            />
                                        </PanelButton>
                                        <AgentName style={{ marginLeft: 4 }}>
                                            {leftPanelMode.type === 'trace' ? 'Trace Details' : 'Session Traces'}
                                        </AgentName>
                                    </>
                                ) : (
                                    <>
                                        <Icon
                                            name="bi-ai-agent"
                                            sx={{ width: 18, height: 18, flexShrink: 0 }}
                                            iconSx={{
                                                fontSize: "18px",
                                                color: "var(--vscode-terminal-ansiBrightCyan)",
                                                cursor: "default",
                                            }}
                                        />
                                        <AgentName title={agentName}>{agentName}</AgentName>
                                        <StatusBadge status={status}>{getStatusLabel(status)}</StatusBadge>
                                    </>
                                )}
                                <PanelButton style={{ marginLeft: "auto" }} onClick={() => setIsLeftPanelCollapsed(true)} title="Collapse panel">
                                    <span className="codicon codicon-layout-sidebar-left-off" style={{ fontSize: 16 }} />
                                </PanelButton>
                            </LeftPanelHeader>
                            <DiagramArea>
                                {leftPanelMode.type === 'trace' ? (
                                    <TraceVisualizer
                                        key={`trace-${leftPanelMode.traceData.traceId}`}
                                        initialTraceData={leftPanelMode.traceData}
                                        isAgentChat={true}
                                        focusSpanId={leftPanelMode.focusSpanId}
                                        showSidebar={true}
                                        onRequestSessionTraces={() => handleShowSessionOverview()}
                                    />
                                ) : leftPanelMode.type === 'session' ? (
                                    <TraceVisualizer
                                        key={`session-${leftPanelMode.sessionId}`}
                                        isAgentChat={true}
                                        sessionId={leftPanelMode.sessionId}
                                        initialSessionTraces={leftPanelMode.traces}
                                        showSidebar={true}
                                    />
                                ) : agentFlowModel ? (
                                    <Diagram model={agentFlowModel} readOnly={true} containerRef={leftPanelRef} hidePorts={true} hideControls={true} centerVertically={true} />
                                ) : status === "error" ? (
                                    <LoadingContainer>
                                        <Icon
                                            name="bi-error"
                                            sx={{ width: 32, height: 32 }}
                                            iconSx={{ fontSize: "32px", color: "var(--vscode-errorForeground)" }}
                                        />
                                        <LoadingText>Failed to load agent</LoadingText>
                                    </LoadingContainer>
                                ) : (
                                    <LoadingContainer>
                                        <ProgressRing color={ThemeColors.PRIMARY} />
                                        <LoadingText>Loading agent...</LoadingText>
                                    </LoadingContainer>
                                )}
                            </DiagramArea>
                        </LeftPanel>
                        <ResizeHandle onMouseDown={handleMouseDown} />
                    </>
                )}
                <RightPanel>
                    {status === "ready" ? (
                        <ChatInterface
                            onShowTrace={handleShowTrace}
                            onShowSessionOverview={handleShowSessionOverview}
                        />
                    ) : status === "error" ? (
                        <ErrorContainer>
                            <ErrorText>
                                {chatState?.errorMsg || "Failed to start agent chat"}
                            </ErrorText>
                            <RetryButton onClick={handleRetry}>
                                <span className="codicon codicon-refresh" style={{ fontSize: 14 }} />
                                Retry
                            </RetryButton>
                        </ErrorContainer>
                    ) : (
                        <LoadingContainer>
                            <ProgressRing color={ThemeColors.PRIMARY} />
                            <LoadingText>
                                Setting up agent environment...
                            </LoadingText>
                            {status === "building" && (
                                <ShowTerminalLink onClick={handleShowTerminal}>
                                    Show More Details
                                </ShowTerminalLink>
                            )}
                        </LoadingContainer>
                    )}
                </RightPanel>
            </ContentArea>
        </Container>
    );
}
