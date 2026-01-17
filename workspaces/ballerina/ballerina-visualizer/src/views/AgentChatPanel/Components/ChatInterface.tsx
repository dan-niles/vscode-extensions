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
 * 
 * THIS FILE INCLUDES AUTO GENERATED CODE
 */

import React, { useState, useEffect, useRef } from "react";
import styled from "@emotion/styled";
import ChatInput from "./ChatInput";
import LoadingIndicator from "./LoadingIndicator";
import ExecutionStepsButton from "./ExecutionStepsButton";
import ExecutionStepsList from "./ExecutionStepsList";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Codicon, Icon } from "@wso2/ui-toolkit";
import ReactMarkdown from "react-markdown";
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { ToolCallSummary } from "@wso2/ballerina-core";

enum ChatMessageType {
    MESSAGE = "message",
    ERROR = "error",
}

interface ChatMessage {
    type: ChatMessageType;
    text: string;
    isUser: boolean;
    traceId?: string;
    toolCalls?: ToolCallSummary[];
}

// ---------- WATER MARK ----------
const Watermark = styled.div`
    position: absolute;
    width: 80%;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    pointer-events: none;
    user-select: none;
`;

const ChatIcon = styled.span`
    font-size: 60px !important;
    width: 60px;
    height: 60px;
    display: block;
    margin: 0 0;
`;

const WatermarkTitle = styled.div`
    font-size: 1.5em;
    font-weight: bold;
`;

const WatermarkSubTitle = styled.div`
    font-size: 14px;
    margin-top: 24px;
    color: var(--vscode-descriptionForeground);
`;

// ---------- CHAT AREA ----------
const ChatWrapper = styled.div`
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100%;
`;

const ChatContainer = styled.div`
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
    margin: 20px 0 32px 0;
`;

const Messages = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    position: relative;
    z-index: 1;
    padding: 8px 20px;
`;

const MessageContainer = styled.div<{ isUser: boolean }>`
    display: flex;
    align-items: flex-end;
    justify-content: ${({ isUser }: { isUser: boolean }) => (isUser ? "flex-end" : "flex-start")};
    gap: 6px;
`;

const ProfilePic = styled.div`
    width: 18px;
    height: 18px;
    border-radius: 50%;
    object-fit: cover;
`;

const MessageBubble = styled.div<{ isUser: boolean; isError?: boolean; isLoading?: boolean }>`
    position: relative;
    padding: ${({ isLoading }: { isLoading?: boolean }) => (isLoading ? "10px 14px" : "0 14px")};
    max-width: 55%;
    align-self: ${({ isUser }: { isUser: boolean }) => (isUser ? "flex-end" : "flex-start")};
    overflow-wrap: break-word;
    word-break: break-word;
    hyphens: auto;

    color: ${({ isError }: { isError: boolean }) => (isError ? "var(--vscode-errorForeground)" : "inherit")};

    &:before {
        content: "";
        position: absolute;
        inset: 0;
        background-color: ${({ isUser, isError }: { isUser: boolean; isError?: boolean }) =>
        isError ? "var(--vscode-errorForeground)" : isUser ? "var(--vscode-button-background)" : "var(--vscode-input-background)"};
        opacity: ${({ isUser, isError }: { isUser: boolean; isError?: boolean }) => (isUser ? "0.3" : isError ? "0.05" : "1")};
        border-radius: inherit;
        border: 1px solid ${({ isUser }: { isUser: boolean }) =>
        isUser ? "var(--vscode-peekView-border)" : "var(--vscode-panel-border)"};;
        z-index: -1;
    }

    border-radius: ${({ isUser }: { isUser: boolean }) => (isUser ? "12px 12px 0px 12px" : "12px 12px 12px 0px")};
`;

// ---------- CHAT FOOTER ----------
const ChatFooter = styled.div`
    position: sticky;
    bottom: 20px;
    width: 100%;
    padding: 0 20px;
`;

const SmallInfoIcon = styled.span`
    font-size: 16px;
    width: 16px;
    height: 16px;
    display: inline-block;
    margin-right: 8px;
`;

const FooterText = styled.div`
    display: flex;
    align-items: center;
    justify-content: flex-start;
    font-size: 12px;
    padding: 6px 0;
    color: var(--vscode-input-placeholderForeground);
    width: calc(100% - 40px);
`;

const MessageActionsContainer = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    margin: -4px 0 0 24px;
    flex-wrap: wrap;
`;

const ShowLogsButton = styled.button`
    background: none;
    border: none;
    color: var(--vscode-textLink-foreground);
    font-size: 12px;
    padding: 4px 0;
    cursor: pointer;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;

    &:hover {
        text-decoration: underline;
        color: var(--vscode-textLink-activeForeground);
    }
`;

// Preprocess LaTeX delimiters to convert \(...\) and \[...\] to $...$ and $$...$$
function preprocessLatex(text: string): string {
    if (!text || typeof text !== 'string') return text;

    // Convert display math \[...\] to $$...$$
    let processed = text.replace(/\\\[(.*?)\\\]/gs, (_, math) => `$$${math}$$`);

    // Convert inline math \(...\) to $...$
    processed = processed.replace(/\\\((.*?)\\\)/gs, (_, math) => `$${math}$`);

    return processed;
}

const ChatInterface: React.FC = () => {
    const { rpcClient } = useRpcContext();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isTracingEnabled, setIsTracingEnabled] = useState(false);
    const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>({});

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Check tracing status once on mount
    useEffect(() => {
        const checkTracingStatus = async () => {
            try {
                const status = await rpcClient.getAgentChatRpcClient().getTracingStatus();
                setIsTracingEnabled(status.enabled);
            } catch (error) {
                console.error('Failed to get tracing status:', error);
                setIsTracingEnabled(false);
            }
        };
        checkTracingStatus();
    }, [rpcClient]);

    // Auto scroll to the bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSendMessage = async (text: string) => {
        if (!text.trim()) return;

        setMessages((prev) => [...prev, { type: ChatMessageType.MESSAGE, text, isUser: true }]);
        setIsLoading(true);

        try {
            const chatResponse = await rpcClient.getAgentChatRpcClient().getChatMessage({ message: text });

            setMessages((prev) => [
                ...prev,
                {
                    type: ChatMessageType.MESSAGE,
                    text: chatResponse.message,
                    isUser: false,
                    traceId: chatResponse.traceId,
                    toolCalls: chatResponse.toolCalls
                },
            ]);
        } catch (error) {
            const errorMessage =
                error && typeof error === "object" && "message" in error
                    ? String(error.message)
                    : "An unknown error occurred";

            setMessages((prev) => [...prev, { type: ChatMessageType.ERROR, text: errorMessage, isUser: false }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleStop = () => {
        rpcClient.getAgentChatRpcClient().abortChatRequest();
        setIsLoading(false);
    };

    const handleShowLogs = async (messageIndex: number) => {
        try {
            // Find the corresponding user message
            // Look backwards from the current index to find the last user message
            let userMessage = '';

            for (let i = messageIndex - 1; i >= 0; i--) {
                if (messages[i].isUser) {
                    userMessage = messages[i].text;
                    break;
                }
            }

            if (!userMessage) {
                console.error('Could not find user message for this response');
                return;
            }

            // Call the RPC method to show the trace view
            await rpcClient.getAgentChatRpcClient().showTraceView({ message: userMessage });
        } catch (error) {
            console.error('Failed to show trace view:', error);
        }
    };

    const handleViewInTrace = async (traceId: string, spanId: string) => {
        try {
            await rpcClient.getAgentChatRpcClient().showTraceView({
                traceId,
                focusSpanId: spanId
            });
        } catch (error) {
            console.error('Failed to show trace view:', error);
        }
    };

    return (
        <ChatWrapper>
            <ChatContainer>
                {messages.length === 0 && (
                    <Watermark>
                        <ChatIcon className="codicon codicon-comment-discussion" />
                        <WatermarkTitle>Agent Chat</WatermarkTitle>
                        <WatermarkSubTitle>
                            The chat interface serves as a testing environment to evaluate and refine the flow of the AI
                            agent.
                        </WatermarkSubTitle>
                    </Watermark>
                )}
                <Messages>
                    {/* Render each message */}
                    {messages.map((msg, idx) => (
                        <React.Fragment key={idx}>
                            <MessageContainer isUser={msg.isUser}>
                                {!msg.isUser && (
                                    <ProfilePic>
                                        <Icon
                                            name="bi-ai-agent"
                                            sx={{ width: 18, height: 18 }}
                                            iconSx={{
                                                fontSize: "18px",
                                                color: "var(--vscode-foreground)",
                                                cursor: "default",
                                            }}
                                        />
                                    </ProfilePic>
                                )}
                                <MessageBubble isUser={msg.isUser} isError={msg.type === ChatMessageType.ERROR}>
                                    <ReactMarkdown
                                        remarkPlugins={[remarkMath, remarkGfm]}
                                        rehypePlugins={[rehypeKatex]}
                                    >
                                        {preprocessLatex(msg.text)}
                                    </ReactMarkdown>
                                </MessageBubble>
                                {msg.isUser && (
                                    <ProfilePic>
                                        <Icon
                                            name="bi-user"
                                            sx={{ width: 18, height: 18 }}
                                            iconSx={{
                                                fontSize: "18px",
                                                color: "var(--vscode-foreground)",
                                                cursor: "default",
                                            }}
                                        />
                                    </ProfilePic>
                                )}
                            </MessageContainer>
                            {!msg.isUser && (msg?.toolCalls || isTracingEnabled) && (
                                <MessageActionsContainer>
                                    {isTracingEnabled && (
                                        <ShowLogsButton onClick={() => handleShowLogs(idx)}>
                                            Show logs
                                        </ShowLogsButton>
                                    )}
                                    {msg?.toolCalls?.length > 0 && msg.traceId && (
                                        <ExecutionStepsButton
                                            isExpanded={expandedSteps[idx] || false}
                                            onToggle={() => setExpandedSteps(prev => ({ ...prev, [idx]: !prev[idx] }))}
                                        />
                                    )}
                                </MessageActionsContainer>
                            )}
                            {/* Show ExecutionStepsList in a separate container when expanded */}
                            {!msg.isUser && msg?.toolCalls?.length > 0 && msg.traceId && expandedSteps[idx] && (
                                <ExecutionStepsList
                                    toolCalls={msg.toolCalls}
                                    traceId={msg.traceId}
                                    onViewInTrace={handleViewInTrace}
                                />
                            )}
                        </React.Fragment>
                    ))}

                    {/* If waiting on a response, show the loading bubble */}
                    {isLoading && (
                        <MessageContainer isUser={false}>
                            <ProfilePic>
                                <Icon
                                    name="bi-ai-agent"
                                    sx={{ width: 18, height: 18 }}
                                    iconSx={{
                                        fontSize: "18px",
                                        color: "var(--vscode-foreground)",
                                        cursor: "default",
                                    }}
                                />
                            </ProfilePic>
                            <MessageBubble isUser={false} isLoading={true}>
                                <LoadingIndicator />
                            </MessageBubble>
                        </MessageContainer>
                    )}
                    <div ref={messagesEndRef} />
                </Messages>
            </ChatContainer>
            <ChatFooter>
                <ChatInput value="" onSend={handleSendMessage} onStop={handleStop} isLoading={isLoading} />
                {/* <FooterText>
                    <SmallInfoIcon className="codicon codicon-info" />
                    <span>Add chat to external application.</span>
                    <a
                        href="https://example.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            marginLeft: "8px",
                            textDecoration: "underline",
                            cursor: "pointer",
                        }}
                    >
                        More info
                    </a>
                </FooterText> */}
            </ChatFooter>
        </ChatWrapper>
    );
};

export default ChatInterface;
