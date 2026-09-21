export interface DemoPreview {
  heading: string
  fields: { label: string; value: string }[]
  output: string
}

/** Illustrative content only: never fed into Runner or persisted as an outcome. */
export function demoPreviewFor(toolName: string): DemoPreview {
  if (/物流.*模板|运费.*模板/.test(toolName)) return {
    heading: '物流模板示例',
    fields: [{ label: '模板名称', value: '赛训标准配送（示例）' }, { label: '配送区域', value: '示例区域 A' }, { label: '配置方式', value: '按导入规则填写' }],
    output: '展示模板填写与保存确认流程。实际执行时以本地 Runner 核验为准。',
  }
  if (/运费|物流.*比|费率/.test(toolName)) return {
    heading: '运费比较示例',
    fields: [{ label: '包裹重量', value: '1.0 kg（示例）' }, { label: '目的地', value: '示例目的地' }, { label: '费率来源', value: '导入的费率表' }],
    output: '展示费用比较的处理过程，示例不提供真实报价。',
  }
  return {
    heading: `${toolName} · 流程示例`,
    fields: [{ label: '输入准备', value: '检查本次任务资料' }, { label: '操作范围', value: '仅展示模拟流程' }, { label: '结果说明', value: '不访问外部账号，不修改真实数据' }],
    output: '完成后可查看流程说明；演示结束不代表平台任务成功。',
  }
}
