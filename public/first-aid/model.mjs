/** Read-only view calculations. All mutations are validated and committed by the API. */
export function expiryDays(expiry,asOf){
 if(!expiry)return null;
 const end=Date.parse(`${expiry}T00:00:00Z`),start=Date.parse(`${asOf}T00:00:00Z`);
 return Number.isFinite(end)&&Number.isFinite(start)?Math.round((end-start)/86400000):null;
}
export function availableLots(state,itemId,locationId='all'){
 const requiresExpiry=state.items.find(item=>item.id===itemId)?.trackExpiry!==false;
 return state.lots.filter(l=>l.itemId===itemId&&(locationId==='all'||l.locationId===locationId)&&l.quantity>0&&(l.expiry?expiryDays(l.expiry,state.asOf)>=0:!requiresExpiry)).sort((a,b)=>(a.expiry||'9999-12-31').localeCompare(b.expiry||'9999-12-31')||a.id.localeCompare(b.id));
}
export function pendingExpiryLots(state,itemId=null,locationId='all'){
 const tracked=new Set(state.items.filter(item=>item.trackExpiry!==false).map(item=>item.id));
 return state.lots.filter(l=>l.quantity>0&&!l.expiry&&tracked.has(l.itemId)&&(!itemId||l.itemId===itemId)&&(locationId==='all'||l.locationId===locationId));
}
export function itemBalance(state,itemId,locationId='all'){return availableLots(state,itemId,locationId).reduce((a,l)=>a+l.quantity,0);}
export function getItemStatus(state,item,locationId='all'){
 const record=typeof item==='string'?state.items.find(i=>i.id===item):item;
 const ts=state.thresholds.filter(t=>t.itemId===record.id&&(locationId==='all'||t.locationId===locationId));
 const min=ts.length?ts.reduce((a,t)=>a+t.min,0):record.min||0;
 const balance=itemBalance(state,record.id,locationId);
 const pending=pendingExpiryLots(state,record.id,locationId).length>0;
 return {key:pending?'warn':balance===0?'out':balance<min?'low':'ok',label:pending?'รอยืนยันวันหมดอายุ':balance===0?'หมด':balance<min?'ต้องเติม':'เพียงพอ',balance};
}
export function locationStatus(state,locationId){
 const point=state.locations.find(l=>l.id===locationId);
 const assigned=state.thresholds.filter(t=>t.locationId===locationId);
 const lowItems=assigned.filter(t=>itemBalance(state,t.itemId,locationId)<t.min).map(t=>state.items.find(i=>i.id===t.itemId)).filter(Boolean);
 const expiredLots=state.lots.filter(l=>l.locationId===locationId&&l.quantity>0&&l.expiry&&expiryDays(l.expiry,state.asOf)<0);
 const pendingLots=pendingExpiryLots(state,null,locationId);
 const checked=point?.lastChecked?Date.parse(point.lastChecked+'T00:00:00Z'):NaN;
 const overdue=!Number.isFinite(checked)||Date.parse(state.asOf+'T00:00:00Z')-checked>30*86400000;
 const hasIssue=point?.inspectionIssue===true;
 return {unconfigured:assigned.length===0,ready:assigned.length>0&&!lowItems.length&&!expiredLots.length&&!pendingLots.length&&!overdue&&!hasIssue,lowItems,expiredLots,pendingLots,overdue,hasIssue};
}
export function stats(state,locationId='all'){
 const ls=state.locations.filter(l=>locationId==='all'||l.id===locationId),lots=state.lots.filter(l=>(locationId==='all'||l.locationId===locationId)&&l.quantity>0),statuses=ls.map(l=>locationStatus(state,l.id));
 return {itemCount:locationId==='all'?state.items.length:new Set(lots.map(l=>l.itemId)).size,locationCount:ls.length,readyLocations:statuses.filter(s=>s.ready).length,lowStockItems:new Set(statuses.flatMap(s=>s.lowItems.map(i=>i.id))).size,nearExpiryLots:lots.filter(l=>l.expiry&&expiryDays(l.expiry,state.asOf)>=0&&expiryDays(l.expiry,state.asOf)<=90).length,expiredLots:lots.filter(l=>l.expiry&&expiryDays(l.expiry,state.asOf)<0).length,monthUses:Array.isArray(state.usageSummary?.monthUsesByLocation)?state.usageSummary.monthUsesByLocation.filter(r=>locationId==='all'||r.locationId===locationId).reduce((sum,r)=>sum+Number(r.count),0):null,overdueLocations:statuses.filter(s=>s.overdue).length};
}
