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

import {
    Disposable,
    Webview,
    WebviewPanel,
    window,
    Uri,
    ViewColumn,
} from "vscode";
import * as path from 'path';
import { WebViewOptions, getComposerWebViewOptions, getLibraryWebViewContent } from "../../utils/webview-utils";
import { extension } from '../../BalExtensionContext';
import { RPCLayer } from '../../RPCLayer';

export class InlineAgentChatPanel {
    public static currentPanel: InlineAgentChatPanel | undefined;
    public static readonly viewType = 'ballerina.inline-agent-chat';
    private readonly _panel: WebviewPanel;
    private _disposables: Disposable[] = [];
    private _onDispose?: () => void;

    private constructor(panel: WebviewPanel, onDispose?: () => void) {
        this._panel = panel;
        this._onDispose = onDispose;

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.html = this._getWebviewContent(
            this._panel.webview
        );

        RPCLayer.create(this._panel);
    }

    public static render(agentVarName: string, onDispose?: () => void) {
        if (InlineAgentChatPanel.currentPanel) {
            // Dispose old panel so the webview resets for the new agent session
            const oldOnDispose = InlineAgentChatPanel.currentPanel._onDispose;
            InlineAgentChatPanel.currentPanel._onDispose = undefined;
            InlineAgentChatPanel.currentPanel.dispose();
            if (oldOnDispose) {
                oldOnDispose();
            }
        }
        {
            const panel = window.createWebviewPanel(
                InlineAgentChatPanel.viewType,
                `Agent Chat: ${agentVarName}`,
                ViewColumn.Active,
                {
                    enableScripts: true,
                    localResourceRoots: [Uri.file(path.join(extension.context.extensionPath, 'resources'))],
                    retainContextWhenHidden: true,
                }
            );
            panel.iconPath = {
                light: Uri.file(path.join(extension.context.extensionPath, 'resources', 'icons', 'dark-comment-discussion.svg')),
                dark: Uri.file(path.join(extension.context.extensionPath, 'resources', 'icons', 'light-comment-discussion.svg'))
            };
            InlineAgentChatPanel.currentPanel = new InlineAgentChatPanel(panel, onDispose);
        }
    }

    public dispose() {
        InlineAgentChatPanel.currentPanel = undefined;

        this._panel.dispose();

        // Call cleanup callback (kills terminal, removes temp project)
        if (this._onDispose) {
            this._onDispose();
        }

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    private _getWebviewContent(webView: Webview) {
        const body = `<div class="container" id="webview-container">
                    <div class="loader-wrapper">
                        <div class="loader"></div>
                    </div>
                </div>`;
        const bodyCss = ``;
        const styles = `
                .container {
                    background-color: var(--vscode-editor-background);
                    height: 100vh;
                    width: 100%;
                }
                .loader-wrapper {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100%;
                    width: 100%;
                }
                .loader {
                    width: 32px;
                    aspect-ratio: 1;
                    border-radius: 50%;
                    border: 4px solid var(--vscode-button-background);
                    animation:
                        l20-1 0.8s infinite linear alternate,
                        l20-2 1.6s infinite linear;
                }
                @keyframes l20-1{
                    0%    {clip-path: polygon(50% 50%,0       0,  50%   0%,  50%    0%, 50%    0%, 50%    0%, 50%    0% )}
                    12.5% {clip-path: polygon(50% 50%,0       0,  50%   0%,  100%   0%, 100%   0%, 100%   0%, 100%   0% )}
                    25%   {clip-path: polygon(50% 50%,0       0,  50%   0%,  100%   0%, 100% 100%, 100% 100%, 100% 100% )}
                    50%   {clip-path: polygon(50% 50%,0       0,  50%   0%,  100%   0%, 100% 100%, 50%  100%, 0%   100% )}
                    62.5% {clip-path: polygon(50% 50%,100%    0, 100%   0%,  100%   0%, 100% 100%, 50%  100%, 0%   100% )}
                    75%   {clip-path: polygon(50% 50%,100% 100%, 100% 100%,  100% 100%, 100% 100%, 50%  100%, 0%   100% )}
                    100%  {clip-path: polygon(50% 50%,50%  100%,  50% 100%,   50% 100%,  50% 100%, 50%  100%, 0%   100% )}
                }
                @keyframes l20-2{
                    0%    {transform:scaleY(1)  rotate(0deg)}
                    49.99%{transform:scaleY(1)  rotate(135deg)}
                    50%   {transform:scaleY(-1) rotate(0deg)}
                    100%  {transform:scaleY(-1) rotate(-135deg)}
                }
            `;
        const scripts = `
                function loadedScript() {
                    function renderDiagrams() {
                        visualizerWebview.renderWebview("inline-agent-chat", document.getElementById("webview-container"));
                    }
                    renderDiagrams();
                }
            `;

        const webViewOptions: WebViewOptions = {
            ...getComposerWebViewOptions("Visualizer", webView),
            body,
            scripts,
            styles,
            bodyCss,
        };

        return getLibraryWebViewContent(webViewOptions, webView);
    }
}
