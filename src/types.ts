// ============ QQ工具集 - 类型定义 ============

// 功能分组
export type GroupKey = 'message' | 'query' | 'group' | 'friend' | 'file' | 'system'

// 分组元信息
export interface GroupMeta {
  key: GroupKey
  label: string
  description: string
}

// 参数类型（映射到 JSON Schema）
// 'message' 是 OneBot 的 message 类型：规范允许「CQ 码字符串」或「消息段数组/对象」三种形态，
// 因此单列一种类型，便于 schema 与参数转换做针对性处理。
export type ParamType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'message'

// 单个接口参数定义
export interface ActionParam {
  // OneBot 参数名（snake_case）
  name: string
  type: ParamType
  // 是否必填（对模型暴露的必填性）
  required?: boolean
  // 参数说明（会写进 JSON Schema 的 description，供模型理解）
  description: string
  // 枚举可选值
  enum?: string[]
  // 数组元素类型
  items?: { type: ParamType }
  // 数值范围
  minimum?: number
  maximum?: number
  // 默认值（调用时若模型未提供则填入）
  default?: any
  // 该参数可由当前会话自动推断（如 group_id / user_id）
  autoFill?: 'group' | 'user'
}

// 一个 OneBot 接口的完整定义
export interface ActionDef {
  // OneBot action 名（snake_case）
  action: string
  group: GroupKey
  // 中文短名，用于日志与展示
  title: string
  // 暴露给模型的工具描述
  description: string
  params: ActionParam[]
  // 危险操作：默认不注册，需显式开启
  danger?: boolean
  // camelCase 回退调用时的位置参数顺序（对应适配器 internal 方法的入参）
  args?: string[]
  // 部分框架的 action 别名，标准名失败后依次尝试
  aliases?: string[]
  // 实际发送给协议端的 action 名（默认等于 action）。
  // 用于「工具名保持整洁、但协议端只认带下划线前缀的接口名」的情况，
  // 例如 NapCat 的 _send_group_notice / _get_group_notice / _del_group_notice。
  callAs?: string
  // 备选必填组：满足其中任意一组即可，如 [['id', 'message_id']]
  requiredAny?: string[][]
  // 参数别名：模型给出 alias 时，若目标参数缺失则用它填充。
  // 用于兼容不同框架对同一语义参数的不同命名（如 id / message_id、type / sub_type）。
  paramAliases?: Record<string, string>
  // 返回数据说明（写进工具描述，帮助模型理解返回值）
  returns?: string
  // 该接口不返回数据、且「协议端没报错」并不代表操作真正生效时，填写可用于
  // 验证的接口名。调用无返回时会提示模型改用该接口确认，避免模型把
  // 「retcode 为 0」误当成「操作成功」。
  // 例：群签到（NapCat 的 GroupSign 返回 void，静默失败也无从得知）。
  verifyWith?: string
  // 该接口属于 go-cqhttp 扩展层（非 OneBot v11 标准），仅在支持的框架上可用
  extension?: boolean
}

// 解析后的调用参数
export type ActionArgs = Record<string, any>
