import type { ComponentType } from 'react';
export type FolderFloatItem = string | { label: string; value: string; title?: string };
declare const FolderFloat: ComponentType<{
 items?: FolderFloatItem[]; label?: string; sublabel?: string; trigger?: 'hover' | 'click';
 defaultOpen?: boolean; closeOnSelect?: boolean; physics?: boolean; drift?: number;
 onSelect?: (value: string, index: number) => void; onActivate?: () => void; onOpenChange?: (open: boolean) => void;
 folderColor?: string; frontColor?: string; paperColor?: string; itemColor?: string;
 itemTextColor?: string; labelColor?: string; width?: number; height?: number; radius?: number;
 spread?: number; lift?: number; tilt?: number; flapAngle?: number; restAngle?: number;
 openDuration?: number; stagger?: number; bounce?: number; className?: string;
}>;
export default FolderFloat;
