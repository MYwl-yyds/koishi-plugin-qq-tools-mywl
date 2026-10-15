# koishi-plugin-qq-tools-mywl · QQ工具集

[![npm](https://img.shields.io/badge/npm-koishi--plugin--qq--tools--mywl-blue)](https://www.npmjs.com/package/koishi-plugin-qq-tools-mywl)

> [插件由AI生成]

把 **OneBot v11 的全部内置接口** 转写为 [ChatLuna](https://github.com/ChatLunaLab/chatluna) 的**模型工具**，让大模型在 Agent 模式下能直接收发 QQ 消息、查群成员、管群、传文件。

适配 **NapCat / LLBot / go-cqhttp / Lagrange** 等主流协议端。

---

## 功能特性

- **全量接口覆盖**：OneBot v11 规范定义的 **39 个接口**（`api/public.md` 38 个 + `api/hidden.md` 1 个）全部可用；另外收录了被 NapCat / LLBot 广泛实现的 go-cqhttp 扩展接口 39 个，合计 **78 个工具**。
- **每个工具一个开关**：77 个接口在控制台中按功能分组折叠展示，组内逐个开关，自由决定把哪些工具提供给 ChatLuna。开关由接口清单自动生成，不需要手写接口名。
- **危险操作默认关闭**：踢人、禁言、退群、解散群、删好友、删文件、改群资料、重启协议端、读取 Cookies 等默认**不注册**，对应开关默认关闭，想用随时打开。
- **参数自动补全**：模型没给 `group_id` / `user_id` 时，自动从当前会话推断，模型不必知道群号。
- **多框架兼容**：同一语义参数在不同框架下命名不同（`id` / `message_id`、`type` / `sub_type`、`folder` / `folder_id`）时自动双向填充；接口名别名（如 NapCat 的 `_del_group_notice` 与 LLBot 的 `_delete_group_notice`）自动依次尝试。
- **类型自动纠正**：大模型常把数字写成字符串，插件会按接口定义强制转换，避免协议端报参数错误。

---

## 安装

```bash
npm i koishi-plugin-qq-tools-mywl
```

或在 Koishi 控制台的「插件市场」中搜索 `qq-tools-mywl` 安装。

### 前置依赖

| 依赖 | 说明 |
| --- | --- |
| `koishi` | `^4.18.0` |
| `koishi-plugin-chatluna` | **必需（硬依赖）**，提供工具注册平台与 `@langchain/core` / `zod`。本插件声明了 `chatluna` 服务依赖，ChatLuna 未安装或未启用时本插件不会被加载。 |
| `koishi-plugin-adapter-onebot` | **必需**，提供 OneBot v11 连接。 |
| `@langchain/core` | `^0.3.80`，本插件依赖项，用于构造工具对象。 |
| `zod` | `3.25.76`，本插件依赖项。**必须为 v3**，ChatLuna 内部固定使用 zod v3；v4 会导致工具参数无法正确渲染。 |

#### 关于 `@langchain/core` 与 `zod` 的解析

这两个模块由 ChatLuna 提供（ChatLuna 用 `resolutions` / `overrides` 把它们锁定在 `^0.3.80` 与 `3.25.76`），本插件也把它们声明为直接依赖——这与 ChatLuna 官方扩展插件 `koishi-plugin-chatluna-plugin-common` 的做法一致。

但**本地插件**场景下（插件放在 `external/` 目录、未执行 `npm install`），插件目录下没有 `node_modules`；若包管理器又把这两个模块嵌套安装进了 `koishi-plugin-chatluna/node_modules`，直接 `require` 会报 `Cannot find module '@langchain/core/tools'`。

为此插件在运行时按优先级解析依赖（见 `src/deps.ts`），**优先取 ChatLuna 所在的那一份**，这样既不用额外安装，也不受安装布局（npm 提升 / pnpm 嵌套）影响，同时保证与 ChatLuna 内部是同一个模块实例——否则 ChatLuna 的 `instanceof ZodSchema` 判定会失效，ReAct 模式下的参数渲染也会出问题。

若仍报错，日志会列出所有已尝试的位置，便于定位。

---

## 使用

1. 在控制台启用插件，确认总开关「启用」为开启状态。
2. 展开六个分组折叠块，按需打开/关闭单个工具。非危险接口默认开启，危险接口默认关闭。
3. 在 ChatLuna 中进入 **Agent 模式**（或使用支持工具调用的模型），即可让模型调用这些工具。

### 示例对话

> **用户**：帮我看看本群有多少人，群主是谁
>
> **模型**：（调用 `onebot_get_group_member_list`）→ 本群共 128 人，群主是 12345678。

> **用户**：把张三禁言十分钟
>
> **模型**：（先 `onebot_get_group_member_list` 找到 QQ 号，再调用 `onebot_set_group_ban`，duration=600）
>
> 注：`set_group_ban` 是危险接口，需先在配置中打开它的开关。

> **用户**：撤回你刚才那条消息
>
> **模型**：（调用 `onebot_delete_msg`）

---

## 工具命名规则

所有工具统一加前缀 `onebot_`，接口名去掉可能存在的下划线前缀：

| OneBot 接口 | 工具名 |
| --- | --- |
| `send_group_msg` | `onebot_send_group_msg` |
| `get_group_member_info` | `onebot_get_group_member_info` |
| `_send_group_notice` | `onebot_send_group_notice` |

> 工具名保持整洁，实际调用时插件会按「`callAs` → 接口名 → 别名」的顺序依次尝试，因此 NapCat 与 LLBot 的不同命名都能命中。

---

## 配置项

配置只有两层：一个总开关，以及每个分组折叠块里的工具开关。

| 配置 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | 总开关。关闭后不注册任何工具。 |

### 工具开关

六个分组折叠块，每个块内列出该分组下的全部接口，**每个接口一个开关**：

| 分组 | 组内数量 | 内容 |
| --- | --- | --- |
| 消息操作 `message` | 14 | 发私聊/群聊消息、撤回、获取消息详情、合并转发、群签到、点赞、消息历史、表情回应 |
| 信息查询 `query` | 15 | 登录号信息、陌生人信息、好友列表、群信息、群成员、群荣誉、精华列表、群公告、群打卡名单、在线客户端 |
| 群聊管理 `group` | 15 | 禁言、踢人、设置管理员、群名片、群名、头衔、群头像、全体禁言、退群、精华消息、群公告 |
| 好友与请求 `friend` | 4 | 处理好友申请、处理入群申请、删除好友、单向好友列表 |
| 文件媒体 `file` | 18 | 群文件系统、上传/删除/移动群文件与目录、获取图片与语音、OCR、文件下载 |
| 系统维护 `system` | 12 | 运行状态、版本信息、Cookies / CSRF、清理缓存、重启协议端、账号资料 |

开关的默认值即「危险操作默认关闭」策略：标注 ⚠️ 的接口默认 `false`，其余默认 `true`。

配置键就是接口名（去掉 `_send_group_notice` 这类前导下划线、以及 `.handle_quick_operation` 的前导点），例如：

```yaml
message:
  send_group_msg: true
  delete_msg: true
query:
  get_group_member_list: true
group:
  set_group_ban: false        # 危险操作，默认关闭
system:
  set_restart: false          # 危险操作，默认关闭
```

### 危险接口清单（共 25 个，默认关闭）

`set_group_kick`、`set_group_ban`、`set_group_anonymous_ban`、`set_group_whole_ban`、`set_group_admin`、`set_group_anonymous`、`set_group_name`、`set_group_leave`、`set_group_portrait`、`delete_group_notice`、`delete_group_folder`、`delete_group_file`、`delete_friend`、`delete_unidirectional_friend`、`download_file`、`get_cookies`、`get_csrf_token`、`get_credentials`、`clean_cache`、`set_restart`、`reload_event_filter`、`set_qq_profile`、`set_qq_avatar`、`set_online_status`、`handle_quick_operation`（对应接口 `.handle_quick_operation`）。

这些接口在配置界面中会标注「⚠️ 危险操作，默认关闭」，工具描述里也会带提醒，提示模型调用前需先确认用户意图。

> 返回结果统一截断到 4000 字符（内置保护，非配置项），避免 `get_group_member_list` 这类大返回撑爆模型上下文。

---

## 兼容性说明

### 调用链路

插件按以下顺序尝试调用，任一成功即返回：

1. `bot.onebot(action, params)` — 部分适配器或桥接插件提供的原生调用函数
2. `bot.internal._get(action, params)` — `koishi-plugin-adapter-onebot` 的底层调用，会解包 `data` 并在 `retcode !== 0` 时抛错
3. `bot.internal.request / _request(action, params)` — 返回完整 `{ status, retcode, data, echo }` 信封
4. `bot.internal[camelCase(action)](...位置参数)` — 旧版适配器的 camelCase 方法

### 参数类型

OneBot 规范中 `group_id` / `user_id` 为 `number`，但 NapCat 常声明为 `string`、LLBot 使用 `number | string` 联合类型。插件对这类参数统一使用 `number | string` 的宽松 schema，并在调用前按接口定义做一次纠正，两类实现都能正常工作。

### 框架差异

部分接口并非 OneBot v11 规范内容，而是 go-cqhttp 首创、被各框架复刻的事实标准。这类接口在工具描述中会标注「**非 OneBot v11 标准接口**」，配置界面中也会标注「扩展接口，部分协议端不支持」，且在部分框架上不可用：

| 接口 | 说明 |
| --- | --- |
| `set_group_anonymous` / `set_group_anonymous_ban` | 规范定义，但 **NapCat 未实现** |
| `delete_unidirectional_friend` | 仅 go-cqhttp 系实现，**NapCat 未实现** |
| `reload_event_filter` | 仅 go-cqhttp 系实现 |
| `ocr_image` | NapCat 仅在 **Windows** 平台实现 |
| `create_group_file_folder` | 多数实现仅支持在根目录创建 |
| 群公告三件套 | NapCat 用 `_del_group_notice`，LLBot / go-cqhttp 用 `_delete_group_notice`，插件两者都会尝试 |
| `send_group_sign` | 见下方「群签到」专节 |
| `get_group_signed_list` | NapCat / LLBot 均实现，返回 `{ user_id, nick, time, rank }` |

### 群签到（`send_group_sign`）

这个接口比较特殊，单独说明。

**它不返回任何结果。** NapCat 的 `SetGroupSign` 声明的返回类型是 `Type.Void()`，签到成功也返回空。因此协议端「没有报错」**不等于**签到成功，插件也无从判断。为此插件做了三件事：

1. 工具描述与调用结果都明确写出「无法据此判断是否真正生效」，不再输出「操作成功」这种无法成立的结论；
2. 补充了 `get_group_signed_list`（获取今日打卡名单），模型可以调用它来核实签到是否真的生效；
3. 群号按**字符串**发送。NapCat 该接口的 schema 声明为 `group_id: Type.String()`（它自己的其他接口都是 `number|string`），传数字在部分版本上会被 schema 校验拒绝。

> LLBot 的实现（`ntGroupApi.groupClockIn`）在失败时会抛错、成功返回 `null`，因此对 LLBot 而言「没报错」基本等于成功；上述第 2 点主要用于 NapCat。

**若签到没生效，按现象分两种情况排查：**

1. **调用直接报错**，且错误里出现 `packetBackend不可用` 之类的字样 → NapCat 的 **PacketBackend** 未启用。群签到属于该「DLC」提供的功能（NapCat 官方文档《高级配置》的 PacketBackend 支持清单中列有「群签到」），对照文档检查版本与平台：自 NapCat v3.6.0 起，Windows amd64 / Linux amd64+arm64 / macOS 已内置，通常无需额外配置。

2. **调用成功、但没有签到效果** → 此时请求已被协议端接受（`retcode` 为 0），问题不在插件与协议端的通信上。请先调用 `get_group_signed_list` 核实是否真的没签到（也可能已经签过、或你在别处查看）。若确认名单里没有，常见原因是群号不对、机器人不在该群、或该群未开启签到功能——这些都需要在 QQ 侧确认，插件无从代劳。

> 说明：第 2 种情况下插件**无法**替你判断成败，因为接口本身不返回结果。这也是为什么调用结果里不会出现「操作成功」字样。

> 注意：`send_group_sign` 与 `set_group_sign` 是同一实现的两个名字（NapCat 两个都注册，LLBot 只注册前者），插件以 `send_group_sign` 为主名、`set_group_sign` 为别名依次尝试，因此两个框架都能命中。

> 完整的接口调研资料见仓库内 `ONEBOT11-API-REFERENCE.md`。

---

## 开发

```bash
npm install
npm run build
```

源码位于 `src/`：

| 文件 | 职责 |
| --- | --- |
| `index.ts` | 插件入口：筛选开关、注册工具 |
| `config.ts` | 控制台配置 Schema，由接口清单自动生成每个工具的开关 |
| `actions.ts` | 全部 OneBot 接口清单（参数、类型、必填性、危险标记）——**唯一数据源** |
| `onebot.ts` | 调用层，负责参数纠正、多形态调用与结果解包 |
| `tool.ts` | 把接口定义转换为 LangChain / ChatLuna 工具对象 |
| `deps.ts` | 运行时解析 ChatLuna 提供的 `@langchain/core` 与 `zod` |
| `types.ts` | 类型定义 |
| `constants.ts` | 分组常量与内置保护常量 |

### 添加新接口

只需在 `src/actions.ts` 对应分组的数组里追加一条 `ActionDef`，工具与配置开关都会自动生成，**不需要改动 `config.ts` 或 `index.ts`**：

```ts
{
  action: 'my_new_action',        // OneBot action 名，工具名会自动加 onebot_ 前缀
  group: 'message',               // 所属分组，决定它出现在哪个折叠块
  title: '我的新接口',             // 中文短名，用于日志与配置界面
  description: '接口用途说明',      // 会暴露给模型
  params: [
    { name: 'group_id', type: 'number', required: true, description: '群号', autoFill: 'group' },
  ],
  returns: '{ ok: true }',        // 可选，返回值说明
  danger: true,                   // 可选，标记为危险操作（开关默认关闭）
  extension: true,                // 可选，标记为非规范接口
}
```

---

## 常见问题

**Q：控制台里找不到这个插件，或插件显示未加载？**
A：本插件把 ChatLuna 作为**必需依赖**，未安装或未启用 `koishi-plugin-chatluna` 时插件不会加载。请先安装并启用 ChatLuna，再启用本插件。

**Q：装了插件但模型完全不调用工具？**
A：依次检查：① ChatLuna 是否处于 Agent 模式；② 当前模型是否支持 function calling；③ 插件总开关与对应工具的开关是否都打开；④ 控制台日志中是否有「已向 ChatLuna 注册 N 个 OneBot 工具」。另外部分模型在 ReAct 模式下对工具参数的理解较弱，建议优先使用原生 tool-calling 模型。

**Q：模型调用时报「未找到可用的 OneBot 机器人」？**
A：说明当前没有已连接的 OneBot 协议端。请确认 `koishi-plugin-adapter-onebot` 已配置且机器人状态为在线。

**Q：模型调用时报 `retcode=...`？**
A：这是协议端返回的错误。常见原因：机器人权限不足（禁言/踢人需要管理员）、消息已超过撤回时限、群文件业务 ID 不对、接口在该框架上未实现。错误文本会原样回传给模型，模型可据此调整。

**Q：启动时报 `Cannot find module '@langchain/core/tools'`？**
A：这是本地插件常见的依赖布局问题。插件的 `src/deps.ts` 会在运行时从 Koishi 应用根目录与 ChatLuna 的安装位置解析该模块，正常情况下无需处理。若仍失败，请检查：① ChatLuna 是否已安装；② 日志中「无法加载 ChatLuna 提供的 @langchain/core 与 zod」一行列出的已尝试路径，确认其中是否有实际存在的 `koishi-plugin-chatluna/node_modules/@langchain/core`；③ 必要时在应用根目录执行一次 `npm install`。

**Q：想让模型只能发消息，不能管群？**
A：在控制台里把「群聊管理」「文件媒体」「系统维护」三个折叠块中不想暴露的工具逐个关掉即可（危险操作本来就是默认关闭的）。

**Q：模型说某个工具不存在？**
A：说明该工具的开关是关闭状态。请到对应分组折叠块里打开它——危险操作默认关闭，这是最常见的原因。

**Q：群签到调用了但没生效？**
A：见上文「群签到（`send_group_sign`）」专节。该接口不返回结果，请用 `get_group_signed_list` 核实；若报 `packetBackend` 相关错误，需要在 NapCat 侧启用 PacketBackend。

---

## License

MIT
