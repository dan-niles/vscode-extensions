# Vector Knowledge Base - Test Specification

## Application Overview

The Knowledge Base feature in WSO2 Integrator: BI lets a flow do retrieval-
augmented generation (RAG) against indexed documents. A user creates a
`ai:VectorKnowledgeBase` connection (which itself wires together a Vector Store
and an Embedding Provider), then adds `ingest`, `retrieve`, and `deleteByFilter`
method nodes that operate on the indexed chunks.

Unlike the Model Provider connection (a single artifact), creating a Vector
Knowledge Base produces **three** Ballerina connections in `connections.bal`:
the Vector Store, the Embedding Provider, and the Knowledge Base itself —
because the KB constructor takes the other two as arguments.

## UI Elements Identified

### Buttons and Actions
- **Add Artifact** button on the Overview view
- **Automation** card in the Artifacts panel (id: `automation`)
- **Create** button on the Create New Automation form
- **+** button on the diagram (`data-testid="empty-node-add-button-1"`) opens
  the side panel
- **Knowledge Base** entry under the **AI > RAG** section of the side panel
- **Add Knowledge Base** button at the top of the Knowledge Bases panel
- KB type cards: `Vector Knowledge Base`, `Azure AI Search Knowledge Base`
- Inside the Vector KB form, **Create New Vector Store** and
  **Create New Embedding Model** open sub-flows (these fields start with no
  items in a fresh project).
- Vector Store cards: `In Memory Vector Store`, `Milvus Vector Store`,
  `Pgvector Vector Store`, `Pinecone Vector Store`, `Weaviate Vector Store`
- Embedding Provider cards: `Default Embedding Provider (WSO2)`,
  `Azure Embedding Provider`, `Google Vertex Embedding Provider`,
  `OpenAI Embedding Provider`, `OpenRouter Embedding Provider`
- After save, the saved KB name appears in the Knowledge Bases list and
  expands to reveal **Ingest**, **Retrieve**, and **Delete By Filter** method
  entries.

### Forms

**In Memory Vector Store** (chosen because it has no external dependencies)
- *No required parameters.* Default `Vector Store Name` is `aiInmemoryvectorstore`.
- `Result Type*` (locked, `ai:InMemoryVectorStore`)

**Default Embedding Provider (WSO2)** (chosen because it has no API key)
- *No required parameters.* Default `Embedding Provider Name` is
  `aiWso2embeddingprovider`.
- `Result Type*` (locked, `ai:Wso2EmbeddingProvider`)
- The LS generates `check ai:getDefaultEmbeddingProvider()` for this provider.

**Vector Knowledge Base**
- `Vector Store*` — required. Select dropdown sourced from existing in-scope
  Vector Stores; **Create New Vector Store** opens the sub-flow above.
- `Embedding Model*` — required. Select dropdown for Embedding Providers;
  **Create New Embedding Model** opens the sub-flow above.
- `Chunker` — optional, default `AUTO` (`ai:AUTO`). Other values: `DISABLE`
  or a custom chunker via **Create New Chunker**.
- `Knowledge Base Name*` (input, auto-filled `aiVectorknowledgebase`)
- `Result Type*` (locked, `ai:VectorKnowledgeBase`)

**Ingest method (`<kb> → ingest`)**
- `Documents*` (Record | Expression) — required. The metadata + chunk content
  to be indexed. Defaults to a single-record placeholder
  `{'type: "", content: {}}`. Switch to **Expression** mode to fill via
  Form.fill cmEditor with key `documents`.

**Retrieve method (`<kb> → retrieve`)**
- `Query*` (Text | Expression) — required. The search string. Text mode is
  already a cmEditor (key `query`), so no mode switch is required for Form.fill.
- `Advanced Configurations` (collapsed) — optional max-results / filters.
- `Result*` (input, auto-filled `aiQuerymatch`)
- `Result Type*` (locked, `ai:QueryMatch[]`)

**Delete By Filter method (`<kb> → deleteByFilter`)**
- `Filters*` (Record | Expression) — required. The metadata filter selecting
  which chunks to remove. Defaults to `{filters: []}`. Switch to **Expression**
  mode to fill via Form.fill cmEditor with key `filters`.

### Generated source

After saving each form the LS writes:

`connections.bal`
```ballerina
import ballerina/ai;

final ai:InMemoryVectorStore aiInmemoryvectorstore = check new ();
final ai:Wso2EmbeddingProvider aiWso2embeddingprovider = check ai:getDefaultEmbeddingProvider();
final ai:VectorKnowledgeBase aiVectorknowledgebase = new (aiInmemoryvectorstore, aiWso2embeddingprovider, ai:AUTO);
```

`automation.bal`
```ballerina
import ballerina/ai;
import ballerina/log;

public function main() returns error? {
    do {
        check aiVectorknowledgebase.ingest({'type: "", content: ()});
        ai:QueryMatch[] aiQuerymatch = check aiVectorknowledgebase.retrieve("sample query");
        check aiVectorknowledgebase.deleteByFilter({filters: []});
    } on fail error e {
        log:printError("Error occurred", 'error = e);
        return e;
    }
}
```

## Test Scenarios

### 1. Create Automation (bootstrap a flow to host the knowledge base)

**Steps:**
1. Click **Add Artifact** on the project overview
2. Click the **Automation** card
3. Click **Create** on the Create New Automation form
4. Verify the diagram canvas (`#bi-diagram-canvas`) is visible

**Expected Result:** An empty automation flow is created.

### 2. Add Vector Knowledge Base connection

**Steps:**
1. Click the visible `+` button on the flow link to open the side panel
2. Expand the **AI** section
3. Click **Knowledge Base** under **RAG**
4. Click **Add Knowledge Base**
5. Click **Vector Knowledge Base** (the type card; use exact text match — the
   description "Represents a vector knowledge base ..." is sibling to the
   title and would otherwise match a substring locator)
6. **Inline-create a Vector Store**: click **Create New Vector Store**, click
   **In Memory Vector Store** (no params), click **Save**. Wait for
   `connections.bal` to contain `ai:InMemoryVectorStore aiInmemoryvectorstore`.
   The first connection creation triggers a module pull that can take minutes
   — use a 240s timeout when polling.
7. **Inline-create an Embedding Provider**: click **Create New Embedding
   Model**, click **Default Embedding Provider (WSO2)** (no params), click
   **Save**. Wait for `connections.bal` to contain
   `ai:Wso2EmbeddingProvider aiWso2embeddingprovider`.
8. Click **Save** on the Knowledge Base form (Chunker stays at `AUTO` default).
   Wait for `connections.bal` to contain
   `ai:VectorKnowledgeBase aiVectorknowledgebase`.

**Expected Result:** All three artifacts are present in `connections.bal`.

### 3. Add Ingest method node

**Steps:**
1. The KB save closes the side panel and the do block is still empty (the KB
   is a `final` variable in `connections.bal`, not a diagram node), so the
   visible `+` placeholder is still at `empty-node-add-button-1`. Click it to
   reopen the side panel.
2. The AI section is already expanded from the previous test — calling
   `expandSection('AI')` again would toggle it closed. Go straight to
   `clickNode('Knowledge Base')`.
3. Click `aiVectorknowledgebase` in the Knowledge Bases list to expand it
4. Click **Ingest**
5. Switch the **Documents** field to **Expression** mode (the slider testid
   is `mode-switcher-slider-documents`), then fill the `documents` cmEditor
   with `{'type: "", content: ()}`
6. Click **Save**

**Expected Result:** `automation.bal` contains a `.ingest(` call against
`aiVectorknowledgebase` and the diagram shows a node titled `ingest`.

### 4. Add Retrieve method node

**Steps:**
1. The Ingest save closes the side panel. Hover the link below the ingest
   node and click the `+` button (`clickHoverAddButtonByIndex(1)` — link 1
   is Ingest → ErrorHandler).
2. Click **Knowledge Base** (do not call `expandSection('AI')` — already open)
3. Click `aiVectorknowledgebase`, then **Retrieve**
4. Fill the **Query** field (default Text mode is already a cmEditor) with
   `sample query` via Form.fill cmEditor key `query`
5. Click **Save**

**Expected Result:** `automation.bal` contains a `.retrieve(` call against
`aiVectorknowledgebase`.

### 5. Add Delete By Filter method node

**Steps:**
1. The Retrieve save closes the side panel. Hover the link below the retrieve
   node and click the `+` button (`clickHoverAddButtonByIndex(2)` — link 2 is
   Retrieve → ErrorHandler now that two nodes precede it).
2. Click **Knowledge Base**, then `aiVectorknowledgebase`, then **Delete By
   Filter**
3. Switch the **Filters** field to **Expression** mode (slider testid
   `mode-switcher-slider-filters`), then fill the `filters` cmEditor with
   `{filters: []}`
4. Click **Save**

**Expected Result:** `automation.bal` contains a `.deleteByFilter(` call
against `aiVectorknowledgebase`.

## Notes

- **Why In Memory + Default WSO2.** The Vector Store and Embedding Provider
  picks were made specifically because they have **no required parameters**
  and **no external dependencies** (no DB, no API key). Other choices
  (Pgvector, Pinecone, OpenAI Embedding, etc.) would force the test to
  populate credentials and would fail in CI without those secrets.
- **Three artifacts before the KB.** Unlike model-provider where save produces
  one `final` variable, saving the KB form here produces three — the test
  polls `connections.bal` after each inner save (vector store, embedding
  provider, KB) so a failure in any of the three nested sub-forms surfaces
  immediately rather than at the end.
- **Documents value caveat.** The `documents` field declares
  `ai:Document[]|ai:Chunk[]` in the Ballerina API, but the form's Expression
  mode here accepts a single record literal `{'type: "", content: ()}`. If the
  LS rejects this shape on the first run, wrap it in an array:
  `[{'type: "", content: ()}]`.
- **Side panel state across tests.** Saving any method form (Ingest, Retrieve,
  Delete By Filter) closes the side panel. Subsequent tests must reopen via
  the diagram `+`. This differs from the Model Provider flow, where the panel
  stays open after the connection save (because adding a connection alone
  doesn't add a diagram node and the panel preserves its sub-page).
