/* Pure, deterministic reconciliation. No network, storage, or UI side effects. */
((root)=>{`use strict`;
const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const object=value=>value!==null&&typeof value===`object`&&!Array.isArray(value);
function canonical(value){if(value===undefined)return `undefined`;if(Array.isArray(value))return `[${value.map(canonical).join(`,`)}]`;if(object(value))return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(`,`)}}`;return JSON.stringify(value)}
const equal=(a,b)=>canonical(a)===canonical(b);
class SyncConflict extends Error{constructor(path){super(`Concurrent changes require review: ${path}`);this.name=`SyncConflict`;this.path=path}}
function keyed(values){for(const key of [`id`,`from`,`name`]){if(values.every(list=>list.every(item=>object(item)&&typeof item[key]===`string`)&&new Set(list.map(item=>item[key])).size===list.length))return key}return null}
function reconcile(base,local,remote,path=`state`){
 if(equal(local,remote))return copy(local);
 if(equal(local,base))return copy(remote);
 if(equal(remote,base))return copy(local);
 if(object(local)&&object(remote)&&(base===undefined||object(base))){const result={};for(const key of new Set([...Object.keys(base||{}),...Object.keys(local),...Object.keys(remote)])){const value=reconcile(base?.[key],local[key],remote[key],`${path}.${key}`);if(value!==undefined)Object.defineProperty(result,key,{value,enumerable:true,writable:true,configurable:true})}return result}
 if(Array.isArray(local)&&Array.isArray(remote)&&(base===undefined||Array.isArray(base))){const key=keyed([base||[],local,remote]);if(key){const toMap=list=>Object.fromEntries(list.map(item=>[item[key],item]));return Object.values(reconcile(toMap(base||[]),toMap(local),toMap(remote),path))}}
 throw new SyncConflict(path);
}
function unpack(state){
 const root=copy(state||{}),movements={},months={};delete root.months;delete root.activeMonth;delete root._backupContext;
 for(const [month,data] of Object.entries(state?.months||{})){
  months[month]=copy(data);delete months[month].items;delete months[month].transfers;
  for(const kind of [`items`,`transfers`])for(const source of data[kind]||[]){
   if(!source.id||movements[source.id])throw new SyncConflict(`duplicate movement ID`);
   const record=copy(source);
   if(kind===`items`&&record.obligationTotal!==undefined){delete record.amount;delete record.completed}
   movements[source.id]={month,kind,record};
  }
 }
 return {root,movements,months};
}
function entries(state){return Object.values(state?.months||{}).flatMap(data=>data.items||[])}
function validateAndRecompute(state){
 const items=entries(state),byId=new Map(items.map(item=>[item.id,item])),paid=new Map(),occurrences=new Map();
 for(const item of items){
  if(item.obligationId){const parent=byId.get(item.obligationId);if(!parent||parent.obligationTotal===undefined||parent.type!==`expense`||item.type!==`expense`||item.obligationId===item.id||item.recurring===true)throw new SyncConflict(`invalid payment link`);if(item.completed===true){const value=Number(item.amount);if(!Number.isFinite(value)||value<=0)throw new SyncConflict(`invalid completed payment amount`);paid.set(parent.id,(paid.get(parent.id)||0)+value)}}
  if(item.recurrenceId&&item.recurrenceMonth&&!item.obligationId){const key=`${item.recurrenceId}:${item.recurrenceMonth}`;if(occurrences.has(key))throw new SyncConflict(`duplicate recurrence occurrence`);occurrences.set(key,item.id)}
 }
 for(const item of items){
  if(item.obligationTotal!==undefined){const total=Number(item.obligationTotal),sum=Math.round((paid.get(item.id)||0)*100)/100;if(!Number.isFinite(total)||total<0||sum>total+.005)throw new SyncConflict(`payments exceed obligation total`);item.amount=Math.round((total-sum)*100)/100;item.completed=item.amount<.005}
  else if(!Number.isFinite(Number(item.amount))||([`income`,`expense`,`previous`].includes(item.type)&&Number(item.amount)<0))throw new SyncConflict(`invalid movement amount`);
 }
 return state;
}
function protectPayments(base,result){
 const surviving=new Map(entries(result).map(item=>[item.id,item]));
 const audit=Object.values(result.paymentAudit||{});
 for(const item of entries(base))if(item.obligationId&&!surviving.has(item.id)){
  if(!audit.some(event=>event.action===`delete`&&event.paymentId===item.id))throw new SyncConflict(`payment removed without deletion receipt`);
 }
 for(const [id,event] of Object.entries(base?.paymentAudit||{}))if(!equal(event,result.paymentAudit?.[id]))throw new SyncConflict(`payment audit removed or changed`);
}
function merge(base,local,remote){
 const combined=reconcile(unpack(base),unpack(local),unpack(remote));
 const result={...combined.root,activeMonth:local?.activeMonth||remote?.activeMonth,months:{}};
 for(const [month,data] of Object.entries(combined.months))result.months[month]={...data,items:[],transfers:[]};
 for(const {month,kind,record} of Object.values(combined.movements)){result.months[month]||={items:[],transfers:[]};result.months[month][kind].push(record)}
 protectPayments(base,result);return validateAndRecompute(result);
}
function financialEqual(a,b){return equal(unpack(a),unpack(b))}
function hasMovements(state){return Object.values(state?.months||{}).some(data=>data.items?.length||data.transfers?.length)}
const api={copy,canonical,equal,merge,financialEqual,hasMovements,validateAndRecompute,SyncConflict};
if(typeof module!==`undefined`&&module.exports)module.exports=api;else root.SalarySyncCore=api;
})(typeof window!==`undefined`?window:globalThis);
