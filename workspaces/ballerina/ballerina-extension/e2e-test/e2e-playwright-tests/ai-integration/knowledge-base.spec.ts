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

const VECTOR_STORE_NAME = 'aiInmemoryvectorstore';
const EMBEDDING_PROVIDER_NAME = 'aiWso2embeddingprovider';
const KNOWLEDGE_BASE_NAME = 'aiVectorknowledgebase';

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
    test.describe.serial('Vector Knowledge Base RAG Tests', {
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

        test('Add Vector Knowledge Base', async () => {
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
            await sidePanel.clickNode('Knowledge Base');

            await artifactWebView.getByText('Add Knowledge Base').first().click();
            // Use exact-text on the KB type card so we don't match the description.
            await artifactWebView.locator('div:text-is("Vector Knowledge Base")').click();

            // Vector Store* and Embedding Model* are required and the project
            // starts with no items, so create both inline. The 'Create New X'
            // links open a sub-flow; on save the parent KB form is restored
            // with the new item pre-selected.

            // ---- Vector Store: In Memory (no external dependencies) ----
            await artifactWebView.getByText('Create New Vector Store').click();
            await artifactWebView.locator('div:text-is("In Memory Vector Store")').click();
            // No required parameters for In Memory Vector Store — Save with defaults.
            await artifactWebView.getByRole('button', { name: 'Save' }).click();

            const connectionsBalPath = path.join(newProjectPath, 'connections.bal');
            // Module pull on first connection creation can take a while.
            await waitForFileMatch(
                connectionsBalPath,
                c => c.includes('ai:InMemoryVectorStore') && c.includes(VECTOR_STORE_NAME),
                240000
            );

            // ---- Embedding Provider: Default WSO2 (no required parameters) ----
            await artifactWebView.getByText('Create New Embedding Model').click();
            await artifactWebView.locator('div:text-is("Default Embedding Provider (WSO2)")').click();
            await artifactWebView.getByRole('button', { name: 'Save' }).click();

            await waitForFileMatch(
                connectionsBalPath,
                c => c.includes('ai:Wso2EmbeddingProvider') && c.includes(EMBEDDING_PROVIDER_NAME),
                240000
            );

            // ---- Save the Knowledge Base form (Chunker stays at AUTO default) ----
            await artifactWebView.getByRole('button', { name: 'Save' }).click();

            await waitForFileMatch(
                connectionsBalPath,
                c => c.includes('ai:VectorKnowledgeBase') && c.includes(KNOWLEDGE_BASE_NAME),
                60000
            );
        });

        test('Add Ingest method node', async () => {
            const artifactWebView = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page);
            if (!artifactWebView) {
                throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
            }

            // After saving the KB the side panel stays on the
            // 'Knowledge Bases' sub-page with `aiVectorknowledgebase` collapsed.
            // Click it to reveal Ingest / Retrieve / Delete By Filter — same
            // pattern as the model-provider Chat test (no diagram '+'
            // reopen). Clicking the diagram '+' here would not navigate the
            // panel back to the AI top-level — the panel stays on the
            // Knowledge Bases sub-page where `Knowledge Base` text doesn't
            // exist, breaking `clickNode('Knowledge Base')`.
            await artifactWebView.getByText(KNOWLEDGE_BASE_NAME, { exact: true }).click();
            await artifactWebView.getByText('Ingest', { exact: true }).click();

            // Documents is a record-array field. While empty it renders as
            // FormArrayEditor (no `ex-editor-documents` testid), so flip the
            // field to Expression mode first — that swaps in a regular
            // ExpressionEditor whose `ex-editor-documents` container Form.fill
            // can target.
            await artifactWebView
                .locator('[data-testid="mode-switcher-slider-documents"] [data-testid="expression-mode"]')
                .click();

            const form = new Form(page.page, BI_INTEGRATOR_LABEL, artifactWebView);
            await form.switchToFormView(false, artifactWebView);
            await form.fill({
                values: {
                    'documents': {
                        type: 'cmEditor',
                        value: '{\'type: "", content: ()}',
                        additionalProps: { clickLabel: true }
                    }
                }
            });

            await artifactWebView.getByRole('button', { name: 'Save' }).click();

            const automationBal = path.join(newProjectPath, 'automation.bal');
            await waitForFileMatch(
                automationBal,
                c => c.includes(`${KNOWLEDGE_BASE_NAME}.ingest`),
                60000
            );
        });

        test('Add Retrieve method node', async () => {
            const artifactWebView = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page);
            if (!artifactWebView) {
                throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
            }

            // Saving the Ingest node closes the side panel. Re-open via the
            // hover '+' on the link below the ingest node (index 1).
            const diagram = new Diagram(page.page);
            await diagram.init();
            await diagram.clickHoverAddButtonByIndex(1);

            // The side panel remembers state — AI is already expanded from the
            // previous test. Calling expandSection('AI') here would TOGGLE it
            // closed and hide Knowledge Base, so go straight to clickNode.
            const sidePanel = new SidePanel(artifactWebView, page.page);
            await sidePanel.init();
            await sidePanel.clickNode('Knowledge Base');

            await artifactWebView.getByText(KNOWLEDGE_BASE_NAME, { exact: true }).click();
            await artifactWebView.getByText('Retrieve', { exact: true }).click();

            // Query is a Text/Expression field — Text mode is already a
            // cmEditor, so no mode switch is needed.
            const form = new Form(page.page, BI_INTEGRATOR_LABEL, artifactWebView);
            await form.switchToFormView(false, artifactWebView);
            await form.fill({
                values: {
                    'query': {
                        type: 'cmEditor',
                        value: 'sample query',
                        additionalProps: { clickLabel: true }
                    }
                }
            });

            await artifactWebView.getByRole('button', { name: 'Save' }).click();

            const automationBal = path.join(newProjectPath, 'automation.bal');
            await waitForFileMatch(
                automationBal,
                c => c.includes(`${KNOWLEDGE_BASE_NAME}.retrieve`),
                60000
            );
        });

        test('Add Delete By Filter method node', async () => {
            const artifactWebView = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page);
            if (!artifactWebView) {
                throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
            }

            const diagram = new Diagram(page.page);
            await diagram.init();
            await diagram.clickHoverAddButtonByIndex(2);

            const sidePanel = new SidePanel(artifactWebView, page.page);
            await sidePanel.init();
            await sidePanel.clickNode('Knowledge Base');

            await artifactWebView.getByText(KNOWLEDGE_BASE_NAME, { exact: true }).click();
            await artifactWebView.getByText('Delete By Filter', { exact: true }).click();

            // Filters is a record field — same Record/Expression pattern as
            // Ingest's documents. Flip to Expression mode so Form.fill cmEditor
            // can target `ex-editor-filters`.
            await artifactWebView
                .locator('[data-testid="mode-switcher-slider-filters"] [data-testid="expression-mode"]')
                .click();

            const form = new Form(page.page, BI_INTEGRATOR_LABEL, artifactWebView);
            await form.switchToFormView(false, artifactWebView);
            await form.fill({
                values: {
                    'filters': {
                        type: 'cmEditor',
                        value: '{filters: []}',
                        additionalProps: { clickLabel: true }
                    }
                }
            });

            await artifactWebView.getByRole('button', { name: 'Save' }).click();

            const automationBal = path.join(newProjectPath, 'automation.bal');
            await waitForFileMatch(
                automationBal,
                c => c.includes(`${KNOWLEDGE_BASE_NAME}.deleteByFilter`),
                60000
            );
        });
    });
}
