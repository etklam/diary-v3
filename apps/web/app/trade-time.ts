export function localTradeInstants(value:string):string[]{
 const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);if(!match)return [];
 const [,year,month,day,hour,minute]=match;const base=new Date(0);base.setUTCFullYear(+year!,+month!-1,+day!);base.setUTCHours(+hour!,+minute!,0,0);const naive=base.getTime();const offsets=new Set<number>();for(let h=-36;h<=36;h++)offsets.add(new Date(naive+h*3600000).getTimezoneOffset());
 return [...offsets].map(offset=>new Date(naive+offset*60000)).filter(date=>localTradeValue(date)===value).map(date=>date.toISOString()).sort();
}
export function localTradeValue(date:Date){const pad=(n:number)=>String(n).padStart(2,'0');return `${String(date.getFullYear()).padStart(4,'0')}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;}
/** Keep an existing instant's seconds and chosen DST occurrence when its displayed local minute is unchanged. */
export function resolveLocalTradeInstant(value:string,selected:string):string|undefined{if(selected){const date=new Date(selected);if(Number.isFinite(date.getTime())&&localTradeValue(date)===value)return date.toISOString();}const options=localTradeInstants(value);return options.length===1?options[0]:undefined;}
export function localTradeChoices(value:string,selected:string):string[]{const choices=localTradeInstants(value);if(!selected)return choices;const date=new Date(selected);if(!Number.isFinite(date.getTime())||localTradeValue(date)!==value)return choices;const minute=Math.floor(date.getTime()/60000)*60000;return choices.map(choice=>Date.parse(choice)===minute?date.toISOString():choice);}
