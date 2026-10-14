// ============ QQ工具集 - 分组常量 ============

import { GroupMeta } from './types'

// 功能分组定义（顺序即注册顺序）
export const GROUPS: GroupMeta[] = [
  {
    key: 'message',
    label: '消息操作',
    description: '发送私聊/群聊消息、撤回消息、获取消息详情、合并转发、群签到、点赞等',
  },
  {
    key: 'query',
    label: '信息查询',
    description: '获取登录号信息、陌生人信息、好友列表、群信息、群成员信息、群荣誉等',
  },
  {
    key: 'group',
    label: '群聊管理',
    description: '禁言、踢人、设置管理员、改群名片/群名/头衔、全体禁言、退群、精华消息等',
  },
  {
    key: 'friend',
    label: '好友与请求',
    description: '处理好友申请与入群申请、删除好友、获取单向好友列表等',
  },
  {
    key: 'file',
    label: '文件媒体',
    description: '群文件系统、上传/删除群文件与目录、获取图片与语音文件、OCR 等',
  },
  {
    key: 'system',
    label: '系统维护',
    description: '运行状态、版本信息、Cookies/CSRF、清理缓存、重启协议端等',
  },
]

// 工具返回结果的字符数上限。
//
// 不做成配置项：仅作为保护，避免 get_group_member_list 这类接口把上百 KB 的
// JSON 塞进模型上下文导致对话直接不可用。正常接口的返回远小于此值。
export const MAX_RESULT_LENGTH = 4000
