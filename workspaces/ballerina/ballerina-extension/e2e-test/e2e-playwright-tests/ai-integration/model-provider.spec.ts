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
import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { addArtifact, BI_INTEGRATOR_LABEL, BI_WEBVIEW_NOT_FOUND_ERROR, initTest, page } from '../utils/helpers';
import { newProjectPath } from '../utils/helpers/setup';
import { Form, switchToIFrame } from '@wso2/playwright-vscode-tester';
import { Diagram, SidePanel } from '../utils/pages';

const PROVIDER_NAME = 'anthropicModelprovider';

async function waitForFileMatch(filePath: string, predicate: (content: string) => boolean, timeoutMs = 60000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf-8');
            if (predicate(content)) return content;
        }
        await new Promise(r => setTimeout(r, 500));
    }
    throw new Error(`File ${filePath} did not match predicate within ${timeoutMs}ms`);
}

export default function createTests() {
    test.describe.serial('Model Provider Direct LLM Tests', {
        tag: '@ai-integration',
    }, async () => {
        initTest();

        test('Create Automation', async () => {
            await addArtifact('Automation', 'automation');

            const artifactWebView = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page, 30000);
            if (!artifactWebView) {
                throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
            }

            await artifactWebView.getByRole('button', { name: 'Create' }).click();

            const diagramCanvas = artifactWebView.locator('#bi-diagram-canvas');
            await diagramCanvas.waitFor({ state: 'visible', timeout: 30000 });
        });

        test('Add Anthropic Model Provider', async () => {
            const artifactWebView = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page);
            if (!artifactWebView) {
                throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
            }

            const diagram = new Diagram(page.page);
            await diagram.init();
            await diagram.clickAddButtonByIndex(1);

            const sidePanel = new SidePanel(artifactWebView, page.page);
            await sidePanel.init();
            await sidePanel.expandSection('AI');
            await sidePanel.clickNode('Model Provider');

            // 'Add Model Provider' appears twice in the panel (section CTA + a
            // styled divider). Take the first match to disambiguate.
            await artifactWebView.getByText('Add Model Provider').first().click();
            // Use exact-text on the provider listing card to avoid matching
            // both the title and the description.
            await artifactWebView.locator('div:text-is("Anthropic Model Provider")').click();

            const form = new Form(page.page, BI_INTEGRATOR_LABEL, artifactWebView);
            await form.switchToFormView(false, artifactWebView);
            await form.fill({
                values: {
                    'apiKey': {
                        type: 'cmEditor',
                        value: 'test-key',
                        additionalProps: { clickLabel: true }
                    }
                }
            });

            // Model Type dropdown has no aria-label, so Form.fill 'dropdown' doesn't match.
            // Find the dropdown via its `No Selection` option, then pick the first
            // available model (avoids hard-coding a specific Anthropic model name
            // that the LS may rename across releases).
            const modelDropdown = artifactWebView.locator(
                'vscode-dropdown:has(vscode-option[aria-label="No Selection"])'
            );
            await modelDropdown.click();
            await artifactWebView
                .locator('vscode-option:not([aria-label="No Selection"])')
                .first()
                .click();

            await artifactWebView.getByRole('button', { name: 'Save' }).click();

            // Module pull on first connection creation can take a while.
            const connectionsBalPath = path.join(newProjectPath, 'connections.bal');
            await waitForFileMatch(
                connectionsBalPath,
                c => c.includes('anthropic:ModelProvider') && c.includes(PROVIDER_NAME),
                240000
            );
        });

        test('Add Chat method node', async () => {
            const artifactWebView = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page);
            if (!artifactWebView) {
                throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
            }

            // After saving the provider, the side panel stays on the
            // 'Model Providers' sub-page with the saved provider listed and
            // collapsed. Click it to reveal its 'Chat' and 'Generate' actions —
            // no need to re-navigate via the diagram '+'.
            await artifactWebView.getByText(PROVIDER_NAME, { exact: true }).click();
            await artifactWebView.getByText('Chat', { exact: true }).click();

            // Messages is a record-array field. While empty it renders as
            // FormArrayEditor (no `ex-editor-messages` testid yet, so Form.fill
            // silently no-ops). Flip the field to Expression mode first — that
            // swaps in a regular ExpressionEditor whose `ex-editor-messages`
            // container Form.fill can target.
            await artifactWebView
                .locator('[data-testid="mode-switcher-slider-messages"] [data-testid="expression-mode"]')
                .click();

            const form = new Form(page.page, BI_INTEGRATOR_LABEL, artifactWebView);
            await form.switchToFormView(false, artifactWebView);
            await form.fill({
                values: {
                    'messages': {
                        type: 'cmEditor',
                        value: '[{role: "user", content: "Hello"}]',
                        additionalProps: { clickLabel: true }
                    }
                }
            });

            await artifactWebView.getByRole('button', { name: 'Save' }).click();

            const automationBal = path.join(newProjectPath, 'automation.bal');
            await waitForFileMatch(
                automationBal,
                c => c.includes(`${PROVIDER_NAME}->chat`),
                60000
            );
        });

        test('Add Generate method node', async () => {
            const artifactWebView = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page);
            if (!artifactWebView) {
                throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
            }

            // Saving the Chat node closes the side panel and replaces the empty
            // placeholder with the real chat call. Re-open via the hover '+' on
            // the link below the chat node (index 1).
            const diagram = new Diagram(page.page);
            await diagram.init();
            await diagram.clickHoverAddButtonByIndex(1);

            // The side panel remembers state — AI is already expanded from the
            // previous test. Calling expandSection('AI') here would TOGGLE it
            // closed and hide Model Provider, so go straight to clickNode.
            const sidePanel = new SidePanel(artifactWebView, page.page);
            await sidePanel.init();
            await sidePanel.clickNode('Model Provider');

            await artifactWebView.getByText(PROVIDER_NAME, { exact: true }).click();
            await artifactWebView.getByText('Generate', { exact: true }).click();

            const form = new Form(page.page, BI_INTEGRATOR_LABEL, artifactWebView);
            await form.switchToFormView(false, artifactWebView);
            await form.fill({
                values: {
                    'prompt': {
                        type: 'cmEditor',
                        value: '`Hello`',
                        additionalProps: { clickLabel: true }
                    }
                }
            });

            // The 'Expected Type' field is rendered by TypeEditor; we added a
            // `data-testid="type-editor-${field.key}"` on its container in
            // TypeEditor.tsx. Field key for this slot is `td`. Pierce into the
            // shadow DOM to the inner <textarea> for a reliable click+type.
            const expectedType = artifactWebView.locator(
                '[data-testid="type-editor-td"] textarea'
            );
            await expectedType.waitFor({ state: 'visible', timeout: 10000 });
            await expectedType.click();
            await page.page.keyboard.type('string');
            // Typing into the TypeEditor opens its Type Helper dropdown which
            // overlays the Save button. Click the form's description text
            // (non-interactive, inside the side panel — not the diagram) to
            // shift focus and dismiss the dropdown. Escape doesn't reliably
            // close it; clicking outside does.
            await artifactWebView
                .getByText('Sends a chat request to the model', { exact: false })
                .click();

            await artifactWebView.getByRole('button', { name: 'Save' }).click();

            const automationBal = path.join(newProjectPath, 'automation.bal');
            await waitForFileMatch(
                automationBal,
                c => c.includes(`${PROVIDER_NAME}->generate`),
                60000
            );
        });
    });
}
