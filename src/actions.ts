// ============ QQ工具集 - OneBot v11 接口清单 ============
// 参数名、类型、必填性按 OneBot v11 规范（botuniverse/onebot-11）定义，
// 并针对 NapCat / LLBot / go-cqhttp 的实际实现差异做了兼容处理。
//
// 分层说明：
//   - 标准接口：OneBot v11 规范定义（public.md 38 个 + hidden.md 1 个）
//   - 扩展接口：go-cqhttp 首创、被 NapCat / LLBot 广泛复刻的事实标准（extension: true）
// 扩展接口并非规范的一部分，在部分框架上不可用，因此默认随所属分组一起受控，
// 且描述中会明确标注「扩展接口」。

import { ActionDef } from './types'

// ---------- 复用参数片段 ----------
// 注意：规范里 group_id / user_id 是 number，但 NapCat 与 LLBot 大量使用
// number | string，因此类型放宽为 number（coerceArgs 会把字符串转成数字，
// 转换失败时原样透传字符串，保证两类实现都能工作）。

const GROUP_ID = (description = '群号'): ActionDef['params'][number] => ({
  name: 'group_id',
  type: 'number',
  required: true,
  description: `${description}。省略时默认使用当前会话所在群`,
  autoFill: 'group',
})

const USER_ID = (description = '目标 QQ 号'): ActionDef['params'][number] => ({
  name: 'user_id',
  type: 'number',
  required: true,
  description,
})

const MESSAGE = (): ActionDef['params'][number] => ({
  name: 'message',
  type: 'message',
  required: true,
  description:
    '消息内容。推荐直接写纯文本或 CQ 码（如 [CQ:at,qq=123] 你好）；也可以传消息段数组，如 [{"type":"text","data":{"text":"你好"}}]',
})

const AUTO_ESCAPE = (): ActionDef['params'][number] => ({
  name: 'auto_escape',
  type: 'boolean',
  required: false,
  default: false,
  description: '消息内容是否为纯文本（true 时不解析 CQ 码，仅对字符串消息有效）',
})

const NO_CACHE = (): ActionDef['params'][number] => ({
  name: 'no_cache',
  type: 'boolean',
  required: false,
  default: false,
  description: '是否不使用缓存，强制从协议端获取最新数据',
})

const MESSAGE_ID = (): ActionDef['params'][number] => ({
  name: 'message_id',
  type: 'number',
  required: true,
  description: '消息 ID',
})

const FORWARD_NODES = (): ActionDef['params'][number] => ({
  name: 'messages',
  type: 'array',
  required: true,
  items: { type: 'object' },
  description:
    '合并转发节点数组，形如 [{"type":"node","data":{"name":"昵称","uin":"QQ号","content":"消息内容"}}]',
})

// ---------- 消息操作 ----------
const MESSAGE_ACTIONS: ActionDef[] = [
  {
    action: 'send_private_msg',
    group: 'message',
    title: '发送私聊消息',
    description: '向指定 QQ 用户发送私聊消息。',
    params: [
      {
        name: 'user_id',
        type: 'number',
        required: true,
        description: '目标 QQ 号。省略时默认回复当前会话用户',
        autoFill: 'user',
      },
      MESSAGE(),
      AUTO_ESCAPE(),
    ],
    returns: '{ message_id: 消息 ID }',
  },
  {
    action: 'send_group_msg',
    group: 'message',
    title: '发送群消息',
    description: '向指定群发送消息。',
    params: [GROUP_ID(), MESSAGE(), AUTO_ESCAPE()],
    returns: '{ message_id: 消息 ID }',
  },
  {
    action: 'send_msg',
    group: 'message',
    title: '发送消息（自动判断类型）',
    description:
      '按 message_type 自动选择发送私聊或群聊消息。message_type 为 private 时使用 user_id，为 group 时使用 group_id。省略 message_type 时会自动推断：优先看已提供的 ID，都没有则默认发到当前会话（群聊发本群，私聊发给对方）。一般场景直接使用 send_group_msg 或 send_private_msg 更明确。',
    params: [
      {
        name: 'message_type',
        type: 'string',
        required: false,
        enum: ['private', 'group'],
        description: '消息类型：private 私聊 / group 群聊。省略时按提供的 ID 自动推断',
      },
      {
        name: 'user_id',
        type: 'number',
        required: false,
        description: '私聊目标 QQ 号（message_type=private 时必填）',
        autoFill: 'user',
      },
      {
        name: 'group_id',
        type: 'number',
        required: false,
        description: '群号（message_type=group 时必填）',
        autoFill: 'group',
      },
      MESSAGE(),
      AUTO_ESCAPE(),
    ],
    returns: '{ message_id: 消息 ID }',
  },
  {
    action: 'delete_msg',
    group: 'message',
    title: '撤回消息',
    description: '撤回指定消息。需要机器人具备相应权限（群内通常需要管理员）。',
    params: [MESSAGE_ID()],
  },
  {
    action: 'get_msg',
    group: 'message',
    title: '获取消息详情',
    description:
      '获取指定消息的详细信息，包含发送者与消息内容。可用于查看被回复/引用的消息内容。',
    params: [MESSAGE_ID()],
    returns:
      '{ time, message_type, message_id, real_id, sender{user_id,nickname,card,role}, message }',
  },
  {
    action: 'get_forward_msg',
    group: 'message',
    title: '获取合并转发内容',
    description: '获取合并转发消息的具体内容。需要传入合并转发消息段的 id。',
    params: [
      {
        name: 'message_id',
        type: 'string',
        required: true,
        description: '合并转发消息的 ID（即合并转发消息段的 id 字段）',
      },
    ],
    // 规范参数名为 id，NapCat / LLBot 等实现使用 message_id；两个键都会发送
    paramAliases: { message_id: 'id' },
    returns: '{ message: [ { type:"node", data:{...} } ] }',
  },
  {
    action: 'send_group_forward_msg',
    group: 'message',
    title: '发送群合并转发',
    description: '向群发送合并转发消息（多条消息合并为一个转发卡片）。',
    params: [GROUP_ID(), FORWARD_NODES()],
    extension: true,
    returns: '{ message_id, forward_id }',
  },
  {
    action: 'send_private_forward_msg',
    group: 'message',
    title: '发送私聊合并转发',
    description: '向指定用户发送合并转发消息。',
    params: [USER_ID('目标 QQ 号'), FORWARD_NODES()],
    extension: true,
    returns: '{ message_id, forward_id }',
  },
  {
    action: 'get_group_msg_history',
    group: 'message',
    title: '获取群消息历史',
    description: '获取指定群的历史消息记录，可用于回顾群内近期聊天内容。',
    params: [
      GROUP_ID(),
      {
        name: 'message_seq',
        type: 'number',
        required: false,
        description: '起始消息序号，省略则从最新消息开始',
      },
      { name: 'count', type: 'number', required: false, description: '获取的消息条数' },
    ],
    extension: true,
    returns: '{ messages: [ 消息对象 ] }',
  },
  {
    action: 'get_friend_msg_history',
    group: 'message',
    title: '获取私聊消息历史',
    description: '获取与指定用户的历史私聊消息记录。',
    params: [
      USER_ID('目标 QQ 号'),
      { name: 'message_seq', type: 'number', required: false, description: '起始消息序号' },
      { name: 'count', type: 'number', required: false, description: '获取的消息条数' },
      {
        name: 'reverse_order',
        type: 'boolean',
        required: false,
        description: '是否反向排序（从旧到新）',
      },
    ],
    extension: true,
    returns: '{ messages: [ 消息对象 ] }',
  },
  {
    action: 'mark_msg_as_read',
    group: 'message',
    title: '标记消息已读',
    description: '将指定消息标记为已读。',
    params: [
      {
        name: 'message_id',
        type: 'number',
        required: true,
        description: '要标记为已读的消息 ID',
      },
    ],
    extension: true,
  },
  {
    action: 'send_like',
    group: 'message',
    title: '好友点赞',
    description: '给指定 QQ 用户的名片点赞。',
    params: [
      USER_ID('要点赞的 QQ 号'),
      {
        name: 'times',
        type: 'number',
        required: false,
        default: 1,
        minimum: 1,
        maximum: 10,
        description: '点赞次数，默认 1（每个好友每天上限 10 次）',
      },
    ],
    returns: '无返回数据',
  },
  {
    action: 'send_group_sign',
    group: 'message',
    title: '群签到',
    description: '在指定群完成签到打卡。',
    params: [GROUP_ID()],
    extension: true,
  },
  {
    action: 'set_msg_emoji_like',
    group: 'message',
    title: '消息表情回应',
    description: '给指定消息添加或取消表情回应（贴表情）。',
    params: [
      MESSAGE_ID(),
      {
        name: 'emoji_id',
        type: 'number',
        required: true,
        description: '表情 ID，如 128077（点赞）、128516（笑脸）等',
      },
      {
        name: 'set',
        type: 'boolean',
        required: false,
        default: true,
        description: 'true 添加回应，false 取消回应',
      },
    ],
    extension: true,
  },
]

// ---------- 信息查询 ----------
const QUERY_ACTIONS: ActionDef[] = [
  {
    action: 'get_login_info',
    group: 'query',
    title: '获取登录号信息',
    description: '获取机器人自身登录的 QQ 号与昵称。',
    params: [],
    returns: '{ user_id: 机器人 QQ 号, nickname: 昵称 }',
  },
  {
    action: 'get_stranger_info',
    group: 'query',
    title: '获取陌生人信息',
    description: '获取指定 QQ 用户的公开资料（昵称、性别、年龄）。',
    params: [USER_ID('要查询的 QQ 号'), NO_CACHE()],
    returns: '{ user_id, nickname, sex, age }',
  },
  {
    action: 'get_friend_list',
    group: 'query',
    title: '获取好友列表',
    description: '获取机器人全部好友列表。返回数据可能较长。',
    params: [],
    returns: '[ { user_id, nickname, remark } ]',
  },
  {
    action: 'get_unidirectional_friend_list',
    group: 'query',
    title: '获取单向好友列表',
    description: '获取机器人单向好友（机器人加了对方但对方未加机器人）列表。',
    params: [],
    extension: true,
    returns: '[ { user_id, nickname, source } ]',
  },
  {
    action: 'get_group_info',
    group: 'query',
    title: '获取群信息',
    description: '获取指定群的基本信息，如群名称、成员数上限。',
    params: [GROUP_ID(), NO_CACHE()],
    returns: '{ group_id, group_name, member_count, max_member_count }',
  },
  {
    action: 'get_group_list',
    group: 'query',
    title: '获取群列表',
    description: '获取机器人加入的全部群列表。',
    params: [],
    returns: '[ { group_id, group_name, member_count, max_member_count } ]',
  },
  {
    action: 'get_group_member_info',
    group: 'query',
    title: '获取群成员信息',
    description: '获取指定群成员的详细信息，包含群名片、角色、入群时间、禁言状态等。',
    params: [GROUP_ID(), USER_ID('要查询的群成员 QQ 号'), NO_CACHE()],
    returns:
      '{ group_id, user_id, nickname, card, sex, age, area, level, role, title, title_expire_time, card_changeable, unfriendly, join_time, last_sent_time }',
  },
  {
    action: 'get_group_member_list',
    group: 'query',
    title: '获取群成员列表',
    description: '获取指定群的全部成员列表。返回数据量较大，请谨慎使用。',
    params: [GROUP_ID()],
    returns: '[ { user_id, nickname, card, role, join_time, last_sent_time } ]',
  },
  {
    action: 'get_group_honor_info',
    group: 'query',
    title: '获取群荣誉信息',
    description: '获取群荣誉信息，如龙王、群聊之火、群聊炽焰等。',
    params: [
      GROUP_ID(),
      {
        name: 'type',
        type: 'string',
        required: false,
        default: 'all',
        enum: ['all', 'talkative', 'performer', 'legend', 'strong_newbie', 'emotion'],
        description:
          '荣誉类型：all 全部 / talkative 龙王 / performer 群聊之火 / legend 群聊炽焰 / strong_newbie 冒尖小萌新 / emotion 快乐之源',
      },
    ],
    returns:
      '{ current_talkative, talkative_list, performer_list, legend_list, strong_newbie_list, emotion_list }',
  },
  {
    action: 'get_group_system_msg',
    group: 'query',
    title: '获取群系统消息',
    description: '获取群系统消息，即待处理的加群邀请与加群申请列表。',
    params: [],
    extension: true,
    returns: '{ invited_requests: [...], join_requests: [...] }',
  },
  {
    action: 'get_essence_msg_list',
    group: 'query',
    title: '获取群精华消息列表',
    description: '获取指定群的精华消息列表。',
    params: [GROUP_ID()],
    extension: true,
    returns: '[ { message_id, sender_id, sender_nick, operator_id, operator_time } ]',
  },
  {
    action: 'get_group_at_all_remain',
    group: 'query',
    title: '获取群 @全体成员 剩余次数',
    description: '查询当前群与当前账号剩余的 @全体成员 次数。',
    params: [GROUP_ID()],
    extension: true,
    returns: '{ can_at_all, remain_at_all_count_for_group, remain_at_all_count_for_uin }',
  },
  {
    action: 'get_online_clients',
    group: 'query',
    title: '获取在线客户端',
    description: '获取当前账号的在线客户端设备列表。',
    params: [NO_CACHE()],
    extension: true,
    returns: '{ clients: [ { app_id, device_name, device_kind } ] }',
  },
  {
    action: 'get_group_notice',
    group: 'query',
    title: '获取群公告',
    description: '获取指定群的群公告列表。',
    params: [GROUP_ID()],
    // NapCat / go-cqhttp 只认带下划线前缀的接口名
    callAs: '_get_group_notice',
    aliases: ['_get_group_notice'],
    extension: true,
    returns: '[ { sender_id, publish_time, message: { text, images } } ]',
  },
]

// ---------- 群聊管理 ----------
const GROUP_ACTIONS: ActionDef[] = [
  {
    action: 'set_group_kick',
    group: 'group',
    title: '群组踢人',
    description: '将指定成员移出群聊。需要机器人具备管理员权限。这是不可逆操作。',
    params: [
      GROUP_ID(),
      USER_ID('要踢出的成员 QQ 号'),
      {
        name: 'reject_add_request',
        type: 'boolean',
        required: false,
        default: false,
        description: '是否同时拒绝该成员待处理的加群申请',
      },
    ],
    danger: true,
  },
  {
    action: 'set_group_ban',
    group: 'group',
    title: '群组禁言',
    description: '禁言指定群成员。duration 为 0 时表示解除禁言。需要机器人具备管理员权限。',
    params: [
      GROUP_ID(),
      USER_ID('要禁言的成员 QQ 号'),
      {
        name: 'duration',
        type: 'number',
        required: false,
        default: 1800,
        description: '禁言时长（秒），默认 1800（30 分钟）。0 表示解除禁言',
      },
    ],
    danger: true,
  },
  {
    action: 'set_group_anonymous_ban',
    group: 'group',
    title: '群匿名用户禁言',
    description:
      '禁言群内的匿名用户。需要通过 flag 指定目标（来自消息事件中的 anonymous.flag）。注意：NapCat 未实现该接口。',
    params: [
      GROUP_ID(),
      {
        name: 'flag',
        type: 'string',
        required: true,
        description: '匿名用户标识（来自消息事件中的 anonymous_flag 或 flag 字段）',
      },
      {
        name: 'duration',
        type: 'number',
        required: false,
        default: 1800,
        description: '禁言时长（秒），默认 1800（30 分钟）。注意匿名禁言无法解除',
      },
    ],
    // 规范同时接受 anonymous_flag 作为 flag 的别名
    paramAliases: { anonymous_flag: 'flag' },
    danger: true,
  },
  {
    action: 'set_group_whole_ban',
    group: 'group',
    title: '全体禁言',
    description: '开启或关闭群全体禁言。需要机器人具备管理员权限。',
    params: [
      GROUP_ID(),
      {
        name: 'enable',
        type: 'boolean',
        required: false,
        default: true,
        description: 'true 开启全体禁言，false 关闭全体禁言',
      },
    ],
    danger: true,
  },
  {
    action: 'set_group_admin',
    group: 'group',
    title: '设置群管理员',
    description: '设置或取消指定成员的群管理员身份。需要机器人是群主。',
    params: [
      GROUP_ID(),
      USER_ID('目标成员 QQ 号'),
      {
        name: 'enable',
        type: 'boolean',
        required: false,
        default: true,
        description: 'true 设为管理员，false 取消管理员',
      },
    ],
    danger: true,
  },
  {
    action: 'set_group_anonymous',
    group: 'group',
    title: '群匿名聊天开关',
    description: '开启或关闭群匿名聊天功能。注意：NapCat 未实现该接口。',
    params: [
      GROUP_ID(),
      {
        name: 'enable',
        type: 'boolean',
        required: false,
        default: true,
        description: 'true 开启匿名聊天，false 关闭',
      },
    ],
    danger: true,
  },
  {
    action: 'set_group_card',
    group: 'group',
    title: '设置群名片',
    description: '设置指定成员在本群的名片。card 留空表示清除名片。',
    params: [
      GROUP_ID(),
      USER_ID('目标成员 QQ 号'),
      {
        name: 'card',
        type: 'string',
        required: false,
        default: '',
        description: '群名片内容，留空表示清除名片',
      },
    ],
  },
  {
    action: 'set_group_name',
    group: 'group',
    title: '设置群名称',
    description: '修改群名称。需要机器人是群主或具备相应权限。',
    params: [
      GROUP_ID(),
      { name: 'group_name', type: 'string', required: true, description: '新的群名称' },
    ],
    danger: true,
  },
  {
    action: 'set_group_leave',
    group: 'group',
    title: '退出群聊',
    description:
      '让机器人退出指定群聊。is_dismiss 为 true 时会解散该群（仅群主可用，且不可逆）。',
    params: [
      GROUP_ID(),
      {
        name: 'is_dismiss',
        type: 'boolean',
        required: false,
        default: false,
        description: '是否解散该群（仅当机器人是群主时有效）',
      },
    ],
    danger: true,
  },
  {
    action: 'set_group_special_title',
    group: 'group',
    title: '设置群专属头衔',
    description: '设置指定成员的群专属头衔。需要机器人是群主。',
    params: [
      GROUP_ID(),
      USER_ID('目标成员 QQ 号'),
      {
        name: 'special_title',
        type: 'string',
        required: false,
        default: '',
        description: '头衔内容，留空表示取消头衔',
      },
      {
        name: 'duration',
        type: 'number',
        required: false,
        default: -1,
        description: '有效期（秒），-1 表示永久（规范注明该参数可能无效）',
      },
    ],
  },
  {
    action: 'set_group_portrait',
    group: 'group',
    title: '设置群头像',
    description: '设置群聊头像。file 支持本地绝对路径、file:// URL、http(s) URL 或 base64。',
    params: [
      GROUP_ID(),
      {
        name: 'file',
        type: 'string',
        required: true,
        description: '头像图片：本地绝对路径、file:// URL、http(s) URL 或 base64:// 数据',
      },
      {
        name: 'cache',
        type: 'number',
        required: false,
        default: 1,
        description: '使用 URL 时是否使用缓存：1 使用，0 不使用',
      },
    ],
    danger: true,
    extension: true,
  },
  {
    action: 'set_essence_msg',
    group: 'group',
    title: '设置精华消息',
    description: '将指定消息设置为群精华消息。需要机器人具备管理员权限。',
    params: [MESSAGE_ID()],
    extension: true,
  },
  {
    action: 'delete_essence_msg',
    group: 'group',
    title: '移出精华消息',
    description: '将指定消息移出群精华。需要机器人具备管理员权限。',
    params: [MESSAGE_ID()],
    extension: true,
  },
  {
    action: 'send_group_notice',
    group: 'group',
    title: '发送群公告',
    description: '在指定群发送群公告。需要机器人具备管理员权限。',
    params: [
      GROUP_ID(),
      { name: 'content', type: 'string', required: true, description: '公告内容' },
      {
        name: 'image',
        type: 'string',
        required: false,
        description: '公告附带的图片地址或本地路径（可选）',
      },
    ],
    callAs: '_send_group_notice',
    aliases: ['_send_group_notice'],
    extension: true,
  },
  {
    action: 'delete_group_notice',
    group: 'group',
    title: '删除群公告',
    description:
      '删除指定群公告。注意：NapCat 使用 _del_group_notice，LLBot / go-cqhttp 使用 _delete_group_notice，两种命名都会尝试。',
    params: [
      GROUP_ID(),
      { name: 'notice_id', type: 'string', required: true, description: '群公告 ID' },
    ],
    callAs: '_del_group_notice',
    aliases: ['_delete_group_notice'],
    danger: true,
    extension: true,
  },
]

// ---------- 好友与请求 ----------
const FRIEND_ACTIONS: ActionDef[] = [
  {
    action: 'set_friend_add_request',
    group: 'friend',
    title: '处理好友添加请求',
    description: '同意或拒绝好友添加请求。flag 来自好友请求事件。',
    params: [
      {
        name: 'flag',
        type: 'string',
        required: true,
        description: '好友请求标识（来自好友请求事件的 flag 字段）',
      },
      {
        name: 'approve',
        type: 'boolean',
        required: false,
        default: true,
        description: 'true 同意，false 拒绝',
      },
      { name: 'remark', type: 'string', required: false, description: '同意后的好友备注' },
    ],
  },
  {
    action: 'set_group_add_request',
    group: 'friend',
    title: '处理加群请求',
    description:
      '同意或拒绝加群申请或邀请入群。flag 与 sub_type 来自群请求事件；sub_type 必须与事件中的值一致。',
    params: [
      {
        name: 'flag',
        type: 'string',
        required: true,
        description: '加群请求标识（来自群请求事件的 flag 字段）',
      },
      {
        name: 'sub_type',
        type: 'string',
        required: true,
        enum: ['add', 'invite'],
        description:
          '请求类型：add 加群申请 / invite 邀请入群。必须与事件中的 sub_type 完全一致，否则协议端会拒绝',
      },
      {
        name: 'approve',
        type: 'boolean',
        required: false,
        default: true,
        description: 'true 同意，false 拒绝',
      },
      { name: 'reason', type: 'string', required: false, description: '拒绝理由（拒绝时填写）' },
    ],
    // 部分实现使用 type 而非 sub_type
    paramAliases: { type: 'sub_type' },
  },
  {
    action: 'delete_friend',
    group: 'friend',
    title: '删除好友',
    description: '删除指定好友。这是不可逆操作。',
    params: [USER_ID('要删除的好友 QQ 号')],
    danger: true,
    extension: true,
  },
  {
    action: 'delete_unidirectional_friend',
    group: 'friend',
    title: '删除单向好友',
    description:
      '删除指定单向好友。这是不可逆操作。注意：仅 go-cqhttp 系实现支持，NapCat 未实现。',
    params: [USER_ID('要删除的单向好友 QQ 号')],
    danger: true,
    extension: true,
  },
]

// ---------- 文件媒体 ----------
const FILE_ACTIONS: ActionDef[] = [
  {
    action: 'get_group_file_system_info',
    group: 'file',
    title: '获取群文件系统信息',
    description: '获取指定群的文件系统信息，如文件总数、已用空间与总空间。',
    params: [GROUP_ID()],
    extension: true,
    returns: '{ file_count, limit_count, used_space, total_space }',
  },
  {
    action: 'get_group_root_files',
    group: 'file',
    title: '获取群根目录文件列表',
    description: '获取指定群根目录下的文件与文件夹列表。',
    params: [GROUP_ID()],
    extension: true,
    returns: '{ files: [ 文件对象 ], folders: [ 文件夹对象 ] }',
  },
  {
    action: 'get_group_files_by_folder',
    group: 'file',
    title: '获取群子目录文件列表',
    description: '获取指定群某个文件夹下的文件与子文件夹列表。',
    params: [
      GROUP_ID(),
      {
        name: 'folder_id',
        type: 'string',
        required: true,
        description: '文件夹 ID（来自群文件列表的 folder_id）',
      },
    ],
    extension: true,
    returns: '{ files: [ 文件对象 ], folders: [ 文件夹对象 ] }',
  },
  {
    action: 'get_group_file_url',
    group: 'file',
    title: '获取群文件下载链接',
    description: '获取指定群文件的下载链接。',
    params: [
      GROUP_ID(),
      { name: 'file_id', type: 'string', required: true, description: '文件 ID' },
      {
        name: 'busid',
        type: 'number',
        required: false,
        default: 102,
        description: '文件业务 ID，通常为 102',
      },
    ],
    extension: true,
    returns: '{ url: 下载链接 }',
  },  {
    action: 'upload_group_file',
    group: 'file',
    title: '上传群文件',
    description:
      '向指定群上传文件。需要机器人具备管理员权限。file 支持本地绝对路径、file:// URL 或 http(s) URL。',
    params: [
      GROUP_ID(),
      {
        name: 'file',
        type: 'string',
        required: true,
        description: '要上传的文件：本地绝对路径、file:// URL 或 http(s) URL',
      },
      { name: 'name', type: 'string', required: true, description: '上传后的文件名' },
      {
        name: 'folder',
        type: 'string',
        required: false,
        description: '目标文件夹 ID，留空表示上传到根目录',
      },
    ],
    paramAliases: { folder_id: 'folder' },
    extension: true,
    returns: '{ file_id }',
  },
  {
    action: 'upload_private_file',
    group: 'file',
    title: '上传私聊文件',
    description: '向指定用户发送文件。file 支持本地绝对路径、file:// URL 或 http(s) URL。',
    params: [
      USER_ID('目标 QQ 号'),
      {
        name: 'file',
        type: 'string',
        required: true,
        description: '要发送的文件：本地绝对路径、file:// URL 或 http(s) URL',
      },
      { name: 'name', type: 'string', required: true, description: '展示的文件名' },
    ],
    extension: true,
  },
  {
    action: 'create_group_file_folder',
    group: 'file',
    title: '创建群文件夹',
    description:
      '在指定群创建文件夹。需要机器人具备管理员权限。注意：各实现均只支持在根目录创建，parent_id 只能传 /。',
    params: [
      GROUP_ID(),
      { name: 'name', type: 'string', required: true, description: '文件夹名称' },
      {
        name: 'parent_id',
        type: 'string',
        required: false,
        default: '/',
        description: '父文件夹 ID，仅支持 "/"（根目录）',
      },
    ],
    extension: true,
  },
  {
    action: 'delete_group_folder',
    group: 'file',
    title: '删除群文件夹',
    description: '删除指定群文件夹。这是不可逆操作。需要机器人具备管理员权限。',
    params: [
      GROUP_ID(),
      { name: 'folder_id', type: 'string', required: true, description: '要删除的文件夹 ID' },
    ],
    danger: true,
    extension: true,
  },
  {
    action: 'delete_group_file',
    group: 'file',
    title: '删除群文件',
    description: '删除指定群文件。这是不可逆操作。需要机器人具备管理员权限。',
    params: [
      GROUP_ID(),
      { name: 'file_id', type: 'string', required: true, description: '要删除的文件 ID' },
      {
        name: 'busid',
        type: 'number',
        required: false,
        default: 102,
        description: '文件业务 ID，通常为 102',
      },
    ],
    danger: true,
    extension: true,
  },
  {
    action: 'move_group_file',
    group: 'file',
    title: '移动群文件',
    description: '将群文件移动到其他目录。需要机器人具备管理员权限。',
    params: [
      GROUP_ID(),
      { name: 'file_id', type: 'string', required: true, description: '要移动的文件 ID' },
      {
        name: 'current_parent_directory',
        type: 'string',
        required: true,
        description: '文件当前所在目录 ID',
      },
      {
        name: 'target_parent_directory',
        type: 'string',
        required: true,
        description: '目标目录 ID',
      },
    ],
    extension: true,
  },
  {
    action: 'rename_group_file_folder',
    group: 'file',
    title: '重命名群文件夹',
    description: '重命名指定群文件夹。需要机器人具备管理员权限。',
    params: [
      GROUP_ID(),
      { name: 'folder_id', type: 'string', required: true, description: '文件夹 ID' },
      { name: 'new_folder_name', type: 'string', required: true, description: '新的文件夹名称' },
    ],
    extension: true,
  },
  {
    action: 'get_image',
    group: 'file',
    title: '获取图片文件',
    description: '获取图片文件的本地路径信息。',
    params: [
      {
        name: 'file',
        type: 'string',
        required: true,
        description: '图片文件名（来自消息中的图片段 file 字段）',
      },
    ],
    returns: '{ file: 本地文件路径 }',
  },
  {
    action: 'get_record',
    group: 'file',
    title: '获取语音文件',
    description: '将收到的语音消息转换为指定格式并返回文件路径（通常需要协议端安装 ffmpeg）。',
    params: [
      {
        name: 'file',
        type: 'string',
        required: true,
        description: '语音文件名（来自消息中的语音段 file 字段）',
      },
      {
        name: 'out_format',
        type: 'string',
        required: true,
        enum: ['mp3', 'amr', 'wma', 'm4a', 'spx', 'ogg', 'wav', 'flac'],
        description: '输出格式',
      },
    ],
    returns: '{ file: 转换后的文件路径 }',
  },
  {
    action: 'can_send_image',
    group: 'file',
    title: '检查能否发送图片',
    description: '检查当前协议端是否支持发送图片。',
    params: [],
    returns: '{ yes: true/false }',
  },
  {
    action: 'can_send_record',
    group: 'file',
    title: '检查能否发送语音',
    description: '检查当前协议端是否支持发送语音。',
    params: [],
    returns: '{ yes: true/false }',
  },
  {
    action: 'ocr_image',
    group: 'file',
    title: '图片 OCR 文字识别',
    description:
      '对图片进行文字识别（OCR）。注意：NapCat 仅在 Windows 平台实现该接口。',
    params: [
      {
        name: 'image',
        type: 'string',
        required: true,
        description: '图片路径、图片 ID 或公开可访问的图片 URL',
      },
    ],
    extension: true,
    returns: '{ language, texts: [ { text, confidence, coordinates } ] }',
  },
  {
    action: 'download_file',
    group: 'file',
    title: '下载文件到协议端',
    description:
      '让协议端下载指定文件到本地，返回本地路径。url 与 base64 至少提供一个。需要机器人具备管理员权限。',
    params: [
      { name: 'url', type: 'string', required: false, description: '要下载的文件 URL' },
      { name: 'base64', type: 'string', required: false, description: 'base64 编码的文件内容' },
      { name: 'name', type: 'string', required: false, description: '保存的文件名' },
      {
        name: 'headers',
        type: 'string',
        required: false,
        description: '请求头，可传单个字符串或以换行分隔的多个请求头，如 "User-Agent: xxx"',
      },
    ],
    requiredAny: [['url'], ['base64']],
    danger: true,
    extension: true,
    returns: '{ file: 本地文件路径 }',
  },
  {
    action: 'trans_group_file',
    group: 'file',
    title: '转发群文件',
    description: '将群文件转发到其他群。注意：各实现仅支持 group_id 与 file_id 两个参数。',
    params: [
      GROUP_ID(),
      { name: 'file_id', type: 'string', required: true, description: '要转发的文件 ID' },
    ],
    extension: true,
    returns: '{ ok: true/false }',
  },
]

// ---------- 系统维护 ----------
const SYSTEM_ACTIONS: ActionDef[] = [
  {
    action: 'get_status',
    group: 'system',
    title: '获取运行状态',
    description: '获取协议端（OneBot 实现）的当前运行状态与统计信息。',
    params: [],
    returns: '{ online, good, ...实现相关字段 }',
  },
  {
    action: 'get_version_info',
    group: 'system',
    title: '获取版本信息',
    description: '获取协议端（OneBot 实现）的版本信息，可用于判断当前使用的框架。',
    params: [],
    returns: '{ app_name, app_version, protocol_version, ...实现相关字段 }',
  },
  {
    action: 'get_cookies',
    group: 'system',
    title: '获取 Cookies',
    description: '获取协议端登录账号的 Cookies。属于敏感凭据，请勿泄露给无关人员。',
    params: [
      { name: 'domain', type: 'string', required: false, description: '指定域名，如 qq.com' },
    ],
    danger: true,
    returns: '{ cookies: Cookie 文本 }',
  },
  {
    action: 'get_csrf_token',
    group: 'system',
    title: '获取 CSRF Token',
    description: '获取协议端的 CSRF Token。属于敏感凭据。',
    params: [],
    danger: true,
    returns: '{ token }',
  },
  {
    action: 'get_credentials',
    group: 'system',
    title: '获取登录凭据',
    description: '获取协议端的 Cookies 与 CSRF Token。属于敏感凭据。',
    params: [
      { name: 'domain', type: 'string', required: false, description: '指定域名，如 qq.com' },
    ],
    danger: true,
    returns: '{ cookies, csrf_token }',
  },
  {
    action: 'clean_cache',
    group: 'system',
    title: '清理缓存',
    description: '清理协议端缓存。',
    params: [],
    danger: true,
  },
  {
    action: 'set_restart',
    group: 'system',
    title: '重启协议端',
    description: '重启协议端（OneBot 实现）。会导致机器人短暂离线，该操作始终为异步。',
    params: [
      {
        name: 'delay',
        type: 'number',
        required: false,
        default: 0,
        description: '延迟多少毫秒后重启',
      },
    ],
    danger: true,
  },
  {
    action: 'reload_event_filter',
    group: 'system',
    title: '重载事件过滤器',
    description: '重载协议端的事件过滤器配置。注意：仅 go-cqhttp 系实现支持。',
    params: [
      { name: 'file', type: 'string', required: false, description: '过滤器配置内容' },
    ],
    danger: true,
    extension: true,
  },
  {
    action: 'set_qq_profile',
    group: 'system',
    title: '设置账号资料',
    description: '修改机器人账号的昵称、公司、邮箱、学校、个性签名等资料。',
    params: [
      { name: 'nickname', type: 'string', required: false, description: '昵称' },
      { name: 'company', type: 'string', required: false, description: '公司' },
      { name: 'email', type: 'string', required: false, description: '邮箱' },
      { name: 'college', type: 'string', required: false, description: '学校' },
      { name: 'personal_note', type: 'string', required: false, description: '个性签名' },
    ],
    danger: true,
    extension: true,
  },
  {
    action: 'set_qq_avatar',
    group: 'system',
    title: '设置账号头像',
    description: '修改机器人账号头像。file 支持本地绝对路径、file:// URL 或 base64。',
    params: [
      {
        name: 'file',
        type: 'string',
        required: true,
        description: '头像图片：本地绝对路径、file:// URL 或 base64:// 数据',
      },
    ],
    danger: true,
    extension: true,
  },
  {
    action: 'set_online_status',
    group: 'system',
    title: '设置在线状态',
    description: '设置机器人账号的在线状态。',
    params: [
      {
        name: 'status',
        type: 'number',
        required: true,
        description: '在线状态值（如 10 在线、30 离开、40 隐身、50 忙碌、60 勿扰）',
      },
      { name: 'ext_status', type: 'number', required: false, description: '扩展状态' },
      { name: 'battery_status', type: 'number', required: false, description: '电量状态' },
    ],
    danger: true,
    extension: true,
  },
  {
    action: '.handle_quick_operation',
    group: 'system',
    title: '快速操作（隐藏接口）',
    description:
      'OneBot v11 隐藏接口。对某个事件一次性执行快捷操作，例如同时「禁言并回复」。该接口面向框架实现，普通场景请优先使用语义明确的具体接口。',
    params: [
      {
        name: 'context',
        type: 'object',
        required: true,
        description: '事件对象（可裁剪，如去掉 message 字段），通常来自消息事件',
      },
      {
        name: 'operation',
        type: 'object',
        required: true,
        description:
          '要执行的操作，如 {"ban": true, "reply": "请不要说脏话"}；ban 为 true 时禁言，reply 为回复内容',
      },
    ],
    danger: true,
  },
]

// 全量接口清单
export const ACTIONS: ActionDef[] = [
  ...MESSAGE_ACTIONS,
  ...QUERY_ACTIONS,
  ...GROUP_ACTIONS,
  ...FRIEND_ACTIONS,
  ...FILE_ACTIONS,
  ...SYSTEM_ACTIONS,
]

// 按 action 名索引
export const ACTION_MAP: Map<string, ActionDef> = new Map(ACTIONS.map((a) => [a.action, a]))

// 标准接口数量 / 扩展接口数量（用于日志说明）
export const STANDARD_COUNT = ACTIONS.filter((a) => !a.extension).length
export const EXTENSION_COUNT = ACTIONS.filter((a) => a.extension).length

// 开发期自检：接口名重复会导致 ACTION_MAP 静默丢项、工具名冲突互相覆盖。
// 在模块加载时直接抛错，避免带着错误配置上线。
{
  const seen = new Set<string>()
  const duplicated = new Set<string>()
  const toolNames = new Set<string>()
  const collided = new Set<string>()

  for (const def of ACTIONS) {
    if (seen.has(def.action)) duplicated.add(def.action)
    seen.add(def.action)

    // 工具名会去掉前导的 . 或 _，因此不同接口名可能映射到同一个工具名
    const tool = def.action.replace(/^[._]/, '')
    if (toolNames.has(tool)) collided.add(tool)
    toolNames.add(tool)
  }

  if (duplicated.size) {
    throw new Error(`[QQ工具集] 接口名重复：${[...duplicated].join('、')}`)
  }
  if (collided.size) {
    throw new Error(`[QQ工具集] 工具名冲突（去掉前导 . / _ 后重名）：${[...collided].join('、')}`)
  }
}
