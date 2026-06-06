# Narrative Canvas 1.1.0

Compared with 1.0.5.

## English

### New

- Bilingual interface (English / 中文). Web app: floating `EN / 中` toggle in the lower-right that remembers the last choice. Obsidian plugin: new `Language` setting that can follow Obsidian's interface language.
- Condition nodes emit labelled `true` / `false` branches. The right-click branch menu names which outgoing link is which, and Play walks the matching branch.
- Compound condition expressions. `Condition` and node `Requirements` accept `>=`, `<=`, `>`, `<` alongside `==` / `!=`, joined with `&&` or `||` — e.g. `trust_level >= 2 && lantern_lit == true`.
- Playbook `actions` array in `Playbook.json`. Each entry has a trigger (`onVisit` / `onChoose` / `gate` / `manual`), an operation (`set` / `add` / `subtract` / `append` / `remove` / `toggle` / `clear` / `if` / `goTo` / `show` / `hide` / `lockChoice` / `unlockChoice`), a category (`Quest`, `Variable`, `Actor`, `Item`, `Location`, `Sim Status`, `Alert`, `Misc`, `Custom`, `Manual Enter`, `Quest Entry`), a target node, and a key/value. `gate` + `op: "if"` can drive a Condition node from outside. Edit through `Advanced JSON` for now; in-page editor lands in 1.1.1.
- Frame layer ordering. New frames default beneath regular nodes but above older default-order frames, so adding a grouping frame no longer buries earlier ones.
- New search bar at the bottom of the Playbook page that searches the Advanced JSON text. Pressing Enter expands Advanced JSON if collapsed and selects the matched span.
- All four search bars (canvas / characters / events / Playbook) now show a unified `current / total` counter; pressing Enter cycles to the next match and focuses it — canvas centers + 100% zooms the node, character cards scroll to the middle, event rows scroll to the middle, Playbook selects the next JSON span. The counter refreshes live as you type; typing another character resets the "current position" to 0 so Enter starts cycling from the first match.
- Vault integration improvements. Deleting a `.ncanvas` file closes only the matching Narrative Canvas tab(s); other open tabs (showing other files) keep their canvas state untouched. Renaming a `.ncanvas` file (or its parent folder) updates the open tab's path in place. Clicking the same `.ncanvas` file multiple times focuses the already-open tab instead of opening duplicates.
- Connection ports can slide along the node edge. Drag a port to relocate it on its current side or jump to a different edge of the same node; the link recomputes its path live and the new position is saved with the node, which helps when several incoming or outgoing links would otherwise overlap.

### Improved

- PNG export resolution dropdown is sized by output pixels (`4096 × 4096`, `6144 × 6144`, `8192 × 8192`, `12000 × 12000`). Filename records the actual pixel size; oversized canvases auto-scale to stay within browser raster limits.
- Characters page lays out as a real grid — cards align in even rows across columns instead of breaking across CSS columns.
- Sample project shows the new gating: first-time vs repeat briefing condition, an optional Reyes-clue branch, 8 Playbook actions across Variable / Quest / Actor / Sim Status, and a compound trust + lantern gate.
- Starting a new rectangle selection clears any leftover `Character focus` highlight.
- Security hardening. Fixed three XSS surfaces in `.ncanvas` loading — node ids and link ids are no longer interpolated raw into HTML attributes. The Obsidian plugin bundle ships a stub `getWebProjectStorage` that always returns null and contains no browser-storage references, matching Obsidian's community-plugin review rules; the standalone web build keeps its own `localStorage` path so the in-browser app continues to save normally.
- Choice node editing. Dark mode no longer renders the choice option card as a white sheet colliding with dark inputs — the card now follows the inspector panel palette. Editing the `op` dropdown or adding/deleting an "On choose effects" entry no longer collapses the `On choose effects` panel; expanded / collapsed state survives re-renders.
- Routing field. `Routing` + `Go to title` now reflect actual semantics — the title input only appears when routing is `Go to title`; `Continue by link` and `End route` show a short hint instead. Switching away from `Go to title` clears the stray `target`, so saved files no longer carry a routing mode + ghost target combination.
- Script Builder (Playbook). Each row's node card stacks the title and `Type id` vertically, centered, so narrow columns stay readable. The routing column behaves identically to the node inspector.
- Docs. README now has a Connection Ports section (input vs output port semantics, link direction rule, and the "slide along the edge" behavior). Chinese README is split into a separate `README-zh.md`, linked from the top of `README.md`.

### Compatibility

- Old projects load unchanged. Condition outgoing links without `choiceIndex` are re-synced to the `true / false` slots on open.
- `Playbook.json` without `actions` still loads — a missing array means no actions.
- PNG filenames change from `name@2x.png` to `name-WxH.png`. External tools that watched the old pattern need updating.

## 中文

### 新增

- 中英双语界面。网页端右下角浮动 `EN / 中` 切换按钮，会记忆上次选择；Obsidian 插件设置里新增 `语言` 项，可跟随 Obsidian 界面语言。
- Condition 节点输出带标签的 `true` / `false` 分支。右键连线菜单会指明哪条线对应哪个分支，`演示` 时按条件结果走对应线。
- 条件表达式增强。`Condition` 与节点 `条件要求` 支持 `>=`、`<=`、`>`、`<`，并可用 `&&`、`||` 拼接，例如 `trust_level >= 2 && lantern_lit == true`。
- `Playbook.json` 新增 `actions` 数组。每条动作包含时机（`onVisit` / `onChoose` / `gate` / `manual`）、动作（`set` / `add` / `subtract` / `append` / `remove` / `toggle` / `clear` / `if` / `goTo` / `show` / `hide` / `lockChoice` / `unlockChoice`）、分类（`任务`、`变量`、`角色`、`物品`、`地点`、`模拟状态`、`提示`、`杂项`、`自定义`、`手动输入`、`任务条目`）、目标节点和键值。`gate` + `op: "if"` 可从外部驱动 Condition 节点。当前请通过 `高级 JSON` 编辑，行内编辑器将在 1.1.1 跟进。
- `框架` 层级排序。新建 `框架` 默认在普通节点之下，但在更早默认顺序的 `框架` 之上 —— 新加分组不会一次盖住旧分组。
- Playbook 页底部新增搜索框，搜索 Advanced JSON 文本。回车后会自动展开 Advanced JSON，并把命中的字段选中。
- 四个搜索栏（canvas / 角色 / 事件表 / Playbook）统一显示 `当前 / 总数` 计数；回车循环到下一个命中并聚焦 —— canvas 居中并 100% 缩放命中节点，角色卡片滚到中间，事件行滚到中间，Playbook 选中下一段 JSON。输入时计数实时刷新，再敲字符会把"当前位置"重置为 0，回车从头开始。
- vault 集成增强。在 vault 里删除 `.ncanvas` 文件时，只关闭对应该文件的 Narrative Canvas tab；其他 tab（显示别的文件）保留 canvas 状态不变。重命名 `.ncanvas` 文件或其父文件夹会同步更新已开 tab 的路径。重复点同一个 `.ncanvas` 不再开多个 tab，而是聚焦已经打开的那一个。
- 连线端口可以沿节点边缘滑动。把端口拖动可以沿当前边滑动，也可以跳到节点的另一条边；连线路径会实时重算，新位置随节点一起保存。一个节点有多条相互重叠的进 / 出连线时，靠这个把布局摊开。

### 改进

- PNG 导出分辨率按输出像素分档（`4096 × 4096`、`6144 × 6144`、`8192 × 8192`、`12000 × 12000`）。导出文件名记录实际像素尺寸，超大画布会自动缩放避开浏览器位图限制。
- `角色` 页面改为真正的网格 —— 卡片按容器宽度均匀对齐，不再用 CSS 多列布局错位。
- 示例项目演示新的 gating：首次 vs 复述 briefing 条件、可选 Reyes 线索分支、跨 `变量` / `任务` / `角色` / `模拟状态` 的 8 条 `演示设置` 动作，以及复合 trust + lantern 条件门。
- 开始新的矩形框选时会清掉之前的 `角色聚焦` 高亮。
- 安全加固。修复加载 `.ncanvas` 文件时的三处 XSS —— 节点 id 与连线 id 不再裸拼进 HTML 属性。Obsidian 插件 bundle 里的 `getWebProjectStorage` 是空 stub，永远返回 null，主入口完全不引用浏览器存储，符合 Obsidian 社区插件审查规范；standalone 网页版照常走 `localStorage` 保存路径，浏览器里使用不受影响。
- Choice 节点编辑。dark mode 下选项卡片不再显示为白底与黑色输入框相撞，卡片配色跟随 Inspector 面板。改 op 下拉框、添加或删除"选择时效果"不再折叠 `选择时效果` 面板，展开 / 折叠状态在重渲后保留。
- 路线字段。`路线` 和 `跳到标题` 改成只有选了 `跳到标题` 才出现标题输入框；`沿连线继续` 和 `结束路线` 改为简短的提示文字。切走 `跳到标题` 后会清空残留的 target，保存出来的文件不会再出现 mode 与 ghost target 的组合。
- 脚本构建器（Playbook）。每一行节点卡的标题与 `类型 id` 改成竖排居中，窄列也读得清。路线列的行为与节点 Inspector 完全一致。
- 文档。README 新增"连线端口"章节（输入 / 输出端口的语义、连线方向规则、端口沿节点边缘滑动重排）。中文 README 拆成独立的 `README-zh.md`，在 `README.md` 顶部链接进入。

### 兼容性

- 旧项目原样加载。Condition 输出连线缺 `choiceIndex` 时会在打开时同步到 `true` / `false` 槽位。
- 没有 `actions` 字段的 `Playbook.json` 仍能加载，运行时视为空数组。
- PNG 文件名从 `name@2x.png` 改为 `name-WxH.png`，依赖旧格式的外部工具需要调整。
