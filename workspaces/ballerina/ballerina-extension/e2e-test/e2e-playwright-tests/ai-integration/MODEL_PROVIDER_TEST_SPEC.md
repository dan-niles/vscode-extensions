# Model Provider - Test Specification

## Application Overview

The Model Provider feature in WSO2 Integrator: BI lets a flow make direct LLM
calls without going through an AI Agent. A user creates a Model Provider
connection (OpenAI, Anthropic, Azure OpenAI, Default WSO2, etc.) from the
Direct LLM section of the AI category, then adds `chat` and `generate` method
nodes that invoke the provider.

## UI Elements Identified

### Buttons and Actions
- **Add Artifact** button on the Overview view
- **Automation** card in the Artifacts panel (id: `automation`)
- **Create** button on the Create New Automation form
- **+** button on the diagram (`data-testid="empty-node-add-button-1"`) opens the side panel
- **Model Provider** entry under the **AI > Direct LLM** section of the side panel
- **Add Model Provider** button at the top of the Model Providers panel
- Provider cards: `Default Model Provider (WSO2)`, `Anthropic Model Provider`,
  `Azure OpenAI Model Provider`, `Deepseek Model Provider`,
  `Google Vertex Model Provider`, `Mistral Model Provider`,
  `Ollama Model Provider`, `OpenAI Model Provider`
- After save, the saved provider name appears in the Model Providers list and
  expands to reveal **Chat** and **Generate** method entries.

### Forms

**Anthropic Model Provider**
- `Api Key*` (cmEditor, key: `apiKey`) — The Anthropic API key
- `Model Type*` (vscode-dropdown, no aria-label) — list of model names
- `Model Provider Name*` (input, auto-filled `anthropicModelprovider`)
- `Result Type*` (locked, `anthropic:ModelProvider`)

**Chat method (`<provider> → chat`)**
- `Messages*` (Array | Expression) — required. Defaults to no array.
- `Tools` (Array | Expression) — optional
- `Result*` (input, auto-filled `aiChatassistantmessage`)
- `Result Type*` (locked, `ai:ChatAssistantMessage`)

**Generate method (`<provider> → generate`)**
- `Prompt*` (Prompt | Expression) — required
- `Result*` (input, auto-filled `td`)
- `Expected Type*` (type editor, key: `td`) — required

### Generated source

After saving each form the LS writes:

`connections.bal`
```ballerina
import ballerinax/ai.anthropic;

final anthropic:ModelProvider anthropicModelprovider = check new("test-key", anthropic:CLAUDE_3_5_SONNET_20241022);
```

`automation.bal`
```ballerina
import ballerina/ai;
import ballerina/log;

public function main() returns error? {
    do {
        ai:ChatAssistantMessage aiChatassistantmessage = check anthropicModelprovider->chat([{role: "user", content: "Hello"}]);
        string td = check anthropicModelprovider->generate(`Hello`);
    } on fail error e {
        log:printError("Error occurred", 'error = e);
        return e;
    }
}
```

## Test Scenarios

### 1. Create Automation (Description: bootstrap a flow to host the model provider)

**Steps:**
1. Click **Add Artifact** on the project overview
2. Click the **Automation** card
3. Click **Create** on the Create New Automation form
4. Verify the diagram canvas (`#bi-diagram-canvas`) is visible

**Expected Result:** An empty automation flow is created.

### 2. Add Anthropic Model Provider connection

**Steps:**
1. Click the visible `+` button on the flow link to open the side panel
2. Expand the **AI** section
3. Click **Model Provider** under **Direct LLM**
4. Click **Add Model Provider**
5. Click **Anthropic Model Provider**
6. Fill the `apiKey` cmEditor with a placeholder key like `test-key`
7. Open the Model Type dropdown (no aria-label) and pick the first available
   model (avoids hard-coding a constant name that the LS may rename)
8. Click **Save**

**Expected Result:** `connections.bal` contains `anthropic:ModelProvider anthropicModelprovider`.

### 3. Add Chat method node

**Steps:**
1. Click the saved `anthropicModelprovider` entry in the Model Providers list
   to expand it
2. Click **Chat**
3. Switch the **Messages** field to **Expression** mode and fill the `messages`
   cmEditor with `[{role: "user", content: "Hello"}]`
4. Click **Save**

**Expected Result:** `automation.bal` contains a `->chat(` call against
`anthropicModelprovider` and the diagram shows a node titled `chat`.

### 4. Add Generate method node

**Steps:**
1. Hover the link below the chat node and click the `+` button to reopen the
   side panel
2. Expand **AI**, click **Model Provider**, then click `anthropicModelprovider`
3. Click **Generate**
4. Fill the **Prompt** field (default Prompt mode) with `Hello`
5. Fill the **Expected Type** type editor with `string`
6. Click **Save**

**Expected Result:** `automation.bal` contains a `->generate(` call against
`openaiModelprovider`.
