const STORAGE_KEY = "narrative-canvas-project-v1";
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
  Frame: { badge: "F", color: "#98c379", width: 420 }
};

const sampleProject = {
  title: "The Adventure",
  notes: "Sketch scenes as nodes, connect them with ports, then play from Entry.",
  variables: {
    hero_name: "Hero",
    ancestry: "Great ancestry"
  },
  nodes: [
    { id: "n0", type: "Entry", title: "Start", body: "Adventure Begins", x: 80, y: 140 },
    { id: "n1", type: "Content", title: "Fancy to See Wonders?", body: "Dark was the night. Wandering and lost, the hero meets a stranger in the fog.", x: 260, y: 105 },
    { id: "n2", type: "Dialog", title: "Hero", body: "Down the rabbit hole?!\nI'll take the leap!", x: 300, y: 330 },
    { id: "n3", type: "Set", title: "Set Variable", body: "hero_name = Hero", variable: "hero_name", value: "Hero", x: 620, y: 350 },
    { id: "n4", type: "Frame", title: "Knowing the Hero", body: "A frame keeps related beats together.", x: 900, y: 318 },
    { id: "n5", type: "Choice", title: "The Stranger", body: "Choose a path.", choices: ["Cross the seven seas", "Return to the village"], x: 970, y: 475 },
    { id: "n6", type: "Content", title: "Great ancestry!", body: "{hero_name} of the {ancestry}, a long line of braves ruling the eastern realm.", x: 1335, y: 420 },
    { id: "n7", type: "Dialog", title: "The Stranger", body: "We'll cross the seven seas. We'll find charms and treasures of the seven realms.", x: 745, y: 148 },
    { id: "n8", type: "Marker", title: "WIP", body: "Keep drafting here.", x: 1125, y: 170 },
    { id: "n9", type: "Condition", title: "Has a name?", body: "hero_name == Hero", condition: "hero_name == Hero", x: 1405, y: 250 },
    { id: "n10", type: "Jump", title: "R1", body: "1st Realm", x: 1575, y: 170 }
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
  variables: "Variables.json"
};

const state = {
  project: cloneProject(sampleProject),
  selectedNodeId: "n1",
  selectedLinkId: null,
  panel: "project",
  activeFileId: "adventure",
  activeRibbon: "show-files",
  view: { x: 0, y: 0, scale: 0.82 },
  connectingFrom: null,
  draggingNode: null,
  panning: null,
  playNodeId: null,
  search: ""
};

const dom = {};

document.addEventListener("DOMContentLoaded", () => {
  bindDom();
  loadFromStorage(false);
  renderAll();
  bindEvents();
  centerView(false);
});

function bindDom() {
  dom.viewport = document.getElementById("canvasViewport");
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
  dom.notes = document.getElementById("projectNotes");
  dom.hint = document.getElementById("selectionHint");
  dom.minimap = document.getElementById("minimap");
  dom.playDialog = document.getElementById("playDialog");
  dom.playTitle = document.getElementById("playTitle");
  dom.playBody = document.getElementById("playBody");
  dom.playActions = document.getElementById("playActions");
}

function bindEvents() {
  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("input", handleInput);
  document.addEventListener("change", handleChange);
  document.addEventListener("keydown", handleKeyDown);
  window.addEventListener("resize", () => renderLinks());

  dom.viewport.addEventListener("pointerdown", handleViewportPointerDown);
  dom.viewport.addEventListener("pointermove", handleViewportPointerMove);
  dom.viewport.addEventListener("pointerup", endPointerActions);
  dom.viewport.addEventListener("pointerleave", endPointerActions);
  dom.viewport.addEventListener("wheel", handleWheel, { passive: false });

  dom.fileInput.addEventListener("change", importJsonFile);
}

function cloneProject(project) {
  return JSON.parse(JSON.stringify(project));
}

function renderAll() {
  renderShellState();
  renderPalette();
  renderTransform();
  renderNodes();
  renderLinks();
  renderInspector();
  renderMinimap();
  updateStatus();
}

function renderShellState() {
  document.querySelectorAll(".ribbon-button").forEach((button) => {
    const isActive = button.dataset.action === state.activeRibbon;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  document.querySelectorAll(".tree-item[data-file-id]").forEach((button) => {
    const isActive = button.dataset.fileId === state.activeFileId;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  if (dom.activeFileTab) {
    dom.activeFileTab.textContent = fileViews[state.activeFileId] || fileViews.adventure;
  }
}

function renderPalette() {
  dom.palette.innerHTML = Object.entries(nodeTypes)
    .map(([type, meta]) => `
      <button class="palette-item" data-action="add-node" data-type="${type}">
        <span class="palette-badge" style="--node-color:${meta.color}">${meta.badge}</span>
        ${type}
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
      const isFrame = node.type === "Frame";
      const match = query && nodeMatches(node, query);
      const width = node.width || meta.width || 230;
      return `
        <article class="node ${isFrame ? "frame" : ""} ${isSelected ? "selected" : ""}" data-node-id="${node.id}" style="left:${node.x}px; top:${node.y}px; width:${width}px; --node-color:${meta.color}; ${match ? "outline:1px solid var(--accent-orange);" : ""}">
          <button class="port input" data-port="input" data-node-id="${node.id}" title="Input"></button>
          <div class="node-header" data-drag-handle="true" data-node-id="${node.id}">
            <span class="node-icon">${meta.badge}</span>
            <span class="node-type">${node.type}</span>
            <span class="node-id">${node.id.replace("n", "#")}</span>
          </div>
          <div class="node-body">
            <div class="node-title">${escapeHtml(node.title || "Untitled")}</div>
            <div class="node-text">${escapeHtml(displayBody(node))}</div>
            ${node.type === "Choice" && Array.isArray(node.choices) ? `<div class="node-meta">${node.choices.length} choices</div>` : ""}
          </div>
          <button class="port output" data-port="output" data-node-id="${node.id}" title="Output"></button>
        </article>
      `;
    })
    .join("");

  const matches = query ? state.project.nodes.filter((node) => nodeMatches(node, query)).length : 0;
  dom.matchCount.textContent = `${matches} matches`;
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
        <button class="small-button" data-action="save-local">Save browser copy</button>
        <button class="small-button" data-action="export-json">Export JSON</button>
        <button class="small-button" data-action="import-json">Import JSON</button>
      </div>
      <label class="field">
        <span>Variables JSON</span>
        <textarea data-project-field="variables">${escapeHtml(JSON.stringify(state.project.variables || {}, null, 2))}</textarea>
      </label>
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
          ${Object.keys(nodeTypes).map((type) => `<option value="${type}" ${node.type === type ? "selected" : ""}>${type}</option>`).join("")}
        </select>
      </label>
      <label class="field">
        <span>Title</span>
        <input data-node-field="title" value="${escapeAttr(node.title || "")}">
      </label>
      <label class="field">
        <span>Content</span>
        <textarea data-node-field="body">${escapeHtml(node.body || "")}</textarea>
      </label>
      ${renderTypeFields(node)}
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
    <div class="story-list">
      ${ordered.map((node, index) => `
        <button class="story-item" data-action="select-node" data-node-id="${node.id}">
          <span class="story-item-title">${index + 1}. ${escapeHtml(node.title || node.type)}</span>
          <span class="story-item-meta">${node.type} ${node.id}</span>
        </button>
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
  const actionTarget = event.target.closest("[data-action]");
  const fileTarget = event.target.closest("[data-file-id]");
  const panelTarget = event.target.closest("[data-panel]");
  const port = event.target.closest("[data-port]");
  const link = event.target.closest("[data-link-id]");
  const node = event.target.closest("[data-node-id]");

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

function handleAction(target) {
  const action = target.dataset.action;
  if (target.classList.contains("ribbon-button")) {
    state.activeRibbon = action;
    renderShellState();
  }
  if (action === "add-node") addNode(target.dataset.type);
  if (action === "new-project") newProject();
  if (action === "show-files") showFiles();
  if (action === "focus-search") focusSearch();
  if (action === "show-settings") showSettings();
  if (action === "zoom-in") setZoom(state.view.scale + 0.1);
  if (action === "zoom-out") setZoom(state.view.scale - 0.1);
  if (action === "center-view") centerView();
  if (action === "save-local") saveToStorage();
  if (action === "export-json") exportJson();
  if (action === "import-json") dom.fileInput.click();
  if (action === "play") openPreview();
  if (action === "duplicate-node") duplicateSelectedNode();
  if (action === "delete-node") deleteSelectedNode();
  if (action === "focus-node") focusSelectedNode();
  if (action === "select-node") selectNode(target.dataset.nodeId);
  if (action === "play-next") advancePreview(target.dataset.nodeId);
  if (action === "restart-play") openPreview();
}

function selectFile(fileId) {
  if (!fileViews[fileId]) return;
  state.activeFileId = fileId;
  state.activeRibbon = "show-files";

  if (fileId === "adventure") {
    state.panel = state.selectedNodeId ? "node" : "project";
    renderAll();
    setStatus("The Adventure.canvas opened.");
    return;
  }

  if (fileId === "characters") {
    state.panel = "story";
    renderAll();
    setStatus("Characters.md opened in the Story panel.");
    return;
  }

  state.panel = "project";
  renderAll();
  setStatus("Variables.json opened in the Project panel.");
  requestAnimationFrame(() => {
    document.querySelector("[data-project-field='variables']")?.focus();
  });
}

function showFiles() {
  state.activeRibbon = "show-files";
  renderShellState();
  setStatus("Files panel active.");
}

function focusSearch() {
  state.activeRibbon = "focus-search";
  renderShellState();
  dom.queryInput.focus();
  dom.queryInput.select();
  setStatus("Search ready.");
}

function showSettings() {
  state.activeRibbon = "show-settings";
  state.activeFileId = "variables";
  state.panel = "project";
  renderAll();
  setStatus("Settings opened.");
}

function handleInput(event) {
  const target = event.target;

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
  if (target.dataset.projectField) {
    setProjectField(target.dataset.projectField, target.value);
    return;
  }
  if (target.dataset.nodeField) {
    setNodeField(target.dataset.nodeField, target.value);
  }
}

function handleKeyDown(event) {
  if (event.target.matches("input, textarea, select")) return;
  if (event.key === "Delete" || event.key === "Backspace") {
    if (state.selectedNodeId) deleteSelectedNode();
    if (state.selectedLinkId) deleteSelectedLink();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveToStorage();
  }
}

function handleViewportPointerDown(event) {
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
  if (state.draggingNode) {
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
  if (state.draggingNode || state.panning) {
    try {
      dom.viewport.releasePointerCapture(event.pointerId);
    } catch (error) {
      // Pointer capture is already gone.
    }
  }
  state.draggingNode = null;
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
  state.project.nodes.push(node);
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
    Frame: "Group related beats."
  };
  return defaults[type] || "";
}

function selectNode(id, rerender = true) {
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
  updateStatus();
}

function setNodeField(field, value) {
  const node = getNode(state.selectedNodeId);
  if (!node) return;
  if (field === "x" || field === "y") {
    node[field] = Number(value) || 0;
  } else if (field === "choices") {
    node.choices = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
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
  const rect = dom.viewport.getBoundingClientRect();
  state.view.x = rect.width / 2 - (node.x + 120) * state.view.scale;
  state.view.y = rect.height / 2 - (node.y + 60) * state.view.scale;
  renderTransform();
  updateGridPosition();
}

function centerView(announce = true) {
  const bounds = getProjectBounds();
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

function newProject() {
  state.project = {
    title: "Untitled Story",
    notes: "",
    variables: {},
    nodes: [{ id: "n0", type: "Entry", title: "Start", body: "Adventure Begins", x: 120, y: 120 }],
    links: []
  };
  state.selectedNodeId = "n0";
  state.selectedLinkId = null;
  state.panel = "project";
  centerView(false);
  renderAll();
  setStatus("New project created.");
}

function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.project));
  setStatus("Saved to this browser.");
}

function loadFromStorage(announce = true) {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;
  try {
    state.project = normalizeProject(JSON.parse(saved));
    state.selectedNodeId = state.project.nodes[0]?.id || null;
    if (announce) setStatus("Loaded browser copy.");
  } catch (error) {
    if (announce) setStatus("Could not load browser copy.");
  }
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state.project, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slugify(state.project.title || "narrative-canvas")}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  setStatus("JSON exported.");
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
    nodes: Array.isArray(project.nodes) ? project.nodes : [],
    links: Array.isArray(project.links) ? project.links : []
  };
}

function openPreview() {
  const entry = state.project.nodes.find((node) => node.type === "Entry") || state.project.nodes[0];
  if (!entry) {
    setStatus("No nodes to play.");
    return;
  }
  state.playNodeId = entry.id;
  renderPreviewNode(entry.id);
  dom.playDialog.showModal();
}

function advancePreview(nodeId) {
  state.playNodeId = nodeId;
  renderPreviewNode(nodeId);
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

  dom.playTitle.textContent = node.title || node.type;
  dom.playBody.innerHTML = `
    <h3>${escapeHtml(node.type)}</h3>
    <p>${escapeHtml(interpolate(displayBody(node)))}</p>
  `;

  if (node.type === "Choice" && nextLinks.length) {
    const choices = node.choices || [];
    dom.playActions.innerHTML = nextLinks.map((link, index) => {
      const target = getNode(link.to);
      const label = choices[index] || link.label || target?.title || "Continue";
      return `<button class="play-action" data-action="play-next" data-node-id="${link.to}">${escapeHtml(label)}</button>`;
    }).join("");
    return;
  }

  dom.playActions.innerHTML = nextLinks.length
    ? `<button class="play-action primary" data-action="play-next" data-node-id="${nextLinks[0].to}">Continue</button>`
    : `<button class="play-action" data-action="restart-play">Restart</button>`;
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
  const bottoms = state.project.nodes.map((node) => node.y + (node.type === "Frame" ? 250 : 150));
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(...rights) - minX,
    height: Math.max(...bottoms) - minY
  };
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
  return node.type === "Frame" ? 250 : Math.max(126, 80 + Math.min(120, String(node.body || "").length * 0.35));
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

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("\n", "&#10;");
}
