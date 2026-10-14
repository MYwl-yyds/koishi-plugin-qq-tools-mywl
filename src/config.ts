// ============ QQ工具集 - 配置 ============
//
// 配置只做一件事：为每一个 OneBot 接口提供一个独立开关。
// 开关由 actions.ts 的接口清单**自动生成**，因此新增接口时无需改动本文件，
// 配置界面也会自动出现对应的开关。

import { Schema } from 'koishi'
import { ACTIONS } from './actions'
import { GROUPS } from './constants'
import { ActionDef, GroupKey } from './types'

export const name = 'qq-tools-mywl'

// 工具在配置中的键名。
//
// 与 tool.ts 的工具名后缀保持一致（去掉 .handle_quick_operation 这类前导符号）：
//   - 配置键不能以点开头，点号在配置路径中是分隔符；
//   - 保持两者一致，排查问题时能把配置项和工具名直接对上。
export function configKey(action: string): string {
  return action.replace(/^[._]/, '')
}

// 配置结构：总开关 + 每个分组下的一组「工具名 -> 是否启用」开关
export type PluginConfig = {
  enabled: boolean
} & Record<GroupKey, Record<string, boolean>>

// 生成一个分组内所有工具的开关。
//
// 默认值体现「危险操作默认关闭」：danger 的接口默认 false，其余默认 true。
// 用户仍可在这个开关上自由打开任何接口。
function groupSchema(key: GroupKey) {
  const shape: Record<string, any> = {}

  for (const def of ACTIONS) {
    if (def.group !== key) continue

    const marks: string[] = []
    if (def.danger) marks.push('⚠️ 危险操作，默认关闭')
    if (def.extension) marks.push('扩展接口，部分协议端不支持')

    shape[configKey(def.action)] = Schema.boolean()
      .default(!def.danger)
      .description(
        `${def.title} ｜ ${def.action}${marks.length ? ` ｜ ${marks.join('；')}` : ''}`,
      )
  }

  return Schema.object(shape)
}

// 分组折叠块：描述即折叠标题
const groupFields: Record<string, any> = {}
for (const g of GROUPS) {
  groupFields[g.key] = groupSchema(g.key).description(`${g.label}：${g.description}`)
}

export const Config: Schema<PluginConfig> = Schema.object({
  enabled: Schema.boolean()
    .default(true)
    .description('总开关：是否把 OneBot 工具注册给 ChatLuna'),
  ...groupFields,
}) as any

// 判断某个接口是否启用。
//
// 配置项缺失时回退到默认值（危险操作默认关闭），这样即使配置文件是旧版本、
// 或后续新增了接口，行为也符合预期而不会意外开启危险操作。
export function isToolEnabled(config: PluginConfig, def: ActionDef): boolean {
  const section = config?.[def.group]
  const value = section?.[configKey(def.action)]
  return value === undefined ? !def.danger : value === true
}
