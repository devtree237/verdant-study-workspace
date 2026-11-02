/** Opaque task colors use an explicit readable foreground in either theme. */
export function calendarTextColor(color: string): string {
 const hex = color.replace(/^#/, '');
 if (!/^[\da-f]{6}$/i.test(hex)) return '#ffffff';
 const luminance = (value:string) => {
  const rgb=[0,2,4].map(index=>parseInt(value.slice(index,index+2),16)/255).map(channel=>channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4);
  return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
 };
 const background=luminance(hex),ink=luminance('101828');
 if(1.05/(background+.05)>=4.5)return '#ffffff';
 return (background+.05)/(ink+.05)>=4.5?'#101828':'#000000';
}
