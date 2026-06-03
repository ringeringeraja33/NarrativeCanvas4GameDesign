# Narrative Canvas
## English

Narrative Canvas is a visual planning workspace for complex stories. It helps you break a narrative into scenes, choices, conditions, variables, event frames, and character references, then connect them into a playable flow.

It is best used for organizing ideas, checking branching logic, preparing pitches, and demonstrating how a story or questline works. It is not meant to replace prose drafting tools. Write the actual manuscript, script, or dialogue polish in your usual editor; use Narrative Canvas to keep the structure understandable.

![Narrative Canvas main canvas](assets/screenshots/main-canvas.png)

### Safety Notes

- `Playbook.json` is declarative. It can format Play output, define choice buttons, read simple conditions, and write variables. It does not run arbitrary JavaScript.
- Hide keeps Events Sheet data. Delete removes a column from the schema and clears matching values from Event Frame nodes.
- Deleted nodes are archived outside the runtime path so accidental deletion is less destructive, but you should still save versions of important work.
- Browser Save writes to browser local storage. Obsidian Save writes the current `.ncanvas` project file in your vault.

### Web App

Open `index.html` directly or use:

<https://ringeringeraja33.github.io/NarrativeCanvas/>

The web app is useful for quick planning and demos. Use `Export JSON`, `Image`, `HTML`, `Characters.md`, `Events Sheet.csv`, or `Playbook.json` when you need portable files.

### Obsidian Plugin

For manual installation, copy the plugin files into:

```text
.obsidian/plugins/narrative-canvas/
```

Then reload Obsidian and enable `Narrative Canvas` in Community plugins.

The plugin stores projects as `.ncanvas` files. By default the file name follows the project title, such as:

```text
Sample.ncanvas
```

If you rename the project title and click Save, the vault file is renamed to match. The plugin settings currently expose only the vault-relative save folder.

### Main Workflow

1. Open `Sample.canvas`.
2. Add nodes from the Node Library.
3. Connect an output port to an input port.
4. Use frames to group related nodes. Use Event Frames when the group should appear in Events Sheet.
5. Select a node and edit it in the Inspector.
6. Use Story to inspect the reachable flow from Entry.
7. Click Play to run the current narrative route.
8. Save or export when the structure is ready to share.

Undo and Redo are floating buttons in the upper-left of the canvas. The minimap floats in the lower-right; click it to move the main canvas.

### Node Types

- **Entry** starts the playable path.
- **Content** holds narration or scene text.
- **Dialog** is a character line. A Dialog title matching a character name is treated as Speaker.
- **Choice** shows one Play button per choice line.
- **Condition** reads a variable condition such as `trust == high`.
- **Set** writes a variable value.
- **Jump** marks a route transition or named destination. It does not teleport on its own; connect it to the next node you want the graph to visit.
- **Marker** is a planning note.
- **Frame** groups nodes visually.
- **Event Frame** groups story beats and becomes a row in Events Sheet.

All default node types are editable templates. You can rename, hide, delete, restore, recolor, and change their fields.

### Playbook

![Playbook editor](assets/screenshots/playbook.png)

`Playbook.json` controls variables and Play rules.

Variables can be inserted into text with braces:

```text
The {traveler} keeps the {watch}.
```

Play rules can:

- choose title/body templates for a node type or node id;
- turn a field into Play choices;
- write variables when a node is visited;
- use a field as a condition gate.

Use `Add variable` and `Add play rule` for starter entries, then open `Advanced JSON` for direct editing. When a rule is added, the JSON editor scrolls to the inserted rule line.

### Events Sheet

![Events Sheet](assets/screenshots/events-sheet.png)

Only Event Frame nodes appear in Events Sheet. Different Event Frame types are grouped into separate tables.

You can rename, hide, or delete columns. Hidden columns appear in the sticky `Hidden` column at the right edge of each table so they can be restored. Deleted schema fields are removed from Event Frame type definitions and matching values are cleared from existing Event Frame nodes.

`Re-sort by graph` clears manual row ordering and sorts event rows by the current canvas graph.

### Characters

![Characters page](assets/screenshots/characters.png)

Characters can be linked to nodes with Cast chips:

- `POV`
- `Speaker`
- `Present`
- `Mentioned`
- `Target`
- `Owner`

You can also type `@Character Name` inside node text to create a natural reference. Character pages list backlinks by story order, including speaker scenes, present scenes, mentions, owned nodes, and event frames.

Use Character focus to highlight related nodes without drawing a web of lines across the canvas.

### Canvas Operations

- Drag nodes by their header.
- Resize nodes from the lower-right handle.
- Click an output port, then an input port, to connect nodes.
- Double-click blank canvas to cancel a pending connection.
- Right-click a link to reconnect or delete it.
- Use `Layout H` or `Layout V` for automatic layout.
- Drag Story rows to change story order or move nodes into and out of frames.
- Story `Focus` selects the node, opens the Node inspector, centers it on canvas, and uses 50% zoom.

## 中文

Narrative Canvas 是一个用于复杂叙事设计的节点式工作区。它可以把剧情段落、角色对白、选择分支、条件判断、变量变化、跳转、角色和笔记整理成可连接、可预览的互动流程。它适用于游戏、互动小说、分支剧本、任务链和其他非线性叙事结构。

更推荐把它用于整理思路、检查分支、准备展示和说明复杂叙事结构。正文、对白润色、剧本定稿仍建议放在你常用的写作工具里完成。

### 安全提醒

- `Playbook.json` 是声明式配置。它可以控制 Play 的标题、正文、选项按钮、简单条件和变量写入；它不会执行任意 JavaScript。
- Hide 只隐藏 Events Sheet 的列，保留数据。Delete 会从 schema 移除列，并清掉 Event Frame 节点里对应字段的值。
- 删除节点后，相关内容会被放到运行路径之外的归档数据里，误删风险会低一些。重要项目仍建议保留版本。
- 网页端 Save 存到浏览器本地缓存。Obsidian 端 Save 写入当前 vault 里的 `.ncanvas` 项目文件。

### 网页

可以直接打开 `index.html`，也可以访问：

<https://ringeringeraja33.github.io/NarrativeCanvas/>

网页应用适合快速规划和演示。需要带走文件时，可以使用 `Export JSON`、`Image`、`HTML`、`Characters.md`、`Events Sheet.csv` 或 `Playbook.json`。

### Obsidian 插件

手动安装时，把插件文件复制到：

```text
.obsidian/plugins/narrative-canvas/
```

然后重新加载 Obsidian，在 Community plugins 里启用 `Narrative Canvas`。

插件会把项目保存成 `.ncanvas` 文件。默认文件名跟随项目标题，例如：

```text
Sample.ncanvas
```

修改项目标题后点击 Save，vault 内的项目文件会随之改名。插件设置里目前只保留项目保存路径，可以填写相对 vault 根目录的文件夹。

### 基本流程

1. 打开 `Sample.canvas`。
2. 从 Node Library 添加节点。
3. 从一个节点的输出端口连到另一个节点的输入端口。
4. 用 Frame 归组节点。需要进入 Events Sheet 的内容使用 Event Frame。
5. 选中节点，在右侧 Inspector 编辑。
6. 在 Story 里查看从 Entry 可到达的故事顺序。
7. 点击 Play 预览当前叙事路线。
8. 结构整理好后保存或导出。

### 节点类型

- **Entry** 是 Play 的起点。
- **Content** 用来写叙述或场景文字。
- **Dialog** 是角色台词。Dialog 标题和角色名一致时，会被识别为 Speaker。
- **Choice** 会把每一行 choice 变成 Play 里的一个按钮。
- **Condition** 读取简单条件，例如 `trust == high`。
- **Set** 写入变量值。
- **Jump** 用来标记路线转场或目标位置。它不会自动传送流程，需要把它连到下一个要访问的节点。
- **Marker** 是规划备注。
- **Frame** 用来视觉分组。
- **Event Frame** 用来归组故事节拍，并在 Events Sheet 里生成一行。

示例里的所有 node type 都是默认模板，可以重命名、隐藏、删除、恢复、改颜色，也可以调整字段。

### Playbook

`Playbook.json` 控制变量和 Play 规则。

变量可以用花括号插入正文：

```text
The {traveler} keeps the {watch}.
```

Play 规则可以：

- 指定某种节点或某个节点的标题、正文模板；
- 把某个字段变成 Play 里的选项；
- 节点被访问时写入变量；
- 把某个字段作为条件判断。

可以先用 `Add variable` 和 `Add play rule` 创建起始配置，再打开 `Advanced JSON` 直接编辑。新增 rule 后，JSON 编辑区会自动滚到刚添加的那一行。

### Events Sheet

只有 Event Frame 节点会进入 Events Sheet。用户自定义出多种 Event Frame 类型时，不同类型会分成不同表格。

列可以重命名、隐藏或删除。隐藏的列会集中显示在每张表右侧固定的 `Hidden` 列里，方便恢复。删除 schema 字段时，会从 Event Frame 类型定义里移除该字段，并清掉已有 Event Frame 节点上的对应值。

`Re-sort by graph` 会清掉手动行顺序，按当前 canvas 连线关系重新排序。

### Characters

角色可以通过 Cast chips 关联到节点：

- `POV`
- `Speaker`
- `Present`
- `Mentioned`
- `Target`
- `Owner`

也可以在节点正文里输入 `@角色名` 创建自然引用。Characters 页面会按 Story 顺序列出角色相关节点，包括说话场景、在场场景、被提到的位置、拥有关系和事件框。

Character focus 会高亮相关节点，让无关节点变淡；这样能看出角色分布，又不会把 canvas 画成一团线。

### Canvas 操作

- 拖动节点头部可以移动节点。
- 从右下角手柄可以调整节点大小。
- 点击输出端口，再点击输入端口，可以建立连线。
- 连线过程中双击空白画布，可以取消待建立的连线。
- 右键已有连线，可以选择重连或删除。
- `Layout H` 和 `Layout V` 可以自动横排或竖排。
- 在 Story 里拖动条目，可以改变故事顺序，或把节点移入、移出某个 frame。
- Story 里的 `Focus` 会选中节点，打开 Node inspector，把节点以 50% 缩放居中到 canvas。
