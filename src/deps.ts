// ============ QQ工具集 - 运行时依赖解析 ============
//
// 本插件需要 @langchain/core（工具基类）与 zod（参数 schema）。这两个模块由
// koishi-plugin-chatluna 提供，其 package.json 通过 resolutions / overrides 把它们
// 锁定在 ^0.3.80 与 3.25.76。ChatLuna 官方的扩展插件（如
// koishi-plugin-chatluna-plugin-common）也是把它们声明为直接依赖。
//
// 但在「本地插件」场景下（插件放在 external/ 目录、未执行 npm install），插件目录
// 下没有 node_modules；若包管理器又把 @langchain/core 嵌套安装到了
// koishi-plugin-chatluna/node_modules 内，从插件目录直接 require 就会报
// Cannot find module '@langchain/core/tools'。
//
// 因此这里做运行时解析，并且**优先取 ChatLuna 所在的那一份**：
//   - 保证与 ChatLuna 内部是同一个模块实例，ChatLuna 里
//     `tool.schema instanceof ZodSchema` 之类的判定才成立；
//   - zod 必须是 ChatLuna 用于 zodToJsonSchema 的那一份，否则 ReAct 模式下
//     参数渲染会失效；
//   - 避免出现两份 @langchain/core 导致 StructuredTool 类身份不一致
//     （那会让 ChatLuna 认为我们的工具不是 StructuredTool）。
//
// 这样插件既不需要用户额外安装依赖，也不受安装布局（npm 提升 / pnpm 嵌套）影响。

import { createRequire } from 'module'
import { existsSync } from 'fs'
import { dirname, join, parse } from 'path'

export interface LangChainRuntime {
  // @langchain/core 的 DynamicStructuredTool 构造函数
  DynamicStructuredTool: any
  // zod 命名空间（v3）
  z: any
  // 实际解析来源，便于日志排查
  source: string
}

// 从 start 目录开始逐级向上，收集所有可能存放依赖的基准路径。
function ancestors(start: string): string[] {
  const out: string[] = []
  let dir = start
  const root = parse(dir).root
  while (dir && dir !== root) {
    out.push(join(dir, 'node_modules'))
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return out
}

// 构造候选 require 基准路径，按优先级排列。
//
// baseDir 传入 Koishi 的应用根目录（ctx.baseDir）时最可靠；本地插件场景下
// 插件自身目录里没有 node_modules，只能从应用根目录的依赖树里找 ChatLuna。
function requireBases(baseDir?: string): string[] {
  const bases: string[] = []
  const push = (p?: string | null) => {
    if (p && !bases.includes(p)) bases.push(p)
  }

  // 找出某个起始目录下所有层级中的 ChatLuna
  const scan = (start: string) => {
    try {
      for (const nm of ancestors(start)) {
        const pkg = join(nm, 'koishi-plugin-chatluna', 'package.json')
        if (existsSync(pkg)) push(pkg)
      }
    } catch {
      /* ignore */
    }
  }

  // 1) ChatLuna 自身位置（首选：保证与 ChatLuna 使用同一份模块实例）
  try {
    push(require.resolve('koishi-plugin-chatluna/package.json'))
  } catch {
    /* 未安装或 exports 未导出 package.json，忽略 */
  }

  // 2) Koishi 应用根目录（本地插件场景下最可靠）
  if (baseDir) scan(baseDir)

  // 3) 进程工作目录
  try {
    scan(process.cwd())
  } catch {
    /* ignore */
  }

  // 4) 本模块所在位置向上（常规 npm 安装，插件自己的 node_modules）
  try {
    if (typeof __filename === 'string') scan(dirname(__filename))
  } catch {
    /* ignore */
  }

  // 5) 兜底：应用根目录本身
  if (baseDir) push(join(baseDir, 'package.json'))
  try {
    push(join(process.cwd(), 'package.json'))
  } catch {
    /* ignore */
  }

  return bases
}

let cache: LangChainRuntime | null = null

// 加载 @langchain/core 与 zod。成功结果会被缓存；失败时抛出带排查信息的错误。
//
// 失败**不**缓存：不同调用方可能传入不同的 baseDir，一次失败不应永久毒化后续尝试。
// baseDir 建议传 ctx.baseDir（Koishi 应用根目录）。
export function loadLangChain(baseDir?: string): LangChainRuntime {
  if (cache) return cache

  const attempts: string[] = []

  for (const base of requireBases(baseDir)) {
    let req: NodeRequire
    try {
      req = createRequire(base)
    } catch (e) {
      attempts.push(`${base} → ${(e as Error).message}`)
      continue
    }

    try {
      const tools = req('@langchain/core/tools')
      const z = req('zod')

      const DynamicStructuredTool = tools?.DynamicStructuredTool
      if (typeof DynamicStructuredTool !== 'function') {
        attempts.push(`${base} → @langchain/core/tools 中未找到 DynamicStructuredTool`)
        continue
      }
      if (!z || typeof z.object !== 'function') {
        attempts.push(`${base} → zod 不可用或版本不正确（需要 v3）`)
        continue
      }

      cache = { DynamicStructuredTool, z, source: base }
      return cache
    } catch (e) {
      attempts.push(`${base} → ${(e as Error).message}`)
    }
  }

  throw new Error(
    '无法加载 @langchain/core 与 zod。这两个模块由 koishi-plugin-chatluna 提供，' +
      '请确认 ChatLuna 已正确安装并处于启用状态。已尝试的位置：' +
      attempts.join('；'),
  )
}
