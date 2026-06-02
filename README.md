# Narrative Canvas

## Screenshots

![Narrative Canvas main canvas](assets/screenshots/main-canvas.png)

## English

Narrative Canvas is a node-based planning canvas for branching stories, quests, dialogue, variables, and event sheets. It can run as a browser app or as a desktop-only Obsidian plugin.

### Use It

- Browser app: open `index.html`, or use <https://ringeringeraja33.github.io/NarrativeCanvas/>.
- Obsidian plugin: install the release files into `.obsidian/plugins/narrative-canvas/`, enable `Narrative Canvas`, then run `Open Narrative Canvas` from the command palette.

The Obsidian plugin is desktop-only because `manifest.json` sets `isDesktopOnly: true`.

### Install From Release

1. Download the latest release package from GitHub Releases.
2. Extract the package to:

   ```text
   .obsidian/plugins/narrative-canvas/
   ```

3. Confirm the folder contains:

   ```text
   app.js
   canvas.css
   index.html
   main.js
   manifest.json
   styles.css
   ```

4. Restart Obsidian or reload Community plugins.
5. Enable `Narrative Canvas`.

### Manual Install

Clone or download this repository, then copy the complete repository folder to `.obsidian/plugins/narrative-canvas/`.

### Core Workflow

1. Add nodes from **Node Library**.
2. Drag from an output port to another node's input port to connect flow.
3. Edit the selected node in the right inspector.
4. Use **Play** to preview from the Entry node.
5. Use **Export JSON** or **Export all** for backup and handoff.

### Save And Backup

The first project is the built-in sample, `The Adventure`.

**Save** is local session recovery, not a portable backup:

- Browser app: saves to browser `localStorage`.
- Obsidian plugin: saves plugin data inside the current vault.

Use **Export JSON** for project backup and transfer. Use **Export all** for JSON, event CSV, character Markdown, variables JSON, image, and HTML outputs.

### Features

- Node canvas with drag, resize, links, zoom, minimap, search, and light/dark themes.
- Entry, Content, Dialog, Choice, Condition, Set, Jump, Marker, Frame, and Event Frame node types.
- Runtime preview with choices, variable writes, simple conditions, and `{variable}` interpolation.
- Character sheet with Markdown export.
- Variable editor with JSON export.
- Event Sheet view with CSV export.
- Project-customizable node types with editable icons, colors, behavior, hidden state, and custom properties.

### Frames

- **Frame** is a transparent gray visual grouping box. It does not appear in the Event Sheet.
- **Event Frame** is a purple event grouping box. It creates one row in `Events Sheet.csv`.

Hidden node types can be restored from the **Hidden** area at the top of Node Library.

### Limits

- Obsidian mobile is not supported.
- Save is not a cross-device backup.
- Conditions currently support simple `==` and `!=` expressions.
- The plugin is not listed in Obsidian Community Plugins yet.

---

## 中文

Narrative Canvas 是一个节点式叙事规划画布，用于设计分支故事、任务、对白、变量和事件表。它可以作为网页应用使用，也可以作为桌面端 Obsidian 插件使用。

### 使用方式

- 网页端：打开 `index.html`，或访问 <https://ringeringeraja33.github.io/NarrativeCanvas/>。
- Obsidian 插件端：把 release 文件安装到 `.obsidian/plugins/narrative-canvas/`，启用 `Narrative Canvas`，再从命令面板运行 `Open Narrative Canvas`。

由于 `manifest.json` 设置了 `isDesktopOnly: true`，Obsidian 插件只支持桌面端。

### 从 Release 安装

1. 从 GitHub Releases 下载最新 release 包。
2. 解压到：

   ```text
   .obsidian/plugins/narrative-canvas/
   ```

3. 确认文件夹内包含：

   ```text
   app.js
   canvas.css
   index.html
   main.js
   manifest.json
   styles.css
   ```

4. 重启 Obsidian，或重新加载 Community plugins。
5. 启用 `Narrative Canvas`。

### 手动安装

克隆或下载本仓库，然后把完整仓库文件夹复制到 `.obsidian/plugins/narrative-canvas/`。

### 基本流程

1. 从 **Node Library** 添加节点。
2. 从输出端口拖到另一个节点的输入端口，建立流程连线。
3. 在右侧 inspector 编辑选中的节点。
4. 用 **Play** 从 Entry 节点开始预览。
5. 用 **Export JSON** 或 **Export all** 做备份和交接。

### 保存和备份

首次打开看到的是内置示例项目 `The Adventure`。

**Save** 只用于本地续写，不是可迁移备份：

- 网页端：保存到浏览器 `localStorage`。
- Obsidian 插件端：保存到当前 vault 的插件数据。

项目备份和迁移请用 **Export JSON**。需要交付多种格式时用 **Export all**，它会导出 JSON、事件 CSV、角色 Markdown、变量 JSON、图片和 HTML。

### 功能

- 节点画布：拖拽、缩放、连线、小地图、搜索、深浅色主题。
- Entry、Content、Dialog、Choice、Condition、Set、Jump、Marker、Frame、Event Frame 节点类型。
- 运行预览：支持选择、变量写入、简单条件和 `{变量}` 文本替换。
- 角色表和 Markdown 导出。
- 变量编辑和 JSON 导出。
- 事件表和 CSV 导出。
- 可按项目自定义节点类型：图标、颜色、行为、隐藏状态和自定义属性。

### Frame

- **Frame** 是透明灰色视觉分组框，不进入事件表。
- **Event Frame** 是紫色事件分组框，会在 `Events Sheet.csv` 中生成一行。

隐藏后的节点类型可以在 Node Library 顶部的 **Hidden** 区恢复。

### 限制

- 不支持 Obsidian 移动端。
- Save 不是跨设备备份。
- Condition 目前支持简单 `==` 和 `!=` 表达式。
- 目前还没有上架 Obsidian 官方 Community Plugins。
