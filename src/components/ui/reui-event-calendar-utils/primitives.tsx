import type { ComponentProps, ReactNode, SVGProps } from 'react';
import { Popover as BasePopover } from '@base-ui/react/popover';
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import { CalendarDays, Plus, Repeat2 } from 'lucide-react';

export function cn(...values: unknown[]): string {
 const names:string[]=[];const visit=(value:unknown)=>{if(!value)return;if(typeof value==='string'||typeof value==='number')names.push(String(value));else if(Array.isArray(value))value.forEach(visit);else if(typeof value==='object')Object.entries(value).forEach(([key,enabled])=>{if(enabled)names.push(key);});};values.forEach(visit);return names.join(' ');
}
export const Popover=BasePopover.Root;
export const PopoverTrigger=BasePopover.Trigger;
type PopoverContentProps=ComponentProps<typeof BasePopover.Popup>&Pick<ComponentProps<typeof BasePopover.Positioner>,'align'|'side'|'sideOffset'|'alignOffset'>;
export function PopoverContent({align='start',side='bottom',sideOffset=6,alignOffset=0,className,...props}:PopoverContentProps){
 return <BasePopover.Portal><BasePopover.Positioner align={align} side={side} sideOffset={sideOffset} alignOffset={alignOffset} className="verdant-calendar-positioner"><BasePopover.Popup {...props} className={cn('verdant-calendar-popover',className)}/></BasePopover.Positioner></BasePopover.Portal>;
}
export const Tooltip=BaseTooltip.Root;
export const TooltipProvider=BaseTooltip.Provider;
export const TooltipTrigger=BaseTooltip.Trigger;
type TooltipContentProps=ComponentProps<typeof BaseTooltip.Popup>&Pick<ComponentProps<typeof BaseTooltip.Positioner>,'align'|'side'|'sideOffset'|'alignOffset'>;
export function TooltipContent({align='center',side='top',sideOffset=7,alignOffset=0,className,...props}:TooltipContentProps){
 return <BaseTooltip.Portal><BaseTooltip.Positioner align={align} side={side} sideOffset={sideOffset} alignOffset={alignOffset} className="verdant-calendar-positioner"><BaseTooltip.Popup {...props} className={cn('verdant-calendar-tooltip',className)}/></BaseTooltip.Positioner></BaseTooltip.Portal>;
}
export function ScrollArea({children,className,...props}:ComponentProps<'div'>){return <div {...props} data-slot="scroll-area" className={cn('min-h-0 min-w-0',className)}><div data-slot="scroll-area-viewport" className="h-full min-h-0 overflow-auto">{children}</div></div>;}
export function IconStack({children}:{children:ReactNode}){return <span className="calendar-empty-icon">{children}</span>;}
export function IconPlaceholder({lucide,className,style,'aria-hidden':ariaHidden}:SVGProps<SVGSVGElement>&{lucide?:string;tabler?:string;hugeicons?:string;phosphor?:string;remixicon?:string}){const Icon=lucide==='RepeatIcon'?Repeat2:lucide==='PlusIcon'?Plus:CalendarDays;return <Icon className={className} style={style} aria-hidden={ariaHidden}/>;}
