# Data Loader - Test Specification

## Application Overview

The Data Loader feature in WSO2 Integrator: BI lets a flow ingest source
documents into `ai:Document` values for use in RAG pipelines. A user creates a
Data Loader connection (currently only `Text Data Loader`) from the RAG section
of the AI category, then adds a `load` method node that produces
`ai:Document[]|ai:Document`.

## UI Elements Identified

### Buttons and Actions
- **Add Artifact** button on the Overview view
- **Automation** card in the Artifacts panel (id: `automation`)
- **Create** button on the Create New Automation form
- **+** button on the diagram (`data-testid="empty-node-add-button-1"`) opens
  the side panel
- **Data Loader** entry under the **AI > RAG** section of the side panel
- **Add Data Loader** button at the top of the Data Loaders panel
- Loader cards: `Text Data Loader`
- After save, the saved data loader name appears in the Data Loaders list and
  expands to reveal a single **Load** method entry.

### Forms

**Text Data Loader (`ai : Data Loader`)**
- `Paths` (REPEATABLE_LIST, key: `paths`) — Save is gated until the array is
  initialised (touched), even though `string... paths` is variadic. Renders as
  a FormArrayEditor with an **Initialize Array** button. Each item's inner
  ExpressionEditor is keyed by `crypto.randomUUID()`, so address items via
  the wrapper testids: `array-editor-paths` (container) and
  `array-editor-paths-item-${index}` (per item).
- `Data Loader Name*` (input, auto-filled `aiTextdataloader`)
- `Result Type*` (locked, `ai:TextDataLoader`)

**Load method (`<loader>.load`)**
- No required parameters — header reads "This is a simple operation that
  requires no parameters. Specify where to store the result to finish."
- `Result*` (input, auto-filled `aiDocumentAiDocument`)
- `Result Type*` (locked, `ai:Document[]|ai:Document`)

### Generated source

After saving each form the LS writes:

`connections.bal`
```ballerina
import ballerina/ai;

final ai:TextDataLoader aiTextdataloader = check new ("./README.md");
```

`automation.bal`
```ballerina
import ballerina/ai;
import ballerina/log;

public function main() returns error? {
    do {
        ai:Document[]|ai:Document aiDocumentAiDocument = check aiTextdataloader.load();
    } on fail error e {
        log:printError("Error occurred", 'error = e);
        return e;
    }
}
```

Note `.load()` (period), not `->load()` — `load` is declared as
`public isolated function`, not `remote function`.

## Test Scenarios

### 1. Create Automation (Description: bootstrap a flow to host the data loader)

**Steps:**
1. Click **Add Artifact** on the project overview
2. Click the **Automation** card
3. Click **Create** on the Create New Automation form
4. Verify the diagram canvas (`#bi-diagram-canvas`) is visible

**Expected Result:** An empty automation flow is created.

### 2. Add Text Data Loader connection

**Steps:**
1. Click the visible `+` button on the flow link to open the side panel
2. Expand the **AI** section (already expanded on first open in some builds)
3. Click **Data Loader** under **RAG**
4. Click **Add Data Loader**
5. Click **Text Data Loader**
6. Click **Initialize Array** to add the first Paths item (Save is otherwise
   disabled)
7. Click into the first item's textarea
   (`[data-testid="array-editor-paths-item-0"] textarea`) and type a dummy
   path such as `./README.md`
8. Click **Save**

**Expected Result:** `connections.bal` contains
`ai:TextDataLoader aiTextdataloader = check new ("./README.md")`.

### 3. Add Load method node

**Steps:**
1. Saving the data loader leaves the side panel open on the **Data Loaders**
   sub-page with the saved loader listed and collapsed (same behavior as Model
   Provider — Save does *not* close the panel and does *not* add a diagram
   node, since data loaders are module-level `final` declarations). No need
   to re-navigate via the diagram `+`.
2. Click the saved `aiTextdataloader` entry to expand it
3. Click **Load**
4. Click **Save** (no parameters required)

**Expected Result:** `automation.bal` contains an `aiTextdataloader.load()`
call (with `.`, not `->`) and the diagram shows a node titled `load`.
