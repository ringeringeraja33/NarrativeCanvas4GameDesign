const BOARD_WIDTH = 4000;
const BOARD_HEIGHT = 2600;

const nodeTypes = {
  Entry: { badge: "E", color: "#cdd6f4", width: 170 },
  Content: { badge: "T", color: "#61afef", width: 250 },
  Dialog: { badge: "D", color: "#56b6c2", width: 250 },
  Choice: { badge: "?", color: "#d19a66", width: 250 },
  Condition: { badge: "C", color: "#e06c75", width: 240 },
  Set: { badge: "$", color: "#98c379", width: 240 },
  Jump: { badge: "J", color: "#abb2bf", width: 190 },
  Marker: { badge: "M", color: "#7fdbca", width: 190 },
  Event: { badge: "EV", color: "#98c379", width: 420 }
};

const eventSheetColumns = [
  { key: "act", label: "ACT", width: "72px" },
  { key: "chapter", label: "Chap.", width: "86px" },
  { key: "characterEncountered", label: "Character Encountered", width: "180px" },
  { key: "eventDescription", label: "Description of Event(s)", width: "320px" },
  { key: "levels", label: "Levels", width: "96px" },
  { key: "beatList", label: "List of Beat", width: "180px" },
  { key: "questEpisode", label: "Quest Ep.", width: "120px" },
  { key: "timeWeather", label: "Time/Weather", width: "150px" },
  { key: "eventType", label: "Type of Event(s)", width: "160px" },
  { key: "eventElements", label: "Elements in Event", width: "300px", readonly: true }
];

const sampleProject = {
  title: "The Adventure",
  notes: "Sketch scenes as nodes, connect them with ports, then play from Entry.",
  variables: {
    hero_name: "Hero",
    ancestry: "Great ancestry"
  },
  characters: [
    {
      id: "c0",
      name: "Hero",
      role: "Player character",
      voice: "Brave, curious, direct",
      notes: "The default protagonist name used by dialogue nodes and variables."
    },
    {
      id: "c1",
      name: "The Stranger",
      role: "Guide",
      voice: "Mysterious, confident",
      notes: "Introduces the journey and pushes the first major choice."
    }
  ],
  nodes: [
    { id: "n0", type: "Entry", title: "Start", body: "Adventure Begins", x: 80, y: 140, act: "I", chapter: "1", eventDescription: "Adventure Begins", beatList: "Opening", eventType: "Entry" },
    { id: "n1", type: "Content", title: "Fancy to See Wonders?", body: "Dark was the night. Wandering and lost, the hero meets a stranger in the fog.", x: 260, y: 105, act: "I", chapter: "1", characterEncountered: "The Stranger", levels: "Village road", beatList: "Inciting encounter", questEpisode: "Prologue", timeWeather: "Night / fog", eventType: "Exploration" },
    { id: "n2", type: "Dialog", title: "Hero", body: "Down the rabbit hole?!\nI'll take the leap!", x: 300, y: 330, act: "I", chapter: "1", characterEncountered: "Hero", beatList: "Accepts call", eventType: "Dialog" },
    { id: "n3", type: "Set", title: "Set Variable", body: "hero_name = Hero", variable: "hero_name", value: "Hero", x: 620, y: 350, act: "I", chapter: "1", beatList: "State update", eventType: "System" },
    { id: "n4", type: "Event", title: "Knowing the Hero", body: "A frame keeps related beats together.", x: 900, y: 318, act: "I", chapter: "1", beatList: "Sequence group", eventType: "" },
    { id: "n5", type: "Choice", title: "The Stranger", body: "Choose a path.", choices: ["Cross the seven seas", "Return to the village"], x: 970, y: 475, act: "I", chapter: "1", characterEncountered: "The Stranger", beatList: "Branch choice", eventType: "Choice" },
    { id: "n6", type: "Content", title: "Great ancestry!", body: "{hero_name} of the {ancestry}, a long line of braves ruling the eastern realm.", x: 1335, y: 420, act: "I", chapter: "1", levels: "Eastern realm", beatList: "World reveal", eventType: "Lore" },
    { id: "n7", type: "Dialog", title: "The Stranger", body: "We'll cross the seven seas. We'll find charms and treasures of the seven realms.", x: 745, y: 148, act: "I", chapter: "1", characterEncountered: "The Stranger", beatList: "Quest promise", questEpisode: "Seven seas", eventType: "Dialog" },
    { id: "n8", type: "Marker", title: "WIP", body: "Keep drafting here.", x: 1125, y: 170, act: "I", chapter: "1", beatList: "Draft marker", eventType: "Marker" },
    { id: "n9", type: "Condition", title: "Has a name?", body: "hero_name == Hero", condition: "hero_name == Hero", x: 1405, y: 250, act: "I", chapter: "1", beatList: "Condition gate", eventType: "Condition" },
    { id: "n10", type: "Jump", title: "R1", body: "1st Realm", x: 1575, y: 170, act: "I", chapter: "2", levels: "1st Realm", beatList: "Scene transition", questEpisode: "Realm 1", eventType: "Jump" }
  ],
  links: [
    { id: "l0", from: "n0", to: "n1" },
    { id: "l1", from: "n1", to: "n2" },
    { id: "l2", from: "n2", to: "n3" },
    { id: "l3", from: "n3", to: "n5" },
    { id: "l4", from: "n5", to: "n6", label: "Cross" },
    { id: "l5", from: "n2", to: "n7" },
    { id: "l6", from: "n7", to: "n8" },
    { id: "l7", from: "n8", to: "n9" },
    { id: "l8", from: "n9", to: "n10" }
  ]
};

const fileViews = {
  adventure: "The Adventure.canvas",
  characters: "Characters.md",
  events: "Events Sheet.csv",
  variables: "Variables.json"
};

const state = {
  project: cloneProject(sampleProject),
  selectedNodeId: "n1",
  selectedLinkId: null,
  panel: "project",
  activeFileId: "adventure",
  view: { x: 0, y: 0, scale: 0.82 },
  connectingFrom: null,
  draggingNode: null,
  resizingNode: null,
  panning: null,
  contextNodeId: null,
  playNodeId: null,
  playPath: [],
  search: ""
};

const dom = {};
let initialized = false;

window.NarrativeCanvasApp = {
  init: initNarrativeCanvas
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initNarrativeCanvas, { once: true });
} else if (document.querySelector(".app-shell")) {
  initNarrativeCanvas();
}

async function initNarrativeCanvas() {
  if (initialized) return;
  bindDom();
  const missingElements = getMissingDomElements();
  if (missingElements.length) {
    showStartupError(`Narrative Canvas is missing required UI elements: ${missingElements.join(", ")}`);
    return;
  }
  initialized = true;
  await loadFromVault(false);
  renderAll();
  bindEvents();
  centerView(false);
}

function bindDom() {
  dom.root = document.querySelector(".app-shell");
  dom.viewport = document.getElementById("canvasViewport");
  dom.canvasPanel = document.getElementById("canvasPanel");
  dom.charactersPanel = document.getElementById("charactersPanel");
  dom.variablesPanel = document.getElementById("variablesPanel");
  dom.eventsPanel = document.getElementById("eventsPanel");
  dom.content = document.getElementById("canvasContent");
  dom.nodeLayer = document.getElementById("nodeLayer");
  dom.linkLayer = document.getElementById("linkLayer");
  dom.palette = document.getElementById("nodePalette");
  dom.zoomReadout = document.getElementById("zoomReadout");
  dom.projectPanel = document.getElementById("projectPanel");
  dom.nodePanel = document.getElementById("nodePanel");
  dom.storyPanel = document.getElementById("storyPanel");
  dom.inspectorTitle = document.getElementById("inspectorTitle");
  dom.statusText = document.getElementById("statusText");
  dom.queryInput = document.getElementById("queryInput");
  dom.matchCount = document.getElementById("matchCount");
  dom.fileInput = document.getElementById("fileInput");
  dom.activeFileTab = document.getElementById("activeFileTab");
  dom.fileScopedActions = [...document.querySelectorAll("[data-files]")];
  dom.notes = document.getElementById("projectNotes");
  dom.hint = document.getElementById("selectionHint");
  dom.minimap = document.getElementById("minimap");
  dom.nodeContextMenu = document.getElementById("nodeContextMenu");
  dom.playDialog = document.getElementById("playDialog");
  dom.confirmDialog = document.getElementById("confirmDialog");
  dom.playTitle = document.getElementById("playTitle");
  dom.playBody = document.getElementById("playBody");
  dom.playActions = document.getElementById("playActions");
}

function getMissingDomElements() {
  return Object.entries(dom)
    .filter(([, element]) => !element)
    .map(([key]) => key);
}

function showStartupError(message) {
  console.error(message);
  document.body.innerHTML = `
    <main class="startup-error">
      <h1>Narrative Canvas failed to load</h1>
      <p>${escapeHtml(message)}</p>
    </main>
  `;
}

function bindEvents() {
  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("contextmenu", handleContextMenu);
  document.addEventListener("input", handleInput);
  document.addEventListener("change", handleChange);
  document.addEventListener("keydown", handleKeyDown);
  window.addEventListener("resize", () => renderLinks());
  window.addEventListener("scroll", hideNodeContextMenu, true);

  dom.viewport.addEventListener("pointerdown", handleViewportPointerDown);
  dom.viewport.addEventListener("pointermove", handleViewportPointerMove);
  dom.viewport.addEventListener("pointerup", endPointerActions);
  dom.viewport.addEventListener("pointerleave", endPointerActions);
  dom.viewport.addEventListener("wheel", handleWheel, { passive: false });

  dom.fileInput.addEventListener("change", importJsonFile);
  dom.confirmDialog.addEventListener("close", () => {
    if (dom.confirmDialog.returnValue === "confirm") newProject();
  });
}

function cloneProject(project) {
  return JSON.parse(JSON.stringify(project));
}

function renderAll() {
  hideNodeContextMenu();
  renderShellState();
  renderPalette();
  renderTransform();
  renderNodes();
  renderLinks();
  renderWorkspaceFile();
  renderInspector();
  renderMinimap();
  updateStatus();
}

function renderShellState() {
  document.querySelectorAll(".tree-item[data-file-id]").forEach((button) => {
    const isActive = button.dataset.fileId === state.activeFileId;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  if (dom.activeFileTab) {
    dom.activeFileTab.textContent = fileViews[state.activeFileId] || fileViews.adventure;
  }

  dom.fileScopedActions.forEach((button) => {
    const files = String(button.dataset.files || "").split(/\s+/);
    button.hidden = !files.includes(state.activeFileId);
  });
}

function renderWorkspaceFile() {
  const activeFile = state.activeFileId || "adventure";
  dom.canvasPanel.classList.toggle("active", activeFile === "adventure");
  dom.charactersPanel.classList.toggle("active", activeFile === "characters");
  dom.variablesPanel.classList.toggle("active", activeFile === "variables");
  dom.eventsPanel.classList.toggle("active", activeFile === "events");

  if (activeFile === "characters") renderCharactersPage();
  if (activeFile === "variables") renderVariablesPage();
  if (activeFile === "events") renderEventsSheetPage();
}

function renderCharactersPage() {
  const characters = getCharacters();
  const dialogNodes = state.project.nodes.filter((node) => node.type === "Dialog");
  dom.charactersPanel.innerHTML = `
    <div class="document-shell">
      <header class="document-header">
        <div>
          <span class="pane-kicker">Markdown</span>
          <h2>Characters.md</h2>
          <div class="document-meta">${characters.length} characters, ${dialogNodes.length} dialog nodes</div>
        </div>
        <button class="small-button" data-action="add-character">Add character</button>
      </header>
      <div class="character-grid">
        ${characters.map((character) => renderCharacterCard(character)).join("") || `<div class="empty-state">No characters yet.</div>`}
      </div>
    </div>
  `;
}

function renderCharacterCard(character) {
  const usage = getCharacterDialogNodes(character.name);
  return `
    <article class="character-card">
      <div class="character-card-header">
        <label class="field">
          <span>Name</span>
          <input data-character-id="${escapeAttr(character.id)}" data-character-field="name" value="${escapeAttr(character.name)}">
        </label>
        <button class="icon-button danger-button" title="Delete character" data-action="delete-character" data-character-id="${escapeAttr(character.id)}">x</button>
      </div>
      <div class="field-row">
        <label class="field">
          <span>Role</span>
          <input data-character-id="${escapeAttr(character.id)}" data-character-field="role" value="${escapeAttr(character.role || "")}">
        </label>
        <label class="field">
          <span>Voice</span>
          <input data-character-id="${escapeAttr(character.id)}" data-character-field="voice" value="${escapeAttr(character.voice || "")}">
        </label>
      </div>
      <label class="field">
        <span>Notes</span>
        <textarea data-character-id="${escapeAttr(character.id)}" data-character-field="notes">${escapeHtml(character.notes || "")}</textarea>
      </label>
      <div class="linked-node-list">
        <div class="document-meta">${usage.length} linked dialog nodes</div>
        ${usage.map((node) => `
          <button class="linked-node" data-action="select-node" data-node-id="${escapeAttr(node.id)}">
            <span>${escapeHtml(node.title || node.id)}</span>
            <span>${escapeHtml(node.id)}</span>
          </button>
        `).join("") || `<div class="linked-node empty">No matching dialog nodes</div>`}
      </div>
    </article>
  `;
}

function renderVariablesPage() {
  const variables = state.project.variables || {};
  const entries = Object.entries(variables);
  dom.variablesPanel.innerHTML = `
    <div class="document-shell">
      <header class="document-header">
        <div>
          <span class="pane-kicker">JSON</span>
          <h2>Variables.json</h2>
          <div class="document-meta">${entries.length} variables</div>
        </div>
        <button class="small-button" data-action="add-variable">Add variable</button>
      </header>
      <div class="variable-table">
        <div class="variable-row variable-heading">
          <span>Key</span>
          <span>Type</span>
          <span>Value</span>
          <span></span>
        </div>
        ${entries.map(([key, value]) => renderVariableRow(key, value)).join("") || `<div class="empty-state">No variables yet.</div>`}
      </div>
      <label class="field json-field">
        <span>Variables JSON</span>
        <textarea data-project-field="variables">${escapeHtml(JSON.stringify(variables, null, 2))}</textarea>
      </label>
    </div>
  `;
}

function renderEventsSheetPage() {
  const rows = getEventRows();
  dom.eventsPanel.innerHTML = `
    <div class="document-shell event-sheet-shell">
      <header class="document-header">
        <div>
          <span class="pane-kicker">CSV</span>
          <h2>Events Sheet.csv</h2>
          <div class="document-meta">${rows.length} event rows from canvas nodes</div>
        </div>
        <button class="small-button" data-action="export-event-sheet">Export CSV</button>
      </header>
      <div class="event-sheet-scroll">
        <table class="event-sheet-table">
          <colgroup>
            <col class="event-node-col">
            ${eventSheetColumns.map((column) => `<col style="width:${column.width}">`).join("")}
          </colgroup>
          <thead>
            <tr>
              <th>Node</th>
              ${eventSheetColumns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows.map((node) => renderEventSheetRow(node)).join("") || `<tr><td colspan="${eventSheetColumns.length + 1}" class="event-sheet-empty">No event nodes yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderEventSheetRow(node) {
  return `
    <tr>
      <th data-action="select-node" data-node-id="${escapeAttr(node.id)}">
        <div class="event-node-link">
          <span>${escapeHtml(node.title || node.id)}</span>
          <small>${escapeHtml(node.type)} ${escapeHtml(node.id)}</small>
        </div>
      </th>
      ${eventSheetColumns.map((column) => renderEventCell(node, column)).join("")}
    </tr>
  `;
}

function renderEventCell(node, column) {
  const value = getNodeEventValue(node, column.key);
  if (column.readonly) {
    return `<td><div class="event-elements-cell">${escapeHtml(value)}</div></td>`;
  }
  const control = column.key === "eventDescription"
    ? `<textarea data-event-node-id="${escapeAttr(node.id)}" data-event-field="${column.key}">${escapeHtml(value)}</textarea>`
    : `<input data-event-node-id="${escapeAttr(node.id)}" data-event-field="${column.key}" value="${escapeAttr(value)}">`;
  return `<td>${control}</td>`;
}

function renderVariableRow(key, value) {
  const type = variableType(value);
  return `
    <div class="variable-row">
      <input data-variable-key="${escapeAttr(key)}" data-variable-field="key" value="${escapeAttr(key)}">
      <select data-variable-key="${escapeAttr(key)}" data-variable-field="type">
        ${["string", "number", "boolean", "json"].map((option) => `<option value="${option}" ${option === type ? "selected" : ""}>${option}</option>`).join("")}
      </select>
      <input data-variable-key="${escapeAttr(key)}" data-variable-field="value" value="${escapeAttr(formatVariableValue(value))}">
      <button class="icon-button danger-button" title="Delete variable" data-action="delete-variable" data-variable-key="${escapeAttr(key)}">x</button>
    </div>
  `;
}

function renderPalette() {
  dom.palette.innerHTML = Object.entries(nodeTypes)
    .map(([type, meta]) => `
      <button class="palette-item" data-action="add-node" data-type="${type}">
        <span class="palette-badge" style="--node-color:${meta.color}">${meta.badge}</span>
        ${escapeHtml(getNodeTypeLabel(type))}
      </button>
    `)
    .join("");
}

function renderTransform() {
  dom.content.style.transform = `translate(${state.view.x}px, ${state.view.y}px) scale(${state.view.scale})`;
  dom.zoomReadout.textContent = `${Math.round(state.view.scale * 100)}%`;
}

function renderNodes() {
  const query = state.search.trim().toLowerCase();
  dom.nodeLayer.innerHTML = state.project.nodes
    .map((node) => {
      const meta = nodeTypes[node.type] || nodeTypes.Content;
      const isSelected = node.id === state.selectedNodeId;
      const isFrame = node.type === "Event";
      const match = query && nodeMatches(node, query);
      const width = node.width || meta.width || 230;
      const height = nodeHeight(node);
      return `
        <article class="node ${isFrame ? "frame" : ""} ${isSelected ? "selected" : ""}" data-node-id="${node.id}" style="left:${node.x}px; top:${node.y}px; width:${width}px; height:${height}px; --node-color:${meta.color}; ${match ? "outline:1px solid var(--accent-orange);" : ""}">
          <button class="port input" data-port="input" data-node-id="${node.id}" title="Input"></button>
          <div class="node-header" data-drag-handle="true" data-node-id="${node.id}">
            <span class="node-icon">${meta.badge}</span>
            <span class="node-type">${escapeHtml(getNodeTypeLabel(node.type))}</span>
            <span class="node-id">${node.id.replace("n", "#")}</span>
          </div>
          <div class="node-body">
            <div class="node-title">${escapeHtml(node.title || "Untitled")}</div>
            <div class="node-text">${escapeHtml(displayBody(node))}</div>
            ${node.type === "Choice" && Array.isArray(node.choices) ? `<div class="node-meta">${node.choices.length} choices</div>` : ""}
          </div>
          <button class="port output" data-port="output" data-node-id="${node.id}" title="Output"></button>
          <button class="node-resize-handle right" data-resize-handle="e" data-node-id="${node.id}" title="Resize width" aria-label="Resize width"></button>
          <button class="node-resize-handle bottom" data-resize-handle="s" data-node-id="${node.id}" title="Resize height" aria-label="Resize height"></button>
          <button class="node-resize-handle corner" data-resize-handle="se" data-node-id="${node.id}" title="Resize node" aria-label="Resize node"></button>
        </article>
      `;
    })
    .join("");

  const matches = query ? state.project.nodes.filter((node) => nodeMatches(node, query)).length : 0;
  dom.matchCount.textContent = `${matches} matches`;
}

function getNodeTypeLabel(type) {
  return type === "Event" ? "Event Frame" : type;
}

function renderLinks() {
  const linkSvg = [
    `<defs>
      <marker id="arrow-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(220, 221, 222, 0.72)"></path>
      </marker>
    </defs>`
  ];

  state.project.links.forEach((link) => {
    const from = getNode(link.from);
    const to = getNode(link.to);
    if (!from || !to) return;
    const path = linkPath(getOutputPoint(from), getInputPoint(to));
    linkSvg.push(`<path class="link-path ${link.id === state.selectedLinkId ? "selected" : ""}" d="${path}" marker-end="url(#arrow-head)" data-link-id="${link.id}"></path>`);
    if (link.label) {
      const mid = midpoint(getOutputPoint(from), getInputPoint(to));
      linkSvg.push(`<text x="${mid.x}" y="${mid.y - 8}" fill="#a8a8a8" font-size="12" text-anchor="middle">${escapeHtml(link.label)}</text>`);
    }
  });

  if (state.connectingFrom) {
    const from = getNode(state.connectingFrom);
    if (from) {
      const path = linkPath(getOutputPoint(from), state.connectingTo || getOutputPoint(from));
      linkSvg.push(`<path class="link-path pending" d="${path}"></path>`);
    }
  }

  dom.linkLayer.innerHTML = linkSvg.join("");
}

function renderInspector() {
  const activeNode = getNode(state.selectedNodeId);
  dom.inspectorTitle.textContent = state.panel === "node" && activeNode ? activeNode.title : titleCase(state.panel);
  renderInspectorTabs();
  renderProjectPanel();
  renderNodePanel(activeNode);
  renderStoryPanel();
  dom.notes.value = state.project.notes || "";
}

function renderInspectorTabs() {
  document.querySelectorAll(".inspector-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.panel === state.panel);
  });
  document.querySelectorAll(".inspector-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `${state.panel}Panel`);
  });
}

function renderProjectPanel() {
  const links = state.project.links.length;
  const nodeCount = state.project.nodes.length;
  const variableCount = Object.keys(state.project.variables || {}).length;
  dom.projectPanel.innerHTML = `
    <div class="form-stack">
      <label class="field">
        <span>Project title</span>
        <input data-project-field="title" value="${escapeAttr(state.project.title)}">
      </label>
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-label">Nodes</div><div class="stat-value">${nodeCount}</div></div>
        <div class="stat-card"><div class="stat-label">Links</div><div class="stat-value">${links}</div></div>
        <div class="stat-card"><div class="stat-label">Variables</div><div class="stat-value">${variableCount}</div></div>
        <div class="stat-card"><div class="stat-label">Zoom</div><div class="stat-value">${Math.round(state.view.scale * 100)}%</div></div>
      </div>
      <div class="button-row">
        <button class="small-button" data-action="export-json">Export JSON</button>
        <button class="small-button" data-action="export-image">Export image</button>
        <button class="small-button" data-action="export-html">Export HTML</button>
        <button class="small-button" data-action="import-json">Import JSON</button>
      </div>
    </div>
  `;
}

function renderNodePanel(node) {
  if (!node) {
    dom.nodePanel.innerHTML = `<div class="empty-state">Select a node to edit it.</div>`;
    return;
  }
  dom.nodePanel.innerHTML = `
    <div class="form-stack">
      <label class="field">
        <span>Type</span>
        <select data-node-field="type">
          ${Object.keys(nodeTypes).map((type) => `<option value="${type}" ${node.type === type ? "selected" : ""}>${escapeHtml(getNodeTypeLabel(type))}</option>`).join("")}
        </select>
      </label>
      <label class="field">
        <span>${escapeHtml(getNodeTitleLabel(node))}</span>
        <input data-node-field="title" value="${escapeAttr(node.title || "")}">
      </label>
      ${renderNodeBodyField(node)}
      ${renderTypeFields(node)}
      ${node.type === "Event" ? renderEventFields(node) : ""}
      <div class="field-row">
        <label class="field">
          <span>X</span>
          <input type="number" data-node-field="x" value="${Math.round(node.x)}">
        </label>
        <label class="field">
          <span>Y</span>
          <input type="number" data-node-field="y" value="${Math.round(node.y)}">
        </label>
      </div>
      <div class="button-row">
        <button class="small-button" data-action="duplicate-node">Duplicate</button>
        <button class="small-button" data-action="delete-node">Delete</button>
        <button class="small-button" data-action="focus-node">Focus</button>
      </div>
    </div>
  `;
}

function getNodeTitleLabel(node) {
  const labels = {
    Entry: "Start label",
    Content: "Scene title",
    Dialog: "Speaker",
    Choice: "Choice prompt",
    Condition: "Gate name",
    Set: "Action name",
    Jump: "Destination label",
    Marker: "Marker label",
    Event: "Event title"
  };
  return labels[node.type] || "Title";
}

function getNodeBodyLabel(node) {
  const labels = {
    Entry: "Opening text",
    Content: "Narration",
    Dialog: "Line",
    Choice: "Prompt text",
    Jump: "Destination note",
    Marker: "Note",
    Event: "Event description"
  };
  return labels[node.type] || "Content";
}

function renderNodeBodyField(node) {
  if (node.type === "Set" || node.type === "Condition") return "";
  return `
    <label class="field">
      <span>${escapeHtml(getNodeBodyLabel(node))}</span>
      <textarea data-node-field="body">${escapeHtml(node.body || "")}</textarea>
    </label>
  `;
}

function renderEventFields(node) {
  return `
    <section class="event-fields">
      <h3>Event Sheet</h3>
      <div class="field-row">
        <label class="field"><span>ACT</span><input data-node-field="act" value="${escapeAttr(getNodeEventValue(node, "act"))}"></label>
        <label class="field"><span>Chap.</span><input data-node-field="chapter" value="${escapeAttr(getNodeEventValue(node, "chapter"))}"></label>
      </div>
      <label class="field">
        <span>Character Encountered</span>
        <input data-node-field="characterEncountered" value="${escapeAttr(getNodeEventValue(node, "characterEncountered"))}">
      </label>
      <label class="field">
        <span>Description of Event(s)</span>
        <textarea data-node-field="eventDescription">${escapeHtml(getNodeEventValue(node, "eventDescription"))}</textarea>
      </label>
      <div class="field-row">
        <label class="field"><span>Levels</span><input data-node-field="levels" value="${escapeAttr(getNodeEventValue(node, "levels"))}"></label>
        <label class="field"><span>Quest Ep.</span><input data-node-field="questEpisode" value="${escapeAttr(getNodeEventValue(node, "questEpisode"))}"></label>
      </div>
      <label class="field">
        <span>List of Beat</span>
        <input data-node-field="beatList" value="${escapeAttr(getNodeEventValue(node, "beatList"))}">
      </label>
      <div class="field-row">
        <label class="field"><span>Time/Weather</span><input data-node-field="timeWeather" value="${escapeAttr(getNodeEventValue(node, "timeWeather"))}"></label>
        <label class="field"><span>Type of Event(s)</span><input data-node-field="eventType" value="${escapeAttr(getNodeEventValue(node, "eventType"))}"></label>
      </div>
    </section>
  `;
}

function renderTypeFields(node) {
  if (node.type === "Choice") {
    return `
      <label class="field">
        <span>Choices, one per line</span>
        <textarea data-node-field="choices">${escapeHtml((node.choices || []).join("\n"))}</textarea>
      </label>
    `;
  }
  if (node.type === "Set") {
    return `
      <div class="field-row">
        <label class="field"><span>Variable</span><input data-node-field="variable" value="${escapeAttr(node.variable || "")}"></label>
        <label class="field"><span>Value</span><input data-node-field="value" value="${escapeAttr(node.value || "")}"></label>
      </div>
    `;
  }
  if (node.type === "Condition") {
    return `
      <label class="field">
        <span>Condition</span>
        <input data-node-field="condition" value="${escapeAttr(node.condition || "")}" placeholder="hero_name == Hero">
      </label>
    `;
  }
  return "";
}

function renderStoryPanel() {
  const ordered = getReachableStory();
  dom.storyPanel.innerHTML = `
    <div class="story-panel-header">
      <div class="document-meta">${ordered.filter((node) => node.type !== "Event").length} preview pages</div>
      <button class="small-button" data-action="play">Run</button>
    </div>
    <div class="story-list">
      ${ordered.map((node, index) => `
        <article class="story-item">
          <div>
            <span class="story-item-title">${index + 1}. ${escapeHtml(node.title || node.type)}</span>
            <span class="story-item-meta">${node.type} ${node.id}</span>
          </div>
          <button class="story-focus-button" data-action="select-node" data-node-id="${node.id}">Focus</button>
        </article>
      `).join("") || `<div class="empty-state">No entry path found.</div>`}
    </div>
  `;
}

function renderMinimap() {
  dom.minimap.innerHTML = state.project.nodes
    .map((node) => {
      const meta = nodeTypes[node.type] || nodeTypes.Content;
      const x = Math.max(2, Math.min(164, node.x / BOARD_WIDTH * 180));
      const y = Math.max(2, Math.min(106, node.y / BOARD_HEIGHT * 118));
      return `<span class="minimap-node" style="left:${x}px; top:${y}px; --node-color:${meta.color}"></span>`;
    })
    .join("");
}

function handleDocumentClick(event) {
  if (!isNarrativeCanvasTarget(event.target)) return;
  const layerTarget = event.target.closest("[data-layer-action]");
  const actionTarget = event.target.closest("[data-action]");
  const fileTarget = event.target.closest("[data-file-id]");
  const panelTarget = event.target.closest("[data-panel]");
  const port = event.target.closest("[data-port]");
  const link = event.target.closest("[data-link-id]");
  const node = event.target.closest("[data-node-id]");

  if (layerTarget) {
    moveContextNode(layerTarget.dataset.layerAction);
    return;
  }

  if (!dom.nodeContextMenu?.contains(event.target)) hideNodeContextMenu();

  if (port) {
    handlePortClick(port);
    event.stopPropagation();
    return;
  }

  if (link) {
    state.selectedLinkId = link.dataset.linkId;
    state.selectedNodeId = null;
    renderAll();
    return;
  }

  if (panelTarget) {
    state.panel = panelTarget.dataset.panel;
    renderInspector();
    return;
  }

  if (fileTarget) {
    selectFile(fileTarget.dataset.fileId);
    return;
  }

  if (actionTarget) {
    handleAction(actionTarget);
    return;
  }

  if (node && !event.target.closest("[data-drag-handle]")) {
    selectNode(node.dataset.nodeId);
  }
}

function handleContextMenu(event) {
  if (!isNarrativeCanvasTarget(event.target)) return;
  const nodeElement = event.target.closest(".node[data-node-id]");
  if (!nodeElement) {
    hideNodeContextMenu();
    return;
  }

  event.preventDefault();
  const node = getNode(nodeElement.dataset.nodeId);
  if (!node) return;
  state.activeFileId = "adventure";
  state.selectedNodeId = node.id;
  state.selectedLinkId = null;
  state.panel = "node";
  renderShellState();
  renderNodes();
  renderLinks();
  renderInspector();
  showNodeContextMenu(node.id, event.clientX, event.clientY);
}

function handleAction(target) {
  const action = target.dataset.action;
  if (action === "add-node") addNode(target.dataset.type);
  if (action === "new-project") showNewProjectConfirm();
  if (action === "add-character") addCharacter();
  if (action === "delete-character") deleteCharacter(target.dataset.characterId);
  if (action === "add-variable") addVariable();
  if (action === "delete-variable") deleteVariable(target.dataset.variableKey);
  if (action === "zoom-in") setZoom(state.view.scale + 0.1);
  if (action === "zoom-out") setZoom(state.view.scale - 0.1);
  if (action === "center-view") centerView();
  if (action === "export-json") exportJson();
  if (action === "export-characters-md") exportCharactersMarkdown();
  if (action === "export-image") exportImage();
  if (action === "export-html") exportHtml();
  if (action === "export-variables-json") exportVariablesJson();
  if (action === "export-event-sheet") exportEventSheetCsv();
  if (action === "import-json") dom.fileInput.click();
  if (action === "play") openPreview();
  if (action === "duplicate-node") duplicateSelectedNode();
  if (action === "delete-node") deleteSelectedNode();
  if (action === "focus-node") focusSelectedNode();
  if (action === "select-node") selectNode(target.dataset.nodeId);
  if (action === "play-next") advancePreview(target.dataset.nodeId);
  if (action === "play-prev") previousPreview();
  if (action === "restart-play") openPreview();
}

function showNodeContextMenu(nodeId, clientX, clientY) {
  if (!dom.nodeContextMenu) return;
  state.contextNodeId = nodeId;
  dom.nodeContextMenu.hidden = false;
  const menuRect = dom.nodeContextMenu.getBoundingClientRect();
  const left = Math.min(clientX, window.innerWidth - menuRect.width - 8);
  const top = Math.min(clientY, window.innerHeight - menuRect.height - 8);
  dom.nodeContextMenu.style.left = `${Math.max(8, left)}px`;
  dom.nodeContextMenu.style.top = `${Math.max(8, top)}px`;
}

function hideNodeContextMenu() {
  state.contextNodeId = null;
  if (!dom.nodeContextMenu) return;
  dom.nodeContextMenu.hidden = true;
}

function moveContextNode(action) {
  const nodeId = state.contextNodeId;
  if (!nodeId) return;
  const changed = moveNodeLayer(nodeId, action);
  hideNodeContextMenu();
  if (!changed) return;
  state.selectedNodeId = nodeId;
  renderNodes();
  renderLinks();
  renderMinimap();
  renderInspector();
  setStatus("Node layer updated.");
}

function moveNodeLayer(nodeId, action) {
  const nodes = state.project.nodes;
  const index = nodes.findIndex((node) => node.id === nodeId);
  if (index < 0) return false;
  const [node] = nodes.splice(index, 1);

  if (action === "front") {
    nodes.push(node);
    return index !== nodes.length - 1;
  }
  if (action === "back") {
    nodes.unshift(node);
    return index !== 0;
  }
  if (action === "forward") {
    const nextIndex = Math.min(index + 1, nodes.length);
    nodes.splice(nextIndex, 0, node);
    return nextIndex !== index;
  }
  if (action === "backward") {
    const nextIndex = Math.max(index - 1, 0);
    nodes.splice(nextIndex, 0, node);
    return nextIndex !== index;
  }

  nodes.splice(index, 0, node);
  return false;
}

function selectFile(fileId) {
  if (!fileViews[fileId]) return;
  state.activeFileId = fileId;

  if (fileId === "adventure") {
    state.panel = state.selectedNodeId ? "node" : "project";
    renderAll();
    setStatus("The Adventure.canvas opened.");
    return;
  }

  if (fileId === "characters") {
    state.panel = "story";
    renderAll();
    setStatus("Characters.md opened.");
    return;
  }

  if (fileId === "events") {
    state.panel = "project";
    renderAll();
    setStatus("Events Sheet.csv opened.");
    return;
  }

  state.panel = "project";
  renderAll();
  setStatus("Variables.json opened.");
  requestAnimationFrame(() => {
    document.querySelector("#variablesPanel [data-project-field='variables']")?.focus();
  });
}

function handleInput(event) {
  const target = event.target;
  if (!isNarrativeCanvasTarget(target)) return;

  if (target === dom.queryInput) {
    state.search = target.value;
    renderNodes();
    updateStatus();
    return;
  }

  if (target === dom.notes) {
    state.project.notes = target.value;
    renderProjectPanel();
    return;
  }

  if (target.dataset.characterField) {
    setCharacterField(target.dataset.characterId, target.dataset.characterField, target.value, false);
    return;
  }

  if (target.dataset.variableField === "value") {
    setVariableField(target.dataset.variableKey, "value", target.value, false);
    return;
  }

  if (target.dataset.eventField) {
    setEventField(target.dataset.eventNodeId, target.dataset.eventField, target.value, false);
    return;
  }

  if (target.dataset.projectField) {
    if (target.dataset.projectField === "variables") return;
    setProjectField(target.dataset.projectField, target.value);
    return;
  }

  if (target.dataset.nodeField) {
    setNodeField(target.dataset.nodeField, target.value);
  }
}

function handleChange(event) {
  const target = event.target;
  if (!isNarrativeCanvasTarget(target)) return;

  if (target.dataset.characterField) {
    setCharacterField(target.dataset.characterId, target.dataset.characterField, target.value, true);
    return;
  }
  if (target.dataset.variableField) {
    setVariableField(target.dataset.variableKey, target.dataset.variableField, target.value, true);
    return;
  }
  if (target.dataset.eventField) {
    setEventField(target.dataset.eventNodeId, target.dataset.eventField, target.value, true);
    return;
  }
  if (target.dataset.projectField) {
    setProjectField(target.dataset.projectField, target.value);
    return;
  }
  if (target.dataset.nodeField) {
    setNodeField(target.dataset.nodeField, target.value);
  }
}

function handleKeyDown(event) {
  if (!isNarrativeCanvasTarget(event.target)) return;
  if (event.target.matches("input, textarea, select")) return;
  if (event.key === "Delete" || event.key === "Backspace") {
    if (state.selectedNodeId) deleteSelectedNode();
    if (state.selectedLinkId) deleteSelectedLink();
  }
}

function isNarrativeCanvasTarget(target) {
  return Boolean(
    dom.root?.contains(target)
    || dom.nodeContextMenu?.contains(target)
    || dom.playDialog?.contains(target)
    || dom.confirmDialog?.contains(target)
  );
}

function handleViewportPointerDown(event) {
  const resizeHandle = event.target.closest("[data-resize-handle]");
  if (resizeHandle) {
    const node = getNode(resizeHandle.dataset.nodeId);
    if (!node) return;
    const size = nodeSize(node);
    selectNode(node.id, false);
    state.resizingNode = {
      id: node.id,
      handle: resizeHandle.dataset.resizeHandle,
      startX: event.clientX,
      startY: event.clientY,
      width: size.width,
      height: size.height
    };
    dom.viewport.setPointerCapture(event.pointerId);
    event.preventDefault();
    return;
  }

  const handle = event.target.closest("[data-drag-handle]");
  if (handle) {
    const node = getNode(handle.dataset.nodeId);
    if (!node) return;
    selectNode(node.id, false);
    state.draggingNode = {
      id: node.id,
      startX: event.clientX,
      startY: event.clientY,
      nodeX: node.x,
      nodeY: node.y
    };
    dom.viewport.setPointerCapture(event.pointerId);
    return;
  }

  if (event.target === dom.viewport || event.target === dom.content || event.target === dom.nodeLayer || event.target === dom.linkLayer) {
    state.panning = {
      startX: event.clientX,
      startY: event.clientY,
      viewX: state.view.x,
      viewY: state.view.y
    };
    state.selectedNodeId = null;
    state.selectedLinkId = null;
    renderAll();
  }
}

function handleViewportPointerMove(event) {
  if (state.resizingNode) {
    const node = getNode(state.resizingNode.id);
    if (!node) return;
    const handle = state.resizingNode.handle;
    if (handle.includes("e")) {
      node.width = Math.round(clamp(state.resizingNode.width + (event.clientX - state.resizingNode.startX) / state.view.scale, minNodeWidth(node), 860));
    }
    if (handle.includes("s")) {
      node.height = Math.round(clamp(state.resizingNode.height + (event.clientY - state.resizingNode.startY) / state.view.scale, minNodeHeight(node), 620));
    }
    renderNodes();
    renderLinks();
    renderMinimap();
    renderInspector();
  } else if (state.draggingNode) {
    const node = getNode(state.draggingNode.id);
    if (!node) return;
    node.x = Math.round(state.draggingNode.nodeX + (event.clientX - state.draggingNode.startX) / state.view.scale);
    node.y = Math.round(state.draggingNode.nodeY + (event.clientY - state.draggingNode.startY) / state.view.scale);
    renderNodes();
    renderLinks();
    renderMinimap();
    renderInspector();
  } else if (state.panning) {
    state.view.x = state.panning.viewX + event.clientX - state.panning.startX;
    state.view.y = state.panning.viewY + event.clientY - state.panning.startY;
    renderTransform();
    updateGridPosition();
  } else if (state.connectingFrom) {
    state.connectingTo = screenToBoard(event.clientX, event.clientY);
    renderLinks();
  }
}

function endPointerActions(event) {
  if (state.draggingNode || state.resizingNode || state.panning) {
    try {
      dom.viewport.releasePointerCapture(event.pointerId);
    } catch (error) {
      // Pointer capture is already gone.
    }
  }
  state.draggingNode = null;
  state.resizingNode = null;
  state.panning = null;
}

function handleWheel(event) {
  if (!event.ctrlKey && !event.metaKey) return;
  event.preventDefault();
  const before = screenToBoard(event.clientX, event.clientY);
  const delta = event.deltaY < 0 ? 0.08 : -0.08;
  const nextScale = clamp(state.view.scale + delta, 0.35, 1.6);
  state.view.scale = nextScale;
  state.view.x = event.clientX - dom.viewport.getBoundingClientRect().left - before.x * nextScale;
  state.view.y = event.clientY - dom.viewport.getBoundingClientRect().top - before.y * nextScale;
  renderTransform();
  updateGridPosition();
  renderProjectPanel();
}

function handlePortClick(port) {
  const nodeId = port.dataset.nodeId;
  const kind = port.dataset.port;
  if (kind === "output") {
    state.connectingFrom = nodeId;
    state.connectingTo = getOutputPoint(getNode(nodeId));
    dom.hint.classList.add("show");
    renderLinks();
    return;
  }
  if (kind === "input" && state.connectingFrom && state.connectingFrom !== nodeId) {
    const link = {
      id: nextId("l", state.project.links),
      from: state.connectingFrom,
      to: nodeId
    };
    state.project.links.push(link);
    state.connectingFrom = null;
    state.connectingTo = null;
    dom.hint.classList.remove("show");
    state.selectedLinkId = link.id;
    state.selectedNodeId = null;
    renderAll();
    setStatus("Link created.");
    return;
  }
  state.connectingFrom = null;
  state.connectingTo = null;
  dom.hint.classList.remove("show");
  renderLinks();
}

function addNode(type) {
  state.activeFileId = "adventure";
  renderWorkspaceFile();
  const rect = dom.viewport.getBoundingClientRect();
  const center = screenToBoard(rect.left + rect.width / 2, rect.top + rect.height / 2);
  const meta = nodeTypes[type] || nodeTypes.Content;
  const node = {
    id: nextId("n", state.project.nodes),
    type,
    title: type === "Entry" ? "Start" : `${type} Node`,
    body: defaultBody(type),
    x: Math.round(center.x - (meta.width || 230) / 2),
    y: Math.round(center.y - 70)
  };
  if (type === "Choice") node.choices = ["Continue", "Turn back"];
  if (type === "Set") {
    node.variable = "flag";
    node.value = "true";
  }
  if (type === "Condition") node.condition = "flag == true";
  state.project.nodes.push(normalizeNode(node));
  selectNode(node.id);
  setStatus(`${type} node added.`);
}

function defaultBody(type) {
  const defaults = {
    Entry: "Start here.",
    Content: "Write narration here.",
    Dialog: "Character line.",
    Choice: "Offer player choices.",
    Condition: "Check a variable before branching.",
    Set: "Set a variable.",
    Jump: "Jump to another scene.",
    Marker: "Planning marker.",
    Event: "Group related beats into one event-sheet row."
  };
  return defaults[type] || "";
}

function addCharacter() {
  const characters = getCharacters();
  const nextNumber = characters.length + 1;
  const character = {
    id: nextId("c", characters),
    name: uniqueCharacterName(`Character ${nextNumber}`),
    role: "",
    voice: "",
    notes: ""
  };
  characters.push(character);
  state.project.characters = characters;
  state.activeFileId = "characters";
  renderAll();
  setStatus("Character added.");
}

function deleteCharacter(id) {
  const characters = getCharacters();
  const character = characters.find((item) => item.id === id);
  state.project.characters = characters.filter((item) => item.id !== id);
  renderAll();
  setStatus(character ? `${character.name} deleted.` : "Character deleted.");
}

function setCharacterField(id, field, value, rerender) {
  const character = getCharacters().find((item) => item.id === id);
  if (!character) return;
  if (field === "name") {
    const previousName = character.name;
    character.name = value;
    state.project.nodes.forEach((node) => {
      if (node.type === "Dialog" && node.title === previousName) {
        node.title = value;
      }
    });
    renderNodes();
    renderStoryPanel();
  } else {
    character[field] = value;
  }
  updateStatus();
  if (rerender) renderWorkspaceFile();
}

function addVariable() {
  const variables = state.project.variables || {};
  const key = uniqueVariableKey("new_variable");
  variables[key] = "";
  state.project.variables = variables;
  state.activeFileId = "variables";
  renderAll();
  setStatus("Variable added.");
}

function deleteVariable(key) {
  if (!key || !state.project.variables) return;
  delete state.project.variables[key];
  renderAll();
  setStatus(`${key} deleted.`);
}

function setVariableField(key, field, value, rerender) {
  const variables = state.project.variables || {};
  if (!Object.prototype.hasOwnProperty.call(variables, key)) return;

  if (field === "key") {
    const nextKey = value.trim();
    if (!nextKey || (nextKey !== key && Object.prototype.hasOwnProperty.call(variables, nextKey))) {
      setStatus("Variable key already exists.");
      if (rerender) renderWorkspaceFile();
      return;
    }
    if (nextKey !== key) {
      variables[nextKey] = variables[key];
      delete variables[key];
      renameVariableReferences(key, nextKey);
    }
  } else if (field === "type") {
    variables[key] = coerceVariableInput(formatVariableValue(variables[key]), value);
  } else if (field === "value") {
    variables[key] = coerceVariableInput(value, variableType(variables[key]));
  }

  state.project.variables = variables;
  renderNodes();
  renderStoryPanel();
  renderProjectPanel();
  updateStatus();
  if (rerender) renderWorkspaceFile();
}

function selectNode(id, rerender = true) {
  state.activeFileId = "adventure";
  state.selectedNodeId = id;
  state.selectedLinkId = null;
  state.panel = "node";
  if (rerender) renderAll();
}

function setProjectField(field, value) {
  if (field === "variables") {
    try {
      state.project.variables = JSON.parse(value || "{}");
      setStatus("Variables updated.");
    } catch (error) {
      setStatus("Variables JSON is invalid.");
      return;
    }
  } else {
    state.project[field] = value;
  }
  renderNodes();
  renderStoryPanel();
  renderProjectPanel();
  renderWorkspaceFile();
  updateStatus();
}

function setNodeField(field, value) {
  const node = getNode(state.selectedNodeId);
  if (!node) return;
  if (field === "x" || field === "y") {
    node[field] = Number(value) || 0;
  } else if (field === "choices") {
    node.choices = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  } else if (field === "type") {
    node[field] = value;
    if (value === "Event") ensureEventDefaults(node);
  } else {
    node[field] = value;
  }
  renderNodes();
  renderLinks();
  renderMinimap();
  if (field === "type") {
    renderInspector();
  } else {
    renderStoryPanel();
  }
  updateStatus();
}

function setEventField(nodeId, field, value, rerender) {
  const node = getNode(nodeId);
  if (!node || !eventSheetColumns.some((column) => column.key === field)) return;
  node[field] = value;
  if (field === "eventDescription" && !node.body) node.body = value;
  renderNodes();
  renderStoryPanel();
  renderProjectPanel();
  updateStatus();
  if (rerender && state.activeFileId === "events") renderEventsSheetPage();
  if (rerender && state.selectedNodeId === nodeId) renderNodePanel(node);
}

function duplicateSelectedNode() {
  const node = getNode(state.selectedNodeId);
  if (!node) return;
  const copy = { ...cloneProject(node), id: nextId("n", state.project.nodes), x: node.x + 42, y: node.y + 42 };
  state.project.nodes.push(copy);
  selectNode(copy.id);
  setStatus("Node duplicated.");
}

function deleteSelectedNode() {
  if (!state.selectedNodeId) return;
  const id = state.selectedNodeId;
  state.project.nodes = state.project.nodes.filter((node) => node.id !== id);
  state.project.links = state.project.links.filter((link) => link.from !== id && link.to !== id);
  state.selectedNodeId = null;
  state.panel = "project";
  renderAll();
  setStatus("Node deleted.");
}

function deleteSelectedLink() {
  if (!state.selectedLinkId) return;
  state.project.links = state.project.links.filter((link) => link.id !== state.selectedLinkId);
  state.selectedLinkId = null;
  renderAll();
  setStatus("Link deleted.");
}

function focusSelectedNode() {
  const node = getNode(state.selectedNodeId);
  if (!node) return;
  state.activeFileId = "adventure";
  state.panel = "node";
  renderAll();
  resetCanvasScroll();
  const rect = dom.viewport.getBoundingClientRect();
  const size = nodeSize(node);
  state.view.x = rect.width / 2 - (node.x + size.width / 2) * state.view.scale;
  state.view.y = rect.height / 2 - (node.y + size.height / 2) * state.view.scale;
  renderTransform();
  updateGridPosition();
  setStatus(`${node.title || node.id} focused.`);
}

function centerView(announce = true) {
  const bounds = getProjectBounds();
  resetCanvasScroll();
  const rect = dom.viewport.getBoundingClientRect();
  const scaleX = rect.width / Math.max(bounds.width + 240, 600);
  const scaleY = rect.height / Math.max(bounds.height + 240, 400);
  state.view.scale = clamp(Math.min(scaleX, scaleY, 1), 0.45, 1);
  state.view.x = rect.width / 2 - (bounds.x + bounds.width / 2) * state.view.scale;
  state.view.y = rect.height / 2 - (bounds.y + bounds.height / 2) * state.view.scale;
  renderTransform();
  updateGridPosition();
  renderProjectPanel();
  if (announce) setStatus("Canvas centered.");
}

function setZoom(value) {
  state.view.scale = clamp(value, 0.35, 1.6);
  renderTransform();
  updateGridPosition();
  renderProjectPanel();
}

function updateGridPosition() {
  dom.viewport.style.backgroundPosition = `${state.view.x}px ${state.view.y}px`;
}

function resetCanvasScroll() {
  if (!dom.viewport) return;
  try {
    dom.viewport.scrollTo(0, 0);
  } catch (error) {
    try {
      dom.viewport.scrollTo({ left: 0, top: 0, behavior: "auto" });
    } catch (innerError) {
      // Fall through to direct assignment.
    }
  }
  dom.viewport.scrollLeft = 0;
  dom.viewport.scrollTop = 0;
}

function newProject() {
  state.project = {
    title: "Untitled Story",
    notes: "",
    variables: {},
    characters: [],
    nodes: [normalizeNode({ id: "n0", type: "Entry", title: "Start", body: "Adventure Begins", x: 120, y: 120 })],
    links: []
  };
  state.selectedNodeId = "n0";
  state.selectedLinkId = null;
  state.panel = "project";
  state.activeFileId = "adventure";
  centerView(false);
  renderAll();
  setStatus("New project created.");
}

function showNewProjectConfirm() {
  if (dom.confirmDialog?.showModal) {
    dom.confirmDialog.returnValue = "";
    dom.confirmDialog.showModal();
    return;
  }
  if (window.confirm("Discard the current canvas and create a blank one?")) newProject();
}

async function loadFromVault(announce = true) {
  if (!window.NarrativeCanvasHost?.loadProject) return false;
  try {
    const saved = await window.NarrativeCanvasHost.loadProject();
    if (!saved) return false;
    state.project = normalizeProject(JSON.parse(saved));
    state.selectedNodeId = state.project.nodes[0]?.id || null;
    if (announce) setStatus(`Loaded ${window.NarrativeCanvasHost.projectFile || "vault project"}.`);
    return true;
  } catch (error) {
    console.error(error);
    if (announce) setStatus("Could not load vault project.");
    return false;
  }
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state.project, null, 2)], { type: "application/json" });
  downloadBlob(blob, `${slugify(state.project.title || "narrative-canvas")}.json`);
  setStatus("JSON exported.");
}

function exportCharactersMarkdown() {
  const characters = getCharacters();
  const lines = [`# Characters`, ""];
  characters.forEach((character) => {
    lines.push(`## ${character.name || "Unnamed Character"}`);
    if (character.role) lines.push(`- Role: ${character.role}`);
    if (character.voice) lines.push(`- Voice: ${character.voice}`);
    if (character.notes) lines.push("", character.notes);
    const usage = getCharacterDialogNodes(character.name);
    if (usage.length) {
      lines.push("", "### Dialog Nodes");
      usage.forEach((node) => lines.push(`- ${node.title || node.id} (${node.id})`));
    }
    lines.push("");
  });
  downloadBlob(new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" }), "Characters.md");
  setStatus("Characters Markdown exported.");
}

function exportVariablesJson() {
  const blob = new Blob([JSON.stringify(state.project.variables || {}, null, 2)], { type: "application/json" });
  downloadBlob(blob, "Variables.json");
  setStatus("Variables JSON exported.");
}

function exportEventSheetCsv() {
  const rows = [
    eventSheetColumns.map((column) => column.label),
    ...getEventRows().map((node) => eventSheetColumns.map((column) => getNodeEventValue(node, column.key)))
  ];
  const csv = rows.map((row) => row.map(formatCsvCell).join(",")).join("\n");
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${slugify(state.project.title || "narrative-canvas")}-events.csv`);
  setStatus("Event sheet CSV exported.");
}

async function exportImage() {
  try {
    const svg = buildExportSvg();
    const blob = await svgToPngBlob(svg);
    downloadBlob(blob, `${slugify(state.project.title || "narrative-canvas")}.png`);
    setStatus("Image exported.");
  } catch (error) {
    console.error(error);
    downloadBlob(new Blob([buildExportSvg()], { type: "image/svg+xml" }), `${slugify(state.project.title || "narrative-canvas")}.svg`);
    setStatus("PNG export failed; SVG exported.");
  }
}

function exportHtml() {
  const svg = buildExportSvg();
  const title = escapeHtml(state.project.title || "Narrative Canvas");
  const documentHtml = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${title}</title>
    <style>
      @page { size: landscape; margin: 12mm; }
      html, body { margin: 0; background: #ffffff; color: #111111; font-family: system-ui, sans-serif; }
      main { display: grid; gap: 12px; padding: 16px; }
      h1 { margin: 0; font-size: 18px; }
      .canvas-export { width: 100%; height: auto; border: 1px solid #dddddd; }
      @media print { main { padding: 0; } h1 { display: none; } .canvas-export { border: 0; } }
    </style>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      ${svg.replace("<svg ", "<svg class=\"canvas-export\" ")}
    </main>
  </body>
</html>`;
  downloadBlob(new Blob([documentHtml], { type: "text/html" }), `${slugify(state.project.title || "narrative-canvas")}.html`);
  setStatus("HTML exported.");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function importJsonFile() {
  const file = dom.fileInput.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state.project = normalizeProject(JSON.parse(String(reader.result)));
      state.selectedNodeId = state.project.nodes[0]?.id || null;
      state.selectedLinkId = null;
      state.panel = "project";
      state.activeFileId = "adventure";
      centerView(false);
      renderAll();
      setStatus("JSON imported.");
    } catch (error) {
      setStatus("Import failed: invalid JSON.");
    } finally {
      dom.fileInput.value = "";
    }
  };
  reader.readAsText(file);
}

function normalizeProject(project) {
  return {
    title: project.title || "Untitled Story",
    notes: project.notes || "",
    variables: project.variables || {},
    characters: Array.isArray(project.characters) ? project.characters : inferCharacters(project),
    nodes: Array.isArray(project.nodes) ? project.nodes.map(normalizeNode) : [],
    links: Array.isArray(project.links) ? project.links : []
  };
}

function normalizeNode(node) {
  const normalized = { ...node };
  if (normalized.type === "Frame") {
    normalized.type = "Event";
    if (normalized.eventType === "Frame" || normalized.eventType === "Event") normalized.eventType = "";
  }
  if (normalized.type === "Event") ensureEventDefaults(normalized);
  return normalized;
}

function ensureEventDefaults(node) {
  eventSheetColumns.forEach((column) => {
    if (!column.readonly && node[column.key] == null) node[column.key] = getNodeEventValue(node, column.key);
  });
}

function openPreview() {
  const previewPath = getPreviewPath();
  const entry = previewPath[0];
  if (!entry) {
    setStatus("No nodes to play.");
    return;
  }
  state.playPath = previewPath.map((node) => node.id);
  state.playNodeId = entry.id;
  renderPreviewNode(entry.id);
  dom.playDialog.showModal();
}

function advancePreview(nodeId) {
  state.playNodeId = nodeId;
  renderPreviewNode(nodeId);
}

function previousPreview() {
  const index = state.playPath.indexOf(state.playNodeId);
  const previousId = state.playPath[Math.max(0, index - 1)];
  if (previousId) advancePreview(previousId);
}

function renderPreviewNode(nodeId) {
  const node = getNode(nodeId);
  if (!node) return;
  if (node.type === "Set" && node.variable) {
    state.project.variables[node.variable] = coerceValue(node.value);
  }

  const outgoing = getOutgoing(node.id);
  let nextLinks = outgoing;
  if (node.type === "Condition") {
    const result = evaluateCondition(node.condition || node.body);
    nextLinks = result ? outgoing.slice(0, 1) : outgoing.slice(1, 2);
  }

  const pathIndex = state.playPath.indexOf(node.id);
  const pageNumber = pathIndex >= 0 ? pathIndex + 1 : 1;
  const pageTotal = Math.max(state.playPath.length, 1);
  const previousButton = pageNumber > 1
    ? `<button class="play-action" type="button" data-action="play-prev">Previous</button>`
    : "";
  const nextPathId = state.playPath[pathIndex + 1];
  dom.playTitle.textContent = node.title || node.type;
  dom.playBody.innerHTML = `
    <div class="play-meta">
      <span>${escapeHtml(node.type)} ${escapeHtml(node.id)}</span>
      <span>${pageNumber} / ${pageTotal}</span>
    </div>
    <h3>${escapeHtml(node.title || node.type)}</h3>
    <p>${escapeHtml(interpolate(displayBody(node)))}</p>
  `;

  if (node.type === "Choice" && nextLinks.length) {
    const choices = node.choices || [];
    dom.playActions.innerHTML = previousButton + nextLinks.map((link, index) => {
      const target = getNode(link.to);
      const label = choices[index] || link.label || target?.title || "Continue";
      return `<button class="play-action" type="button" data-action="play-next" data-node-id="${link.to}">${escapeHtml(label)}</button>`;
    }).join("");
    return;
  }

  const nextId = nextLinks[0]?.to || nextPathId;
  dom.playActions.innerHTML = previousButton + (nextId
    ? `<button class="play-action primary" type="button" data-action="play-next" data-node-id="${nextId}">Next page</button>`
    : `<button class="play-action" type="button" data-action="restart-play">Restart</button>`);
}

function getPreviewPath() {
  return getReachableStory().filter((node) => node.type !== "Event");
}

function evaluateCondition(source) {
  const match = String(source || "").match(/^\s*([a-zA-Z_][\w-]*)\s*(==|!=)\s*(.+?)\s*$/);
  if (!match) return false;
  const actual = String(state.project.variables?.[match[1]] ?? "");
  const expected = String(match[3]).replace(/^["']|["']$/g, "");
  return match[2] === "==" ? actual === expected : actual !== expected;
}

function interpolate(text) {
  return String(text || "").replace(/\{([a-zA-Z_][\w-]*)\}/g, (_, key) => state.project.variables?.[key] ?? `{${key}}`);
}

function coerceValue(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value !== "" && !Number.isNaN(Number(value))) return Number(value);
  return value;
}

function getCharacters() {
  if (!Array.isArray(state.project.characters)) {
    state.project.characters = inferCharacters(state.project);
  }
  return state.project.characters;
}

function inferCharacters(project) {
  const names = [...new Set((project.nodes || [])
    .filter((node) => node.type === "Dialog" && node.title)
    .map((node) => node.title))];
  return names.map((name, index) => ({
    id: `c${index}`,
    name,
    role: "",
    voice: "",
    notes: ""
  }));
}

function getCharacterDialogNodes(name) {
  return state.project.nodes.filter((node) => node.type === "Dialog" && node.title === name);
}

function uniqueCharacterName(baseName) {
  const used = new Set(getCharacters().map((character) => character.name));
  if (!used.has(baseName)) return baseName;
  let index = 2;
  while (used.has(`${baseName} ${index}`)) index += 1;
  return `${baseName} ${index}`;
}

function uniqueVariableKey(baseKey) {
  const variables = state.project.variables || {};
  if (!Object.prototype.hasOwnProperty.call(variables, baseKey)) return baseKey;
  let index = 2;
  while (Object.prototype.hasOwnProperty.call(variables, `${baseKey}_${index}`)) index += 1;
  return `${baseKey}_${index}`;
}

function variableType(value) {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (value && typeof value === "object") return "json";
  return "string";
}

function formatVariableValue(value) {
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value ?? "");
}

function coerceVariableInput(value, type) {
  if (type === "number") return Number(value) || 0;
  if (type === "boolean") return String(value).toLowerCase() === "true";
  if (type === "json") {
    try {
      return JSON.parse(value || "null");
    } catch (error) {
      setStatus("Variable JSON value is invalid.");
      return value;
    }
  }
  return value;
}

function renameVariableReferences(oldKey, newKey) {
  const tokenPattern = new RegExp(`\\{${escapeRegExp(oldKey)}\\}`, "g");
  state.project.nodes.forEach((node) => {
    if (typeof node.body === "string") node.body = node.body.replace(tokenPattern, `{${newKey}}`);
    if (node.variable === oldKey) node.variable = newKey;
    if (typeof node.condition === "string") {
      node.condition = node.condition.replace(new RegExp(`\\b${escapeRegExp(oldKey)}\\b`, "g"), newKey);
    }
  });
}

function getReachableStory() {
  const entry = state.project.nodes.find((node) => node.type === "Entry") || state.project.nodes[0];
  if (!entry) return [];
  const seen = new Set();
  const ordered = [];
  const walk = (node) => {
    if (!node || seen.has(node.id)) return;
    seen.add(node.id);
    ordered.push(node);
    getOutgoing(node.id).forEach((link) => walk(getNode(link.to)));
  };
  walk(entry);
  return ordered;
}

function getProjectBounds() {
  if (!state.project.nodes.length) return { x: 0, y: 0, width: 800, height: 500 };
  const xs = state.project.nodes.map((node) => node.x);
  const ys = state.project.nodes.map((node) => node.y);
  const rights = state.project.nodes.map((node) => node.x + (node.width || nodeTypes[node.type]?.width || 230));
  const bottoms = state.project.nodes.map((node) => node.y + nodeHeight(node));
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(...rights) - minX,
    height: Math.max(...bottoms) - minY
  };
}

function getEventRows() {
  return state.project.nodes
    .filter((node) => node.type === "Event")
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

function getNodeEventValue(node, key) {
  if (!node) return "";
  if (key === "eventElements") return getEventContainedNodes(node).map(formatEventElement).join("\n");
  if (node[key] != null && node[key] !== "") return String(node[key]);
  if (key === "eventDescription") return displayBody(node);
  if (key === "characterEncountered" && node.type === "Dialog") return node.title || "";
  if (key === "eventType") return "";
  if (key === "beatList") return node.title || "";
  return "";
}

function getEventContainedNodes(eventNode) {
  if (!eventNode || eventNode.type !== "Event") return [];
  const bounds = getEventBounds(eventNode);
  return state.project.nodes
    .filter((node) => node.id !== eventNode.id && node.type !== "Event")
    .filter((node) => isNodeInsideBounds(node, bounds))
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

function getEventBounds(eventNode) {
  return {
    left: eventNode.x,
    top: eventNode.y,
    right: eventNode.x + (eventNode.width || nodeTypes.Event.width),
    bottom: eventNode.y + nodeHeight(eventNode)
  };
}

function isNodeInsideBounds(node, bounds) {
  const center = {
    x: node.x + (node.width || nodeTypes[node.type]?.width || 230) / 2,
    y: node.y + nodeHeight(node) / 2
  };
  return center.x >= bounds.left && center.x <= bounds.right && center.y >= bounds.top && center.y <= bounds.bottom;
}

function formatEventElement(node) {
  return `${node.type}: ${node.title || node.id} - ${displayBody(node)}`.trim();
}

function formatCsvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function buildExportSvg() {
  const margin = 90;
  const bounds = getProjectBounds();
  const width = Math.ceil(bounds.width + margin * 2);
  const height = Math.ceil(bounds.height + margin * 2);
  const offset = { x: margin - bounds.x, y: margin - bounds.y };
  const nodes = [...state.project.nodes].sort((a, b) => (a.type === "Event" ? -1 : 0) - (b.type === "Event" ? -1 : 0));

  const links = state.project.links.map((link) => renderExportLink(link, offset)).join("");
  const nodeMarkup = nodes.map((node) => renderExportNode(node, offset)).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <pattern id="grid-small" width="16" height="16" patternUnits="userSpaceOnUse">
      <path d="M 16 0 L 0 0 0 16" fill="none" stroke="rgba(255,255,255,0.055)" stroke-width="1"/>
    </pattern>
    <pattern id="grid-large" width="80" height="80" patternUnits="userSpaceOnUse">
      <rect width="80" height="80" fill="url(#grid-small)"/>
      <path d="M 80 0 L 0 0 0 80" fill="none" stroke="rgba(255,255,255,0.09)" stroke-width="1"/>
    </pattern>
    <marker id="export-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(220,221,222,0.78)"/>
    </marker>
  </defs>
  <rect width="100%" height="100%" fill="#202020"/>
  <rect width="100%" height="100%" fill="url(#grid-large)"/>
  <text x="28" y="42" fill="#dcddde" font-family="system-ui, sans-serif" font-size="22" font-weight="700">${escapeSvg(state.project.title || "Narrative Canvas")}</text>
  ${links}
  ${nodeMarkup}
</svg>`;
}

function renderExportNode(node, offset) {
  const meta = nodeTypes[node.type] || nodeTypes.Content;
  const width = node.width || meta.width || 230;
  const height = exportNodeHeight(node);
  const x = node.x + offset.x;
  const y = node.y + offset.y;
  const isFrame = node.type === "Event";
  const fill = isFrame ? "rgba(61,78,36,0.62)" : "rgba(43,43,43,0.96)";
  const stroke = isFrame ? "rgba(152,195,121,0.52)" : "rgba(255,255,255,0.13)";
  const bodyLines = wrapSvgText(displayBody(node), Math.max(14, Math.floor((width - 28) / 7.2)), isFrame ? 8 : 5);
  const titleLines = wrapSvgText(node.title || "Untitled", Math.max(10, Math.floor((width - 76) / 8)), 2);
  const titleText = renderSvgLines(titleLines, x + 14, y + 58, 14, 13, "#dcddde", 700);
  const bodyText = renderSvgLines(bodyLines, x + 14, y + 88, 14, 12, "#dcddde", 400);

  return `<g>
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="7" fill="${fill}" stroke="${stroke}"/>
    <rect x="${x}" y="${y}" width="${width}" height="36" rx="7" fill="rgba(255,255,255,0.06)"/>
    <rect x="${x + 10}" y="${y + 8}" width="22" height="22" rx="4" fill="${meta.color}"/>
    <text x="${x + 21}" y="${y + 24}" text-anchor="middle" fill="#101010" font-family="system-ui, sans-serif" font-size="12" font-weight="800">${escapeSvg(meta.badge)}</text>
    <text x="${x + 40}" y="${y + 23}" fill="#a8a8a8" font-family="system-ui, sans-serif" font-size="12">${escapeSvg(getNodeTypeLabel(node.type))}</text>
    <text x="${x + width - 12}" y="${y + 23}" text-anchor="end" fill="#7a7a7a" font-family="system-ui, sans-serif" font-size="12">${escapeSvg(node.id.replace("n", "#"))}</text>
    ${titleText}
    ${bodyText}
    ${node.type === "Choice" && Array.isArray(node.choices) ? `<text x="${x + 14}" y="${y + height - 16}" fill="#a8a8a8" font-family="system-ui, sans-serif" font-size="12">${node.choices.length} choices</text>` : ""}
  </g>`;
}

function renderExportLink(link, offset) {
  const from = getNode(link.from);
  const to = getNode(link.to);
  if (!from || !to) return "";
  const fromPoint = exportOutputPoint(from, offset);
  const toPoint = exportInputPoint(to, offset);
  const path = linkPath(fromPoint, toPoint);
  const label = link.label ? renderExportLinkLabel(link.label, midpoint(fromPoint, toPoint)) : "";
  return `<path d="${path}" fill="none" stroke="rgba(220,221,222,0.78)" stroke-width="3" stroke-linecap="round" marker-end="url(#export-arrow)"/>${label}`;
}

function renderExportLinkLabel(label, point) {
  return `<text x="${point.x}" y="${point.y - 8}" fill="#a8a8a8" font-family="system-ui, sans-serif" font-size="12" text-anchor="middle">${escapeSvg(label)}</text>`;
}

function exportInputPoint(node, offset) {
  return { x: node.x + offset.x, y: node.y + offset.y + exportNodeHeight(node) / 2 };
}

function exportOutputPoint(node, offset) {
  const width = node.width || nodeTypes[node.type]?.width || 230;
  return { x: node.x + offset.x + width, y: node.y + offset.y + exportNodeHeight(node) / 2 };
}

function exportNodeHeight(node) {
  return node.height || defaultNodeHeight(node);
}

function renderSvgLines(lines, x, y, lineHeight, fontSize, fill, weight) {
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="system-ui, sans-serif" font-size="${fontSize}" font-weight="${weight}">${lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeSvg(line)}</tspan>`).join("")}</text>`;
}

function wrapSvgText(value, maxChars, maxLines) {
  const lines = [];
  String(value || "").split(/\r?\n/).forEach((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = "";
    words.forEach((word) => {
      const next = line ? `${line} ${word}` : word;
      if (next.length > maxChars && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    });
    if (line) lines.push(line);
    if (!words.length) lines.push("");
  });
  if (lines.length <= maxLines) return lines;
  return [...lines.slice(0, maxLines - 1), `${lines[maxLines - 1].slice(0, Math.max(0, maxChars - 1))}...`];
}

function svgToPngBlob(svg) {
  return new Promise((resolve, reject) => {
    const svgBlob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(svgBlob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      context.fillStyle = "#202020";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas export failed."));
      }, "image/png");
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("SVG image export failed."));
    };
    image.src = url;
  });
}

function getNode(id) {
  return state.project.nodes.find((node) => node.id === id);
}

function getOutgoing(id) {
  return state.project.links.filter((link) => link.from === id);
}

function getInputPoint(node) {
  const size = nodeSize(node);
  return { x: node.x, y: node.y + size.height / 2 };
}

function getOutputPoint(node) {
  const size = nodeSize(node);
  return { x: node.x + size.width, y: node.y + size.height / 2 };
}

function nodeHeight(node) {
  return node.height || defaultNodeHeight(node);
}

function defaultNodeHeight(node) {
  const contentHeight = Math.max(126, 80 + Math.min(120, String(displayBody(node) || "").length * 0.35));
  return node.type === "Event" ? Math.max(250, contentHeight) : contentHeight;
}

function minNodeWidth(node) {
  return node.type === "Event" ? 260 : 140;
}

function minNodeHeight(node) {
  return node.type === "Event" ? 160 : 96;
}

function nodeSize(node) {
  const element = document.querySelector(`.node[data-node-id="${node.id}"]`);
  if (element) {
    return { width: element.offsetWidth, height: element.offsetHeight };
  }
  return {
    width: node.width || nodeTypes[node.type]?.width || 230,
    height: nodeHeight(node)
  };
}

function linkPath(from, to) {
  const dx = Math.max(80, Math.abs(to.x - from.x) * 0.45);
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function screenToBoard(clientX, clientY) {
  const rect = dom.viewport.getBoundingClientRect();
  return {
    x: (clientX - rect.left - state.view.x) / state.view.scale,
    y: (clientY - rect.top - state.view.y) / state.view.scale
  };
}

function displayBody(node) {
  if (node.type === "Set" && node.variable) return `${node.variable} = ${node.value ?? ""}`;
  if (node.type === "Condition" && node.condition) return node.condition;
  return node.body || "";
}

function nodeMatches(node, query) {
  return [node.type, node.title, node.body, node.condition, node.variable, node.value]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
}

function nextId(prefix, items) {
  const used = new Set(items.map((item) => item.id));
  let index = 0;
  while (used.has(`${prefix}${index}`)) index += 1;
  return `${prefix}${index}`;
}

function updateStatus() {
  if (!state.statusOverride) {
    if (state.activeFileId === "characters") {
      const dialogCount = state.project.nodes.filter((node) => node.type === "Dialog").length;
      dom.statusText.textContent = `${fileViews.characters} - ${getCharacters().length} characters, ${dialogCount} dialog nodes`;
      return;
    }
    if (state.activeFileId === "variables") {
      dom.statusText.textContent = `${fileViews.variables} - ${Object.keys(state.project.variables || {}).length} variables`;
      return;
    }
    if (state.activeFileId === "events") {
      dom.statusText.textContent = `${fileViews.events} - ${getEventRows().length} event rows`;
      return;
    }
    const nodeCount = state.project.nodes.length;
    const linkCount = state.project.links.length;
    dom.statusText.textContent = `${state.project.title} - ${nodeCount} nodes, ${linkCount} links`;
  }
}

function setStatus(message) {
  state.statusOverride = true;
  dom.statusText.textContent = message;
  window.clearTimeout(state.statusTimer);
  state.statusTimer = window.setTimeout(() => {
    state.statusOverride = false;
    updateStatus();
  }, 1800);
}

function titleCase(value) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "narrative-canvas";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeSvg(value) {
  return escapeHtml(value);
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("\n", "&#10;");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
