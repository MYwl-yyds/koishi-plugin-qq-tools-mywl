// ============ QQ工具集 - 插件入口 ============
//
// 把 OneBot v11 的全部内置接口（含 NapCat / LLBot 实现的 go-cqhttp 扩展接口）
// 转写为可执行工具，注册给 ChatLuna，供大模型在 Agent 模式下直接调用。
//
// 配置层面只做一件事：每个接口一个开关，自由决定是否提供给 ChatLuna。

import { Context } from 'koishi'
import { ACTIONS, EXTENSION_COUNT, STANDARD_COUNT } from './actions'
import { GROUPS, MAX_RESULT_LENGTH } from './constants'
import { isToolEnabled, PluginConfig } from './config'
import { ActionDef } from './types'
import { createTool, toolName, ToolDeps } from './tool'
import { detectFramework, findBot, frameworkLabel } from './onebot'
import { LangChainRuntime, loadLangChain } from './deps'

export { Config, name } from './config'
export type { PluginConfig } from './config'
export { ACTIONS, ACTION_MAP } from './actions'
export { GROUPS } from './constants'

// ChatLuna 是必需依赖：服务不可用时本插件不会被加载，也就不会注册任何工具。
// 因此下面的 apply 中可以直接取用 ctx.chatluna，无需再做可用性等待。
export const inject = ['chatluna']

// 依据配置筛选需要注册的接口：只认每个工具自己的开关
export function selectActions(config: PluginConfig): ActionDef[] {
  return ACTIONS.filter((def) => isToolEnabled(config, def))
}

export function apply(ctx: Context, config: PluginConfig) {
  const log = ctx.logger('qq-tools')

  if (config.enabled === false) {
    log.info('QQ工具集已关闭总开关，未注册任何工具')
    return
  }

  const selected = selectActions(config)
  if (!selected.length) {
    log.warn('所有 OneBot 工具的开关都处于关闭状态，未注册任何工具')
    return
  }

  const chatluna: any = (ctx as any).chatluna
  const platform = chatluna?.platform

  if (!platform || typeof platform.registerTool !== 'function') {
    log.error('ChatLuna 版本不兼容，未注册任何工具（需要 koishi-plugin-chatluna 1.4+）')
    return
  }

  // 预先解析 @langchain/core 与 zod。这两个模块由 ChatLuna 提供，
  // 若解析失败则直接给出明确原因，而不是让每个工具逐个报错。
  let runtime: LangChainRuntime
  try {
    runtime = loadLangChain((ctx as any).baseDir)
    log.debug('已从 %s 解析 @langchain/core 与 zod', runtime.source)
  } catch (e) {
    log.error('无法加载 ChatLuna 提供的 @langchain/core 与 zod：%s', (e as Error).message)
    log.error('请确认 koishi-plugin-chatluna 已正确安装并处于启用状态。')
    return
  }

  const deps: ToolDeps = {
    ctx,
    maxResultLength: MAX_RESULT_LENGTH,
    log,
    runtime,
  }

  const groupLabel = new Map(GROUPS.map((g) => [g.key, g.label]))
  let registered = 0
  const failed: string[] = []

  for (const def of selected) {
    const name = toolName(def.action)
    try {
      // 直接使用 PlatformService.registerTool：
      // ChatLunaPlugin.registerTool 内部也只是转发到该方法，直接调用可以避免
      // 依赖 ChatLunaPlugin 的构造时机与配置池机制。
      const dispose = platform.registerTool(name, {
        // 启用与否已由本插件的开关决定，这里不再二次过滤
        selector: () => true,
        createTool: () => createTool(def, deps) as any,
        description: def.description,
        meta: {
          source: 'extension',
          group: groupLabel.get(def.group) ?? def.group,
          tags: ['onebot', 'qq', def.group, ...(def.danger ? ['danger'] : [])],
          defaultAvailability: {
            enabled: true,
            main: true,
            subAgent: true,
            chatluna: true,
            characterScope: 'all',
          },
        },
      })
      // 插件卸载时自动注销工具
      if (typeof dispose === 'function') ctx.effect(() => dispose)
      registered++
    } catch (e) {
      failed.push(def.action)
      log.warn('注册工具 %s 失败：%s', def.action, (e as Error).message)
    }
  }

  const stdCount = selected.filter((d) => !d.extension).length
  const dangerCount = selected.filter((d) => d.danger).length
  log.info(
    '已向 ChatLuna 注册 %d 个 OneBot 工具（标准 %d / 扩展 %d，其中危险操作 %d）；接口库共 %d 个（标准 %d / 扩展 %d）',
    registered,
    stdCount,
    selected.length - stdCount,
    dangerCount,
    ACTIONS.length,
    STANDARD_COUNT,
    EXTENSION_COUNT,
  )

  // 协议端信息仅用于日志提示
  const bot = findBot(ctx)
  if (bot) {
    log.info('检测到 OneBot 协议端：%s', frameworkLabel(detectFramework(bot)))
  } else {
    log.warn('当前没有可用的 OneBot 机器人，工具调用时会失败，请先连接协议端')
  }
  if (failed.length) {
    log.warn('以下工具注册失败：%s', failed.join('、'))
  }
}
