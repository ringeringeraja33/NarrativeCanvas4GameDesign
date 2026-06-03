const { ItemView, Notice, Plugin, PluginSettingTab, Setting } = require("obsidian");

const VIEW_TYPE = "narrative-canvas-view";
const PLUGIN_ID = "narrative-canvas";
const PROJECT_EXTENSIONS = ["ncanvas", "narrativecanvas"];
const LEGACY_JSON_EXTENSION = "json";
const DEFAULT_PROJECT_EXTENSION = "ncanvas";
const DEFAULT_SETTINGS = {
  saveFolder: "",
  currentProjectPath: "",
  lastProjectPath: ""
};
const LEGACY_PROJECT_FILE = "NarrativeCanvas/project.json";
const STATE_FILE = "data.json";

module.exports = class NarrativeCanvasPlugin extends Plugin {
  async onload() {
    await this.loadPluginData();
    this.registerView(VIEW_TYPE, (leaf) => new NarrativeCanvasView(leaf, this));
    this.registerExtensions(PROJECT_EXTENSIONS, VIEW_TYPE);
    this.addSettingTab(new NarrativeCanvasSettingTab(this.app, this));

    this.addRibbonIcon("network", "Open Narrative Canvas", () => {
      this.openCanvas();
    });

    this.addCommand({
      id: "open-narrative-canvas",
      name: "Open Narrative Canvas",
      callback: () => this.openCanvas()
    });

    this.addCommand({
      id: "save-narrative-canvas-to-vault",
      name: "Save project file to vault",
      callback: () => this.saveActiveCanvas()
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
    await this.prepareProjectForOpen();
    await this.activateView(true);
    await window.NarrativeCanvasApp?.ensureVaultFile?.();
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }

  async activateView(focus) {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];

    if (!leaf) {
      leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({
        type: VIEW_TYPE,
        active: focus
      });
    }

    if (focus) {
      this.app.workspace.revealLeaf(leaf);
    }
  }

  async loadCanvasAssets() {
    const pluginDir = this.manifest.dir || `.obsidian/plugins/${PLUGIN_ID}`;
    const [html, css, appJs] = await Promise.all([
      this.app.vault.adapter.read(`${pluginDir}/index.html`),
      this.app.vault.adapter.read(`${pluginDir}/canvas.css`),
      this.app.vault.adapter.read(`${pluginDir}/app.js`)
    ]);

    return {
      bodyHtml: extractBodyHtml(html),
      css: scopeCanvasCss(css),
      appJs
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

  getCurrentProjectPath() {
    return this.settings?.currentProjectPath || this.settings?.lastProjectPath || "";
  }

  async setCurrentProjectPath(path) {
    const normalized = normalizeVaultPath(path);
    this.settings.currentProjectPath = normalized;
    this.settings.lastProjectPath = normalized;
    await this.savePluginData();
    this.refreshViewTitles();
  }

  refreshViewTitles() {
    this.app.workspace?.getLeavesOfType(VIEW_TYPE)?.forEach((leaf) => {
      leaf.updateHeader?.();
    });
  }

  async prepareProjectForOpen() {
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
    return preferred;
  }

  async resolveProjectPathForOpen() {
    const adapter = this.app.vault.adapter;
    const current = normalizeVaultPath(this.settings.currentProjectPath);
    if (current && await adapter.exists(current)) return current;

    const last = normalizeVaultPath(this.settings.lastProjectPath);
    if (last && await adapter.exists(last)) return last;

    const fallback = await this.findLatestNarrativeCanvasProjectFile();
    if (fallback) return fallback;

    if (await adapter.exists(LEGACY_PROJECT_FILE)) return LEGACY_PROJECT_FILE;
    return "";
  }

  async loadProjectFile() {
    const adapter = this.app.vault.adapter;
    const path = await this.prepareProjectForOpen();
    if (path && await adapter.exists(path)) return adapter.read(path);
    if (await adapter.exists(LEGACY_PROJECT_FILE)) return adapter.read(LEGACY_PROJECT_FILE);
    return null;
  }

  async saveProjectFile(savedStateJson) {
    const path = await this.ensureWritableProjectPath(savedStateJson, { forceNew: false });
    await this.app.vault.adapter.write(path, savedStateJson);
    await this.setCurrentProjectPath(path);
    return path;
  }

  async ensureProjectFile(savedStateJson) {
    const adapter = this.app.vault.adapter;
    const existing = await this.resolveProjectPathForOpen();
    if (existing && await adapter.exists(existing)) {
      await this.setCurrentProjectPath(existing);
      return "";
    }
    const path = await this.ensureWritableProjectPath(savedStateJson, { forceNew: true });
    await adapter.write(path, savedStateJson);
    await this.setCurrentProjectPath(path);
    return path;
  }

  async createProjectFile(savedStateJson) {
    const path = await this.ensureWritableProjectPath(savedStateJson, { forceNew: true });
    await this.app.vault.adapter.write(path, savedStateJson);
    await this.setCurrentProjectPath(path);
    return path;
  }

  async ensureWritableProjectPath(savedStateJson, options = {}) {
    const adapter = this.app.vault.adapter;
    const folder = normalizeSaveFolder(this.settings.saveFolder);
    await this.ensureFolder(folder);
    const desiredPath = joinVaultPath(folder, this.renderProjectFilename(savedStateJson));
    const current = normalizeVaultPath(this.settings.currentProjectPath);
    if (!options.forceNew && current) {
      if (current === desiredPath) {
        await this.ensureSaveFolderForPath(current);
        return current;
      }
      const targetPath = await this.uniqueProjectPath(desiredPath, current);
      if (await adapter.exists(current)) {
        if (typeof adapter.rename === "function") {
          await adapter.rename(current, targetPath);
        } else {
          const existing = await adapter.read(current);
          await adapter.write(targetPath, existing);
          if (typeof adapter.remove === "function") await adapter.remove(current);
        }
      }
      return targetPath;
    }

    return this.uniqueProjectPath(desiredPath);
  }

  renderProjectFilename(savedStateJson) {
    const projectName = getProjectNameFromSavedState(savedStateJson);
    return ensureProjectExtension(sanitizeFileName(projectName || "Sample"));
  }

  async uniqueProjectPath(path, ignorePath = "") {
    const adapter = this.app.vault.adapter;
    const ignored = normalizeVaultPath(ignorePath);
    if (ignored && normalizeVaultPath(path) === ignored) return path;
    if (!(await adapter.exists(path))) return path;
    const extension = getVaultPathExtension(path);
    const suffix = extension ? `.${extension}` : "";
    const base = suffix ? path.slice(0, -suffix.length) : path;
    let index = 2;
    let candidate = `${base}-${index}${suffix}`;
    while (await adapter.exists(candidate) && normalizeVaultPath(candidate) !== ignored) {
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
    const adapter = this.app.vault.adapter;
    const parts = normalized.split("/").filter(Boolean);
    let cursor = "";
    for (const part of parts) {
      cursor = cursor ? `${cursor}/${part}` : part;
      if (!(await adapter.exists(cursor))) await adapter.mkdir(cursor);
    }
  }

  async findLatestNarrativeCanvasProjectFile() {
    const folder = normalizeSaveFolder(this.settings.saveFolder);
    const prefix = folder ? `${folder}/` : "";
    const files = this.app.vault.getFiles()
      .filter((file) => isProjectFileExtension(file.extension))
      .filter((file) => {
        if (folder) {
          if (!file.path.startsWith(prefix)) return false;
          return !file.path.slice(prefix.length).includes("/");
        }
        return !file.path.includes("/");
      })
      .sort((a, b) => (b.stat?.mtime || 0) - (a.stat?.mtime || 0));

    for (const file of files) {
      if (await this.isNarrativeCanvasProjectFile(file.path)) return file.path;
    }
    return "";
  }

  async isNarrativeCanvasProjectFile(path) {
    try {
      const text = await this.app.vault.adapter.read(path);
      return isSavedStatePayload(JSON.parse(text));
    } catch (error) {
      return false;
    }
  }

  async handleVaultFileOpen(file) {
    if (!file || !isProjectFileExtension(file.extension)) return;
    if (!(await this.isNarrativeCanvasProjectFile(file.path))) return;
    await this.openProjectFile(file.path);
  }

  async openProjectFile(path) {
    await this.setCurrentProjectPath(path);
    await this.activateView(true);
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
    return "network";
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
    await this.plugin.setCurrentProjectPath(file);
    if (window.NarrativeCanvasApp?.loadVaultProject) {
      await window.NarrativeCanvasApp.loadVaultProject();
    }
  }

  async onOpen() {
    this.contentEl.replaceChildren();
    this.contentEl.addClass("narrative-canvas-plugin-host");

    try {
      const { bodyHtml, css, appJs } = await this.plugin.loadCanvasAssets();
      this.styleEl = document.createElement("style");
      this.styleEl.textContent = css;
      document.head.appendChild(this.styleEl);

      this.contentEl.innerHTML = bodyHtml;
      window.NarrativeCanvasHost = {
        pluginId: PLUGIN_ID,
        root: this.contentEl,
        loadState: () => this.plugin.loadSavedState(),
        saveState: (savedState) => this.plugin.saveSavedState(savedState),
        loadProject: () => this.plugin.loadProjectFile(),
        saveProject: (savedStateJson) => this.plugin.saveProjectFile(savedStateJson),
        ensureProjectFile: (savedStateJson) => this.plugin.ensureProjectFile(savedStateJson),
        createProjectFile: (savedStateJson) => this.plugin.createProjectFile(savedStateJson),
        getProjectFile: () => this.plugin.getCurrentProjectPath(),
        stateFile: STATE_FILE,
        legacyProjectFile: LEGACY_PROJECT_FILE
      };
      window.NarrativeCanvasApp?.destroy?.();
      runCanvasApp(appJs);
      window.NarrativeCanvasApp?.init?.();
    } catch (error) {
      console.error(error);
      this.contentEl.replaceChildren();
      this.contentEl.createEl("div", {
        cls: "narrative-canvas-plugin-error",
        text: "Narrative Canvas failed to load plugin assets. Check the developer console for details."
      });
      new Notice("Narrative Canvas failed to load.");
    }
  }

  async onClose() {
    window.NarrativeCanvasApp?.destroy?.();
    if (window.NarrativeCanvasHost?.pluginId === PLUGIN_ID) {
      delete window.NarrativeCanvasHost;
    }
    this.styleEl?.remove();
    this.styleEl = null;
    this.contentEl.removeClass("narrative-canvas-plugin-host");
    this.contentEl.replaceChildren();
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
    containerEl.createEl("h2", { text: "Narrative Canvas" });

    new Setting(containerEl)
      .setName("Project save folder")
      .setDesc("Vault-relative folder for Narrative Canvas project files. Leave empty to save in the vault root.")
      .addText((text) => {
        text
          .setPlaceholder("Root")
          .setValue(this.plugin.settings.saveFolder || "")
          .onChange(async (value) => {
            this.plugin.settings.saveFolder = normalizeSaveFolder(value);
            await this.plugin.savePluginData();
          });
      });

    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "Project files are named after the project title, for example Sample.ncanvas. Rename the project title and save to rename the vault file."
    });

    new Setting(containerEl)
      .setName("Current project")
      .setDesc(this.plugin.getCurrentProjectPath() || "No project file selected yet.")
      .addButton((button) => {
        button
          .setButtonText("Clear")
          .onClick(async () => {
            this.plugin.settings.currentProjectPath = "";
            this.plugin.settings.lastProjectPath = "";
            await this.plugin.savePluginData();
            this.display();
          });
      });
  }
}

function normalizeSettings(rawSettings) {
  const source = rawSettings && typeof rawSettings === "object" && !Array.isArray(rawSettings) ? rawSettings : {};
  return {
    saveFolder: normalizeSaveFolder(source.saveFolder),
    currentProjectPath: normalizeVaultPath(source.currentProjectPath),
    lastProjectPath: normalizeVaultPath(source.lastProjectPath)
  };
}

function normalizeSaveFolder(value) {
  return normalizeVaultPath(value).replace(/\/+$/, "");
}

function normalizeVaultPath(value) {
  return String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}

function joinVaultPath(folder, fileName) {
  const normalizedFolder = normalizeSaveFolder(folder);
  return normalizedFolder ? `${normalizedFolder}/${fileName}` : fileName;
}

function getProjectNameFromSavedState(savedStateJson) {
  try {
    const payload = JSON.parse(savedStateJson || "{}");
    const project = payload.project || payload;
    return sanitizeProjectName(project.title || "Sample");
  } catch (error) {
    return "Sample";
  }
}

function sanitizeProjectName(value) {
  return sanitizeFileName(String(value || "Sample")).replace(/\.(json|ncanvas|narrativecanvas)$/i, "") || "Sample";
}

function sanitizeFileName(value) {
  return String(value || "")
    .replace(/[\\/\n\r\t]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function ensureProjectExtension(value) {
  const fileName = value || `NarrativeCanvas.${DEFAULT_PROJECT_EXTENSION}`;
  const extension = getVaultPathExtension(fileName);
  return extension ? fileName : `${fileName}.${DEFAULT_PROJECT_EXTENSION}`;
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

function runCanvasApp(source) {
  const execute = new Function(source);
  execute();
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scopeCanvasCss(source) {
  let css = source
    .replace(/:root/g, ".narrative-canvas-plugin-host")
    .replace(/(^|})\s*html\s*,\s*body\s*{/g, "$1\n.narrative-canvas-plugin-host {")
    .replace(/(^|})\s*body\s*{/g, "$1\n.narrative-canvas-plugin-host {");

  css = css.replace(/(^|[{}])\s*([^@{}][^{]+)\s*{/g, (match, boundary, selectorText) => {
    const selectors = selectorText
      .split(",")
      .map((selector) => selector.trim())
      .filter(Boolean)
      .map((selector) => {
        if (selector.startsWith(".narrative-canvas-plugin-host")) return selector;
        return `.narrative-canvas-plugin-host ${selector}`;
      });

    return `${boundary}\n${selectors.join(", ")} {`;
  });

  return css;
}
