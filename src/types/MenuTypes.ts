// 定义 MenuItem 类型
export type MenuItem = {
  key: string;
  icon?: string;
  title: string;
  path: string;
};

export type PopupMenu = {
  id: number;
  selected?: number;
  name: string;
  whatisurl?: string;
  whatistitle?: string;
  icon?: Object;
}