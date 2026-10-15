// ============ QQ工具集 - ChatLuna 工具实现 ============

import { Context, Session } from 'koishi'
import { ActionArgs, ActionDef } from './types'
import { callOneBot, coerceArgs } from './onebot'
import { LangChainRuntime } from './deps'

// 工具名统一前缀，便于在 ChatLuna 工具列表中识别
export const TOOL_PREFIX = 'onebot_'

// 工具名长度上限（部分模型对 function name 有长度限制）
const MAX_TOOL_NAME = 64

export function toolName(action: string): string {
  const name = TOOL_PREFIX + action.replace(/^[._]/, '')
  return name.length <= MAX_TOOL_NAME ? name : name.slice(0, MAX_TOOL_NAME)
}

// 参数 -> zod 类型。
//
// 这里刻意放宽为「数字或字符串」等联合类型，原因有两点：
//   1. 大模型经常把数字/布尔写成字符串，严格类型会导致 LangChain 在进入 func 之前
//      就抛出校验错误，我们就失去了纠正的机会；
//   2. NapCat / LLBot 对同一参数的类型声明并不统一（规范说 number，实现常用 string）。
// 真正的类型纠正由 onebot.ts 的 coerceArgs 完成。
function zodType(z: any, p: ActionDef['params'][number]): any {
  if (p.enum && p.enum.length) {
    return z.enum(p.enum as [string, ...string[]])
  }
  switch (p.type) {
    case 'number':
    case 'integer':
      return z.union([z.number(), z.string()])
    case 'boolean':
      return z.union([z.boolean(), z.string()])
    case 'array':
      return z.union([z.array(z.any()), z.string()])
    case 'object':
      return z.union([z.record(z.any()), z.string()])
    case 'message':
      // OneBot 的 message 类型：字符串（CQ 码）或消息段数组/对象
      return z.union([z.string(), z.array(z.any()), z.record(z.any())])
    default:
      // 字符串参数同样放宽接受数字：群号、QQ 号这类「按字符串发送」的参数
      // （如 NapCat 群签到要求 group_id 为 string），模型几乎总是给数字，
      // 若在此处拒绝，coerceArgs 的转换逻辑就永远没有机会执行。
      return z.union([z.string(), z.number()])
  }
}

// 把接口定义转换为 zod 对象 schema。
//
// 必须使用 zod v3 对象（而不是普通 JSON Schema）：ChatLuna 的 ReAct 渲染器会对
// tool.schema 直接调用 zodToJsonSchema，传入普通 JSON Schema 会导致 ReAct 模式下
// 参数说明渲染异常。这里传入的 z 正是 ChatLuna 自己依赖的那一份（见 deps.ts），
// 因此与 ChatLuna 内部的 zod 实例一致。
export function buildSchema(def: ActionDef, z: any): any {
  const shape: Record<string, any> = {}

  // 别名对（两个方向都算）涉及到的参数名：模型可以用任一侧的名字提供该参数，
  // 因此这些参数在 schema 里必须可选，否则模型用别名传参时会在进入 func 之前
  // 就被 zod 拒绝，别名镜像逻辑永远没有机会执行。
  const aliasPairs = Object.entries(def.paramAliases ?? {})
  const aliased = new Set<string>()
  for (const [a, b] of aliasPairs) {
    aliased.add(a)
    aliased.add(b)
  }

  for (const p of def.params) {
    let field = zodType(z, p)
    // 可由会话自动推断的参数必须可选：否则模型省略群号/QQ 号时，
    // LangChain 会在进入 func 之前校验失败，自动补全逻辑就没有机会执行。
    // requiredAny 与别名参数同理：必填性改由 validateRequired 在补全后判定。
    const optional = !p.required || !!p.autoFill || !!def.requiredAny || aliased.has(p.name)
    if (optional) field = field.optional()
    shape[p.name] = field.describe(p.description)
  }

  // 补上不属于 params 的别名键，让模型无论用哪个命名都能通过校验
  for (const [a, b] of aliasPairs) {
    for (const key of [a, b]) {
      if (shape[key]) continue
      shape[key] = z
        .union([z.string(), z.number(), z.boolean()])
        .optional()
        .describe(`参数「${a === key ? b : a}」的等价别名，二者填其一即可`)
    }
  }

  return z.object(shape)
}

// 该接口声明了 verifyWith 时，返回验证提示。
// 若被指向的验证接口本身没开启，提示会变成空头支票（模型会去调用一个不存在的工具），
// 因此这里要求它确实在本次注册的工具集合中。
export function verifyHint(def: ActionDef, available?: Set<string>): string {
  if (!def.verifyWith) return ''
  const target = toolName(def.verifyWith)
  if (available && !available.has(target)) return ''
  return `如需确认，请调用 ${target} 核实。`
}

// 工具描述：接口用途 + 返回值 + 无返回接口的验证指引 + 危险操作提醒
export function buildDescription(def: ActionDef, available?: Set<string>): string {
  const parts: string[] = [def.description]
  if (def.extension) {
    parts.push('（非 OneBot v11 标准接口，属于 go-cqhttp 扩展层，部分协议端可能不支持）')
  }
  if (def.returns) parts.push(`返回：${def.returns}`)
  const hint = verifyHint(def, available)
  if (hint) {
    parts.push(`⚠️ 本接口不返回结果，协议端未报错并不等于操作真的生效。${hint}`)
  }
  if (def.danger) {
    parts.push(
      '⚠️ 此操作具有破坏性或涉及敏感信息，调用前必须确认用户确实要求执行该操作，不要擅自调用。',
    )
  }
  return parts.join('\n')
}

// 从调用参数中提取 ChatLuna 注入的会话。
//
// 之所以扫描全部参数而不是固定取第 3 个：LangChain 的 StructuredTool 子类会把
// runnable config 放在第 3 个参数，而 tool() 辅助函数包装出的工具放在第 2 个。
// 扫描可以同时兼容两种形态以及未来版本变化。
function extractSession(args: any[]): Session | undefined {
  for (const arg of args) {
    const session = arg?.configurable?.session
    if (session) return session
  }
  return undefined
}

// 会话上下文：用于参数自动补全
function sessionIds(session?: Session): { groupId?: number; userId?: number } {
  const out: { groupId?: number; userId?: number } = {}
  const guildId = (session as any)?.guildId ?? (session as any)?.channelId
  if (guildId) {
    const n = Number(String(guildId).replace(/^.*:/, ''))
    if (!isNaN(n)) out.groupId = n
  }
  const userId = (session as any)?.userId
  if (userId) {
    const n = Number(String(userId).replace(/^.*:/, ''))
    if (!isNaN(n)) out.userId = n
  }
  return out
}

// 补全可自动推断的参数（群号 / QQ 号），仅在模型未提供时生效
function applyAutoFill(def: ActionDef, args: ActionArgs, session?: Session): ActionArgs {
  const ids = sessionIds(session)
  // 记录模型「显式」给出的参数：自动补全不能改变模型的意图，
  // 下面的 send_msg 推断必须只看显式参数。
  const explicit: ActionArgs = { ...args }

  // send_msg 特殊处理：message_type 决定实际发往哪里。
  // 群聊里给某人发私聊时，若先自动补全 group_id 再推断类型，会被误判成群消息，
  // 因此这里先按「显式参数 → 会话上下文」的顺序定类型，再只补该类型需要的 ID。
  if (def.action === 'send_msg') {
    if (args.message_type === undefined) {
      if (explicit.group_id !== undefined) args.message_type = 'group'
      else if (explicit.user_id !== undefined) args.message_type = 'private'
      else if (ids.groupId !== undefined) args.message_type = 'group'
      else if (ids.userId !== undefined) args.message_type = 'private'
    }

    if (args.message_type === 'private') {
      if (args.user_id === undefined) args.user_id = explicit.user_id ?? ids.userId
      // 同时带上两个 ID 会让协议端行为不确定，按类型只保留一个
      delete args.group_id
    } else if (args.message_type === 'group') {
      if (args.group_id === undefined) args.group_id = explicit.group_id ?? ids.groupId
      delete args.user_id
    }
    return args
  }

  for (const p of def.params) {
    if (args[p.name] !== undefined) continue
    if (p.autoFill === 'group' && ids.groupId !== undefined) args[p.name] = ids.groupId
    else if (p.autoFill === 'user' && ids.userId !== undefined) args[p.name] = ids.userId
  }
  return args
}

// 必填校验（在自动补全之后执行）。返回错误说明，通过则返回 null。
function validateRequired(def: ActionDef, args: ActionArgs): string | null {
  // send_msg 的 group_id / user_id 是条件必填，取决于最终推断出的 message_type
  if (def.action === 'send_msg') {
    if (args.message_type === 'private' && args.user_id === undefined) {
      return 'message_type 为 private 时必须提供 user_id'
    }
    if (args.message_type === 'group' && args.group_id === undefined) {
      return 'message_type 为 group 时必须提供 group_id'
    }
  }

  const missing = def.params
    .filter((p) => p.required && (args[p.name] === undefined || args[p.name] === null))
    .map((p) => p.name)
  if (missing.length) return `缺少必填参数 ${missing.join('、')}`

  // requiredAny：每组内全部满足才算满足该组，任意一组满足即可
  if (def.requiredAny?.length) {
    const ok = def.requiredAny.some((group) =>
      group.every((key) => args[key] !== undefined && args[key] !== null && args[key] !== ''),
    )
    if (!ok) {
      const hint = def.requiredAny.map((g) => g.join(' 或 ')).join('、')
      return `以下参数至少需要提供一个：${hint}`
    }
  }
  return null
}

// 结果序列化：限制长度，避免超长返回（如群成员列表）撑爆模型上下文。
//
// def 用于在接口不返回数据时给出诚实的措辞：协议端接受了请求（retcode 为 0）
// 并不等于操作真的生效，因此不能说「操作成功」。对这类接口，若声明了
// verifyWith，则直接指引模型去调用验证接口。
export function stringifyResult(
  value: any,
  maxLength: number,
  def?: ActionDef,
  available?: Set<string>,
): string {
  const empty = (): string => {
    const parts = ['协议端已接受请求，但该接口不返回结果，无法据此判断操作是否真正生效。']
    const hint = def ? verifyHint(def, available) : ''
    if (hint) parts.push(hint)
    return parts.join('')
  }

  if (value === undefined || value === null) return empty()
  if (typeof value === 'string') {
    // 部分协议端对无返回接口回一个空串，同样不能当作成功
    if (!value.trim()) return empty()
    return value.length > maxLength ? value.slice(0, maxLength) + '…（内容过长已截断）' : value
  }
  let text: string
  try {
    text = JSON.stringify(value)
  } catch {
    text = String(value)
  }
  if (text === undefined) return empty()
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + `…（返回数据过长已截断，原始长度 ${text.length} 字符）`
}

export interface ToolDeps {
  ctx: Context
  // 结果最大长度
  maxResultLength: number
  log: { warn: (...args: any[]) => void; debug: (...args: any[]) => void }
  // 已解析好的 @langchain/core 与 zod（由入口在注册前解析一次并复用）
  runtime: LangChainRuntime
  // 本次实际注册的工具名集合，用于判断 verifyWith 指向的接口是否可用
  available?: Set<string>
}

// 为一个接口创建 ChatLuna 工具实例
export function createTool(def: ActionDef, deps: ToolDeps) {
  const { ctx, log, runtime } = deps
  const { DynamicStructuredTool } = runtime

  return new DynamicStructuredTool({
    name: toolName(def.action),
    description: buildDescription(def, deps.available),
    schema: buildSchema(def, runtime.z),
    func: async (...callArgs: any[]): Promise<string> => {
      const session = extractSession(callArgs)
      try {
        let input: any = callArgs[0]
        // 防御：若模型把参数整体当成 JSON 字符串传入，这里尝试还原
        if (typeof input === 'string') {
          try {
            input = JSON.parse(input)
          } catch {
            input = {}
          }
        }

        const raw: ActionArgs = input && typeof input === 'object' ? { ...input } : {}
        applyAutoFill(def, raw, session)
        const args = coerceArgs(def, raw)

        const invalid = validateRequired(def, args)
        if (invalid) return `调用失败：${invalid}。请补充参数后重试。`

        log.debug('调用 %s %o', def.action, args)

        // 优先使用当前会话的机器人，其次在上下文中寻找任意 OneBot 机器人
        const bot =
          (session as any)?.bot ??
          ctx.bots.find((b: any) => b.internal || b.onebot) ??
          ctx.bots[0]
        const data = await callOneBot(bot, def, args, log)
        return stringifyResult(data, deps.maxResultLength, def, deps.available)
      } catch (e) {
        const msg = (e as Error)?.message ?? String(e)
        log.warn('工具 %s 调用失败：%s', def.action, msg)
        // 返回错误文本而非抛异常：让模型能看到失败原因并自行决定后续动作
        return `调用失败：${msg}`
      }
    },
  })
}
