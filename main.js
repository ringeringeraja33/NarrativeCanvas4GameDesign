const { ItemView, Notice, Plugin } = require("obsidian");

const VIEW_TYPE = "narrative-canvas-view";
const PLUGIN_ID = "narrative-canvas";

module.exports = class NarrativeCanvasPlugin extends Plugin {
  async onload() {
    this.registerView(VIEW_TYPE, (leaf) => new NarrativeCanvasView(leaf, this));

    this.addRibbonIcon("network", "Open Narrative Canvas", () => {
      this.activateView(true);
    });

    this.addCommand({
      id: "open-narrative-canvas",
      name: "Open Narrative Canvas",
      callback: () => this.activateView(true)
    });
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
    return "Narrative Canvas";
  }

  getIcon() {
    return "network";
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
    this.styleEl?.remove();
    this.styleEl = null;
    this.contentEl.removeClass("narrative-canvas-plugin-host");
    this.contentEl.replaceChildren();
  }
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
