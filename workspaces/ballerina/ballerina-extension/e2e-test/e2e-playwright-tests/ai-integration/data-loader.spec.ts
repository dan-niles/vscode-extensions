/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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
import { switchToIFrame } from '@wso2/playwright-vscode-tester';
import { Diagram, SidePanel } from '../utils/pages';

const DATA_LOADER_NAME = 'aiTextdataloader';

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
    test.describe.serial('Data Loader RAG Tests', {
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

        test('Add Text Data Loader', async () => {
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
            await sidePanel.clickNode('Data Loader');

            await artifactWebView.getByText('Add Data Loader').first().click();
            // Use exact-text on the loader type card so we don't match the description.
            await artifactWebView.locator('div:text-is("Text Data Loader")').click();

            // Paths is a REPEATABLE_LIST. The form gates Save until the array
            // is initialised (touched), even though `string... paths` is
            // variadic and could legitimately be empty.
            await artifactWebView.getByText('Initialize Array').click();

            // Each array item's inner ExpressionEditor is keyed by a
            // `crypto.randomUUID()`, so its `ex-editor-<uuid>` testid isn't
            // stable on its own. We added `array-editor-${field.key}-item-${index}`
            // on the FormArrayEditor item container — scope into that, then
            // prefix-match the (sole) inner ExpressionEditor and click into
            // its CodeMirror contenteditable to focus before typing.
            const pathItem = artifactWebView.locator('[data-testid="array-editor-paths-item-0"]');
            await pathItem.waitFor({ state: 'visible', timeout: 10000 });
            await pathItem.locator('[data-testid^="ex-editor-"] [contenteditable]').first().click();
            await page.page.keyboard.type('./README.md');
            // Focusing the inner CodeMirror opens a helper pane (Inputs /
            // Variables / Configurables) that overlays the form. Dismiss it
            // by clicking the field's label — clicking the diagram canvas
            // would deselect the active node and close the side panel.
            await artifactWebView.getByText('The paths to the files to load').click();

            await artifactWebView.getByRole('button', { name: 'Save' }).click();

            // Module pull on first connection creation can take a while.
            const connectionsBalPath = path.join(newProjectPath, 'connections.bal');
            await waitForFileMatch(
                connectionsBalPath,
                c => c.includes('ai:TextDataLoader') && c.includes(DATA_LOADER_NAME) && c.includes('./README.md'),
                240000
            );
        });

        test('Add Load method node', async () => {
            const artifactWebView = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page);
            if (!artifactWebView) {
                throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
            }

            // After saving the data loader the side panel stays on the
            // 'Data Loaders' sub-page with the saved loader listed and
            // collapsed. Click it to reveal its 'Load' action — no need to
            // re-navigate via the diagram '+'. Mirrors the model-provider
            // 'Add Chat method node' pattern.
            await artifactWebView.getByText(DATA_LOADER_NAME, { exact: true }).click();
            // 'Load' on its own can substring-match the description
            // ("Loads documents as TextDocument..."), so use exact-text on the
            // method card.
            await artifactWebView.locator('div:text-is("Load")').click();

            // The Load form has no required parameters — Result and Result
            // Type are auto-filled. Just Save.
            await artifactWebView.getByRole('button', { name: 'Save' }).click();

            // Note `.load(` (period), not `->load(` — `load` is declared as
            // `public isolated function`, not a `remote function`.
            const automationBal = path.join(newProjectPath, 'automation.bal');
            await waitForFileMatch(
                automationBal,
                c => c.includes(`${DATA_LOADER_NAME}.load(`),
                60000
            );
        });
    });
}
