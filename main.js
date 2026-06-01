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

    this.app.workspace.onLayoutReady(() => {
      if (this.app.workspace.getLeavesOfType(VIEW_TYPE).length === 0) {
        this.activateView(true);
      }
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

  async buildCanvasDocument() {
    const pluginDir = this.manifest.dir || `.obsidian/plugins/${PLUGIN_ID}`;
    const [html, css, appJs] = await Promise.all([
      this.app.vault.adapter.read(`${pluginDir}/index.html`),
      this.app.vault.adapter.read(`${pluginDir}/canvas.css`),
      this.app.vault.adapter.read(`${pluginDir}/app.js`)
    ]);

    return html
      .replace(/<link rel="stylesheet" href="\.\/canvas\.css">\s*/i, `<style>\n${escapeStyle(css)}\n</style>`)
      .replace(/<script src="\.\/app\.js"><\/script>/i, `<script>\n${escapeScript(appJs)}\n</script>`);
  }
};

class NarrativeCanvasView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
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

    const frame = this.contentEl.createEl("iframe", {
      cls: "narrative-canvas-plugin-frame",
      attr: {
        title: "Narrative Canvas"
      }
    });

    try {
      frame.srcdoc = await this.plugin.buildCanvasDocument();
    } catch (error) {
      console.error(error);
      frame.remove();
      this.contentEl.createEl("div", {
        cls: "narrative-canvas-plugin-error",
        text: "Narrative Canvas failed to load plugin assets. Check the developer console for details."
      });
      new Notice("Narrative Canvas failed to load.");
    }
  }

  async onClose() {
    this.contentEl.removeClass("narrative-canvas-plugin-host");
    this.contentEl.replaceChildren();
  }
}

function escapeStyle(source) {
  return source.replace(/<\/style/gi, "<\\/style");
}

function escapeScript(source) {
  return source.replace(/<\/script/gi, "<\\/script");
}
