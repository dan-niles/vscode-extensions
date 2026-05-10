# AI Chat Agent - Test Specification

## Application Overview

The AI Chat Agent feature in WSO2 Integrator: BI lets users create a chattable AI agent
service backed by an LLM. The wizard auto-selects a model provider based on the project's
AI module org (the WSO2 default model provider for `ballerina/ai`, or the OpenAI provider
otherwise) — there is **no** model/API-key configuration form in this flow.

Source: `workspaces/ballerina/ballerina-visualizer/src/views/BI/AIChatAgent/AIChatAgentWizard.tsx`

## UI Elements Identified

### Buttons and Actions
- **Add Artifact** button on the workspace overview (text: "Add Artifact")
- **AI Chat Agent** card in the Artifacts panel under the **AI Integration** section
  - Card id: `ai-agent-card`
  - Title text: "AI Chat Agent"
- **Create** button in the wizard (disabled while name is empty/invalid or while creating)
- **Delete** button — exposed via the project explorer right-click context menu on the service tree item

### Form Fields
The wizard has a **single** input:
- **Name** (required) — text input
  - Visible label: `Name`
  - Description directly under label:
    `Name of the agent (e.g. 'Customer Support Assistant', 'Sales Advisor', 'Data Analyst')`
  - For Playwright `Form.fill`, the combined locator key is the concatenation:
    `NameName of the agent (e.g. 'Customer Support Assistant', 'Sales Advisor', 'Data Analyst')`
  - Validation rules (enforced inline, errorMsg appears under field, Create button disables):
    - Required.
    - Must start with a letter (no leading digit / whitespace).
    - Only `[a-zA-Z0-9 _]` allowed.
    - Must be unique — checked against existing services (`/<camelCase(name)>`), agent
      connections (`<baseName>Agent`), and (when org is non-`ballerina`) model connections
      (`<baseName>Model`).

### Internal Wizard Progress (no user input needed)
After clicking **Create**, the wizard runs through these steps. They render a relative
loader with the description; tests should not assert on the labels but should expect long
waits because module pull happens in step 2/3:
1. Creating Agent
2. Creating Model Provider
3. Pulling Modules (can take a few minutes on first run)
4. Creating Listener
5. Creating Service
6. Completing

### Post-creation View
On success, the wizard opens the new service. The service designer / flow diagram renders:
- A `TitleBar` `<h2>` with text `AI Chat Agent` and the camelCase service path as subtitle.
- The flow diagram canvas (`#bi-diagram-canvas`).
- An agent call node (`[data-testid="agent-call-node"]`).

### Project Explorer
The new service appears in the BI sidebar tree under the project as:
`AI Agent Services - /<camelCase(name)>`

Examples:
- `sample1` → `AI Agent Services - /sample1`
- `Customer Support` → `AI Agent Services - /customerSupport`

## Test Scenarios

### 1. Create AI Chat Agent (golden path)

**Description:** Create an AI Chat Agent and verify the diagram, agent call node, and
project tree entry.

**Prerequisites:**
- BI extension is active and a fresh test project is open.
- The Ballerina distribution that defaults to the WSO2 model provider is installed
  (current test project uses Swan Lake Update 13).

**Steps:**
1. Click **Add Artifact** on the workspace overview.
2. In the Artifacts panel, under **AI Integration**, click the **AI Chat Agent** card
   (`testid: ai-agent-card`).
3. In the wizard, fill **Name** with `sample<retry>`.
4. Click **Create**.
5. Wait for `#bi-diagram-canvas` to become visible (timeout ≥ 240 s — module pull is slow).
6. Wait for `<h2>` containing `AI Chat Agent`.
7. Wait for `[data-testid="agent-call-node"]`.
8. In the project explorer, verify the item
   `AI Agent Services - /sample<retry>` under the project root.

**Expected Result:**
- Service is created without errors.
- Generated files include the agent variable, model provider variable, listener, and
  service binding (`agents.bal`, `connections.bal`, `main.bal`).
- The view that opens after Create is the AI Chat Agent service designer / flow diagram.

### 2. Edit Agent Instructions



**Description:** Open the agent node's edit panel, fill the Instructions field, save,
and verify the instructions string is reflected in the generated source.

**Prerequisites:**
- The agent created in scenario 1 is open in the service designer.

**UI flow:**
- The system-prompt area inside the agent node (visible text:
  `Provide specific instructions on how the agent should behave.`) is clickable.
  Clicking it opens a right-side **AI Agent** panel containing:
  - **Role** (cmEditor, current value = the agent name — e.g. `sample1`)
  - **Instructions** (cmEditor, placeholder
    `e.g., You are a friendly assistant. Your goal is to...`)
  - **Query*** (cmEditor expression, default `request.message`)
  - **Result*** (regular input, default `stringResult`)
  - **Save** button (primary)

**Steps:**
1. Click the system-prompt area inside the agent node to open the **AI Agent** panel.
2. In the Instructions cmEditor field, fill: `You are a helpful assistant.`
3. Click **Save**.
4. Verify the project source file `agents.bal` now contains the updated instructions
   string (the agent's `systemPrompt.instructions` is set to the new value).

**Form keys for `Form.fill`:**
| Field | Key | Type |
|-------|-----|------|
| Instructions | `instructions` | `cmEditor` |

> `cmEditor` keys are the underlying `NodePropertyKey` (lowercase property name), **not**
> the visible `label + description` string. The form looks up
> `data-testid="ex-editor-${key}"`. If the testid doesn't exist, `Form.fill` silently
> no-ops — so a wrong key fails as "file did not change", not as a click error.
> The `systemPrompt` record gets decomposed into separate `role` / `instructions`
> cmEditor sub-fields, each keyed by its inner record-field name.

**Expected Result:**
- `agents.bal` contains `instructions: string \`You are a helpful assistant.\``
  (or the equivalent backtick-quoted string).
- Diagram still shows the agent node — no error toasts.

### 3. Add Short-Term Memory

**Description:** Add a `ShortTermMemory` block to the agent via the in-diagram
**Add Memory** button.

**Prerequisites:**
- The agent created in scenario 1 is open in the service designer.

**UI flow:**
- The agent node has an inline button labeled **+ Add Memory**.
  Clicking it opens a right-side **Configure Memory** panel containing:
  - **Select Memory*** dropdown (default value `Short Term Memory`)
  - **Memory Name*** input (default value `aiShorttermmemory`)
  - **Advanced Configurations** (collapsible, not needed for this test)
  - **Save** button (primary)

**Steps:**
1. Click the **+ Add Memory** button inside the agent node.
2. Without changing defaults, click **Save**.
3. Verify the project source files now declare and wire the memory:
   - `agents.bal` contains `memory = aiShorttermmemory` in the agent constructor.
   - `agents.bal` declares `final ai:ShortTermMemory aiShorttermmemory = check new ();`
4. Verify the diagram now shows a **Memory** section under the agent node with subtitle
   `ShortTermMemory`.

**Expected Result:**
- Memory is added without errors.
- The diagram updates in-place.

### 4. Replace Model Provider (OpenAI)



**Description:** Replace the agent's default `wso2ModelProvider` with a newly created
`OpenAI Model Provider`. Verifies the agent's `model` parameter switches to the new
provider variable, and `connections.bal` contains the new provider declaration.

**Prerequisites:**
- The agent created in scenario 1 is open in the service designer.
- Agent currently uses `wso2ModelProvider` (the default).

**UI flow:**
- A circle icon (SVG `<title>Configure Model Provider</title>`) sits to the right of the
  agent node. Clicking it opens the **Configure Model Provider** side panel:
  - `Select Model Provider*` dropdown (current value = `wso2ModelProvider`)
  - `+ Create New Model Provider` link
  - Save button
- Clicking `+ Create New Model Provider` swaps the panel to **Select Model Provider** —
  a list of provider types: Default Model Provider (WSO2), Anthropic, Azure OpenAI,
  Deepseek, Mistral, Ollama, OpenAI, Openrouter.
- Clicking a provider type opens **Create Model Provider** form for that type. For
  OpenAI:
  - `API Key*` cmEditor (description: `The OpenAI API key.`)
  - `Model Type*` dropdown (description: `The OpenAI model name.`)
  - `Model Provider Name*` input (default value: `openaiModelprovider`)
  - `Result Type*` (locked, value: `openai:ModelProvider`)
  - `Save` button (disabled until required fields are filled)

**Steps:**
1. Click the model circle: Playwright selector
   `circle:has(title:text("Configure Model Provider"))`.
2. Click **+ Create New Model Provider** (link/button text matches `Create New Model Provider`).
3. Click the **OpenAI Model Provider** card. Use **exact** text match — partial match
   will hit "Azure OpenAI Model Provider" first.
4. Fill the form:
   - API Key: any non-empty test value (e.g. `test-key`).
   - Model Type: select the first available option from the dropdown.
5. Click **Save**.
6. Verify the project source files:
   - `connections.bal` now contains an `openai:ModelProvider` declaration named
     `openaiModelprovider` (the default provider name).
   - `agents.bal`'s agent constructor's `model = ` parameter is now `openaiModelprovider`
     (was `wso2ModelProvider`).

**Form keys for `Form.fill`:**
| Field | Key | Type |
|-------|-----|------|
| API Key | `apiKey` | `cmEditor` |

> Same lesson as scenario 2: cmEditor keys are the `NodePropertyKey`, not the label
> string. The Model Type dropdown's `aria-label` is **not** `modelType`, so
> `Form.fill` `dropdown` doesn't fit — drive the `vscode-dropdown` directly via raw
> Playwright locators (see the implementation in `ai-chat-service.spec.ts`). The
> Model Provider Name input is left at its default (`openaiModelprovider`) — no fill
> needed.

**Expected Result:**
- The provider replacement is reflected in source within ~10 s.
- No network call is made — the OpenAI provider is just declared, not invoked.
- A test API key works fine; the LS only validates non-emptiness, not the key itself.

### 5. Delete AI Chat Agent

**Description:** Remove a previously created agent via the explorer context menu.

**Prerequisites:**
- A service named `sample<retry>` was created by the previous test in this suite.

**Steps:**
1. In the project explorer, locate `AI Agent Services - /sample<retry>` under the project
   root and right-click it.
2. Click **Delete** in the context menu.
3. Wait for the tree item to disappear.

**Expected Result:**
- Tree item is gone within 10 s.
- Service file is removed from disk.

## Notes

- The wizard does **not** expose model selection, API key, temperature, max-tokens, or
  any other model-config fields. Earlier versions of this spec referenced such fields —
  they do not exist. Don't write tests for them.
- Sign-in to the WSO2 AI Platform is **not** required to create the agent. Sign-in is only
  needed at runtime when the WSO2 default model provider is invoked.
- Tests share state across the suite. Implemented flow: Create → Edit Instructions →
  Add Memory → Replace Model Provider → Delete. Do not re-order; later tests assume
  the agent created by the first test still exists.
- Default suite name: `sample<retry>` derived from `testInfo.retry + 1`.
- The wizard's existence checks make naming collisions a real risk if earlier tests
  leave artifacts around. Use unique names across files.

## Scenarios deliberately not covered

These were considered and skipped — don't add them without a reason:

- **Auth / Sign-in to WSO2 AI Platform.** Browser OAuth flow with real credentials —
  bad fit for CI. Auth is only needed at agent *runtime*, not at creation/edit.
- **External-key model providers (OpenAI etc.).** Need API keys in CI, brittle, costs
  money on every run.
- **Tool addition.** The `+` button in the agent node is visible but the flow involves
  defining a function first. Higher complexity, deferred.
- **Memory removal.** The Memory section's `...` menu was not walked through; the
  exact label/locator is unverified.
- **Switching back to WSO2 default provider** post-replacement. Single direction tested
  is enough — going back uses the same dropdown.
- **Other provider types** (Anthropic, Azure, Mistral, etc.). Same UI shape as OpenAI;
  one provider type is enough to verify the replacement mechanic.
