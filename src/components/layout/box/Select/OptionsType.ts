// 定义 MenuItem 类型
export type OptionModel = {
  value: string | number
  label: string,
  disabled?: boolean,
  subLabel?: string
  icon?: Object,
  remoteSync?: boolean,
  isPrivate?: boolean
};
