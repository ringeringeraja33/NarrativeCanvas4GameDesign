# Narrative Canvas

Changelog and release notes: [GitHub Releases](https://github.com/ringeringeraja33/NarrativeCanvas/releases)

## English

Narrative Canvas is a node-based workspace for writing and designing complex stories. It can organize story beats, character dialog, choice branches, conditions, variables, jumps, characters, and notes into a connected, previewable interactive flow. It is suitable for games, interactive fiction, branching scripts, questlines, and other nonlinear narrative structures.

It is best used for organizing ideas, checking branching logic, preparing pitches, and demonstrating how a story or questline works. It is not meant to replace prose drafting tools. Write the actual manuscript, script, or dialogue polish in your usual editor; use Narrative Canvas to keep the structure understandable.

![Narrative Canvas main canvas](assets/screenshots/main-canvas.png)

### Safety Notes

- `Playbook.json` is declarative. It can format Play output, define choice buttons, read simple conditions, and write variables. It does not run arbitrary JavaScript.
- Hide keeps Events Sheet data. Delete removes a column from the schema and clears matching values from Event Frame nodes.
- Deleted nodes are archived outside the runtime path so accidental deletion is less destructive, but you should still save versions of important work.
- Browser Save writes to browser local storage. Obsidian Save writes the current `.ncanvas` project file in your vault.
- `Save`: saves the current project. In the web app, it writes to browser `localStorage`. In Obsidian, it writes the current `.ncanvas` project file in your vault.
- `New`: creates a blank project. In the web app, the new project uses browser storage. In Obsidian, it creates a new `.ncanvas` file from the plugin filename settings when possible.
- `Open`: in the web app, imports a project file from disk. In Obsidian, opens a project file from your vault.
- `Reload`: discards unsaved changes and reloads the current saved source. In the web app, it reads browser storage. In Obsidian, it rereads the current `.ncanvas` file.
- `Clear storage`: web app only. It deletes the browser-saved project and loads a blank project.

### Web App

Open `index.html` directly or use:

<https://ringeringeraja33.github.io/NarrativeCanvas/>

When the project file card says `Browser storage`, the web app is reading and writing `localStorage`, not the browser HTTP cache. Clearing cached files may leave the saved project intact. Use `Clear storage` in the Project File controls to delete the browser-saved project and load a blank one.

### Obsidian Plugin

For manual installation, copy the latest released plugin files into:

```text
.obsidian/plugins/narrative-canvas/
```

Then reload Obsidian and enable `Narrative Canvas` in Community plugins.

### Main Workflow

1. Open `Narrative.canvas`.
2. Add nodes from the Node Library.
3. Connect an output port to an input port.
4. Use frames to group related nodes. Use Event Frames when the group should appear in Events Sheet.
5. Select a node and edit it in the Inspector.
6. Use Story to inspect the reachable flow from Entry.
7. Click Play to run the current narrative route.
8. Save or export when the structure is ready to share.

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

### Canvas Operations

- Drag nodes by their header.
- Click an output port, then an input port, to connect nodes.
- Double-click blank canvas to cancel a pending connection.
- Right-click a link to reconnect or delete it.

### Story

Story shows the reachable structure from the Entry node. Non-frame nodes appear when they are reachable from Entry. Frame nodes appear when the frame is reachable itself, or when it contains an included child node.

Story containment comes from canvas geometry. A node belongs to a frame when the node center point is inside that frame. The whole node box does not need to be inside the frame. If more than one frame contains the center point, Story folds the node into the smallest containing frame. A frame node can fold into another frame only when the containing frame is larger, which prevents nested-frame cycles.

Story display is read from the current canvas graph and geometry. Story operations write back to the canvas. Dragging a Story row into a frame moves that node into the frame area; when the dragged row is a frame, its Story descendants move with it. The target frame can expand to contain the moved content. Dragging a row to the root level moves it outside frames and avoids placing it inside another frame.

Manual Story row ordering is stored as `storyOrder`. `Re-sort by graph` clears those manual order values and returns Story ordering to the current graph order.

Story `Focus` selects the node, opens the Node inspector, centers it on canvas, and uses 100% zoom.

### Events Sheet

![Events Sheet](assets/screenshots/events-sheet.png)

Only Event Frame nodes appear in Events Sheet. Different Event Frame types are grouped into separate tables.

You can rename, hide, or delete columns. Hidden columns appear in the rightmost `Hidden` column of each table so they can be restored. Deleted schema fields are removed from Event Frame type definitions and matching values are cleared from existing Event Frame nodes.

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

Use Character focus to highlight related nodes.


### Playbook

![Playbook editor](assets/screenshots/playbook.png)

Think of `Playbook.json` this way:

**Node Library decides which fields a node type has. Node Inspector fills those fields. Playbook decides how Play reads those fields.**

It is not a prose editor or a JavaScript runner. It is a rule table for Play preview.

#### An example

You want a choice: hand over the watch, raise trust, otherwise continue on another route.

Playbook:

```json
{
  "variables": {
    "trust": "unknown",
    "watch": "Reyes's pocketwatch"
  },
  "nodeTypes": {
    "Choice": {
      "title": "{title}",
      "body": "{body}",
      "choices": "choices"
    },
    "Set": {
      "body": "{variable} = {value}",
      "set": {
        "key": "variable",
        "value": "value"
      }
    },
    "Condition": {
      "body": "{condition}",
      "condition": "condition"
    }
  }
}
```

Fill the nodes this way:

Choice node `choices`:

```text
Hand over {watch}
Keep {watch} hidden
```

Set node:

```text
variable: trust
value: high
```

Condition node:

```text
condition: trust == high
```

Result: Play shows buttons with variable replacement, Set changes the variable, and Condition follows different links based on that variable.

## 中文

Narrative Canvas 是一个用于复杂叙事写作与设计的节点式工作区。它可以把剧情段落、角色对白、选择分支、条件判断、变量变化、跳转、角色和笔记整理成可连接、可预览的互动流程。它适用于游戏、互动小说、分支剧本、任务链和其他非线性叙事结构。

更推荐把它用于整理思路、检查分支、准备展示和说明复杂叙事结构。正文、对白润色、剧本定稿仍建议放在你常用的写作工具里完成。

### 安全提醒

- `Playbook.json` 是声明式配置。它可以控制 Play 的标题、正文、选项按钮、简单条件和变量写入；它不会执行任意 JavaScript。
- Hide 只隐藏 Events Sheet 的列，保留数据。Delete 会从 schema 移除列，并清掉 Event Frame 节点里对应字段的值。
- 删除节点后，相关内容会被放到运行路径之外的归档数据里，误删风险会低一些。重要项目仍建议保留版本。
- 网页端 Save 存到浏览器本地缓存。Obsidian 端 Save 写入当前 vault 里的 `.ncanvas` 项目文件。
- `Save`：保存当前项目。网页端写入浏览器 `localStorage`；Obsidian 端写入当前 vault 里的 `.ncanvas` 项目文件。
- `New`：新建空项目。网页端使用浏览器保存；Obsidian 端会按插件设置里的文件名模板创建新的 `.ncanvas` 文件。
- `Open`：网页端从本地磁盘选择并导入项目文件；Obsidian 端从 vault 里选择项目文件打开。
- `Reload`：放弃未保存修改，重新加载当前保存来源。网页端读取浏览器保存内容；Obsidian 端重新读取当前 `.ncanvas` 文件。
- `Clear storage`：仅网页端可用。删除浏览器保存的项目，并加载一个空项目。

### 网页

可以直接打开 `index.html`，也可以访问：

<https://ringeringeraja33.github.io/NarrativeCanvas/>

Project File 显示 `Browser storage` 时，网页端读写的是 `localStorage`，不是浏览器的普通缓存。清 cache 不一定会清掉上次保存的项目。需要清空网页端保存内容时，用 Project File 里的 `Clear storage`。

### Obsidian 插件

手动安装时，把最新发布的插件文件复制到：

```text
.obsidian/plugins/narrative-canvas/
```

然后重新加载 Obsidian，在 Community plugins 里启用 `Narrative Canvas`。

### 基本流程

1. 打开 `Narrative.canvas`。
2. 从 Node Library 添加节点。
3. 从一个节点的输出端口连到另一个节点的输入端口。
4. 用 Frame 归组节点。需要进入 Events Sheet 的内容使用 Event Frame。
5. 选中节点，在右侧 Inspector 编辑。
6. 在 Story 里查看从 Entry 可到达的故事顺序。
7. 点击 Play 预览当前叙事路线。
8. 结构整理好后保存或导出。

### 节点类型

- **Entry** 是：Play 的起点。
- **Content**：叙述或场景文字。
- **Dialog**：角色对话。Dialog 标题和角色名一致时，会被识别为 Speaker。
- **Choice**：将每一行 choice 作为Play 里的一个按钮。
- **Condition**：读取简单条件，例如 `trust == high`。
- **Set**：写入变量值。
- **Jump**：标记路线转场或目标位置。它不会自动传送流程，需要把它连到下一个要访问的节点。
- **Marker**：规划备注。
- **Frame**：视觉分组。
- **Event Frame**：故事节拍分组，并在 Events Sheet 里生成一行。

所有 node type 默认模板可以重命名、隐藏、删除、恢复、改颜色，也可以调整字段。

### Canvas 操作

- 拖动节点头部可以移动节点。
- 点击输出端口，再点击输入端口，可以建立连线。
- 连线过程中双击空白画布，可以取消待建立的连线。
- 右键点击已有的连线，可以选择重连或删除。

### Story

Story 显示从 Entry 节点可到达的结构。非 frame 节点只有从 Entry 可到达时才显示。Frame 节点本身可到达，或者包含了需要显示的子节点时，会显示在 Story 里。

Story 里的包含关系来自 canvas 上的几何位置。判断一个节点是否在某个 frame 内，只看节点中心点：中心点在 frame 内，就算属于这个 frame；节点整个外框不必完全落在 frame 内。如果多个 frame 同时包含这个中心点，Story 会把节点折进面积最小的那个 frame。Frame 节点也可以折进另一个 frame，但只会折进面积更大的 frame，避免 frame 之间形成嵌套循环。

Story 的显示读取当前 canvas 的连线和几何位置；Story 里的操作会反写到 canvas。把 Story 条目拖进 frame，会把该节点移动到 frame 内；如果拖动的是 frame，也会带着它在 Story 里的后代一起移动。必要时，目标 frame 会扩展以包住被拖入的内容。把条目拖到根层级，会把节点移到 frame 外，并避开其他 frame。

手动拖动产生的 Story 顺序会写入 `storyOrder`。`Re-sort by graph` 会清掉这些手动顺序，回到当前连线顺序。

Story 里的 `Focus` 会选中节点，打开 Node inspector，把节点以 100% 缩放居中到 canvas。

### Events Sheet

只有 Event Frame 节点会进入 Events Sheet。用户自定义出多种 Event Frame 类型时，不同类型会分成不同表格。

列可以重命名、隐藏或删除。隐藏的列会集中显示在每张表最右侧的 `Hidden` 列里，方便恢复。删除 schema 字段时，会从 Event Frame 类型定义里移除该字段，并清掉已有 Event Frame 节点上的对应值。

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

Character focus 会高亮相关节点。

### Playbook

可以这样理解 `Playbook.json`：

**Node Library 决定节点有哪些字段，Node Inspector 填这些字段，Playbook 决定 Play 预览时怎么读取这些字段。**

它不是正文编辑器，也不是 JavaScript 运行器。它是一张给 Play 预览使用的规则表。

#### 一个示例

你想做一个选择：交出怀表后信任变高，否则走另一条路。

Playbook：

```json
{
  "variables": {
    "trust": "unknown",
    "watch": "Reyes's pocketwatch"
  },
  "nodeTypes": {
    "Choice": {
      "title": "{title}",
      "body": "{body}",
      "choices": "choices"
    },
    "Set": {
      "body": "{variable} = {value}",
      "set": {
        "key": "variable",
        "value": "value"
      }
    },
    "Condition": {
      "body": "{condition}",
      "condition": "condition"
    }
  }
}
```

节点填写：

Choice 节点 `choices`：

```text
Hand over {watch}
Keep {watch} hidden
```

Set 节点：

```text
variable: trust
value: high
```

Condition：

```text
condition: trust == high
```

结果：Play 里按钮能显示变量，经过 Set 会改变量，Condition 会按变量走不同连线。
