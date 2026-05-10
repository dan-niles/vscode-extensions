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
import { expect, test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { addArtifact, BI_INTEGRATOR_LABEL, BI_WEBVIEW_NOT_FOUND_ERROR, initTest, page } from '../utils/helpers';
import { newProjectPath } from '../utils/helpers/setup';
import { Form, switchToIFrame } from '@wso2/playwright-vscode-tester';
import { ProjectExplorer } from '../utils/pages';
import { DEFAULT_PROJECT_NAME } from '../utils/helpers/constants';

const NAME_FIELD_KEY = "NameName of the agent (e.g. 'Customer Support Assistant', 'Sales Advisor', 'Data Analyst')";

async function waitForFileMatch(filePath: string, predicate: (content: string) => boolean, timeoutMs = 30000): Promise<string> {
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
    test.describe.serial('AI Chat Agent Tests', {
        tag: '@ai-integration',
    }, async () => {
        initTest();
        let sampleName: string;

        test('Create AI Chat Agent', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Creating a new AI Chat Agent in test attempt: ', testAttempt);

            await addArtifact('AI Chat Agent', 'ai-agent-card');
            const artifactWebView = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page);
            if (!artifactWebView) {
                throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
            }

            sampleName = `sample${testAttempt}`;
            const form = new Form(page.page, BI_INTEGRATOR_LABEL, artifactWebView);
            await form.switchToFormView(false, artifactWebView);

            // Validate inline error handling before submitting a valid name.
            await form.fill({ values: { [NAME_FIELD_KEY]: { type: 'input', value: '1invalid' } } });
            await expect(artifactWebView.getByText('Name must start with a letter')).toBeVisible({ timeout: 5000 });
            const createButton = artifactWebView.getByRole('button', { name: 'Create' });
            await expect(createButton).toBeDisabled();

            await form.fill({ values: { [NAME_FIELD_KEY]: { type: 'input', value: 'bad!name' } } });
            await expect(
                artifactWebView.getByText('Name can only contain letters, numbers, spaces, and underscores')
            ).toBeVisible({ timeout: 5000 });
            await expect(createButton).toBeDisabled();

            await form.fill({ values: { [NAME_FIELD_KEY]: { type: 'input', value: sampleName } } });
            await expect(createButton).toBeEnabled();

            await form.submit('Create');
            console.log('AI Chat Agent creation form submitted');

            // Module pull on first run can take minutes — keep the long timeout.
            const diagramCanvas = artifactWebView.locator('#bi-diagram-canvas');
            await diagramCanvas.waitFor({ state: 'visible', timeout: 240000 });

            const diagramTitle = artifactWebView.locator('h2', { hasText: 'AI Chat Agent' });
            await diagramTitle.waitFor();

            const agentCallNode = artifactWebView.locator('[data-testid="agent-call-node"]');
            await agentCallNode.waitFor();

            const projectExplorer = new ProjectExplorer(page.page);
            await projectExplorer.findItem([DEFAULT_PROJECT_NAME, `AI Agent Services - /${sampleName}`]);
        });

        test('Edit AI Chat Agent Instructions', async () => {
            console.log('Editing instructions on AI Chat Agent');
            const artifactWebView = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page);
            if (!artifactWebView) {
                throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
            }

            // Click the system-prompt area inside the agent node to open the AI Agent edit panel.
            await artifactWebView.getByText('Provide specific instructions on how the agent should behave.').click();

            // The form decomposes systemPrompt into separate role/instructions cmEditors;
            // Form.fill matches by data-testid="ex-editor-${key}" where key is the NodePropertyKey.
            const form = new Form(page.page, BI_INTEGRATOR_LABEL, artifactWebView);
            await form.switchToFormView(false, artifactWebView);
            await form.fill({
                values: {
                    'instructions': {
                        type: 'cmEditor',
                        value: 'You are a helpful assistant.',
                        additionalProps: { clickLabel: true }
                    }
                }
            });
            await artifactWebView.getByRole('button', { name: 'Save' }).click();

            const agentsBalPath = path.join(newProjectPath, 'agents.bal');
            await waitForFileMatch(agentsBalPath, c => c.includes('You are a helpful assistant.'));
        });

        test('Add Short-Term Memory to AI Chat Agent', async () => {
            console.log('Adding short-term memory to AI Chat Agent');
            const artifactWebView = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page);
            if (!artifactWebView) {
                throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
            }

            // Click the in-diagram '+ Add Memory' button (rendered as a styled.div, not <button>).
            await artifactWebView.getByTitle('Add Memory').click();
            // Defaults are fine: Short Term Memory + name 'aiShorttermmemory'.
            await artifactWebView.getByRole('button', { name: 'Save' }).click();

            const agentsBalPath = path.join(newProjectPath, 'agents.bal');
            await waitForFileMatch(agentsBalPath, c => c.includes('aiShorttermmemory') && c.includes('memory ='));
        });

        test('Replace Model Provider with OpenAI', async () => {
            console.log('Replacing default model provider with OpenAI');
            const artifactWebView = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page);
            if (!artifactWebView) {
                throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
            }

            // Click the model circle (SVG with <title>Configure Model Provider</title>).
            await artifactWebView.locator('circle:has(title:text("Configure Model Provider"))').click();
            await artifactWebView.getByText('Create New Model Provider').click();
            // Pick OpenAI exactly — partial match would hit Azure OpenAI Model Provider first.
            await artifactWebView.locator('div:text-is("OpenAI Model Provider")').click();

            // API Key cmEditor — field.key is 'apiKey' (NodePropertyKey).
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

            // Model Type dropdown — its aria-label is not 'modelType', so Form.fill 'dropdown'
            // type doesn't fit. Find via vscode-dropdown housing the No Selection option, then
            // pick a known stable model from the LS-populated list.
            const modelDropdown = artifactWebView.locator('vscode-dropdown:has(vscode-option[aria-label="No Selection"])');
            await modelDropdown.click();
            await artifactWebView.locator('vscode-option[aria-label="gpt-4o"]').click();

            await artifactWebView.getByRole('button', { name: 'Save' }).click();

            const connectionsBalPath = path.join(newProjectPath, 'connections.bal');
            const agentsBalPath = path.join(newProjectPath, 'agents.bal');
            await waitForFileMatch(connectionsBalPath, c => c.includes('openai:ModelProvider'));
            await waitForFileMatch(agentsBalPath, c => c.includes('model = openaiModelprovider'));
        });

        test('Delete AI Chat Agent', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Deleting AI Chat Agent in test attempt: ', testAttempt);
            const artifactWebView = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page);
            if (!artifactWebView) {
                throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
            }
            const projectExplorer = new ProjectExplorer(page.page);
            const serviceTreeItem = await projectExplorer.findItem([DEFAULT_PROJECT_NAME, `AI Agent Services - /${sampleName}`]);
            if (!serviceTreeItem) throw new Error('Service tree item not found');
            await serviceTreeItem.click({ button: 'right' });
            const deleteButton = page.page.getByRole('button', { name: 'Delete' }).first();
            await deleteButton.waitFor({ timeout: 5000 });
            await deleteButton.click();
            await page.page.waitForTimeout(500);
            await expect(serviceTreeItem).not.toBeVisible({ timeout: 10000 });
        });
    });
}
