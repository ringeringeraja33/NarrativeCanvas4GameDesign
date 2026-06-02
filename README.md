# Narrative Canvas

## English

Narrative Canvas is a node-based workspace for designing complex narratives. It helps designers break a story into scenes, dialogue, choices, conditions, variable changes, jumps, characters, and notes, then connect them into a playable flow. It can fit games, interactive fiction, branching scripts, quests, and other nonlinear story structures.

It works in two modes:

- **Web app**: open `index.html` directly, or visit <https://ringeringeraja33.github.io/NarrativeCanvas/>.
- **Obsidian plugin**: copy the repository folder to `.obsidian/plugins/narrative-canvas/` in an Obsidian vault, then enable `Narrative Canvas` in Community plugins.

### Features

- Node-based narrative flow editing
- Entry, Content, Dialog, Choice, Condition, Set, Jump, Marker, and Event Frame nodes
- Links, dragging, zoom, center view, and minimap
- Runtime preview from the Entry node
- Character pages for tracking roles, voices, notes, and linked dialogue nodes
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
5. Open it from the command palette command `Open Narrative Canvas`.

### First Open, Save, and Export

When Narrative Canvas opens for the first time, it shows the built-in template project `The Adventure`. Treat it as sample content, not as your saved story.

The highlighted **Save** button stores the current editing state so the next session can continue where you left off:

- In the web app, Save writes to browser `localStorage` for the current browser and URL.
- In the Obsidian plugin, Save writes plugin data such as `.obsidian/plugins/narrative-canvas/data.json`.

Save is convenient for continuing a local editing session, but it is not a safe archive. The saved state can disappear if browser storage is cleared, if the plugin folder or plugin data is deleted, if another imported project is saved over it, or if you move to another browser, vault, or device.

For backups, handoff, version history, or publishing, use **Export JSON** or **Export all** instead of relying on Save. **Export JSON** gives you the full project file for re-import. **Export all** creates a zip package with the supported outputs: project JSON, event CSV, character Markdown, variables JSON, image, and HTML.

### Workspace Guide

- **Save** stores the current local editing state. Use it as a session resume tool.
- **New** creates a fresh project and discards the current in-memory project after confirmation.
- **Light/Dark** switches the UI theme.
- **The Adventure.canvas** is the main node canvas.
- **Characters.md** manages character records and shows matching Dialog nodes.
- **Variables.json** edits project variables used by Set, Condition, and `{variable}` interpolation.
- **Events Sheet.csv** lists Event Frame rows and can export the event sheet as CSV.
- **Zoom, Center, and minimap** help navigate large canvases.
- **Play** opens the runtime preview from the Entry node.
- **Import JSON** replaces the current project with an exported project JSON.

### Canvas Operations

- Click a node to focus it in the Node inspector.
- Drag a node header to move a node.
- Drag from an output port to another node's input port to connect nodes.
- Edit node fields in the Node inspector on the right.
- Use **Duplicate**, **Delete**, and **Focus** in the Node inspector for the selected node.
- Click a node badge/icon to customize that node's displayed icon.
- Right-click a node to change layer order with **Bring to front**, **Bring forward**, **Send backward**, or **Send to back**.
- Use the search field in the footer to find matching nodes on the current project.

### Node Library

The Node Library is fully customizable. You can add new node types with a name, badge, and color, and you can remove existing node types from the library. Removing a node type hides it from the add menu; existing nodes of that type remain in the project and can still be edited.

Built-in node types:

- **Entry**: the starting point for runtime preview. A project should normally have one clear Entry node.
- **Content**: narration, scene text, lore, or any non-dialogue story content. Text can use variables such as `{hero_name}`.
- **Dialog**: a line spoken by a character. The node title is treated as the speaker name, and matching speakers appear in `Characters.md`.
- **Choice**: a player-facing branch point. Enter one choice per line in the Node inspector; outgoing links are used as the selectable paths in order.
- **Condition**: a simple branch gate. Conditions support expressions such as `flag == true` or `hero_name != Stranger`; the first outgoing link is used when true, the second when false.
- **Set**: updates a project variable during Play. Values such as `true`, `false`, and numbers are converted automatically; other values are kept as text.
- **Jump**: marks a destination or scene transition. Use it for route labels, chapter jumps, or handoff points.
- **Marker**: a planning note for WIP sections, reminders, or production comments.
- **Event Frame**: a resizable grouping frame that also creates one row in `Events Sheet.csv`.

### Event Frame Guide

Event Frames are for grouping related beats and producing event-sheet rows.

- Add one from the Node Library, or from the **Add event frame** button on `Events Sheet.csv`.
- Drag it like a node, then resize it from the lower-right handle. Event Frames can be expanded as large as needed.
- Event Frames sit behind normal nodes by default. Among Event Frames, newer frames appear above older frames.
- If you need a frame above another object, right-click it and use the layer commands.
- Any non-Event node whose center is inside an Event Frame is listed automatically in the frame's **Elements in Event** field and in `Events Sheet.csv`.
- Event Frames have extra fields in the Node inspector: ACT, chapter, character encountered, event description, levels, quest episode, beat list, time/weather, and event type.
- `Events Sheet.csv` rows are sorted by frame position, top to bottom and then left to right.

### Runtime Preview

Runtime preview starts from the Entry node and follows links.

- Content, Dialog, Jump, and Marker nodes display their text as preview pages.
- Choice nodes display outgoing links as buttons.
- Set nodes update variables as the preview runs.
- Condition nodes choose between the first or second outgoing link.
- Event Frames are skipped in preview because they are planning/grouping containers.

## 中文

Narrative Canvas 是一个用于复杂叙事设计的节点式工作区。它可以把剧情段落、角色对白、选择分支、条件判断、变量变化、跳转、角色和笔记整理成可连接、可预览的互动流程。它适用于游戏、互动小说、分支剧本、任务链和其他非线性叙事结构。

它支持两种使用方式：

- **网页端**：直接打开 `index.html`，或访问 <https://ringeringeraja33.github.io/NarrativeCanvas/>。
- **Obsidian 插件端**：把仓库文件夹复制到 Obsidian vault 的 `.obsidian/plugins/narrative-canvas/`，再在 Community plugins 中启用 `Narrative Canvas`。

### 主要功能

- 节点式叙事流程编辑
- Entry、Content、Dialog、Choice、Condition、Set、Jump、Marker、Frame 等节点类型
- 连线、拖拽、缩放、居中和小地图
- 从 Entry 节点开始运行预览
- 角色页，可维护角色定位、语气、笔记和关联对白节点
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
5. 通过命令面板命令 `Open Narrative Canvas` 打开。

### 详细操作指引

#### 首次打开、保存和导出

首次打开 Narrative Canvas 时，中间画布显示的是内置模板项目 `The Adventure`。它只是示例内容，请先确认你要继续改这个模板，还是用 **New** 新建自己的项目。

左上角高亮的 **Save** 会保存当前编辑状态，让下次打开时继续编辑：

- 网页端会保存到当前浏览器和当前 URL 对应的 `localStorage`。
- Obsidian 插件端会保存到插件数据，例如 `.obsidian/plugins/narrative-canvas/data.json`。

请把 Save 当作本地续写功能，不要把它当作正式备份。清理浏览器缓存、删除插件文件夹或插件数据、换浏览器、换 vault、换设备，或者导入别的项目后再次保存，都可能让原来的保存状态不可用或被覆盖。

建议日常备份、交接、版本留存时优先用 **Export JSON** 或 **Export all**。**Export JSON** 可以导出完整项目 JSON，之后用 **Import JSON** 重新导入。**Export all** 会把当前项目支持的格式打成一个 zip，包括项目 JSON、事件 CSV、角色 Markdown、变量 JSON、图片和 HTML。

#### 工作区

- **Save**：保存当前本地编辑状态。
- **New**：新建空项目，确认后会丢弃当前内存中的项目。
- **Light/Dark**：切换界面主题。
- **The Adventure.canvas**：主画布。
- **Characters.md**：维护角色资料，并显示同名 Dialog 节点。
- **Variables.json**：编辑项目变量，供 Set、Condition 和 `{变量名}` 文本替换使用。
- **Events Sheet.csv**：列出所有 Event Frame 对应的事件行，并支持导出 CSV。
- **Zoom / Center / minimap**：缩放、居中和快速定位画布。
- **Play**：从 Entry 节点开始运行预览。
- **Import JSON**：导入项目 JSON，并替换当前项目。

#### 画布操作

- 单击节点即可选中，并在右侧 Node inspector 中聚焦。
- 拖动节点标题栏可以移动节点。
- 从节点输出端口拖到另一个节点输入端口可以建立连线。
- 在右侧 Node inspector 中编辑节点字段。
- Node inspector 里的 **Duplicate**、**Delete**、**Focus** 可以复制、删除、定位当前节点。
- 点击节点左上角 badge/icon 可以自定义该节点显示的图标。
- 右键节点可以调整层级：Bring to front、Bring forward、Send backward、Send to back。
- 底部搜索框可以查找当前项目中的节点。

#### Node Library

Node Library 可以完全自定义。你可以新增节点类型，设置名称、badge 和颜色；也可以删除已有节点类型。删除节点类型后，它会从新增菜单中移除，项目中已经存在的同类型节点仍然保留，也能继续编辑。

已有节点类型功能如下：

- **Entry**：运行预览的起点。通常一个项目应有一个明确的 Entry。
- **Content**：叙述、场景文本、设定说明或非对白内容。文本中可以使用 `{hero_name}` 这类变量占位。
- **Dialog**：角色对白。节点标题会被视为说话人名称，同名说话人会显示在 `Characters.md` 中。
- **Choice**：玩家选择分支。在 Node inspector 中一行写一个选项；运行预览时，出线会按顺序变成可点击选项。
- **Condition**：简单条件分支。支持 `flag == true`、`hero_name != Stranger` 这类表达式；条件为真走第一条出线，为假走第二条出线。
- **Set**：运行预览时设置项目变量。`true`、`false` 和数字会自动转换，其他内容按文本保存。
- **Jump**：场景跳转或目标标记。适合用作章节入口、路线标签、跳转说明。
- **Marker**：策划备注。适合记录 WIP、提醒、制作说明。
- **Event Frame**：可拉伸的分组框，同时会在 `Events Sheet.csv` 中生成一行事件记录。

#### Event Frame 用法

Event Frame 用来圈定一组相关叙事节点，并生成事件表行。

- 可以从 Node Library 添加，也可以在 `Events Sheet.csv` 页面点击 **Add event frame**。
- 像普通节点一样拖动它，右下角可以拉伸大小；Event Frame 可以按需要拉得很大。
- Event Frame 默认在普通节点下方显示；Event Frame 之间，新建的会显示在旧的上方。
- 如果需要把 Event Frame 临时显示到上层，可以右键使用层级菜单。
- 任何非 Event 节点，只要中心点落在 Event Frame 内，就会自动出现在该 frame 的 **Elements in Event** 字段和 `Events Sheet.csv` 中。
- Event Frame 在 Node inspector 中有事件表字段：ACT、章节、遇到的角色、事件描述、关卡、任务段、Beat 列表、时间/天气、事件类型。
- `Events Sheet.csv` 会按 Event Frame 在画布上的位置排序：先从上到下，再从左到右。

#### Runtime Preview

运行预览从 Entry 节点开始，并沿连线前进。

- Content、Dialog、Jump、Marker 会作为预览页面显示文本。
- Choice 会把出线显示成可点击选项。
- Set 会在预览过程中修改变量。
- Condition 会根据条件选择第一条或第二条出线。
- Event Frame 是策划分组容器，不会作为预览页面显示。
