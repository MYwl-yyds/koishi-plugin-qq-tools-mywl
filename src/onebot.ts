// ============ QQ工具集 - OneBot 调用层 ============
// 统一封装 OneBot v11 接口调用，兼容 NapCat / LLBot / go-cqhttp / Lagrange 等协议端，
// 以及 koishi-plugin-adapter-onebot 适配器的多种内部调用形态。

import { Context, Session } from 'koishi'
import { ActionArgs, ActionDef } from './types'

export type OneBotFramework = 'auto' | 'napcat' | 'llbot'

export function frameworkLabel(f: OneBotFramework): string {
  return f === 'napcat' ? 'NapCat' : f === 'llbot' ? 'LLBot' : '自动识别'
}

// snake_case -> camelCase
// 同时去掉 OneBot 隐藏接口的前导 . 与前缀式接口的前导 _（如 _send_group_notice），
// 因为适配器只会以去掉前缀后的名字定义 camelCase 方法。
export function camelCase(name: string): string {
  return name
    .replace(/^[._]/, '')
    .replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

// 查找可用的 OneBot 机器人：优先会话机器人，其次上下文中第一个具备 OneBot 能力的机器人
export function findBot(ctx: Context, session?: Session): any {
  const fromSession: any = (session as any)?.bot
  if (fromSession && isOneBot(fromSession)) return fromSession
  for (const bot of ctx.bots) {
    if (isOneBot(bot)) return bot
  }
  return fromSession || (ctx.bots[0] as any) || null
}

// 判断机器人是否具备 OneBot 调用能力
function isOneBot(bot: any): boolean {
  if (!bot) return false
  if (typeof bot.onebot === 'function') return true
  const internal = bot.internal
  if (!internal) return false
  return (
    typeof internal._get === 'function' ||
    typeof internal.request === 'function' ||
    typeof internal._request === 'function'
  )
}

// 自动检测协议端框架（用于日志与提示，不影响标准调用）
export function detectFramework(bot: any, fallback: OneBotFramework = 'auto'): OneBotFramework {
  if (fallback && fallback !== 'auto') return fallback
  try {
    const probe = String(
      ((bot as any)?.adapter?.name ?? '') +
        ' ' +
        ((bot as any)?.platform ?? '') +
        ' ' +
        ((bot as any)?.config?.protocol ?? ''),
    ).toLowerCase()
    if (probe.includes('napcat')) return 'napcat'
    if (probe.includes('llonebot') || probe.includes('llbot')) return 'llbot'
  } catch {
    /* ignore */
  }
  return 'auto'
}

// 依据接口定义把模型给的参数强制转换为 OneBot 期望的类型。
// 大模型经常把数字/布尔写成字符串，这里统一纠正，避免协议端报参数错误。
export function coerceArgs(def: ActionDef, raw: ActionArgs): ActionArgs {
  const out: ActionArgs = {}
  const known = new Map(def.params.map((p) => [p.name, p]))

  for (const [key, value] of Object.entries(raw || {})) {
    if (value === undefined || value === null) continue
    const spec = known.get(key)
    if (!spec) {
      // 未在定义中声明的额外参数：原样透传，保留框架扩展能力
      out[key] = value
      continue
    }
    const converted = convert(spec.type, value)
    if (converted === undefined) continue
    // 空字符串对可选参数无意义，直接丢弃（协议端可能因此报错）
    if (converted === '' && !spec.required) continue
    out[key] = converted
  }

  // 参数别名双向镜像：不同框架对同一语义参数命名不同（id / message_id、
  // folder / folder_id、sub_type / type、flag / anonymous_flag），这里把两个键
  // 都填上，各实现都能读到自己认识的那个。
  //
  // 必须放在填充默认值之前：否则当模型使用别名时，默认值会先占住目标参数，
  // 导致别名值被丢弃、发送出与模型意图不符的参数。
  if (def.paramAliases) {
    for (const [alias, target] of Object.entries(def.paramAliases)) {
      const value = out[target] ?? out[alias] ?? raw?.[target] ?? raw?.[alias]
      if (value === undefined || value === null || value === '') continue
      out[target] = value
      out[alias] = value
    }
  }

  // 填充默认值（仅在参数完全缺失时生效）
  for (const p of def.params) {
    if (out[p.name] === undefined && p.default !== undefined) out[p.name] = p.default
  }

  return out
}

// 单值类型转换
function convert(type: string, value: any): any {
  switch (type) {
    case 'number':
    case 'integer': {
      if (typeof value === 'number') return type === 'integer' ? Math.trunc(value) : value
      const n = Number(String(value).trim())
      return isNaN(n) ? undefined : type === 'integer' ? Math.trunc(n) : n
    }
    case 'boolean': {
      if (typeof value === 'boolean') return value
      const s = String(value).trim().toLowerCase()
      if (s === 'true' || s === '1' || s === 'yes') return true
      if (s === 'false' || s === '0' || s === 'no') return false
      return undefined
    }
    case 'array':
    case 'object': {
      if (typeof value === 'object') return value
      const s = String(value).trim()
      if (!s) return undefined
      try {
        return JSON.parse(s)
      } catch {
        // 不是合法 JSON：数组参数按单元素处理，对象参数放弃
        return type === 'array' ? [value] : undefined
      }
    }
    case 'message':
      // OneBot 的 message 类型原样透传：字符串按 CQ 码解析，
      // 数组/对象按消息段处理。绝不能把普通文本当 JSON 解析。
      if (typeof value === 'string') return value
      if (Array.isArray(value) || (value && typeof value === 'object')) return value
      return String(value)
    default:
      return typeof value === 'string' ? value : String(value)
  }
}

// 参数名 -> 位置参数顺序（camelCase 回退调用需要）
function positional(def: ActionDef, args: ActionArgs): any[] {
  const order = def.args ?? def.params.map((p) => p.name)
  return order.map((name) => args[name])
}

// 协议端返回的统一错误对象（koishi-plugin-adapter-onebot 的 SenderError）
function describeError(e: any): string {
  if (!e) return '未知错误'
  const retcode = e.retcode ?? e.code
  const wording = e.message ?? e.wording ?? e.msg ?? ''
  if (retcode !== undefined && retcode !== null) return `retcode=${retcode} ${wording}`.trim()
  return String(wording || e)
}

// 调用单个 OneBot action。
// 依次尝试：bot.onebot(action, params) -> internal._get -> internal.request/_request
// -> internal[camelCase](...位置参数)。全部失败后抛出可读错误。
export async function callOneBot(
  bot: any,
  def: ActionDef,
  args: ActionArgs,
  log?: { warn: (...args: any[]) => void },
): Promise<any> {
  if (!bot) throw new Error('未找到可用的 OneBot 机器人，请确认协议端已连接')

  // callAs 优先：部分框架只认带下划线前缀的接口名
  const attempts = [def.callAs ?? def.action, def.action, ...(def.aliases || [])].filter(
    (v, i, arr) => !!v && arr.indexOf(v) === i,
  )
  const errors: string[] = []

  // 1) 会话/机器人上挂载的原生 onebot 调用函数（部分适配器或桥接插件提供）
  const raw = (bot as any).onebot
  if (typeof raw === 'function') {
    for (const action of attempts) {
      try {
        const res = await raw(action, args)
        return unwrap(res, action)
      } catch (e) {
        errors.push(`${action}: ${describeError(e)}`)
      }
    }
  }

  const internal = (bot as any).internal
  if (!internal) {
    throw new Error(
      `当前协议端不是 OneBot v11，无法调用 ${def.action}${errors.length ? `（${errors.join('；')}）` : ''}`,
    )
  }

  // 2) 底层原始调用：_get 会解包 data 并在 retcode !== 0 时抛错
  if (typeof internal._get === 'function') {
    for (const action of attempts) {
      try {
        return await internal._get(action, args)
      } catch (e) {
        errors.push(`${action}: ${describeError(e)}`)
      }
    }
  }

  // 3) 部分适配器只暴露 request / _request（返回 { status, retcode, data }）
  const requester =
    typeof internal.request === 'function'
      ? internal.request
      : typeof internal._request === 'function'
        ? internal._request
        : null
  if (requester) {
    for (const action of attempts) {
      try {
        const res = await requester.call(internal, action, args)
        return unwrap(res, action)
      } catch (e) {
        errors.push(`${action}: ${describeError(e)}`)
      }
    }
  }

  // 4) 兼容旧版适配器：camelCase 方法 + 位置参数（显式绑定 this）
  const positionalArgs = positional(def, args)
  for (const action of attempts) {
    const fn = internal[camelCase(action)]
    if (typeof fn !== 'function') continue
    try {
      return await fn.apply(internal, positionalArgs)
    } catch (e) {
      errors.push(`${action}: ${describeError(e)}`)
    }
  }

  const detail = errors.length ? `：${errors.join('；')}` : ''
  const err = new Error(`调用 OneBot 接口 ${def.action} 失败${detail}`)
  log?.warn('调用 OneBot 接口失败', def.action, detail)
  throw err
}

// 统一解包 OneBot 通用返回包装 { status, retcode, data, echo }
function unwrap(res: any, action: string): any {
  if (res && typeof res === 'object' && 'retcode' in res) {
    const retcode = (res as any).retcode
    if (retcode !== 0 && retcode !== undefined) {
      const wording = (res as any).wording ?? (res as any).message ?? (res as any).msg ?? ''
      throw Object.assign(new Error(String(wording || `retcode=${retcode}`)), { retcode })
    }
    return 'data' in res ? (res as any).data : res
  }
  return res
}
