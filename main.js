const { ItemView, Notice, Plugin, PluginSettingTab, Setting, SuggestModal, TFile, TFolder, normalizePath } = require("obsidian");

const VIEW_TYPE = "narrative-canvas-view";
const PLUGIN_ID = "narrative-canvas";
const PROJECT_EXTENSIONS = ["ncanvas", "narrativecanvas"];
const LEGACY_JSON_EXTENSION = "json";
const DEFAULT_PROJECT_EXTENSION = "ncanvas";
const SAVED_STATE_VERSION = 1;
const DEFAULT_FILENAME_TEMPLATE = "{{project title}}-{{YYYY-MM-DD HHmmss}}.ncanvas";
const DEFAULT_AUTO_SAVE_INTERVAL_SECONDS = 0;
const FALLBACK_AUTO_SAVE_INTERVAL_SECONDS = 2;
const MIN_AUTO_SAVE_INTERVAL_SECONDS = 1;
const MAX_AUTO_SAVE_INTERVAL_SECONDS = 3600;
const FILENAME_TEMPLATE_TOKENS = [
  "{{project title}}",
  "{{YYYY-MM-DD}}",
  "{{YYYY-MM-DD HHmmss}}",
  "{{YYYYMMDD}}",
  "{{YYYYMMDD-HHmmss}}",
  "{{HHmmss}}"
];
const DEFAULT_SETTINGS = {
  saveFolder: "",
  filenameTemplate: DEFAULT_FILENAME_TEMPLATE,
  autoSaveIntervalSeconds: DEFAULT_AUTO_SAVE_INTERVAL_SECONDS,
  currentProjectPath: "",
  lastProjectPath: ""
};
const LEGACY_PROJECT_FILE = "NarrativeCanvas/project.json";
const STATE_FILE = "data.json";

module.exports = class NarrativeCanvasPlugin extends Plugin {
  async onload() {
    await this.loadPluginData();
    this.registerView(VIEW_TYPE, (leaf) => new NarrativeCanvasView(leaf, this));
    try {
      this.registerExtensions(PROJECT_EXTENSIONS, VIEW_TYPE);
    } catch (error) {
      console.error(error);
      new Notice("Narrative Canvas file association could not be registered. The ribbon command will still work.");
    }
    this.addSettingTab(new NarrativeCanvasSettingTab(this.app, this));

    this.addRibbonIcon("git-branch", "Open Narrative Canvas", () => this.openCanvas().catch((error) => this.reportOpenError(error)));

    this.addCommand({
      id: "open",
      name: "Open Narrative Canvas",
      callback: () => this.openCanvas().catch((error) => this.reportOpenError(error))
    });

    this.addCommand({
      id: "save-to-vault",
      name: "Save project file to vault",
      callback: () => this.saveActiveCanvas().catch((error) => this.reportOpenError(error))
    });

    this.addCommand({
      id: "create-sample-project",
      name: "Open sample Narrative Canvas project",
      callback: () => this.openSampleProject().catch((error) => this.reportOpenError(error))
    });

    this.registerEvent(this.app.workspace.on("file-open", (file) => {
      this.handleVaultFileOpen(file);
    }));
  }

  async saveActiveCanvas() {
    let app = window.NarrativeCanvasApp;
    if (!app?.save) {
      await this.activateView(true);
      await wait(600);
      app = window.NarrativeCanvasApp;
    }
    if (!app?.save) {
      new Notice("Open Narrative Canvas first, then save to the vault.");
      return;
    }
    try {
      const saved = await app.save();
      const target = this.getCurrentProjectPath();
      new Notice(saved ? `Narrative Canvas saved to ${target || "vault project file"}.` : "Narrative Canvas save failed.");
    } catch (error) {
      console.error(error);
      new Notice("Narrative Canvas save failed.");
    }
  }

  async openCanvas() {
    const path = await this.prepareProjectForOpen({ createIfMissing: true });
    await this.activateView(true, path ? this.getProjectLeafForPath(path) : null);
    if (window.NarrativeCanvasApp?.loadVaultProject) {
      await window.NarrativeCanvasApp.loadVaultProject();
    }
  }

  async openSampleProject() {
    await this.activateView(true);
    await wait(600);
    const app = window.NarrativeCanvasApp;
    if (!app?.createSampleProjectFile) {
      throw new Error("Canvas app did not expose sample project creation.");
    }
    const created = await app.createSampleProjectFile();
    new Notice(created ? "Sample Narrative Canvas project created." : "Sample Narrative Canvas project creation failed.");
  }

  onunload() {
    this.captureSessionStateFromApp();
    void this.savePluginData().catch((error) => console.error(error));
    const canvasApp = window.NarrativeCanvasApp;
    canvasApp?.destroy?.();
    if (window.NarrativeCanvasApp === canvasApp) {
      delete window.NarrativeCanvasApp;
    }
    if (window.NarrativeCanvasHost?.pluginId === PLUGIN_ID) {
      delete window.NarrativeCanvasHost;
    }
  }

  async activateView(focus, preferredLeaf = null) {
    let leaf = this.isNarrativeCanvasLeaf(preferredLeaf)
      ? preferredLeaf
      : this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];

    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab") || this.app.workspace.getLeaf(true);
      await leaf.setViewState({
        type: VIEW_TYPE,
        state: {},
        active: focus
      });
    }

    const viewType = leaf.view?.getViewType?.() || leaf.getViewState?.()?.type;
    if (viewType !== VIEW_TYPE) {
      throw new Error(`Obsidian opened ${viewType || "an empty leaf"} instead of Narrative Canvas.`);
    }

    if (focus) {
      this.app.workspace.setActiveLeaf?.(leaf, { focus: true });
      this.app.workspace.revealLeaf(leaf);
    }
    return leaf;
  }

  reportOpenError(error) {
    console.error(error);
    const message = error?.message || String(error || "Unknown error");
    new Notice(`Narrative Canvas could not open: ${message}`);
  }

  async loadCanvasAssets() {
    return {
      bodyHtml: extractBodyHtml(CANVAS_INDEX_HTML)
    };
  }

  async loadPluginData() {
    const raw = await this.loadData();
    this.settings = normalizeSettings(raw?.settings);
    this.sessionState = raw?.session || (isSavedStatePayload(raw) ? raw : null);
  }

  async savePluginData() {
    await this.saveData({
      settings: this.settings,
      session: this.sessionState || null
    });
  }

  getAutoSaveIntervalMs() {
    const customSeconds = normalizeAutoSaveIntervalSeconds(this.settings?.autoSaveIntervalSeconds);
    if (customSeconds > 0) return customSeconds * 1000;
    return getObsidianAutoSaveIntervalMs(this.app);
  }

  getAutoSaveDefaultLabel() {
    return formatAutoSaveIntervalSeconds(Math.round(getObsidianAutoSaveIntervalMs(this.app) / 1000));
  }

  getAutoSaveDefaultPlaceholder() {
    return formatAutoSaveIntervalCompact(Math.round(getObsidianAutoSaveIntervalMs(this.app) / 1000));
  }

  notifyCanvasSettingsChanged() {
    window.NarrativeCanvasApp?.configureAutoSave?.();
  }

  async clearCurrentProjectPath() {
    this.settings.currentProjectPath = "";
    this.settings.lastProjectPath = "";
    await this.savePluginData();
    this.refreshViewTitles();
  }

  getCurrentProjectPath() {
    return this.settings?.currentProjectPath || this.settings?.lastProjectPath || "";
  }

  async setCurrentProjectPath(path, options = {}) {
    const normalized = normalizeVaultPath(path);
    this.settings.currentProjectPath = normalized;
    this.settings.lastProjectPath = normalized;
    await this.savePluginData();
    if (options.syncViewState !== false) {
      await this.syncProjectFileViewState(normalized, options.leaf);
    }
    this.refreshViewTitles();
  }

  refreshViewTitles() {
    this.app.workspace?.getLeavesOfType(VIEW_TYPE)?.forEach((leaf) => {
      leaf.updateHeader?.();
      leaf.view?.updateHeader?.();
    });
    this.app.workspace?.requestSaveLayout?.();
  }

  isNarrativeCanvasLeaf(leaf) {
    const viewType = leaf?.view?.getViewType?.() || leaf?.getViewState?.()?.type;
    return viewType === VIEW_TYPE;
  }

  findProjectLeaf(path) {
    const normalized = normalizeVaultPath(path);
    const leaves = this.app.workspace?.getLeavesOfType?.(VIEW_TYPE) || [];
    return leaves.find((leaf) => {
      const state = leaf.getViewState?.()?.state || {};
      const leafPath = normalizeVaultPath(state.file || state.path);
      return leafPath && leafPath === normalized;
    }) || null;
  }

  getProjectLeafForPath(path, preferredLeaf = null) {
    if (this.isNarrativeCanvasLeaf(preferredLeaf)) return preferredLeaf;
    const matchingLeaf = this.findProjectLeaf(path);
    if (matchingLeaf) return matchingLeaf;
    const activeLeaf = this.app.workspace?.activeLeaf;
    if (this.isNarrativeCanvasLeaf(activeLeaf)) return activeLeaf;
    return this.app.workspace?.getLeavesOfType?.(VIEW_TYPE)?.[0] || null;
  }

  async syncProjectFileViewState(path, preferredLeaf = null) {
    const normalized = normalizeVaultPath(path);
    if (!normalized || this.syncingProjectViewState) return;
    const leaf = this.getProjectLeafForPath(normalized, preferredLeaf);
    if (!leaf?.setViewState) return;
    const viewState = leaf.getViewState?.() || {};
    const currentPath = normalizeVaultPath(viewState.state?.file || viewState.state?.path);
    const nextState = { ...(viewState.state || {}), file: normalized };
    if (viewState.type === VIEW_TYPE && currentPath === normalized) return;
    this.syncingProjectViewState = true;
    try {
      await leaf.setViewState({
        ...viewState,
        type: VIEW_TYPE,
        state: nextState,
        active: false
      });
    } finally {
      this.syncingProjectViewState = false;
    }
  }

  async prepareProjectForOpen(options = {}) {
    const preferred = await this.resolveProjectPathForOpen();
    if (preferred) {
      this.settings.currentProjectPath = preferred;
      this.settings.lastProjectPath = preferred;
      await this.savePluginData();
    } else if (this.settings.currentProjectPath || this.settings.lastProjectPath) {
      this.settings.currentProjectPath = "";
      this.settings.lastProjectPath = "";
      await this.savePluginData();
    }
    if (preferred || !options.createIfMissing) return preferred;
    return this.createDefaultProjectFileForOpen();
  }

  async resolveProjectPathForOpen() {
    const current = normalizeVaultPath(this.settings.currentProjectPath);
    if (current && vaultFileExists(this.app, current)) return current;

    const last = normalizeVaultPath(this.settings.lastProjectPath);
    if (last && vaultFileExists(this.app, last)) return last;

    return "";
  }

  async createDefaultProjectFileForOpen() {
    const savedStateJson = JSON.stringify(createBlankSavedState("Untitled"), null, 2);
    const path = await this.createProjectFile(savedStateJson, { filenameProjectTitle: "Untitled" });
    new Notice(`Narrative Canvas created ${path}.`);
    return path;
  }

  async loadProjectFile() {
    const path = await this.prepareProjectForOpen();
    if (path && vaultFileExists(this.app, path)) return readVaultText(this.app, path);
    if (vaultFileExists(this.app, LEGACY_PROJECT_FILE)) return readVaultText(this.app, LEGACY_PROJECT_FILE);
    return null;
  }

  async saveProjectFile(savedStateJson) {
    const path = await this.ensureWritableProjectPath(savedStateJson, { forceNew: false });
    await writeVaultText(this.app, path, savedStateJson);
    await this.setCurrentProjectPath(path);
    return path;
  }

  async ensureProjectFile(savedStateJson, options = {}) {
    const existing = await this.resolveProjectPathForOpen();
    if (options?.filenameOverride) {
      const folder = normalizeSaveFolder(this.settings.saveFolder);
      await this.ensureFolder(folder);
      const preferredPath = joinVaultPath(folder, this.renderProjectFilename(savedStateJson, options));
      const normalizedPreferred = normalizeVaultPath(preferredPath);
      const normalizedExisting = normalizeVaultPath(existing);
      if (!normalizedExisting || normalizedExisting === normalizedPreferred || isGeneratedSampleProjectPath(existing)) {
        if (!vaultFileExists(this.app, preferredPath)) {
          await writeVaultText(this.app, preferredPath, savedStateJson);
          await this.setCurrentProjectPath(preferredPath);
          return preferredPath;
        }
        await this.setCurrentProjectPath(preferredPath);
        return "";
      }
    }
    if (existing && vaultFileExists(this.app, existing)) {
      await this.setCurrentProjectPath(existing);
      return "";
    }
    const path = await this.ensureWritableProjectPath(savedStateJson, { ...options, forceNew: true });
    await writeVaultText(this.app, path, savedStateJson);
    await this.setCurrentProjectPath(path);
    return path;
  }

  async createProjectFile(savedStateJson, options = {}) {
    const path = await this.ensureWritableProjectPath(savedStateJson, { ...options, forceNew: true });
    await writeVaultText(this.app, path, savedStateJson);
    await this.setCurrentProjectPath(path);
    return path;
  }

  async previewNewProjectFile(savedStateJson, options = {}) {
    const folder = normalizeSaveFolder(this.settings.saveFolder);
    const desiredPath = joinVaultPath(folder, this.renderProjectFilename(savedStateJson, options));
    return this.uniqueProjectPath(desiredPath);
  }

  async chooseProjectFile() {
    const files = await this.findNarrativeCanvasProjectFiles();
    if (!files.length) {
      const folder = normalizeSaveFolder(this.settings.saveFolder);
      new Notice(folder
        ? `No Narrative Canvas project files found in ${folder}.`
        : "No Narrative Canvas project files found in the vault root.");
      return "";
    }
    return new Promise((resolve) => {
      const modal = new NarrativeCanvasProjectSuggestModal(this.app, files, async (file) => {
        await this.openProjectFile(file.path);
        resolve(file.path);
      }, () => resolve(""));
      modal.open();
    });
  }

  async findNarrativeCanvasProjectFiles() {
    const folder = normalizeSaveFolder(this.settings.saveFolder);
    const candidates = this.app.vault.getFiles()
      .filter((file) => isProjectFileExtension(file.extension))
      .filter((file) => isVaultPathInProjectSaveFolder(file.path, folder))
      .sort((a, b) => a.path.localeCompare(b.path));
    const checked = await Promise.all(candidates.map(async (file) => ({
      file,
      valid: await this.isNarrativeCanvasProjectFile(file.path)
    })));
    return checked.filter((item) => item.valid).map((item) => item.file);
  }

  async ensureWritableProjectPath(savedStateJson, options = {}) {
    const folder = normalizeSaveFolder(this.settings.saveFolder);
    await this.ensureFolder(folder);

    const current = options.forceNew ? "" : await this.resolveProjectPathForSave();
    if (!options.forceNew && current) {
      await this.ensureSaveFolderForPath(current);
      return current;
    }

    const desiredPath = joinVaultPath(folder, this.renderProjectFilename(savedStateJson, options));
    return this.uniqueProjectPath(desiredPath);
  }

  async resolveProjectPathForSave() {
    const candidates = [
      normalizeVaultPath(this.settings.currentProjectPath),
      this.getProjectPathFromOpenView(),
      normalizeVaultPath(this.settings.lastProjectPath)
    ];

    for (const candidate of candidates) {
      if (candidate && vaultFileExists(this.app, candidate)) return candidate;
    }
    return "";
  }

  getProjectPathFromOpenView() {
    if (this.readingOpenViewPath) return "";
    this.readingOpenViewPath = true;
    const leaves = this.app.workspace?.getLeavesOfType?.(VIEW_TYPE) || [];
    try {
      for (const leaf of leaves) {
        const viewState = leaf.getViewState?.();
        const file = normalizeVaultPath(viewState?.state?.file || viewState?.state?.path);
        if (file && isProjectFileExtension(getVaultPathExtension(file))) return file;
      }
    } finally {
      this.readingOpenViewPath = false;
    }
    return "";
  }

  async findProjectFileForSessionState() {
    if (!this.sessionState) return "";
    const folder = normalizeSaveFolder(this.settings.saveFolder);
    const expected = joinVaultPath(folder, this.renderProjectFilename(JSON.stringify(this.sessionState)));
    if (expected && vaultFileExists(this.app, expected)) return expected;
    return "";
  }

  renderProjectFilename(savedStateJson, options = {}) {
    const filenameOverride = sanitizeFileName(options?.filenameOverride || "");
    if (filenameOverride) return ensureProjectExtension(filenameOverride);
    const rendered = renderFilenameTemplate(this.settings.filenameTemplate, savedStateJson, new Date(), options);
    return ensureProjectExtension(sanitizeFileName(rendered));
  }

  async uniqueProjectPath(path, ignorePath = "") {
    const ignored = normalizeVaultPath(ignorePath);
    if (ignored && normalizeVaultPath(path) === ignored) return path;
    if (!vaultFileExists(this.app, path)) return path;
    const extension = getVaultPathExtension(path);
    const suffix = extension ? `.${extension}` : "";
    const base = suffix ? path.slice(0, -suffix.length) : path;
    let index = 2;
    let candidate = `${base}-${index}${suffix}`;
    while (vaultFileExists(this.app, candidate) && normalizeVaultPath(candidate) !== ignored) {
      index += 1;
      candidate = `${base}-${index}${suffix}`;
    }
    return candidate;
  }

  async ensureSaveFolderForPath(path) {
    const folder = path.includes("/") ? path.split("/").slice(0, -1).join("/") : "";
    await this.ensureFolder(folder);
  }

  async ensureFolder(folder) {
    const normalized = normalizeSaveFolder(folder);
    if (!normalized) return;
    await ensureVaultFolder(this.app, normalized);
  }

  async isNarrativeCanvasProjectFile(path) {
    try {
      const text = await readVaultText(this.app, path);
      return isSavedStatePayload(JSON.parse(text));
    } catch (error) {
      return false;
    }
  }

  async handleVaultFileOpen(file) {
    if (!file || !isProjectFileExtension(file.extension)) return;
    if (!(await this.isNarrativeCanvasProjectFile(file.path))) return;
    await this.openProjectFile(file.path, this.getProjectLeafForPath(file.path));
  }

  async openProjectFile(path, leaf = null) {
    const targetLeaf = await this.activateView(true, leaf || this.getProjectLeafForPath(path));
    await this.setCurrentProjectPath(path, { leaf: targetLeaf });
    const app = window.NarrativeCanvasApp;
    if (app?.loadVaultProject) {
      await app.loadVaultProject();
    }
  }

  async loadSavedState() {
    return this.sessionState;
  }

  async saveSavedState(savedState) {
    this.sessionState = savedState;
    await this.savePluginData();
    return STATE_FILE;
  }

  captureSessionStateFromApp() {
    try {
      const savedState = window.NarrativeCanvasApp?.getSavedState?.();
      if (!savedState) return false;
      this.sessionState = savedState;
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }
};

class NarrativeCanvasView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.styleEl = null;
  }

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    const path = this.plugin.getCurrentProjectPath();
    return projectDisplayName(path) || "Narrative Canvas";
  }

  getIcon() {
    return "git-branch";
  }

  getState() {
    const state = super.getState ? super.getState() : {};
    const file = this.plugin.getCurrentProjectPath();
    return file ? { ...state, file } : state;
  }

  async setState(state, result) {
    if (super.setState) await super.setState(state, result);
    const file = normalizeVaultPath(state?.file || state?.path);
    if (!file || !(await this.plugin.isNarrativeCanvasProjectFile(file))) return;
    await this.plugin.setCurrentProjectPath(file, { leaf: this.leaf, syncViewState: false });
    if (!this.plugin.syncingProjectViewState && window.NarrativeCanvasApp?.loadVaultProject) {
      await window.NarrativeCanvasApp.loadVaultProject();
    }
  }

  async onOpen() {
    this.contentEl.replaceChildren();
    this.contentEl.addClass("narrative-canvas-plugin-host");
    this.contentEl.createEl("div", {
      cls: "narrative-canvas-plugin-loading",
      text: "Loading Narrative Canvas..."
    });

    try {
      const { bodyHtml } = await this.plugin.loadCanvasAssets();
      mountCanvasHtml(this.contentEl, bodyHtml);
      window.NarrativeCanvasHost = {
        pluginId: PLUGIN_ID,
        root: this.contentEl,
        loadState: () => this.plugin.loadSavedState(),
        saveState: (savedState) => this.plugin.saveSavedState(savedState),
        loadProject: () => this.plugin.loadProjectFile(),
        saveProject: (savedStateJson) => this.plugin.saveProjectFile(savedStateJson),
        getAutoSaveIntervalMs: () => this.plugin.getAutoSaveIntervalMs(),
        ensureProjectFile: (savedStateJson, options) => this.plugin.ensureProjectFile(savedStateJson, options),
        createProjectFile: (savedStateJson, options) => this.plugin.createProjectFile(savedStateJson, options),
        previewNewProjectFile: (savedStateJson, options) => this.plugin.previewNewProjectFile(savedStateJson, options),
        chooseProjectFile: () => this.plugin.chooseProjectFile(),
        getProjectFile: () => this.plugin.getCurrentProjectPath(),
        stateFile: STATE_FILE,
        legacyProjectFile: LEGACY_PROJECT_FILE
      };
      window.NarrativeCanvasApp?.destroy?.();
      installNarrativeCanvasApp();
      const canvasApp = window.NarrativeCanvasApp;
      if (!canvasApp?.init) throw new Error("Canvas app did not register an initializer.");
      const started = await canvasApp.init();
      if (started === false) throw new Error("Canvas app initialization failed.");
    } catch (error) {
      console.error(error);
      this.contentEl.replaceChildren();
      this.contentEl.createEl("div", {
        cls: "narrative-canvas-plugin-error",
        text: `Narrative Canvas failed to load: ${error?.message || "check the developer console for details."}`
      });
      new Notice("Narrative Canvas failed to load.");
    }
  }

  async onClose() {
    this.plugin.captureSessionStateFromApp();
    try {
      await this.plugin.savePluginData();
    } catch (error) {
      console.error(error);
    }
    const canvasApp = window.NarrativeCanvasApp;
    canvasApp?.destroy?.();
    if (window.NarrativeCanvasApp === canvasApp) {
      delete window.NarrativeCanvasApp;
    }
    if (window.NarrativeCanvasHost?.pluginId === PLUGIN_ID) {
      delete window.NarrativeCanvasHost;
    }
    this.contentEl.removeClass("narrative-canvas-plugin-host");
    this.contentEl.replaceChildren();
  }
}

class NarrativeCanvasProjectSuggestModal extends SuggestModal {
  constructor(app, files, onChoose, onCancel) {
    super(app);
    this.files = files;
    this.onChooseProject = onChoose;
    this.onCancelProject = onCancel;
    this.completed = false;
    this.setPlaceholder("Open Narrative Canvas project");
  }

  getSuggestions(query) {
    const needle = String(query || "").trim().toLowerCase();
    if (!needle) return this.files;
    return this.files.filter((file) => file.path.toLowerCase().includes(needle));
  }

  renderSuggestion(file, el) {
    el.createEl("div", { cls: "narrative-canvas-project-suggestion-title", text: projectDisplayName(file.path) });
    el.createEl("small", { text: file.path });
  }

  async onChooseSuggestion(file) {
    this.completed = true;
    await this.onChooseProject?.(file);
  }

  onClose() {
    if (!this.completed) this.onCancelProject?.();
  }
}

class NarrativeCanvasSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Sample project")
      .setDesc("Create and open a sample Narrative Canvas project.")
      .addButton((button) => {
        button
          .setButtonText("Open sample")
          .setCta()
          .onClick(() => {
            this.plugin.openSampleProject().catch((error) => this.plugin.reportOpenError(error));
          });
      });

    new Setting(containerEl)
      .setName("Project save folder")
      .setDesc("Vault-relative folder for Narrative Canvas project files. Leave empty to save in the vault root.")
      .addText((text) => {
        text
          .setPlaceholder("/")
          .setValue(this.plugin.settings.saveFolder || "")
          .onChange(async (value) => {
            this.plugin.settings.saveFolder = normalizeSaveFolder(value);
            await this.plugin.savePluginData();
          });
      });

    const filenameDesc = document.createDocumentFragment();
    filenameDesc.append("Available placeholders: ");
    FILENAME_TEMPLATE_TOKENS.forEach((token, index) => {
      if (index) filenameDesc.append(", ");
      filenameDesc.createEl("code", { text: token });
    });
    const currentTemplate = this.plugin.settings.filenameTemplate || DEFAULT_FILENAME_TEMPLATE;

    new Setting(containerEl)
      .setName("New project file name")
      .setDesc(filenameDesc)
      .addText((text) => {
        text
          .setPlaceholder(DEFAULT_FILENAME_TEMPLATE)
          .setValue(currentTemplate)
          .onChange(async (value) => {
            this.plugin.settings.filenameTemplate = normalizeFilenameTemplate(value);
            await this.plugin.savePluginData();
          });
      })
      .addButton((button) => {
        button
          .setButtonText("Reset")
          .onClick(async () => {
            this.plugin.settings.filenameTemplate = DEFAULT_FILENAME_TEMPLATE;
            await this.plugin.savePluginData();
            this.display();
          });
      });

    new Setting(containerEl)
      .setName("Auto-save interval")
      .setDesc(`Seconds between automatic Narrative Canvas saves. Leave empty to use the default interval (${this.plugin.getAutoSaveDefaultLabel()}).`)
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = String(MIN_AUTO_SAVE_INTERVAL_SECONDS);
        text.inputEl.max = String(MAX_AUTO_SAVE_INTERVAL_SECONDS);
        text.inputEl.step = "1";
        text
          .setPlaceholder(this.plugin.getAutoSaveDefaultPlaceholder())
          .setValue(this.plugin.settings.autoSaveIntervalSeconds > 0 ? String(this.plugin.settings.autoSaveIntervalSeconds) : "")
          .onChange(async (value) => {
            this.plugin.settings.autoSaveIntervalSeconds = normalizeAutoSaveIntervalSeconds(value);
            await this.plugin.savePluginData();
            this.plugin.notifyCanvasSettingsChanged();
          });
      });

    new Setting(containerEl)
      .setName("Current project")
      .setDesc(this.plugin.getCurrentProjectPath() || "No project file selected. The ribbon button will create a new project with the default name.")
      .addButton((button) => {
        button
          .setButtonText("Clear")
          .onClick(async () => {
            await this.plugin.clearCurrentProjectPath();
            this.display();
          });
      });

  }
}

function normalizeSettings(rawSettings) {
  const source = rawSettings && typeof rawSettings === "object" && !Array.isArray(rawSettings) ? rawSettings : {};
  return {
    saveFolder: normalizeSaveFolder(source.saveFolder),
    filenameTemplate: normalizeFilenameTemplate(source.filenameTemplate),
    autoSaveIntervalSeconds: normalizeAutoSaveIntervalSeconds(source.autoSaveIntervalSeconds),
    currentProjectPath: normalizeVaultPath(source.currentProjectPath),
    lastProjectPath: normalizeVaultPath(source.lastProjectPath)
  };
}

function createBlankSavedState(title = "Untitled") {
  const projectTitle = String(title || "").trim() || "Untitled";
  return {
    version: SAVED_STATE_VERSION,
    savedAt: new Date().toISOString(),
    project: {
      title: projectTitle,
      notes: "",
      variables: {},
      characters: [],
      nodes: [
        { id: "n0", type: "Entry", title: "Start", body: "Adventure Begins", x: 120, y: 120 }
      ],
      links: []
    },
    ui: {
      selectedNodeId: "n0",
      selectedLinkId: null,
      panel: "project",
      activeFileId: "adventure",
      view: { x: 0, y: 0, scale: 1 },
      search: "",
      characterSearch: "",
      eventSearch: "",
      playbookJsonOpen: false
    }
  };
}

function normalizeAutoSaveIntervalSeconds(value) {
  if (value === "" || value == null) return DEFAULT_AUTO_SAVE_INTERVAL_SECONDS;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_AUTO_SAVE_INTERVAL_SECONDS;
  return Math.round(Math.max(MIN_AUTO_SAVE_INTERVAL_SECONDS, Math.min(MAX_AUTO_SAVE_INTERVAL_SECONDS, numeric)));
}

function getObsidianAutoSaveIntervalMs(app) {
  const candidates = [
    readObsidianConfigValue(app, "autoSaveInterval"),
    readObsidianConfigValue(app, "autosaveInterval"),
    readObsidianConfigValue(app, "autoSaveIntervalSeconds"),
    readObsidianConfigValue(app, "saveInterval"),
    app?.vault?.config?.autoSaveInterval,
    app?.vault?.config?.autosaveInterval,
    app?.vault?.config?.autoSaveIntervalSeconds,
    app?.vault?.config?.saveInterval
  ];

  for (const value of candidates) {
    const interval = normalizeObsidianAutoSaveIntervalMs(value);
    if (interval) return interval;
  }
  return FALLBACK_AUTO_SAVE_INTERVAL_SECONDS * 1000;
}

function readObsidianConfigValue(app, key) {
  try {
    if (typeof app?.vault?.getConfig === "function") return app.vault.getConfig(key);
  } catch (error) {
    return null;
  }
  return null;
}

function normalizeObsidianAutoSaveIntervalMs(value) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? (value.value ?? value.interval ?? value.seconds ?? value.ms)
    : value;
  const numeric = Number(source);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  const milliseconds = numeric < 1000 ? numeric * 1000 : numeric;
  return Math.round(Math.max(MIN_AUTO_SAVE_INTERVAL_SECONDS * 1000, Math.min(MAX_AUTO_SAVE_INTERVAL_SECONDS * 1000, milliseconds)));
}

function formatAutoSaveIntervalSeconds(seconds) {
  const value = normalizeAutoSaveIntervalSeconds(seconds) || FALLBACK_AUTO_SAVE_INTERVAL_SECONDS;
  return value === 1 ? "1 second" : `${value} seconds`;
}

function formatAutoSaveIntervalCompact(seconds) {
  const value = normalizeAutoSaveIntervalSeconds(seconds) || FALLBACK_AUTO_SAVE_INTERVAL_SECONDS;
  return `${value}s`;
}

function normalizeFilenameTemplate(value) {
  const template = String(value || "").trim();
  return template || DEFAULT_FILENAME_TEMPLATE;
}

function normalizeSaveFolder(value) {
  return normalizeVaultPath(value).replace(/\/+$/, "");
}

function normalizeVaultPath(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
  return normalized ? normalizePath(normalized) : "";
}

function getVaultAbstractFile(app, path) {
  const normalized = normalizeVaultPath(path);
  if (!normalized) return null;
  return app.vault.getAbstractFileByPath?.(normalized) || null;
}

function getVaultFile(app, path) {
  const file = getVaultAbstractFile(app, path);
  return file instanceof TFile ? file : null;
}

function getVaultFolder(app, path) {
  const folder = getVaultAbstractFile(app, path);
  return folder instanceof TFolder ? folder : null;
}

function vaultFileExists(app, path) {
  return Boolean(getVaultFile(app, path));
}

async function readVaultText(app, path) {
  const file = getVaultFile(app, path);
  if (!file) throw new Error(`Vault file not found: ${path}`);
  return app.vault.read(file);
}

async function writeVaultText(app, path, text) {
  const normalized = normalizeVaultPath(path);
  if (!normalized) throw new Error("Cannot write a Narrative Canvas file without a path.");
  await ensureVaultFolder(app, getVaultParentPath(normalized));
  const file = getVaultFile(app, normalized);
  if (file) {
    await app.vault.process(file, () => text);
    return file;
  }
  return app.vault.create(normalized, text);
}

function getVaultParentPath(path) {
  const normalized = normalizeVaultPath(path);
  return normalized.includes("/") ? normalized.split("/").slice(0, -1).join("/") : "";
}

async function ensureVaultFolder(app, folder) {
  const normalized = normalizeVaultPath(folder);
  if (!normalized) return;
  const parts = normalized.split("/").filter(Boolean);
  let cursor = "";
  for (const part of parts) {
    cursor = cursor ? `${cursor}/${part}` : part;
    if (!getVaultFolder(app, cursor)) await app.vault.createFolder(cursor);
  }
}

function joinVaultPath(folder, fileName) {
  const normalizedFolder = normalizeSaveFolder(folder);
  return normalizedFolder ? `${normalizedFolder}/${fileName}` : fileName;
}

function isVaultPathInProjectSaveFolder(path, saveFolder) {
  const normalizedPath = normalizeVaultPath(path);
  if (!normalizedPath) return false;
  const folder = normalizeSaveFolder(saveFolder);
  if (!folder) return !normalizedPath.includes("/");
  const prefix = `${folder}/`;
  if (!normalizedPath.startsWith(prefix)) return false;
  const relativePath = normalizedPath.slice(prefix.length);
  return Boolean(relativePath) && !relativePath.includes("/");
}

function getProjectNameFromSavedState(savedStateJson, fallback = "Untitled") {
  try {
    const payload = JSON.parse(savedStateJson || "{}");
    const project = payload.project || payload;
    return sanitizeProjectName(project.title || fallback, fallback);
  } catch (error) {
    return fallback;
  }
}

function sanitizeProjectName(value, fallback = "Untitled") {
  return sanitizeFileName(String(value || fallback)).replace(/\.(json|ncanvas|narrativecanvas)$/i, "") || fallback;
}

function renderFilenameTemplate(template, savedStateJson, date = new Date(), options = {}) {
  const projectTitle = options?.filenameProjectTitle
    ? sanitizeProjectName(options.filenameProjectTitle, "Untitled")
    : getProjectNameFromSavedState(savedStateJson, "Untitled");
  const values = {
    "project title": projectTitle,
    Projectname: projectTitle,
    ProjectName: projectTitle,
    "YYYY-MM-DD": formatDateToken(date, "YYYY-MM-DD"),
    "YYYY-MM-DD HHmmss": formatDateToken(date, "YYYY-MM-DD HHmmss"),
    YYYYMMDD: formatDateToken(date, "YYYYMMDD"),
    "YYYYMMDD-HHmmss": formatDateToken(date, "YYYYMMDD-HHmmss"),
    HHmmss: formatDateToken(date, "HHmmss")
  };
  const rendered = normalizeFilenameTemplate(template).replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, key) => {
    return values[key] != null ? values[key] : match;
  });
  return rendered || `${projectTitle}-${formatDateToken(date, "YYYY-MM-DD HHmmss")}.${DEFAULT_PROJECT_EXTENSION}`;
}

function formatDateToken(date, format) {
  const pad = (value) => String(value).padStart(2, "0");
  const parts = {
    YYYY: String(date.getFullYear()),
    MM: pad(date.getMonth() + 1),
    DD: pad(date.getDate()),
    HH: pad(date.getHours()),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds())
  };
  return format.replace(/YYYY|MM|DD|HH|mm|ss/g, (token) => parts[token]);
}

function sanitizeFileName(value) {
  return String(value || "")
    .replace(/[\\/\n\r\t:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function ensureProjectExtension(value) {
  const fileName = value || `NarrativeCanvas.${DEFAULT_PROJECT_EXTENSION}`;
  const extension = getVaultPathExtension(fileName);
  return PROJECT_EXTENSIONS.includes(extension) ? fileName : `${fileName}.${DEFAULT_PROJECT_EXTENSION}`;
}

function getVaultPathExtension(path) {
  const fileName = String(path || "").split("/").pop() || "";
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex > 0 ? fileName.slice(dotIndex + 1).toLowerCase() : "";
}

function projectDisplayName(path) {
  const fileName = String(path || "").split("/").pop() || "";
  return fileName;
}

function isGeneratedSampleProjectPath(path) {
  const fileName = projectDisplayName(path).replace(/\.(ncanvas|narrativecanvas)$/i, "");
  return /^(Sample|Midnight Line Demo)-\d{4}-\d{2}-\d{2} \d{6}(?:-\d+)?$/.test(fileName);
}

function isProjectFileExtension(extension) {
  const value = String(extension || "").toLowerCase();
  return PROJECT_EXTENSIONS.includes(value) || value === LEGACY_JSON_EXTENSION;
}

function isSavedStatePayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const project = value.project && typeof value.project === "object" ? value.project : value;
  return Array.isArray(project.nodes)
    && Array.isArray(project.links)
    && (typeof project.title === "string" || Array.isArray(project.nodeTypes));
}

function extractBodyHtml(html) {
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyHtml = match ? match[1] : html;
  return bodyHtml
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi, "");
}

function mountCanvasHtml(containerEl, bodyHtml) {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(`<!doctype html><html><body>${bodyHtml}</body></html>`, "text/html");
  const fragment = document.createDocumentFragment();
  parsed.body.childNodes.forEach((node) => {
    fragment.append(document.importNode(node, true));
  });
  containerEl.replaceChildren(fragment);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Bundled from index.html for the official Obsidian release assets.
const CANVAS_INDEX_HTML = [
  "\u003c!doctype html\u003e",
  "\u003chtml lang=\"en\"\u003e",
  "  \u003chead\u003e",
  "    \u003cmeta charset=\"utf-8\"\u003e",
  "    \u003cmeta name=\"viewport\" content=\"width=device-width, initial-scale=1\"\u003e",
  "    \u003ctitle\u003eNarrative Canvas\u003c/title\u003e",
  "    \u003clink rel=\"stylesheet\" href=\"./canvas.css?v=20260604-ui\"\u003e",
  "  \u003c/head\u003e",
  "  \u003cbody\u003e",
  "    \u003cdiv class=\"app-shell\"\u003e",
  "      \u003caside class=\"sidebar sidebar-left\" data-sidebar=\"left\"\u003e",
  "        \u003cheader class=\"pane-header\"\u003e",
  "          \u003cdiv class=\"pane-title\"\u003e",
  "            \u003cspan class=\"pane-kicker\"\u003eNarrative Canvas\u003c/span\u003e",
  "            \u003ch1 id=\"vaultProjectTitle\"\u003eSample\u003c/h1\u003e",
  "          \u003c/div\u003e",
  "          \u003cdiv class=\"header-actions\"\u003e",
  "            \u003cbutton class=\"icon-button save-project-button\" title=\"Save project state\" data-action=\"save-project\" type=\"button\"\u003eSave\u003c/button\u003e",
  "            \u003cbutton class=\"icon-button new-project-button\" title=\"New project\" data-action=\"new-project\" type=\"button\"\u003eNew\u003c/button\u003e",
  "            \u003cbutton class=\"icon-button sidebar-toggle-button\" title=\"Collapse left sidebar\" aria-label=\"Collapse left sidebar\" data-sidebar-toggle=\"left\" type=\"button\"\u003e",
  "              \u003cspan class=\"sidebar-toggle-icon sidebar-toggle-icon-left\" aria-hidden=\"true\"\u003e\u003c/span\u003e",
  "            \u003c/button\u003e",
  "          \u003c/div\u003e",
  "        \u003c/header\u003e",
  "",
  "        \u003csection class=\"nav-section project-file-section\"\u003e",
  "          \u003ch2\u003eProject File\u003c/h2\u003e",
  "          \u003cdiv class=\"project-file-card\" aria-live=\"polite\"\u003e",
  "            \u003cdiv class=\"project-file-main\"\u003e",
  "              \u003cspan id=\"projectFileName\"\u003eBrowser storage\u003c/span\u003e",
  "              \u003cspan id=\"projectDirtyIndicator\" class=\"project-save-indicator\" data-save-state=\"saved\" aria-live=\"polite\"\u003e",
  "                \u003cspan class=\"project-save-spinner\" aria-hidden=\"true\"\u003e\u003c/span\u003e",
  "                \u003cspan data-save-label\u003eSaved\u003c/span\u003e",
  "              \u003c/span\u003e",
  "            \u003c/div\u003e",
  "            \u003csmall id=\"projectFilePath\"\u003eSaved in this browser\u003c/small\u003e",
  "          \u003c/div\u003e",
  "          \u003cdiv class=\"project-file-actions\"\u003e",
  "            \u003cbutton class=\"small-button\" data-action=\"open-project-file\" type=\"button\"\u003eOpen\u003c/button\u003e",
  "            \u003cbutton class=\"small-button\" data-action=\"reload-project-file\" type=\"button\"\u003eReload\u003c/button\u003e",
  "            \u003cbutton class=\"small-button\" data-action=\"clear-browser-storage\" data-web-only type=\"button\"\u003eClear storage\u003c/button\u003e",
  "          \u003c/div\u003e",
  "        \u003c/section\u003e",
  "",
  "        \u003csection class=\"nav-section\"\u003e",
  "          \u003ch2\u003eFiles\u003c/h2\u003e",
  "          \u003cbutton class=\"nc-file-item active\" data-file-id=\"adventure\"\u003e",
  "            \u003cspan class=\"file-dot\"\u003e\u003c/span\u003e",
  "            \u003cspan class=\"nc-file-item-label\"\u003eNarrative.canvas\u003c/span\u003e",
  "          \u003c/button\u003e",
  "          \u003cbutton class=\"nc-file-item\" data-file-id=\"events\"\u003e",
  "            \u003cspan class=\"file-dot muted\"\u003e\u003c/span\u003e",
  "            \u003cspan class=\"nc-file-item-label\"\u003eEvents Sheet.csv\u003c/span\u003e",
  "          \u003c/button\u003e",
  "          \u003cbutton class=\"nc-file-item\" data-file-id=\"characters\"\u003e",
  "            \u003cspan class=\"file-dot muted\"\u003e\u003c/span\u003e",
  "            \u003cspan class=\"nc-file-item-label\"\u003eCharacters.md\u003c/span\u003e",
  "          \u003c/button\u003e",
  "          \u003cbutton class=\"nc-file-item\" data-file-id=\"variables\"\u003e",
  "            \u003cspan class=\"file-dot muted\"\u003e\u003c/span\u003e",
  "            \u003cspan class=\"nc-file-item-label\"\u003ePlaybook.json\u003c/span\u003e",
  "          \u003c/button\u003e",
  "        \u003c/section\u003e",
  "",
  "        \u003csection class=\"nav-section palette\"\u003e",
  "          \u003ch2\u003eNode Library\u003c/h2\u003e",
  "          \u003cdiv id=\"nodePalette\" class=\"palette-list\"\u003e\u003c/div\u003e",
  "          \u003cdiv class=\"custom-node-form node-type-form\"\u003e",
  "            \u003cdiv class=\"custom-node-row\"\u003e",
  "              \u003cinput id=\"customNodeName\" placeholder=\"Name\" spellcheck=\"false\"\u003e",
  "              \u003cinput id=\"customNodeColor\" type=\"color\" value=\"#7fdbca\" title=\"Node color\"\u003e",
  "              \u003cbutton class=\"small-button\" data-action=\"add-custom-node-type\" type=\"button\"\u003eAdd\u003c/button\u003e",
  "            \u003c/div\u003e",
  "            \u003cselect id=\"customNodeKind\" title=\"Node behavior\"\u003e",
  "              \u003coption value=\"node\"\u003eNode\u003c/option\u003e",
  "              \u003coption value=\"frame\"\u003eFrame\u003c/option\u003e",
  "              \u003coption value=\"eventFrame\"\u003eEvent Frame\u003c/option\u003e",
  "            \u003c/select\u003e",
  "            \u003ctextarea id=\"customNodeFields\" class=\"custom-node-fields\" rows=\"3\" placeholder=\"Fields, one per line\" spellcheck=\"false\"\u003e\u003c/textarea\u003e",
  "          \u003c/div\u003e",
  "        \u003c/section\u003e",
  "      \u003c/aside\u003e",
  "      \u003cdiv class=\"sidebar-resizer sidebar-resizer-left\" data-sidebar-resizer=\"left\" role=\"separator\" aria-orientation=\"vertical\" aria-label=\"Resize left sidebar\"\u003e\u003c/div\u003e",
  "",
  "      \u003cmain class=\"canvas-workspace\"\u003e",
  "        \u003cheader class=\"workspace-global-bar\"\u003e",
  "          \u003cdiv class=\"workspace-file-label\"\u003e",
  "            \u003cspan class=\"pane-kicker\"\u003eFile\u003c/span\u003e",
  "            \u003cstrong id=\"activeFileTab\"\u003eNarrative.canvas\u003c/strong\u003e",
  "          \u003c/div\u003e",
  "          \u003cspan class=\"project-history\" role=\"group\" aria-label=\"History\"\u003e",
  "            \u003cbutton id=\"undoButton\" class=\"icon-button history-button\" data-action=\"undo\" type=\"button\" title=\"Undo (Ctrl+Z)\" aria-label=\"Undo\" disabled\u003e↶\u003c/button\u003e",
  "            \u003cbutton id=\"redoButton\" class=\"icon-button history-button\" data-action=\"redo\" type=\"button\" title=\"Redo (Ctrl+Shift+Z or Ctrl+Y)\" aria-label=\"Redo\" disabled\u003e↷\u003c/button\u003e",
  "          \u003c/span\u003e",
  "        \u003c/header\u003e",
  "        \u003cheader id=\"workspaceToolbar\" class=\"canvas-workspace-tabs\"\u003e",
  "          \u003cdiv class=\"toolbar-group\"\u003e",
  "            \u003cbutton class=\"toolbar-button\" data-action=\"zoom-out\" data-files=\"adventure\" title=\"Zoom out\"\u003e-\u003c/button\u003e",
  "            \u003cspan id=\"zoomReadout\" class=\"zoom-readout\" data-files=\"adventure\"\u003e100%\u003c/span\u003e",
  "            \u003cbutton class=\"toolbar-button\" data-action=\"zoom-in\" data-files=\"adventure\" title=\"Zoom in\"\u003e+\u003c/button\u003e",
  "            \u003cbutton class=\"toolbar-button\" data-action=\"center-view\" data-files=\"adventure\" title=\"Center canvas\"\u003eCenter\u003c/button\u003e",
  "            \u003cbutton class=\"toolbar-button primary\" data-action=\"play\" data-files=\"adventure\" title=\"Play from entry\"\u003ePlay\u003c/button\u003e",
  "            \u003cbutton class=\"toolbar-button\" data-action=\"export-json\" data-files=\"adventure\" title=\"Export full project JSON\"\u003eExport JSON\u003c/button\u003e",
  "            \u003cspan class=\"export-image-controls\" data-files=\"adventure\" role=\"group\" aria-label=\"Image export\"\u003e",
  "              \u003cbutton class=\"toolbar-button export-image-button\" data-action=\"export-image\" title=\"Export canvas as PNG\"\u003eImage\u003c/button\u003e",
  "              \u003clabel class=\"export-image-scale-label\" title=\"Image export resolution\"\u003e",
  "                \u003cspan class=\"visually-hidden\"\u003eImage resolution\u003c/span\u003e",
  "                \u003cselect id=\"exportImageScale\" class=\"toolbar-select\" title=\"Image resolution\"\u003e",
  "                  \u003coption value=\"1\"\u003e1x PNG\u003c/option\u003e",
  "                  \u003coption value=\"2\"\u003e2x PNG\u003c/option\u003e",
  "                  \u003coption value=\"3\"\u003e3x PNG\u003c/option\u003e",
  "                  \u003coption value=\"4\"\u003e4x PNG\u003c/option\u003e",
  "                \u003c/select\u003e",
  "              \u003c/label\u003e",
  "            \u003c/span\u003e",
  "          \u003c/div\u003e",
  "          \u003cinput id=\"fileInput\" type=\"file\" accept=\"application/json,.json,.ncanvas,.narrativecanvas\" hidden\u003e",
  "        \u003c/header\u003e",
  "",
  "        \u003csection id=\"canvasPanel\" class=\"canvas-workspace-view canvas-panel active\"\u003e",
  "          \u003cdiv class=\"canvas-frame\"\u003e",
  "            \u003cdiv id=\"canvasViewport\" class=\"canvas-viewport\" tabindex=\"0\" aria-label=\"Node canvas\"\u003e",
  "              \u003cdiv id=\"canvasContent\" class=\"canvas-content\"\u003e",
  "                \u003csvg id=\"linkLayer\" class=\"link-layer\" xmlns=\"http://www.w3.org/2000/svg\"\u003e\u003c/svg\u003e",
  "                \u003cdiv id=\"nodeLayer\" class=\"node-layer\"\u003e\u003c/div\u003e",
  "                \u003cdiv id=\"marqueeLayer\" class=\"marquee-layer\"\u003e\u003cdiv id=\"marqueeRect\" class=\"marquee-rect\" hidden\u003e\u003c/div\u003e\u003c/div\u003e",
  "              \u003c/div\u003e",
  "            \u003c/div\u003e",
  "            \u003cdiv id=\"selectionHint\" class=\"selection-hint\"\u003eClick an output port, then an input port to connect nodes.\u003c/div\u003e",
  "            \u003cdiv id=\"minimap\" class=\"minimap\" role=\"button\" aria-label=\"Move canvas viewport\"\u003e\u003c/div\u003e",
  "          \u003c/div\u003e",
  "        \u003c/section\u003e",
  "        \u003csection id=\"charactersPanel\" class=\"canvas-workspace-view document-panel\" aria-label=\"Characters\"\u003e\u003c/section\u003e",
  "        \u003csection id=\"variablesPanel\" class=\"canvas-workspace-view document-panel\" aria-label=\"Variables\"\u003e\u003c/section\u003e",
  "        \u003csection id=\"eventsPanel\" class=\"canvas-workspace-view document-panel event-sheet-panel\" aria-label=\"Events Sheet\"\u003e\u003c/section\u003e",
  "",
  "        \u003cfooter class=\"status-bar\"\u003e",
  "          \u003cdiv id=\"statusText\"\u003eReady\u003c/div\u003e",
  "          \u003cdiv id=\"workspaceSearchControls\" class=\"nc-workspace-search-controls\" aria-label=\"Search\"\u003e",
  "            \u003clabel class=\"workspace-search-box canvas-search-box\" data-search-scope=\"adventure\"\u003e",
  "              Query",
  "              \u003cinput id=\"queryInput\" type=\"search\" placeholder=\"Find nodes\"\u003e",
  "            \u003c/label\u003e",
  "            \u003clabel class=\"workspace-search-box character-search-box\" data-search-scope=\"characters\" hidden\u003e",
  "              Find",
  "              \u003cinput id=\"characterSearchInput\" type=\"search\" data-character-search placeholder=\"Find character\" spellcheck=\"false\"\u003e",
  "            \u003c/label\u003e",
  "            \u003clabel class=\"workspace-search-box event-search-box\" data-search-scope=\"events\" hidden\u003e",
  "              Find",
  "              \u003cinput id=\"eventSearchInput\" type=\"search\" data-event-search placeholder=\"Find event\" spellcheck=\"false\"\u003e",
  "            \u003c/label\u003e",
  "            \u003cdiv id=\"matchCount\" data-search-scope=\"adventure\"\u003e0 matches\u003c/div\u003e",
  "          \u003c/div\u003e",
  "        \u003c/footer\u003e",
  "      \u003c/main\u003e",
  "",
  "      \u003cdiv class=\"sidebar-resizer sidebar-resizer-right\" data-sidebar-resizer=\"right\" role=\"separator\" aria-orientation=\"vertical\" aria-label=\"Resize right sidebar\"\u003e\u003c/div\u003e",
  "      \u003caside class=\"sidebar sidebar-right\" data-sidebar=\"right\"\u003e",
  "        \u003cheader class=\"pane-header compact\"\u003e",
  "          \u003cdiv class=\"pane-title\"\u003e",
  "            \u003cspan class=\"pane-kicker\"\u003eInspector\u003c/span\u003e",
  "            \u003ch1 id=\"inspectorTitle\"\u003eProject\u003c/h1\u003e",
  "          \u003c/div\u003e",
  "          \u003cdiv class=\"header-actions\"\u003e",
  "            \u003cbutton class=\"icon-button sidebar-toggle-button\" title=\"Collapse right sidebar\" aria-label=\"Collapse right sidebar\" data-sidebar-toggle=\"right\" type=\"button\"\u003e",
  "              \u003cspan class=\"sidebar-toggle-icon sidebar-toggle-icon-right\" aria-hidden=\"true\"\u003e\u003c/span\u003e",
  "            \u003c/button\u003e",
  "            \u003cbutton id=\"themeToggle\" class=\"icon-button theme-toggle-button\" title=\"Switch theme\" data-action=\"toggle-theme\" type=\"button\" aria-pressed=\"true\"\u003eDark\u003c/button\u003e",
  "          \u003c/div\u003e",
  "        \u003c/header\u003e",
  "",
  "        \u003cdiv class=\"inspector-tabs\"\u003e",
  "          \u003cbutton class=\"inspector-tab active\" data-panel=\"project\"\u003eProject\u003c/button\u003e",
  "          \u003cbutton class=\"inspector-tab\" data-panel=\"node\"\u003eNode\u003c/button\u003e",
  "          \u003cbutton class=\"inspector-tab\" data-panel=\"story\"\u003eStory\u003c/button\u003e",
  "        \u003c/div\u003e",
  "",
  "        \u003csection id=\"projectPanel\" class=\"inspector-panel active\"\u003e\u003c/section\u003e",
  "        \u003csection id=\"nodePanel\" class=\"inspector-panel\"\u003e\u003c/section\u003e",
  "        \u003csection id=\"storyPanel\" class=\"inspector-panel\"\u003e\u003c/section\u003e",
  "      \u003c/aside\u003e",
  "    \u003c/div\u003e",
  "",
  "    \u003cdiv id=\"mentionPopover\" class=\"mention-popover\" hidden role=\"listbox\" aria-label=\"Character mentions\"\u003e\u003c/div\u003e",
  "",
  "    \u003cdiv id=\"nodeContextMenu\" class=\"node-context-menu\" hidden\u003e",
  "      \u003cbutton data-layer-action=\"front\"\u003eBring to front\u003c/button\u003e",
  "      \u003cbutton data-layer-action=\"forward\"\u003eBring forward\u003c/button\u003e",
  "      \u003cbutton data-layer-action=\"backward\"\u003eSend backward\u003c/button\u003e",
  "      \u003cbutton data-layer-action=\"back\"\u003eSend to back\u003c/button\u003e",
  "      \u003cbutton class=\"context-menu-danger\" data-action=\"delete-node\"\u003eDelete node\u003c/button\u003e",
  "    \u003c/div\u003e",
  "",
  "    \u003cdialog id=\"playDialog\" class=\"play-dialog\"\u003e",
  "      \u003cform method=\"dialog\" class=\"play-shell\"\u003e",
  "        \u003cheader class=\"play-header\"\u003e",
  "          \u003cdiv\u003e",
  "            \u003cspan class=\"pane-kicker\"\u003eRuntime\u003c/span\u003e",
  "            \u003ch2 id=\"playTitle\"\u003ePreview\u003c/h2\u003e",
  "          \u003c/div\u003e",
  "          \u003cbutton class=\"icon-button\" value=\"close\" aria-label=\"Close preview\"\u003ex\u003c/button\u003e",
  "        \u003c/header\u003e",
  "        \u003carticle id=\"playBody\" class=\"play-body\"\u003e\u003c/article\u003e",
  "        \u003cfooter id=\"playActions\" class=\"play-actions\"\u003e\u003c/footer\u003e",
  "      \u003c/form\u003e",
  "    \u003c/dialog\u003e",
  "",
  "    \u003cdialog id=\"confirmDialog\" class=\"confirm-dialog\"\u003e",
  "      \u003cform method=\"dialog\" class=\"confirm-shell\"\u003e",
  "        \u003cheader\u003e",
  "          \u003cspan class=\"pane-kicker\"\u003eNew Canvas\u003c/span\u003e",
  "          \u003ch2\u003eName the new project\u003c/h2\u003e",
  "          \u003clabel class=\"field confirm-field\"\u003e",
  "            \u003cspan\u003eProject name\u003c/span\u003e",
  "            \u003cinput id=\"newProjectNameInput\" type=\"text\" value=\"Untitled\" spellcheck=\"false\" autocomplete=\"off\"\u003e",
  "          \u003c/label\u003e",
  "          \u003cp id=\"newProjectPathPreview\" class=\"confirm-body\"\u003eA new project file will be created when possible.\u003c/p\u003e",
  "        \u003c/header\u003e",
  "        \u003cfooter class=\"confirm-actions\"\u003e",
  "          \u003cbutton class=\"small-button confirm-muted\" value=\"confirm\" type=\"button\" data-action=\"confirm-new-project\"\u003eCreate\u003c/button\u003e",
  "          \u003cbutton class=\"small-button confirm-cancel\" value=\"cancel\" type=\"button\" data-action=\"cancel-new-project\" autofocus\u003eCancel\u003c/button\u003e",
  "        \u003c/footer\u003e",
  "      \u003c/form\u003e",
  "    \u003c/dialog\u003e",
  "",
  "    \u003cdialog id=\"eventColumnDeleteDialog\" class=\"confirm-dialog\"\u003e",
  "      \u003cform method=\"dialog\" class=\"confirm-shell\"\u003e",
  "        \u003cheader\u003e",
  "          \u003cspan class=\"pane-kicker\"\u003eEvent Column\u003c/span\u003e",
  "          \u003ch2 id=\"eventColumnDeleteTitle\"\u003eDelete column?\u003c/h2\u003e",
  "          \u003cp id=\"eventColumnDeleteBody\" class=\"confirm-body\"\u003e\u003c/p\u003e",
  "        \u003c/header\u003e",
  "        \u003cfooter class=\"confirm-actions\"\u003e",
  "          \u003cbutton class=\"small-button danger-button\" value=\"confirm\"\u003eDelete\u003c/button\u003e",
  "          \u003cbutton class=\"small-button confirm-cancel\" value=\"cancel\" autofocus\u003eCancel\u003c/button\u003e",
  "        \u003c/footer\u003e",
  "      \u003c/form\u003e",
  "    \u003c/dialog\u003e",
  "",
  "    \u003cdialog id=\"eventColumnsResetDialog\" class=\"confirm-dialog\"\u003e",
  "      \u003cform method=\"dialog\" class=\"confirm-shell\"\u003e",
  "        \u003cheader\u003e",
  "          \u003cspan class=\"pane-kicker\"\u003eEvents Sheet\u003c/span\u003e",
  "          \u003ch2\u003eReset sheet columns?\u003c/h2\u003e",
  "          \u003cp class=\"confirm-body\"\u003e",
  "            This restores the default Events Sheet columns. It removes column renames, hidden-column settings, column order changes, and custom sheet-only columns. Event Frame nodes are not deleted, and stored field values are not actively cleared; values from removed columns may stop showing until that field or column is added again.",
  "          \u003c/p\u003e",
  "        \u003c/header\u003e",
  "        \u003cfooter class=\"confirm-actions\"\u003e",
  "          \u003cbutton class=\"small-button danger-button\" value=\"confirm\"\u003eReset columns\u003c/button\u003e",
  "          \u003cbutton class=\"small-button confirm-cancel\" value=\"cancel\" autofocus\u003eCancel\u003c/button\u003e",
  "        \u003c/footer\u003e",
  "      \u003c/form\u003e",
  "    \u003c/dialog\u003e",
  "",
  "    \u003cdialog id=\"genericConfirmDialog\" class=\"confirm-dialog\"\u003e",
  "      \u003cform method=\"dialog\" class=\"confirm-shell\"\u003e",
  "        \u003cheader\u003e",
  "          \u003cspan id=\"genericConfirmKicker\" class=\"pane-kicker\"\u003eConfirm\u003c/span\u003e",
  "          \u003ch2 id=\"genericConfirmTitle\"\u003eConfirm action?\u003c/h2\u003e",
  "          \u003cp id=\"genericConfirmBody\" class=\"confirm-body\"\u003e\u003c/p\u003e",
  "        \u003c/header\u003e",
  "        \u003cfooter class=\"confirm-actions\"\u003e",
  "          \u003cbutton id=\"genericConfirmButton\" class=\"small-button danger-button\" value=\"confirm\"\u003eConfirm\u003c/button\u003e",
  "          \u003cbutton class=\"small-button confirm-cancel\" value=\"cancel\" autofocus\u003eCancel\u003c/button\u003e",
  "        \u003c/footer\u003e",
  "      \u003c/form\u003e",
  "    \u003c/dialog\u003e",
  "",
  "    \u003cdialog id=\"genericTextDialog\" class=\"confirm-dialog\"\u003e",
  "      \u003cform method=\"dialog\" class=\"confirm-shell\"\u003e",
  "        \u003cheader\u003e",
  "          \u003cspan id=\"genericTextKicker\" class=\"pane-kicker\"\u003eEdit\u003c/span\u003e",
  "          \u003ch2 id=\"genericTextTitle\"\u003eEdit value\u003c/h2\u003e",
  "          \u003clabel class=\"field confirm-field\"\u003e",
  "            \u003cspan id=\"genericTextLabel\"\u003eValue\u003c/span\u003e",
  "            \u003cinput id=\"genericTextInput\" type=\"text\" spellcheck=\"false\" autocomplete=\"off\"\u003e",
  "          \u003c/label\u003e",
  "          \u003cp id=\"genericTextBody\" class=\"confirm-body\"\u003e\u003c/p\u003e",
  "        \u003c/header\u003e",
  "        \u003cfooter class=\"confirm-actions\"\u003e",
  "          \u003cbutton id=\"genericTextButton\" class=\"small-button primary\" value=\"confirm\"\u003eApply\u003c/button\u003e",
  "          \u003cbutton class=\"small-button confirm-cancel\" value=\"cancel\" autofocus\u003eCancel\u003c/button\u003e",
  "        \u003c/footer\u003e",
  "      \u003c/form\u003e",
  "    \u003c/dialog\u003e",
  "",
  "    \u003cdialog id=\"playbookHelpDialog\" class=\"nc-notice-dialog playbook-help-dialog\" aria-label=\"Playbook help\"\u003e",
  "      \u003cform method=\"dialog\" class=\"notice-shell playbook-help-shell\"\u003e",
  "        \u003cheader\u003e",
  "          \u003cspan class=\"pane-kicker\"\u003ePlaybook\u003c/span\u003e",
  "          \u003ch2\u003eWhat Playbook.json controls\u003c/h2\u003e",
  "        \u003c/header\u003e",
  "        \u003cdiv class=\"playbook-help-grid\"\u003e",
  "          \u003csection\u003e",
  "            \u003ch3\u003eCan do\u003c/h3\u003e",
  "            \u003cul\u003e",
  "              \u003cli\u003eStore project variables for text like \u003ccode\u003e{traveler}\u003c/code\u003e.\u003c/li\u003e",
  "              \u003cli\u003eTell Play which node field becomes title, body, or choice buttons.\u003c/li\u003e",
  "              \u003cli\u003eWrite variables when a node is visited.\u003c/li\u003e",
  "              \u003cli\u003eRead simple condition fields such as \u003ccode\u003eflag == true\u003c/code\u003e.\u003c/li\u003e",
  "              \u003cli\u003eInsert starter rules with the toolbar, then edit the JSON directly.\u003c/li\u003e",
  "            \u003c/ul\u003e",
  "          \u003c/section\u003e",
  "          \u003csection\u003e",
  "            \u003ch3\u003eCannot do\u003c/h3\u003e",
  "            \u003cul\u003e",
  "              \u003cli\u003eRun arbitrary JavaScript.\u003c/li\u003e",
  "              \u003cli\u003eCreate canvas links, move nodes, or change layout.\u003c/li\u003e",
  "              \u003cli\u003eAdd or delete node fields directly. Use Node Library for schema changes.\u003c/li\u003e",
  "              \u003cli\u003eEvaluate complex code expressions.\u003c/li\u003e",
  "            \u003c/ul\u003e",
  "          \u003c/section\u003e",
  "        \u003c/div\u003e",
  "        \u003cpre class=\"playbook-example\"\u003e\u003ccode\u003e{",
  "  \"variables\": { \"flag\": false },",
  "  \"nodeTypes\": {",
  "    \"Choice\": { \"body\": \"{body}\", \"choices\": \"choices\" },",
  "    \"Set\": { \"set\": { \"key\": \"variable\", \"value\": \"value\" } },",
  "    \"Condition\": { \"condition\": \"condition\" }",
  "  }",
  "}\u003c/code\u003e\u003c/pre\u003e",
  "        \u003cfooter class=\"confirm-actions\"\u003e",
  "          \u003cbutton class=\"small-button primary\" value=\"confirm\"\u003eGot it\u003c/button\u003e",
  "        \u003c/footer\u003e",
  "      \u003c/form\u003e",
  "    \u003c/dialog\u003e",
  "",
  "    \u003cdialog id=\"playRuleDialog\" class=\"nc-notice-dialog playbook-rule-dialog\" aria-label=\"Add play rule\"\u003e",
  "      \u003cform method=\"dialog\" class=\"notice-shell playbook-rule-shell\"\u003e",
  "        \u003cheader\u003e",
  "          \u003cspan class=\"pane-kicker\"\u003ePlaybook\u003c/span\u003e",
  "          \u003ch2\u003eAdd play rule\u003c/h2\u003e",
  "        \u003c/header\u003e",
  "        \u003clabel class=\"field\"\u003e",
  "          \u003cspan\u003eApply to (node type, label, or node id)\u003c/span\u003e",
  "          \u003cinput id=\"playRuleTargetInput\" spellcheck=\"false\" autocomplete=\"off\" placeholder=\"Content\"\u003e",
  "        \u003c/label\u003e",
  "        \u003cdiv class=\"playbook-rule-options\"\u003e",
  "          \u003cbutton type=\"button\" data-action=\"create-play-rule\" data-playbook-rule-kind=\"text\"\u003e",
  "            \u003cstrong\u003eText template\u003c/strong\u003e",
  "            \u003cspan\u003eTitle and body for a node type.\u003c/span\u003e",
  "          \u003c/button\u003e",
  "          \u003cbutton type=\"button\" data-action=\"create-play-rule\" data-playbook-rule-kind=\"choices\"\u003e",
  "            \u003cstrong\u003eChoices\u003c/strong\u003e",
  "            \u003cspan\u003eTurn a field into Play buttons.\u003c/span\u003e",
  "          \u003c/button\u003e",
  "          \u003cbutton type=\"button\" data-action=\"create-play-rule\" data-playbook-rule-kind=\"set\"\u003e",
  "            \u003cstrong\u003eSet variable\u003c/strong\u003e",
  "            \u003cspan\u003eWrite state when a node is visited.\u003c/span\u003e",
  "          \u003c/button\u003e",
  "          \u003cbutton type=\"button\" data-action=\"create-play-rule\" data-playbook-rule-kind=\"condition\"\u003e",
  "            \u003cstrong\u003eCondition gate\u003c/strong\u003e",
  "            \u003cspan\u003eUse a field to decide if a node can run.\u003c/span\u003e",
  "          \u003c/button\u003e",
  "          \u003cbutton type=\"button\" data-action=\"create-play-rule\" data-playbook-rule-kind=\"selected\"\u003e",
  "            \u003cstrong\u003eFrom selected node\u003c/strong\u003e",
  "            \u003cspan\u003eInfer a rule from the selected node.\u003c/span\u003e",
  "          \u003c/button\u003e",
  "        \u003c/div\u003e",
  "        \u003cfooter class=\"confirm-actions\"\u003e",
  "          \u003cbutton class=\"small-button confirm-cancel\" value=\"cancel\" autofocus\u003eCancel\u003c/button\u003e",
  "        \u003c/footer\u003e",
  "      \u003c/form\u003e",
  "    \u003c/dialog\u003e",
  "",
  "    \u003cdialog id=\"nodeIconDialog\" class=\"icon-dialog\" aria-label=\"Edit node type icon\"\u003e",
  "      \u003cform method=\"dialog\" class=\"icon-shell\"\u003e",
  "        \u003cheader\u003e",
  "          \u003cspan class=\"pane-kicker\"\u003eNode Icon\u003c/span\u003e",
  "          \u003ch2 id=\"nodeIconDialogTitle\"\u003eEdit node type icon\u003c/h2\u003e",
  "        \u003c/header\u003e",
  "        \u003clabel class=\"field\"\u003e",
  "          \u003cspan\u003eCustom icon\u003c/span\u003e",
  "          \u003cinput id=\"nodeIconInput\" maxlength=\"8\" spellcheck=\"false\" autocomplete=\"off\" inputmode=\"text\" aria-label=\"Custom icon text or emoji\"\u003e",
  "        \u003c/label\u003e",
  "        \u003cfooter class=\"confirm-actions\"\u003e",
  "          \u003cbutton class=\"small-button\" data-action=\"reset-node-icon\" type=\"button\"\u003eUse type initial\u003c/button\u003e",
  "          \u003cbutton class=\"small-button primary\" value=\"confirm\"\u003eApply\u003c/button\u003e",
  "          \u003cbutton class=\"small-button confirm-cancel\" value=\"cancel\"\u003eCancel\u003c/button\u003e",
  "        \u003c/footer\u003e",
  "      \u003c/form\u003e",
  "    \u003c/dialog\u003e",
  "",
  "    \u003cdialog id=\"nodeTypeDialog\" class=\"type-dialog\" aria-label=\"Edit node type\"\u003e",
  "      \u003cform method=\"dialog\" class=\"type-shell\"\u003e",
  "        \u003cheader\u003e",
  "          \u003cspan class=\"pane-kicker\"\u003eNode Type\u003c/span\u003e",
  "          \u003ch2 id=\"nodeTypeDialogTitle\"\u003eEdit node type\u003c/h2\u003e",
  "        \u003c/header\u003e",
  "        \u003clabel class=\"field\"\u003e",
  "          \u003cspan\u003eName\u003c/span\u003e",
  "          \u003cinput id=\"nodeTypeNameInput\" maxlength=\"40\" spellcheck=\"false\" autocomplete=\"off\"\u003e",
  "        \u003c/label\u003e",
  "        \u003clabel class=\"field\"\u003e",
  "          \u003cspan\u003eBehavior\u003c/span\u003e",
  "          \u003cselect id=\"nodeTypeKindInput\"\u003e",
  "            \u003coption value=\"node\"\u003eNode\u003c/option\u003e",
  "            \u003coption value=\"frame\"\u003eFrame\u003c/option\u003e",
  "            \u003coption value=\"eventFrame\"\u003eEvent Frame\u003c/option\u003e",
  "          \u003c/select\u003e",
  "        \u003c/label\u003e",
  "        \u003clabel class=\"field\"\u003e",
  "          \u003cspan\u003eFields\u003c/span\u003e",
  "          \u003ctextarea id=\"nodeTypeFieldsInput\" rows=\"5\" spellcheck=\"false\" placeholder=\"Fields, one per line\"\u003e\u003c/textarea\u003e",
  "        \u003c/label\u003e",
  "        \u003cdiv class=\"type-dialog-row\"\u003e",
  "          \u003clabel class=\"field\"\u003e",
  "            \u003cspan\u003eColor\u003c/span\u003e",
  "            \u003cinput id=\"nodeTypeColorInput\" type=\"color\"\u003e",
  "          \u003c/label\u003e",
  "          \u003clabel class=\"nc-checkbox-field\"\u003e",
  "            \u003cinput id=\"nodeTypeHiddenInput\" type=\"checkbox\"\u003e",
  "            \u003cspan\u003eHide from library\u003c/span\u003e",
  "          \u003c/label\u003e",
  "        \u003c/div\u003e",
  "        \u003cfooter class=\"confirm-actions\"\u003e",
  "          \u003cbutton class=\"small-button primary\" value=\"confirm\"\u003eSave\u003c/button\u003e",
  "          \u003cbutton class=\"small-button confirm-cancel\" value=\"cancel\"\u003eCancel\u003c/button\u003e",
  "        \u003c/footer\u003e",
  "      \u003c/form\u003e",
  "    \u003c/dialog\u003e",
  "",
  "    \u003cdialog id=\"nodeRequiredDialog\" class=\"nc-notice-dialog\" aria-label=\"Node selection required\"\u003e",
  "      \u003csection class=\"notice-shell\"\u003e",
  "        \u003cspan class=\"pane-kicker\"\u003eNode Inspector\u003c/span\u003e",
  "        \u003cp\u003eSelect a node first to open the Node inspector.\u003c/p\u003e",
  "      \u003c/section\u003e",
  "    \u003c/dialog\u003e",
  "",
  "    \u003cscript src=\"./app.js?v=20260604-ui\"\u003e\u003c/script\u003e",
  "  \u003c/body\u003e",
  "\u003c/html\u003e",
].join("\n");

function installNarrativeCanvasApp() {
  // BEGIN bundled app.js
  const BOARD_WIDTH = 4000;
  const BOARD_HEIGHT = 2600;
  const CANVAS_VIEW_PADDING = 48;
  const CANVAS_MIN_ZOOM = 0.025;
  const CANVAS_MAX_ZOOM = 3;
  const DEFAULT_CANVAS_ZOOM = 0.5;
  const NODE_FOCUS_ZOOM = 1;
  const NODE_INLINE_EDIT_CLICK_INTERVAL_MS = 500;
  const CANVAS_MIN_AUTO_SCALE = CANVAS_MIN_ZOOM;
  const CANVAS_MAX_AUTO_SCALE = 1;
  const HISTORY_LIMIT = 80;
  const APP_SHORTCUT_CONTEXT_MS = 30000;
  const EVENT_LAYER_BASE = 0;
  const REGULAR_LAYER_BASE = 1000000;
  const LINK_PORT_ANCHOR_OFFSET = 6;
  const DEFAULT_CUSTOM_NODE_COLOR = "#7fdbca";
  const DEFAULT_VISUAL_FRAME_COLOR = "#9ca3af";
  const DEFAULT_EVENT_FRAME_COLOR = "#b48cff";
  const NODE_TYPE_ICON_MAX_UNITS = 3;
  const SAVED_STATE_VERSION = 1;
  const WEB_STORAGE_KEY = "narrative-canvas-state-v1";
  const PLAYBOOK_FILE_NAME = "Playbook.json";
  const SAMPLE_PROJECT_FILENAME = "Sample.ncanvas";
  const FALLBACK_AUTO_SAVE_INTERVAL_MS = 2000;
  const MIN_AUTO_SAVE_INTERVAL_MS = 1000;
  const MAX_AUTO_SAVE_INTERVAL_MS = 60 * 60 * 1000;
  const SIDEBAR_RESIZER_WIDTH = 6;
  const SIDEBAR_COLLAPSED_WIDTH = 36;
  const SIDEBAR_MIN_WORKSPACE_WIDTH = 420;
  const SIDEBAR_CONFIG = {
    left: { defaultWidth: 280, minWidth: 240, maxWidth: 520 },
    right: { defaultWidth: 340, minWidth: 300, maxWidth: 560 }
  };
  const SIDEBAR_SIDES = new Set(Object.keys(SIDEBAR_CONFIG));
  const EXPORT_IMAGE_SCALES = [
    { value: "1", scale: 1, label: "1x", suffix: "" },
    { value: "2", scale: 2, label: "2x", suffix: "@2x" },
    { value: "3", scale: 3, label: "3x", suffix: "@3x" },
    { value: "4", scale: 4, label: "4x", suffix: "@4x" }
  ];
  const EXPORT_IMAGE_MAX_DIMENSION = 16000;
  const EXPORT_IMAGE_MAX_PIXELS = 64000000;
  const EXPORT_IMAGE_MIN_SCALE = 0.05;
  const EVENT_ELEMENTS_COLUMN_KEY = "eventElements";
  const STORY_ROW_GAP = 132;
  const STORY_FRAME_PADDING = 32;
  const AUTO_LAYOUT_NODE_GAP = 72;
  const AUTO_LAYOUT_RANK_GAP = 180;
  const AUTO_LAYOUT_FRAME_PADDING = 36;
  const AUTO_LAYOUT_FRAME_HEADER = 38;
  const FALLBACK_NODE_META = { badge: "N", color: DEFAULT_CUSTOM_NODE_COLOR, width: 200, label: "Node" };
  const LEGACY_DEFAULT_NODE_BADGES = { Content: "T", Choice: "?", Set: "$", Event: "EV" };
  const LEGACY_EVENT_FRAME_COLORS = new Set(["#98c379"]);
  const DIRECT_NODE_FIELD_KEYS = new Set(["variable", "variables", "value", "condition", "choices"]);
  const INLINE_NODE_FIELD_KEYS = new Set(["title", "body", "condition", "value"]);
  const CAST_RELATIONS = ["POV", "Speaker", "Present", "Mentioned", "Target", "Owner"];
  const CAST_RELATION_LABELS = {
    POV: "POV",
    Speaker: "Speaker",
    Present: "Present",
    Mentioned: "Mentioned",
    Target: "Target",
    Owner: "Owner"
  };
  const CHARACTER_BACKLINK_GROUP_DEFS = [
    { id: "Speaker", label: "Speaker scenes" },
    { id: "Present", label: "Present scenes" },
    { id: "Mentioned", label: "Mentioned in" },
    { id: "POV", label: "POV scenes" },
    { id: "Target", label: "Target scenes" },
    { id: "Owner", label: "Owned nodes" },
    { id: "EventFrames", label: "Event frames" }
  ];
  const CHARACTER_BACKLINK_PREVIEW_LIMIT = 6;
  const DOCUMENT_RENDER_INITIAL_LIMIT = 80;
  const DOCUMENT_RENDER_INCREMENT = 80;
  const CANVAS_RENDER_PADDING = 420;
  const NODE_AUTO_MIN_WIDTH = 150;
  const NODE_AUTO_MAX_WIDTH = 320;
  const NODE_AUTO_FRAME_MAX_WIDTH = 760;
  const NODE_AUTO_MIN_BODY_LINES = 2;
  const NODE_AUTO_MAX_BODY_LINES = 6;
  const NODE_AUTO_FRAME_MAX_BODY_LINES = 10;
  const nodeLayoutSizeCache = new WeakMap();
  const graphemeSegmenter = typeof Intl !== "undefined" && Intl.Segmenter
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

  const nodeTypes = {
    Entry: { badge: "E", color: "#cdd6f4", width: 155 },
    Content: { badge: "C", color: "#61afef", width: 200 },
    Dialog: { badge: "D", color: "#56b6c2", width: 200 },
    Choice: { badge: "C", color: "#d19a66", width: 200 },
    Condition: { badge: "C", color: "#e06c75", width: 190 },
    Set: { badge: "S", color: "#98c379", width: 190 },
    Jump: { badge: "J", color: "#abb2bf", width: 170 },
    Marker: { badge: "M", color: "#7fdbca", width: 170 },
    Event: { badge: "E", color: DEFAULT_EVENT_FRAME_COLOR, width: 420 }
  };

  const eventSheetColumns = [
    { key: "act", label: "ACT", width: "110px" },
    { key: "chapter", label: "Chap.", width: "110px" },
    { key: "beatList", label: "Beat", width: "180px" },
    { key: "eventType", label: "Event Type", width: "170px" },
    { key: "eventDescription", label: "Description", width: "360px" },
    { key: "characterEncountered", label: "Characters", width: "320px" }
  ];

  const legacyEventSheetColumns = [
    { key: "act", label: "ACT" },
    { key: "chapter", label: "Chap." },
    { key: "characterEncountered", label: "Character Encountered" },
    { key: "eventDescription", label: "Description of Event(s)" },
    { key: "levels", label: "Levels" },
    { key: "beatList", label: "List of Beat" },
    { key: "questEpisode", label: "Quest Ep." },
    { key: "timeWeather", label: "Time/Weather" },
    { key: "eventType", label: "Type of Event(s)" }
  ];

  const sampleProject = createSampleProject();

  function createSampleProject() {
    return {
      title: "Midnight Line Demo",
      notes: "A fuller sample that touches every default node type, all variable value types, Characters cast roles, Events Sheet groups, custom event-frame classes, custom node types, a visual frame, hidden library entries, and Playbook rule cards.",
      variables: {
        traveler: "Mara",
        route: "northbound",
        trust_level: 1,
        lantern_lit: false,
        has_ticket: true,
        inventory: {
          watch: "Reyes pocketwatch",
          coins: 3,
          clues: ["glass key", "ash ticket"]
        },
        active_flags: ["boarding", "watch_missing"]
      },
      script: {
        nodeTypes: {
          Content: {
            title: "{title}",
            body: "{body}\n\nRoute: {route}"
          },
          Dialog: {
            title: "{title}",
            body: "{title}: {body}"
          },
          Choice: {
            title: "Decision - {title}",
            body: "{body}\nTrust level: {trust_level}",
            choices: ["Offer the watch", "Hide the watch", "Ask about Old Reyes"]
          },
          Set: {
            body: "Set {variable} = {value}. The Line records the change.",
            set: { key: "last_update", value: "{variable}:{value}" }
          },
          Condition: {
            body: "Check: {condition}",
            condition: "trust_level >= 2"
          },
          Jump: {
            body: "Jump to {body}."
          },
          Clue: {
            title: "Clue - {title}",
            body: "{body}",
            set: { key: "active_clue", value: "{title}" }
          },
          StorySequence: {
            title: "Story Sequence - {title}",
            body: "{body}"
          },
          InvestigationEvent: {
            title: "Investigation - {title}",
            body: "{body}"
          }
        }
      },
      eventSheet: {
        columns: [
          { key: "act", label: "ACT", width: "90px" },
          { key: "chapter", label: "Chap.", width: "90px" },
          { key: "beatList", label: "Beat", width: "190px" },
          { key: "eventType", label: "Event Type", width: "150px" },
          { key: "eventDescription", label: "Description", width: "360px" },
          { key: "characterEncountered", label: "Characters", width: "300px" },
          { key: "location", label: "Location", width: "150px", custom: true },
          { key: "timeWeather", label: "Time / Weather", width: "170px", custom: true },
          { key: "questEpisode", label: "Quest Ep.", width: "130px", custom: true },
          { key: "status", label: "Status", width: "150px", custom: true }
        ],
        hiddenColumns: ["status"]
      },
      eventRowOrder: {
        StorySequence: ["e1", "e2", "e4"],
        InvestigationEvent: ["e3"]
      },
      nodeTypes: [
        ...defaultNodeTypeList(),
        {
          type: "StorySequence",
          label: "Story Sequence",
          badge: "SS",
          color: DEFAULT_EVENT_FRAME_COLOR,
          width: 520,
          custom: true,
          badgeCustom: true,
          kind: "eventFrame",
          fields: [
            { key: "location", label: "Location" },
            { key: "timeWeather", label: "Time / Weather" },
            { key: "questEpisode", label: "Quest Ep." },
            { key: "status", label: "Status" }
          ],
          hidden: false
        },
        {
          type: "Clue",
          label: "Clue",
          badge: "Cl",
          color: "#d99a3d",
          width: 220,
          custom: true,
          badgeCustom: true,
          kind: "node",
          fields: [
            { key: "evidence", label: "Evidence" },
            { key: "owner", label: "Owner" },
            { key: "outcome", label: "Outcome" }
          ],
          hidden: false
        },
        {
          type: "LocationFrame",
          label: "Location Frame",
          badge: "LF",
          color: "#6f8fcf",
          width: 540,
          custom: true,
          badgeCustom: true,
          kind: "frame",
          fields: [
            { key: "region", label: "Region" },
            { key: "mood", label: "Mood" }
          ],
          hidden: false
        },
        {
          type: "InvestigationEvent",
          label: "Investigation Event",
          badge: "IE",
          color: "#c678dd",
          width: 520,
          custom: true,
          badgeCustom: true,
          kind: "eventFrame",
          fields: [
            { key: "clueStatus", label: "Clue Status" },
            { key: "risk", label: "Risk" },
            { key: "evidenceOwner", label: "Evidence Owner" }
          ],
          hidden: false
        },
        {
          type: "ArchivedBeat",
          label: "Archived Beat",
          badge: "AB",
          color: "#8a8f98",
          width: 200,
          custom: true,
          badgeCustom: true,
          kind: "node",
          fields: [{ key: "reason", label: "Reason" }],
          hidden: true
        }
      ],
      characters: [
        {
          id: "c0",
          name: "Mara",
          role: "Traveler / POV",
          voice: "Wry, watchful, slow to trust",
          notes: "Player-facing lead. Used as POV, target of conditions, and the main variable token {traveler}."
        },
        {
          id: "c1",
          name: "The Conductor",
          role: "Guide of the Midnight Line",
          voice: "Formal, warm, knows too much",
          notes: "Speaker in Dialog nodes. He offers the bargain and reacts to trust changes."
        },
        {
          id: "c2",
          name: "Old Reyes",
          role: "Missing watchmaker",
          voice: "Absent, remembered through clues",
          notes: "Mentioned by @Old Reyes and tagged as Owner of the pocketwatch and the glass key."
        },
        {
          id: "c3",
          name: "The Brakeman",
          role: "Enforcer",
          voice: "Gruff, impatient",
          notes: "Present in the train car and Target of the evasion branch."
        },
        {
          id: "c4",
          name: "Vesper",
          role: "Remote dispatcher",
          voice: "Dry, clipped, practical",
          notes: "Mentioned through radio text and Present in the investigation event."
        }
      ],
      nodes: [
        { id: "n0", type: "Entry", title: "All Aboard", body: "The Midnight Line waits at the far platform. {traveler} has a ticket, a lantern, and a watch no one should recognize.", x: 80, y: 700, cast: [{ characterId: "c0", role: "POV" }] },
        { id: "lf1", type: "LocationFrame", title: "Far Platform", body: "A visual frame for the station-side beats. This one is not an Events Sheet row.", x: 220, y: 220, width: 1040, height: 900, customFields: { region: "North terminal", mood: "Fog, brass, late departures" } },
        { id: "e1", type: "StorySequence", title: "Boarding the Line", body: "Custom Story Sequence frame. Event Frame is the behavior type; this is one concrete class built on it.", x: 270, y: 340, width: 920, height: 700, act: "I", chapter: "1", beatList: "Boarding / ticket check", eventType: "Opening Scene", eventDescription: "Mara boards the Midnight Line, meets the Conductor, and lights the lantern.", location: "Far Platform", timeWeather: "00:03 / fog", questEpisode: "Q01", customFields: { status: "Drafted" } },
        { id: "n1", type: "Content", title: "Platform 9, Midnight", body: "Fog swallows the rails. The watch once owned by @Old Reyes is heavier than it looks in {traveler}'s coat.", x: 320, y: 520, cast: [{ characterId: "c0", role: "POV" }, { characterId: "c2", role: "Mentioned" }] },
        { id: "n2", type: "Dialog", title: "The Conductor", body: "Tickets, please. {traveler}, is it? The Line has been waiting for that watch.", x: 740, y: 520, cast: [{ characterId: "c1", role: "Speaker" }, { characterId: "c0", role: "Present" }] },
        { id: "n3", type: "Set", title: "Light the lantern", body: "lantern_lit = true", variable: "lantern_lit", value: "true", x: 320, y: 785, cast: [{ characterId: "c0", role: "POV" }] },
        { id: "n13", type: "Marker", title: "Designer note", body: "The variable table includes string, number, boolean, and json values. Open Playbook.json to inspect them.", x: 740, y: 785 },
        { id: "e2", type: "StorySequence", title: "The Bargain", body: "Choice, Set, and branch outcome nodes inside the custom Story Sequence event-frame class.", x: 1240, y: 340, width: 1030, height: 760, act: "II", chapter: "2", beatList: "Watch bargain", eventType: "Choice", eventDescription: "The Conductor asks for Reyes's pocketwatch; Mara chooses whether to trust him.", location: "Car 3", timeWeather: "00:17 / rain on glass", questEpisode: "Q02", customFields: { status: "Branching" } },
        { id: "n4", type: "Choice", title: "The Conductor", body: "A gloved hand opens between you and the aisle.", choices: ["Offer the watch", "Hide the watch", "Ask about Old Reyes"], x: 1290, y: 520, cast: [{ characterId: "c1", role: "Speaker" }, { characterId: "c0", role: "Present" }] },
        { id: "n5", type: "Set", title: "Offer the watch", body: "trust_level = 2", variable: "trust_level", value: "2", x: 1290, y: 800, cast: [{ characterId: "c2", role: "Owner" }, { characterId: "c1", role: "Present" }] },
        { id: "n6", type: "Content", title: "Hide it from the Brakeman", body: "{traveler} slips the watch deeper into her coat. The Brakeman notices the movement.", x: 1570, y: 800, cast: [{ characterId: "c3", role: "Target" }, { characterId: "c0", role: "POV" }] },
        { id: "n14", type: "Dialog", title: "Vesper", body: "Radio check. If the lantern is lit, follow the blue carriage marks.", x: 1850, y: 520, cast: [{ characterId: "c4", role: "Speaker" }, { characterId: "c0", role: "Present" }] },
        { id: "e3", type: "InvestigationEvent", title: "Glass Key Investigation", body: "Custom Event Frame. Its fields appear as extra Events Sheet columns for this group.", x: 2320, y: 340, width: 1060, height: 760, act: "II", chapter: "3", beatList: "Find the glass key", eventType: "Investigation", eventDescription: "Mara checks the luggage rack, identifies the key, and decides whether she has enough trust to use it.", location: "Luggage car", timeWeather: "00:31 / sparks outside", questEpisode: "Q03", customFields: { status: "Needs clue art", clueStatus: "Found", risk: "Medium", evidenceOwner: "Old Reyes" }, cast: [{ characterId: "c4", role: "Present" }] },
        { id: "n7", type: "Condition", title: "Enough trust to unlock?", body: "trust_level >= 2 && lantern_lit == true", condition: "trust_level >= 2 && lantern_lit == true", x: 2370, y: 520, cast: [{ characterId: "c0", role: "POV" }] },
        { id: "n8", type: "Clue", title: "Glass Key", body: "A brittle key catches lantern light. It is stamped with Reyes's maker mark.", x: 2660, y: 520, customFields: { evidence: "Maker mark R-17", owner: "Old Reyes", outcome: "Unlocks the map door" }, cast: [{ characterId: "c2", role: "Owner" }, { characterId: "c4", role: "Present" }] },
        { id: "n9", type: "Content", title: "Map door opens", body: "The Conductor nods. A door unlocks that was never printed on the map.", x: 3000, y: 520, cast: [{ characterId: "c0", role: "POV" }, { characterId: "c1", role: "Present" }] },
        { id: "n10", type: "Content", title: "Cold compartment", body: "The Brakeman blocks the aisle. {traveler} has to bluff with a ticket and a dark lantern.", x: 2660, y: 795, cast: [{ characterId: "c0", role: "POV" }, { characterId: "c3", role: "Target" }] },
        { id: "e4", type: "StorySequence", title: "Terminus", body: "Jump and epilogue beats gathered into the final Story Sequence frame.", x: 980, y: 1220, width: 1060, height: 620, act: "III", chapter: "4", beatList: "Terminus arrival", eventType: "Resolution", eventDescription: "Branches merge at the northern terminus; the watch points to the next mystery.", location: "Northern Terminus", timeWeather: "05:40 / pale dawn", questEpisode: "Q04", customFields: { status: "Outline" } },
        { id: "n11", type: "Jump", title: "Merge at Terminus", body: "Terminus", x: 1030, y: 1400 },
        { id: "n12", type: "Content", title: "Epilogue", body: "Dawn. {traveler} steps down at the edge of the northern dark, the watch warm in her hand.", x: 1320, y: 1400, cast: [{ characterId: "c0", role: "POV" }, { characterId: "c2", role: "Mentioned" }] },
        { id: "n15", type: "Marker", title: "Next pass", body: "Try filtering Characters for Mara, filtering Events for boarding, exporting Characters.json, and opening Advanced JSON.", x: 1660, y: 1645 }
      ],
      links: [
        { id: "l0", from: "n0", to: "n1" },
        { id: "l1", from: "n1", to: "n2" },
        { id: "l2", from: "n2", to: "n3" },
        { id: "l3", from: "n3", to: "n4" },
        { id: "l4", from: "n4", to: "n5", label: "Offer the watch", choiceIndex: 0 },
        { id: "l5", from: "n4", to: "n6", label: "Hide the watch", choiceIndex: 1 },
        { id: "l6", from: "n4", to: "n14", label: "Ask about Old Reyes", choiceIndex: 2 },
        { id: "l7", from: "n5", to: "n7" },
        { id: "l8", from: "n6", to: "n7" },
        { id: "l9", from: "n14", to: "n7" },
        { id: "l10", from: "n7", to: "n8", label: "true" },
        { id: "l11", from: "n7", to: "n10", label: "false" },
        { id: "l12", from: "n8", to: "n9" },
        { id: "l13", from: "n9", to: "n11" },
        { id: "l14", from: "n10", to: "n11" },
        { id: "l15", from: "n11", to: "n12" }
      ]
    };
  }

  const fileViews = {
    adventure: "Narrative.canvas",
    characters: "Characters.md",
    events: "Events Sheet.csv",
    variables: PLAYBOOK_FILE_NAME
  };

  const validPanels = new Set(["project", "node", "story"]);

  function createInitialRuntimeState() {
    return {
    project: cloneProject(sampleProject),
    selectedNodeId: "n1",
    selectedNodeIds: [],
    selectedLinkId: null,
    panel: "project",
    activeFileId: "adventure",
    theme: "dark",
    exportImageScale: 1,
    view: { x: 0, y: 0, scale: DEFAULT_CANVAS_ZOOM },
    connectingFrom: null,
    draggingNode: null,
    geometryHistoryTarget: null,
    draggingStoryNodeId: null,
    storyPointerDrag: null,
    resizingNode: null,
    panning: null,
    marquee: null,
    contextNodeId: null,
    contextLinkId: null,
    contextGroup: false,
    iconDialogType: null,
    typeDialogType: null,
    eventColumnDeleteKey: null,
    genericConfirmAction: null,
    genericTextAction: null,
    reconnectingLinkId: null,
    reconnectingEnd: null,
    characterFocusId: null,
    characterSearch: "",
    eventSearch: "",
    playbookJsonOpen: false,
    projectFilePath: "",
    hasUnsavedChanges: false,
    isSaving: false,
    saveError: false,
    statusOverride: false,
    statusTimer: null,
    dirtyVersion: 0,
    structureVersion: 0,
    canvasRenderVersion: 1,
    canvasRenderedVersion: 0,
    documentRenderVersion: 1,
    documentRenderedVersions: { characters: 0, events: 0, variables: 0 },
    autoSaveTimer: null,
    characterBacklinkExpandedIds: new Set(),
    history: { undo: [], redo: [], current: "", pending: null, applying: false },
    editHistoryTarget: null,
    lastAppInteractionAt: 0,
    inlineEditNodeId: null,
    inlineEditField: null,
    inlineEditPointerNodeId: null,
    lastNodeClick: { id: null, time: 0 },
    playNodeId: null,
    playPath: [],
    search: "",
    eventRowDrag: null,
    eventColumnResize: null,
    mention: null,
    characterRenderContext: null,
    nodeIndex: null,
    linkIndex: null,
    outgoingIndex: null,
    derived: { flowOrder: null, displayId: null, nodeTypeMap: null, projectNodeTypes: null },
    canvasViewportRenderFrame: null,
    storyPanelRenderTimer: null,
    documentRenderLimits: {
      characters: DOCUMENT_RENDER_INITIAL_LIMIT,
      events: DOCUMENT_RENDER_INITIAL_LIMIT,
      variables: DOCUMENT_RENDER_INITIAL_LIMIT
    },
    sidebar: {
      leftWidth: SIDEBAR_CONFIG.left.defaultWidth,
      rightWidth: SIDEBAR_CONFIG.right.defaultWidth,
      leftCollapsed: false,
      rightCollapsed: false,
      resizing: null
    }
    };
  }

  const state = createInitialRuntimeState();

  const dom = {};
  const optionalDomKeys = new Set(["activeFileTab", "mentionPopover"]);
  let initialized = false;

  window.NarrativeCanvasApp = {
    init: initNarrativeCanvas,
    destroy: destroyNarrativeCanvas,
    save: saveCurrentState,
    getSavedState: buildSavedState,
    configureAutoSave,
    createSampleProjectFile,
    ensureVaultFile: ensureVaultProjectFile,
    loadVaultProject: loadCurrentVaultProject
  };

  let eventController = null;

  if (!window.NarrativeCanvasHost) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initNarrativeCanvas, { once: true });
    } else if (document.querySelector(".app-shell")) {
      initNarrativeCanvas();
    }
  }

  async function initNarrativeCanvas() {
    if (initialized) return true;
    eventController?.abort();
    eventController = null;
    resetRuntimeState();
    resetDomRefs();
    try {
      bindDom();
      const missingElements = getMissingDomElements();
      if (missingElements.length) {
        showStartupError(`Narrative Canvas is missing required UI elements: ${missingElements.join(", ")}`);
        return false;
      }
      initialized = true;
      const restoredView = await loadSavedState(false);
      resetHistory();
      renderAll();
      bindEvents();
      if (!restoredView) settleInitialCanvasView();
      configureAutoSave();
      return true;
    } catch (error) {
      initialized = false;
      console.error(error);
      showStartupError(`Narrative Canvas could not start: ${getStartupErrorMessage(error)}`);
      return false;
    }
  }

  function bindDom(scopeOverride = null) {
    dom.scope = scopeOverride || resolveDomScope();
    dom.root = dom.scope.querySelector(".app-shell");
    dom.themeHost = dom.root?.closest(".narrative-canvas-plugin-host") || document.documentElement;
    dom.sidebarLeft = dom.scope.querySelector("[data-sidebar='left']");
    dom.sidebarRight = dom.scope.querySelector("[data-sidebar='right']");
    dom.sidebarToggles = [...dom.scope.querySelectorAll("[data-sidebar-toggle]")];
    dom.sidebarResizers = [...dom.scope.querySelectorAll("[data-sidebar-resizer]")];
    dom.viewport = dom.scope.querySelector("#canvasViewport");
    dom.canvasPanel = dom.scope.querySelector("#canvasPanel");
    dom.charactersPanel = dom.scope.querySelector("#charactersPanel");
    dom.variablesPanel = dom.scope.querySelector("#variablesPanel");
    dom.eventsPanel = dom.scope.querySelector("#eventsPanel");
    dom.content = dom.scope.querySelector("#canvasContent");
    dom.nodeLayer = dom.scope.querySelector("#nodeLayer");
    dom.linkLayer = dom.scope.querySelector("#linkLayer");
    dom.marqueeLayer = dom.scope.querySelector("#marqueeLayer");
    dom.marqueeRect = dom.scope.querySelector("#marqueeRect");
    dom.palette = dom.scope.querySelector("#nodePalette");
    dom.customNodeName = dom.scope.querySelector("#customNodeName");
    dom.customNodeKind = dom.scope.querySelector("#customNodeKind");
    dom.customNodeFields = dom.scope.querySelector("#customNodeFields");
    dom.customNodeColor = dom.scope.querySelector("#customNodeColor");
    dom.zoomReadout = dom.scope.querySelector("#zoomReadout");
    dom.undoButton = dom.scope.querySelector("#undoButton");
    dom.redoButton = dom.scope.querySelector("#redoButton");
    dom.themeToggle = dom.scope.querySelector("#themeToggle");
    dom.exportImageScale = dom.scope.querySelector("#exportImageScale");
    dom.vaultProjectTitle = dom.scope.querySelector("#vaultProjectTitle");
    dom.projectFileName = dom.scope.querySelector("#projectFileName");
    dom.projectFilePath = dom.scope.querySelector("#projectFilePath");
    dom.projectDirtyIndicator = dom.scope.querySelector("#projectDirtyIndicator");
    dom.newProjectNameInput = dom.scope.querySelector("#newProjectNameInput");
    dom.newProjectPathPreview = dom.scope.querySelector("#newProjectPathPreview");
    dom.workspaceToolbar = dom.scope.querySelector("#workspaceToolbar");
    dom.projectPanel = dom.scope.querySelector("#projectPanel");
    dom.nodePanel = dom.scope.querySelector("#nodePanel");
    dom.storyPanel = dom.scope.querySelector("#storyPanel");
    dom.inspectorTitle = dom.scope.querySelector("#inspectorTitle");
    dom.statusText = dom.scope.querySelector("#statusText");
    dom.workspaceSearchControls = dom.scope.querySelector("#workspaceSearchControls");
    dom.queryInput = dom.scope.querySelector("#queryInput");
    dom.characterSearchInput = dom.scope.querySelector("#characterSearchInput");
    dom.eventSearchInput = dom.scope.querySelector("#eventSearchInput");
    dom.matchCount = dom.scope.querySelector("#matchCount");
    dom.fileInput = dom.scope.querySelector("#fileInput");
    dom.activeFileTab = dom.scope.querySelector("#activeFileTab");
    dom.fileScopedActions = [...dom.scope.querySelectorAll("[data-files]")];
    dom.webOnlyActions = [...dom.scope.querySelectorAll("[data-web-only]")];
    dom.hint = dom.scope.querySelector("#selectionHint");
    dom.minimap = dom.scope.querySelector("#minimap");
    dom.nodeContextMenu = dom.scope.querySelector("#nodeContextMenu");
    dom.mentionPopover = dom.scope.querySelector("#mentionPopover");
    dom.nodeIconDialog = dom.scope.querySelector("#nodeIconDialog");
    dom.nodeIconInput = dom.scope.querySelector("#nodeIconInput");
    dom.nodeIconDialogTitle = dom.scope.querySelector("#nodeIconDialogTitle");
    dom.nodeTypeDialog = dom.scope.querySelector("#nodeTypeDialog");
    dom.nodeTypeDialogTitle = dom.scope.querySelector("#nodeTypeDialogTitle");
    dom.nodeTypeNameInput = dom.scope.querySelector("#nodeTypeNameInput");
    dom.nodeTypeKindInput = dom.scope.querySelector("#nodeTypeKindInput");
    dom.nodeTypeFieldsInput = dom.scope.querySelector("#nodeTypeFieldsInput");
    dom.nodeTypeColorInput = dom.scope.querySelector("#nodeTypeColorInput");
    dom.nodeTypeHiddenInput = dom.scope.querySelector("#nodeTypeHiddenInput");
    dom.playDialog = dom.scope.querySelector("#playDialog");
    dom.confirmDialog = dom.scope.querySelector("#confirmDialog");
    dom.playRuleDialog = dom.scope.querySelector("#playRuleDialog");
    dom.playRuleTargetInput = dom.scope.querySelector("#playRuleTargetInput");
    dom.eventColumnDeleteDialog = dom.scope.querySelector("#eventColumnDeleteDialog");
    dom.eventColumnDeleteTitle = dom.scope.querySelector("#eventColumnDeleteTitle");
    dom.eventColumnDeleteBody = dom.scope.querySelector("#eventColumnDeleteBody");
    dom.eventColumnsResetDialog = dom.scope.querySelector("#eventColumnsResetDialog");
    dom.genericConfirmDialog = dom.scope.querySelector("#genericConfirmDialog");
    dom.genericConfirmKicker = dom.scope.querySelector("#genericConfirmKicker");
    dom.genericConfirmTitle = dom.scope.querySelector("#genericConfirmTitle");
    dom.genericConfirmBody = dom.scope.querySelector("#genericConfirmBody");
    dom.genericConfirmButton = dom.scope.querySelector("#genericConfirmButton");
    dom.genericTextDialog = dom.scope.querySelector("#genericTextDialog");
    dom.genericTextKicker = dom.scope.querySelector("#genericTextKicker");
    dom.genericTextTitle = dom.scope.querySelector("#genericTextTitle");
    dom.genericTextLabel = dom.scope.querySelector("#genericTextLabel");
    dom.genericTextInput = dom.scope.querySelector("#genericTextInput");
    dom.genericTextBody = dom.scope.querySelector("#genericTextBody");
    dom.genericTextButton = dom.scope.querySelector("#genericTextButton");
    dom.playbookHelpDialog = dom.scope.querySelector("#playbookHelpDialog");
    dom.nodeRequiredDialog = dom.scope.querySelector("#nodeRequiredDialog");
    dom.playTitle = dom.scope.querySelector("#playTitle");
    dom.playBody = dom.scope.querySelector("#playBody");
    dom.playActions = dom.scope.querySelector("#playActions");
  }

  function resolveDomScope() {
    const hostRoot = window.NarrativeCanvasHost?.root;
    if (hostRoot?.querySelector?.(".app-shell")) return hostRoot;
    const pluginHosts = [...document.querySelectorAll(".narrative-canvas-plugin-host")]
      .filter((host) => host.querySelector(".app-shell"));
    return pluginHosts[pluginHosts.length - 1] || document;
  }

  function getMissingDomElements() {
    return Object.entries(dom)
      .filter(([key, element]) => !optionalDomKeys.has(key) && !element)
      .map(([key]) => key);
  }

  function showStartupError(message) {
    console.error(message);
    const target = dom.scope && dom.scope !== document
      ? dom.scope
      : window.NarrativeCanvasHost?.root || document.body || document.documentElement;
    if (!target) return;
    const shell = document.createElement("main");
    shell.className = "startup-error";
    const title = document.createElement("h1");
    title.textContent = "Narrative Canvas failed to load";
    const body = document.createElement("p");
    body.textContent = message;
    shell.append(title, body);
    target.replaceChildren(shell);
  }

  function getStartupErrorMessage(error) {
    if (!error) return "unknown error";
    if (typeof error === "string") return error;
    return error.message || String(error);
  }

  function bindEvents() {
    eventController?.abort();
    eventController = new AbortController();
    const { signal } = eventController;
    const eventRoot = dom.scope || document;

    eventRoot.addEventListener("pointerdown", handleFormControlPointerEvent, { signal });
    eventRoot.addEventListener("mousedown", handleFormControlPointerEvent, { signal });
    eventRoot.addEventListener("click", handleFormControlClickEvent, { signal });
    eventRoot.addEventListener("pointerdown", handleSidebarPointerDown, { signal });
    eventRoot.addEventListener("click", handleDocumentClick, { signal });
    eventRoot.addEventListener("contextmenu", handleContextMenu, { signal });
    eventRoot.addEventListener("input", handleInput, { signal });
    eventRoot.addEventListener("change", handleChange, { signal });
    eventRoot.addEventListener("focusin", handleEditFocusIn, { signal });
    eventRoot.addEventListener("focusout", handleEditFocusOut, { signal });
    eventRoot.addEventListener("keydown", handleKeyDown, { signal });
    eventRoot.addEventListener("pointerdown", handleStoryPointerDown, { signal });
    dom.mentionPopover?.addEventListener("pointerdown", handleMentionPopoverPointerDown, { signal });
    document.addEventListener("pointerdown", handleGlobalAppPointerContext, { capture: true, signal });
    document.addEventListener("click", handleGlobalAppPointerContext, { capture: true, signal });
    document.addEventListener("focusin", handleGlobalAppFocusContext, { capture: true, signal });
    document.addEventListener("keydown", handleGlobalHistoryKeyDown, { capture: true, signal });
    document.addEventListener("click", handleDocumentClickCapture, { capture: true, signal });
    document.addEventListener("pointerdown", handleGlobalMenuDismiss, { capture: true, signal });
    document.addEventListener("mousedown", handleGlobalMenuDismiss, { capture: true, signal });
    document.addEventListener("click", handleGlobalMenuDismiss, { capture: true, signal });
    document.addEventListener("contextmenu", handleGlobalMenuDismiss, { capture: true, signal });
    document.addEventListener("keydown", handleGlobalMenuKeyDown, { capture: true, signal });
    window.addEventListener("pointermove", handleSidebarPointerMove, { signal });
    window.addEventListener("pointerup", handleSidebarPointerUp, { signal });
    window.addEventListener("pointermove", handleStoryPointerMove, { signal });
    window.addEventListener("pointerup", handleStoryPointerUp, { signal });
    window.addEventListener("keydown", handleGlobalHistoryKeyDown, { capture: true, signal });
    window.addEventListener("blur", hideNodeContextMenu, { signal });
    window.addEventListener("resize", handleWindowResize, { signal });

    dom.nodeContextMenu.addEventListener("pointerdown", handleNodeContextMenuPointerDown, { signal });
    dom.nodeContextMenu.addEventListener("click", handleNodeContextMenuClick, { signal });
    dom.viewport.addEventListener("scroll", handleViewportScroll, { signal });
    dom.viewport.addEventListener("pointerdown", handleViewportPointerDown, { signal });
    dom.viewport.addEventListener("pointermove", handleViewportPointerMove, { signal });
    dom.viewport.addEventListener("pointerup", endPointerActions, { signal });
    dom.viewport.addEventListener("pointerleave", endPointerActions, { signal });
    dom.viewport.addEventListener("dblclick", handleViewportDoubleClick, { signal });
    dom.viewport.addEventListener("wheel", handleWheel, { passive: false, signal });
    dom.minimap.addEventListener("pointerdown", handleMinimapPointerDown, { signal });

    dom.fileInput.addEventListener("change", importJsonFile, { signal });
    dom.confirmDialog.addEventListener("close", () => {
      if (dom.confirmDialog.returnValue === "confirm") void newProject();
    }, { signal });
    dom.newProjectNameInput?.addEventListener("input", () => {
      void updateNewProjectPathPreview();
    }, { signal });
    dom.newProjectNameInput?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      confirmNewProject();
    }, { signal });
    dom.eventColumnDeleteDialog.addEventListener("close", () => {
      if (dom.eventColumnDeleteDialog.returnValue === "confirm") {
        const historyBefore = getHistorySnapshot();
        deleteEventColumn(state.eventColumnDeleteKey);
        commitHistoryFromSnapshot(historyBefore);
      }
      state.eventColumnDeleteKey = null;
    }, { signal });
    dom.eventColumnsResetDialog.addEventListener("close", () => {
      if (dom.eventColumnsResetDialog.returnValue === "confirm") {
        const historyBefore = getHistorySnapshot();
        resetEventColumns();
        commitHistoryFromSnapshot(historyBefore);
      }
    }, { signal });
    dom.genericConfirmDialog.addEventListener("close", handleGenericConfirmClose, { signal });
    dom.genericConfirmDialog.addEventListener("click", (event) => {
      if (event.target === dom.genericConfirmDialog) dom.genericConfirmDialog.close("cancel");
    }, { signal });
    dom.genericTextDialog.addEventListener("close", handleGenericTextClose, { signal });
    dom.genericTextDialog.addEventListener("click", (event) => {
      if (event.target === dom.genericTextDialog) dom.genericTextDialog.close("cancel");
    }, { signal });
    dom.genericTextInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      dom.genericTextDialog.close("confirm");
    }, { signal });
    dom.playbookHelpDialog.addEventListener("click", (event) => {
      if (event.target === dom.playbookHelpDialog) dom.playbookHelpDialog.close();
    }, { signal });
    dom.playRuleDialog.addEventListener("click", (event) => {
      if (event.target === dom.playRuleDialog) dom.playRuleDialog.close();
    }, { signal });
    dom.nodeIconDialog.addEventListener("close", () => {
      if (dom.nodeIconDialog.returnValue === "confirm") {
        const historyBefore = getHistorySnapshot();
        applyNodeTypeBadgeDialog();
        commitHistoryFromSnapshot(historyBefore);
      }
      state.iconDialogType = null;
    }, { signal });
    dom.nodeIconDialog.addEventListener("click", (event) => {
      if (event.target === dom.nodeIconDialog) dom.nodeIconDialog.close("cancel");
    }, { signal });
    dom.nodeTypeDialog.addEventListener("close", () => {
      if (dom.nodeTypeDialog.returnValue === "confirm") {
        const historyBefore = getHistorySnapshot();
        applyNodeTypeDialog();
        commitHistoryFromSnapshot(historyBefore);
      }
      state.typeDialogType = null;
    }, { signal });
    dom.nodeTypeDialog.addEventListener("click", (event) => {
      if (event.target === dom.nodeTypeDialog) dom.nodeTypeDialog.close("cancel");
    }, { signal });
    dom.nodeRequiredDialog.addEventListener("click", (event) => {
      if (event.target === dom.nodeRequiredDialog) dom.nodeRequiredDialog.close();
    }, { signal });
  }

  function destroyNarrativeCanvas() {
    eventController?.abort();
    eventController = null;
    if (state.canvasViewportRenderFrame) {
      window.cancelAnimationFrame(state.canvasViewportRenderFrame);
      state.canvasViewportRenderFrame = null;
    }
    clearAutoSaveTimer();
    clearStatusTimer();
    clearStoryPanelRenderTimer();
    state.sidebar.resizing = null;
    dom.root?.classList.remove("sidebar-resizing");
    dom.root?.removeAttribute("data-sidebar-resizing");
    hideNodeContextMenu();
    initialized = false;
    resetRuntimeState();
    resetDomRefs();
    if (window.NarrativeCanvasApp?.destroy === destroyNarrativeCanvas) {
      delete window.NarrativeCanvasApp;
    }
  }

  function resetRuntimeState() {
    const nextState = createInitialRuntimeState();
    Object.keys(state).forEach((key) => delete state[key]);
    Object.assign(state, nextState);
  }

  function resetDomRefs() {
    Object.keys(dom).forEach((key) => delete dom[key]);
  }

  function handleWindowResize() {
    hideNodeContextMenu();
    scheduleCanvasViewportRender();
  }

  function renderSidebarState() {
    if (!dom.root) return;
    const normalized = normalizeSidebarState(state.sidebar);
    state.sidebar.leftWidth = normalized.leftWidth;
    state.sidebar.rightWidth = normalized.rightWidth;
    state.sidebar.leftCollapsed = normalized.leftCollapsed;
    state.sidebar.rightCollapsed = normalized.rightCollapsed;

    dom.root.style.setProperty("--sidebar-left-width", `${normalized.leftWidth}px`);
    dom.root.style.setProperty("--sidebar-right-width", `${normalized.rightWidth}px`);
    dom.root.setAttribute("data-sidebar-left", normalized.leftCollapsed ? "collapsed" : "expanded");
    dom.root.setAttribute("data-sidebar-right", normalized.rightCollapsed ? "collapsed" : "expanded");

    dom.sidebarToggles?.forEach((button) => {
      const side = getValidSidebarSide(button.dataset.sidebarToggle);
      if (!side) return;
      const collapsed = side === "left" ? normalized.leftCollapsed : normalized.rightCollapsed;
      const action = collapsed ? "Expand" : "Collapse";
      const label = `${action} ${side} sidebar`;
      button.title = label;
      button.setAttribute("aria-label", label);
      button.setAttribute("aria-expanded", String(!collapsed));
    });
  }

  function normalizeSidebarState(sidebar) {
    const source = sidebar && typeof sidebar === "object" ? sidebar : {};
    return {
      leftWidth: normalizeSidebarWidth("left", source.leftWidth),
      rightWidth: normalizeSidebarWidth("right", source.rightWidth),
      leftCollapsed: Boolean(source.leftCollapsed),
      rightCollapsed: Boolean(source.rightCollapsed)
    };
  }

  function normalizeSidebarWidth(side, width) {
    const config = SIDEBAR_CONFIG[side];
    const value = Number(width);
    const fallback = config.defaultWidth;
    return Math.round(clamp(Number.isFinite(value) ? value : fallback, config.minWidth, config.maxWidth));
  }

  function getValidSidebarSide(side) {
    return SIDEBAR_SIDES.has(side) ? side : "";
  }

  function getSidebarWidth(side) {
    const validSide = getValidSidebarSide(side);
    if (!validSide) return 0;
    return normalizeSidebarWidth(validSide, state.sidebar?.[`${validSide}Width`]);
  }

  function isSidebarCollapsed(side) {
    const validSide = getValidSidebarSide(side);
    return validSide ? Boolean(state.sidebar?.[`${validSide}Collapsed`]) : false;
  }

  function setSidebarWidth(side, width) {
    const validSide = getValidSidebarSide(side);
    if (!validSide) return;
    const config = SIDEBAR_CONFIG[validSide];
    const maxWidth = getSidebarResizeMaxWidth(validSide);
    state.sidebar[`${validSide}Width`] = Math.round(clamp(width, config.minWidth, maxWidth));
  }

  function getSidebarResizeMaxWidth(side) {
    const config = SIDEBAR_CONFIG[side];
    const shellWidth = dom.root?.clientWidth || 0;
    if (!shellWidth) return config.maxWidth;
    const oppositeSide = side === "left" ? "right" : "left";
    const oppositeWidth = isSidebarCollapsed(oppositeSide)
      ? SIDEBAR_COLLAPSED_WIDTH
      : getSidebarWidth(oppositeSide);
    const activeResizerWidth = SIDEBAR_RESIZER_WIDTH + (isSidebarCollapsed(oppositeSide) ? 0 : SIDEBAR_RESIZER_WIDTH);
    const availableWidth = shellWidth - oppositeWidth - activeResizerWidth - SIDEBAR_MIN_WORKSPACE_WIDTH;
    return Math.max(config.minWidth, Math.min(config.maxWidth, availableWidth));
  }

  function getSavedSidebarState() {
    const sidebar = normalizeSidebarState(state.sidebar);
    return {
      leftWidth: sidebar.leftWidth,
      rightWidth: sidebar.rightWidth,
      leftCollapsed: sidebar.leftCollapsed,
      rightCollapsed: sidebar.rightCollapsed
    };
  }

  function applySavedSidebarState(sidebar) {
    const normalized = normalizeSidebarState(sidebar);
    state.sidebar.leftWidth = normalized.leftWidth;
    state.sidebar.rightWidth = normalized.rightWidth;
    state.sidebar.leftCollapsed = normalized.leftCollapsed;
    state.sidebar.rightCollapsed = normalized.rightCollapsed;
    state.sidebar.resizing = null;
  }

  function toggleSidebar(side) {
    const validSide = getValidSidebarSide(side);
    if (!validSide) return;
    const collapsedKey = `${validSide}Collapsed`;
    state.sidebar[collapsedKey] = !state.sidebar[collapsedKey];
    renderSidebarState();
    handleWindowResize();
    setStatus(`${titleCase(validSide)} sidebar ${state.sidebar[collapsedKey] ? "collapsed" : "expanded"}.`);
  }

  function handleSidebarPointerDown(event) {
    if (event.button !== 0) return;
    const resizer = event.target?.closest?.("[data-sidebar-resizer]");
    if (!resizer || !dom.root?.contains(resizer)) return;
    const side = getValidSidebarSide(resizer.dataset.sidebarResizer);
    if (!side || isSidebarCollapsed(side)) return;

    state.sidebar.resizing = {
      side,
      startX: event.clientX,
      startWidth: getSidebarWidth(side),
      pointerId: event.pointerId,
      resizer
    };
    dom.root.classList.add("sidebar-resizing");
    dom.root.setAttribute("data-sidebar-resizing", side);
    hideNodeContextMenu();
    try {
      resizer.setPointerCapture(event.pointerId);
    } catch (error) {
      // Pointer capture is unavailable.
    }
    event.preventDefault();
    event.stopPropagation();
  }

  function handleSidebarPointerMove(event) {
    const resizing = state.sidebar?.resizing;
    if (!resizing) return;
    const deltaX = event.clientX - resizing.startX;
    const nextWidth = resizing.side === "left"
      ? resizing.startWidth + deltaX
      : resizing.startWidth - deltaX;
    setSidebarWidth(resizing.side, nextWidth);
    renderSidebarState();
    handleWindowResize();
    event.preventDefault();
  }

  function handleSidebarPointerUp(event) {
    const resizing = state.sidebar?.resizing;
    if (!resizing) return;
    try {
      resizing.resizer?.releasePointerCapture(resizing.pointerId ?? event.pointerId);
    } catch (error) {
      // Pointer capture is already gone.
    }
    const side = resizing.side;
    state.sidebar.resizing = null;
    dom.root?.classList.remove("sidebar-resizing");
    dom.root?.removeAttribute("data-sidebar-resizing");
    renderSidebarState();
    handleWindowResize();
    setStatus(`${titleCase(side)} sidebar resized.`);
  }

  function cloneProject(project) {
    return JSON.parse(JSON.stringify(project));
  }

  function defaultVariables() {
    return {};
  }

  function normalizeProjectCharacters(project) {
    return Array.isArray(project.characters)
      ? normalizeCharacters(project.characters)
      : inferCharacters(project);
  }

  function getHistorySnapshot() {
    return JSON.stringify({
      project: state.project,
      selectedNodeId: state.selectedNodeId,
      selectedNodeIds: state.selectedNodeIds || [],
      selectedLinkId: state.selectedLinkId,
      panel: state.panel,
      activeFileId: state.activeFileId,
      view: state.view,
      characterFocusId: state.characterFocusId,
      characterSearch: state.characterSearch,
      eventSearch: state.eventSearch,
      playbookJsonOpen: state.playbookJsonOpen,
      search: state.search
    });
  }

  function resetHistory() {
    state.history = {
      undo: [],
      redo: [],
      current: getHistorySnapshot(),
      pending: null,
      applying: false
    };
    state.editHistoryTarget = null;
    renderHistoryButtons();
  }

  function commitHistoryCapture() {
    if (!state.history?.pending) return false;
    const before = state.history.pending;
    state.history.pending = null;
    return commitHistoryFromSnapshot(before);
  }

  function commitHistoryFromSnapshot(before) {
    if (state.history?.applying || !before) return false;
    const after = getHistorySnapshot();
    if (after === before) {
      state.history.current = after;
      renderHistoryButtons();
      return false;
    }
    state.history.undo.push(before);
    if (state.history.undo.length > HISTORY_LIMIT) state.history.undo.shift();
    state.history.redo = [];
    state.history.current = after;
    setProjectDirty(true);
    renderHistoryButtons();
    return true;
  }

  function captureNodeGeometry(node) {
    return {
      id: node.id,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      hasWidth: Object.prototype.hasOwnProperty.call(node, "width"),
      hasHeight: Object.prototype.hasOwnProperty.call(node, "height")
    };
  }

  function beginGeometryHistoryCapture(node) {
    if (!node || state.history?.applying) return null;
    state.geometryHistoryTarget = {
      before: [captureNodeGeometry(node)]
    };
    return state.geometryHistoryTarget;
  }

  function commitGeometryHistoryCapture() {
    const target = state.geometryHistoryTarget;
    state.geometryHistoryTarget = null;
    if (!target?.before?.length) return false;
    const after = target.before
      .map((entry) => getNode(entry.id))
      .filter(Boolean)
      .map(captureNodeGeometry);
    if (!after.length || sameGeometrySnapshots(target.before, after)) return false;
    return pushGeometryHistoryEntry({ kind: "geometry", before: target.before, after });
  }

  function sameGeometrySnapshots(before, after) {
    if (!Array.isArray(before) || !Array.isArray(after) || before.length !== after.length) return false;
    return before.every((entry, index) => {
      const next = after[index];
      return next
        && entry.id === next.id
        && entry.x === next.x
        && entry.y === next.y
        && entry.width === next.width
        && entry.height === next.height
        && entry.hasWidth === next.hasWidth
        && entry.hasHeight === next.hasHeight;
    });
  }

  function pushGeometryHistoryEntry(entry) {
    if (state.history?.applying) return false;
    if (!state.history) resetHistory();
    state.history.undo.push(entry);
    if (state.history.undo.length > HISTORY_LIMIT) state.history.undo.shift();
    state.history.redo = [];
    state.history.pending = null;
    state.history.current = "";
    setProjectDirty(true);
    renderHistoryButtons();
    return true;
  }

  function isGeometryHistoryEntry(entry) {
    return Boolean(entry && typeof entry === "object" && entry.kind === "geometry");
  }

  function applyGeometryHistoryEntry(entry, side, label) {
    const snapshots = Array.isArray(entry?.[side]) ? entry[side] : [];
    state.history.applying = true;
    snapshots.forEach(applyNodeGeometry);
    state.history.applying = false;
    state.history.current = "";
    setProjectDirty(true);
    renderAll();
    renderHistoryButtons();
    setStatus(`${label} applied.`);
  }

  function applyNodeGeometry(snapshot) {
    const node = getNode(snapshot.id);
    if (!node) return;
    node.x = snapshot.x;
    node.y = snapshot.y;
    if (snapshot.hasWidth) node.width = snapshot.width;
    else delete node.width;
    if (snapshot.hasHeight) node.height = snapshot.height;
    else delete node.height;
  }

  function undoHistory() {
    commitHistoryCapture();
    const history = state.history;
    if (!history?.undo?.length) return;
    const previous = history.undo.pop();
    if (isGeometryHistoryEntry(previous)) {
      history.redo.push(previous);
      applyGeometryHistoryEntry(previous, "before", "Undo");
      return;
    }
    const current = getHistorySnapshot();
    history.redo.push(current);
    if (history.redo.length > HISTORY_LIMIT) history.redo.shift();
    restoreHistorySnapshot(previous, "Undo");
  }

  function redoHistory() {
    const history = state.history;
    if (!history?.redo?.length) return;
    const next = history.redo.pop();
    if (isGeometryHistoryEntry(next)) {
      history.undo.push(next);
      applyGeometryHistoryEntry(next, "after", "Redo");
      return;
    }
    const current = getHistorySnapshot();
    history.undo.push(current);
    if (history.undo.length > HISTORY_LIMIT) history.undo.shift();
    restoreHistorySnapshot(next, "Redo");
  }

  function restoreHistorySnapshot(snapshot, label) {
    if (!snapshot) return;
    let payload;
    try {
      payload = JSON.parse(snapshot);
    } catch (error) {
      console.error(error);
      setStatus(`${label} failed.`);
      return;
    }
    state.history.applying = true;
    state.project = normalizeProject(payload.project || {});
    markProjectStructureChanged({ nodeTypes: true });
    state.selectedNodeId = getValidSavedNodeId(payload.selectedNodeId);
    state.selectedNodeIds = Array.isArray(payload.selectedNodeIds)
      ? payload.selectedNodeIds.filter((id) => getNode(id))
      : [];
    state.selectedLinkId = getValidSavedLinkId(payload.selectedLinkId);
    state.panel = getValidSavedPanel(payload.panel, state.selectedNodeId);
    state.activeFileId = fileViews[payload.activeFileId] ? payload.activeFileId : "adventure";
    state.view = normalizeView(payload.view);
    state.characterFocusId = payload.characterFocusId && getCharacterById(payload.characterFocusId) ? payload.characterFocusId : null;
    state.characterSearch = typeof payload.characterSearch === "string" ? payload.characterSearch : "";
    state.eventSearch = typeof payload.eventSearch === "string" ? payload.eventSearch : "";
    state.playbookJsonOpen = Boolean(payload.playbookJsonOpen);
    state.search = typeof payload.search === "string" ? payload.search : "";
    state.connectingFrom = null;
    state.reconnectingLinkId = null;
    state.reconnectingEnd = null;
    state.history.current = snapshot;
    state.history.pending = null;
    state.history.applying = false;
    setProjectDirty(true);
    renderAll();
    setStatus(`${label} applied.`);
  }

  function renderHistoryButtons() {
    if (!dom.undoButton || !dom.redoButton || !state.history) return;
    dom.undoButton.disabled = !state.history.undo.length;
    dom.redoButton.disabled = !state.history.redo.length;
  }

  function shouldRecordAction(action) {
    return new Set([
      "add-node",
      "add-custom-node-type",
      "restore-node-type",
      "hide-node-type",
      "delete-custom-node-type",
      "add-character",
      "delete-character",
      "add-node-cast",
      "delete-node-cast",
      "add-variable",
      "create-play-rule",
      "add-playbook-node-rule",
      "add-playbook-choice-rule",
      "add-playbook-state-rules",
      "delete-variable",
      "auto-layout",
      "rename-event-column",
      "hide-event-column",
      "delete-event-column",
      "show-event-column",
      "reset-story-order",
      "reset-event-row-order",
      "restore-default-node-types",
      "duplicate-node",
      "delete-node",
      "delete-selected-nodes",
      "delete-context-link",
      "assign-choice-link"
    ]).has(action);
  }

  function renderAll() {
    hideNodeContextMenu();
    renderShellState();
    renderPalette();
    if (isCanvasFileActive()) {
      renderCanvasSurface({ force: true });
    }
    renderWorkspaceFile();
    renderInspector();
    updateStatus();
    renderHistoryButtons();
  }

  function isCanvasFileActive() {
    return state.activeFileId === "adventure";
  }

  function renderCanvasSurface(options = {}) {
    if (!dom.canvasPanel || !dom.nodeLayer || !dom.linkLayer) return;
    const shouldRender = options.force
      || state.canvasRenderedVersion !== state.canvasRenderVersion
      || !dom.nodeLayer.childElementCount;
    renderTransform();
    if (shouldRender) {
      const canvasRenderContext = options.renderContext || getCanvasRenderContext();
      renderNodes(canvasRenderContext);
      renderLinks(canvasRenderContext);
      markCanvasSurfaceRendered();
    }
    renderMinimap();
  }

  function invalidateCanvasSurface() {
    state.canvasRenderVersion += 1;
  }

  function markCanvasSurfaceRendered() {
    state.canvasRenderedVersion = state.canvasRenderVersion;
  }

  function markCanvasSurfaceRenderedIfActive() {
    if (isCanvasFileActive()) markCanvasSurfaceRendered();
  }

  function invalidateDocumentSurfaces(fileId = null) {
    state.documentRenderVersion += 1;
    if (fileId && state.documentRenderedVersions) {
      state.documentRenderedVersions[fileId] = 0;
    }
  }

  function renderPlaybookSurfaces(options = {}) {
    hideNodeContextMenu();
    renderShellState();
    if (state.activeFileId === "variables") {
      renderVariablesPage(options);
      markDocumentSurfaceRendered("variables");
    } else {
      renderWorkspaceFile();
    }
    renderProjectPanel();
    renderStoryPanel();
    updateStatus();
  }

  function renderShellState() {
    dom.root?.setAttribute("data-theme", state.theme);
    dom.themeHost?.setAttribute("data-theme", state.theme);
    renderSidebarState();
    if (dom.themeToggle) {
      const isDark = state.theme === "dark";
      dom.themeToggle.textContent = isDark ? "Dark" : "Light";
      dom.themeToggle.setAttribute("aria-pressed", String(isDark));
      dom.themeToggle.title = `Switch to ${isDark ? "light" : "dark"} theme`;
    }
    if (dom.exportImageScale) {
      dom.exportImageScale.value = getExportImageScalePreset().value;
    }
    if (dom.vaultProjectTitle) {
      dom.vaultProjectTitle.textContent = state.project.title || "Untitled Story";
    }
    renderProjectFileStatus();
    dom.root?.setAttribute("data-active-file", state.activeFileId || "adventure");
    syncWorkspaceSearchControls();

    dom.scope.querySelectorAll(".nc-file-item[data-file-id]").forEach((button) => {
      const isActive = button.dataset.fileId === state.activeFileId;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    if (dom.activeFileTab) {
      dom.activeFileTab.textContent = fileViews[state.activeFileId] || fileViews.adventure;
    }

    dom.workspaceToolbar.hidden = state.activeFileId !== "adventure";

    dom.fileScopedActions.forEach((button) => {
      const files = String(button.dataset.files || "").split(/\s+/);
      button.hidden = !files.includes(state.activeFileId);
    });
    dom.webOnlyActions.forEach((element) => {
      element.hidden = Boolean(window.NarrativeCanvasHost);
    });
    renderHistoryButtons();
  }

  function syncWorkspaceSearchControls() {
    const activeFile = state.activeFileId || "adventure";
    if (dom.queryInput && dom.queryInput.value !== state.search) dom.queryInput.value = state.search;
    if (dom.characterSearchInput && dom.characterSearchInput.value !== state.characterSearch) {
      dom.characterSearchInput.value = state.characterSearch || "";
    }
    if (dom.eventSearchInput && dom.eventSearchInput.value !== state.eventSearch) {
      dom.eventSearchInput.value = state.eventSearch || "";
    }

    const hasSearch = activeFile === "adventure" || activeFile === "characters" || activeFile === "events";
    if (dom.workspaceSearchControls) dom.workspaceSearchControls.hidden = !hasSearch;
    dom.scope.querySelectorAll("[data-search-scope]").forEach((element) => {
      element.hidden = element.dataset.searchScope !== activeFile;
    });
  }

  function renderProjectFileStatus() {
    if (!dom.projectFileName || !dom.projectFilePath || !dom.projectDirtyIndicator) return;
    const path = getCurrentProjectFilePath();
    const host = window.NarrativeCanvasHost;
    const isVaultProject = Boolean(host?.loadProject || host?.saveProject || host?.ensureProjectFile);
    state.projectFilePath = path;

    if (path) {
      dom.projectFileName.textContent = getProjectFileBasename(path);
      dom.projectFilePath.textContent = path;
    } else if (isVaultProject) {
      dom.projectFileName.textContent = "No .ncanvas selected";
      dom.projectFilePath.textContent = "Save or create a project file in the vault.";
    } else {
      dom.projectFileName.textContent = "Browser storage";
      dom.projectFilePath.textContent = "Saved in this browser";
    }

    const saveState = getProjectSaveState();
    const saveLabel = getProjectSaveLabel(saveState);
    dom.projectDirtyIndicator.hidden = false;
    dom.projectDirtyIndicator.dataset.saveState = saveState;
    dom.projectDirtyIndicator.setAttribute("aria-label", saveLabel);
    const label = dom.projectDirtyIndicator.querySelector("[data-save-label]");
    if (label) label.textContent = saveLabel;
    else dom.projectDirtyIndicator.textContent = saveLabel;
  }

  function getProjectSaveState() {
    if (state.isSaving) return "saving";
    if (state.saveError) return "error";
    return state.hasUnsavedChanges ? "unsaved" : "saved";
  }

  function getProjectSaveLabel(saveState) {
    if (saveState === "saving") return "Saving";
    if (saveState === "unsaved") return "Unsaved";
    if (saveState === "error") return "Save failed";
    return "Saved";
  }

  function getCurrentProjectFilePath() {
    const host = window.NarrativeCanvasHost;
    try {
      const path = host?.getProjectFile?.() || host?.projectFile || "";
      return typeof path === "string" ? path : state.projectFilePath || "";
    } catch (error) {
      console.error(error);
      return state.projectFilePath || "";
    }
  }

  function getProjectFileBasename(path) {
    const parts = String(path || "").split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] || "Project file";
  }

  function setProjectDirty(value) {
    const nextValue = Boolean(value);
    if (nextValue) {
      invalidateCanvasSurface();
      invalidateDocumentSurfaces();
      state.dirtyVersion += 1;
      state.hasUnsavedChanges = true;
      state.saveError = false;
      renderProjectFileStatus();
      scheduleAutoSave();
      return;
    }

    if (state.hasUnsavedChanges === nextValue && !state.saveError) {
      renderProjectFileStatus();
      return;
    }
    clearAutoSaveTimer();
    state.hasUnsavedChanges = nextValue;
    state.saveError = false;
    renderProjectFileStatus();
  }

  function markProjectStructureChanged(options = {}) {
    state.structureVersion += 1;
    invalidateCanvasSurface();
    invalidateDocumentSurfaces();
    invalidateCharacterRenderContext();
    if (!state.derived) return;
    state.derived.flowOrder = null;
    state.derived.displayId = null;
    if (options.nodeTypes) {
      state.derived.nodeTypeMap = null;
      state.derived.projectNodeTypes = null;
    }
  }

  function configureAutoSave() {
    if (state.hasUnsavedChanges) scheduleAutoSave();
    else clearAutoSaveTimer();
    renderProjectFileStatus();
  }

  function scheduleAutoSave() {
    clearAutoSaveTimer();
    if (!initialized || !state.hasUnsavedChanges || state.isSaving) return;
    const interval = getAutoSaveIntervalMs();
    if (!interval) return;
    state.autoSaveTimer = window.setTimeout(() => {
      state.autoSaveTimer = null;
      if (!state.hasUnsavedChanges || state.isSaving) return;
      void saveCurrentState({ silent: true, reason: "auto" });
    }, interval);
  }

  function clearAutoSaveTimer() {
    if (!state.autoSaveTimer) return;
    window.clearTimeout(state.autoSaveTimer);
    state.autoSaveTimer = null;
  }

  function clearStatusTimer(resetOverride = true) {
    if (state.statusTimer) {
      window.clearTimeout(state.statusTimer);
      state.statusTimer = null;
    }
    if (resetOverride) state.statusOverride = false;
  }

  function clearStoryPanelRenderTimer() {
    if (!state.storyPanelRenderTimer) return;
    window.clearTimeout(state.storyPanelRenderTimer);
    state.storyPanelRenderTimer = null;
  }

  function getAutoSaveIntervalMs() {
    const host = window.NarrativeCanvasHost;
    try {
      const value = typeof host?.getAutoSaveIntervalMs === "function"
        ? host.getAutoSaveIntervalMs()
        : host?.autoSaveIntervalMs;
      const normalized = normalizeAutoSaveIntervalMs(value);
      if (normalized) return normalized;
    } catch (error) {
      console.error(error);
    }
    return FALLBACK_AUTO_SAVE_INTERVAL_MS;
  }

  function normalizeAutoSaveIntervalMs(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return 0;
    return Math.round(clamp(numeric, MIN_AUTO_SAVE_INTERVAL_MS, MAX_AUTO_SAVE_INTERVAL_MS));
  }

  function renderWorkspaceFile() {
    const activeFile = state.activeFileId || "adventure";
    setWorkspacePanelActive(dom.canvasPanel, activeFile === "adventure");
    setWorkspacePanelActive(dom.charactersPanel, activeFile === "characters");
    setWorkspacePanelActive(dom.variablesPanel, activeFile === "variables");
    setWorkspacePanelActive(dom.eventsPanel, activeFile === "events");

    if (activeFile === "adventure") renderCanvasSurface();
    if (activeFile === "characters") renderDocumentSurface("characters");
    if (activeFile === "variables") renderDocumentSurface("variables");
    if (activeFile === "events") renderDocumentSurface("events");
  }

  function setWorkspacePanelActive(panel, active) {
    if (!panel) return;
    panel.classList.toggle("active", active);
    panel.setAttribute("aria-hidden", String(!active));
  }

  function renderDocumentSurface(fileId, options = {}) {
    if (!fileViews[fileId]) return;
    const renderedVersion = state.documentRenderedVersions?.[fileId] || 0;
    const panel = getDocumentPanel(fileId);
    const shouldRender = options.force
      || options.focusJsonToken
      || renderedVersion !== state.documentRenderVersion
      || !panel?.childElementCount;
    if (!shouldRender) return;
    if (fileId === "characters") renderCharactersPage();
    if (fileId === "variables") renderVariablesPage(options);
    if (fileId === "events") renderEventsSheetPage();
    markDocumentSurfaceRendered(fileId);
  }

  function markDocumentSurfaceRendered(fileId) {
    if (!state.documentRenderedVersions || typeof state.documentRenderedVersions !== "object") {
      state.documentRenderedVersions = {};
    }
    state.documentRenderedVersions[fileId] = state.documentRenderVersion;
  }

  function getDocumentPanel(fileId) {
    if (fileId === "characters") return dom.charactersPanel;
    if (fileId === "variables") return dom.variablesPanel;
    if (fileId === "events") return dom.eventsPanel;
    return null;
  }

  function getDocumentRenderLimit(fileId) {
    if (!state.documentRenderLimits || typeof state.documentRenderLimits !== "object") {
      state.documentRenderLimits = {};
    }
    const current = Number(state.documentRenderLimits[fileId]);
    if (Number.isFinite(current) && current > 0) return current;
    state.documentRenderLimits[fileId] = DOCUMENT_RENDER_INITIAL_LIMIT;
    return DOCUMENT_RENDER_INITIAL_LIMIT;
  }

  function resetDocumentRenderLimit(fileId) {
    if (!state.documentRenderLimits || typeof state.documentRenderLimits !== "object") {
      state.documentRenderLimits = {};
    }
    state.documentRenderLimits[fileId] = DOCUMENT_RENDER_INITIAL_LIMIT;
  }

  function showMoreDocument(fileId) {
    if (!fileViews[fileId]) return;
    const current = getDocumentRenderLimit(fileId);
    state.documentRenderLimits[fileId] = current + DOCUMENT_RENDER_INCREMENT;
    renderDocumentSurface(fileId, { force: true });
    setStatus(`Showing more ${fileViews[fileId]}.`);
  }

  function renderDocumentLimitNotice(fileId, shown, total) {
    if (shown >= total) return "";
    const remaining = total - shown;
    return `
      <div class="document-limit-notice" data-document-limit-notice>
        <span>Showing ${shown} of ${total}. ${remaining} more not rendered yet.</span>
        <button class="small-button" type="button" data-action="show-more-document" data-document-id="${escapeAttr(fileId)}">
          Show ${Math.min(DOCUMENT_RENDER_INCREMENT, remaining)} more
        </button>
      </div>
    `;
  }

  function renderCharactersPage() {
    const model = buildCharacterDocumentModel(getCharacterRenderContext());
    const limit = getDocumentRenderLimit("characters");
    const shownCount = Math.min(model.visible.length, limit);
    dom.charactersPanel.innerHTML = `
      <div class="document-shell">
        <header class="document-header">
          <div>
            <span class="pane-kicker">Markdown</span>
            <h2>Characters.md</h2>
            <div class="document-meta" data-character-search-meta>${escapeHtml(formatCharacterMeta(model))}</div>
          </div>
          <div class="document-actions">
            <button class="small-button" data-action="add-character">Add character</button>
            <button class="small-button" data-action="export-characters-md">Export MD</button>
            <button class="small-button" data-action="export-characters-json">Export JSON</button>
          </div>
        </header>
        <div class="document-filter-bar" data-character-filter-bar>
          ${renderCharacterFilterBar(model)}
        </div>
        <div class="character-grid">
          ${renderCharacterCardsMarkup(model, limit)}
        </div>
        ${renderDocumentLimitNotice("characters", shownCount, model.visible.length)}
      </div>
    `;
  }

  function buildCharacterDocumentModel(context = getCharacterRenderContext()) {
    const characters = context.characters;
    const focusedCharacter = getActiveCharacterFocus();
    const queryRaw = state.characterSearch || "";
    const query = queryRaw.trim().toLowerCase();
    const visible = query
      ? characters.filter((character) => characterMatchesSearch(character, query, context))
      : characters;
    return {
      context,
      characters,
      visible,
      focusedCharacter,
      query,
      queryRaw,
      linkCount: context.linkCount,
      totalCount: characters.length,
      visibleCount: visible.length
    };
  }

  function formatCharacterMeta(model) {
    const focusText = model.focusedCharacter ? `, focusing ${model.focusedCharacter.name}` : "";
    if (model.query) return `${model.visibleCount} of ${model.totalCount} characters match "${model.queryRaw.trim()}"${focusText}`;
    return `${model.totalCount} characters, ${model.linkCount} character links${focusText}`;
  }

  function renderCharacterFilterBar(model) {
    const chips = [];
    if (model.query) {
      chips.push(`
        <span class="filter-chip">
          Search: ${escapeHtml(model.queryRaw.trim())}
          <button type="button" data-action="clear-character-search" aria-label="Clear character search">Clear</button>
        </span>
      `);
    }
    if (model.focusedCharacter) {
      chips.push(`
        <span class="filter-chip">
          Focus: ${escapeHtml(model.focusedCharacter.name)}
          <button type="button" data-action="clear-character-focus" aria-label="Clear character focus">Clear</button>
        </span>
      `);
    }
    if (!chips.length) chips.push(`<span class="filter-chip quiet">All characters visible</span>`);
    return chips.join("");
  }

  function renderCharacterCardsMarkup(model, limit = getDocumentRenderLimit("characters")) {
    if (!model.characters.length) return `<div class="nc-empty-state">No characters yet.</div>`;
    const visible = model.visible.slice(0, Math.max(0, limit));
    return visible.length
      ? visible.map((character) => renderCharacterCard(character, model.context)).join("")
      : `<div class="nc-empty-state">No characters match "${escapeHtml(model.queryRaw.trim())}".</div>`;
  }

  function getCharacterRenderContext() {
    if (state.characterRenderContext) return state.characterRenderContext;
    return buildCharacterRenderContext();
  }

  function buildCharacterRenderContext() {
    const characters = getCharacters();
    const backlinkIndex = buildCharacterBacklinkIndex(characters);
    const searchIndex = new Map(characters.map((character) => [character.id, buildCharacterSearchText(character)]));
    const linkCount = [...backlinkIndex.values()]
      .reduce((total, groups) => total + groups.reduce((groupTotal, group) => groupTotal + group.items.length, 0), 0);
    const context = { characters, backlinkIndex, searchIndex, linkCount };
    state.characterRenderContext = context;
    return context;
  }

  function invalidateCharacterRenderContext() {
    state.characterRenderContext = null;
  }

  function buildCharacterSearchText(character) {
    return [character.name, character.role, character.voice, character.notes]
      .filter(Boolean)
      .map(String)
      .join("\n")
      .toLowerCase();
  }

  function characterMatchesSearch(character, query, context = state.characterRenderContext) {
    if (!query) return true;
    const haystack = context?.searchIndex?.get(character.id) || buildCharacterSearchText(character);
    return haystack.includes(query);
  }

  function renderCharacterGridForSearch() {
    const grid = dom.charactersPanel?.querySelector(".character-grid");
    const meta = dom.charactersPanel?.querySelector("[data-character-search-meta]");
    const filterBar = dom.charactersPanel?.querySelector("[data-character-filter-bar]");
    if (!grid) return;
    const model = buildCharacterDocumentModel();
    const limit = getDocumentRenderLimit("characters");
    const shownCount = Math.min(model.visible.length, limit);
    if (meta) meta.textContent = formatCharacterMeta(model);
    if (filterBar) filterBar.innerHTML = renderCharacterFilterBar(model);
    grid.innerHTML = renderCharacterCardsMarkup(model, limit);
    const shell = dom.charactersPanel?.querySelector(".document-shell");
    shell?.querySelector("[data-document-limit-notice]")?.remove();
    shell?.insertAdjacentHTML("beforeend", renderDocumentLimitNotice("characters", shownCount, model.visible.length));
  }

  function renderCharacterCard(character, context = getCharacterRenderContext()) {
    const isFocused = state.characterFocusId === character.id;
    const groups = context?.backlinkIndex?.get(character.id) || getCharacterBacklinkGroups(character);
    const isExpanded = state.characterBacklinkExpandedIds?.has(character.id);
    return `
      <article class="character-card ${isFocused ? "focused" : ""}">
        <div class="character-card-header">
          <label class="field">
            <span>Name</span>
            <input data-character-id="${escapeAttr(character.id)}" data-character-field="name" value="${escapeAttr(character.name)}">
          </label>
          <div class="character-card-actions">
            <button class="small-button" data-action="${isFocused ? "clear-character-focus" : "focus-character"}" data-character-id="${escapeAttr(character.id)}">${isFocused ? "Clear" : "Focus"}</button>
            <button class="icon-button danger-button" title="Delete character" data-action="delete-character" data-character-id="${escapeAttr(character.id)}">x</button>
          </div>
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
        ${renderCharacterBacklinkSections(groups, character.id, isExpanded)}
      </article>
    `;
  }

  function renderCharacterBacklinkSections(groups, characterId, isExpanded = false) {
    const nonEmptyGroups = groups.filter((group) => group.items.length);
    if (!nonEmptyGroups.length) return `<div class="linked-node empty">No linked scenes yet</div>`;
    return `
      <div class="character-backlink-section">
        ${nonEmptyGroups.map((group) => `
          <section class="character-backlink-group">
            <h3>${escapeHtml(group.label)}</h3>
            <div class="linked-node-list">
              ${renderCharacterBacklinkGroupItems(group, characterId, isExpanded)}
            </div>
          </section>
        `).join("")}
      </div>
    `;
  }

  function renderCharacterBacklinkGroupItems(group, characterId, isExpanded) {
    const items = isExpanded ? group.items : group.items.slice(0, CHARACTER_BACKLINK_PREVIEW_LIMIT);
    const hiddenCount = group.items.length - items.length;
    return `
      ${items.map((item) => renderCharacterBacklinkItem(item)).join("")}
      ${hiddenCount > 0 ? `
        <button class="linked-node linked-node-more" data-action="toggle-character-backlinks" data-character-id="${escapeAttr(characterId)}">
          Show ${hiddenCount} more
        </button>
      ` : ""}
      ${isExpanded && group.items.length > CHARACTER_BACKLINK_PREVIEW_LIMIT ? `
        <button class="linked-node linked-node-more" data-action="toggle-character-backlinks" data-character-id="${escapeAttr(characterId)}">
          Show fewer
        </button>
      ` : ""}
    `;
  }

  function renderCharacterBacklinkItem(item) {
    const node = item.node;
    return `
      <button class="linked-node character-backlink" data-action="focus-character-node" data-node-id="${escapeAttr(node.id)}">
        <span class="character-backlink-main">
          <strong>${escapeHtml(node.title || getNodeTypeLabel(node.type))}</strong>
          <small>${escapeHtml(getNodeTypeLabel(node.type))} ${escapeHtml(getNodeDisplayId(node))}</small>
        </span>
      </button>
    `;
  }

  function renderVariablesPage(options = {}) {
    if (options.focusJsonToken) state.playbookJsonOpen = true;
    const variables = normalizeVariablesObject(state.project.variables);
    state.project.variables = variables;
    const entries = Object.entries(variables);
    const ruleCards = getPlaybookRuleCards();
    const ruleCount = ruleCards.length;
    const limit = getDocumentRenderLimit("variables");
    const visibleEntries = entries.slice(0, limit);
    const visibleRuleCards = ruleCards.slice(0, limit);
    const shownCount = Math.max(visibleEntries.length, visibleRuleCards.length);
    const totalCount = Math.max(entries.length, ruleCount);
    const playbookJson = buildVariablesJson();
    dom.variablesPanel.innerHTML = `
      <div class="document-shell">
        <header class="document-header">
          <div>
            <span class="pane-kicker">Playbook</span>
            <h2>${PLAYBOOK_FILE_NAME}</h2>
            <div class="document-meta">${entries.length} variables, ${ruleCount} Play rules</div>
          </div>
          <div class="document-actions">
            <button class="help-button" type="button" data-action="show-playbook-help" aria-label="What can Playbook.json do?">?</button>
            <button class="small-button" type="button" data-action="add-variable">Add variable</button>
            <button class="small-button" type="button" data-action="add-play-rule">Add play rule</button>
            <button class="small-button" type="button" data-action="toggle-playbook-json">${state.playbookJsonOpen ? "Hide JSON" : "Advanced JSON"}</button>
            <button class="small-button" type="button" data-action="export-variables-json">Export JSON</button>
          </div>
        </header>
        <section class="playbook-section">
          <header class="playbook-section-header">
            <h3>Variables</h3>
            <span>${entries.length}</span>
          </header>
          <div class="variable-table">
            <div class="variable-row variable-heading">
              <span>Key</span>
              <span>Type</span>
              <span>Value</span>
              <span></span>
            </div>
            ${visibleEntries.map(([key, value]) => renderVariableRow(key, value)).join("") || `<div class="nc-empty-state">No variables yet.</div>`}
          </div>
        </section>
        <section class="playbook-section">
          <header class="playbook-section-header">
            <h3>Play rules</h3>
            <span>${ruleCount}</span>
          </header>
          <div class="playbook-rule-grid">
            ${visibleRuleCards.length ? visibleRuleCards.map(renderPlaybookRuleCard).join("") : `<div class="nc-empty-state">No play rules yet.</div>`}
          </div>
        </section>
        ${renderDocumentLimitNotice("variables", shownCount, totalCount)}
        ${state.playbookJsonOpen ? `
          <label class="field json-field">
            <span>Advanced JSON</span>
            <textarea data-project-field="variables" data-playbook-json-version="${state.dirtyVersion}" rows="${getPlaybookJsonRows(playbookJson)}" spellcheck="false">${escapeHtml(playbookJson)}</textarea>
          </label>
        ` : ""}
      </div>
    `;
    requestAnimationFrame(() => {
      const textarea = resizePlaybookJsonTextarea();
      if (options.focusJsonToken) focusPlaybookJsonToken(options.focusJsonToken, textarea);
    });
  }

  function renderPlaybookRuleCard(card) {
    return `
      <article class="playbook-rule-card">
        <header>
          <div>
            <span class="playbook-rule-kind">${escapeHtml(card.kind)}</span>
            <h4>${escapeHtml(card.target)}</h4>
          </div>
          <button class="small-button" type="button" data-action="focus-playbook-json" data-playbook-token="${escapeAttr(JSON.stringify(card.target))}">JSON</button>
        </header>
        <dl>
          ${card.rows.map((row) => `
            <div>
              <dt>${escapeHtml(row.label)}</dt>
              <dd>${escapeHtml(row.value)}</dd>
            </div>
          `).join("")}
        </dl>
      </article>
    `;
  }

  function getPlaybookRuleCards() {
    return Object.entries(getScriptNodeTypes()).map(([target, script]) => {
      const rows = [];
      const kinds = [];
      if (script.title || script.body) {
        kinds.push("Text");
        rows.push({ label: "Title", value: script.title || "{title}" });
        rows.push({ label: "Body", value: script.body || "{body}" });
      }
      if (script.choices && (Array.isArray(script.choices) ? script.choices.length : String(script.choices).trim())) {
        kinds.push("Choices");
        rows.push({ label: "Buttons", value: formatPlaybookChoicesSummary(script.choices) });
      }
      if (script.set?.key || script.set?.value) {
        kinds.push("Set");
        rows.push({ label: "On visit", value: `${script.set.key || "variable"} = ${script.set.value || "value"}` });
      }
      if (script.condition) {
        kinds.push("Condition");
        rows.push({ label: "Gate", value: script.condition });
      }
      return {
        target,
        kind: kinds.length ? kinds.join(" + ") : "Rule",
        rows: rows.length ? rows : [{ label: "Rule", value: "Empty rule" }]
      };
    });
  }

  function formatPlaybookChoicesSummary(value) {
    if (Array.isArray(value)) return value.join(" / ");
    return String(value || "choices");
  }

  function getPlaybookJsonRows(value) {
    return Math.max(24, String(value || "").split(/\r?\n/).length + 2);
  }

  function resizePlaybookJsonTextarea(textarea = dom.variablesPanel?.querySelector("textarea[data-project-field='variables']")) {
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.max(520, textarea.scrollHeight + 2)}px`;
    return textarea;
  }

  function focusPlaybookJsonToken(token, textarea = dom.variablesPanel?.querySelector("textarea[data-project-field='variables']")) {
    if (!textarea || !token) return false;
    const value = textarea.value || "";
    const index = value.indexOf(token);
    if (index < 0) {
      textarea.scrollIntoView({ block: "center", behavior: "smooth" });
      return false;
    }
    const lineIndex = value.slice(0, index).split(/\r?\n/).length - 1;
    const lineStart = value.lastIndexOf("\n", index - 1) + 1;
    const nextLine = value.indexOf("\n", index);
    const lineEnd = nextLine < 0 ? value.length : nextLine;
    scrollPlaybookJsonLineIntoView(textarea, lineIndex);
    setTextareaSelection(textarea, lineStart, lineEnd);
    try {
      textarea.focus({ preventScroll: true });
    } catch (error) {
      textarea.focus();
    }
    requestAnimationFrame(() => setTextareaSelection(textarea, lineStart, lineEnd));
    return true;
  }

  function setTextareaSelection(textarea, start, end) {
    try {
      textarea.setSelectionRange(start, end);
    } catch (error) {
      // Some embedded environments delay textarea focus; the next frame retry handles it.
    }
  }

  function scrollPlaybookJsonLineIntoView(textarea, lineIndex) {
    const panel = dom.variablesPanel;
    if (!panel) {
      textarea.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    const styles = window.getComputedStyle ? window.getComputedStyle(textarea) : null;
    const parsedLineHeight = Number.parseFloat(styles?.lineHeight || "");
    const fontSize = Number.parseFloat(styles?.fontSize || "");
    const lineHeight = Number.isFinite(parsedLineHeight) ? parsedLineHeight : Math.max(18, (Number.isFinite(fontSize) ? fontSize * 1.35 : 18));
    const targetTop = textarea.offsetTop + lineHeight * Math.max(0, lineIndex) - panel.clientHeight * 0.45;
    const top = Math.max(0, targetTop);
    try {
      panel.scrollTo({ top, behavior: "smooth" });
    } catch (error) {
      panel.scrollTop = top;
    }
  }

  function renderEventsSheetPage() {
    const model = buildEventSheetDocumentModel();
    const limit = getDocumentRenderLimit("events");
    const limited = limitEventSheetGroups(model.groups, limit);
    dom.eventsPanel.innerHTML = `
      <div class="document-shell event-sheet-shell">
        <header class="document-header">
          <div>
            <span class="pane-kicker">CSV</span>
            <h2>Events Sheet.csv</h2>
            <div class="document-meta" data-event-search-meta>${escapeHtml(formatEventSheetMeta(model))}</div>
          </div>
          <div class="document-actions">
            <button class="small-button" type="button" data-action="add-node" data-type="Event">Add event frame</button>
            <button class="small-button" type="button" data-action="reset-event-row-order" title="Clear manual drag order and re-sort rows by the canvas flow">Re-sort by graph</button>
            <button class="small-button" type="button" data-action="export-event-sheet">Export CSV</button>
            <button class="small-button" type="button" data-action="export-event-sheet-json">Export JSON</button>
          </div>
        </header>
        <div class="document-filter-bar" data-event-filter-bar>
          ${renderEventFilterBar(model)}
        </div>
        <div class="event-sheet-groups">
          ${renderEventSheetGroupsMarkup(model, limited.groups)}
        </div>
        ${renderDocumentLimitNotice("events", limited.shownRows, model.visibleRows)}
      </div>
    `;
  }

  function renderEventSheetGroupsForSearch() {
    const groupContainer = dom.eventsPanel?.querySelector(".event-sheet-groups");
    const meta = dom.eventsPanel?.querySelector("[data-event-search-meta]");
    const filterBar = dom.eventsPanel?.querySelector("[data-event-filter-bar]");
    if (!groupContainer) {
      renderEventsSheetPage();
      return;
    }
    const model = buildEventSheetDocumentModel();
    const limit = getDocumentRenderLimit("events");
    const limited = limitEventSheetGroups(model.groups, limit);
    if (meta) meta.textContent = formatEventSheetMeta(model);
    if (filterBar) filterBar.innerHTML = renderEventFilterBar(model);
    groupContainer.innerHTML = renderEventSheetGroupsMarkup(model, limited.groups);
    const shell = dom.eventsPanel?.querySelector(".event-sheet-shell");
    shell?.querySelector("[data-document-limit-notice]")?.remove();
    shell?.insertAdjacentHTML("beforeend", renderDocumentLimitNotice("events", limited.shownRows, model.visibleRows));
  }

  function buildEventSheetDocumentModel() {
    const allGroups = getEventRowGroups();
    const groups = getFilteredEventRowGroups(allGroups);
    const totalRows = allGroups.reduce((total, group) => total + group.rows.length, 0);
    const visibleRows = groups.reduce((total, group) => total + group.rows.length, 0);
    const queryRaw = state.eventSearch || "";
    const query = queryRaw.trim();
    return { allGroups, groups, totalRows, visibleRows, query, queryRaw };
  }

  function limitEventSheetGroups(groups, limit = getDocumentRenderLimit("events")) {
    let remaining = Math.max(0, limit);
    let shownRows = 0;
    const limitedGroups = [];
    groups.forEach((group) => {
      if (remaining <= 0) return;
      const rows = group.rows.slice(0, remaining);
      if (!rows.length) return;
      shownRows += rows.length;
      remaining -= rows.length;
      limitedGroups.push({ ...group, rows, totalRows: group.rows.length });
    });
    return { groups: limitedGroups, shownRows };
  }

  function renderEventSheetGroupsMarkup(model, groups = model.groups) {
    if (groups.length) return groups.map(renderEventSheetGroup).join("");
    if (model.allGroups.length) return `<div class="nc-empty-state">No matching event frames.</div>`;
    return `<div class="nc-empty-state">No event frame nodes yet.</div>`;
  }

  function formatEventSheetMeta(model) {
    if (!model.query) return `${model.totalRows} event rows from canvas nodes`;
    return `${model.visibleRows} of ${model.totalRows} event rows match "${model.query}"`;
  }

  function renderEventFilterBar(model) {
    if (!model.query) return `<span class="filter-chip quiet">All event rows visible</span>`;
    return `
      <span class="filter-chip">
        Search: ${escapeHtml(model.query)}
        <button type="button" data-action="clear-event-search" aria-label="Clear event search">Clear</button>
      </span>
    `;
  }

  function clearEventSearch() {
    state.eventSearch = "";
    if (dom.eventSearchInput) dom.eventSearchInput.value = "";
    renderEventSheetGroupsForSearch();
    setStatus("Event search cleared.");
  }

  function captureEventSheetScrollState() {
    const entries = [];
    dom.eventsPanel?.querySelectorAll(".event-sheet-group[data-event-group-type]").forEach((group) => {
      const scroll = group.querySelector(".event-sheet-scroll");
      if (!scroll) return;
      entries.push({
        type: group.dataset.eventGroupType || "",
        left: scroll.scrollLeft,
        top: scroll.scrollTop
      });
    });
    return entries;
  }

  function restoreEventSheetScrollState(entries) {
    if (!Array.isArray(entries) || !entries.length) return;
    const restore = () => {
      entries.forEach((entry) => {
        const group = dom.eventsPanel?.querySelector(`.event-sheet-group[data-event-group-type="${CSS.escape(entry.type)}"]`);
        const scroll = group?.querySelector(".event-sheet-scroll");
        if (!scroll) return;
        scroll.scrollLeft = Math.min(entry.left, Math.max(0, scroll.scrollWidth - scroll.clientWidth));
        scroll.scrollTop = Math.min(entry.top, Math.max(0, scroll.scrollHeight - scroll.clientHeight));
      });
    };
    restore();
    requestAnimationFrame(restore);
  }

  function renderEventSheetGroup(group) {
    const columns = getEventSheetColumns(group.type);
    const hiddenColumns = getHiddenEventSheetColumnDefs(group.type);
    return `
      <section class="event-sheet-group" data-event-group-type="${escapeAttr(group.type)}">
        <header class="event-sheet-group-header">
          <h3>${escapeHtml(group.label)}</h3>
          <span>${group.rows.length}${group.totalRows && group.totalRows !== group.rows.length ? ` of ${group.totalRows}` : ""} rows</span>
        </header>
        <div class="event-sheet-scroll">
          <table class="event-sheet-table">
            <colgroup>
              <col class="event-row-handle-col">
              <col class="event-node-col">
              ${columns.map((column) => `<col style="width:${column.width}">`).join("")}
              <col class="event-hidden-col">
            </colgroup>
            <thead>
              <tr>
                <th aria-hidden="true"></th>
                <th class="event-node-heading">Node</th>
                ${columns.map((column) => renderEventColumnHeader(column)).join("")}
                <th>Hidden</th>
              </tr>
            </thead>
            <tbody data-event-group-type="${escapeAttr(group.type)}">
              ${group.rows.map((node) => renderEventSheetRow(node, columns, hiddenColumns)).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderEventColumnHeader(column) {
    const columnName = column.custom ? `${column.label} field` : `${column.label} column`;
    return `
      <th style="${eventColumnWidthStyle(column.width)}" data-event-column-key="${escapeAttr(column.key)}">
        <div class="event-column-header">
          <span class="event-column-name">${escapeHtml(column.label)}</span>
          <span class="event-column-actions" aria-label="${escapeAttr(column.label)} column actions">
            <button class="event-column-button" type="button" aria-label="${escapeAttr(`Rename ${columnName}`)}" data-action="rename-event-column" data-event-column-key="${escapeAttr(column.key)}">Rename</button>
            <button class="event-column-button" type="button" aria-label="${escapeAttr(`Hide ${columnName}`)}" data-action="hide-event-column" data-event-column-key="${escapeAttr(column.key)}">Hide</button>
            <button class="event-column-button danger" type="button" aria-label="${escapeAttr(`Delete ${columnName}`)}" data-action="delete-event-column" data-event-column-key="${escapeAttr(column.key)}">Delete</button>
          </span>
        </div>
        <span class="event-column-resize-handle" data-event-column-resize="${escapeAttr(column.key)}" role="separator" aria-label="${escapeAttr(`Resize ${columnName}`)}" title="Drag to resize"></span>
      </th>
    `;
  }

  function renderEventSheetRow(node, columns, hiddenColumns = []) {
    return `
      <tr data-event-row-id="${escapeAttr(node.id)}">
        <td class="event-row-handle-cell">
          <span class="event-row-drag-handle" data-event-row-drag="${escapeAttr(node.id)}" title="Drag to reorder" aria-label="Drag to reorder">::</span>
        </td>
        <th data-action="focus-story-node" data-node-id="${escapeAttr(node.id)}">
          <div class="event-node-link">
            <span>${escapeHtml(node.title || getNodeDisplayId(node))}</span>
            <small>${escapeHtml(getNodeTypeLabel(node.type))} ${escapeHtml(getNodeDisplayId(node))}</small>
          </div>
        </th>
        ${columns.map((column) => renderEventCell(node, column)).join("")}
        <td class="event-hidden-cell">${renderHiddenEventColumnRestoreControls(hiddenColumns)}</td>
      </tr>
    `;
  }

  function renderHiddenEventColumnRestoreControls(hiddenColumns) {
    if (!hiddenColumns.length) return `<span class="event-hidden-empty">No hidden columns</span>`;
    return `
      <div class="event-hidden-controls">
        ${hiddenColumns.map((column) => `
          <button class="event-hidden-restore-button" type="button" data-action="show-event-column" data-event-column-key="${escapeAttr(column.key)}">
            ${escapeHtml(column.label)}
          </button>
        `).join("")}
      </div>
    `;
  }

  function renderEventCell(node, column) {
    const value = getNodeEventValue(node, column.key);
    if (column.readonly) {
      return `<td style="${eventColumnWidthStyle(column.width)}">${renderEventElementsCell(node)}</td>`;
    }
    const control = isMultilineEventField(column.key)
      ? `<textarea data-event-node-id="${escapeAttr(node.id)}" data-event-field="${column.key}">${escapeHtml(value)}</textarea>`
      : `<input data-event-node-id="${escapeAttr(node.id)}" data-event-field="${column.key}" value="${escapeAttr(value)}">`;
    return `<td style="${eventColumnWidthStyle(column.width)}">${control}</td>`;
  }

  function eventColumnWidthStyle(width) {
    const normalized = normalizeEventColumnWidth(width);
    return `width:${normalized}; min-width:${normalized};`;
  }

  function isMultilineEventField(key) {
    return key === "eventDescription" || key === "choices" || key === "characterEncountered";
  }

  function renderEventElementsCell(node) {
    const elements = getEventContainedNodes(node).map(formatEventElement);
    if (!elements.length) return `<div class="event-elements-cell empty">No contained nodes</div>`;
    if (elements.length <= 3) {
      return `<div class="event-elements-cell">${escapeHtml(elements.join("\n"))}</div>`;
    }
    const preview = elements.slice(0, 3).join("\n");
    return `
      <details class="event-elements-cell event-elements-collapsible">
        <summary>${escapeHtml(elements.length)} elements - show all</summary>
        <div class="event-elements-preview">${escapeHtml(preview)}</div>
        <div class="event-elements-full">${escapeHtml(elements.join("\n"))}</div>
      </details>
    `;
  }

  function getEventSheetColumns(eventType = null) {
    const hidden = getHiddenEventSheetColumns();
    const columns = getProjectEventSheetColumns().filter((column) => !hidden.has(column.key));
    const seen = new Set(columns.map((column) => column.key));
    getProjectNodeTypes()
      .filter((typeDef) => isEventFrameKind(typeDef.kind))
      .filter((typeDef) => !eventType || typeDef.type === eventType)
      .flatMap((typeDef) => typeDef.fields || [])
      .forEach((field) => {
        if (!field?.key || seen.has(field.key)) return;
        if (hidden.has(field.key)) return;
        seen.add(field.key);
        columns.push({
          key: field.key,
          label: field.label || field.key,
          width: "180px",
          custom: true
        });
      });
    return columns;
  }

  function getHiddenEventSheetColumns() {
    const eventSheet = getProjectEventSheet();
    return new Set(eventSheet.hiddenColumns);
  }

  function getHiddenEventSheetColumnDefs(eventType = null) {
    const hidden = getHiddenEventSheetColumns();
    const defs = new Map();
    eventSheetColumns.forEach((column) => defs.set(column.key, column));
    getProjectEventSheetColumns().forEach((column) => defs.set(column.key, column));
    getProjectNodeTypes()
      .filter((typeDef) => isEventFrameKind(typeDef.kind))
      .filter((typeDef) => !eventType || typeDef.type === eventType)
      .flatMap((typeDef) => typeDef.fields || [])
      .forEach((field) => {
        if (!field?.key) return;
        defs.set(field.key, {
          key: field.key,
          label: field.label || field.key,
          width: "180px",
          custom: true
        });
      });
    return [...hidden]
      .map((key) => defs.get(key) || { key, label: key, width: "180px", custom: true })
      .filter((column) => column.key !== EVENT_ELEMENTS_COLUMN_KEY);
  }

  function getProjectEventSheet() {
    state.project.eventSheet = normalizeEventSheetConfig(state.project.eventSheet, state.project.eventSheetHiddenColumns);
    delete state.project.eventSheetHiddenColumns;
    return state.project.eventSheet;
  }

  function getProjectEventSheetColumns() {
    return getProjectEventSheet().columns;
  }

  function normalizeEventSheetConfig(value, legacyHiddenColumns = []) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return {
      columns: normalizeEventSheetColumns(source.columns),
      hiddenColumns: normalizeEventSheetHiddenColumns(source.hiddenColumns, legacyHiddenColumns)
    };
  }

  function normalizeEventSheetColumns(columns) {
    const sourceColumns = Array.isArray(columns) && !isLegacyDefaultEventSheetColumns(columns) ? columns : eventSheetColumns;
    const seen = new Set();
    return sourceColumns
      .map(normalizeEventSheetColumn)
      .filter((column) => {
        if (!column || column.key === EVENT_ELEMENTS_COLUMN_KEY || seen.has(column.key)) return false;
        seen.add(column.key);
        return true;
      });
  }

  function isLegacyDefaultEventSheetColumns(columns) {
    if (!Array.isArray(columns) || columns.length !== legacyEventSheetColumns.length) return false;
    return legacyEventSheetColumns.every((legacyColumn, index) => {
      const column = columns[index];
      return column?.key === legacyColumn.key
        && (!column.label || column.label === legacyColumn.label);
    });
  }

  function normalizeEventSheetColumn(column) {
    const rawKey = typeof column === "string" ? column : column?.key;
    const defaultColumn = eventSheetColumns.find((item) => item.key === rawKey);
    const key = String(rawKey || defaultColumn?.key || "").trim();
    if (!key) return null;
    const sourceWidth = typeof column === "object" ? column?.width : "";
    const width = key === "characterEncountered" && sourceWidth === "220px"
      ? defaultColumn?.width
      : sourceWidth || defaultColumn?.width;
    return {
      key,
      label: String((typeof column === "object" && column?.label) || defaultColumn?.label || key).trim() || key,
      width: normalizeEventColumnWidth(width),
      readonly: Boolean((typeof column === "object" && column?.readonly) || defaultColumn?.readonly),
      custom: defaultColumn ? Boolean(typeof column === "object" && column?.custom) : true
    };
  }

  function normalizeEventColumnWidth(value) {
    const width = String(value || "180px").trim();
    if (!width) return "180px";
    if (typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("width", width)) return width;
    return /^(?:\d+(?:\.\d+)?(?:px|rem|em|%|vw|vh)|auto)$/.test(width) ? width : "180px";
  }

  function normalizeEventSheetHiddenColumns(hiddenColumns, legacyHiddenColumns) {
    const values = Array.isArray(hiddenColumns) ? hiddenColumns : legacyHiddenColumns;
    return Array.isArray(values) ? [...new Set(values.map(String).filter((key) => key && key !== EVENT_ELEMENTS_COLUMN_KEY))] : [];
  }

  function renameEventColumn(key) {
    const column = getEventColumnByKey(key);
    if (!column) return;
    showGenericTextInput({
      kicker: "Events Sheet",
      title: `Rename ${column.label}`,
      label: "Column name",
      value: column.label,
      maxLength: 60,
      confirmLabel: "Rename",
      recordHistory: true,
      onConfirm: (nextLabel) => applyEventColumnRename(key, nextLabel)
    });
  }

  function applyEventColumnRename(key, nextLabel) {
    const column = getEventColumnByKey(key);
    if (!column) return false;
    const label = String(nextLabel).trim().slice(0, 60);
    if (!label) {
      setStatus("Column name is required.");
      return false;
    }

    setEventColumnLabel(key, label, column);
    markProjectStructureChanged({ nodeTypes: Boolean(column.custom) });
    renderEventSheetSchemaSurfaces();
    setStatus(`${column.label} renamed to ${label}.`);
    return true;
  }

  function setEventColumnLabel(key, label, column = getEventColumnByKey(key)) {
    const eventSheet = getProjectEventSheet();
    let schemaColumn = eventSheet.columns.find((item) => item.key === key);
    if (!schemaColumn && !column?.custom) {
      const defaultColumn = eventSheetColumns.find((item) => item.key === key);
      if (defaultColumn) {
        schemaColumn = normalizeEventSheetColumn(defaultColumn);
        eventSheet.columns.push(schemaColumn);
      }
    }
    if (schemaColumn) schemaColumn.label = label;

    if (column?.custom) {
      getProjectNodeTypes()
        .filter((typeDef) => isEventFrameKind(typeDef.kind))
        .forEach((typeDef) => {
          (typeDef.fields || [])
            .filter((field) => field.key === key)
            .forEach((field) => {
              field.label = label;
            });
        });
    }
  }

  function hideEventColumn(key) {
    const column = getEventColumnByKey(key);
    if (!column) return;
    const eventSheet = getProjectEventSheet();
    const targetKey = String(key);
    const hiddenColumns = eventSheet.hiddenColumns.includes(targetKey)
      ? eventSheet.hiddenColumns
      : [...eventSheet.hiddenColumns, targetKey];
    state.project.eventSheet = { ...eventSheet, hiddenColumns };
    markProjectStructureChanged();
    renderEventSheetSchemaSurfaces();
    setStatus(`${column.label} column hidden. Data kept.`);
  }

  function showEventColumn(key) {
    const eventSheet = getProjectEventSheet();
    const column = getEventColumnByKey(key) || getHiddenEventSheetColumnDefs().find((item) => item.key === key);
    const targetKey = String(key);
    state.project.eventSheet = {
      ...eventSheet,
      hiddenColumns: eventSheet.hiddenColumns.filter((item) => String(item) !== targetKey)
    };
    markProjectStructureChanged();
    renderEventSheetSchemaSurfaces();
    setStatus(`${column?.label || key} column shown.`);
  }

  function deleteEventColumn(key) {
    const column = getEventColumnByKey(key);
    if (!column) return;

    const eventSheet = getProjectEventSheet();
    eventSheet.columns = eventSheet.columns.filter((item) => item.key !== key);
    eventSheet.hiddenColumns = eventSheet.hiddenColumns.filter((item) => item !== key);

    if (column.custom) {
      getProjectNodeTypes()
        .filter((typeDef) => isEventFrameKind(typeDef.kind))
        .forEach((typeDef) => {
          typeDef.fields = (typeDef.fields || []).filter((field) => field.key !== key);
        });
    }

    state.project.nodes
      .filter((node) => isEventSheetNode(node))
      .forEach((node) => deleteNodeFieldValue(node, key));

    markProjectStructureChanged({ nodeTypes: Boolean(column.custom) });
    renderEventSheetSchemaSurfaces();
    setStatus(`${column.label} column deleted.`);
  }

  function renderEventSheetSchemaSurfaces() {
    if (state.activeFileId === "events") {
      renderEventsSheetPage();
      markDocumentSurfaceRendered("events");
    }
    renderInspector();
    updateStatus();
    renderHistoryButtons();
  }

  function showGenericConfirm(options) {
    if (!dom.genericConfirmDialog?.showModal) {
      setStatus("Confirmation dialog is unavailable.");
      return false;
    }
    state.genericConfirmAction = {
      onConfirm: typeof options.onConfirm === "function" ? options.onConfirm : null,
      recordHistory: Boolean(options.recordHistory)
    };
    dom.genericConfirmKicker.textContent = options.kicker || "Confirm";
    dom.genericConfirmTitle.textContent = options.title || "Confirm action?";
    dom.genericConfirmBody.textContent = options.message || "";
    dom.genericConfirmButton.textContent = options.confirmLabel || "Confirm";
    dom.genericConfirmButton.classList.toggle("danger-button", options.danger !== false);
    dom.genericConfirmButton.classList.toggle("primary", options.danger === false);
    dom.genericConfirmDialog.returnValue = "";
    dom.genericConfirmDialog.showModal();
    return true;
  }

  function handleGenericConfirmClose() {
    const pending = state.genericConfirmAction;
    state.genericConfirmAction = null;
    if (dom.genericConfirmDialog.returnValue !== "confirm" || !pending?.onConfirm) return;
    const historyBefore = pending.recordHistory ? getHistorySnapshot() : null;
    try {
      const result = pending.onConfirm();
      if (result && typeof result.catch === "function") result.catch((error) => console.error(error));
    } catch (error) {
      console.error(error);
    }
    if (historyBefore) commitHistoryFromSnapshot(historyBefore);
  }

  function showGenericTextInput(options) {
    if (!dom.genericTextDialog?.showModal) {
      setStatus("Text input dialog is unavailable.");
      return false;
    }
    state.genericTextAction = {
      onConfirm: typeof options.onConfirm === "function" ? options.onConfirm : null,
      recordHistory: Boolean(options.recordHistory)
    };
    dom.genericTextKicker.textContent = options.kicker || "Edit";
    dom.genericTextTitle.textContent = options.title || "Edit value";
    dom.genericTextLabel.textContent = options.label || "Value";
    dom.genericTextInput.value = options.value || "";
    dom.genericTextInput.maxLength = options.maxLength ? String(options.maxLength) : "";
    dom.genericTextBody.textContent = options.message || "";
    dom.genericTextButton.textContent = options.confirmLabel || "Apply";
    dom.genericTextDialog.returnValue = "";
    dom.genericTextDialog.showModal();
    requestAnimationFrame(() => {
      dom.genericTextInput.focus();
      dom.genericTextInput.select();
    });
    return true;
  }

  function handleGenericTextClose() {
    const pending = state.genericTextAction;
    state.genericTextAction = null;
    if (dom.genericTextDialog.returnValue !== "confirm" || !pending?.onConfirm) return;
    const historyBefore = pending.recordHistory ? getHistorySnapshot() : null;
    let changed = false;
    try {
      changed = pending.onConfirm(dom.genericTextInput.value) !== false;
    } catch (error) {
      console.error(error);
    }
    if (historyBefore && changed) commitHistoryFromSnapshot(historyBefore);
  }

  function showEventColumnDeleteConfirm(key) {
    const column = getEventColumnByKey(key);
    if (!column) return;
    state.eventColumnDeleteKey = key;
    const deleteImpact = column.custom
      ? `Delete removes "${column.label}" from all Event Frame type definitions and clears that value from existing Event Frame nodes.`
      : `Delete removes "${column.label}" from the Events Sheet schema and clears that value from existing Event Frame nodes.`;
    const message = `Hide only hides the column and keeps data. ${deleteImpact}`;
    const title = `Delete ${column.label} column?`;

    if (dom.eventColumnDeleteDialog?.showModal) {
      dom.eventColumnDeleteDialog.returnValue = "";
      dom.eventColumnDeleteTitle.textContent = title;
      dom.eventColumnDeleteBody.textContent = message;
      dom.eventColumnDeleteDialog.showModal();
      return;
    }

    showGenericConfirm({
      kicker: "Event Column",
      title,
      message,
      confirmLabel: "Delete",
      danger: true,
      recordHistory: true,
      onConfirm: () => deleteEventColumn(key)
    });
    state.eventColumnDeleteKey = null;
  }

  function getEventColumnByKey(key) {
    return getEventSheetColumns().find((item) => item.key === key)
      || eventSheetColumns.find((item) => item.key === key)
      || getAllCustomEventColumns().find((item) => item.key === key);
  }

  function getAllCustomEventColumns() {
    const columns = [];
    const seen = new Set([...eventSheetColumns.map((column) => column.key), EVENT_ELEMENTS_COLUMN_KEY]);
    getProjectNodeTypes()
      .filter((typeDef) => isEventFrameKind(typeDef.kind))
      .flatMap((typeDef) => typeDef.fields || [])
      .forEach((field) => {
        if (!field?.key || seen.has(field.key)) return;
        seen.add(field.key);
        columns.push({
          key: field.key,
          label: field.label || field.key,
          width: "180px",
          custom: true
        });
      });
    return columns;
  }

  function deleteNodeFieldValue(node, key) {
    if (key === "choices") {
      delete node.choices;
    } else if (isDirectNodeField(key)) {
      delete node[key];
    }
    if (node.customFields && typeof node.customFields === "object" && !Array.isArray(node.customFields)) {
      delete node.customFields[key];
    }
  }

  function resetEventColumns() {
    state.project.eventSheet = normalizeEventSheetConfig(null);
    renderAll();
    setStatus("Events Sheet columns restored.");
  }

  function showResetEventColumnsConfirm() {
    const message = "Reset restores the default Events Sheet columns. It removes column renames, hidden-column settings, column order changes, and custom sheet-only columns. Event Frame nodes are not deleted, and stored field values are not actively cleared; values from removed columns may stop showing until that field or column is added again.";
    if (dom.eventColumnsResetDialog?.showModal) {
      dom.eventColumnsResetDialog.returnValue = "";
      dom.eventColumnsResetDialog.showModal();
      return;
    }
    showGenericConfirm({
      kicker: "Events Sheet",
      title: "Reset sheet columns?",
      message,
      confirmLabel: "Reset columns",
      danger: true,
      recordHistory: true,
      onConfirm: resetEventColumns
    });
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
        <button class="icon-button danger-button" type="button" title="Delete variable" data-action="delete-variable" data-variable-key="${escapeAttr(key)}">x</button>
      </div>
    `;
  }

  function renderPalette() {
    const entries = getNodeTypeEntries();
    const visibleRows = entries.length ? entries
      .map(([type, meta]) => `
        <div class="palette-row">
          <button class="palette-badge" type="button" data-action="edit-node-type-badge" data-node-type="${escapeAttr(type)}" data-icon-size="${getNodeIconSize(meta.badge)}" style="--node-color:${escapeAttr(meta.color)}" title="Edit icon for ${escapeAttr(getNodeTypeLabel(type))}" aria-label="Edit icon for ${escapeAttr(getNodeTypeLabel(type))}">${escapeHtml(meta.badge)}</button>
          <button class="palette-item" data-action="add-node" data-type="${escapeAttr(type)}">
            <span class="palette-label">${escapeHtml(getNodeTypeLabel(type))}</span>
          </button>
          <button class="icon-button palette-settings-button" aria-label="Edit node type" data-action="edit-node-type" data-node-type="${escapeAttr(type)}">...</button>
          <button class="icon-button palette-hide-button" aria-label="Hide node type" data-action="hide-node-type" data-node-type="${escapeAttr(type)}">-</button>
          <button class="icon-button danger-button palette-delete-button" aria-label="Delete node type" data-action="delete-custom-node-type" data-custom-node-type="${escapeAttr(type)}">x</button>
        </div>
      `)
      .join("") : `<div class="custom-node-empty">No visible node types.</div>`;
    dom.palette.innerHTML = `
      <div class="palette-tools">
        <button class="small-button" data-action="restore-default-node-types" type="button">Restore default types</button>
      </div>
      ${renderHiddenNodeTypeSection()}
      ${visibleRows}
    `;
  }

  function renderHiddenNodeTypeSection() {
    const hiddenEntries = getHiddenNodeTypeEntries();
    return `
      <details class="hidden-node-types" ${hiddenEntries.length ? "open" : "data-empty=\"true\""}>
        <summary>
          <span>Hidden</span>
          <span class="hidden-node-count">${hiddenEntries.length}</span>
        </summary>
        <div class="hidden-node-list">
          ${hiddenEntries.length ? hiddenEntries.map(([type, meta]) => `
            <div class="hidden-node-row">
              <span class="palette-badge hidden-node-badge" data-icon-size="${getNodeIconSize(meta.badge)}" style="--node-color:${escapeAttr(meta.color)}">${escapeHtml(meta.badge)}</span>
              <span class="palette-label">${escapeHtml(getNodeTypeLabel(type))}</span>
              <button class="icon-button palette-settings-button" title="Edit node type" data-action="edit-node-type" data-node-type="${escapeAttr(type)}">...</button>
              <button class="small-button restore-node-type-button" title="Restore node type" data-action="restore-node-type" data-node-type="${escapeAttr(type)}">Show</button>
            </div>
          `).join("") : `<div class="custom-node-empty">No hidden node types.</div>`}
        </div>
      </details>
    `;
  }

  function renderTransform() {
    normalizeCanvasViewScroll();
    syncCanvasScrollBounds();
    const transform = `translate(${state.view.x}px, ${state.view.y}px) scale(${state.view.scale})`;
    dom.content.style.transform = "";
    dom.linkLayer.style.transform = transform;
    dom.nodeLayer.style.transform = transform;
    if (dom.marqueeLayer) dom.marqueeLayer.style.transform = transform;
    dom.zoomReadout.textContent = `${Math.round(state.view.scale * 100)}%`;
    updateGridPosition();
  }

  function normalizeCanvasViewScroll() {
    if (!dom.viewport) return;
    let shiftX = 0;
    let shiftY = 0;
    if (state.view.x < CANVAS_VIEW_PADDING) {
      shiftX = CANVAS_VIEW_PADDING - state.view.x;
      state.view.x += shiftX;
    }
    if (state.view.y < CANVAS_VIEW_PADDING) {
      shiftY = CANVAS_VIEW_PADDING - state.view.y;
      state.view.y += shiftY;
    }
    if (shiftX || shiftY) {
      syncCanvasScrollBounds();
      dom.viewport.scrollLeft += shiftX;
      dom.viewport.scrollTop += shiftY;
    }
  }

  function syncCanvasScrollBounds() {
    if (!dom.content) return;
    const viewportWidth = dom.viewport?.clientWidth || 0;
    const viewportHeight = dom.viewport?.clientHeight || 0;
    const scale = Math.max(CANVAS_MIN_ZOOM, state.view.scale || DEFAULT_CANVAS_ZOOM);
    const width = Math.ceil(Math.max(
      viewportWidth + CANVAS_VIEW_PADDING,
      BOARD_WIDTH + CANVAS_VIEW_PADDING * 2,
      state.view.x + BOARD_WIDTH * scale + CANVAS_VIEW_PADDING
    ));
    const height = Math.ceil(Math.max(
      viewportHeight + CANVAS_VIEW_PADDING,
      BOARD_HEIGHT + CANVAS_VIEW_PADDING * 2,
      state.view.y + BOARD_HEIGHT * scale + CANVAS_VIEW_PADDING
    ));
    dom.content.style.width = `${width}px`;
    dom.content.style.height = `${height}px`;
  }

  function renderNodes(renderContext = getCanvasRenderContext()) {
    const query = renderContext.query;
    const focusedCharacterId = getActiveCharacterFocusId();
    dom.nodeLayer.innerHTML = getCanvasRenderNodes(renderContext.visibleNodeIds)
      .map((node) => {
        const meta = getNodeMeta(node.type);
        const isSelected = node.id === state.selectedNodeId;
        const isMultiSelected = state.selectedNodeIds.includes(node.id);
        const isFrame = isFrameNode(node);
        const frameClass = isFrame ? (isEventSheetNode(node) ? "event-frame" : "visual-frame") : "";
        const match = query && nodeMatches(node, query);
        const characterFocusClass = focusedCharacterId
          ? (isNodeRelatedToCharacter(node, focusedCharacterId) ? "character-focus-match" : "character-focus-muted")
          : "";
        const size = nodeLayoutSize(node);
        const width = size.width;
        const height = size.height;
        const icon = getNodeIcon(node);
        const inlineEditField = node.id === state.inlineEditNodeId ? state.inlineEditField : "";
        const inputPortStyle = `left:${node.x - 11}px; top:${node.y + height / 2}px; --node-color:${meta.color};`;
        const outputPortStyle = `left:${node.x + width - 11}px; top:${node.y + height / 2}px; --node-color:${meta.color};`;
        const nodeClasses = [
          "node",
          isFrame ? `frame ${frameClass}` : "",
          isSelected ? "selected" : "",
          isMultiSelected ? "multi-selected" : "",
          characterFocusClass
        ].filter(Boolean).join(" ");
        return `
          <article class="${nodeClasses}" data-node-id="${node.id}" style="left:${node.x}px; top:${node.y}px; width:${width}px; height:${height}px; --node-color:${meta.color}; ${match ? "outline:1px solid var(--accent-orange);" : ""}">
            <div class="node-header" data-drag-handle="true" data-node-id="${node.id}">
              <button class="node-icon" type="button" data-action="edit-node-type-badge" data-node-type="${escapeAttr(node.type)}" data-node-id="${node.id}" data-no-drag="true" data-icon-size="${getNodeIconSize(icon)}" title="Edit ${escapeAttr(getNodeTypeLabel(node.type))} icon" aria-label="Edit icon for all ${escapeAttr(getNodeTypeLabel(node.type))} nodes">${escapeHtml(icon)}</button>
              <span class="node-type">${escapeHtml(getNodeTypeLabel(node.type))}</span>
            <span class="node-id">${escapeHtml(getNodeDisplayId(node))}</span>
            </div>
            <div class="node-body">
              ${renderNodeTitle(node, inlineEditField)}
              ${renderNodeCastChips(node)}
              ${renderNodeText(node, inlineEditField)}
              ${hasNodeChoices(node) ? `<div class="node-meta">${node.choices.length} choices</div>` : ""}
            </div>
            <button class="node-resize-handle right" data-resize-handle="e" data-node-id="${node.id}" title="Resize width" aria-label="Resize width"></button>
            <button class="node-resize-handle bottom" data-resize-handle="s" data-node-id="${node.id}" title="Resize height" aria-label="Resize height"></button>
            <button class="node-resize-handle corner" data-resize-handle="se" data-node-id="${node.id}" title="Resize node" aria-label="Resize node"></button>
          </article>
          <button class="port input" style="${inputPortStyle}" data-port="input" data-node-id="${node.id}" title="Input" aria-label="Input port"></button>
          <button class="port output ${node.id === state.connectingFrom ? "active" : ""}" style="${outputPortStyle}" data-port="output" data-node-id="${node.id}" title="Output" aria-label="Output port"></button>
        `;
      })
      .join("");

    dom.matchCount.textContent = `${renderContext.matchCount} matches`;
  }

  function renderNodeTitle(node, inlineEditField) {
    if (inlineEditField === "title") {
      return `<input class="node-inline-editor node-inline-title" data-inline-node-field="title" data-node-id="${escapeAttr(node.id)}" data-no-drag="true" value="${escapeAttr(getInlineNodeFieldValue(node, "title"))}" aria-label="Edit node title">`;
    }
    return `<div class="node-title">${escapeHtml(getNodeDisplayTitle(node, "Untitled"))}</div>`;
  }

  function renderNodeText(node, inlineEditField) {
    if (inlineEditField && inlineEditField !== "title") {
      return `<textarea class="node-inline-editor node-inline-text" data-inline-node-field="${escapeAttr(inlineEditField)}" data-node-id="${escapeAttr(node.id)}" data-no-drag="true" aria-label="Edit node content">${escapeHtml(getInlineNodeFieldValue(node, inlineEditField))}</textarea>`;
    }
    return `<div class="node-text">${escapeHtml(displayBody(node))}</div>`;
  }

  function getInlineEditableField(node) {
    if (!node) return "body";
    if (node.type === "Condition" || hasNodeCondition(node)) return "condition";
    if (node.type === "Set" || getNodeVariableKey(node)) return "value";
    return "body";
  }

  function getActiveInlineEditField(node) {
    return node?.id && node.id === state.inlineEditNodeId ? state.inlineEditField : "";
  }

  function getInlineNodeFieldValue(node, field) {
    if (!INLINE_NODE_FIELD_KEYS.has(field)) return "";
    const value = node?.[field];
    return value == null ? "" : String(value);
  }

  function minInlineNodeEditHeight(field) {
    return field === "title" ? 112 : 154;
  }

  function setInlineNodeField(nodeId, field, value) {
    if (!INLINE_NODE_FIELD_KEYS.has(field)) return;
    const node = getNode(nodeId);
    if (!node) return;
    invalidateCharacterRenderContext();
    node[field] = value;
    state.selectedNodeId = nodeId;
    state.selectedNodeIds = [];
    state.selectedLinkId = null;
    state.panel = "node";
    setProjectDirty(true);
    renderNodePanel(node);
    scheduleStoryPanelRender();
    updateStatus();
  }

  function finishInlineNodeEdit(nodeId = state.inlineEditNodeId) {
    if (!state.inlineEditNodeId && !state.inlineEditField) return;
    state.inlineEditNodeId = null;
    state.inlineEditField = null;
    state.inlineEditPointerNodeId = null;
    renderNodes();
    renderLinks();
    markCanvasSurfaceRenderedIfActive();
    const node = getNode(nodeId);
    if (node && state.panel === "node") renderNodePanel(node);
    scheduleStoryPanelRender();
    updateStatus();
  }

  function focusInlineNodeEditor(nodeId) {
    const editor = getNodeElementById(nodeId)?.querySelector("[data-inline-node-field]");
    if (!editor) return false;
    try {
      editor.focus({ preventScroll: true });
    } catch (error) {
      editor.focus();
    }
    if (typeof editor.setSelectionRange === "function") {
      const position = editor.value.length;
      editor.setSelectionRange(position, position);
    }
    return true;
  }

  function getCanvasNodeIdFromTarget(target) {
    return target?.closest?.(".node[data-node-id]")?.dataset?.nodeId || "";
  }

  function rememberInlineEditPointerTarget(target) {
    if (!state.inlineEditNodeId) {
      state.inlineEditPointerNodeId = null;
      return;
    }
    const nodeId = getCanvasNodeIdFromTarget(target);
    state.inlineEditPointerNodeId = nodeId;
    window.requestAnimationFrame(() => {
      if (state.inlineEditPointerNodeId === nodeId) state.inlineEditPointerNodeId = null;
    });
  }

  function isActiveInlineEditNodeTarget(target) {
    return Boolean(state.inlineEditNodeId && getCanvasNodeIdFromTarget(target) === state.inlineEditNodeId);
  }

  function shouldKeepInlineNodeEditForTarget(target) {
    return isActiveInlineEditNodeTarget(target) && !isCanvasNodeInlineEditBlockedTarget(target);
  }

  function shouldKeepInlineNodeEditOnFocusOut(nodeId, relatedTarget) {
    if (!nodeId || nodeId !== state.inlineEditNodeId) return false;
    if (relatedTarget && getCanvasNodeIdFromTarget(relatedTarget) === nodeId) return true;
    return state.inlineEditPointerNodeId === nodeId;
  }

  function getCanvasRenderContext(query = state.search.trim().toLowerCase()) {
    return {
      query,
      visibleNodeIds: getCanvasVisibleNodeIds(query),
      nodeMap: getNodeIndex(),
      matchCount: query ? state.project.nodes.filter((node) => nodeMatches(node, query)).length : 0
    };
  }

  function scheduleCanvasViewportRender() {
    if (!isCanvasFileActive() || state.canvasViewportRenderFrame) return;
    state.canvasViewportRenderFrame = window.requestAnimationFrame(() => {
      state.canvasViewportRenderFrame = null;
      const canvasRenderContext = getCanvasRenderContext();
      renderNodes(canvasRenderContext);
      renderLinks(canvasRenderContext);
      markCanvasSurfaceRendered();
    });
  }

  function getCanvasViewportBounds(padding = CANVAS_RENDER_PADDING) {
    if (!dom.viewport) {
      return {
        left: -padding,
        top: -padding,
        right: BOARD_WIDTH + padding,
        bottom: BOARD_HEIGHT + padding
      };
    }
    const scale = Math.max(CANVAS_MIN_ZOOM, state.view.scale || DEFAULT_CANVAS_ZOOM);
    const left = (dom.viewport.scrollLeft - state.view.x) / scale - padding;
    const top = (dom.viewport.scrollTop - state.view.y) / scale - padding;
    const width = (dom.viewport.clientWidth || 0) / scale + padding * 2;
    const height = (dom.viewport.clientHeight || 0) / scale + padding * 2;
    return {
      left,
      top,
      right: left + width,
      bottom: top + height
    };
  }

  function shouldForceCanvasNodeRender(node, query) {
    if (!node) return false;
    if (node.id === state.selectedNodeId || state.selectedNodeIds.includes(node.id)) return true;
    if (node.id === state.connectingFrom || node.id === state.contextNodeId) return true;
    if (query && nodeMatches(node, query)) return true;
    return false;
  }

  function boundsIntersect(a, b) {
    return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
  }

  function getCanvasVisibleNodeIds(query = state.search.trim().toLowerCase()) {
    const bounds = getCanvasViewportBounds();
    const ids = new Set();
    state.project.nodes.forEach((node) => {
      if (shouldForceCanvasNodeRender(node, query) || boundsIntersect(getNodeBounds(node), bounds)) {
        ids.add(node.id);
      }
    });
    return ids;
  }

  function getNodeTypeLabel(type) {
    const meta = getNodeMeta(type);
    if (meta.label) return meta.label;
    return type === "Event" ? "Event Frame" : type;
  }

  function getNodeDisplayTitle(node, fallback = "Untitled") {
    const title = node?.title || fallback;
    if (!node || !isEventSheetNode(node)) return title;
    const prefix = getEventFrameTitlePrefix(node);
    return prefix ? `${prefix} ${title}` : title;
  }

  function getEventFrameTitlePrefix(node) {
    if (!isEventSheetNode(node)) return "";
    const act = String(node.act || "").trim();
    const chapter = String(node.chapter || "").trim();
    const parts = [];
    if (act) parts.push(`Act ${act}`);
    if (chapter) parts.push(`Ch. ${chapter}`);
    return parts.length ? `${parts.join(" - ")} - ` : "";
  }

  function getNodeMeta(type) {
    return getNodeTypeMap()[type] || getFallbackNodeMeta(type);
  }

  function getNodeTypeMap() {
    const types = getProjectNodeTypes();
    const cache = state.derived.nodeTypeMap;
    if (cache && cache.source === types) return cache.value;
    const map = {};
    types.forEach((typeDef) => {
      map[typeDef.type] = {
        badge: typeDef.badge,
        color: typeDef.color,
        width: typeDef.width,
        label: typeDef.label,
        custom: Boolean(typeDef.custom),
        kind: typeDef.kind,
        fields: typeDef.fields || [],
        hidden: Boolean(typeDef.hidden)
      };
    });
    state.derived.nodeTypeMap = { source: types, value: map };
    return map;
  }

  function getFallbackNodeMeta(type) {
    const builtIn = nodeTypes[type];
    if (builtIn) {
      return { ...builtIn, label: getDefaultNodeTypeLabel(type), kind: type === "Event" ? "eventFrame" : "node", fields: [], hidden: false };
    }
    return { ...FALLBACK_NODE_META, label: type || FALLBACK_NODE_META.label, kind: "node", fields: [], hidden: false };
  }

  function defaultNodeTypeList() {
    return Object.entries(nodeTypes).map(([type, meta]) => ({
      type,
      label: getDefaultNodeTypeLabel(type),
      badge: getDefaultNodeTypeBadge(getDefaultNodeTypeLabel(type)),
      color: meta.color,
      width: meta.width,
      custom: false,
      kind: type === "Event" ? "eventFrame" : "node",
      fields: [],
      hidden: false
    }));
  }

  function getDefaultNodeTypeLabel(type) {
    return type === "Event" ? "Event Frame" : type;
  }

  function getNodeTypeEntries(includeType = null) {
    const entries = getProjectNodeTypes()
      .filter((typeDef) => !typeDef.hidden || typeDef.type === includeType)
      .map((typeDef) => [typeDef.type, {
        badge: typeDef.badge,
        color: typeDef.color,
        width: typeDef.width,
        label: typeDef.label,
        custom: Boolean(typeDef.custom),
        kind: typeDef.kind,
        fields: typeDef.fields || [],
        hidden: Boolean(typeDef.hidden)
      }]);
    if (includeType && !entries.some(([type]) => type === includeType)) {
      entries.push([includeType, { ...getNodeMeta(includeType), removed: true }]);
    }
    return entries;
  }

  function getHiddenNodeTypeEntries() {
    return getProjectNodeTypes()
      .filter((typeDef) => typeDef.hidden)
      .map((typeDef) => [typeDef.type, {
        badge: typeDef.badge,
        color: typeDef.color,
        width: typeDef.width,
        label: typeDef.label,
        custom: Boolean(typeDef.custom),
        kind: typeDef.kind,
        fields: typeDef.fields || [],
        hidden: true
      }]);
  }

  function getNodeTypeDef(type) {
    if (!type) return null;
    return getProjectNodeTypes().find((typeDef) => typeDef.type === type) || null;
  }

  function renderLinks(renderContext = getCanvasRenderContext()) {
    const visibleNodeIds = renderContext.visibleNodeIds;
    const nodeMap = renderContext.nodeMap;
    const linkSvg = [
      `<defs>
        <marker id="arrow-head" viewBox="0 0 8 8" refX="7.5" refY="4" markerWidth="5" markerHeight="5" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
          <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--link-color)"></path>
        </marker>
      </defs>`
    ];

    state.project.links.forEach((link) => {
      if (link.id !== state.selectedLinkId && !visibleNodeIds.has(link.from) && !visibleNodeIds.has(link.to)) return;
      const from = nodeMap.get(link.from);
      const to = nodeMap.get(link.to);
      if (!from || !to) return;
      const path = linkPath(getOutputPoint(from), getInputPoint(to));
      linkSvg.push(`<path class="link-hitpath" d="${path}" data-link-id="${link.id}"></path>`);
      linkSvg.push(`<path class="link-path ${link.id === state.selectedLinkId ? "selected" : ""}" d="${path}" marker-end="url(#arrow-head)" data-link-id="${link.id}"></path>`);
      if (link.label) {
        const mid = midpoint(getOutputPoint(from), getInputPoint(to));
        linkSvg.push(`<text class="link-label" x="${mid.x}" y="${mid.y - 8}" font-size="12" text-anchor="middle" data-link-id="${escapeAttr(link.id)}">${escapeHtml(link.label)}</text>`);
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
  }

  function renderInspectorTabs() {
    dom.scope.querySelectorAll(".inspector-tab").forEach((button) => {
      button.disabled = false;
      button.removeAttribute("aria-disabled");
      button.classList.toggle("active", button.dataset.panel === state.panel);
    });
    dom.scope.querySelectorAll(".inspector-panel").forEach((panel) => {
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
        <label class="field">
          <span>Project notes</span>
          <textarea data-project-field="notes" spellcheck="false" placeholder="Project notes">${escapeHtml(state.project.notes || "")}</textarea>
        </label>
        <div class="stat-grid">
          <div class="stat-card"><div class="stat-label">Nodes</div><div class="stat-value">${nodeCount}</div></div>
          <div class="stat-card"><div class="stat-label">Links</div><div class="stat-value">${links}</div></div>
          <div class="stat-card"><div class="stat-label">Variables</div><div class="stat-value">${variableCount}</div></div>
          <div class="stat-card"><div class="stat-label">Zoom</div><div class="stat-value">${Math.round(state.view.scale * 100)}%</div></div>
        </div>
        <div class="button-row">
          <button class="small-button" data-action="export-all">Export all</button>
        </div>
      </div>
    `;
  }

  function renderNodePanel(node) {
    dom.nodePanel.classList.remove("is-empty");
    if (!node) {
      dom.nodePanel.replaceChildren();
      return;
    }
    dom.nodePanel.innerHTML = `
      <div class="form-stack">
        <label class="field">
          <span>Type</span>
          <select data-node-field="type">
            ${getNodeTypeEntries(node.type).map(([type, meta]) => `<option value="${escapeAttr(type)}" ${node.type === type ? "selected" : ""}>${escapeHtml(getNodeTypeLabel(type))}${meta.hidden ? " (hidden)" : ""}${meta.removed ? " (removed)" : ""}</option>`).join("")}
          </select>
        </label>
        <label class="field">
          <span>${escapeHtml(getNodeTitleLabel(node))}</span>
          <input data-node-field="title" value="${escapeAttr(node.title || "")}">
        </label>
        ${renderNodeBodyField(node)}
        ${isEventSheetNode(node) ? "" : renderNodeCastFields(node)}
        ${renderTypeFields(node)}
        ${renderCustomFields(node)}
        ${isEventSheetNode(node) ? renderEventFields(node) : ""}
        <div class="button-row">
          <button class="small-button" data-action="duplicate-node">Duplicate</button>
          <button class="small-button danger-button" data-action="delete-node">Delete node</button>
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

  function renderNodeCastFields(node) {
    const characters = getCharacters();
    const cast = normalizeNodeCast(node.cast);
    const autoLinks = getNodeCharacterLinks(node, { includeCast: false, includeEventAggregate: false });
    if (!characters.length) {
      return `
        <section class="cast-editor">
          <div class="cast-editor-header">
            <h3>Cast</h3>
            <span>No characters yet</span>
          </div>
          <button class="small-button" data-action="add-character">Add character</button>
        </section>
      `;
    }
    return `
      <section class="cast-editor">
        <div class="cast-editor-header">
          <h3>Cast</h3>
          <span>${cast.length} manual, ${autoLinks.length} auto</span>
        </div>
        <div class="cast-row-list">
          ${cast.map((entry, index) => renderNodeCastRow(entry, index)).join("") || `<div class="cast-empty">No manual cast links.</div>`}
        </div>
        <div class="cast-add-row">
          <select data-new-cast-character>
            ${renderCastCharacterOptions("", { placeholder: "Select character…" })}
          </select>
          <select data-new-cast-role>
            ${renderCastRelationOptions("Present")}
          </select>
          <button class="small-button" data-action="add-node-cast">Add</button>
        </div>
        ${autoLinks.length ? `
          <div class="cast-auto-row">
            <span>Auto references</span>
            <div class="cast-auto-chips">
              ${autoLinks.map((link) => renderCastChip(link)).join("")}
            </div>
          </div>
        ` : ""}
      </section>
    `;
  }

  function renderNodeCastRow(entry, index) {
    return `
      <div class="cast-row">
        <select data-node-cast-index="${index}" data-node-cast-field="characterId">
          ${renderCastCharacterOptions(entry.characterId)}
        </select>
        <select data-node-cast-index="${index}" data-node-cast-field="role">
          ${renderCastRelationOptions(entry.role)}
        </select>
        <button class="icon-button danger-button" title="Remove cast link" data-action="delete-node-cast" data-node-cast-index="${index}">x</button>
      </div>
    `;
  }

  function renderCastCharacterOptions(selectedId, options = {}) {
    const placeholder = options.placeholder
      ? `<option value="" ${selectedId ? "" : "selected"}>${escapeHtml(options.placeholder)}</option>`
      : "";
    return placeholder + getCharacters().map((character) => `
      <option value="${escapeAttr(character.id)}" ${character.id === selectedId ? "selected" : ""}>${escapeHtml(character.name || "Unnamed Character")}</option>
    `).join("");
  }

  function renderCastRelationOptions(selectedRole) {
    const role = normalizeCastRole(selectedRole);
    return CAST_RELATIONS.map((relation) => `
      <option value="${escapeAttr(relation)}" ${relation === role ? "selected" : ""}>${escapeHtml(CAST_RELATION_LABELS[relation])}</option>
    `).join("");
  }

  function renderNodeCastChips(node) {
    const links = getNodeCharacterLinks(node, { includeEventAggregate: isEventSheetNode(node) });
    if (!links.length) return "";
    const visible = links.slice(0, 3);
    const hiddenCount = links.length - visible.length;
    return `
      <div class="node-cast-chips">
        ${visible.map((link) => renderCastChip(link)).join("")}
        ${hiddenCount > 0 ? `<span class="node-cast-chip more">+${hiddenCount}</span>` : ""}
      </div>
    `;
  }

  function renderCastChip(link) {
    const characterName = link.character?.name || getCharacterName(link.characterId) || "Character";
    const role = CAST_RELATION_LABELS[normalizeCastRole(link.role)] || "Present";
    return `<span class="node-cast-chip" title="${escapeAttr(characterName)} · ${escapeAttr(role)}">${escapeHtml(characterName)} · ${escapeHtml(role)}</span>`;
  }

  function renderEventFields(node) {
    const columns = getProjectEventSheetColumns().filter(
      (column) => !column.readonly && !column.custom && column.key !== "characterEncountered"
    );
    if (!columns.length) return "";
    return `
      <section class="event-fields">
        <h3>Event Sheet</h3>
        ${columns.map((column) => renderEventInspectorField(node, column)).join("")}
      </section>
    `;
  }

  function renderEventInspectorField(node, column) {
    const value = getNodeEventValue(node, column.key);
    const control = isMultilineEventField(column.key)
      ? `<textarea data-node-field="${escapeAttr(column.key)}">${escapeHtml(value)}</textarea>`
      : `<input data-node-field="${escapeAttr(column.key)}" value="${escapeAttr(value)}">`;
    return `
      <label class="field">
        <span>${escapeHtml(column.label)}</span>
        ${control}
      </label>
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
          <input data-node-field="condition" value="${escapeAttr(node.condition || "")}" placeholder="trust == high">
        </label>
      `;
    }
    return "";
  }

  function renderCustomFields(node) {
    const fields = getNodeMeta(node.type).fields || [];
    if (!fields.length) return "";
    return `
      ${fields.map((field) => `
        <label class="field">
          <span>${escapeHtml(field.label)}</span>
          ${renderNodeCustomFieldControl(node, field)}
        </label>
      `).join("")}
    `;
  }

  function renderNodeCustomFieldControl(node, field) {
    const value = getNodeCustomFieldValue(node, field.key);
    if (field.key === "choices") {
      return `<textarea data-node-custom-field="${escapeAttr(field.key)}">${escapeHtml(value)}</textarea>`;
    }
    return `<input data-node-custom-field="${escapeAttr(field.key)}" value="${escapeAttr(value)}">`;
  }

  function renderStoryPanel() {
    const structure = getStoryStructure();
    const sequenceMap = getStorySequenceMap(structure);
    const playPages = getPreviewPath().length;
    const frameCount = countStoryFrames(structure);
    dom.storyPanel.innerHTML = `
      <div class="story-panel-header">
        <div class="document-meta">${playPages} play pages, ${frameCount} frames</div>
        <div class="story-panel-actions">
          <button class="small-button" data-action="reset-story-order" title="Clear manual drag order and re-sort by the canvas flow">Re-sort by graph</button>
          <button class="small-button" data-action="play">Run</button>
        </div>
      </div>
      ${renderStoryList(structure, "", 0, sequenceMap)}
    `;
  }

  function renderStoryList(entries, parentId, depth, sequenceMap) {
    const listClass = depth ? "story-list story-nested-list" : "story-list story-root-list";
    return `
      <div class="${listClass}" data-story-parent-id="${escapeAttr(parentId)}">
        ${entries.length
          ? entries.map((entry) => renderStoryEntry(entry, parentId, depth, sequenceMap)).join("")
          : (depth ? `<div class="story-empty-drop">Drop nodes here</div>` : `<div class="nc-empty-state">No entry path found.</div>`)}
      </div>
    `;
  }

  function renderStoryEntry(entry, parentId, depth, sequenceMap) {
    const node = entry.node;
    const isSelected = node.id === state.selectedNodeId;
    const meta = getNodeMeta(node.type);
    const label = getNodeTypeLabel(node.type);
    const sequence = sequenceMap.get(node.id) || "";
    const focusedCharacterId = getActiveCharacterFocusId();
    const characterFocusClass = focusedCharacterId
      ? (isNodeRelatedToCharacter(node, focusedCharacterId) ? "character-focus-match" : "character-focus-muted")
      : "";
    const storyClasses = [
      "story-item",
      isFrameNode(node) ? "story-frame-item" : "",
      isEventSheetNode(node) ? "story-event-frame-item" : "",
      isSelected ? "selected" : "",
      characterFocusClass
    ].filter(Boolean).join(" ");
    const itemMarkup = `
      <div class="${storyClasses}"
        data-story-node-id="${escapeAttr(node.id)}"
        data-story-parent-id="${escapeAttr(parentId)}"
        style="--node-color:${escapeAttr(meta.color)}">
        <span class="story-drag-handle" aria-hidden="true">::</span>
        <div class="story-item-main">
          <span class="story-item-title">${escapeHtml(formatStoryIndex(sequence))} ${escapeHtml(getNodeDisplayTitle(node, label))}</span>
          <span class="story-item-meta">${escapeHtml(label)} ${escapeHtml(getNodeDisplayId(node))}${entry.children.length ? ` - ${entry.children.length} inside` : ""}</span>
        </div>
        <button class="story-focus-button" data-action="focus-canvas-node" data-node-id="${escapeAttr(node.id)}">Focus</button>
      </div>
    `;

    if (!isFrameNode(node)) return `<article class="story-entry" data-story-entry-id="${escapeAttr(node.id)}">${itemMarkup}</article>`;

    return `
      <details class="story-frame" data-story-entry-id="${escapeAttr(node.id)}" open>
        <summary>${itemMarkup}</summary>
        ${renderStoryList(entry.children, node.id, depth + 1, sequenceMap)}
      </details>
    `;
  }

  function getStorySequenceMap(entries) {
    const sequenceMap = new Map();
    let index = 1;
    const walk = (items) => {
      items.forEach((entry) => {
        sequenceMap.set(entry.node.id, index);
        index += 1;
        walk(entry.children);
      });
    };
    walk(entries);
    return sequenceMap;
  }

  function countStoryFrames(entries) {
    return entries.reduce((total, entry) => total
      + (isFrameNode(entry.node) ? 1 : 0)
      + countStoryFrames(entry.children), 0);
  }

  function formatStoryIndex(sequence) {
    return sequence ? `${sequence}.` : "";
  }

  function renderMinimap() {
    dom.minimap.innerHTML = state.project.nodes
      .map((node) => {
        const meta = getNodeMeta(node.type);
        const x = Math.max(2, Math.min(164, node.x / BOARD_WIDTH * 180));
        const y = Math.max(2, Math.min(106, node.y / BOARD_HEIGHT * 118));
        return `<span class="minimap-node" data-minimap-node-id="${escapeAttr(node.id)}" style="left:${x}px; top:${y}px; --node-color:${meta.color}"></span>`;
      })
      .join("");
  }

  // --- Incremental canvas updates -------------------------------------------------
  // Drag/resize/edit interactions update only the affected node element and its
  // incident link paths in place, instead of rebuilding the entire node/link/minimap
  // layers every pointer frame. A full resync runs once when the interaction ends.

  function getNodeElementById(id) {
    if (!dom.nodeLayer || !id) return null;
    return dom.nodeLayer.querySelector(`.node[data-node-id="${id}"]`);
  }

  function getNodePortElementsById(id) {
    if (!dom.nodeLayer || !id) return null;
    const safeId = CSS.escape(id);
    return {
      input: dom.nodeLayer.querySelector(`.port.input[data-node-id="${safeId}"]`),
      output: dom.nodeLayer.querySelector(`.port.output[data-node-id="${safeId}"]`)
    };
  }

  function patchNodePortGeometry(node, ports = getNodePortElementsById(node.id)) {
    if (!ports) return false;
    const size = nodeLayoutSize(node);
    const top = `${node.y + size.height / 2}px`;
    if (ports.input) {
      ports.input.style.left = `${node.x - 11}px`;
      ports.input.style.top = top;
    }
    if (ports.output) {
      ports.output.style.left = `${node.x + size.width - 11}px`;
      ports.output.style.top = top;
    }
    return Boolean(ports.input || ports.output);
  }

  function patchNodeElementGeometry(node, element = getNodeElementById(node.id), ports = getNodePortElementsById(node.id)) {
    if (!element) return false;
    const size = nodeLayoutSize(node);
    element.style.left = `${node.x}px`;
    element.style.top = `${node.y}px`;
    element.style.width = `${size.width}px`;
    element.style.height = `${size.height}px`;
    patchNodePortGeometry(node, ports);
    return true;
  }

  function getIncidentLinks(nodeId) {
    return state.project.links.filter((link) => link.from === nodeId || link.to === nodeId);
  }

  // Cache the DOM elements (paths + optional label) for a set of links so per-frame
  // updates don't re-query the SVG. Links incident to a visible node are themselves
  // rendered, so their elements exist.
  function collectLinkElementRefs(links) {
    if (!dom.linkLayer) return [];
    return links
      .map((link) => ({ link, els: [...dom.linkLayer.querySelectorAll(`[data-link-id="${link.id}"]`)] }))
      .filter((ref) => ref.els.length);
  }

  function patchLinkElementRefs(refs) {
    if (!refs || !refs.length) return;
    const nodeMap = getNodeIndex();
    refs.forEach(({ link, els }) => {
      const from = nodeMap.get(link.from);
      const to = nodeMap.get(link.to);
      if (!from || !to) return;
      const a = getOutputPoint(from);
      const b = getInputPoint(to);
      const d = linkPath(a, b);
      const mid = midpoint(a, b);
      els.forEach((el) => {
        if (el.tagName && el.tagName.toLowerCase() === "text") {
          el.setAttribute("x", mid.x);
          el.setAttribute("y", mid.y - 8);
        } else {
          el.setAttribute("d", d);
        }
      });
    });
  }

  function patchMinimapNode(node) {
    if (!node || !dom.minimap) return false;
    const element = dom.minimap.querySelector(`[data-minimap-node-id="${node.id}"]`);
    if (!element) return false;
    element.style.left = `${Math.max(2, Math.min(164, node.x / BOARD_WIDTH * 180))}px`;
    element.style.top = `${Math.max(2, Math.min(106, node.y / BOARD_HEIGHT * 118))}px`;
    return true;
  }

  function syncNodePanelGeometryFields(node) {
    if (!node || state.panel !== "node" || state.selectedNodeId !== node.id) return;
    const xInput = dom.nodePanel?.querySelector("[data-node-field='x']");
    const yInput = dom.nodePanel?.querySelector("[data-node-field='y']");
    if (xInput) xInput.value = String(Math.round(node.x));
    if (yInput) yInput.value = String(Math.round(node.y));
  }

  // Drag/resize already patched the moving node and incident links during the
  // gesture. On release, refresh visible canvas DOM and only the affected minimap
  // marker/geometry fields; rebuilding the Story panel is expensive on huge graphs.
  function resyncCanvasAfterInteraction(nodeId = null) {
    if (!isCanvasFileActive()) return;
    const node = getNode(nodeId);
    if (node) {
      if (!patchMinimapNode(node)) renderMinimap();
      syncNodePanelGeometryFields(node);
      return;
    }
    const context = getCanvasRenderContext();
    renderNodes(context);
    renderLinks(context);
    renderMinimap();
  }

  function scheduleStoryPanelRender() {
    if (state.storyPanelRenderTimer) return;
    state.storyPanelRenderTimer = window.setTimeout(() => {
      state.storyPanelRenderTimer = null;
      if (initialized && dom.storyPanel) renderStoryPanel();
    }, 120);
  }

  function handleDocumentClickCapture(event) {
    if (event.__narrativeCanvasClickHandled) return;
    if (!isNarrativeCanvasClickDelegateTarget(event.target)) return;
    syncDomScopeForEventTarget(event.target);
    if (handleDocumentClickEvent(event)) {
      event.__narrativeCanvasClickHandled = true;
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    }
  }

  function handleDocumentClick(event) {
    if (event.__narrativeCanvasClickHandled) return;
    handleDocumentClickEvent(event);
  }

  function handleDocumentClickEvent(event) {
    if (!isNarrativeCanvasTarget(event.target)) return;

    const mentionOption = event.target.closest("[data-mention-index]");
    if (mentionOption && state.mention) {
      const index = Number(mentionOption.dataset.mentionIndex);
      const character = state.mention.characters[index];
      if (character) {
        insertMention(character);
        event.preventDefault();
        return true;
      }
    }
    if (state.mention && !dom.mentionPopover?.contains(event.target) && event.target !== state.mention.target) {
      hideMentionPopover();
    }
    if (getFormControlTarget(event.target)) return false;

    const layerTarget = event.target.closest("[data-layer-action]");
    const sidebarToggle = event.target.closest("[data-sidebar-toggle]");
    const actionTarget = event.target.closest("[data-action]");
    const fileTarget = event.target.closest("[data-file-id]");
    const panelTarget = event.target.closest("[data-panel]");
    const port = event.target.closest("[data-port]");
    const link = event.target.closest("[data-link-id]");
    const node = event.target.closest("[data-node-id]");
    const canvasNode = event.target.closest(".node[data-node-id]");

    if (shouldKeepInlineNodeEditForTarget(event.target)) {
      state.lastNodeClick = { id: null, time: 0 };
      event.preventDefault();
      requestAnimationFrame(() => focusInlineNodeEditor(state.inlineEditNodeId));
      return true;
    }

    if (layerTarget) {
      if (state.contextGroup) {
        moveContextSelection(layerTarget.dataset.layerAction);
      } else {
        moveContextNode(layerTarget.dataset.layerAction);
      }
      return true;
    }

    if (sidebarToggle && dom.root?.contains(sidebarToggle)) {
      toggleSidebar(sidebarToggle.dataset.sidebarToggle);
      return true;
    }

    const insideContextMenu = Boolean(dom.nodeContextMenu?.contains(event.target));
    if (!insideContextMenu) {
      hideNodeContextMenu();
    } else if (actionTarget) {
      event.preventDefault();
      handleAction(actionTarget);
      hideNodeContextMenu();
      return true;
    }

    if (port) {
      handlePortClick(port);
      event.stopPropagation();
      return true;
    }

    if (link) {
      state.selectedLinkId = link.dataset.linkId;
      clearNodeSelection();
      renderAll();
      return true;
    }

    if (panelTarget) {
      if (panelTarget.dataset.panel === "node") {
        openNodeInspector();
        return true;
      }
      state.panel = panelTarget.dataset.panel;
      renderInspector();
      return true;
    }

    if (fileTarget) {
      selectFile(fileTarget.dataset.fileId);
      return true;
    }

    if (actionTarget) {
      event.preventDefault();
      handleAction(actionTarget);
      return true;
    }

    if (canvasNode && isCanvasNodeInlineEditClick(canvasNode.dataset.nodeId, event)) {
      focusCanvasNodeForInlineEdit(canvasNode.dataset.nodeId);
      event.preventDefault();
      return true;
    }

    if (node) {
      focusCanvasNode(node.dataset.nodeId);
      return true;
    } else {
      state.lastNodeClick = { id: null, time: 0 };
    }
    return false;
  }

  function isCanvasNodeInlineEditClick(nodeId, event) {
    if (!nodeId || isCanvasNodeInlineEditBlockedTarget(event.target)) return false;
    const now = event.timeStamp || performance.now();
    const last = state.lastNodeClick || { id: null, time: 0 };
    const isRepeatClick = last.id === nodeId && now - last.time <= NODE_INLINE_EDIT_CLICK_INTERVAL_MS;
    state.lastNodeClick = isRepeatClick ? { id: null, time: 0 } : { id: nodeId, time: now };
    return isRepeatClick;
  }

  function isCanvasNodeInlineEditBlockedTarget(target) {
    return Boolean(target?.closest?.("[data-port], [data-resize-handle], [data-action], button, input, textarea, select, [contenteditable='true']"));
  }

  function getFormControlTarget(target) {
    const control = target?.closest?.("input, textarea, select, [contenteditable='true']");
    return control && dom.root?.contains(control) ? control : null;
  }

  function handleFormControlPointerEvent(event) {
    const control = getFormControlTarget(event.target);
    if (!control) return;
    event.stopPropagation();
    if (typeof control.focus === "function") {
      requestAnimationFrame(() => {
        if (document.activeElement !== control) control.focus({ preventScroll: true });
      });
    }
  }

  function handleFormControlClickEvent(event) {
    if (!getFormControlTarget(event.target)) return;
    event.stopPropagation();
  }

  function handleGlobalMenuDismiss(event) {
    if (!isNodeContextMenuOpen()) return;
    if (dom.nodeContextMenu.contains(event.target)) return;
    hideNodeContextMenu();
  }

  function handleGlobalMenuKeyDown(event) {
    if (event.key !== "Escape" || !isNodeContextMenuOpen()) return;
    hideNodeContextMenu();
  }

  function handleGlobalAppPointerContext(event) {
    state.lastAppInteractionAt = isNarrativeCanvasTarget(event.target) ? performance.now() : 0;
  }

  function handleGlobalAppFocusContext(event) {
    if (!isNarrativeCanvasTarget(event.target)) return;
    state.lastAppInteractionAt = performance.now();
  }

  function handleGlobalHistoryKeyDown(event) {
    handleHistoryShortcutEvent(event);
  }

  function handleHistoryShortcutEvent(event) {
    if (event.defaultPrevented || !isHistoryShortcut(event)) return false;
    if (!isNarrativeCanvasShortcutContext(event.target)) return false;
    const editTarget = getNativeEditingTarget(event.target) || getNativeEditingTarget(document.activeElement);
    if (editTarget && shouldPreserveNativeHistoryShortcut(editTarget)) return false;
    return applyHistoryShortcut(event);
  }

  function isHistoryShortcut(event) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return false;
    const key = String(event.key || "").toLowerCase();
    return key === "z" || key === "y";
  }

  function applyHistoryShortcut(event) {
    event.preventDefault();
    event.stopPropagation();
    const key = String(event.key || "").toLowerCase();
    if (key === "y" || event.shiftKey) redoHistory();
    else undoHistory();
    return true;
  }

  function isNativeEditingTarget(target) {
    return Boolean(getNativeEditingTarget(target));
  }

  function getNativeEditingTarget(target) {
    return target?.closest?.("input, textarea, select, [contenteditable='true']") || null;
  }

  function shouldPreserveNativeHistoryShortcut(target) {
    if (!isNarrativeCanvasTarget(target)) return true;
    if (target.matches?.("select")) return false;
    const key = getEditableHistoryKey(target);
    if (!key) return true;
    if (!state.editHistoryTarget || state.editHistoryTarget.key !== key) return false;
    return getHistorySnapshot() !== state.editHistoryTarget.snapshot;
  }

  function isNarrativeCanvasShortcutContext(target) {
    if (isNarrativeCanvasTarget(target)) return true;
    if (isNarrativeCanvasTarget(document.activeElement)) return true;
    return Boolean(state.lastAppInteractionAt && performance.now() - state.lastAppInteractionAt <= APP_SHORTCUT_CONTEXT_MS);
  }

  function isNodeContextMenuOpen() {
    return Boolean(dom.nodeContextMenu && !dom.nodeContextMenu.hidden);
  }

  function handleNodeContextMenuPointerDown(event) {
    if (handleNodeContextMenuCommand(event)) return;
    event.stopPropagation();
  }

  function handleNodeContextMenuClick(event) {
    if (handleNodeContextMenuCommand(event)) return;
    event.stopPropagation();
  }

  function handleNodeContextMenuCommand(event) {
    if (!dom.nodeContextMenu || dom.nodeContextMenu.hidden || !dom.nodeContextMenu.contains(event.target)) return false;
    const layerTarget = event.target.closest("[data-layer-action]");
    const actionTarget = event.target.closest("[data-action]");
    if (!layerTarget && !actionTarget) return false;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();

    if (layerTarget) {
      if (state.contextGroup) {
        moveContextSelection(layerTarget.dataset.layerAction);
      } else {
        moveContextNode(layerTarget.dataset.layerAction);
      }
      hideNodeContextMenu();
      return true;
    }

    try {
      handleAction(actionTarget);
    } finally {
      hideNodeContextMenu();
    }
    return true;
  }

  function handleContextMenu(event) {
    if (!isNarrativeCanvasTarget(event.target)) return;
    const linkElement = event.target.closest("[data-link-id]");
    if (linkElement) {
      event.preventDefault();
      const link = getLink(linkElement.dataset.linkId);
      if (!link) return;
      openLinkContextMenu(link, event.clientX, event.clientY);
      return;
    }

    const nodeElement = event.target.closest(".node[data-node-id]");
    if (!nodeElement) {
      const nearestLink = getNearestLinkAtClientPoint(event.clientX, event.clientY);
      if (nearestLink) {
        event.preventDefault();
        openLinkContextMenu(nearestLink, event.clientX, event.clientY);
        return;
      }
    }

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

  function openLinkContextMenu(link, clientX, clientY) {
    state.activeFileId = "adventure";
    state.selectedLinkId = link.id;
    clearNodeSelection();
    renderShellState();
    renderNodes();
    renderLinks();
    renderInspector();
    showLinkContextMenu(link.id, clientX, clientY);
  }

  function handleAction(target) {
    const action = target.dataset.action;
    if (action === "undo") {
      undoHistory();
      return;
    }
    if (action === "redo") {
      redoHistory();
      return;
    }
    const historyBefore = shouldRecordAction(action) ? getHistorySnapshot() : null;
    if (action === "add-node") addNode(target.dataset.type);
    if (action === "add-custom-node-type") addCustomNodeType();
    if (action === "edit-node-type") editNodeType(target.dataset.nodeType);
    if (action === "restore-node-type") restoreNodeType(target.dataset.nodeType);
    if (action === "hide-node-type") hideNodeType(target.dataset.nodeType);
    if (action === "delete-custom-node-type") deleteCustomNodeType(target.dataset.customNodeType);
    if (action === "edit-node-type-badge") editNodeTypeBadge(target.dataset.nodeType);
    if (action === "reset-node-icon") resetNodeTypeBadgeDialog();
    if (action === "save-project") saveCurrentState();
    if (action === "new-project") showNewProjectConfirm();
    if (action === "confirm-new-project") confirmNewProject();
    if (action === "cancel-new-project") closeNewProjectConfirm();
    if (action === "open-project-file") openProjectFileFromUi();
    if (action === "reload-project-file") reloadProjectFileFromUi();
    if (action === "clear-browser-storage") clearBrowserStorageFromUi();
    if (action === "add-character") addCharacter();
    if (action === "delete-character") deleteCharacter(target.dataset.characterId);
    if (action === "focus-character") focusCharacter(target.dataset.characterId);
    if (action === "clear-character-focus") clearCharacterFocus();
    if (action === "clear-character-search") clearCharacterSearch();
    if (action === "toggle-character-backlinks") toggleCharacterBacklinks(target.dataset.characterId);
    if (action === "show-more-document") showMoreDocument(target.dataset.documentId);
    if (action === "add-node-cast") addNodeCast();
    if (action === "delete-node-cast") deleteNodeCast(Number(target.dataset.nodeCastIndex));
    if (action === "add-variable") addVariable();
    if (action === "add-play-rule") showPlayRuleDialog();
    if (action === "create-play-rule") addPlaybookRule(target.dataset.playbookRuleKind);
    if (action === "toggle-playbook-json") togglePlaybookJson();
    if (action === "focus-playbook-json") showPlaybookJsonAtToken(target.dataset.playbookToken);
    if (action === "add-playbook-node-rule") addPlaybookNodeRule();
    if (action === "add-playbook-choice-rule") addPlaybookChoiceRule();
    if (action === "add-playbook-state-rules") addPlaybookStateRules();
    if (action === "delete-variable") deleteVariable(target.dataset.variableKey);
    if (action === "show-playbook-help") showPlaybookHelp();
    if (action === "auto-layout") autoLayoutCanvas(target.dataset.layoutOrientation);
    if (action === "zoom-in") setZoom(state.view.scale + 0.1);
    if (action === "zoom-out") setZoom(state.view.scale - 0.1);
    if (action === "toggle-theme") toggleTheme();
    if (action === "center-view") centerView();
    if (action === "export-all") exportAll();
    if (action === "export-json") exportJson();
    if (action === "export-characters-md") exportCharactersMarkdown();
    if (action === "export-characters-json") exportCharactersJson();
    if (action === "export-image") exportImage();
    if (action === "export-html") exportHtml();
    if (action === "export-variables-json") exportVariablesJson();
    if (action === "export-event-sheet") exportEventSheetCsv();
    if (action === "export-event-sheet-json") exportEventSheetJson();
    if (action === "clear-event-search") clearEventSearch();
    if (action === "rename-event-column") renameEventColumn(target.dataset.eventColumnKey);
    if (action === "hide-event-column") hideEventColumn(target.dataset.eventColumnKey);
    if (action === "delete-event-column") showEventColumnDeleteConfirm(target.dataset.eventColumnKey);
    if (action === "show-event-column") showEventColumn(target.dataset.eventColumnKey);
    if (action === "reset-event-columns") showResetEventColumnsConfirm();
    if (action === "reset-story-order") resetStoryOrderToGraph();
    if (action === "reset-event-row-order") resetEventRowOrderToGraph();
    if (action === "restore-default-node-types") restoreDefaultNodeTypes();
    if (action === "import-json") dom.fileInput.click();
    if (action === "play") openPreview();
    if (action === "duplicate-node") duplicateSelectedNode();
    if (action === "delete-node") deleteSelectedNode();
    if (action === "delete-selected-nodes") deleteSelectedNodes();
    if (action === "delete-context-link") deleteContextLink();
    if (action === "reconnect-link-from") startLinkReconnect("from");
    if (action === "reconnect-link-to") startLinkReconnect("to");
    if (action === "assign-choice-link") assignChoiceLink(target.dataset.linkId, target.dataset.choiceIndex);
    if (action === "focus-node") focusSelectedNode();
    if (action === "focus-canvas-node") focusCanvasNode(target.dataset.nodeId);
    if (action === "select-node") selectNode(target.dataset.nodeId);
    if (action === "focus-character-node") focusCharacterNode(target.dataset.nodeId);
    if (action === "focus-story-node") focusStoryNode(target.dataset.nodeId);
    if (action === "play-next") advancePreview(target.dataset.nodeId);
    if (action === "play-prev") previousPreview();
    if (action === "restart-play") openPreview();
    commitHistoryFromSnapshot(historyBefore);
  }

  async function openProjectFileFromUi() {
    if (!confirmDiscardUnsavedProject("Open another project and discard unsaved changes?", () => void openProjectFileFromUiConfirmed())) return;
    await openProjectFileFromUiConfirmed();
  }

  async function openProjectFileFromUiConfirmed() {
    const host = window.NarrativeCanvasHost;
    if (host?.chooseProjectFile) {
      try {
        await host.chooseProjectFile();
        renderProjectFileStatus();
      } catch (error) {
        console.error(error);
        setStatus("Could not open project picker.");
      }
      return;
    }
    dom.fileInput?.click();
  }

  async function reloadProjectFileFromUi() {
    if (!confirmDiscardUnsavedProject("Reload the current project and discard unsaved changes?", () => void reloadProjectFileFromUiConfirmed())) return;
    await reloadProjectFileFromUiConfirmed();
  }

  async function reloadProjectFileFromUiConfirmed() {
    const host = window.NarrativeCanvasHost;
    if (host?.loadProject) {
      const loaded = await loadCurrentVaultProject();
      setStatus(loaded ? `Reloaded ${getHostProjectFileLabel()}.` : "No project file to reload.");
      return;
    }
    const hasWebState = Boolean(loadWebState());
    const restored = await loadSavedState(true);
    if (restored === false && !hasWebState) setStatus("No saved project to reload.");
  }

  async function clearBrowserStorageFromUi() {
    if (window.NarrativeCanvasHost) return;
    showGenericConfirm({
      kicker: "Project File",
      title: "Clear browser storage?",
      message: "Clear browser storage and load a blank project? This deletes the project saved in this browser.",
      confirmLabel: "Clear storage",
      danger: true,
      onConfirm: () => clearBrowserStorageConfirmed()
    });
  }

  async function clearBrowserStorageConfirmed() {
    try {
      window.localStorage?.removeItem(WEB_STORAGE_KEY);
    } catch (error) {
      console.error(error);
      setStatus("Could not clear browser storage.");
      return;
    }

    state.project = createBlankProject("Untitled");
    markProjectStructureChanged({ nodeTypes: true });
    state.selectedNodeId = "n0";
    state.selectedLinkId = null;
    state.selectedNodeIds = [];
    state.panel = "project";
    state.activeFileId = "adventure";
    centerViewAtScale(DEFAULT_CANVAS_ZOOM, false);
    resetHistory();
    setProjectDirty(true);
    renderAll();
    const saved = await saveCurrentState({ silent: true });
    setStatus(saved ? "Browser storage cleared. Blank project saved." : "Browser storage cleared. Blank project loaded.");
  }

  function confirmDiscardUnsavedProject(message, onConfirm) {
    if (!state.hasUnsavedChanges) return true;
    showGenericConfirm({
      kicker: "Unsaved changes",
      title: "Discard unsaved changes?",
      message,
      confirmLabel: "Discard",
      danger: true,
      onConfirm
    });
    return false;
  }

  function showPlaybookHelp() {
    if (dom.playbookHelpDialog?.showModal) {
      if (!dom.playbookHelpDialog.open) dom.playbookHelpDialog.showModal();
      return;
    }
    window.alert?.(`${PLAYBOOK_FILE_NAME} stores variables and declarative Play rules. It can format Play text, make choice buttons from fields, write variables, and read simple conditions. The toolbar can insert starter rules. It does not run JavaScript or change the canvas schema.`);
  }

  function showPlayRuleDialog() {
    const scripts = getScriptNodeTypes();
    const defaultTarget = getDefaultPlaybookRuleTarget(scripts);
    if (dom.playRuleTargetInput) {
      dom.playRuleTargetInput.value = defaultTarget;
    }
    if (dom.playRuleDialog?.showModal) {
      if (!dom.playRuleDialog.open) dom.playRuleDialog.showModal();
      requestAnimationFrame(() => {
        dom.playRuleTargetInput?.focus();
        dom.playRuleTargetInput?.select();
      });
      return;
    }
    addPlaybookRule("text");
  }

  function showNodeContextMenu(nodeId, clientX, clientY) {
    if (!dom.nodeContextMenu) return;
    state.contextNodeId = nodeId;
    state.contextLinkId = null;
    state.contextGroup = false;
    dom.nodeContextMenu.innerHTML = `
      <button data-layer-action="front">Bring to front</button>
      <button data-layer-action="forward">Bring forward</button>
      <button data-layer-action="backward">Send backward</button>
      <button data-layer-action="back">Send to back</button>
      <button class="context-menu-danger" data-action="delete-node">Delete node</button>
    `;
    positionContextMenu(clientX, clientY);
  }

  function showGroupContextMenu(clientX, clientY) {
    if (!dom.nodeContextMenu) return;
    const count = state.selectedNodeIds.length;
    if (!count) return;
    state.contextNodeId = null;
    state.contextLinkId = null;
    state.contextGroup = true;
    dom.nodeContextMenu.innerHTML = `
      <div class="context-menu-label">${count} selected</div>
      <button data-layer-action="front">Bring to front</button>
      <button data-layer-action="forward">Bring forward</button>
      <button data-layer-action="backward">Send backward</button>
      <button data-layer-action="back">Send to back</button>
      <button class="context-menu-danger" data-action="delete-selected-nodes">Delete ${count} ${count === 1 ? "node" : "nodes"}</button>
    `;
    positionContextMenu(clientX, clientY);
  }

  function showLinkContextMenu(linkId, clientX, clientY) {
    if (!dom.nodeContextMenu) return;
    const link = getLink(linkId);
    state.contextNodeId = null;
    state.contextLinkId = linkId;
    dom.nodeContextMenu.innerHTML = `
      ${renderChoiceLinkMenu(link)}
      <button data-action="reconnect-link-from">Reconnect from output</button>
      <button data-action="reconnect-link-to">Reconnect to input</button>
      <button class="context-menu-danger" data-action="delete-context-link">Delete link</button>
    `;
    positionContextMenu(clientX, clientY);
  }

  function renderChoiceLinkMenu(link) {
    const source = link ? getNode(link.from) : null;
    const choices = getChoiceBranchLabels(source);
    if (!link || !choices.length) return "";
    const currentIndex = normalizeChoiceIndex(link.choiceIndex);
    return `
      <div class="context-menu-label">Choice branch</div>
      ${choices.map((choice, index) => `
        <button data-action="assign-choice-link" data-link-id="${escapeAttr(link.id)}" data-choice-index="${index}" aria-current="${currentIndex === index ? "true" : "false"}">
          <span class="context-menu-check">${currentIndex === index ? "✓" : ""}</span>
          <span>${escapeHtml(choice)}</span>
        </button>
      `).join("")}
      <div class="context-menu-label">Link</div>
    `;
  }

  function positionContextMenu(clientX, clientY) {
    if (!dom.nodeContextMenu) return;
    dom.nodeContextMenu.style.left = "0px";
    dom.nodeContextMenu.style.top = "0px";
    dom.nodeContextMenu.style.display = "grid";
    dom.nodeContextMenu.hidden = false;
    dom.nodeContextMenu.setAttribute("aria-hidden", "false");
    const menuRect = dom.nodeContextMenu.getBoundingClientRect();
    const containerRect = getContextMenuContainerRect();
    const pointerX = clientX - containerRect.left;
    const pointerY = clientY - containerRect.top;
    const maxLeft = Math.max(8, containerRect.width - menuRect.width - 8);
    const maxTop = Math.max(8, containerRect.height - menuRect.height - 8);
    dom.nodeContextMenu.style.left = `${clamp(pointerX + 4, 8, maxLeft)}px`;
    dom.nodeContextMenu.style.top = `${clamp(pointerY + 4, 8, maxTop)}px`;
  }

  function getContextMenuContainerRect() {
    const parent = dom.nodeContextMenu?.offsetParent;
    if (parent?.getBoundingClientRect) return parent.getBoundingClientRect();
    return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  }

  function hideNodeContextMenu() {
    state.contextNodeId = null;
    state.contextLinkId = null;
    state.contextGroup = false;
    if (!dom.nodeContextMenu) return;
    dom.nodeContextMenu.hidden = true;
    dom.nodeContextMenu.style.display = "none";
    dom.nodeContextMenu.setAttribute("aria-hidden", "true");
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
    const layerItems = getCanvasLayerItems();
    const layerIndex = layerItems.findIndex((item) => item.node.id === nodeId);
    if (layerIndex < 0) return false;
    let targetLayerIndex = layerIndex;

    if (action === "front") {
      targetLayerIndex = layerItems.length - 1;
    } else if (action === "back") {
      targetLayerIndex = 0;
    } else if (action === "forward") {
      targetLayerIndex = Math.min(layerIndex + 1, layerItems.length - 1);
    } else if (action === "backward") {
      targetLayerIndex = Math.max(layerIndex - 1, 0);
    } else {
      return false;
    }

    if (targetLayerIndex === layerIndex) return false;

    const layerOrders = layerItems.map((item) => item.order).sort((a, b) => a - b);
    const [movedItem] = layerItems.splice(layerIndex, 1);
    layerItems.splice(targetLayerIndex, 0, movedItem);
    layerItems.forEach((item, itemIndex) => {
      item.node.layerOrder = layerOrders[itemIndex];
    });
    state.project.nodes = layerItems.map((item) => item.node);
    return true;
  }

  function moveSelectedNodesLayer(action) {
    const ids = new Set(state.selectedNodeIds);
    if (!ids.size) return false;
    const items = getCanvasLayerItems();
    const total = items.length;
    const selectedIndexes = items.reduce((indexes, item, index) => {
      if (ids.has(item.node.id)) indexes.push(index);
      return indexes;
    }, []);
    if (!selectedIndexes.length) return false;

    const orders = items.map((item) => item.order).sort((a, b) => a - b);
    let arranged;
    if (action === "front") {
      const selected = selectedIndexes.map((index) => items[index]);
      arranged = [...items.filter((item) => !ids.has(item.node.id)), ...selected];
    } else if (action === "back") {
      const selected = selectedIndexes.map((index) => items[index]);
      arranged = [...selected, ...items.filter((item) => !ids.has(item.node.id))];
    } else if (action === "forward" || action === "backward") {
      const direction = action === "forward" ? 1 : -1;
      arranged = items.slice();
      const sequence = direction === 1 ? selectedIndexes.slice().reverse() : selectedIndexes.slice();
      sequence.forEach((index) => {
        const swapIndex = index + direction;
        if (swapIndex < 0 || swapIndex >= total) return;
        if (ids.has(arranged[swapIndex].node.id)) return;
        const temp = arranged[index];
        arranged[index] = arranged[swapIndex];
        arranged[swapIndex] = temp;
      });
    } else {
      return false;
    }

    const unchanged = arranged.every((item, index) => item === items[index]);
    if (unchanged) return false;
    arranged.forEach((item, index) => {
      item.node.layerOrder = orders[index];
    });
    state.project.nodes = arranged.map((item) => item.node);
    return true;
  }

  function moveContextSelection(action) {
    const changed = moveSelectedNodesLayer(action);
    hideNodeContextMenu();
    if (!changed) return;
    renderNodes();
    renderLinks();
    renderMinimap();
    renderInspector();
    setStatus("Node layers updated.");
  }

  function deleteSelectedNodes() {
    const ids = state.selectedNodeIds.filter((id) => getNode(id));
    if (ids.length <= 1) {
      if (ids.length === 1) state.selectedNodeId = ids[0];
      deleteSelectedNode();
      return;
    }
    ids.forEach((id) => archiveDeletedNode(id));
    const idSet = new Set(ids);
    state.project.nodes = state.project.nodes.filter((node) => !idSet.has(node.id));
    state.project.links = state.project.links.filter((link) => !idSet.has(link.from) && !idSet.has(link.to));
    invalidateCharacterRenderContext();
    clearStoryOrderOverrides();
    clearEventRowOrderOverrides();
    clearNodeSelection();
    hideNodeContextMenu();
    renderAll();
    setStatus(`${ids.length} nodes deleted and archived outside runtime.`);
  }

  function selectFile(fileId) {
    if (!fileViews[fileId]) return;
    if (state.activeFileId === fileId) return;
    state.activeFileId = fileId;

    if (fileId === "adventure") {
      state.panel = state.selectedNodeId ? "node" : "project";
      renderCanvasFileSwitch();
      setStatus(`${fileViews.adventure} opened.`);
      return;
    }

    if (fileId === "characters") {
      renderDocumentFileSwitch();
      setStatus("Characters.md opened.");
      return;
    }

    if (fileId === "events") {
      renderDocumentFileSwitch();
      setStatus("Events Sheet.csv opened.");
      return;
    }

    renderDocumentFileSwitch();
    setStatus(`${PLAYBOOK_FILE_NAME} opened.`);
    requestAnimationFrame(() => {
      dom.variablesPanel?.querySelector("[data-project-field='variables']")?.focus();
    });
  }

  function renderDocumentFileSwitch() {
    hideNodeContextMenu();
    renderShellState();
    renderWorkspaceFile();
    renderInspectorTabs();
    updateStatus();
    renderHistoryButtons();
  }

  function renderCanvasFileSwitch() {
    hideNodeContextMenu();
    renderShellState();
    renderWorkspaceFile();
    renderInspector();
    updateStatus();
    renderHistoryButtons();
  }

  function getEditableHistoryKey(target) {
    if (!target?.dataset) return "";
    if (target === dom.queryInput || target.hasAttribute?.("data-character-search") || target.hasAttribute?.("data-event-search")) return "";
    const parts = [];
    ["projectField", "nodeField", "inlineNodeField", "nodeCustomField", "characterField", "variableField", "eventField", "nodeCastField"].forEach((name) => {
      if (target.dataset[name]) parts.push(`${name}:${target.dataset[name]}`);
    });
    ["nodeId", "characterId", "variableKey", "eventNodeId", "nodeCastIndex"].forEach((name) => {
      if (target.dataset[name]) parts.push(`${name}:${target.dataset[name]}`);
    });
    return parts.join("|");
  }

  function handleEditFocusIn(event) {
    if (!isNarrativeCanvasTarget(event.target)) return;
    const key = getEditableHistoryKey(event.target);
    if (!key) return;
    state.editHistoryTarget = {
      key,
      snapshot: getHistorySnapshot()
    };
  }

  function handleEditFocusOut(event) {
    const target = event.target;
    if (target?.dataset?.projectField === "variables") {
      setProjectField("variables", target.value);
    }
    commitFocusedEdit(event.target);
    if (target?.dataset?.inlineNodeField) {
      if (event.relatedTarget && dom.mentionPopover?.contains(event.relatedTarget)) return;
      if (shouldKeepInlineNodeEditOnFocusOut(target.dataset.nodeId, event.relatedTarget)) {
        requestAnimationFrame(() => focusInlineNodeEditor(target.dataset.nodeId));
        return;
      }
      finishInlineNodeEdit(target.dataset.nodeId);
    }
  }

  function commitFocusedEdit(target) {
    const key = getEditableHistoryKey(target);
    if (!key || !state.editHistoryTarget || state.editHistoryTarget.key !== key) return false;
    const changed = commitHistoryFromSnapshot(state.editHistoryTarget.snapshot);
    state.editHistoryTarget = null;
    return changed;
  }

  function handleInput(event) {
    const target = event.target;
    if (!isNarrativeCanvasTarget(target)) return;

    updateMentionFromTarget(target);

    if (target === dom.queryInput) {
      state.search = target.value;
      if (target.value.trim() && state.activeFileId !== "adventure") {
        state.activeFileId = "adventure";
        renderShellState();
        renderWorkspaceFile();
      }
      const canvasRenderContext = getCanvasRenderContext();
      renderTransform();
      renderNodes(canvasRenderContext);
      renderLinks(canvasRenderContext);
      updateStatus();
      return;
    }

    if (target.hasAttribute && target.hasAttribute("data-character-search")) {
      state.characterSearch = target.value;
      resetDocumentRenderLimit("characters");
      renderCharacterGridForSearch();
      return;
    }

    if (target.hasAttribute && target.hasAttribute("data-event-search")) {
      state.eventSearch = target.value;
      resetDocumentRenderLimit("events");
      renderEventSheetGroupsForSearch();
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

    if (target.dataset.nodeCastField) {
      setNodeCastField(Number(target.dataset.nodeCastIndex), target.dataset.nodeCastField, target.value, false);
      return;
    }

    if (target.dataset.nodeCustomField) {
      setNodeCustomField(target.dataset.nodeCustomField, target.value, false);
      return;
    }

    if (target.dataset.inlineNodeField) {
      setInlineNodeField(target.dataset.nodeId, target.dataset.inlineNodeField, target.value);
      return;
    }

    if (target.dataset.projectField) {
      if (target.dataset.projectField === "variables") {
        resizePlaybookJsonTextarea(target);
        return;
      }
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

    if (target === dom.exportImageScale) {
      setExportImageScale(target.value);
      return;
    }

    if (target.dataset.characterField) {
      setCharacterField(target.dataset.characterId, target.dataset.characterField, target.value, true);
      commitFocusedEdit(target);
      return;
    }
    if (target.dataset.variableField) {
      setVariableField(target.dataset.variableKey, target.dataset.variableField, target.value, true);
      commitFocusedEdit(target);
      return;
    }
    if (target.dataset.eventField) {
      setEventField(target.dataset.eventNodeId, target.dataset.eventField, target.value, true);
      commitFocusedEdit(target);
      return;
    }
    if (target.dataset.nodeCastField) {
      setNodeCastField(Number(target.dataset.nodeCastIndex), target.dataset.nodeCastField, target.value, true);
      commitFocusedEdit(target);
      return;
    }
    if (target.dataset.nodeCustomField) {
      setNodeCustomField(target.dataset.nodeCustomField, target.value, true);
      commitFocusedEdit(target);
      return;
    }
    if (target.dataset.inlineNodeField) {
      setInlineNodeField(target.dataset.nodeId, target.dataset.inlineNodeField, target.value);
      commitFocusedEdit(target);
      return;
    }
    if (target.dataset.projectField) {
      if (target.dataset.projectField === "variables" && target.dataset.playbookJsonVersion !== String(state.dirtyVersion)) return;
      setProjectField(target.dataset.projectField, target.value);
      commitFocusedEdit(target);
      return;
    }
    if (target.dataset.nodeField) {
      setNodeField(target.dataset.nodeField, target.value);
      commitFocusedEdit(target);
    }
  }

  function handleKeyDown(event) {
    if (event.defaultPrevented) return;
    if (handleHistoryShortcutEvent(event)) return;
    if (!isNarrativeCanvasTarget(event.target)) return;
    if (handleMentionKeyDown(event)) return;
    const isField = isNativeEditingTarget(event.target);
    if (event.target.dataset?.inlineNodeField && event.key === "Escape") {
      event.preventDefault();
      finishInlineNodeEdit(event.target.dataset.nodeId);
      return;
    }
    if (isField) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      const historyBefore = getHistorySnapshot();
      if (state.selectedNodeIds.length > 1) deleteSelectedNodes();
      else if (state.selectedNodeId) deleteSelectedNode();
      if (state.selectedLinkId) deleteSelectedLink();
      commitHistoryFromSnapshot(historyBefore);
    }
  }

  const MENTION_SELECTOR = [
    "textarea[data-node-field]",
    "input[data-node-field='title']",
    "textarea[data-inline-node-field]",
    "input[data-inline-node-field='title']",
    "textarea[data-event-field]",
    "textarea[data-character-field]",
    "input[data-character-field='name']",
    "input[data-character-field='role']",
    "input[data-character-field='voice']",
    "textarea[data-node-custom-field]"
  ].join(",");

  function isMentionField(target) {
    return target && target.matches && target.matches(MENTION_SELECTOR);
  }

  function updateMentionFromTarget(target) {
    if (!dom.mentionPopover || !isMentionField(target)) return;
    const value = target.value || "";
    const caret = typeof target.selectionStart === "number" ? target.selectionStart : value.length;
    const before = value.slice(0, caret);
    const match = before.match(/(^|[\s(\[{>,;:!?])@([\p{L}\p{N}_\-' .]{0,40})$/u);
    if (!match) {
      hideMentionPopover();
      return;
    }
    const query = match[2] || "";
    const atOffset = caret - query.length - 1;
    const characters = getCharacters();
    const filtered = query
      ? characters.filter((character) => (character.name || "").toLowerCase().includes(query.toLowerCase()))
      : characters;
    if (!filtered.length) {
      hideMentionPopover();
      return;
    }
    state.mention = {
      target,
      atOffset,
      queryLength: query.length,
      characters: filtered,
      activeIndex: 0
    };
    renderMentionPopover();
    positionMentionPopover(target);
  }

  function renderMentionPopover() {
    if (!dom.mentionPopover || !state.mention) return;
    const { characters, activeIndex } = state.mention;
    dom.mentionPopover.innerHTML = characters.map((character, index) => `
      <button type="button" class="mention-option ${index === activeIndex ? "active" : ""}" data-mention-index="${index}" role="option">
        <strong>${escapeHtml(character.name || "Unnamed")}</strong>
        ${character.role ? `<small>${escapeHtml(character.role)}</small>` : ""}
      </button>
    `).join("");
    dom.mentionPopover.hidden = false;
    dom.mentionPopover.style.display = "grid";
    dom.mentionPopover.setAttribute("aria-hidden", "false");
  }

  function handleMentionPopoverPointerDown(event) {
    event.preventDefault();
  }

  function positionMentionPopover(target) {
    if (!dom.mentionPopover) return;
    const rect = target.getBoundingClientRect();
    const margin = 8;
    const gap = 4;
    const maxWidth = Math.max(180, Math.min(320, window.innerWidth - margin * 2));
    const width = Math.min(Math.max(rect.width, 180), maxWidth);
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const openBelow = spaceBelow >= 120 || spaceBelow >= spaceAbove;
    const availableHeight = Math.max(96, (openBelow ? spaceBelow : spaceAbove) - gap);
    const maxHeight = Math.min(260, availableHeight);
    const left = clamp(rect.left, margin, Math.max(margin, window.innerWidth - width - margin));
    const top = openBelow
      ? Math.min(rect.bottom + gap, window.innerHeight - margin - maxHeight)
      : Math.max(margin, rect.top - gap - maxHeight);
    dom.mentionPopover.style.left = `${left}px`;
    dom.mentionPopover.style.top = `${top}px`;
    dom.mentionPopover.style.minWidth = `${width}px`;
    dom.mentionPopover.style.maxWidth = `${maxWidth}px`;
    dom.mentionPopover.style.maxHeight = `${maxHeight}px`;
  }

  function hideMentionPopover() {
    if (!dom.mentionPopover) return;
    state.mention = null;
    dom.mentionPopover.hidden = true;
    dom.mentionPopover.style.display = "none";
    dom.mentionPopover.setAttribute("aria-hidden", "true");
    dom.mentionPopover.innerHTML = "";
  }

  function handleMentionKeyDown(event) {
    if (!state.mention) return false;
    if (event.target !== state.mention.target) {
      hideMentionPopover();
      return false;
    }
    if (event.key === "Escape") {
      hideMentionPopover();
      event.preventDefault();
      return true;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const dir = event.key === "ArrowDown" ? 1 : -1;
      const length = state.mention.characters.length;
      state.mention.activeIndex = (state.mention.activeIndex + dir + length) % length;
      renderMentionPopover();
      event.preventDefault();
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      const character = state.mention.characters[state.mention.activeIndex];
      if (character) {
        insertMention(character);
        event.preventDefault();
        return true;
      }
    }
    return false;
  }

  function insertMention(character) {
    if (!state.mention) return;
    const { target, atOffset, queryLength } = state.mention;
    const value = target.value || "";
    const before = value.slice(0, atOffset);
    const after = value.slice(atOffset + 1 + queryLength);
    const insertion = `@${character.name || ""}`;
    target.value = `${before}${insertion} ${after}`;
    const caret = (before + insertion + " ").length;
    if (typeof target.setSelectionRange === "function") target.setSelectionRange(caret, caret);
    target.focus();
    hideMentionPopover();
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    hideMentionPopover();

    if (target.dataset.nodeField || target.dataset.inlineNodeField || target.dataset.nodeCustomField || target.dataset.eventField) {
      const node = getNode(target.dataset.nodeId || state.selectedNodeId);
      if (node && !isEventSheetNode(node)) {
        const cast = normalizeNodeCast(node.cast);
        if (!cast.some((entry) => entry.characterId === character.id && entry.role === "Mentioned")) {
          cast.push({ characterId: character.id, role: "Mentioned" });
          node.cast = cast;
          if (target.dataset.inlineNodeField) {
            invalidateCharacterRenderContext();
            setProjectDirty(true);
            renderNodePanel(node);
            renderProjectPanel();
            scheduleStoryPanelRender();
            updateStatus();
          } else {
            renderCharacterAwareSurfaces(node);
          }
        }
      }
    }
  }

  function handleStoryPointerDown(event) {
    const columnResizeHandle = event.target.closest && event.target.closest("[data-event-column-resize]");
    if (columnResizeHandle && dom.eventsPanel?.contains(columnResizeHandle)) {
      const key = columnResizeHandle.dataset.eventColumnResize;
      const column = getEventColumnByKey(key);
      if (!column) return;
      const th = columnResizeHandle.closest("th");
      const startWidth = th ? th.getBoundingClientRect().width : parseFloat(normalizeEventColumnWidth(column.width));
      state.eventColumnResize = {
        key,
        startX: event.clientX,
        startWidth: Math.max(60, startWidth),
        lastWidth: Math.max(60, startWidth),
        active: false
      };
      dom.root?.classList.add("event-column-resizing");
      event.preventDefault();
      return;
    }
    const eventRowHandle = event.target.closest && event.target.closest("[data-event-row-drag]");
    if (eventRowHandle && dom.eventsPanel?.contains(eventRowHandle)) {
      const nodeId = eventRowHandle.dataset.eventRowDrag;
      if (!getNode(nodeId)) return;
      state.eventRowDrag = {
        id: nodeId,
        startX: event.clientX,
        startY: event.clientY,
        active: false
      };
      event.preventDefault();
      return;
    }
    if (!dom.storyPanel?.contains(event.target)) return;
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target.closest("button, a, input, select, textarea")) return;
    const item = event.target.closest("[data-story-node-id]");
    if (!item) return;
    const nodeId = item.dataset.storyNodeId;
    if (!getNode(nodeId)) return;
    state.draggingStoryNodeId = nodeId;
    state.storyPointerDrag = {
      id: nodeId,
      startX: event.clientX,
      startY: event.clientY,
      active: false
    };
    item.classList.add("dragging");
    event.preventDefault();
  }

  function handleEventColumnResizeMove(event) {
    if (!state.eventColumnResize) return;
    const drag = state.eventColumnResize;
    const delta = event.clientX - drag.startX;
    if (Math.abs(delta) < 3 && !drag.active) return;
    drag.active = true;
    const nextWidth = Math.max(60, Math.round(drag.startWidth + delta));
    drag.lastWidth = nextWidth;
    applyEventColumnWidthToDom(drag.key, nextWidth);
    event.preventDefault();
  }

  function handleEventColumnResizeUp(event) {
    if (!state.eventColumnResize) return;
    const drag = state.eventColumnResize;
    state.eventColumnResize = null;
    dom.root?.classList.remove("event-column-resizing");
    if (!drag.active) return;
    const historyBefore = getHistorySnapshot();
    setEventColumnWidth(drag.key, `${drag.lastWidth}px`);
    commitHistoryFromSnapshot(historyBefore);
  }

  function applyEventColumnWidthToDom(key, width) {
    const widthStr = `${width}px`;
    const cellStyle = `width:${widthStr}; min-width:${widthStr};`;
    const safeKey = CSS.escape(key);
    dom.eventsPanel?.querySelectorAll(`[data-event-column-key="${safeKey}"]`).forEach((th) => {
      th.style.cssText = cellStyle;
      const table = th.closest("table");
      const colIndex = th.cellIndex;
      const col = table?.querySelector("colgroup")?.children?.[colIndex];
      if (col) col.style.width = widthStr;
    });
    dom.eventsPanel?.querySelectorAll(`[data-event-field="${safeKey}"]`).forEach((control) => {
      const td = control.closest("td");
      if (td) td.style.cssText = cellStyle;
    });
  }

  function setEventColumnWidth(key, width) {
    const normalized = normalizeEventColumnWidth(width);
    const sheet = getProjectEventSheet();
    let schemaColumn = sheet.columns.find((item) => item.key === key);
    if (!schemaColumn) {
      const defaultColumn = eventSheetColumns.find((item) => item.key === key);
      if (defaultColumn) {
        schemaColumn = normalizeEventSheetColumn(defaultColumn);
        sheet.columns.push(schemaColumn);
      }
    }
    if (!schemaColumn || schemaColumn.width === normalized) return;
    const scrollState = captureEventSheetScrollState();
    schemaColumn.width = normalized;
    state.project.eventSheet = sheet;
    markProjectStructureChanged();
    setProjectDirty(true);
    renderEventsSheetPage();
    restoreEventSheetScrollState(scrollState);
  }

  function handleEventRowPointerMove(event) {
    if (!state.eventRowDrag) return;
    const drag = state.eventRowDrag;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (distance < 6 && !drag.active) return;
    drag.active = true;
    const placement = getEventRowDropPlacementFromPoint(event.clientX, event.clientY, drag.id);
    clearEventRowDropMarkers();
    if (placement) markEventRowDropPlacement(placement);
    event.preventDefault();
  }

  function handleEventRowPointerUp(event) {
    if (!state.eventRowDrag) return;
    const drag = state.eventRowDrag;
    const placement = drag.active ? getEventRowDropPlacementFromPoint(event.clientX, event.clientY, drag.id) : null;
    clearEventRowDropMarkers();
    state.eventRowDrag = null;
    if (placement && placement.targetId !== drag.id) {
      moveEventRow(drag.id, placement.targetId, placement.placement);
    }
  }

  function getEventRowDropPlacementFromPoint(x, y, draggingId) {
    const root = typeof dom.scope?.elementFromPoint === "function" ? dom.scope : document;
    const el = root.elementFromPoint(x, y);
    if (!el) return null;
    const row = el.closest("[data-event-row-id]");
    if (!row || !dom.eventsPanel?.contains(row)) return null;
    const targetId = row.dataset.eventRowId;
    if (!targetId || targetId === draggingId) return null;
    const draggingNode = getNode(draggingId);
    const targetNode = getNode(targetId);
    if (!draggingNode || !targetNode || draggingNode.type !== targetNode.type) return null;
    const rect = row.getBoundingClientRect();
    const placement = (y - rect.top) > rect.height / 2 ? "after" : "before";
    return { targetId, placement };
  }

  function clearEventRowDropMarkers() {
    dom.eventsPanel?.querySelectorAll(".event-row-drop-before, .event-row-drop-after")
      .forEach((row) => row.classList.remove("event-row-drop-before", "event-row-drop-after"));
  }

  function markEventRowDropPlacement(placement) {
    const row = dom.eventsPanel?.querySelector(`[data-event-row-id="${placement.targetId}"]`);
    if (row) row.classList.add(placement.placement === "after" ? "event-row-drop-after" : "event-row-drop-before");
  }

  function handleStoryPointerMove(event) {
    if (state.eventColumnResize) {
      handleEventColumnResizeMove(event);
      return;
    }
    if (state.eventRowDrag) {
      handleEventRowPointerMove(event);
      return;
    }
    if (!state.storyPointerDrag) return;
    const drag = state.storyPointerDrag;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (distance < 6 && !drag.active) return;
    drag.active = true;
    const placement = getStoryDropPlacementFromPoint(event.clientX, event.clientY);
    clearStoryDropMarkers(false);
    if (placement && canMoveStoryNode(drag.id, placement)) markStoryDropPlacement(placement);
    event.preventDefault();
  }

  function handleStoryPointerUp(event) {
    if (state.eventColumnResize) {
      handleEventColumnResizeUp(event);
      return;
    }
    if (state.eventRowDrag) {
      handleEventRowPointerUp(event);
      return;
    }
    if (!state.storyPointerDrag) return;
    const drag = state.storyPointerDrag;
    const placement = drag.active ? getStoryDropPlacementFromPoint(event.clientX, event.clientY) : null;
    state.draggingStoryNodeId = null;
    state.storyPointerDrag = null;
    clearStoryDropMarkers();
    if (placement && canMoveStoryNode(drag.id, placement)) {
      moveStoryNode(drag.id, placement);
    }
  }

  function getStoryDropPlacementFromPoint(x, y) {
    const root = typeof dom.scope?.elementFromPoint === "function" ? dom.scope : document;
    const target = root.elementFromPoint(x, y);
    if (!target) return null;
    return getStoryDropPlacement({ target, clientY: y });
  }

  function getStoryDropPlacement(event) {
    const item = event.target.closest("[data-story-node-id]");
    if (item && dom.storyPanel?.contains(item)) {
      const targetId = item.dataset.storyNodeId;
      const targetNode = getNode(targetId);
      const rect = item.getBoundingClientRect();
      const relativeY = rect.height ? (event.clientY - rect.top) / rect.height : 0.5;
      if (targetNode && isFrameNode(targetNode) && relativeY > 0.25 && relativeY < 0.75) {
        return { mode: "inside", parentId: targetId, targetId };
      }
      return {
        mode: relativeY < 0.5 ? "before" : "after",
        parentId: item.dataset.storyParentId || "",
        targetId
      };
    }

    const list = event.target.closest("[data-story-parent-id]");
    if (list && dom.storyPanel?.contains(list)) {
      return { mode: "append", parentId: list.dataset.storyParentId || "", targetId: "" };
    }
    return null;
  }

  function canMoveStoryNode(nodeId, placement) {
    const node = getNode(nodeId);
    if (!node || !placement) return false;
    if (placement.targetId === nodeId || placement.parentId === nodeId) return false;
    const parent = placement.parentId ? getNode(placement.parentId) : null;
    if (placement.parentId && !isFrameNode(parent)) return false;
    if (isFrameNode(node) && placement.parentId && isStoryFrameDescendant(placement.parentId, nodeId)) return false;
    return true;
  }

  function isStoryFrameDescendant(frameId, ancestorId) {
    const parentMap = getStoryParentMap();
    let current = frameId;
    while (current) {
      if (current === ancestorId) return true;
      current = parentMap.get(current) || "";
    }
    return false;
  }

  function clearStoryDropMarkers(removeDragging = true) {
    dom.storyPanel?.querySelectorAll(".story-drop-before, .story-drop-after, .story-drop-inside")
      .forEach((item) => item.classList.remove("story-drop-before", "story-drop-after", "story-drop-inside"));
    if (removeDragging) {
      dom.storyPanel?.querySelectorAll(".dragging").forEach((item) => item.classList.remove("dragging"));
    }
  }

  function markStoryDropPlacement(placement) {
    if (placement.mode === "append" || placement.mode === "inside") {
      const target = placement.mode === "inside"
        ? dom.storyPanel?.querySelector(`[data-story-node-id="${placement.parentId}"]`)
        : dom.storyPanel?.querySelector(`[data-story-parent-id="${placement.parentId}"]`);
      target?.classList.add("story-drop-inside");
      return;
    }
    const target = dom.storyPanel?.querySelector(`[data-story-node-id="${placement.targetId}"]`);
    target?.classList.add(placement.mode === "before" ? "story-drop-before" : "story-drop-after");
  }

  function isNarrativeCanvasTarget(target) {
    return Boolean(
      dom.root?.contains(target)
      || dom.mentionPopover?.contains(target)
      || dom.nodeContextMenu?.contains(target)
      || dom.nodeIconDialog?.contains(target)
      || dom.nodeTypeDialog?.contains(target)
      || dom.playDialog?.contains(target)
      || dom.confirmDialog?.contains(target)
      || dom.eventColumnDeleteDialog?.contains(target)
      || dom.eventColumnsResetDialog?.contains(target)
      || dom.genericConfirmDialog?.contains(target)
      || dom.genericTextDialog?.contains(target)
      || dom.playbookHelpDialog?.contains(target)
      || dom.playRuleDialog?.contains(target)
      || dom.nodeRequiredDialog?.contains(target)
    );
  }

  function isNarrativeCanvasClickDelegateTarget(target) {
    if (!target?.closest) return false;
    const actionable = target.closest("[data-mention-index], [data-layer-action], [data-sidebar-toggle], [data-action], [data-file-id], [data-panel], [data-port], [data-link-id], [data-node-id], .node[data-node-id]");
    return Boolean(actionable && getNarrativeCanvasScopeForTarget(target));
  }

  function getNarrativeCanvasScopeForTarget(target) {
    if (!target?.closest) return null;
    const host = target.closest(".narrative-canvas-plugin-host");
    if (host?.querySelector?.(".app-shell")) return host;
    if (dom.root?.contains(target)) return dom.scope || document;
    const shell = target.closest(".app-shell");
    if (shell) return shell.closest(".narrative-canvas-plugin-host") || document;
    return null;
  }

  function syncDomScopeForEventTarget(target) {
    const nextScope = getNarrativeCanvasScopeForTarget(target);
    if (!nextScope || nextScope === dom.scope) return;
    eventController?.abort();
    if (window.NarrativeCanvasHost && nextScope.classList?.contains("narrative-canvas-plugin-host")) {
      window.NarrativeCanvasHost.root = nextScope;
    }
    bindDom(nextScope);
    bindEvents();
  }

  function handleViewportPointerDown(event) {
    rememberInlineEditPointerTarget(event.target);
    if (shouldKeepInlineNodeEditForTarget(event.target)) {
      event.preventDefault();
      requestAnimationFrame(() => focusInlineNodeEditor(state.inlineEditNodeId));
      return;
    }
    if (state.inlineEditNodeId && !isActiveInlineEditNodeTarget(event.target)) {
      finishInlineNodeEdit(state.inlineEditNodeId);
    }
    if (event.target.closest("[data-no-drag]")) return;

    const resizeHandle = event.target.closest("[data-resize-handle]");
    if (resizeHandle) {
      const node = getNode(resizeHandle.dataset.nodeId);
      if (!node) return;
      const size = nodeSize(node);
      beginGeometryHistoryCapture(node);
      selectNode(node.id, false);
      // Cache the element + incident link elements AFTER selectNode re-rendered, so
      // the move handler can patch them in place without re-querying or re-rendering.
      state.resizingNode = {
        id: node.id,
        handle: resizeHandle.dataset.resizeHandle,
        startX: event.clientX,
        startY: event.clientY,
        width: size.width,
        height: size.height,
        element: getNodeElementById(node.id),
        ports: getNodePortElementsById(node.id),
        linkRefs: collectLinkElementRefs(getIncidentLinks(node.id))
      };
      dom.viewport.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }

    const handle = event.target.closest("[data-drag-handle]");
    if (handle) {
      const node = getNode(handle.dataset.nodeId);
      if (!node) return;
      beginGeometryHistoryCapture(node);
      selectNode(node.id, false);
      state.draggingNode = {
        id: node.id,
        startX: event.clientX,
        startY: event.clientY,
        nodeX: node.x,
        nodeY: node.y,
        element: getNodeElementById(node.id),
        ports: getNodePortElementsById(node.id),
        linkRefs: collectLinkElementRefs(getIncidentLinks(node.id))
      };
      dom.viewport.setPointerCapture(event.pointerId);
      return;
    }

    if (event.target === dom.viewport || event.target === dom.content || event.target === dom.nodeLayer || event.target === dom.linkLayer) {
      if (state.connectingFrom || state.reconnectingLinkId) {
        event.preventDefault();
        return;
      }
      hideNodeContextMenu();
      // Middle button pans; left button drags a selection marquee on empty canvas.
      if (event.button === 1) {
        startCanvasPan(event);
        return;
      }
      if (event.button === 0) {
        startMarquee(event);
      }
    }
  }

  function startCanvasPan(event) {
    state.panning = {
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: dom.viewport.scrollLeft,
      scrollTop: dom.viewport.scrollTop
    };
    try {
      dom.viewport.setPointerCapture(event.pointerId);
    } catch (error) {
      // Pointer capture is unavailable.
    }
    event.preventDefault();
  }

  function collectSelectedIds() {
    const set = new Set(state.selectedNodeIds);
    if (state.selectedNodeId) set.add(state.selectedNodeId);
    return [...set];
  }

  function startMarquee(event) {
    const board = screenToBoard(event.clientX, event.clientY);
    const additive = event.shiftKey;
    const baseIds = additive ? collectSelectedIds() : [];
    if (!additive) {
      clearNodeSelection();
      state.selectedLinkId = null;
    }
    state.marquee = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: board.x,
      startY: board.y,
      curX: board.x,
      curY: board.y,
      baseIds,
      moved: false
    };
    try {
      dom.viewport.setPointerCapture(event.pointerId);
    } catch (error) {
      // Pointer capture is unavailable.
    }
    renderNodes();
    renderInspector();
    renderMarquee();
  }

  function getMarqueeBoardRect() {
    const marquee = state.marquee;
    return {
      left: Math.min(marquee.startX, marquee.curX),
      top: Math.min(marquee.startY, marquee.curY),
      right: Math.max(marquee.startX, marquee.curX),
      bottom: Math.max(marquee.startY, marquee.curY)
    };
  }

  function nodeIntersectsRect(node, rect) {
    const size = nodeLayoutSize(node);
    return node.x < rect.right
      && node.x + size.width > rect.left
      && node.y < rect.bottom
      && node.y + size.height > rect.top;
  }

  function updateMarqueeSelection() {
    if (!state.marquee) return;
    const rect = getMarqueeBoardRect();
    const set = new Set(state.marquee.baseIds);
    state.project.nodes.forEach((node) => {
      if (nodeIntersectsRect(node, rect)) set.add(node.id);
    });
    state.selectedNodeIds = [...set];
    state.selectedNodeId = null;
  }

  function renderMarquee() {
    if (!dom.marqueeRect) return;
    if (!state.marquee) {
      dom.marqueeRect.hidden = true;
      return;
    }
    const rect = getMarqueeBoardRect();
    dom.marqueeRect.hidden = false;
    dom.marqueeRect.style.left = `${rect.left}px`;
    dom.marqueeRect.style.top = `${rect.top}px`;
    dom.marqueeRect.style.width = `${Math.max(0, rect.right - rect.left)}px`;
    dom.marqueeRect.style.height = `${Math.max(0, rect.bottom - rect.top)}px`;
  }

  function finishMarquee(event) {
    const marquee = state.marquee;
    state.marquee = null;
    try {
      dom.viewport.releasePointerCapture(event.pointerId);
    } catch (error) {
      // Pointer capture is already gone.
    }
    if (dom.marqueeRect) dom.marqueeRect.hidden = true;
    state.selectedNodeIds = state.selectedNodeIds.filter((id) => getNode(id));
    renderNodes();
    renderInspector();
    if (marquee.moved && state.selectedNodeIds.length) {
      const clientX = event.clientX;
      const clientY = event.clientY;
      // Defer so the trailing click (which would hide the menu) runs first.
      requestAnimationFrame(() => {
        if (state.selectedNodeIds.length) showGroupContextMenu(clientX, clientY);
      });
    }
  }

  function handleViewportDoubleClick(event) {
    const nodeElement = event.target.closest?.(".node[data-node-id]");
    if (nodeElement) {
      if (isCanvasNodeInlineEditBlockedTarget(event.target)) return;
      cancelPendingConnection();
      focusCanvasNodeForInlineEdit(nodeElement.dataset.nodeId);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.target !== dom.viewport && event.target !== dom.content && event.target !== dom.nodeLayer && event.target !== dom.linkLayer) return;
    if (cancelPendingConnection()) {
      event.preventDefault();
    }
  }

  function cancelPendingConnection() {
    if (!state.connectingFrom && !state.reconnectingLinkId) return false;
    clearLinkReconnect();
    renderLinks();
    setStatus("Connection canceled.");
    return true;
  }

  function handleViewportScroll() {
    hideNodeContextMenu();
    updateGridPosition();
    scheduleCanvasViewportRender();
  }

  function handleViewportPointerMove(event) {
    if (state.marquee) {
      const board = screenToBoard(event.clientX, event.clientY);
      state.marquee.curX = board.x;
      state.marquee.curY = board.y;
      if (!state.marquee.moved
        && (Math.abs(event.clientX - state.marquee.startClientX) > 3 || Math.abs(event.clientY - state.marquee.startClientY) > 3)) {
        state.marquee.moved = true;
      }
      updateMarqueeSelection();
      renderMarquee();
      renderNodes();
      event.preventDefault();
      return;
    }
    if (state.resizingNode) {
      const node = getNode(state.resizingNode.id);
      if (!node) return;
      const handle = state.resizingNode.handle;
      if (handle.includes("e")) {
        node.width = Math.round(clamp(
          state.resizingNode.width + (event.clientX - state.resizingNode.startX) / state.view.scale,
          minNodeWidth(node),
          maxNodeWidth(node)
        ));
      }
      if (handle.includes("s")) {
        node.height = Math.round(clamp(
          state.resizingNode.height + (event.clientY - state.resizingNode.startY) / state.view.scale,
          minNodeHeight(node),
          maxNodeHeight(node)
        ));
      }
      // Patch only this node + its links in place; full resync runs on pointer-up.
      if (patchNodeElementGeometry(node, state.resizingNode.element, state.resizingNode.ports)) {
        patchLinkElementRefs(state.resizingNode.linkRefs);
      } else {
        const context = getCanvasRenderContext();
        renderNodes(context);
        renderLinks(context);
      }
    } else if (state.draggingNode) {
      const node = getNode(state.draggingNode.id);
      if (!node) return;
      node.x = Math.round(state.draggingNode.nodeX + (event.clientX - state.draggingNode.startX) / state.view.scale);
      node.y = Math.round(state.draggingNode.nodeY + (event.clientY - state.draggingNode.startY) / state.view.scale);
      if (patchNodeElementGeometry(node, state.draggingNode.element, state.draggingNode.ports)) {
        patchLinkElementRefs(state.draggingNode.linkRefs);
      } else {
        const context = getCanvasRenderContext();
        renderNodes(context);
        renderLinks(context);
      }
    } else if (state.panning) {
      dom.viewport.scrollLeft = state.panning.scrollLeft - (event.clientX - state.panning.startX);
      dom.viewport.scrollTop = state.panning.scrollTop - (event.clientY - state.panning.startY);
      updateGridPosition();
      event.preventDefault();
    } else if (state.connectingFrom) {
      state.connectingTo = screenToBoard(event.clientX, event.clientY);
      renderLinks();
    }
  }

  function endPointerActions(event) {
    if (state.marquee) {
      finishMarquee(event);
      return;
    }
    const shouldCommitHistory = Boolean(state.draggingNode || state.resizingNode);
    const interactionNodeId = state.draggingNode?.id || state.resizingNode?.id || null;
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
    if (shouldCommitHistory) {
      commitGeometryHistoryCapture();
      // The interaction patched the canvas in place; refresh visible DOM once and
      // update only the affected minimap marker/geometry fields.
      resyncCanvasAfterInteraction(interactionNodeId);
    }
  }

  function handleWheel(event) {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const before = screenToBoard(event.clientX, event.clientY);
    const delta = event.deltaY < 0 ? 0.08 : -0.08;
    const nextScale = clamp(state.view.scale + delta, CANVAS_MIN_ZOOM, CANVAS_MAX_ZOOM);
    const rect = dom.viewport.getBoundingClientRect();
    state.view.scale = nextScale;
    state.view.x = event.clientX - rect.left + dom.viewport.scrollLeft - before.x * nextScale;
    state.view.y = event.clientY - rect.top + dom.viewport.scrollTop - before.y * nextScale;
    renderTransform();
    updateGridPosition();
    scheduleCanvasViewportRender();
    renderProjectPanel();
  }

  function handlePortClick(port) {
    const nodeId = port.dataset.nodeId;
    const kind = port.dataset.port;

    if (state.reconnectingLinkId) {
      const link = getLink(state.reconnectingLinkId);
      if (!link) {
        clearLinkReconnect();
        renderLinks();
        return;
      }
      if (state.reconnectingEnd === "to") {
        if (kind !== "input") {
          setStatus("Choose an input port for the new link target.");
          return;
        }
        if (link.from === nodeId) {
          setStatus("A link cannot target its own source.");
          return;
        }
        const historyBefore = getHistorySnapshot();
        link.to = nodeId;
        syncChoiceBranchLinksForNode(link.from, { markDirty: false, preferredLinkId: link.id });
        invalidateLinkIndexes();
        markProjectStructureChanged();
        finishLinkReconnect(link);
        commitHistoryFromSnapshot(historyBefore);
        return;
      }
      if (state.reconnectingEnd === "from") {
        if (kind !== "output") {
          setStatus("Choose an output port for the new link source.");
          return;
        }
        if (link.to === nodeId) {
          setStatus("A link cannot start from its own target.");
          return;
        }
        const historyBefore = getHistorySnapshot();
        link.from = nodeId;
        syncChoiceBranchLinksForNode(link.from, { markDirty: false, preferredLinkId: link.id });
        invalidateLinkIndexes();
        markProjectStructureChanged();
        finishLinkReconnect(link);
        commitHistoryFromSnapshot(historyBefore);
        return;
      }
    }

    if (kind === "output") {
      state.connectingFrom = nodeId;
      state.connectingTo = getOutputPoint(getNode(nodeId));
      dom.hint.classList.add("show");
      renderLinks();
      return;
    }

    if (kind === "input" && state.connectingFrom && state.connectingFrom !== nodeId) {
      const historyBefore = getHistorySnapshot();
      const link = {
        id: nextId("l", state.project.links),
        from: state.connectingFrom,
        to: nodeId
      };
      state.project.links.push(link);
      syncChoiceBranchLinksForNode(link.from, { markDirty: false, preferredLinkId: link.id });
      markProjectStructureChanged();
      clearStoryOrderOverrides();
      clearEventRowOrderOverrides();
      state.connectingFrom = null;
      state.connectingTo = null;
      dom.hint.classList.remove("show");
      state.selectedLinkId = link.id;
      clearNodeSelection();
      renderAll();
      setStatus(link.label ? `Link created: ${link.label}.` : "Link created.");
      commitHistoryFromSnapshot(historyBefore);
      return;
    }

    state.connectingFrom = null;
    state.connectingTo = null;
    dom.hint.classList.remove("show");
    renderLinks();
  }

  function addNode(type) {
    state.activeFileId = "adventure";
    renderShellState();
    renderWorkspaceFile();
    const rect = dom.viewport.getBoundingClientRect();
    const center = screenToBoard(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const node = {
      id: nextId("n", state.project.nodes),
      type,
      title: type === "Entry" ? "Start" : getNodeTypeLabel(type),
      body: defaultBody(type),
      x: 0,
      y: Math.round(center.y - 70)
    };
    if (type === "Choice") node.choices = ["Continue", "Turn back"];
    if (type === "Set") {
      node.variable = "flag";
      node.value = "true";
    }
    if (type === "Condition") node.condition = "flag == true";
    applyNodeTypeDefaults(node);
    node.x = Math.round(center.x - nodeLayoutSize(node).width / 2);
    state.project.nodes.push(normalizeNode(node));
    markProjectStructureChanged();
    selectNode(node.id);
    setStatus(`${getNodeTypeLabel(type)} added.`);
  }

  function addCustomNodeType() {
    const label = dom.customNodeName.value.trim();
    if (!label) {
      setStatus("Enter a custom node type name.");
      return;
    }
    const kind = dom.customNodeKind.value;
    const typeDef = normalizeCustomNodeType({
      type: uniqueCustomNodeTypeId(label),
      label,
      color: getCustomNodeFormColor(kind),
      kind,
      fields: parseCustomNodeFields(dom.customNodeFields.value)
    });
    state.project.nodeTypes = [...getProjectNodeTypes(), typeDef];
    markProjectStructureChanged({ nodeTypes: true });
    dom.customNodeName.value = "";
    dom.customNodeKind.value = "node";
    dom.customNodeFields.value = "";
    dom.customNodeColor.value = DEFAULT_CUSTOM_NODE_COLOR;
    renderPalette();
    renderInspector();
    setStatus(`${typeDef.label} node type added.`);
  }

  function getCustomNodeFormColor(kind) {
    const color = dom.customNodeColor.value || DEFAULT_CUSTOM_NODE_COLOR;
    if (color === DEFAULT_CUSTOM_NODE_COLOR && kind !== "node") return getDefaultNodeTypeColor(kind);
    return color;
  }

  function deleteCustomNodeType(type) {
    if (!type) return;
    const typeDef = getProjectNodeTypes().find((item) => item.type === type);
    if (!typeDef) return;
    const label = typeDef.label || type;
    const hasNodes = state.project.nodes.some((node) => node.type === type);
    const isDefault = Boolean(nodeTypes[type]);
    const message = hasNodes
      ? `Delete "${label}" from the Node Library schema? Existing canvas nodes stay in the project with their current data, but this type's field definition is removed.`
      : `Delete "${label}" from the Node Library schema? ${isDefault ? "Restore default types can bring this template back." : "Custom deleted types can only come back by importing or recreating them."}`;
    showGenericConfirm({
      kicker: "Node Library",
      title: `Delete ${label}?`,
      message,
      confirmLabel: "Delete",
      danger: true,
      recordHistory: true,
      onConfirm: () => deleteCustomNodeTypeConfirmed(type)
    });
  }

  function deleteCustomNodeTypeConfirmed(type) {
    const typeDef = getProjectNodeTypes().find((item) => item.type === type);
    if (!typeDef) return;
    const label = typeDef.label || type;
    state.project.nodeTypes = getProjectNodeTypes().filter((item) => item.type !== type);
    markProjectStructureChanged({ nodeTypes: true });
    renderPalette();
    renderInspector();
    setStatus(`${label} node type deleted.`);
  }

  function hideNodeType(type) {
    if (!type) return;
    const typeDef = getProjectNodeTypes().find((item) => item.type === type);
    if (!typeDef) return;
    typeDef.hidden = true;
    markProjectStructureChanged({ nodeTypes: true });
    renderPalette();
    renderInspector();
    setStatus(`${typeDef.label || type} hidden from Node Library. Data kept.`);
  }

  function restoreDefaultNodeTypes() {
    const current = getProjectNodeTypes();
    const byType = new Map(current.map((typeDef) => [typeDef.type, typeDef]));
    let restored = 0;

    defaultNodeTypeList().forEach((defaultType) => {
      const existing = byType.get(defaultType.type);
      if (existing) {
        if (existing.hidden) {
          existing.hidden = false;
          restored += 1;
        }
        return;
      }
      current.push(defaultType);
      restored += 1;
    });

    state.project.nodeTypes = normalizeNodeTypes(current);
    markProjectStructureChanged({ nodeTypes: true });
    renderAll();
    if (restored) {
      setStatus("Default node types restored.");
    } else {
      setStatus("Default node types are already available.");
    }
  }

  function restoreNodeType(type) {
    const typeDef = getNodeTypeDef(type);
    if (!typeDef) return;
    typeDef.hidden = false;
    markProjectStructureChanged({ nodeTypes: true });
    renderPalette();
    renderInspector();
    setStatus(`${typeDef.label || type} restored to Node Library.`);
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
    if (defaults[type]) return defaults[type];
    const kind = getNodeMeta(type).kind;
    if (isEventFrameKind(kind)) return "Group related beats into one event-sheet row.";
    return isFrameKind(kind) ? "Group related nodes." : "Write custom node content here.";
  }

  function applyNodeTypeDefaults(node) {
    const meta = getNodeMeta(node.type);
    ensureCustomFieldDefaults(node);
    if (isEventSheetNode(node)) ensureEventDefaults(node);
    if (isFrameNode(node)) {
      node.width = node.width || meta.width || 420;
      node.height = node.height || defaultNodeHeight(node, node.width);
    }
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
    invalidateCharacterRenderContext();
    state.activeFileId = "characters";
    renderCharacterListSurfaces();
    setStatus("Character added.");
  }

  function deleteCharacter(id) {
    const characters = getCharacters();
    const character = characters.find((item) => item.id === id);
    state.project.characters = characters.filter((item) => item.id !== id);
    invalidateCharacterRenderContext();
    state.project.nodes.forEach((node) => {
      node.cast = normalizeNodeCast(node.cast).filter((entry) => entry.characterId !== id);
      if (!node.cast.length) delete node.cast;
    });
    if (state.characterFocusId === id || !getCharacterById(state.characterFocusId)) state.characterFocusId = null;
    state.characterBacklinkExpandedIds?.delete(id);
    state.activeFileId = "characters";
    renderCharacterListSurfaces();
    setStatus(character ? `${character.name} deleted.` : "Character deleted.");
  }

  function setCharacterField(id, field, value, rerender) {
    const character = getCharacters().find((item) => item.id === id);
    if (!character) return;
    invalidateCharacterRenderContext();
    if (field === "name") {
      const previousName = character.name;
      character.name = value;
      state.project.nodes.forEach((node) => {
        if (node.type === "Dialog" && node.title === previousName) {
          node.title = value;
        }
      });
      if (rerender) {
        if (isCanvasFileActive()) {
          renderNodes();
          renderLinks();
          markCanvasSurfaceRendered();
        }
        renderStoryPanel();
      }
    } else {
      character[field] = value;
    }
    setProjectDirty(true);
    if (rerender) updateStatus();
    if (rerender) renderWorkspaceFile();
  }

  function focusCharacter(id) {
    const character = getCharacters().find((item) => item.id === id);
    if (!character) return;
    state.characterFocusId = id;
    state.activeFileId = "adventure";
    state.panel = "story";
    renderAll();
    setStatus(`${character.name} focus enabled.`);
  }

  function clearCharacterFocus() {
    state.characterFocusId = null;
    renderAll();
    setStatus("Character focus cleared.");
  }

  function clearCharacterSearch() {
    state.characterSearch = "";
    resetDocumentRenderLimit("characters");
    if (dom.characterSearchInput) dom.characterSearchInput.value = "";
    renderCharacterGridForSearch();
    setStatus("Character search cleared.");
  }

  function toggleCharacterBacklinks(id) {
    if (!id || !getCharacterById(id)) return;
    if (!state.characterBacklinkExpandedIds || !(state.characterBacklinkExpandedIds instanceof Set)) {
      state.characterBacklinkExpandedIds = new Set();
    }
    if (state.characterBacklinkExpandedIds.has(id)) {
      state.characterBacklinkExpandedIds.delete(id);
      setStatus("Character links collapsed.");
    } else {
      state.characterBacklinkExpandedIds.add(id);
      setStatus("Character links expanded.");
    }
    renderCharacterGridForSearch();
  }

  function addNodeCast() {
    const node = getNode(state.selectedNodeId);
    if (!node) return;
    const characterId = dom.nodePanel?.querySelector("[data-new-cast-character]")?.value || "";
    if (!characterId) {
      setStatus("Select a character first.");
      return;
    }
    const role = normalizeCastRole(dom.nodePanel?.querySelector("[data-new-cast-role]")?.value);
    const cast = normalizeNodeCast(node.cast);
    if (!cast.some((entry) => entry.characterId === characterId && entry.role === role)) {
      cast.push({ characterId, role });
    }
    node.cast = cast;
    renderCharacterAwareSurfaces(node);
    setStatus("Cast link added.");
  }

  function deleteNodeCast(index) {
    const node = getNode(state.selectedNodeId);
    if (!node || !Number.isInteger(index)) return;
    const cast = normalizeNodeCast(node.cast);
    if (index < 0 || index >= cast.length) return;
    cast.splice(index, 1);
    if (cast.length) node.cast = cast;
    else delete node.cast;
    renderCharacterAwareSurfaces(node);
    setStatus("Cast link removed.");
  }

  function setNodeCastField(index, field, value, rerender) {
    const node = getNode(state.selectedNodeId);
    if (!node || !Number.isInteger(index)) return;
    const cast = normalizeNodeCast(node.cast);
    const entry = cast[index];
    if (!entry) return;
    if (field === "characterId") {
      if (!getCharacters().some((character) => character.id === value)) return;
      entry.characterId = value;
    }
    if (field === "role") {
      entry.role = normalizeCastRole(value);
    }
    node.cast = normalizeNodeCast(cast);
    setProjectDirty(true);
    renderCharacterAwareSurfaces(rerender ? node : null);
  }

  function renderCharacterAwareSurfaces(nodeForPanel = null) {
    invalidateCharacterRenderContext();
    if (isCanvasFileActive()) {
      renderNodes();
      renderLinks();
      markCanvasSurfaceRendered();
    }
    renderStoryPanel();
    renderProjectPanel();
    renderWorkspaceFile();
    updateStatus();
    if (nodeForPanel) renderNodePanel(nodeForPanel);
  }

  function renderCharacterListSurfaces() {
    hideNodeContextMenu();
    renderShellState();
    if (state.activeFileId === "characters") {
      renderCharactersPage();
    } else {
      renderWorkspaceFile();
    }
    renderProjectPanel();
    renderStoryPanel();
    updateStatus();
  }

  function addVariable() {
    const variables = normalizeVariablesObject(state.project.variables);
    const key = uniqueVariableKey("new_variable");
    variables[key] = "";
    state.project.variables = variables;
    state.activeFileId = "variables";
    setProjectDirty(true);
    renderPlaybookSurfaces({ focusJsonToken: JSON.stringify(key) });
    setStatus("Variable added.");
  }

  function togglePlaybookJson() {
    state.playbookJsonOpen = !state.playbookJsonOpen;
    state.activeFileId = "variables";
    renderPlaybookSurfaces();
    setStatus(state.playbookJsonOpen ? "Advanced JSON shown." : "Advanced JSON hidden.");
  }

  function showPlaybookJsonAtToken(token) {
    state.playbookJsonOpen = true;
    state.activeFileId = "variables";
    renderPlaybookSurfaces({ focusJsonToken: token });
  }

  function addPlaybookNodeRule() {
    addPlaybookRule("text");
  }

  function addPlaybookChoiceRule() {
    addPlaybookRule("choices");
  }

  function addPlaybookStateRules() {
    addPlaybookRule("state");
  }

  function addPlaybookRule(kind) {
    const ruleKind = normalizePlaybookRuleKind(kind);
    if (ruleKind === "selected") {
      if (dom.playRuleDialog?.open) dom.playRuleDialog.close();
      addSelectedNodePlaybookRule();
      return;
    }
    if (ruleKind === "state") {
      if (dom.playRuleDialog?.open) dom.playRuleDialog.close();
      addPlaybookStateRulesPair();
      return;
    }

    const scripts = getScriptNodeTypes();
    const defaultTarget = getDefaultPlaybookRuleTargetForKind(ruleKind, scripts);
    const dialogTarget = dom.playRuleDialog?.open
      ? String(dom.playRuleTargetInput?.value || "").trim()
      : "";
    if (dom.playRuleDialog?.open) dom.playRuleDialog.close();
    let target = dialogTarget;
    if (!target && !dom.playRuleTargetInput) {
      setStatus("Play rule dialog is unavailable.");
      return;
    }
    if (!target) target = defaultTarget;
    if (!target) return;
    scripts[target] = applyPlaybookRulePreset(ruleKind, scripts[target]);
    state.project.script = normalizeScriptConfig({ nodeTypes: scripts });
    state.activeFileId = "variables";
    renderPlaybookSurfaces({ focusJsonToken: JSON.stringify(target) });
    updateStatus();
    setStatus(`${target} ${getPlaybookRuleKindLabel(ruleKind)} added.`);
  }

  function addPlaybookStateRulesPair() {
    const scripts = getScriptNodeTypes();
    scripts.Set = {
      ...(scripts.Set || {}),
      body: scripts.Set?.body || "Set {variable} = {value}.",
      set: scripts.Set?.set || { key: "variable", value: "value" }
    };
    scripts.Condition = {
      ...(scripts.Condition || {}),
      body: scripts.Condition?.body || "{condition}",
      condition: scripts.Condition?.condition || "condition"
    };
    state.project.script = normalizeScriptConfig({ nodeTypes: scripts });
    state.activeFileId = "variables";
    renderPlaybookSurfaces({ focusJsonToken: JSON.stringify("Set") });
    updateStatus();
    setStatus("Set and Condition Play rules added.");
  }

  function addSelectedNodePlaybookRule() {
    const node = getNode(state.selectedNodeId);
    if (!node) {
      setStatus("Select a node first.");
      return;
    }
    const ruleKind = inferPlaybookRuleKindFromNode(node);
    const target = node.type || node.id;
    const scripts = getScriptNodeTypes();
    scripts[target] = applyPlaybookRulePreset(ruleKind, scripts[target]);
    state.project.script = normalizeScriptConfig({ nodeTypes: scripts });
    state.activeFileId = "variables";
    renderPlaybookSurfaces({ focusJsonToken: JSON.stringify(target) });
    updateStatus();
    setStatus(`${target} rule added from selected node.`);
  }

  function normalizePlaybookRuleKind(kind) {
    return ["text", "choices", "set", "condition", "state", "selected"].includes(kind) ? kind : "text";
  }

  function getPlaybookRuleKindLabel(kind) {
    const labels = {
      text: "text rule",
      choices: "choice behavior",
      set: "variable write",
      condition: "condition gate"
    };
    return labels[kind] || "rule";
  }

  function getDefaultPlaybookRuleTargetForKind(kind, scripts) {
    if (kind === "choices") return "Choice";
    if (kind === "set") return "Set";
    if (kind === "condition") return "Condition";
    return getDefaultPlaybookRuleTarget(scripts);
  }

  function applyPlaybookRulePreset(kind, existing = {}) {
    const script = { ...(existing || {}) };
    if (kind === "text") {
      script.title = script.title || "{title}";
      script.body = script.body || "{body}";
    }
    if (kind === "choices") {
      script.title = script.title || "{title}";
      script.body = script.body || "{body}";
      script.choices = script.choices || "choices";
    }
    if (kind === "set") {
      script.body = script.body || "Set {variable} = {value}.";
      script.set = script.set || { key: "variable", value: "value" };
    }
    if (kind === "condition") {
      script.body = script.body || "{condition}";
      script.condition = script.condition || "condition";
    }
    return script;
  }

  function inferPlaybookRuleKindFromNode(node) {
    if (hasNodeChoices(node)) return "choices";
    if (getNodeVariableKey(node)) return "set";
    if (hasNodeCondition(node)) return "condition";
    return "text";
  }

  function getDefaultPlaybookRuleTarget(scripts) {
    const selectedNode = getNode(state.selectedNodeId);
    if (selectedNode?.type && !scripts[selectedNode.type]) return selectedNode.type;
    const unusedType = getProjectNodeTypes().find((typeDef) => !scripts[typeDef.type]);
    return unusedType?.type || selectedNode?.type || "Content";
  }

  function deleteVariable(key) {
    const variables = normalizeVariablesObject(state.project.variables);
    if (!key || !Object.prototype.hasOwnProperty.call(variables, key)) return;
    delete variables[key];
    state.project.variables = variables;
    state.activeFileId = "variables";
    setProjectDirty(true);
    renderPlaybookSurfaces();
    setStatus(`${key} deleted.`);
  }

  function setVariableField(key, field, value, rerender) {
    const variables = normalizeVariablesObject(state.project.variables);
    state.project.variables = variables;
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
    setProjectDirty(true);
    renderNodes();
    renderStoryPanel();
    renderProjectPanel();
    updateStatus();
    if (rerender) renderWorkspaceFile();
  }

  function selectNode(id, rerender = true) {
    state.activeFileId = "adventure";
    state.selectedNodeId = id;
    state.selectedNodeIds = [];
    state.selectedLinkId = null;
    state.panel = "node";
    if (rerender) renderAll();
  }

  function focusStoryNode(id) {
    const node = getNode(id);
    if (!node) return;
    state.selectedNodeId = id;
    state.selectedLinkId = null;
    state.panel = "story";
    renderAll();
    requestAnimationFrame(() => {
      const found = scrollStoryNodeIntoView(id);
      const label = node.title || getNodeDisplayId(node);
      setStatus(found
        ? `${label} shown in Story.`
        : `${label} is not in Story because it is not on the Entry path.`);
    });
  }

  function focusCanvasNode(id) {
    const node = getNode(id);
    if (!node) return;
    state.activeFileId = "adventure";
    state.selectedNodeId = id;
    state.selectedNodeIds = [];
    state.selectedLinkId = null;
    state.panel = "node";
    renderAll();
    requestAnimationFrame(() => {
      centerCanvasOnNode(node, NODE_FOCUS_ZOOM);
      setStatus(`${node.title || getNodeDisplayId(node)} focused.`);
    });
  }

  function focusCanvasNodeForInlineEdit(id) {
    const node = getNode(id);
    if (!node) return;
    state.activeFileId = "adventure";
    state.selectedNodeId = id;
    state.selectedNodeIds = [];
    state.selectedLinkId = null;
    state.panel = "node";
    state.inlineEditNodeId = id;
    state.inlineEditField = getInlineEditableField(node);
    renderAll();
    centerCanvasOnNode(node, NODE_FOCUS_ZOOM);
    focusInlineNodeEditor(id);
    setStatus(`${node.title || getNodeDisplayId(node)} focused for editing.`);
    requestAnimationFrame(() => {
      focusInlineNodeEditor(id);
    });
  }

  function focusCharacterNode(id) {
    const node = getNode(id);
    if (!node) return;
    state.activeFileId = "adventure";
    state.selectedNodeId = id;
    state.selectedLinkId = null;
    state.panel = "story";
    renderAll();
    requestAnimationFrame(() => {
      centerCanvasOnNode(node, NODE_FOCUS_ZOOM);
      scrollStoryNodeIntoView(id);
      setStatus(`${node.title || getNodeDisplayId(node)} focused.`);
    });
  }

  function scrollStoryNodeIntoView(id) {
    const target = dom.storyPanel?.querySelector(`[data-story-node-id="${id}"]`);
    if (!target) return false;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    return true;
  }

  function clearNodeSelection() {
    state.selectedNodeId = null;
    state.selectedNodeIds = [];
    if (state.panel === "node") state.panel = "project";
  }

  function editNodeType(type) {
    const typeDef = getNodeTypeDef(type);
    if (!typeDef) return;
    state.typeDialogType = typeDef.type;

    if (dom.nodeTypeDialog?.showModal) {
      dom.nodeTypeDialog.returnValue = "";
      dom.nodeTypeDialogTitle.textContent = `Edit ${typeDef.label}`;
      dom.nodeTypeNameInput.value = typeDef.label || typeDef.type;
      dom.nodeTypeKindInput.value = typeDef.kind || "node";
      dom.nodeTypeFieldsInput.value = formatNodeTypeFields(typeDef.fields);
      dom.nodeTypeColorInput.value = normalizeCustomColor(typeDef.color);
      dom.nodeTypeHiddenInput.checked = Boolean(typeDef.hidden);
      dom.nodeTypeDialog.showModal();
      requestAnimationFrame(() => {
        dom.nodeTypeNameInput.focus();
        dom.nodeTypeNameInput.select();
      });
      return;
    }

    showGenericTextInput({
      kicker: "Node Type",
      title: `Rename ${typeDef.label}`,
      label: "Name",
      value: typeDef.label || typeDef.type,
      maxLength: 40,
      confirmLabel: "Apply",
      recordHistory: true,
      onConfirm: (nextName) => {
        applyNodeTypeValues(typeDef.type, {
          label: nextName,
          kind: typeDef.kind,
          fields: typeDef.fields,
          color: typeDef.color,
          hidden: typeDef.hidden
        });
        return true;
      }
    });
  }

  function applyNodeTypeDialog() {
    applyNodeTypeValues(state.typeDialogType, {
      label: dom.nodeTypeNameInput.value,
      kind: dom.nodeTypeKindInput.value,
      fields: parseCustomNodeFields(dom.nodeTypeFieldsInput.value, getNodeTypeDef(state.typeDialogType)?.fields || []),
      color: dom.nodeTypeColorInput.value,
      hidden: dom.nodeTypeHiddenInput.checked
    });
  }

  function applyNodeTypeValues(type, values) {
    const typeDef = getNodeTypeDef(type);
    if (!typeDef) return;
    const label = String(values.label || "").trim().slice(0, 40);
    if (!label) {
      setStatus("Node type name is required.");
      return;
    }
    const previousFields = typeDef.fields || [];
    const nextFields = normalizeNodeTypeFields(values.fields);
    const nextFieldKeys = new Set(nextFields.map((field) => field.key));
    const removedFieldKeys = previousFields
      .map((field) => field.key)
      .filter((key) => key && !nextFieldKeys.has(key));

    typeDef.label = label;
    typeDef.kind = normalizeNodeTypeKind(values.kind);
    typeDef.fields = nextFields;
    typeDef.color = normalizeNodeTypeColor(typeDef.type, typeDef.kind, values.color);
    typeDef.hidden = Boolean(values.hidden);
    typeDef.width = clamp(typeDef.width || (isFrameKind(typeDef.kind) ? 420 : 230), 160, isFrameKind(typeDef.kind) ? 860 : 420);

    state.project.nodes
      .filter((node) => node.type === typeDef.type)
      .forEach((node) => {
        removedFieldKeys.forEach((key) => deleteNodeFieldValue(node, key));
        applyNodeTypeDefaults(node);
      });

    if (removedFieldKeys.length && isEventFrameKind(typeDef.kind)) {
      const removed = new Set(removedFieldKeys);
      const eventSheet = getProjectEventSheet();
      eventSheet.columns = eventSheet.columns.filter((column) => !column.custom || !removed.has(column.key));
      eventSheet.hiddenColumns = eventSheet.hiddenColumns.filter((key) => !removed.has(key));
    }

    markProjectStructureChanged({ nodeTypes: true });
    renderAll();
    setStatus(`${typeDef.label} node type updated.`);
  }

  function formatNodeTypeFields(fields) {
    return (fields || []).map((field) => field.label || field.key || "").filter(Boolean).join("\n");
  }

  function editNodeTypeBadge(type) {
    const typeDef = getNodeTypeDef(type);
    if (!typeDef) return;
    state.activeFileId = "adventure";
    state.selectedLinkId = null;
    state.iconDialogType = typeDef.type;

    const currentIcon = typeDef.badge || getDefaultNodeTypeBadge(typeDef.label);

    renderPalette();
    renderNodes();
    renderInspector();
    renderWorkspaceFile();
    updateStatus();

    if (dom.nodeIconDialog?.showModal) {
      dom.nodeIconDialog.returnValue = "";
      dom.nodeIconDialogTitle.textContent = `Edit icon for ${typeDef.label}`;
      dom.nodeIconInput.value = currentIcon;
      dom.nodeIconDialog.showModal();
      requestAnimationFrame(() => {
        dom.nodeIconInput.focus();
        dom.nodeIconInput.select();
      });
      return;
    }

    showGenericTextInput({
      kicker: "Node Icon",
      title: `Edit icon for ${typeDef.label}`,
      label: "Custom icon",
      value: currentIcon,
      maxLength: 8,
      message: "Leave blank to use the type initial.",
      confirmLabel: "Apply",
      recordHistory: true,
      onConfirm: (nextValue) => {
        applyNodeTypeBadgeValue(typeDef.type, nextValue);
        return true;
      }
    });
  }

  function applyNodeTypeBadgeDialog() {
    applyNodeTypeBadgeValue(state.iconDialogType, dom.nodeIconInput.value);
  }

  function resetNodeTypeBadgeDialog() {
    const typeDef = getNodeTypeDef(state.iconDialogType);
    if (!typeDef) return;
    typeDef.badge = getDefaultNodeTypeBadge(typeDef.label);
    typeDef.badgeCustom = false;
    markProjectStructureChanged({ nodeTypes: true });
    if (dom.nodeIconDialog?.open) dom.nodeIconDialog.close("reset");
    finishNodeTypeBadgeEdit("Node type icon now uses type initial.");
  }

  function applyNodeTypeBadgeValue(type, value) {
    const typeDef = getNodeTypeDef(type);
    if (!typeDef) return;
    const nextIcon = normalizeNodeTypeBadge(value);
    typeDef.badge = nextIcon || getDefaultNodeTypeBadge(typeDef.label);
    typeDef.badgeCustom = Boolean(nextIcon);
    markProjectStructureChanged({ nodeTypes: true });
    finishNodeTypeBadgeEdit(nextIcon ? "Node type icon updated." : "Node type icon now uses type initial.");
  }

  function finishNodeTypeBadgeEdit(message) {
    renderPalette();
    renderNodes();
    renderInspector();
    renderWorkspaceFile();
    updateStatus();
    setStatus(message);
  }

  function setProjectField(field, value) {
    if (field === "variables") {
      try {
        applyScriptJson(value);
        setStatus("Playbook JSON updated.");
      } catch (error) {
        setStatus("Playbook JSON is invalid.");
        return;
      }
    } else {
      state.project[field] = value;
    }
    setProjectDirty(true);

    if (field === "title" || field === "notes") {
      renderShellState();
      renderStoryPanel();
      renderWorkspaceFile();
      updateStatus();
      return;
    }

    if (field === "variables") {
      renderPlaybookSurfaces();
      return;
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
    invalidateCharacterRenderContext();
    if (field === "x" || field === "y") {
      node[field] = Number(value) || 0;
    } else if (field === "choices") {
      node.choices = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    } else if (field === "type") {
      node[field] = value;
      applyNodeTypeDefaults(node);
    } else {
      node[field] = value;
    }
    if (field === "type") markProjectStructureChanged({ nodeTypes: true });
    const choiceLinksChanged = field === "choices" || field === "type"
      ? syncChoiceBranchLinksForNode(node.id, { markDirty: false })
      : false;
    setProjectDirty(true);
    // Incremental: rebuild only the visible nodes (cheap) and patch this node's
    // incident links in place. The minimap only changes when position changes, and
    // the (potentially large) story panel is refreshed on a short debounce instead
    // of on every keystroke.
    renderNodes();
    if (choiceLinksChanged) renderLinks();
    else patchLinkElementRefs(collectLinkElementRefs(getIncidentLinks(node.id)));
    markCanvasSurfaceRenderedIfActive();
    if (field === "x" || field === "y") renderMinimap();
    if (field === "type") {
      renderInspector();
    } else {
      scheduleStoryPanelRender();
    }
    updateStatus();
  }

  function setNodeCustomField(key, value, rerender) {
    const node = getNode(state.selectedNodeId);
    if (!node) return;
    const fields = getNodeMeta(node.type).fields || [];
    if (!fields.some((field) => field.key === key)) return;
    invalidateCharacterRenderContext();
    if (key === "choices") {
      node.choices = parseChoiceLines(value);
    } else if (isDirectNodeField(key)) {
      node[key] = value;
    } else {
      if (!node.customFields || typeof node.customFields !== "object" || Array.isArray(node.customFields)) node.customFields = {};
      node.customFields[key] = value;
    }
    const choiceLinksChanged = key === "choices"
      ? syncChoiceBranchLinksForNode(node.id, { markDirty: false })
      : false;
    setProjectDirty(true);
    renderNodes();
    if (choiceLinksChanged) renderLinks();
    else patchLinkElementRefs(collectLinkElementRefs(getIncidentLinks(node.id)));
    markCanvasSurfaceRenderedIfActive();
    scheduleStoryPanelRender();
    renderProjectPanel();
    updateStatus();
    if (rerender) renderNodePanel(node);
  }

  function setEventField(nodeId, field, value, rerender) {
    const node = getNode(nodeId);
    const column = getEventSheetColumns().find((item) => item.key === field);
    if (!node || !column || column.readonly) return;
    invalidateCharacterRenderContext();
    if (column.custom && !isDirectNodeField(field)) {
      if (!node.customFields || typeof node.customFields !== "object" || Array.isArray(node.customFields)) node.customFields = {};
      node.customFields[field] = value;
    } else if (field === "choices") {
      node.choices = parseChoiceLines(value);
    } else {
      node[field] = value;
    }
    if (field === "eventDescription" && !node.body) node.body = value;
    if (field === "choices") syncChoiceBranchLinksForNode(node.id, { markDirty: false });
    setProjectDirty(true);
    renderNodes();
    if (isCanvasFileActive()) {
      renderLinks();
      markCanvasSurfaceRendered();
    }
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
    invalidateCharacterRenderContext();
    selectNode(copy.id);
    setStatus("Node duplicated.");
  }

  function deleteSelectedNode() {
    if (!state.selectedNodeId) return;
    const id = state.selectedNodeId;
    archiveDeletedNode(id);
    state.project.nodes = state.project.nodes.filter((node) => node.id !== id);
    state.project.links = state.project.links.filter((link) => link.from !== id && link.to !== id);
    invalidateCharacterRenderContext();
    clearStoryOrderOverrides();
    clearEventRowOrderOverrides();
    clearNodeSelection();
    renderAll();
    setStatus("Node deleted and archived outside runtime.");
  }

  function archiveDeletedNode(id) {
    const node = getNode(id);
    if (!node) return;
    const removedLinks = state.project.links.filter((link) => link.from === id || link.to === id);
    if (!Array.isArray(state.project.deletedNodes)) state.project.deletedNodes = [];
    state.project.deletedNodes.unshift({
      deletedAt: new Date().toISOString(),
      node: cloneProject(node),
      links: cloneProject(removedLinks)
    });
    state.project.deletedNodes = state.project.deletedNodes.slice(0, 50);
  }

  function deleteSelectedLink() {
    if (!state.selectedLinkId) return;
    state.project.links = state.project.links.filter((link) => link.id !== state.selectedLinkId);
    clearStoryOrderOverrides();
    clearEventRowOrderOverrides();
    state.selectedLinkId = null;
    renderAll();
    setStatus("Link deleted.");
  }

  function deleteContextLink() {
    const linkId = state.contextLinkId || state.selectedLinkId;
    if (!linkId) return;
    state.project.links = state.project.links.filter((link) => link.id !== linkId);
    clearStoryOrderOverrides();
    clearEventRowOrderOverrides();
    state.selectedLinkId = null;
    clearLinkReconnect();
    hideNodeContextMenu();
    renderAll();
    setStatus("Link deleted.");
  }

  function assignChoiceLink(linkId, choiceIndexValue) {
    const link = getLink(linkId || state.contextLinkId || state.selectedLinkId);
    const source = link ? getNode(link.from) : null;
    const choiceIndex = normalizeChoiceIndex(choiceIndexValue);
    const choices = getChoiceBranchLabels(source);
    if (!link || choiceIndex == null || !choices[choiceIndex]) {
      setStatus("Could not assign choice branch.");
      return;
    }
    link.choiceIndex = choiceIndex;
    link.label = choices[choiceIndex];
    syncChoiceBranchLinksForNode(link.from, { markDirty: false, preferredLinkId: link.id });
    state.selectedLinkId = link.id;
    clearNodeSelection();
    clearStoryOrderOverrides();
    clearEventRowOrderOverrides();
    hideNodeContextMenu();
    renderAll();
    setProjectDirty(true);
    setStatus(`Choice branch set: ${choices[choiceIndex]}.`);
  }

  function startLinkReconnect(end) {
    const link = getLink(state.contextLinkId || state.selectedLinkId);
    if (!link || !["from", "to"].includes(end)) return;
    state.reconnectingLinkId = link.id;
    state.reconnectingEnd = end;
    state.selectedLinkId = link.id;
    hideNodeContextMenu();

    if (end === "to") {
      state.connectingFrom = link.from;
      state.connectingTo = getOutputPoint(getNode(link.from));
      dom.hint.textContent = "Click a new input port to reconnect this link.";
    } else {
      state.connectingFrom = null;
      state.connectingTo = null;
      dom.hint.textContent = "Click a new output port to reconnect this link.";
    }

    dom.hint.classList.add("show");
    renderLinks();
    setStatus(end === "to" ? "Choose a new input port." : "Choose a new output port.");
  }

  function finishLinkReconnect(link) {
    clearStoryOrderOverrides();
    clearEventRowOrderOverrides();
    state.selectedLinkId = link.id;
    clearNodeSelection();
    clearLinkReconnect();
    renderAll();
    setStatus("Link reconnected.");
  }

  function clearLinkReconnect() {
    state.reconnectingLinkId = null;
    state.reconnectingEnd = null;
    state.connectingFrom = null;
    state.connectingTo = null;
    if (dom.hint) {
      dom.hint.textContent = "Click an output port, then an input port to connect nodes.";
      dom.hint.classList.remove("show");
    }
  }

  function focusSelectedNode() {
    const node = getNode(state.selectedNodeId);
    if (!node) return;
    state.activeFileId = "adventure";
    state.panel = "node";
    renderAll();
    centerCanvasOnNode(node, NODE_FOCUS_ZOOM);
    setStatus(`${node.title || getNodeDisplayId(node)} focused.`);
  }

  function centerCanvasOnNode(node, scale = state.view.scale) {
    const size = nodeSize(node);
    centerCanvasOnBoardPoint(node.x + size.width / 2, node.y + size.height / 2, scale);
  }

  function centerCanvasOnBoardPoint(boardX, boardY, scale = state.view.scale) {
    resetCanvasScroll();
    const rect = dom.viewport.getBoundingClientRect();
    state.view.scale = clamp(scale, CANVAS_MIN_ZOOM, CANVAS_MAX_ZOOM);
    state.view.x = rect.width / 2 - boardX * state.view.scale;
    state.view.y = rect.height / 2 - boardY * state.view.scale;
    renderTransform();
    updateGridPosition();
    scheduleCanvasViewportRender();
  }

  function handleMinimapPointerDown(event) {
    event.preventDefault();
    event.stopPropagation();
    const point = minimapPointToBoard(event.clientX, event.clientY);
    centerCanvasOnBoardPoint(point.x, point.y);
    setStatus("Canvas moved from minimap.");
  }

  function minimapPointToBoard(clientX, clientY) {
    const rect = dom.minimap.getBoundingClientRect();
    const x = clamp((clientX - rect.left) / Math.max(rect.width, 1), 0, 1) * BOARD_WIDTH;
    const y = clamp((clientY - rect.top) / Math.max(rect.height, 1), 0, 1) * BOARD_HEIGHT;
    return { x, y };
  }

  function openNodeInspector() {
    if (!getNode(state.selectedNodeId)) {
      if (state.panel === "node") {
        state.panel = "project";
        renderInspector();
      }
      showNodeRequiredDialog();
      return;
    }
    focusSelectedNode();
  }

  function centerView(announce = true) {
    const bounds = getProjectBounds();
    resetCanvasScroll();
    const rect = dom.viewport.getBoundingClientRect();
    const availableWidth = Math.max(rect.width - CANVAS_VIEW_PADDING * 2, 1);
    const availableHeight = Math.max(rect.height - CANVAS_VIEW_PADDING * 2, 1);
    const scaleX = availableWidth / Math.max(bounds.width, 1);
    const scaleY = availableHeight / Math.max(bounds.height, 1);
    state.view.scale = clamp(Math.min(scaleX, scaleY, CANVAS_MAX_AUTO_SCALE), CANVAS_MIN_AUTO_SCALE, CANVAS_MAX_AUTO_SCALE);
    state.view.x = getCanvasAxisOffset(bounds.x, bounds.width, state.view.scale, rect.width);
    state.view.y = getCanvasAxisOffset(bounds.y, bounds.height, state.view.scale, rect.height);
    renderTransform();
    updateGridPosition();
    scheduleCanvasViewportRender();
    renderProjectPanel();
    if (announce) setStatus("Canvas centered.");
  }

  function centerViewAtScale(scale = DEFAULT_CANVAS_ZOOM, announce = false) {
    const bounds = getProjectBounds();
    resetCanvasScroll();
    const rect = dom.viewport.getBoundingClientRect();
    state.view.scale = clamp(scale, CANVAS_MIN_ZOOM, CANVAS_MAX_ZOOM);
    state.view.x = getCanvasAxisOffset(bounds.x, bounds.width, state.view.scale, rect.width);
    state.view.y = getCanvasAxisOffset(bounds.y, bounds.height, state.view.scale, rect.height);
    renderTransform();
    updateGridPosition();
    scheduleCanvasViewportRender();
    renderProjectPanel();
    if (announce) setStatus("Canvas centered.");
  }

  function autoLayoutCanvas(orientation = "horizontal") {
    if (!state.project.nodes.length) {
      setStatus("No nodes to arrange.");
      return;
    }

    const direction = orientation === "vertical" ? "vertical" : "horizontal";
    const frameChildren = getAutoLayoutFrameChildren();
    const layoutItems = state.project.nodes.filter((node) => !isFrameNode(node) || !(frameChildren.get(node.id) || []).length);
    const depths = getAutoLayoutDepths(layoutItems);

    positionAutoLayoutItems(layoutItems, depths, direction);
    fitAutoLayoutFrames(frameChildren);

    state.activeFileId = "adventure";
    markProjectStructureChanged();
    renderAll();
    centerView(false);
    setStatus(direction === "horizontal" ? "Canvas arranged horizontally." : "Canvas arranged vertically.");
  }

  function getAutoLayoutFrameChildren() {
    const frames = state.project.nodes.filter((node) => isFrameNode(node));
    const frameChildren = new Map(frames.map((frame) => [frame.id, []]));
    state.project.nodes.forEach((node) => {
      const parent = getSmallestContainingFrame(node, frames);
      if (parent) frameChildren.get(parent.id)?.push(node.id);
    });
    return frameChildren;
  }

  function getAutoLayoutDepths(items) {
    const itemIds = new Set(items.map((node) => node.id));
    const depths = new Map();
    const roots = getAutoLayoutRoots(items, itemIds);
    const queue = [];

    roots.forEach((node) => {
      depths.set(node.id, 0);
      queue.push(node.id);
    });

    while (queue.length) {
      const id = queue.shift();
      const depth = depths.get(id) || 0;
      getOutgoing(id).forEach((link) => {
        if (!itemIds.has(link.to) || depths.has(link.to)) return;
        depths.set(link.to, depth + 1);
        queue.push(link.to);
      });
    }

    const maxDepth = depths.size ? Math.max(...depths.values()) : 0;
    getSortedAutoLayoutItems(items).forEach((node) => {
      if (!depths.has(node.id)) depths.set(node.id, maxDepth + 1);
    });
    return depths;
  }

  function getAutoLayoutRoots(items, itemIds) {
    const incoming = new Set(
      state.project.links
        .filter((link) => itemIds.has(link.from) && itemIds.has(link.to))
        .map((link) => link.to)
    );
    const roots = items.filter((node) => !incoming.has(node.id));
    const entry = items.find((node) => node.type === "Entry");
    if (!entry) return roots.length ? getSortedAutoLayoutItems(roots) : getSortedAutoLayoutItems(items).slice(0, 1);
    return [entry, ...getSortedAutoLayoutItems(roots.filter((node) => node.id !== entry.id))];
  }

  function positionAutoLayoutItems(items, depths, direction) {
    const ranks = [...new Set(depths.values())].sort((a, b) => a - b);
    const startX = getAutoLayoutStart(items, "x", 80);
    const startY = getAutoLayoutStart(items, "y", 120);

    if (direction === "vertical") {
      let y = startY;
      ranks.forEach((rank) => {
        const rankItems = getSortedAutoLayoutItems(items.filter((node) => depths.get(node.id) === rank));
        let x = startX;
        const rowHeight = Math.max(...rankItems.map((node) => nodeSize(node).height), 0);
        rankItems.forEach((node) => {
          node.x = Math.round(x);
          node.y = Math.round(y);
          x += nodeSize(node).width + AUTO_LAYOUT_NODE_GAP;
        });
        y += rowHeight + AUTO_LAYOUT_RANK_GAP;
      });
      return;
    }

    let x = startX;
    ranks.forEach((rank) => {
      const rankItems = getSortedAutoLayoutItems(items.filter((node) => depths.get(node.id) === rank));
      let y = startY;
      const columnWidth = Math.max(...rankItems.map((node) => nodeSize(node).width), 0);
      rankItems.forEach((node) => {
        node.x = Math.round(x);
        node.y = Math.round(y);
        y += nodeSize(node).height + AUTO_LAYOUT_NODE_GAP;
      });
      x += columnWidth + AUTO_LAYOUT_RANK_GAP;
    });
  }

  function getAutoLayoutStart(items, key, fallback) {
    const values = items.map((node) => Number(node[key])).filter(Number.isFinite);
    if (!values.length) return fallback;
    return Math.max(40, Math.min(...values));
  }

  function getSortedAutoLayoutItems(items) {
    const storyOrder = new Map(getReachableStory().map((node, index) => [node.id, index]));
    return [...items].sort((a, b) => {
      const storyA = storyOrder.get(a.id) ?? Number.POSITIVE_INFINITY;
      const storyB = storyOrder.get(b.id) ?? Number.POSITIVE_INFINITY;
      if (storyA !== storyB) return storyA - storyB;
      return a.y - b.y || a.x - b.x || a.id.localeCompare(b.id);
    });
  }

  function fitAutoLayoutFrames(frameChildren) {
    const frames = state.project.nodes
      .filter((node) => isFrameNode(node))
      .sort((a, b) => getAutoLayoutFrameDepth(b.id, frameChildren) - getAutoLayoutFrameDepth(a.id, frameChildren));

    frames.forEach((frame) => {
      const children = (frameChildren.get(frame.id) || [])
        .map(getNode)
        .filter((node) => node && node.id !== frame.id);
      if (!children.length) return;
      const bounds = getCombinedNodeBounds(children);
      frame.x = Math.max(40, Math.round(bounds.left - AUTO_LAYOUT_FRAME_PADDING));
      frame.y = Math.max(40, Math.round(bounds.top - AUTO_LAYOUT_FRAME_PADDING - AUTO_LAYOUT_FRAME_HEADER));
      frame.width = Math.max(minNodeWidth(frame), Math.round(bounds.right - frame.x + AUTO_LAYOUT_FRAME_PADDING));
      frame.height = Math.max(minNodeHeight(frame), Math.round(bounds.bottom - frame.y + AUTO_LAYOUT_FRAME_PADDING));
    });
  }

  function getAutoLayoutFrameDepth(frameId, frameChildren, seen = new Set()) {
    if (seen.has(frameId)) return 0;
    seen.add(frameId);
    for (const [parentId, childIds] of frameChildren.entries()) {
      if (childIds.includes(frameId)) return 1 + getAutoLayoutFrameDepth(parentId, frameChildren, seen);
    }
    return 0;
  }

  function getCombinedNodeBounds(nodes) {
    const bounds = nodes.map(getNodeBounds);
    return {
      left: Math.min(...bounds.map((item) => item.left)),
      top: Math.min(...bounds.map((item) => item.top)),
      right: Math.max(...bounds.map((item) => item.right)),
      bottom: Math.max(...bounds.map((item) => item.bottom))
    };
  }

  function settleInitialCanvasView() {
    centerViewAtScale(DEFAULT_CANVAS_ZOOM, false);
    const schedule = window.requestAnimationFrame?.bind(window) || ((callback) => setTimeout(callback, 0));
    schedule(() => {
      centerViewAtScale(DEFAULT_CANVAS_ZOOM, false);
      schedule(() => centerViewAtScale(DEFAULT_CANVAS_ZOOM, false));
    });
  }

  function getCanvasAxisOffset(origin, size, scale, viewportSize) {
    const scaledSize = size * scale;
    if (scaledSize + CANVAS_VIEW_PADDING * 2 > viewportSize) {
      return CANVAS_VIEW_PADDING - origin * scale;
    }
    return (viewportSize - scaledSize) / 2 - origin * scale;
  }

  function setZoom(value) {
    const rect = dom.viewport.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const before = screenToBoard(centerX, centerY);
    state.view.scale = clamp(value, CANVAS_MIN_ZOOM, CANVAS_MAX_ZOOM);
    state.view.x = centerX - rect.left + dom.viewport.scrollLeft - before.x * state.view.scale;
    state.view.y = centerY - rect.top + dom.viewport.scrollTop - before.y * state.view.scale;
    renderTransform();
    updateGridPosition();
    scheduleCanvasViewportRender();
    renderProjectPanel();
  }

  function toggleTheme() {
    state.theme = state.theme === "light" ? "dark" : "light";
    renderShellState();
    renderTransform();
    updateGridPosition();
  }

  function normalizeExportImageScale(value) {
    const numeric = Number(value);
    const preset = EXPORT_IMAGE_SCALES.find((item) => item.scale === numeric || item.value === String(value));
    return preset ? preset.scale : 1;
  }

  function getExportImageScalePreset(scale = state.exportImageScale) {
    return EXPORT_IMAGE_SCALES.find((item) => item.scale === normalizeExportImageScale(scale)) || EXPORT_IMAGE_SCALES[0];
  }

  function setExportImageScale(value) {
    const preset = getExportImageScalePreset(value);
    state.exportImageScale = preset.scale;
    renderShellState();
    setStatus(`Image export resolution set to ${preset.label}.`);
  }

  function updateGridPosition() {
    const scrollLeft = dom.viewport?.scrollLeft || 0;
    const scrollTop = dom.viewport?.scrollTop || 0;
    dom.viewport.style.backgroundPosition = `${state.view.x - scrollLeft}px ${state.view.y - scrollTop}px`;
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

  function createBlankProject(title = "Untitled") {
    const projectTitle = normalizeNewProjectTitle(title);
    return {
      title: projectTitle,
      notes: "",
      variables: defaultVariables(),
      nodeTypes: defaultNodeTypeList(),
      customNodeTypes: [],
      characters: [],
      nodes: [normalizeNode({ id: "n0", type: "Entry", title: "Start", body: "Adventure Begins", x: 120, y: 120 })],
      links: []
    };
  }

  function normalizeNewProjectTitle(value) {
    return String(value || "").trim() || "Untitled";
  }

  function getNewProjectTitleInput() {
    return normalizeNewProjectTitle(dom.newProjectNameInput?.value);
  }

  async function newProject(title = "Untitled") {
    const projectTitle = normalizeNewProjectTitle(title);
    state.project = createBlankProject(projectTitle);
    markProjectStructureChanged({ nodeTypes: true });
    state.selectedNodeId = "n0";
    state.selectedLinkId = null;
    state.panel = "project";
    state.activeFileId = "adventure";
    centerViewAtScale(DEFAULT_CANVAS_ZOOM, false);
    resetHistory();
    setProjectDirty(true);
    renderAll();
    setStatus("Creating new project file...");
    const target = await createVaultProjectForNewProject();
    renderProjectFileStatus();
    if (!target && window.NarrativeCanvasHost?.createProjectFile) {
      setStatus("New project created, but vault file creation failed.");
    } else if (!target) {
      setStatus("New project created.");
    }
  }

  function showNewProjectConfirm() {
    if (dom.newProjectNameInput) {
      dom.newProjectNameInput.value = "Untitled";
    }
    updateNewProjectPathPreview();
    if (dom.confirmDialog?.showModal) {
      dom.confirmDialog.returnValue = "";
      dom.confirmDialog.showModal();
      requestAnimationFrame(() => {
        dom.newProjectNameInput?.focus();
        dom.newProjectNameInput?.select();
      });
      return;
    }
    showGenericConfirm({
      kicker: "New Canvas",
      title: "Create a blank project?",
      message: "Discard the current canvas and create a blank one?",
      confirmLabel: "Create",
      danger: true,
      onConfirm: () => newProject("Untitled")
    });
  }

  function confirmNewProject() {
    if (dom.confirmDialog?.open) {
      dom.confirmDialog.returnValue = "handled";
      dom.confirmDialog.close("handled");
    }
    void newProject(getNewProjectTitleInput());
  }

  function closeNewProjectConfirm() {
    if (dom.confirmDialog?.open) {
      dom.confirmDialog.returnValue = "cancel";
      dom.confirmDialog.close("cancel");
    }
  }

  async function updateNewProjectPathPreview() {
    if (!dom.newProjectPathPreview) return;
    const host = window.NarrativeCanvasHost;
    const projectTitle = getNewProjectTitleInput();
    const project = createBlankProject(projectTitle);
    if (!host?.previewNewProjectFile) {
      dom.newProjectPathPreview.textContent = host
        ? "A new .ncanvas file will be created from the plugin save settings."
        : "The new project will use browser storage until you save or export it.";
      return;
    }
    try {
      const target = await host.previewNewProjectFile(JSON.stringify(buildSavedStateForProject(project), null, 2), {
        filenameProjectTitle: projectTitle
      });
      dom.newProjectPathPreview.textContent = target
        ? `New file: ${target}`
        : "A new .ncanvas file will be created from the plugin save settings.";
    } catch (error) {
      console.error(error);
      dom.newProjectPathPreview.textContent = "Could not preview the new project file name.";
    }
  }

  function showNodeRequiredDialog() {
    if (dom.nodeRequiredDialog?.showModal) {
      if (!dom.nodeRequiredDialog.open) dom.nodeRequiredDialog.showModal();
      return;
    }
    setStatus("Select a node first to open the Node inspector.");
  }

  async function saveCurrentState(options = {}) {
    const silent = Boolean(options.silent);
    clearAutoSaveTimer();
    const dirtyVersionAtStart = state.dirtyVersion;
    state.isSaving = true;
    state.saveError = false;
    renderProjectFileStatus();

    const savedState = buildSavedState();
    const savedStateJson = JSON.stringify(savedState, null, 2);
    try {
      const host = window.NarrativeCanvasHost;
      if (host?.saveState || host?.saveProject) {
        const targets = [];
        if (host.saveProject) {
          const projectTarget = await host.saveProject(savedStateJson);
          if (projectTarget) targets.push(projectTarget);
        } else if (host.saveState) {
          const stateTarget = await host.saveState(savedState);
          if (stateTarget) targets.push(stateTarget);
        }
        finishSuccessfulSave(dirtyVersionAtStart);
        if (!silent) setStatus(targets.length ? `Project saved to ${targets.join(" and ")}.` : "Project saved.");
        return true;
      }
      saveWebState(savedState);
      finishSuccessfulSave(dirtyVersionAtStart);
      if (!silent) setStatus("Project saved.");
      return true;
    } catch (error) {
      console.error(error);
      state.isSaving = false;
      state.saveError = true;
      renderProjectFileStatus();
      scheduleAutoSave();
      if (!silent) setStatus("Project save failed.");
      return false;
    }
  }

  function finishSuccessfulSave(dirtyVersionAtStart) {
    state.isSaving = false;
    state.saveError = false;
    if (state.dirtyVersion === dirtyVersionAtStart) {
      setProjectDirty(false);
      return;
    }
    state.hasUnsavedChanges = true;
    renderProjectFileStatus();
    scheduleAutoSave();
  }

  async function createVaultProjectForNewProject() {
    const host = window.NarrativeCanvasHost;
    if (!host?.createProjectFile) return "";
    try {
      const projectTitle = state.project?.title || "Untitled";
      const target = await host.createProjectFile(JSON.stringify(buildSavedState(), null, 2), {
        filenameProjectTitle: projectTitle
      });
      if (target) {
        setProjectDirty(false);
        renderProjectFileStatus();
        setStatus(`New project created at ${target}.`);
      }
      return target || "";
    } catch (error) {
      console.error(error);
      setStatus("New project created, but vault JSON creation failed.");
      renderProjectFileStatus();
      return "";
    }
  }

  async function createSampleProjectFile() {
    state.project = cloneProject(sampleProject);
    markProjectStructureChanged({ nodeTypes: true });
    state.selectedNodeId = state.project.nodes[0]?.id || null;
    state.selectedLinkId = null;
    state.panel = "project";
    state.activeFileId = "adventure";
    centerViewAtScale(DEFAULT_CANVAS_ZOOM, false);
    resetHistory();
    setProjectDirty(true);
    renderAll();

    const host = window.NarrativeCanvasHost;
    if (!host?.createProjectFile) {
      saveWebState(buildSavedState());
      setProjectDirty(false);
      setStatus("Sample project loaded in browser storage.");
      return true;
    }

    try {
      setStatus("Creating sample project...");
      const target = await host.createProjectFile(JSON.stringify(buildSavedState(), null, 2), {
        filenameOverride: SAMPLE_PROJECT_FILENAME,
        filenameProjectTitle: sampleProject.title
      });
      setProjectDirty(false);
      renderProjectFileStatus();
      setStatus(target ? `Sample project created at ${target}.` : "Sample project opened.");
      return true;
    } catch (error) {
      console.error(error);
      setStatus("Sample project creation failed.");
      renderProjectFileStatus();
      return false;
    }
  }

  async function loadCurrentVaultProject() {
    const restoredView = await loadFromVault(true);
    if (restoredView === null) return false;
    if (!state.selectedNodeId) state.selectedNodeId = state.project.nodes[0]?.id || null;
    resetHistory();
    renderAll();
    if (!restoredView) settleInitialCanvasView();
    return true;
  }

  async function loadSavedState(announce = true) {
    const host = window.NarrativeCanvasHost;
    if (host?.loadProject) {
      const restoredVaultView = await loadFromVault(announce);
      if (restoredVaultView !== null) return restoredVaultView;
      return false;
    }

    if (host?.loadState) {
      try {
        const saved = await host.loadState();
        if (saved) {
          const restoredView = applySavedState(saved);
          setProjectDirty(false);
          if (announce) setStatus(`Loaded ${host.stateFile || "saved state"}.`);
          return restoredView;
        }
      } catch (error) {
        console.error(error);
        if (announce) setStatus("Could not load saved state.");
      }
    }

    if (!host && shouldLoadWebState()) {
      const saved = loadWebState();
      if (saved) {
        const restoredView = applySavedState(saved);
        setProjectDirty(false);
        if (announce) setStatus("Loaded browser saved state.");
        return restoredView;
      }
    }

    return false;
  }

  function shouldLoadWebState() {
    try {
      return !new URLSearchParams(window.location.search).has("smoke");
    } catch (_error) {
      return true;
    }
  }

  function buildSavedState() {
    state.project = normalizeProject(state.project);
    return buildSavedStateForProject(state.project, {
      selectedNodeId: state.selectedNodeId,
      selectedLinkId: state.selectedLinkId,
      panel: state.panel,
      activeFileId: state.activeFileId,
      theme: state.theme,
      exportImageScale: state.exportImageScale,
      view: { ...state.view },
      sidebar: getSavedSidebarState(),
      search: state.search,
      characterSearch: state.characterSearch,
      eventSearch: state.eventSearch,
      playbookJsonOpen: state.playbookJsonOpen
    });
  }

  function buildSavedStateForProject(project, uiOverrides = {}) {
    return {
      version: SAVED_STATE_VERSION,
      savedAt: new Date().toISOString(),
      project: cloneProject(normalizeProject(project)),
      ui: {
        selectedNodeId: null,
        selectedLinkId: null,
        panel: "project",
        activeFileId: "adventure",
        theme: state.theme,
        exportImageScale: state.exportImageScale,
        view: { x: 0, y: 0, scale: DEFAULT_CANVAS_ZOOM },
        sidebar: getSavedSidebarState(),
        search: "",
        characterSearch: "",
        eventSearch: "",
        playbookJsonOpen: false,
        ...uiOverrides
      }
    };
  }

  function applySavedState(saved) {
    const payload = parseSavedPayload(saved);
    if (!payload) return false;
    const projectSource = payload.project || payload;
    state.project = normalizeProject(projectSource);
    markProjectStructureChanged({ nodeTypes: true });
    invalidateCharacterRenderContext();

    const ui = payload.ui || {};
    state.selectedNodeId = getValidSavedNodeId(ui.selectedNodeId);
    state.selectedLinkId = getValidSavedLinkId(ui.selectedLinkId);
    state.panel = getValidSavedPanel(ui.panel, state.selectedNodeId);
    state.activeFileId = fileViews[ui.activeFileId] ? ui.activeFileId : "adventure";
    state.theme = ui.theme === "light" ? "light" : "dark";
    state.exportImageScale = normalizeExportImageScale(ui.exportImageScale);
    applySavedSidebarState(ui.sidebar);
    state.search = typeof ui.search === "string" ? ui.search : "";
    state.characterSearch = typeof ui.characterSearch === "string" ? ui.characterSearch : "";
    state.eventSearch = typeof ui.eventSearch === "string" ? ui.eventSearch : "";
    state.playbookJsonOpen = Boolean(ui.playbookJsonOpen);
    return applySavedView(ui.view);
  }

  function parseSavedPayload(saved) {
    if (!saved) return null;
    if (typeof saved !== "string") return saved;
    try {
      return JSON.parse(saved);
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  function getValidSavedNodeId(nodeId) {
    return state.project.nodes.some((node) => node.id === nodeId) ? nodeId : null;
  }

  function getValidSavedLinkId(linkId) {
    return state.project.links.some((link) => link.id === linkId) ? linkId : null;
  }

  function getValidSavedPanel(panel, selectedNodeId) {
    if (!validPanels.has(panel)) return "project";
    if (panel === "node" && !selectedNodeId) return "project";
    return panel;
  }

  function normalizeView(view) {
    if (!view || typeof view !== "object") return { x: 0, y: 0, scale: DEFAULT_CANVAS_ZOOM };
    const x = Number(view.x);
    const y = Number(view.y);
    const scale = Number(view.scale);
    if (![x, y, scale].every(Number.isFinite)) return { x: 0, y: 0, scale: DEFAULT_CANVAS_ZOOM };
    return {
      x,
      y,
      scale: clamp(scale, CANVAS_MIN_ZOOM, CANVAS_MAX_ZOOM)
    };
  }

  function applySavedView(view) {
    if (!view || typeof view !== "object") return false;
    const normalized = normalizeView(view);
    state.view = normalized;
    return true;
  }

  function loadWebState() {
    try {
      return window.localStorage?.getItem(WEB_STORAGE_KEY) || null;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  function saveWebState(savedState) {
    if (!window.localStorage) throw new Error("localStorage is unavailable.");
    window.localStorage.setItem(WEB_STORAGE_KEY, JSON.stringify(savedState));
  }

  async function loadFromVault(announce = true) {
    if (!window.NarrativeCanvasHost?.loadProject) return null;
    try {
      const saved = await window.NarrativeCanvasHost.loadProject();
      if (!saved) return null;
      const payload = parseSavedPayload(saved);
      if (!payload) throw new Error("Vault project JSON could not be parsed.");
      const restoredView = applySavedState(payload);
      if (!state.selectedNodeId) state.selectedNodeId = state.project.nodes[0]?.id || null;
      setProjectDirty(false);
      if (announce) setStatus(`Loaded ${getHostProjectFileLabel()}.`);
      return restoredView;
    } catch (error) {
      console.error(error);
      if (announce) setStatus("Could not load vault project.");
      return null;
    }
  }

  function getHostProjectFileLabel() {
    const host = window.NarrativeCanvasHost;
    return host?.getProjectFile?.() || host?.projectFile || "vault project";
  }

  async function ensureVaultProjectFile() {
    const host = window.NarrativeCanvasHost;
    if (!host?.ensureProjectFile) return false;
    try {
      const options = isSampleProjectForFilename() ? { filenameOverride: SAMPLE_PROJECT_FILENAME } : undefined;
      const target = await host.ensureProjectFile(JSON.stringify(buildSavedState(), null, 2), options);
      if (target) setStatus(`Created ${target}.`);
      return Boolean(target);
    } catch (error) {
      console.error(error);
      setStatus("Could not create vault project file.");
      return false;
    }
  }

  function isSampleProjectForFilename() {
    return state.project?.title === sampleProject.title
      && state.project?.variables?.traveler === sampleProject.variables.traveler
      && state.project?.nodes?.some((node) => node.id === "e1" && node.type === "StorySequence");
  }

  function exportJson() {
    const blob = new Blob([buildProjectJson()], { type: "application/json" });
    downloadBlob(blob, `${slugify(state.project.title || "narrative-canvas")}.json`);
    setStatus("JSON exported.");
  }

  function exportCharactersMarkdown() {
    downloadBlob(new Blob([buildCharactersMarkdown()], { type: "text/markdown;charset=utf-8" }), "Characters.md");
    setStatus("Characters Markdown exported.");
  }

  function exportCharactersJson() {
    downloadJsonFile(buildCharactersJsonDocument(), "Characters.json");
    setStatus("Characters JSON exported.");
  }

  function exportVariablesJson() {
    const blob = new Blob([buildVariablesJson()], { type: "application/json" });
    downloadBlob(blob, PLAYBOOK_FILE_NAME);
    setStatus("Playbook JSON exported.");
  }

  function exportEventSheetCsv() {
    const csv = buildEventSheetCsv();
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${slugify(state.project.title || "narrative-canvas")}-events.csv`);
    setStatus("Event sheet CSV exported.");
  }

  function exportEventSheetJson() {
    downloadJsonFile(buildEventSheetJsonDocument(), `${slugify(state.project.title || "narrative-canvas")}-events.json`);
    setStatus("Event sheet JSON exported.");
  }

  async function exportImage() {
    const preset = getExportImageScalePreset();
    const slug = slugify(state.project.title || "narrative-canvas");
    try {
      const svg = buildExportSvg();
      const rasterPlan = getExportRasterPlan(svg, preset.scale);
      const blob = await svgToPngBlob(svg, rasterPlan.scale);
      downloadBlob(blob, `${slug}${getExportImageSuffix(preset, rasterPlan)}.png`);
      setStatus(rasterPlan.limited
        ? `Image exported at ${formatExportScaleLabel(rasterPlan.scale)} to fit browser PNG limits.`
        : `Image exported at ${preset.label}.`);
    } catch (error) {
      console.error(error);
      downloadBlob(new Blob([buildExportSvg()], { type: "image/svg+xml" }), `${slug}.svg`);
      setStatus("PNG export failed; SVG exported.");
    }
  }

  function exportHtml() {
    downloadBlob(new Blob([buildExportHtml()], { type: "text/html" }), `${slugify(state.project.title || "narrative-canvas")}.html`);
    setStatus("HTML exported.");
  }

  async function exportAll() {
    try {
      const slug = slugify(state.project.title || "narrative-canvas");
      const files = [
        { name: `${slug}.json`, blob: new Blob([buildProjectJson()], { type: "application/json" }) },
        { name: "Events Sheet.csv", blob: new Blob([buildEventSheetCsv()], { type: "text/csv;charset=utf-8" }) },
        { name: "Node Fields.csv", blob: new Blob([buildNodeFieldsCsv()], { type: "text/csv;charset=utf-8" }) },
        { name: "Characters.md", blob: new Blob([buildCharactersMarkdown()], { type: "text/markdown;charset=utf-8" }) },
        { name: PLAYBOOK_FILE_NAME, blob: new Blob([buildVariablesJson()], { type: "application/json" }) },
        { name: `${slug}.html`, blob: new Blob([buildExportHtml()], { type: "text/html" }) }
      ];
      const svg = buildExportSvg();
      const imagePreset = getExportImageScalePreset();
      try {
        const rasterPlan = getExportRasterPlan(svg, imagePreset.scale);
        files.push({ name: `${slug}${getExportImageSuffix(imagePreset, rasterPlan)}.png`, blob: await svgToPngBlob(svg, rasterPlan.scale) });
      } catch (error) {
        console.error(error);
        files.push({ name: `${slug}.svg`, blob: new Blob([svg], { type: "image/svg+xml" }) });
      }
      const zipBlob = await createZipBlob(files);
      downloadBlob(zipBlob, `${slug}-export.zip`);
      setStatus("Project export package created.");
    } catch (error) {
      console.error(error);
      setStatus("Project export package failed.");
    }
  }

  function buildProjectJson() {
    return JSON.stringify(state.project, null, 2);
  }

  function buildCharactersMarkdown() {
    const characters = getCharacters();
    const backlinkIndex = buildCharacterBacklinkIndex(characters);
    const lines = [`# Characters`, ""];
    characters.forEach((character) => {
      lines.push(`## ${character.name || "Unnamed Character"}`);
      if (character.role) lines.push(`- Role: ${character.role}`);
      if (character.voice) lines.push(`- Voice: ${character.voice}`);
      if (character.notes) lines.push("", character.notes);
      getCharacterBacklinkGroups(character, backlinkIndex)
        .filter((group) => group.items.length)
        .forEach((group) => {
          lines.push("", `### ${group.label}`);
          group.items.forEach((item) => {
            lines.push(`- ${item.node.title || getNodeTypeLabel(item.node.type)} (${getNodeDisplayId(item.node)}): ${formatNodeSnippet(item.node)}`);
          });
        });
      lines.push("");
    });
    return lines.join("\n");
  }

  function buildVariablesJson() {
    return JSON.stringify(buildScriptDocument(), null, 2);
  }

  function buildCharactersJsonDocument() {
    const characters = getCharacters();
    const backlinkIndex = buildCharacterBacklinkIndex(characters);
    return {
      characters: characters.map((character) => ({
        ...character,
        links: getCharacterBacklinkGroups(character, backlinkIndex)
          .filter((group) => group.items.length)
          .map((group) => ({
            label: group.label,
            nodes: group.items.map((item) => ({
              id: item.node.id,
              displayId: getNodeDisplayId(item.node),
              type: item.node.type,
              label: getNodeTypeLabel(item.node.type),
              title: item.node.title || ""
            }))
          }))
      }))
    };
  }

  function buildScriptDocument() {
    state.project.variables = normalizeVariablesObject(state.project.variables);
    return {
      variables: state.project.variables,
      nodeTypes: getScriptNodeTypes()
    };
  }

  function applyScriptJson(value) {
    let parsed;
    try {
      parsed = JSON.parse(value || "{}");
    } catch (error) {
      const parseError = new Error("Playbook JSON is invalid.");
      parseError.cause = error;
      throw parseError;
    }
    if (isScriptDocument(parsed)) {
      state.project.variables = normalizeVariablesObject(parsed.variables);
      state.project.script = normalizeScriptConfig(parsed);
      return;
    }
    state.project.variables = normalizeVariablesObject(parsed);
    state.project.script = normalizeScriptConfig(state.project.script);
  }

  function isScriptDocument(value) {
    return value
      && typeof value === "object"
      && !Array.isArray(value)
      && (Object.prototype.hasOwnProperty.call(value, "variables")
        || Object.prototype.hasOwnProperty.call(value, "nodeTypes"));
  }

  function normalizeVariablesObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function normalizeScriptConfig(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return {
      nodeTypes: normalizeNodeTypeScripts(source.nodeTypes)
    };
  }

  function normalizeNodeTypeScripts(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const normalized = {};
    Object.entries(value).forEach(([key, script]) => {
      if (!key || !script || typeof script !== "object" || Array.isArray(script)) return;
      normalized[String(key)] = {
        title: normalizeOptionalString(script.title),
        body: normalizeOptionalString(script.body),
        choices: normalizeScriptChoices(script.choices),
        condition: normalizeOptionalString(script.condition),
        set: normalizeScriptSet(script.set)
      };
    });
    return normalized;
  }

  function normalizeOptionalString(value) {
    return value == null ? "" : String(value);
  }

  function normalizeScriptChoices(value) {
    if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
    return normalizeOptionalString(value);
  }

  function normalizeScriptSet(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return {
      key: normalizeOptionalString(value.key || value.variable || value.name),
      value: normalizeOptionalString(value.value)
    };
  }

  function getScriptNodeTypes() {
    if (!state.project.script) state.project.script = normalizeScriptConfig(null);
    state.project.script = normalizeScriptConfig(state.project.script);
    return state.project.script.nodeTypes;
  }

  function buildEventSheetCsv() {
    const rows = [];
    getEventRowGroups().forEach((group, groupIndex) => {
      const columns = getEventSheetColumns(group.type);
      if (groupIndex) rows.push([]);
      rows.push([group.label]);
      rows.push(["Node", ...columns.map((column) => column.label)]);
      group.rows.forEach((node) => {
        rows.push([
          `${node.title || node.id} (${getNodeDisplayId(node)})`,
          ...columns.map((column) => getNodeEventValue(node, column.key))
        ]);
      });
    });
    return rows.map((row) => row.map(formatCsvCell).join(",")).join("\n");
  }

  function buildEventSheetJsonDocument() {
    return {
      title: state.project.title || "",
      groups: getEventRowGroups().map((group) => {
        const columns = getEventSheetColumns(group.type);
        return {
          type: group.type,
          label: group.label,
          columns: columns.map((column) => ({
            key: column.key,
            label: column.label,
            custom: Boolean(column.custom),
            readonly: Boolean(column.readonly)
          })),
          rows: group.rows.map((node) => ({
            nodeId: node.id,
            displayId: getNodeDisplayId(node),
            type: node.type,
            title: node.title || "",
            values: Object.fromEntries(columns.map((column) => [column.key, getNodeEventValue(node, column.key)]))
          }))
        };
      })
    };
  }

  function buildNodeFieldsCsv() {
    const rows = [
      ["Node ID", "Type", "Title", "Field", "Value"],
      ...state.project.nodes.flatMap((node) => getNodeCustomFieldEntries(node)
        .filter((field) => field.value !== "")
        .map((field) => [getNodeDisplayId(node), getNodeTypeLabel(node.type), node.title || "", field.label, field.value]))
    ];
    return rows.map((row) => row.map(formatCsvCell).join(",")).join("\n");
  }

  function buildExportHtml() {
    const svg = buildExportSvg();
    const title = escapeHtml(state.project.title || "Narrative Canvas");
    return `<!doctype html>
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
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function downloadJsonFile(value, filename) {
    downloadBlob(new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" }), filename);
  }

  async function createZipBlob(files) {
    const entries = [];
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    for (const file of files) {
      const nameBytes = encodeUtf8(file.name);
      const data = new Uint8Array(await file.blob.arrayBuffer());
      const crc = crc32(data);
      const { dosTime, dosDate } = zipDateTime(new Date());
      const localHeader = concatBytes(
        uint32(0x04034b50),
        uint16(20),
        uint16(0x0800),
        uint16(0),
        uint16(dosTime),
        uint16(dosDate),
        uint32(crc),
        uint32(data.length),
        uint32(data.length),
        uint16(nameBytes.length),
        uint16(0),
        nameBytes
      );
      localParts.push(localHeader, data);
      entries.push({ nameBytes, crc, size: data.length, dosTime, dosDate, offset });
      offset += localHeader.length + data.length;
    }
    const centralOffset = offset;
    for (const entry of entries) {
      const centralHeader = concatBytes(
        uint32(0x02014b50),
        uint16(20),
        uint16(20),
        uint16(0x0800),
        uint16(0),
        uint16(entry.dosTime),
        uint16(entry.dosDate),
        uint32(entry.crc),
        uint32(entry.size),
        uint32(entry.size),
        uint16(entry.nameBytes.length),
        uint16(0),
        uint16(0),
        uint16(0),
        uint16(0),
        uint32(0),
        uint32(entry.offset),
        entry.nameBytes
      );
      centralParts.push(centralHeader);
      offset += centralHeader.length;
    }
    const centralSize = offset - centralOffset;
    const endRecord = concatBytes(
      uint32(0x06054b50),
      uint16(0),
      uint16(0),
      uint16(entries.length),
      uint16(entries.length),
      uint32(centralSize),
      uint32(centralOffset),
      uint16(0)
    );
    return new Blob([...localParts, ...centralParts, endRecord], { type: "application/zip" });
  }

  function encodeUtf8(value) {
    return new TextEncoder().encode(value);
  }

  function uint16(value) {
    return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
  }

  function uint32(value) {
    return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);
  }

  function concatBytes(...parts) {
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    const bytes = new Uint8Array(length);
    let offset = 0;
    parts.forEach((part) => {
      bytes.set(part, offset);
      offset += part.length;
    });
    return bytes;
  }

  function zipDateTime(date) {
    const year = Math.max(1980, date.getFullYear());
    return {
      dosTime: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
      dosDate: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
    };
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let index = 0; index < bytes.length; index += 1) {
      crc = (crc >>> 8) ^ crc32Table()[(crc ^ bytes[index]) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function crc32Table() {
    if (crc32Table.cache) return crc32Table.cache;
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      table[index] = value >>> 0;
    }
    crc32Table.cache = table;
    return table;
  }

  function importJsonFile() {
    const file = dom.fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result));
        const restoredView = applySavedState(payload);
        if (!state.selectedNodeId) state.selectedNodeId = state.project.nodes[0]?.id || null;
        if (!restoredView) centerViewAtScale(DEFAULT_CANVAS_ZOOM, false);
        resetHistory();
        setProjectDirty(true);
        renderAll();
        setStatus("JSON imported.");
      } catch (error) {
        console.error(error);
        setStatus("Import failed: invalid JSON.");
      } finally {
        dom.fileInput.value = "";
      }
    };
    reader.readAsText(file);
  }

  function normalizeProject(project) {
    const nodeTypesList = normalizeProjectNodeTypes(project.nodeTypes, project.customNodeTypes);
    const eventFrameTypes = new Set(nodeTypesList.filter((typeDef) => isEventFrameKind(typeDef.kind)).map((typeDef) => typeDef.type));
    const eventSheet = normalizeEventSheetConfig(project.eventSheet, project.eventSheetHiddenColumns);
    const normalized = {
      title: project.title || "Sample",
      notes: project.notes || "",
      variables: normalizeVariablesObject(project.variables),
      script: normalizeScriptConfig(project.script),
      eventSheet,
      eventRowOrder: normalizeEventRowOrder(project.eventRowOrder),
      nodeTypes: nodeTypesList,
      customNodeTypes: [],
      characters: normalizeProjectCharacters(project),
      deletedNodes: Array.isArray(project.deletedNodes) ? project.deletedNodes : [],
      nodes: Array.isArray(project.nodes) ? project.nodes.map((node) => normalizeNode(node, eventFrameTypes, eventSheet.columns)) : [],
      links: normalizeLinks(project.links)
    };
    syncProjectChoiceBranchLinks(normalized);
    return normalized;
  }

  function normalizeLinks(links) {
    if (!Array.isArray(links)) return [];
    return links.map((link, index) => normalizeLink(link, index)).filter(Boolean);
  }

  function normalizeLink(link, index) {
    if (!link || typeof link !== "object" || Array.isArray(link)) return null;
    const normalized = {
      ...link,
      id: String(link.id || `l${index + 1}`),
      from: String(link.from || ""),
      to: String(link.to || "")
    };
    const label = normalizeOptionalString(link.label).trim();
    if (label) normalized.label = label;
    else delete normalized.label;
    const choiceIndex = normalizeChoiceIndex(link.choiceIndex);
    if (choiceIndex == null) delete normalized.choiceIndex;
    else normalized.choiceIndex = choiceIndex;
    return normalized;
  }

  function normalizeEventRowOrder(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value)
      .filter(([type, ids]) => type && Array.isArray(ids))
      .map(([type, ids]) => [String(type), ids.map((id) => String(id)).filter(Boolean)]));
  }

  function getProjectNodeTypes() {
    if (!Array.isArray(state.project.nodeTypes)) {
      state.project.nodeTypes = normalizeProjectNodeTypes(null, state.project.customNodeTypes);
      state.project.customNodeTypes = [];
      markProjectStructureChanged({ nodeTypes: true });
    }
    const cache = state.derived.projectNodeTypes;
    if (cache && cache.source === state.project.nodeTypes && cache.version === state.structureVersion) {
      return cache.value;
    }
    const normalized = normalizeNodeTypes(state.project.nodeTypes);
    state.project.nodeTypes = normalized;
    // After canonicalizing, source === value === the array ref, so subsequent calls
    // at the same structureVersion hit the cache without re-normalizing (which previously
    // allocated a fresh array on every call and defeated downstream ref-based caches).
    state.derived.projectNodeTypes = { source: normalized, version: state.structureVersion, value: normalized };
    return normalized;
  }

  function normalizeProjectNodeTypes(types, legacyCustomTypes) {
    const hasProjectTypes = Array.isArray(types);
    const normalized = normalizeNodeTypes(hasProjectTypes ? types : defaultNodeTypeList());
    const legacyTypes = normalizeNodeTypes(legacyCustomTypes);
    if (!legacyTypes.length) return normalized;
    const seen = new Set(normalized.map((typeDef) => typeDef.type));
    return [
      ...normalized,
      ...legacyTypes.filter((typeDef) => {
        if (seen.has(typeDef.type)) return false;
        seen.add(typeDef.type);
        return true;
      })
    ];
  }

  function normalizeNodeTypes(types) {
    if (!Array.isArray(types)) return [];
    const seen = new Set();
    return types
      .map(normalizeCustomNodeType)
      .filter((typeDef) => {
        if (!typeDef || seen.has(typeDef.type)) return false;
        seen.add(typeDef.type);
        return true;
      });
  }

  function normalizeCustomNodeType(typeDef) {
    const label = String(typeDef?.label || typeDef?.type || "").trim().slice(0, 40);
    if (!label) return null;
    const type = String(typeDef?.type || customNodeTypeId(label)).trim() || customNodeTypeId(label);
    const kind = type === "Event" ? "eventFrame" : normalizeNodeTypeKind(typeDef?.kind || "node");
    return {
      type,
      label,
      badge: normalizeNodeTypeBadge(getNormalizedNodeTypeBadge(type, label, typeDef?.badge, typeDef?.badgeCustom)) || getDefaultNodeTypeBadge(label),
      color: normalizeNodeTypeColor(type, kind, typeDef?.color),
      width: clamp(Number(typeDef?.width) || (isFrameKind(kind) ? 420 : 200), 160, isFrameKind(kind) ? 860 : 420),
      custom: Boolean(typeDef?.custom),
      badgeCustom: Boolean(typeDef?.badgeCustom),
      kind,
      fields: normalizeNodeTypeFields(typeDef?.fields),
      hidden: Boolean(typeDef?.hidden)
    };
  }

  function getNodeCustomFieldValue(node, key) {
    if (isDirectNodeField(key)) return node?.[key] == null ? "" : String(node[key]);
    if (!node?.customFields || typeof node.customFields !== "object") return "";
    return node.customFields[key] == null ? "" : String(node.customFields[key]);
  }

  function isDirectNodeField(key) {
    return DIRECT_NODE_FIELD_KEYS.has(String(key || "").trim());
  }

  function normalizeNodeTypeKind(value) {
    if (value === "eventFrame") return "eventFrame";
    return value === "frame" ? "frame" : "node";
  }

  function parseCustomNodeFields(value, previousFields = []) {
    const previousByLabel = new Map(
      previousFields
        .filter((field) => field?.label && field?.key)
        .map((field) => [String(field.label).trim().toLowerCase(), field.key])
    );
    return String(value || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .map((label, index) => {
        if (!label) return null;
        const previousKey = previousByLabel.get(label.toLowerCase()) || previousFields[index]?.key;
        return { key: previousKey, label };
      })
      .filter(Boolean);
  }

  function normalizeNodeTypeFields(fields) {
    if (!Array.isArray(fields)) return [];
    const seen = new Set();
    return fields
      .map((field, index) => {
        const label = String(field?.label || field?.key || "").trim().slice(0, 40);
        if (!label) return null;
        let key = String(field?.key || fieldKeyFromLabel(label, index)).trim();
        key = key.replace(/[^\w-]/g, "_").replace(/^[-_]+|[-_]+$/g, "") || "field";
        if (/^\d/.test(key)) key = `field_${key}`;
        let uniqueKey = key;
        let duplicateIndex = 2;
        while (seen.has(uniqueKey)) {
          uniqueKey = `${key}_${duplicateIndex}`;
          duplicateIndex += 1;
        }
        seen.add(uniqueKey);
        return { key: uniqueKey, label };
      })
      .filter(Boolean)
      .slice(0, 12);
  }

  function fieldKeyFromLabel(label, index) {
    const ascii = String(label || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return ascii || `field_${index + 1}`;
  }

  function uniqueCustomNodeTypeId(label) {
    const base = customNodeTypeId(label);
    const existing = new Set(getProjectNodeTypes().map((typeDef) => typeDef.type));
    let type = base;
    let index = 2;
    while (existing.has(type)) {
      type = `${base}_${index}`;
      index += 1;
    }
    return type;
  }

  function customNodeTypeId(label) {
    return `Custom_${slugify(label).replace(/-/g, "_") || "node"}`;
  }

  function getNormalizedNodeTypeBadge(type, label, value, isCustomBadge = false) {
    const raw = String(value ?? "").trim();
    if (!raw || (!isCustomBadge && nodeTypes[type] && raw === LEGACY_DEFAULT_NODE_BADGES[type])) {
      return getDefaultNodeTypeBadge(label);
    }
    return raw;
  }

  function getDefaultNodeTypeBadge(label) {
    const first = firstGrapheme(label);
    return first ? uppercaseIconGrapheme(first) : "N";
  }

  function normalizeNodeTypeBadge(value) {
    return normalizeCustomIconText(value);
  }

  function normalizeCustomColor(value) {
    const color = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_CUSTOM_NODE_COLOR;
  }

  function normalizeNodeTypeColor(type, kind, value) {
    const color = String(value || "").trim();
    if (type === "Event" && (!/^#[0-9a-f]{6}$/i.test(color) || LEGACY_EVENT_FRAME_COLORS.has(color.toLowerCase()))) {
      return DEFAULT_EVENT_FRAME_COLOR;
    }
    if (/^#[0-9a-f]{6}$/i.test(color)) return color;
    return getDefaultNodeTypeColor(kind);
  }

  function getDefaultNodeTypeColor(kind) {
    if (kind === "eventFrame") return DEFAULT_EVENT_FRAME_COLOR;
    if (kind === "frame") return DEFAULT_VISUAL_FRAME_COLOR;
    return DEFAULT_CUSTOM_NODE_COLOR;
  }

  function normalizeNode(node, eventFrameTypes = null, eventColumns = null) {
    const normalized = { ...node };
    delete normalized.icon;
    if (Number.isFinite(Number(normalized.storyOrder))) {
      normalized.storyOrder = Number(normalized.storyOrder);
    } else {
      delete normalized.storyOrder;
    }
    normalized.choices = parseChoiceLines(normalized.choices);
    normalized.customFields = normalizeNodeCustomFields(normalized.customFields);
    normalized.cast = normalizeNodeCast(normalized.cast);
    if (!normalized.cast.length) delete normalized.cast;
    migrateDirectCustomFields(normalized);
    if (normalized.type === "Frame") {
      normalized.type = "Event";
      if (normalized.eventType === "Frame" || normalized.eventType === "Event") normalized.eventType = "";
    }
    const isEventType = eventFrameTypes ? eventFrameTypes.has(normalized.type) : isEventSheetNode(normalized);
    if (isEventType) ensureEventDefaults(normalized, eventColumns);
    return normalized;
  }

  function normalizeNodeCustomFields(customFields) {
    if (!customFields || typeof customFields !== "object" || Array.isArray(customFields)) return {};
    const normalized = {};
    Object.entries(customFields).forEach(([key, value]) => {
      normalized[String(key)] = value == null ? "" : String(value);
    });
    return normalized;
  }

  function migrateDirectCustomFields(node) {
    if (!node.customFields || typeof node.customFields !== "object" || Array.isArray(node.customFields)) return;
    Object.keys(node.customFields).forEach((key) => {
      if (!isDirectNodeField(key)) return;
      if (key === "choices") {
        if (!node.choices?.length) node.choices = parseChoiceLines(node.customFields[key]);
      } else if (node[key] == null || node[key] === "") {
        node[key] = node.customFields[key];
      }
      delete node.customFields[key];
    });
  }

  function ensureCustomFieldDefaults(node) {
    const fields = getNodeMeta(node.type).fields || [];
    if (!fields.length) return;
    const hasCustomField = fields.some((field) => !isDirectNodeField(field.key));
    if (hasCustomField && (!node.customFields || typeof node.customFields !== "object" || Array.isArray(node.customFields))) node.customFields = {};
    fields.forEach((field) => {
      if (field.key === "choices") {
        node.choices = parseChoiceLines(node.choices);
      } else if (isDirectNodeField(field.key)) {
        if (node[field.key] == null) node[field.key] = "";
      } else if (node.customFields && node.customFields[field.key] == null) {
        node.customFields[field.key] = "";
      }
    });
  }

  function getNodeCustomFieldEntries(node) {
    return (getNodeMeta(node?.type).fields || []).map((field) => ({
      key: field.key,
      label: field.label,
      value: getNodeCustomFieldValue(node, field.key)
    }));
  }

  function ensureEventDefaults(node, eventColumns = null) {
    const columns = eventColumns || getProjectEventSheetColumns();
    columns.forEach((column) => {
      if (column.key === "characterEncountered") return;
      if (!column.readonly && node[column.key] == null) node[column.key] = getNodeEventValue(node, column.key);
    });
    getNodeCustomFieldEntries(node).forEach((field) => {
      if (isDirectNodeField(field.key)) return;
      if (!node.customFields || typeof node.customFields !== "object" || Array.isArray(node.customFields)) node.customFields = {};
      if (node.customFields[field.key] == null) node.customFields[field.key] = "";
    });
  }

  function openPreview() {
    const previewPath = getPreviewPath();
    const entry = previewPath[0];
    if (!entry) {
      setStatus("No nodes to play.");
      return;
    }
    state.playPath = [entry.id];
    state.playNodeId = entry.id;
    renderPreviewNode(entry.id);
    dom.playDialog.showModal();
  }

  function advancePreview(nodeId) {
    const currentIndex = state.playPath.indexOf(state.playNodeId);
    const targetIndex = state.playPath.indexOf(nodeId);
    if (currentIndex >= 0) {
      if (targetIndex !== currentIndex + 1) {
        state.playPath = state.playPath.slice(0, currentIndex + 1);
        if (state.playPath[state.playPath.length - 1] !== nodeId) state.playPath.push(nodeId);
      }
    } else if (targetIndex < 0) {
      state.playPath.push(nodeId);
    }
    state.playNodeId = nodeId;
    renderPreviewNode(nodeId);
  }

  function previousPreview() {
    const index = state.playPath.indexOf(state.playNodeId);
    if (index <= 0) return;
    const previousId = state.playPath[index - 1];
    if (previousId) {
      state.playNodeId = previousId;
      renderPreviewNode(previousId);
    }
  }

  function renderPreviewNode(nodeId) {
    const node = getNode(nodeId);
    if (!node) return;
    const runtimeScript = getNodeRuntimeScript(node);
    const assignment = getRuntimeAssignment(node, runtimeScript);
    if (assignment.key) {
      state.project.variables[assignment.key] = coerceValue(assignment.value);
    }

    const outgoing = getOutgoing(node.id);
    let nextLinks = outgoing;
    const conditionSource = getRuntimeConditionSource(node, runtimeScript);
    if (conditionSource) {
      const result = evaluateCondition(conditionSource);
      nextLinks = result ? outgoing.slice(0, 1) : outgoing.slice(1, 2);
    }

    if (!state.playPath.includes(node.id)) state.playPath.push(node.id);
    const runtimeChoices = getRuntimeChoices(node, runtimeScript);
    if (runtimeChoices.length && nextLinks.length) {
      nextLinks = getChoiceOrderedLinks(nextLinks);
    }
    const progress = getPreviewProgress(node, nextLinks, runtimeChoices);
    const { pageNumber, pageTotal, nextPathId } = progress;
    const previousButton = pageNumber > 1
      ? `<button class="play-action" type="button" data-action="play-prev">Previous</button>`
      : "";
    const runtimeTitle = renderRuntimeTemplate(runtimeScript.title, node, getNodeDisplayTitle(node, node.type));
    const runtimeBody = renderRuntimeTemplate(runtimeScript.body, node, displayBody(node));
    dom.playTitle.textContent = runtimeTitle;
    const customFields = renderPreviewCustomFields(node);
    dom.playBody.innerHTML = `
      <div class="play-meta">
        <span>${escapeHtml(getNodeTypeLabel(node.type))} ${escapeHtml(getNodeDisplayId(node))}</span>
        <span>${pageNumber} / ${pageTotal}</span>
      </div>
      <h3>${escapeHtml(runtimeTitle)}</h3>
      <p>${escapeHtml(interpolate(runtimeBody))}</p>
      ${customFields}
    `;

    if (runtimeChoices.length && nextLinks.length) {
      dom.playActions.innerHTML = previousButton + nextLinks.map((link, index) => {
        const label = getChoiceBranchButtonLabel(link, runtimeChoices, index);
        return `<button class="play-action" type="button" data-action="play-next" data-node-id="${link.to}">${escapeHtml(label)}</button>`;
      }).join("");
      return;
    }

    const nextId = nextLinks[0]?.to || nextPathId;
    dom.playActions.innerHTML = previousButton + (nextId
      ? `<button class="play-action primary" type="button" data-action="play-next" data-node-id="${nextId}">Next page</button>`
      : `<button class="play-action" type="button" data-action="restart-play">Restart</button>`);
  }

  function getPreviewProgress(node, nextLinks, runtimeChoices) {
    const pathIndex = state.playPath.indexOf(node.id);
    const pageNumber = pathIndex >= 0 ? pathIndex + 1 : Math.max(state.playPath.length, 1);
    const knownTotal = Math.max(state.playPath.length, pageNumber, 1);
    const canProjectFuture = !(runtimeChoices.length && nextLinks.length);
    const projectedTotal = canProjectFuture
      ? pageNumber + getPreviewFutureCount(node.id, nextLinks)
      : pageNumber;
    return {
      pageNumber,
      pageTotal: Math.max(knownTotal, projectedTotal),
      nextPathId: pathIndex >= 0 ? state.playPath[pathIndex + 1] : null
    };
  }

  function getPreviewFutureCount(startId, initialNextLinks) {
    let count = 0;
    let nextId = initialNextLinks[0]?.to || "";
    const seen = new Set([startId]);
    while (nextId && !seen.has(nextId)) {
      const node = getNode(nextId);
      if (!node) break;
      seen.add(nextId);
      count += 1;
      const runtimeScript = getNodeRuntimeScript(node);
      const outgoing = getOutgoing(node.id);
      if (getRuntimeChoices(node, runtimeScript).length && outgoing.length) break;
      let nextLinks = outgoing;
      const conditionSource = getRuntimeConditionSource(node, runtimeScript);
      if (conditionSource) {
        const result = evaluateCondition(conditionSource);
        nextLinks = result ? outgoing.slice(0, 1) : outgoing.slice(1, 2);
      }
      nextId = nextLinks[0]?.to || "";
    }
    return count;
  }

  function getPreviewPath() {
    return getReachableStory().filter((node) => !isFrameNode(node));
  }

  function renderPreviewCustomFields(node) {
    const fields = getNodeCustomFieldEntries(node).filter((field) => field.value !== "");
    if (!fields.length) return "";
    return `
      <dl class="play-fields">
        ${fields.map((field) => `
          <div>
            <dt>${escapeHtml(field.label)}</dt>
            <dd>${escapeHtml(interpolate(field.value))}</dd>
          </div>
        `).join("")}
      </dl>
    `;
  }

  function getNodeVariableKey(node) {
    if (!node) return "";
    const key = node.variable || node.variables;
    if (!key || node.value == null) return "";
    return String(key).trim();
  }

  function getNodeRuntimeScript(node) {
    const scripts = getScriptNodeTypes();
    return scripts[node?.id]
      || scripts[node?.type]
      || scripts[getNodeTypeLabel(node?.type)]
      || {};
  }

  function getRuntimeAssignment(node, script) {
    const setConfig = script?.set;
    if (setConfig?.key) {
      const key = resolveScriptReference(node, setConfig.key);
      const value = setConfig.value ? resolveScriptReference(node, setConfig.value) : "";
      return { key: String(key || "").trim(), value };
    }
    const fallbackKey = getNodeVariableKey(node);
    return fallbackKey ? { key: fallbackKey, value: node.value } : { key: "", value: "" };
  }

  function getRuntimeConditionSource(node, script) {
    if (script?.condition) {
      const fieldValue = getNodeFieldValue(node, script.condition);
      return fieldValue !== "" ? fieldValue : script.condition;
    }
    return hasNodeCondition(node) ? (node.condition || node.body) : "";
  }

  function getRuntimeChoices(node, script) {
    if (Array.isArray(script?.choices)) {
      return script.choices.map((choice) => renderRuntimeTemplate(choice, node, choice)).filter(Boolean);
    }
    if (script?.choices) {
      return parseChoiceLines(resolveScriptReference(node, script.choices));
    }
    return hasNodeChoices(node) ? node.choices : [];
  }

  function renderRuntimeTemplate(template, node, fallback) {
    const source = template == null || template === "" ? fallback : template;
    return String(source || "").replace(/\{([a-zA-Z_][\w.-]*)\}/g, (match, key) => {
      if (key.startsWith("variables.")) {
        const variableKey = key.slice("variables.".length);
        return state.project.variables?.[variableKey] ?? match;
      }
      const nodeValue = getNodeFieldValue(node, key);
      if (nodeValue !== "") return nodeValue;
      return state.project.variables?.[key] ?? match;
    });
  }

  function resolveScriptReference(node, reference) {
    const value = getNodeFieldValue(node, reference);
    return value !== "" ? value : reference;
  }

  function getNodeFieldValue(node, key) {
    if (!node || !key) return "";
    if (key === "label") return getNodeTypeLabel(node.type);
    if (key === "choices") return parseChoiceLines(node.choices).join("\n");
    if (Object.prototype.hasOwnProperty.call(node, key)) {
      const value = node[key];
      return Array.isArray(value) ? value.join("\n") : String(value ?? "");
    }
    if (node.customFields && typeof node.customFields === "object" && !Array.isArray(node.customFields) && Object.prototype.hasOwnProperty.call(node.customFields, key)) {
      return String(node.customFields[key] ?? "");
    }
    const customField = getNodeCustomFieldEntries(node).find((field) => field.key === key || field.label === key);
    return customField?.value || "";
  }

  function hasNodeChoices(node) {
    return Array.isArray(node?.choices) && node.choices.length > 0;
  }

  function hasNodeCondition(node) {
    return Boolean(node?.condition || node?.type === "Condition");
  }

  function parseChoiceLines(value) {
    if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
    return String(value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  }

  function getChoiceBranchLabels(node) {
    return parseChoiceLines(node?.choices);
  }

  function normalizeChoiceIndex(value) {
    if (value == null || value === "") return null;
    const index = Number(value);
    return Number.isInteger(index) && index >= 0 ? index : null;
  }

  function syncProjectChoiceBranchLinks(project) {
    if (!project || !Array.isArray(project.nodes) || !Array.isArray(project.links)) return false;
    const nodeMap = new Map(project.nodes.map((node) => [node.id, node]));
    const outgoing = new Map();
    let changed = false;
    project.links.forEach((link) => {
      const source = nodeMap.get(link.from);
      if (!source || !getChoiceBranchLabels(source).length) {
        if (link.choiceIndex != null) {
          delete link.choiceIndex;
          changed = true;
        }
        return;
      }
      if (!outgoing.has(link.from)) outgoing.set(link.from, []);
      outgoing.get(link.from).push(link);
    });
    project.nodes.forEach((node) => {
      changed = syncChoiceOutgoingLinks(node, outgoing.get(node.id) || [], nodeMap) || changed;
    });
    return changed;
  }

  function syncChoiceBranchLinksForNode(nodeId, options = {}) {
    const node = getNode(nodeId);
    if (!node || !Array.isArray(state.project.links)) return false;
    const outgoing = state.project.links.filter((link) => link.from === nodeId);
    const changed = syncChoiceOutgoingLinks(node, outgoing, getNodeIndex(), options.preferredLinkId || "");
    if (!changed) return false;
    invalidateLinkIndexes();
    if (options.markDirty !== false) setProjectDirty(true);
    return true;
  }

  function syncChoiceOutgoingLinks(node, outgoing, nodeMap = null, preferredLinkId = "") {
    if (!Array.isArray(outgoing) || !outgoing.length) return false;
    const choices = getChoiceBranchLabels(node);
    let changed = false;
    if (!choices.length) {
      outgoing.forEach((link) => {
        if (link.choiceIndex != null) {
          delete link.choiceIndex;
          changed = true;
        }
      });
      return changed;
    }

    const ordered = preferredLinkId
      ? outgoing.slice().sort((a, b) => (a.id === preferredLinkId ? -1 : b.id === preferredLinkId ? 1 : 0))
      : outgoing;
    const used = new Set();
    ordered.forEach((link) => {
      const index = normalizeChoiceIndex(link.choiceIndex);
      if (index != null && index < choices.length && !used.has(index)) {
        if (link.choiceIndex !== index) {
          link.choiceIndex = index;
          changed = true;
        }
        used.add(index);
        return;
      }
      if (link.choiceIndex != null) {
        delete link.choiceIndex;
        changed = true;
      }
    });

    ordered.forEach((link) => {
      if (normalizeChoiceIndex(link.choiceIndex) != null) return;
      const index = findUnusedChoiceIndexForLink(link, choices, used, nodeMap);
      if (index == null) return;
      link.choiceIndex = index;
      used.add(index);
      changed = true;
    });

    outgoing.forEach((link) => {
      const index = normalizeChoiceIndex(link.choiceIndex);
      const label = index == null ? "" : choices[index];
      if (label && link.label !== label) {
        link.label = label;
        changed = true;
      }
    });
    return changed;
  }

  function findUnusedChoiceIndexForLink(link, choices, used, nodeMap = null) {
    const candidates = [
      normalizeChoiceMatchText(link.label),
      normalizeChoiceMatchText(nodeMap?.get(link.to)?.title)
    ].filter(Boolean);
    for (const candidate of candidates) {
      const exact = choices.findIndex((choice, index) => !used.has(index) && normalizeChoiceMatchText(choice) === candidate);
      if (exact >= 0) return exact;
    }
    for (const candidate of candidates) {
      const partial = choices.findIndex((choice, index) => !used.has(index) && choiceCandidateMatches(candidate, choice));
      if (partial >= 0) return partial;
    }
    return findFirstUnusedChoiceIndex(choices, used);
  }

  function findFirstUnusedChoiceIndex(choices, used) {
    for (let index = 0; index < choices.length; index += 1) {
      if (!used.has(index)) return index;
    }
    return null;
  }

  function choiceCandidateMatches(candidate, choice) {
    const choiceText = normalizeChoiceMatchText(choice);
    if (!candidate || !choiceText) return false;
    if (choiceText.startsWith(candidate) || candidate.startsWith(choiceText)) return true;
    const tokens = candidate.split(/\s+/).filter(Boolean);
    return Boolean(tokens.length) && tokens.every((token) => choiceText.includes(token));
  }

  function normalizeChoiceMatchText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
      .trim();
  }

  function getChoiceOrderedLinks(links) {
    return links
      .map((link, order) => ({ link, order, choiceIndex: normalizeChoiceIndex(link.choiceIndex) }))
      .sort((a, b) => {
        const aIndexed = a.choiceIndex != null;
        const bIndexed = b.choiceIndex != null;
        if (aIndexed && bIndexed) return a.choiceIndex - b.choiceIndex || a.order - b.order;
        if (aIndexed !== bIndexed) return aIndexed ? -1 : 1;
        return a.order - b.order;
      })
      .map((entry) => entry.link);
  }

  function getChoiceBranchButtonLabel(link, runtimeChoices, fallbackIndex) {
    const choiceIndex = normalizeChoiceIndex(link.choiceIndex);
    if (choiceIndex != null && runtimeChoices[choiceIndex]) return runtimeChoices[choiceIndex];
    return link.label || runtimeChoices[fallbackIndex] || getNode(link.to)?.title || "Continue";
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
    state.project.characters = normalizeCharacters(state.project.characters);
    return state.project.characters;
  }

  function normalizeCharacters(characters) {
    if (!Array.isArray(characters)) return [];
    const seen = new Set();
    return characters
      .map((character, index) => normalizeCharacter(character, index))
      .filter((character) => {
        if (!character || seen.has(character.id)) return false;
        seen.add(character.id);
        return true;
      });
  }

  function normalizeCharacter(character, index) {
    if (!character || typeof character !== "object") return null;
    const name = String(character.name || `Character ${index + 1}`).trim() || `Character ${index + 1}`;
    return {
      id: String(character.id || `c${index}`).trim() || `c${index}`,
      name,
      role: String(character.role || ""),
      voice: String(character.voice || ""),
      notes: String(character.notes || "")
    };
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

  function normalizeNodeCast(cast) {
    if (!Array.isArray(cast)) return [];
    const seen = new Set();
    return cast
      .map((entry) => {
        const characterId = String(entry?.characterId || entry?.id || "").trim();
        if (!characterId) return null;
        const role = normalizeCastRole(entry?.role || entry?.relation);
        return { characterId, role };
      })
      .filter((entry) => {
        if (!entry) return false;
        const key = `${entry.characterId}:${entry.role}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 24);
  }

  function normalizeCastRole(value) {
    const role = String(value || "").trim();
    return CAST_RELATIONS.includes(role) ? role : "Present";
  }

  function uniqueCharacterName(baseName) {
    const used = new Set(getCharacters().map((character) => character.name));
    if (!used.has(baseName)) return baseName;
    let index = 2;
    while (used.has(`${baseName} ${index}`)) index += 1;
    return `${baseName} ${index}`;
  }

  function getCharacterById(id) {
    return getCharacters().find((character) => character.id === id) || null;
  }

  function getCharacterName(id) {
    return getCharacterById(id)?.name || "";
  }

  function getActiveCharacterFocusId() {
    if (!state.characterFocusId) return null;
    if (getCharacterById(state.characterFocusId)) return state.characterFocusId;
    state.characterFocusId = null;
    return null;
  }

  function getActiveCharacterFocus() {
    const id = getActiveCharacterFocusId();
    return id ? getCharacterById(id) : null;
  }

  function getNodeCharacterLinks(node, options = {}) {
    if (!node) return [];
    const includeCast = options.includeCast !== false;
    const includeEventAggregate = Boolean(options.includeEventAggregate);
    const characters = getCharacters();
    const links = [];

    if (includeCast) {
      normalizeNodeCast(node.cast).forEach((entry) => {
        const character = characters.find((item) => item.id === entry.characterId);
        if (character) links.push(createCharacterLink(character, entry.role, "cast"));
      });
    }

    const dialogSpeaker = node.type === "Dialog" && node.title
      ? characters.find((item) => item.name === node.title)
      : null;
    if (dialogSpeaker) links.push(createCharacterLink(dialogSpeaker, "Speaker", "dialog"));

    const fieldText = getNodeCharacterFieldText(node);
    if (fieldText) {
      characters.forEach((character) => {
        if (dialogSpeaker?.id === character.id) return;
        if (characterFieldReferencesName(fieldText, character.name)) {
          links.push(createCharacterLink(character, "Present", "field"));
        }
      });
    }

    const body = displayBody(node);
    if (body) {
      characters.forEach((character) => {
        if (bodyMentionsCharacter(body, character.name)) {
          links.push(createCharacterLink(character, "Mentioned", "mention"));
        }
      });
    }

    if (includeEventAggregate && isEventSheetNode(node)) {
      getEventContainedNodes(node).forEach((child) => {
        getNodeCharacterLinks(child, { includeEventAggregate: false }).forEach((link) => {
          links.push({ ...link, source: "event" });
        });
      });
    }

    return dedupeCharacterLinks(links);
  }

  function createCharacterLink(character, role, source) {
    return {
      characterId: character.id,
      character,
      role: normalizeCastRole(role),
      source
    };
  }

  function dedupeCharacterLinks(links) {
    const seen = new Set();
    return links.filter((link) => {
      if (!link?.characterId) return false;
      const key = `${link.characterId}:${normalizeCastRole(link.role)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function getNodeCharacterFieldText(node) {
    return String(node?.characterEncountered || "");
  }

  function characterFieldReferencesName(value, name) {
    const text = String(value || "").trim().toLowerCase();
    const target = String(name || "").trim().toLowerCase();
    if (!text || !target) return false;
    const parts = text.split(/[,;\n]/).map((part) => part.trim()).filter(Boolean);
    return parts.includes(target) || text.includes(target);
  }

  function bodyMentionsCharacter(text, name) {
    const body = String(text || "");
    const target = `@${String(name || "").trim()}`;
    if (target.length <= 1) return false;
    const lowerBody = body.toLowerCase();
    const lowerTarget = target.toLowerCase();
    let index = lowerBody.indexOf(lowerTarget);
    while (index >= 0) {
      const before = index > 0 ? lowerBody[index - 1] : "";
      const after = lowerBody[index + lowerTarget.length] || "";
      if (!isMentionNameChar(before) && !isMentionNameChar(after)) return true;
      index = lowerBody.indexOf(lowerTarget, index + lowerTarget.length);
    }
    return false;
  }

  function isMentionNameChar(character) {
    return /[a-z0-9_]/i.test(character || "");
  }

  function isNodeRelatedToCharacter(node, characterId) {
    return getNodeCharacterLinks(node, { includeEventAggregate: isEventSheetNode(node) })
      .some((link) => link.characterId === characterId);
  }

  function getNodeCharacterSummary(node, options = {}) {
    const names = [];
    const seen = new Set();
    getNodeCharacterLinks(node, options).forEach((link) => {
      const name = link.character?.name || getCharacterName(link.characterId);
      if (!name || seen.has(link.characterId)) return;
      seen.add(link.characterId);
      names.push(name);
    });
    return names.join(", ");
  }

  function getEventFrameCharacterSummary(node) {
    return getNodeCharacterSummary(node, { includeEventAggregate: true });
  }

  function getEventFrameCharacterIds(node) {
    return new Set(getNodeCharacterLinks(node, { includeEventAggregate: true }).map((link) => link.characterId));
  }

  function createCharacterBacklinkGroups() {
    return CHARACTER_BACKLINK_GROUP_DEFS.map((group) => ({
      ...group,
      items: [],
      seen: new Set()
    }));
  }

  function getIndexedCharacterBacklinkGroups(index, characterId) {
    if (!index.has(characterId)) index.set(characterId, createCharacterBacklinkGroups());
    return index.get(characterId);
  }

  function addIndexedCharacterBacklink(index, characterId, groupId, node, relation, source) {
    const groups = getIndexedCharacterBacklinkGroups(index, characterId);
    const group = groups.find((item) => item.id === groupId);
    if (!group || !node) return;
    const key = `${node.id}:${relation || ""}`;
    if (group.seen.has(key)) return;
    group.seen.add(key);
    group.items.push({ node, relation, source });
  }

  function finalizeCharacterBacklinkGroups(groups, sequenceMap) {
    groups.forEach((group) => {
      group.items.sort((a, b) => compareCharacterBacklinkItems(a, b, sequenceMap));
      delete group.seen;
    });
    return groups;
  }

  function buildCharacterBacklinkIndex(characters = getCharacters()) {
    const sequenceMap = getStorySequenceMap(getStoryStructure());
    const characterIds = new Set(characters.map((character) => character.id));
    const index = new Map(characters.map((character) => [character.id, createCharacterBacklinkGroups()]));

    state.project.nodes.forEach((node) => {
      getNodeCharacterLinks(node, { includeEventAggregate: false }).forEach((link) => {
        if (!characterIds.has(link.characterId)) return;
        const role = normalizeCastRole(link.role);
        addIndexedCharacterBacklink(index, link.characterId, role, node, CAST_RELATION_LABELS[role], link.source);
      });

      if (isEventSheetNode(node)) {
        getEventFrameCharacterIds(node).forEach((characterId) => {
          if (characterIds.has(characterId)) {
            addIndexedCharacterBacklink(index, characterId, "EventFrames", node, "Characters", "event");
          }
        });
      }
    });

    index.forEach((groups) => finalizeCharacterBacklinkGroups(groups, sequenceMap));
    return index;
  }

  function getCharacterBacklinkGroups(character, index = null) {
    if (index?.has(character.id)) return index.get(character.id);
    return buildCharacterBacklinkIndex([character]).get(character.id) || finalizeCharacterBacklinkGroups(createCharacterBacklinkGroups(), new Map());
  }

  function compareCharacterBacklinkItems(a, b, sequenceMap) {
    const sequenceA = sequenceMap.get(a.node.id) ?? Number.POSITIVE_INFINITY;
    const sequenceB = sequenceMap.get(b.node.id) ?? Number.POSITIVE_INFINITY;
    if (sequenceA !== sequenceB) return sequenceA - sequenceB;
    return a.node.y - b.node.y || a.node.x - b.node.x || a.node.id.localeCompare(b.node.id);
  }

  function getTotalCharacterLinkCount() {
    return getCharacterRenderContext().linkCount;
  }

  function formatNodeSnippet(node) {
    const text = String(displayBody(node) || node.eventDescription || "").replace(/\s+/g, " ").trim();
    if (!text) return "No text";
    return text.length > 96 ? `${text.slice(0, 93)}...` : text;
  }

  function uniqueVariableKey(baseKey) {
    const variables = normalizeVariablesObject(state.project.variables);
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
    const entry = state.project.nodes.find((node) => node.type === "Entry");
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

  function getStoryStructure() {
    const entries = new Map(state.project.nodes.map((node) => [node.id, { node, children: [] }]));
    const frames = state.project.nodes.filter((node) => isFrameNode(node));
    const frameChildren = new Map(frames.map((frame) => [frame.id, []]));
    const parentFrameByNodeId = new Map();
    const reachable = new Set(getReachableStory().map((node) => node.id));
    const includeMemo = new Map();
    const roots = [];

    state.project.nodes.forEach((node) => {
      const parent = getSmallestContainingFrame(node, frames);
      parentFrameByNodeId.set(node.id, parent);
      if (parent && entries.has(parent.id)) {
        frameChildren.get(parent.id)?.push(node.id);
      }
    });

    const shouldInclude = (node) => {
      if (!node) return false;
      if (includeMemo.has(node.id)) return includeMemo.get(node.id);
      const included = isFrameNode(node)
        ? reachable.has(node.id) || (frameChildren.get(node.id) || []).some((childId) => shouldInclude(getNode(childId)))
        : reachable.has(node.id);
      includeMemo.set(node.id, included);
      return included;
    };

    state.project.nodes.forEach((node) => {
      if (!shouldInclude(node)) return;
      const entry = entries.get(node.id);
      const parent = parentFrameByNodeId.get(node.id);
      if (parent && entries.has(parent.id) && shouldInclude(parent)) {
        entries.get(parent.id).children.push(entry);
      } else {
        roots.push(entry);
      }
    });

    const sortContext = createStorySortContext();
    const sortEntries = (items) => {
      items.forEach((entry) => sortEntries(entry.children));
      items.sort((a, b) => compareStoryEntries(a, b, sortContext));
    };
    sortEntries(roots);
    return roots;
  }

  function createStorySortContext() {
    return { flowOrder: getNodeFlowOrderMap(), computedOrder: new Map() };
  }

  function compareStoryEntries(a, b, context) {
    const storyOrderA = getNodeStoryOrder(a.node);
    const storyOrderB = getNodeStoryOrder(b.node);
    if (storyOrderA !== storyOrderB) return storyOrderA - storyOrderB;

    const orderA = getStoryEntryOrder(a, context);
    const orderB = getStoryEntryOrder(b, context);
    if (orderA !== orderB) return orderA - orderB;

    return a.node.y - b.node.y || a.node.x - b.node.x || a.node.id.localeCompare(b.node.id);
  }

  function getStoryEntryOrder(entry, context) {
    if (context.computedOrder.has(entry.node.id)) return context.computedOrder.get(entry.node.id);
    const ownOrder = getNodeIdentityOrder(entry.node, context.flowOrder);
    const childOrder = entry.children.reduce((best, child) => Math.min(best, getStoryEntryOrder(child, context)), Number.POSITIVE_INFINITY);
    const order = Math.min(ownOrder, childOrder);
    context.computedOrder.set(entry.node.id, order);
    return order;
  }

  function getNodeStoryOrder(node) {
    return Number.isFinite(node?.storyOrder) ? node.storyOrder : Number.POSITIVE_INFINITY;
  }

  function clearStoryOrderOverrides() {
    state.project.nodes.forEach((node) => delete node.storyOrder);
  }

  function clearEventRowOrderOverrides() {
    state.project.eventRowOrder = {};
  }

  function resetStoryOrderToGraph() {
    const hadOverrides = state.project.nodes.some((node) => Number.isFinite(node.storyOrder));
    clearStoryOrderOverrides();
    renderStoryPanel();
    setStatus(hadOverrides ? "Story re-sorted by flow id." : "Story already follows flow id.");
  }

  function resetEventRowOrderToGraph() {
    const hadOverrides = Object.keys(getEventRowOrderMap()).length > 0;
    clearEventRowOrderOverrides();
    renderEventsSheetPage();
    setStatus(hadOverrides ? "Event rows re-sorted by flow id." : "Event rows already follow flow id.");
  }

  function getStoryParentMap() {
    const parentMap = new Map();
    const walk = (entries, parentId) => {
      entries.forEach((entry) => {
        parentMap.set(entry.node.id, parentId);
        walk(entry.children, entry.node.id);
      });
    };
    walk(getStoryStructure(), "");
    return parentMap;
  }

  function getStoryEntriesForParent(parentId) {
    if (!parentId) return getStoryStructure();
    const stack = [...getStoryStructure()];
    while (stack.length) {
      const entry = stack.shift();
      if (entry.node.id === parentId) return entry.children;
      stack.push(...entry.children);
    }
    return [];
  }

  function getSmallestContainingFrame(node, frames) {
    const nodeBounds = getNodeBounds(node);
    const nodeCenter = boundsCenter(nodeBounds);
    const nodeArea = boundsArea(nodeBounds);
    let smallest = null;
    let smallestArea = Number.POSITIVE_INFINITY;
    frames.forEach((frame) => {
      if (frame.id === node.id) return;
      const frameBounds = getNodeBounds(frame);
      if (!boundsContainPoint(frameBounds, nodeCenter)) return;
      const area = boundsArea(frameBounds);
      if (isFrameNode(node) && area <= nodeArea) return;
      if (area < smallestArea) {
        smallest = frame;
        smallestArea = area;
      }
    });
    return smallest;
  }

  function getNodeBounds(node) {
    // Pure arithmetic size: never touch the DOM here. getNodeBounds is called for
    // every node on every viewport cull (and inside frame-containment scans), so
    // reading offsetWidth/offsetHeight here caused N forced reflows per render
    // (layout thrashing). The rendered size equals nodeLayoutSize() because
    // renderNodes writes that exact box into the element's inline style.
    const size = nodeLayoutSize(node);
    return {
      left: node.x,
      top: node.y,
      right: node.x + size.width,
      bottom: node.y + size.height
    };
  }

  function boundsCenter(bounds) {
    return {
      x: bounds.left + (bounds.right - bounds.left) / 2,
      y: bounds.top + (bounds.bottom - bounds.top) / 2
    };
  }

  function nodeLayoutSize(node) {
    if (!node || typeof node !== "object") {
      return { width: FALLBACK_NODE_META.width, height: minNodeHeight(null) };
    }
    const manualWidth = getManualNodeWidth(node);
    const manualHeight = getManualNodeHeight(node);
    const signature = getNodeLayoutSignature(node, manualWidth, manualHeight);
    const cached = nodeLayoutSizeCache.get(node);
    if (cached && cached.signature === signature) return cached.size;
    const width = manualWidth || defaultNodeWidth(node);
    const baseHeight = manualHeight || defaultNodeHeight(node, width);
    const inlineEditField = getActiveInlineEditField(node);
    const height = inlineEditField ? Math.max(baseHeight, minInlineNodeEditHeight(inlineEditField)) : baseHeight;
    const size = { width, height };
    nodeLayoutSizeCache.set(node, { signature, size });
    return size;
  }

  function boundsContainBounds(container, child) {
    return child.left >= container.left
      && child.top >= container.top
      && child.right <= container.right
      && child.bottom <= container.bottom;
  }

  function boundsContainPoint(container, point) {
    return point.x >= container.left
      && point.x <= container.right
      && point.y >= container.top
      && point.y <= container.bottom;
  }

  function boundsArea(bounds) {
    return Math.max(0, bounds.right - bounds.left) * Math.max(0, bounds.bottom - bounds.top);
  }

  function moveStoryNode(nodeId, placement) {
    const node = getNode(nodeId);
    if (!node) return;
    const historyBefore = getHistorySnapshot();
    const parent = placement.parentId ? getNode(placement.parentId) : null;
    const parentMap = getStoryParentMap();
    const previousParentId = parentMap.get(nodeId) || "";
    const nextParentId = placement.parentId || "";
    const siblings = getStoryEntriesForParent(placement.parentId)
      .map((entry) => entry.node)
      .filter((sibling) => sibling.id !== nodeId);
    let targetIndex = siblings.length;
    if (placement.targetId) {
      const targetSiblingIndex = siblings.findIndex((sibling) => sibling.id === placement.targetId);
      if (targetSiblingIndex >= 0) targetIndex = placement.mode === "after" ? targetSiblingIndex + 1 : targetSiblingIndex;
    }
    const ordered = [...siblings];
    ordered.splice(targetIndex, 0, node);

    if (previousParentId !== nextParentId) {
      getStoryEntriesForParent(previousParentId)
        .map((entry) => entry.node)
        .filter((sibling) => sibling.id !== nodeId)
        .forEach((sibling, index) => {
          sibling.storyOrder = index;
        });
      moveStoryNodeForParentChange(node, parent, ordered, placement);
    }

    ordered.forEach((sibling, index) => {
      sibling.storyOrder = index;
    });
    state.selectedNodeId = nodeId;
    state.selectedLinkId = null;
    state.panel = "story";
    markProjectStructureChanged();
    renderAll();
    requestAnimationFrame(() => scrollStoryNodeIntoView(nodeId));
    setStatus(parent
      ? `${node.title || getNodeDisplayId(node)} moved inside ${parent.title || getNodeDisplayId(parent)}.`
      : `${node.title || getNodeDisplayId(node)} moved in Story.`);
    commitHistoryFromSnapshot(historyBefore);
  }

  function moveStoryNodeForParentChange(node, parent, ordered, placement) {
    const position = parent
      ? getStoryPositionInsideFrame(node, parent, ordered, placement)
      : getStoryPositionAtRoot(node, placement);
    moveNodeWithStoryChildren(node, position.x, position.y);
    if (parent) ensureFrameContainsNodes(parent, [node]);
  }

  function getStoryPositionInsideFrame(node, parent, ordered, placement) {
    const minX = parent.x + STORY_FRAME_PADDING;
    const minY = parent.y + STORY_FRAME_PADDING + 34;
    const target = placement.targetId && placement.targetId !== parent.id ? getNode(placement.targetId) : null;
    let position = { x: minX, y: minY };

    if (target && target.id !== node.id) {
      const targetBounds = getNodeBounds(target);
      position = {
        x: targetBounds.left,
        y: placement.mode === "before"
          ? targetBounds.top - nodeHeight(node) - 24
          : targetBounds.bottom + 24
      };
    } else {
      const childBounds = ordered
        .filter((candidate) => candidate.id !== node.id)
        .map(getNodeBounds);
      position.y = childBounds.length
        ? Math.max(...childBounds.map((bounds) => bounds.bottom)) + 24
        : minY;
    }

    position.x = Math.max(minX, position.x);
    position.y = Math.max(minY, position.y);
    return avoidNestedFramesInsideParent(node, parent, roundStoryPosition(position));
  }

  function getStoryPositionAtRoot(node, placement) {
    const target = placement.targetId ? getNode(placement.targetId) : null;
    let position = { x: getRootStoryX(), y: getRootStoryY() };

    if (target && target.id !== node.id) {
      const targetBounds = getNodeBounds(target);
      position = {
        x: targetBounds.left,
        y: placement.mode === "before"
          ? targetBounds.top - nodeHeight(node) - 32
          : targetBounds.bottom + 32
      };
    } else {
      const rootBounds = getStoryEntriesForParent("")
        .map((entry) => entry.node)
        .filter((candidate) => candidate.id !== node.id)
        .map(getNodeBounds);
      if (rootBounds.length) {
        position = {
          x: Math.min(...rootBounds.map((bounds) => bounds.left)),
          y: Math.max(...rootBounds.map((bounds) => bounds.bottom)) + 32
        };
      }
    }

    position.y = Math.max(40, position.y);
    return avoidAllFrames(node, roundStoryPosition(position));
  }

  function roundStoryPosition(position) {
    return {
      x: Math.round(position.x),
      y: Math.round(position.y)
    };
  }

  function avoidNestedFramesInsideParent(node, parent, position) {
    const parentBounds = getNodeBounds(parent);
    const nestedFrames = state.project.nodes
      .filter((frame) => frame.id !== node.id && frame.id !== parent.id && isFrameNode(frame))
      .filter((frame) => boundsContainBounds(parentBounds, getNodeBounds(frame)));
    return avoidFrames(node, position, nestedFrames);
  }

  function avoidAllFrames(node, position) {
    const frames = state.project.nodes.filter((frame) => frame.id !== node.id && isFrameNode(frame));
    return avoidFrames(node, position, frames);
  }

  function avoidFrames(node, position, frames) {
    let next = { ...position };
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const testBounds = getNodeBounds({ ...node, x: next.x, y: next.y });
      const container = frames
        .filter((frame) => boundsContainBounds(getNodeBounds(frame), testBounds))
        .sort((a, b) => boundsArea(getNodeBounds(a)) - boundsArea(getNodeBounds(b)))
        [0];
      if (!container) return next;
      const containerBounds = getNodeBounds(container);
      next = {
        x: Math.round(containerBounds.right + STORY_FRAME_PADDING),
        y: Math.round(Math.max(containerBounds.top, next.y))
      };
    }
    return next;
  }

  function moveNodeWithStoryChildren(node, x, y) {
    const descendants = isFrameNode(node) ? getStoryDescendantNodes(node.id) : [];
    const deltaX = Math.round(x - node.x);
    const deltaY = Math.round(y - node.y);
    node.x = Math.round(x);
    node.y = Math.round(y);
    descendants.forEach((descendant) => {
      descendant.x = Math.round(descendant.x + deltaX);
      descendant.y = Math.round(descendant.y + deltaY);
    });
  }

  function getStoryDescendantNodes(parentId) {
    const parentMap = getStoryParentMap();
    return state.project.nodes.filter((node) => {
      let current = parentMap.get(node.id) || "";
      while (current) {
        if (current === parentId) return true;
        current = parentMap.get(current) || "";
      }
      return false;
    });
  }

  function ensureFrameContainsNodes(frame, nodes) {
    if (!nodes.length) return;
    const frameBounds = getNodeBounds(frame);
    const childBounds = nodes.map(getNodeBounds);
    const right = Math.max(...childBounds.map((bounds) => bounds.right)) + STORY_FRAME_PADDING;
    const bottom = Math.max(...childBounds.map((bounds) => bounds.bottom)) + STORY_FRAME_PADDING;
    frame.width = Math.max(frame.width || getNodeMeta(frame.type).width || 420, right - frameBounds.left);
    frame.height = Math.max(frame.height || nodeHeight(frame), bottom - frameBounds.top);
  }

  function getRootStoryX() {
    const rootEntries = getStoryEntriesForParent("");
    const rootX = rootEntries.map((entry) => entry.node.x).filter(Number.isFinite);
    return rootX.length ? Math.min(...rootX) : 80;
  }

  function getRootStoryY() {
    const rootEntries = getStoryEntriesForParent("");
    const rootY = rootEntries.map((entry) => entry.node.y).filter(Number.isFinite);
    return rootY.length ? Math.min(...rootY) : 120;
  }

  function getProjectBounds() {
    if (!state.project.nodes.length) return { x: 0, y: 0, width: 800, height: 500 };
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxRight = Number.NEGATIVE_INFINITY;
    let maxBottom = Number.NEGATIVE_INFINITY;
    state.project.nodes.forEach((node) => {
      const size = nodeLayoutSize(node);
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxRight = Math.max(maxRight, node.x + size.width);
      maxBottom = Math.max(maxBottom, node.y + size.height);
    });
    return {
      x: minX,
      y: minY,
      width: maxRight - minX,
      height: maxBottom - minY
    };
  }

  function getExportBounds(nodes, links) {
    if (!nodes.length) return { x: 0, y: 0, width: 800, height: 500 };
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxRight = Number.NEGATIVE_INFINITY;
    let maxBottom = Number.NEGATIVE_INFINITY;
    nodes.forEach((node) => {
      const size = nodeLayoutSize(node);
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxRight = Math.max(maxRight, node.x + size.width);
      maxBottom = Math.max(maxBottom, node.y + size.height);
    });
    links.forEach((link) => {
      const from = nodeMap.get(link.from);
      const to = nodeMap.get(link.to);
      if (!from || !to) return;
      const bounds = getLinkCurveBounds(getOutputPoint(from), getInputPoint(to));
      minX = Math.min(minX, bounds.left);
      minY = Math.min(minY, bounds.top);
      maxRight = Math.max(maxRight, bounds.right);
      maxBottom = Math.max(maxBottom, bounds.bottom);
    });
    return {
      x: minX,
      y: minY,
      width: maxRight - minX,
      height: maxBottom - minY
    };
  }

  function getEventRowGroups() {
    const typeOrder = new Map(getProjectNodeTypes().map((typeDef, index) => [typeDef.type, index]));
    const groups = new Map();
    getEventRows().forEach((node) => {
      const type = node.type || "Event";
      if (!groups.has(type)) {
        groups.set(type, {
          type,
          label: getNodeTypeLabel(type),
          rows: []
        });
      }
      groups.get(type).rows.push(node);
    });
    return [...groups.values()]
      .sort((a, b) => (typeOrder.get(a.type) ?? Number.POSITIVE_INFINITY) - (typeOrder.get(b.type) ?? Number.POSITIVE_INFINITY)
        || a.label.localeCompare(b.label));
  }

  function getFilteredEventRowGroups(groups) {
    const query = state.eventSearch.trim().toLowerCase();
    if (!query) return groups;
    return groups
      .map((group) => ({
        ...group,
        rows: group.rows.filter((node) => eventRowMatchesSearch(node, query))
      }))
      .filter((group) => group.rows.length);
  }

  function eventRowMatchesSearch(node, query) {
    const columns = getEventSheetColumns(node.type);
    const containedNodes = getEventContainedNodes(node);
    const values = [
      node.id,
      getNodeDisplayId(node),
      node.title,
      node.type,
      getNodeTypeLabel(node.type),
      displayBody(node),
      getNodeCharacterSummary(node, { includeEventAggregate: true }),
      ...columns.map((column) => getNodeEventValue(node, column.key)),
      ...containedNodes.flatMap((child) => [
        child.id,
        getNodeDisplayId(child),
        child.title,
        getNodeTypeLabel(child.type),
        displayBody(child),
        getNodeCharacterSummary(child, { includeEventAggregate: false })
      ])
    ];
    return values
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  }

  function getEventRows(type = null) {
    const rows = state.project.nodes
      .filter((node) => isEventSheetNode(node))
      .filter((node) => !type || node.type === type)
      .sort(compareNodesByIdentity);
    return applyEventRowOrder(rows);
  }

  function getEventRowOrderMap() {
    const map = state.project.eventRowOrder;
    if (!map || typeof map !== "object" || Array.isArray(map)) return {};
    return map;
  }

  function applyEventRowOrder(rows) {
    const orderMap = getEventRowOrderMap();
    const groups = new Map();
    rows.forEach((node) => {
      const list = groups.get(node.type) || [];
      list.push(node);
      groups.set(node.type, list);
    });
    const ordered = [];
    groups.forEach((list, type) => {
      const order = Array.isArray(orderMap[type]) ? orderMap[type] : [];
      const known = new Set(list.map((node) => node.id));
      const sorted = order
        .filter((id) => known.has(id))
        .map((id) => list.find((node) => node.id === id))
        .filter(Boolean);
      const seenIds = new Set(sorted.map((node) => node.id));
      list.forEach((node) => {
        if (!seenIds.has(node.id)) sorted.push(node);
      });
      ordered.push(...sorted);
    });
    return ordered;
  }

  function setEventRowOrder(type, ids) {
    if (!type) return;
    if (!state.project.eventRowOrder || typeof state.project.eventRowOrder !== "object" || Array.isArray(state.project.eventRowOrder)) {
      state.project.eventRowOrder = {};
    }
    state.project.eventRowOrder[type] = ids.slice();
  }

  function moveEventRow(nodeId, targetId, placement) {
    const node = getNode(nodeId);
    const target = getNode(targetId);
    if (!node || !target || node.type !== target.type) return;
    const historyBefore = getHistorySnapshot();
    const rowsInType = getEventRows(node.type);
    const ids = rowsInType.map((row) => row.id).filter((id) => id !== nodeId);
    const targetIndex = ids.indexOf(targetId);
    if (targetIndex < 0) return;
    const insertIndex = placement === "after" ? targetIndex + 1 : targetIndex;
    ids.splice(insertIndex, 0, nodeId);
    setEventRowOrder(node.type, ids);
    renderEventsSheetPage();
    setStatus(`${node.title || getNodeDisplayId(node)} reordered.`);
    commitHistoryFromSnapshot(historyBefore);
  }

  function getNodeEventValue(node, key) {
    if (!node) return "";
    const customField = getNodeCustomFieldEntries(node).find((field) => field.key === key);
    if (customField) return customField.value;
    if (node.customFields && node.customFields[key] != null && node.customFields[key] !== "") return String(node.customFields[key]);
    if (Array.isArray(node[key])) return node[key].join("\n");
    if (node[key] != null && node[key] !== "") return String(node[key]);
    if (key === "eventDescription") return displayBody(node);
    if (key === "characterEncountered") {
      const summary = isEventSheetNode(node)
        ? getEventFrameCharacterSummary(node)
        : getNodeCharacterSummary(node, { includeEventAggregate: false });
      if (summary) return summary;
      if (node.type === "Dialog") return node.title || "";
    }
    if (key === "eventType") return "";
    if (key === "beatList") return node.title || "";
    return "";
  }

  function getEventContainedNodes(eventNode) {
    if (!isEventSheetNode(eventNode)) return [];
    const bounds = getEventBounds(eventNode);
    return state.project.nodes
      .filter((node) => node.id !== eventNode.id && !isFrameNode(node))
      .filter((node) => isNodeInsideBounds(node, bounds))
      .sort((a, b) => a.y - b.y || a.x - b.x);
  }

  function getEventBounds(eventNode) {
    const size = nodeLayoutSize(eventNode);
    return {
      left: eventNode.x,
      top: eventNode.y,
      right: eventNode.x + size.width,
      bottom: eventNode.y + size.height
    };
  }

  function isNodeInsideBounds(node, bounds) {
    const size = nodeLayoutSize(node);
    return node.x >= bounds.left
      && node.y >= bounds.top
      && node.x + size.width <= bounds.right
      && node.y + size.height <= bounds.bottom;
  }

  function formatEventElement(node) {
    const content = displayBody(node).trim();
    const label = `[${getNodeTypeLabel(node.type)} ${getNodeDisplayId(node)}] ${node.title || getNodeDisplayId(node)}`;
    return content ? `${label}\n${content}` : label;
  }

  function formatCsvCell(value) {
    const text = String(value ?? "");
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function buildExportSvg() {
    const margin = 90;
    const nodes = getExportRenderNodes();
    const nodeIds = new Set(nodes.map((node) => node.id));
    const renderLinks = state.project.links.filter((link) => nodeIds.has(link.from) && nodeIds.has(link.to));
    const bounds = getExportBounds(nodes, renderLinks);
    const width = Math.ceil(bounds.width + margin * 2);
    const height = Math.ceil(bounds.height + margin * 2);
    const offset = { x: margin - bounds.x, y: margin - bounds.y };

    const links = renderLinks.map((link) => renderExportLink(link, offset)).join("");
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
      <marker id="export-arrow" viewBox="0 0 8 8" refX="7.5" refY="4" markerWidth="5" markerHeight="5" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
        <path d="M 0 0 L 8 4 L 0 8 z" fill="rgba(220,221,222,0.78)"/>
      </marker>
    </defs>
    <rect width="100%" height="100%" fill="#202020"/>
    <rect width="100%" height="100%" fill="url(#grid-large)"/>
    <text x="28" y="42" fill="#dcddde" font-family="system-ui, sans-serif" font-size="22" font-weight="700">${escapeSvg(state.project.title || "Narrative Canvas")}</text>
    ${links}
    ${nodeMarkup}
  </svg>`;
  }

  function getExportRenderNodes() {
    return getCanvasLayerItems().map((item) => item.node);
  }

  function renderExportNode(node, offset) {
    const meta = getNodeMeta(node.type);
    const size = nodeLayoutSize(node);
    const width = size.width;
    const height = size.height;
    const x = node.x + offset.x;
    const y = node.y + offset.y;
    const isFrame = isFrameNode(node);
    const frameStyle = getExportFrameStyle(node);
    const fill = isFrame ? frameStyle.fill : "rgba(43,43,43,0.96)";
    const stroke = isFrame ? frameStyle.stroke : "rgba(255,255,255,0.13)";
    const bodyLines = wrapSvgText(getNodeExportBody(node), Math.max(14, Math.floor((width - 28) / 7.2)), isFrame ? 8 : 5);
    const titleLines = wrapSvgText(node.title || "Untitled", Math.max(10, Math.floor((width - 76) / 8)), 2);
    const titleText = renderSvgLines(titleLines, x + 14, y + 58, 14, 13, "#dcddde", 700);
    const bodyText = renderSvgLines(bodyLines, x + 14, y + 88, 14, 12, "#dcddde", 400);
    const icon = getNodeIcon(node);

    return `<g>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="7" fill="${fill}" stroke="${stroke}"/>
      <rect x="${x}" y="${y}" width="${width}" height="36" rx="7" fill="rgba(255,255,255,0.06)"/>
      <rect x="${x + 10}" y="${y + 8}" width="22" height="22" rx="4" fill="${meta.color}"/>
      <text x="${x + 21}" y="${y + 24}" text-anchor="middle" fill="#101010" font-family="system-ui, sans-serif" font-size="${getNodeIconFontSize(icon)}" font-weight="800">${escapeSvg(icon)}</text>
      <text x="${x + 40}" y="${y + 23}" fill="#a8a8a8" font-family="system-ui, sans-serif" font-size="12">${escapeSvg(getNodeTypeLabel(node.type))}</text>
      <text x="${x + width - 12}" y="${y + 23}" text-anchor="end" fill="#7a7a7a" font-family="system-ui, sans-serif" font-size="12">${escapeSvg(getNodeDisplayId(node))}</text>
      ${titleText}
      ${bodyText}
      ${hasNodeChoices(node) ? `<text x="${x + 14}" y="${y + height - 16}" fill="#a8a8a8" font-family="system-ui, sans-serif" font-size="12">${node.choices.length} choices</text>` : ""}
    </g>`;
  }

  function getExportFrameStyle(node) {
    return isEventSheetNode(node)
      ? { fill: "rgba(96,65,150,0.52)", stroke: "rgba(180,140,255,0.62)" }
      : { fill: "rgba(118,124,134,0.2)", stroke: "rgba(188,194,204,0.42)" };
  }

  function renderExportLink(link, offset) {
    const from = getNode(link.from);
    const to = getNode(link.to);
    if (!from || !to) return "";
    const fromPoint = exportOutputPoint(from, offset);
    const toPoint = exportInputPoint(to, offset);
    const path = linkPath(fromPoint, toPoint);
    const label = link.label ? renderExportLinkLabel(link.label, midpoint(fromPoint, toPoint)) : "";
    return `<path d="${path}" fill="none" stroke="rgba(220,221,222,0.78)" stroke-width="2" stroke-linecap="round" marker-end="url(#export-arrow)"/>${label}`;
  }

  function renderExportLinkLabel(label, point) {
    return `<text x="${point.x}" y="${point.y - 8}" fill="#a8a8a8" font-family="system-ui, sans-serif" font-size="12" text-anchor="middle">${escapeSvg(label)}</text>`;
  }

  function exportInputPoint(node, offset) {
    const size = nodeLayoutSize(node);
    return { x: node.x + offset.x - LINK_PORT_ANCHOR_OFFSET, y: node.y + offset.y + size.height / 2 };
  }

  function exportOutputPoint(node, offset) {
    const size = nodeLayoutSize(node);
    return { x: node.x + offset.x + size.width + LINK_PORT_ANCHOR_OFFSET, y: node.y + offset.y + size.height / 2 };
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

  function getExportRasterPlan(svg, requestedScale = 1) {
    const size = getSvgDimensions(svg);
    const requested = normalizeExportImageScale(requestedScale);
    const scale = getSafeExportRasterScale(size.width, size.height, requested);
    return {
      ...size,
      requestedScale: requested,
      scale,
      outputWidth: Math.max(1, Math.ceil(size.width * scale)),
      outputHeight: Math.max(1, Math.ceil(size.height * scale)),
      limited: scale < requested - 0.001
    };
  }

  function getSvgDimensions(svg) {
    const width = Number((String(svg).match(/\swidth="([\d.]+)"/) || [])[1]);
    const height = Number((String(svg).match(/\sheight="([\d.]+)"/) || [])[1]);
    return {
      width: Number.isFinite(width) && width > 0 ? width : 800,
      height: Number.isFinite(height) && height > 0 ? height : 500
    };
  }

  function getSafeExportRasterScale(width, height, requestedScale = 1) {
    const requested = Math.max(EXPORT_IMAGE_MIN_SCALE, normalizeExportImageScale(requestedScale));
    const safeWidth = Math.max(1, Number(width) || 1);
    const safeHeight = Math.max(1, Number(height) || 1);
    const dimensionLimit = Math.min(EXPORT_IMAGE_MAX_DIMENSION / safeWidth, EXPORT_IMAGE_MAX_DIMENSION / safeHeight);
    const areaLimit = Math.sqrt(EXPORT_IMAGE_MAX_PIXELS / Math.max(1, safeWidth * safeHeight));
    return Math.max(EXPORT_IMAGE_MIN_SCALE, Math.min(requested, dimensionLimit, areaLimit));
  }

  function getExportImageSuffix(preset, rasterPlan) {
    return rasterPlan.limited ? `@${formatExportScaleValue(rasterPlan.scale)}x` : preset.suffix;
  }

  function formatExportScaleLabel(scale) {
    return `${formatExportScaleValue(scale)}x`;
  }

  function formatExportScaleValue(scale) {
    return String(Math.round(scale * 100) / 100).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
  }

  function svgToPngBlob(svg, scale = 1) {
    return new Promise((resolve, reject) => {
      const svgBlob = new Blob([svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(svgBlob);
      const image = new Image();
      image.onload = () => {
        const outputScale = getSafeExportRasterScale(image.naturalWidth, image.naturalHeight, scale);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.ceil(image.naturalWidth * outputScale));
        canvas.height = Math.max(1, Math.ceil(image.naturalHeight * outputScale));
        const context = canvas.getContext("2d");
        context.fillStyle = "#202020";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
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
    return getNodeIndex().get(id);
  }

  function getNodeIndex() {
    const nodes = Array.isArray(state.project.nodes) ? state.project.nodes : [];
    const current = state.nodeIndex;
    if (current?.nodes === nodes && current.length === nodes.length) return current.map;
    const map = new Map(nodes.map((node) => [node.id, node]));
    state.nodeIndex = { nodes, length: nodes.length, map };
    return map;
  }

  function getLink(id) {
    return getLinkIndex().get(id);
  }

  function getOutgoing(id) {
    return getOutgoingIndex().get(id) || [];
  }

  function getLinkIndex() {
    const links = Array.isArray(state.project.links) ? state.project.links : [];
    const current = state.linkIndex;
    if (current?.links === links && current.length === links.length) return current.map;
    const map = new Map(links.map((link) => [link.id, link]));
    state.linkIndex = { links, length: links.length, map };
    return map;
  }

  function getOutgoingIndex() {
    const links = Array.isArray(state.project.links) ? state.project.links : [];
    const current = state.outgoingIndex;
    if (current?.links === links && current.length === links.length) return current.map;
    const map = new Map();
    links.forEach((link) => {
      if (!map.has(link.from)) map.set(link.from, []);
      map.get(link.from).push(link);
    });
    map.forEach((items, sourceId) => {
      if (items.some((link) => normalizeChoiceIndex(link.choiceIndex) != null)) {
        map.set(sourceId, getChoiceOrderedLinks(items));
      }
    });
    state.outgoingIndex = { links, length: links.length, map };
    return map;
  }

  function invalidateLinkIndexes() {
    state.linkIndex = null;
    state.outgoingIndex = null;
  }

  // Derived maps (flow order, display IDs) depend on graph structure, geometry,
  // and node-type definitions. They do not depend on ordinary text edits, so the
  // cache is keyed by structureVersion rather than dirtyVersion.
  function derivedStructureUnchanged(cache) {
    return Boolean(cache)
      && cache.nodes === state.project.nodes
      && cache.links === state.project.links
      && cache.nodesLen === (state.project.nodes ? state.project.nodes.length : 0)
      && cache.linksLen === (state.project.links ? state.project.links.length : 0)
      && cache.version === state.structureVersion;
  }

  function derivedStructureStamp(map) {
    return {
      nodes: state.project.nodes,
      links: state.project.links,
      nodesLen: state.project.nodes ? state.project.nodes.length : 0,
      linksLen: state.project.links ? state.project.links.length : 0,
      version: state.structureVersion,
      map
    };
  }

  function getNearestLinkAtClientPoint(clientX, clientY) {
    if (!dom.viewport) return null;
    const point = screenToBoard(clientX, clientY);
    const threshold = 18 / Math.max(0.01, state.view.scale);
    let best = null;
    state.project.links.forEach((link) => {
      const from = getNode(link.from);
      const to = getNode(link.to);
      if (!from || !to) return;
      const distance = distancePointToLink(point, getOutputPoint(from), getInputPoint(to));
      if (!best || distance < best.distance) best = { link, distance };
    });
    return best && best.distance <= threshold ? best.link : null;
  }

  function distancePointToLink(point, from, to) {
    const { c1, c2 } = getLinkControlPoints(from, to);
    let previous = from;
    let minDistance = Number.POSITIVE_INFINITY;
    for (let index = 1; index <= 28; index += 1) {
      const t = index / 28;
      const current = cubicPoint(from, c1, c2, to, t);
      minDistance = Math.min(minDistance, distancePointToSegment(point, previous, current));
      previous = current;
    }
    return minDistance;
  }

  function getLinkCurveBounds(from, to) {
    const { c1, c2 } = getLinkControlPoints(from, to);
    let minX = Math.min(from.x, to.x);
    let minY = Math.min(from.y, to.y);
    let maxX = Math.max(from.x, to.x);
    let maxY = Math.max(from.y, to.y);
    for (let index = 1; index < 32; index += 1) {
      const point = cubicPoint(from, c1, c2, to, index / 32);
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    return { left: minX, top: minY, right: maxX, bottom: maxY };
  }

  function getLinkControlPoints(from, to) {
    const dx = Math.max(80, Math.abs(to.x - from.x) * 0.45);
    return {
      c1: { x: from.x + dx, y: from.y },
      c2: { x: to.x - dx, y: to.y }
    };
  }

  function cubicPoint(p0, p1, p2, p3, t) {
    const u = 1 - t;
    const uu = u * u;
    const tt = t * t;
    return {
      x: uu * u * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + tt * t * p3.x,
      y: uu * u * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + tt * t * p3.y
    };
  }

  function distancePointToSegment(point, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx === 0 && dy === 0) return Math.hypot(point.x - a.x, point.y - a.y);
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
  }

  function getInputPoint(node) {
    const size = nodeLayoutSize(node);
    return { x: node.x - LINK_PORT_ANCHOR_OFFSET, y: node.y + size.height / 2 };
  }

  function getOutputPoint(node) {
    const size = nodeLayoutSize(node);
    return { x: node.x + size.width + LINK_PORT_ANCHOR_OFFSET, y: node.y + size.height / 2 };
  }

  function nodeHeight(node) {
    return nodeLayoutSize(node).height;
  }

  function defaultNodeWidth(node) {
    const meta = getNodeMeta(node?.type);
    const baseWidth = meta.width || (isFrameNode(node) ? nodeTypes.Event.width : FALLBACK_NODE_META.width);
    const maxWidth = isFrameNode(node) ? NODE_AUTO_FRAME_MAX_WIDTH : Math.min(maxNodeWidth(node), NODE_AUTO_MAX_WIDTH);
    const minWidth = isFrameNode(node) ? minNodeWidth(node) : Math.max(minNodeWidth(node), NODE_AUTO_MIN_WIDTH);
    const widestTextUnits = getNodeAutoSizeTextParts(node)
      .reduce((widest, part) => Math.max(widest, maxTextLineUnits(part)), 0);
    const contentWidth = Math.ceil(108 + widestTextUnits * 6.8);
    return Math.round(clamp(Math.max(baseWidth, contentWidth), minWidth, maxWidth));
  }

  function defaultNodeHeight(node, width = defaultNodeWidth(node)) {
    const titleLines = Math.min(2, Math.max(1, estimateWrappedLineCount(getNodeDisplayTitle(node, "Untitled"), width - 76, 8)));
    const body = displayBody(node);
    const maxBodyLines = isFrameNode(node) ? NODE_AUTO_FRAME_MAX_BODY_LINES : NODE_AUTO_MAX_BODY_LINES;
    const bodyLines = body
      ? Math.min(maxBodyLines, Math.max(NODE_AUTO_MIN_BODY_LINES, estimateWrappedLineCount(body, width - 28, 7.2)))
      : 0;
    const castLine = normalizeNodeCast(node?.cast).length ? 1 : 0;
    const choicesLine = hasNodeChoices(node) ? 1 : 0;
    const contentHeight = 34 + 26 + titleLines * 17 + bodyLines * 17 + castLine * 24 + choicesLine * 24;
    return Math.round(clamp(contentHeight, minNodeHeight(node), maxNodeHeight(node)));
  }

  function getManualNodeWidth(node) {
    const value = Number(node?.width);
    return Number.isFinite(value) && value > 0 ? Math.round(clamp(value, minNodeWidth(node), maxNodeWidth(node))) : null;
  }

  function getManualNodeHeight(node) {
    const value = Number(node?.height);
    return Number.isFinite(value) && value > 0 ? Math.round(clamp(value, minNodeHeight(node), maxNodeHeight(node))) : null;
  }

  function getNodeLayoutSignature(node, manualWidth, manualHeight) {
    return [
      state.structureVersion,
      manualWidth || "",
      manualHeight || "",
      getActiveInlineEditField(node) || "",
      node?.type || "",
      getNodeTypeLabel(node?.type),
      getNodeDisplayTitle(node, "Untitled"),
      displayBody(node),
      parseChoiceLines(node?.choices).join("\n"),
      normalizeNodeCast(node?.cast).map((entry) => `${entry.role}:${entry.characterId}`).join("|"),
      getNodeCustomFieldEntries(node).map((field) => `${field.key}:${field.value}`).join("|")
    ].join("\u001f");
  }

  function getNodeAutoSizeTextParts(node) {
    const customFields = getNodeCustomFieldEntries(node)
      .filter((field) => field.value !== "")
      .map((field) => `${field.label}: ${field.value}`);
    const cast = normalizeNodeCast(node?.cast).map((entry) => `${entry.characterId} ${entry.role}`);
    return [
      getNodeTypeLabel(node?.type),
      getNodeDisplayTitle(node, "Untitled"),
      displayBody(node),
      ...parseChoiceLines(node?.choices),
      ...customFields,
      ...cast
    ].filter((part) => String(part || "").trim() !== "");
  }

  function maxTextLineUnits(value) {
    return String(value || "")
      .split(/\r?\n/)
      .reduce((widest, line) => Math.max(widest, estimateTextUnits(line)), 0);
  }

  function estimateWrappedLineCount(value, width, unitPx) {
    const text = String(value || "");
    if (!text) return 0;
    const unitsPerLine = Math.max(8, Math.floor(Math.max(80, width) / unitPx));
    return text.split(/\r?\n/).reduce((count, line) => {
      const units = Math.max(1, estimateTextUnits(line));
      return count + Math.max(1, Math.ceil(units / unitsPerLine));
    }, 0);
  }

  function estimateTextUnits(value) {
    let units = 0;
    for (const char of String(value || "")) {
      if (char === "\t") {
        units += 4;
        continue;
      }
      const code = char.codePointAt(0);
      units += code > 0xffff || isWideTextCodePoint(code) ? 1.75 : 1;
    }
    return units;
  }

  function isWideTextCodePoint(code) {
    return (code >= 0x2e80 && code <= 0xa4cf)
      || (code >= 0xac00 && code <= 0xd7a3)
      || (code >= 0xf900 && code <= 0xfaff)
      || (code >= 0xff01 && code <= 0xff60);
  }

  function getNodeExportBody(node) {
    const propertyLines = getNodeCustomFieldEntries(node)
      .filter((field) => field.value !== "")
      .map((field) => `${field.label}: ${field.value}`);
    return [displayBody(node), ...propertyLines].filter(Boolean).join("\n");
  }

  function minNodeWidth(node) {
    return isFrameNode(node) ? 260 : 140;
  }

  function minNodeHeight(node) {
    return isFrameNode(node) ? 160 : 96;
  }

  function maxNodeWidth(node) {
    return isFrameNode(node) ? Number.POSITIVE_INFINITY : 860;
  }

  function maxNodeHeight(node) {
    return isFrameNode(node) ? Number.POSITIVE_INFINITY : 620;
  }

  // DOM-measuring size, for the few callers that want the actual rendered box
  // (resize start, auto-layout, center view). Not used on the per-render cull path.
  function nodeSize(node) {
    const element = dom.nodeLayer?.querySelector(`.node[data-node-id="${node.id}"]`);
    if (element && element.offsetWidth > 0 && element.offsetHeight > 0) {
      return { width: element.offsetWidth, height: element.offsetHeight };
    }
    return nodeLayoutSize(node);
  }

  function linkPath(from, to) {
    const { c1, c2 } = getLinkControlPoints(from, to);
    return `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`;
  }

  function midpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function screenToBoard(clientX, clientY) {
    const rect = dom.viewport.getBoundingClientRect();
    return {
      x: (clientX - rect.left + dom.viewport.scrollLeft - state.view.x) / state.view.scale,
      y: (clientY - rect.top + dom.viewport.scrollTop - state.view.y) / state.view.scale
    };
  }

  function displayBody(node) {
    const variableKey = getNodeVariableKey(node);
    if (variableKey) return `${variableKey} = ${node.value ?? ""}`;
    if (hasNodeCondition(node) && node.condition) return node.condition;
    return node.body || "";
  }

  function getNodeIcon(node) {
    const meta = getNodeMeta(node?.type);
    return normalizeNodeTypeBadge(meta.badge) || getDefaultNodeTypeBadge(meta.label || node?.type || "Node");
  }

  function getNodeIconSize(icon) {
    const length = getTextGraphemes(icon).length;
    if (length <= 1) return "single";
    return length === 2 ? "double" : "wide";
  }

  function getNodeIconFontSize(icon) {
    const length = getTextGraphemes(icon).length;
    if (length <= 1) return 12;
    return length === 2 ? 10 : 8;
  }

  function firstGrapheme(value) {
    return getTextGraphemes(value)[0] || "";
  }

  function uppercaseIconGrapheme(value) {
    return firstGrapheme(String(value || "").toLocaleUpperCase()) || String(value || "");
  }

  function normalizeCustomIconText(value) {
    const graphemes = getTextGraphemes(String(value || "").toLocaleUpperCase());
    const accepted = [];
    let units = 0;
    for (const grapheme of graphemes) {
      const nextUnits = iconGraphemeUnits(grapheme);
      if (accepted.length && units + nextUnits > NODE_TYPE_ICON_MAX_UNITS) break;
      accepted.push(grapheme);
      units += nextUnits;
      if (units >= NODE_TYPE_ICON_MAX_UNITS) break;
    }
    return accepted.join("");
  }

  function iconGraphemeUnits(grapheme) {
    if (!grapheme) return 0;
    if (/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(grapheme)) return 2;
    if ((grapheme.codePointAt(0) || 0) > 0xffff) return 2;
    if (/[\u2600-\u27bf]/.test(grapheme)) return 2;
    return 1;
  }

  function getTextGraphemes(value) {
    const text = String(value || "").trim().replace(/\s+/g, "");
    if (!text) return [];
    if (graphemeSegmenter) {
      return [...graphemeSegmenter.segment(text)].map((part) => part.segment).filter(Boolean);
    }
    return Array.from(text);
  }

  function nodeMatches(node, query) {
    const castTerms = getNodeCharacterLinks(node, { includeEventAggregate: isEventSheetNode(node) })
      .flatMap((link) => [link.character?.name, link.role]);
    return [node.type, node.title, node.body, node.condition, node.variable, node.value, ...(node.choices || []), ...Object.values(node.customFields || {}), ...castTerms]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  }

  function getCanvasRenderNodes() {
    const query = state.search.trim().toLowerCase();
    const visibleIds = getCanvasVisibleNodeIds(query);
    return getCanvasLayerItems()
      .filter((item) => visibleIds.has(item.node.id))
      .map((item) => item.node);
  }

  function getCanvasLayerItems() {
    return state.project.nodes
      .map((node, index) => ({ node, index, order: getNodeLayerOrder(node, index) }))
      .sort((a, b) => a.order - b.order || a.index - b.index);
  }

  function getNodeLayerOrder(node, index) {
    if (Number.isFinite(node.layerOrder)) return node.layerOrder;
    return (isFrameNode(node) ? EVENT_LAYER_BASE : REGULAR_LAYER_BASE) + index;
  }

  function isFrameNode(node) {
    return isFrameKind(getNodeMeta(node?.type).kind);
  }

  function isFrameKind(kind) {
    return kind === "frame" || kind === "eventFrame";
  }

  function isEventSheetNode(node) {
    return isEventFrameKind(getNodeMeta(node?.type).kind);
  }

  function isEventFrameKind(kind) {
    return kind === "eventFrame";
  }

  function getNodeDisplayId(node) {
    if (!node) return "";
    return getNodeDisplayIdMap().get(node.id) || node.id;
  }

  function getNodeDisplayIdMap() {
    const cached = state.derived.displayId;
    if (derivedStructureUnchanged(cached)) return cached.map;
    const flowOrderMap = getNodeFlowOrderMap();
    const indexedNodes = state.project.nodes.map((node, index) => ({ node, index }));
    const counters = { node: 0, frame: 0, eventFrame: 0 };
    const prefixes = { node: "n", frame: "f", eventFrame: "e" };
    const displayMap = new Map();

    indexedNodes
      .sort((a, b) => compareNodeIdentityOrder(a, b, flowOrderMap))
      .forEach(({ node }) => {
        const category = getNodeDisplayCategory(node);
        counters[category] += 1;
        displayMap.set(node.id, `${prefixes[category]}${counters[category]}`);
      });

    state.derived.displayId = derivedStructureStamp(displayMap);
    return displayMap;
  }

  function getNodeDisplayCategory(node) {
    if (isEventSheetNode(node)) return "eventFrame";
    if (isFrameNode(node)) return "frame";
    return "node";
  }

  function compareNodesByIdentity(a, b) {
    return compareNodeIdentityOrder({ node: a, index: state.project.nodes.indexOf(a) }, { node: b, index: state.project.nodes.indexOf(b) }, getNodeFlowOrderMap());
  }

  function compareNodeIdentityOrder(a, b, flowOrderMap = getNodeFlowOrderMap()) {
    const orderA = getNodeIdentityOrder(a.node, flowOrderMap);
    const orderB = getNodeIdentityOrder(b.node, flowOrderMap);
    if (orderA !== orderB) return orderA - orderB;
    if (a.node.y !== b.node.y) return a.node.y - b.node.y;
    if (a.node.x !== b.node.x) return a.node.x - b.node.x;
    const numberA = getNodeIdNumber(a.node?.id);
    const numberB = getNodeIdNumber(b.node?.id);
    if (numberA !== numberB) return numberA - numberB;
    return a.index - b.index;
  }

  function getNodeIdentityOrder(node, flowOrderMap) {
    if (!node) return Number.POSITIVE_INFINITY;
    const ownOrder = flowOrderMap.get(node.id) ?? Number.POSITIVE_INFINITY;
    if (!isFrameNode(node)) return ownOrder;
    const frameBounds = getNodeBounds(node);
    const childOrder = state.project.nodes
      .filter((candidate) => candidate.id !== node.id)
      .filter((candidate) => boundsContainBounds(frameBounds, getNodeBounds(candidate)))
      .reduce((best, candidate) => Math.min(best, flowOrderMap.get(candidate.id) ?? Number.POSITIVE_INFINITY), Number.POSITIVE_INFINITY);
    return Math.min(ownOrder, childOrder);
  }

  function getNodeFlowOrderMap() {
    const cached = state.derived.flowOrder;
    if (derivedStructureUnchanged(cached)) return cached.map;
    const orderMap = new Map();
    let order = 0;
    // Iterative pre-order DFS (explicit stack) instead of recursion: a deep graph
    // (e.g. a long chain in a large project) would overflow the call stack. Children
    // are pushed in reverse sorted order so they pop in sorted order, matching the
    // previous recursive pre-order traversal.
    const visit = (startNode) => {
      if (!startNode) return;
      const stack = [startNode];
      while (stack.length) {
        const node = stack.pop();
        if (!node || orderMap.has(node.id)) continue;
        orderMap.set(node.id, order);
        order += 1;
        const children = getOutgoing(node.id)
          .map((link) => getNode(link.to))
          .filter(Boolean)
          .sort(compareRawNodePosition);
        for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
      }
    };
    state.project.nodes
      .filter((node) => node.type === "Entry")
      .sort(compareRawNodePosition)
      .forEach(visit);
    state.project.nodes
      .slice()
      .sort(compareRawNodePosition)
      .forEach(visit);
    state.derived.flowOrder = derivedStructureStamp(orderMap);
    return orderMap;
  }

  function compareRawNodePosition(a, b) {
    return a.y - b.y || a.x - b.x || getNodeIdNumber(a.id) - getNodeIdNumber(b.id) || String(a.id).localeCompare(String(b.id));
  }

  function getNodeIdNumber(id) {
    const match = String(id || "").match(/\d+/);
    return match ? Number(match[0]) : Number.POSITIVE_INFINITY;
  }

  function nextId(prefix, items) {
    const used = new Set(items.map((item) => item.id));
    let index = 0;
    while (used.has(`${prefix}${index}`)) index += 1;
    return `${prefix}${index}`;
  }

  function updateStatus() {
    if (!dom.statusText) return;
    if (!state.statusOverride) {
      if (state.activeFileId === "characters") {
        dom.statusText.textContent = `${fileViews.characters} - ${getCharacters().length} characters, ${getTotalCharacterLinkCount()} character links`;
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
    if (!dom.statusText) return;
    state.statusOverride = true;
    dom.statusText.textContent = message;
    clearStatusTimer(false);
    state.statusTimer = window.setTimeout(() => {
      state.statusOverride = false;
      state.statusTimer = null;
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
  // END bundled app.js
}
