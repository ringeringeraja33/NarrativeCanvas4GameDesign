# Narrative Canvas for Game Design

## English

Narrative Canvas for Game Design is a node-based canvas for planning game narratives. It helps designers break a story into scenes, dialogue, choices, conditions, variable changes, and jumps, then connect them into a playable flow.

It works in two modes:

- **Web app**: open `index.html` directly, or visit <https://ringeringeraja33.github.io/NarrativeCanvas4GameDesign/>.
- **Obsidian plugin**: copy the repository folder to `.obsidian/plugins/narrative-canvas/` in an Obsidian vault, then enable `Narrative Canvas` in Community plugins.

### Features

- Node-based narrative flow editing
- Entry, Content, Dialog, Choice, Condition, Set, Jump, Marker, and Frame nodes
- Links, dragging, zoom, center view, and minimap
- Runtime preview from the Entry node
- Project variables edited as JSON
- Browser local save plus JSON import and export

### Obsidian Install

1. Download or clone this repository.
2. Put the whole folder here:

   ```text
   .obsidian/plugins/narrative-canvas/
   ```

3. Restart Obsidian, or reload Community plugins.
4. Enable `Narrative Canvas` in `Settings -> Community plugins`.
5. Open it from the ribbon icon or the command palette command `Open Narrative Canvas`.

### Files

- `manifest.json`: Obsidian plugin metadata
- `main.js`: Obsidian plugin entry point that loads the canvas in an iframe
- `styles.css`: Obsidian host view styles
- `index.html`: shared UI for web and plugin modes
- `app.js`: canvas interaction logic
- `canvas.css`: canvas UI styles

## 中文

Narrative Canvas for Game Design 是一个面向游戏叙事设计的节点式画布。它可以把剧情段落、角色对白、选择分支、条件判断、变量变化和跳转整理成可连接、可预览的互动流程。

它支持两种使用方式：

- **网页端**：直接打开 `index.html`，或访问 <https://ringeringeraja33.github.io/NarrativeCanvas4GameDesign/>。
- **Obsidian 插件端**：把仓库文件夹复制到 Obsidian vault 的 `.obsidian/plugins/narrative-canvas/`，再在 Community plugins 中启用 `Narrative Canvas`。

### 主要功能

- 节点式叙事流程编辑
- Entry、Content、Dialog、Choice、Condition、Set、Jump、Marker、Frame 等节点类型
- 连线、拖拽、缩放、居中和小地图
- 从 Entry 节点开始运行预览
- 用 JSON 编辑项目变量
- 浏览器本地保存、JSON 导入导出

### Obsidian 安装

1. 下载或克隆本仓库。
2. 将整个文件夹放到：

   ```text
   .obsidian/plugins/narrative-canvas/
   ```

3. 重启 Obsidian，或重新加载 Community plugins。
4. 在 `Settings -> Community plugins` 中启用 `Narrative Canvas`。
5. 通过左侧 ribbon 图标或命令面板命令 `Open Narrative Canvas` 打开。

### 文件说明

- `manifest.json`：Obsidian 插件信息
- `main.js`：Obsidian 插件入口，将画布加载到 iframe
- `styles.css`：Obsidian 插件宿主样式
- `index.html`：网页端和插件端共用的界面
- `app.js`：画布交互逻辑
- `canvas.css`：画布界面样式
