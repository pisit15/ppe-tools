import {availableLots,itemBalance,expiryDays,pendingExpiryLots} from './model.mjs';

/** Self-recording interface. All changes are committed by the server; the public surface contains no coworker history. */
export function mountSelfService({root,getState,submitIssue,refreshState,locationId,icon,esc,date,n,publicView=true}) {
  let draft = {requesterId:'manual',onBehalf:false,recipientId:'',manualRequester:{name:'',department:''},manualRecipient:{name:'',department:''},lines:[],note:''};
  let idempotencyKey=crypto.randomUUID();
  let receipt = null;
  let submitting = false;
  let error = '';

  const find = selector => root.querySelector(selector);
  const point = () => getState().locations.find(row => row.id === locationId);
  const employee = id => getState().employees.find(row => row.id === id);
  const item = id => getState().items.find(row => row.id === id);
  const draftLine = id => draft.lines.find(row => row.itemId === id);


  function employeeOptions(selected,exclude='') {
    return '<option value="">เลือกชื่อหรือรหัสพนักงาน</option>' + getState().employees.filter(row => row.id !== exclude).map(row => `<option value="${esc(row.id)}" ${selected===row.id?'selected':''}>${esc(row.code)} · ${esc(row.name)} · ${esc(row.department)}</option>`).join('') + `<option value="manual" ${selected==='manual'?'selected':''}>บุคคลอื่น / ไม่มีรหัสพนักงาน</option>`;
  }

  function employeeSummary(id) {
    if(id==='manual')return 'กรอกชื่อและหน่วยงานตามจริง <span class="self-identity-tag">ระบุด้วยตนเอง</span>';
    const person = employee(id);
    return person ? `${esc(person.code)} · ${esc(person.department)} <span class="self-identity-tag">ระบุด้วยตนเอง</span>` : 'ระบุชื่อและหน่วยงานของผู้หยิบ';
  }

  function manualFields(role) {
    const value=role==='requester'?draft.manualRequester:draft.manualRecipient;
    const label=role==='requester'?'ผู้เบิก':'ผู้รับจริง';
    return `<div class="self-manual-person"><div class="self-field"><label for="self-${role}-name">ชื่อ-นามสกุล <span aria-hidden="true">*</span></label><input id="self-${role}-name" data-self-manual="${role}" data-person-field="name" aria-label="ชื่อ-นามสกุล${label}" value="${esc(value.name)}" autocomplete="off" maxlength="100" placeholder="ระบุชื่อ-นามสกุล" required></div><div class="self-field"><label for="self-${role}-department">หน่วยงาน / บริษัท <span aria-hidden="true">*</span></label><input id="self-${role}-department" data-self-manual="${role}" data-person-field="department" aria-label="หน่วยงานหรือบริษัท${label}" value="${esc(value.department)}" autocomplete="off" maxlength="120" placeholder="เช่น บริษัทผู้รับเหมา / หน่วยงานต้นสังกัด" required></div></div>`;
  }

  function header() {
    const location = point();
    return `<header class="self-top"><div class="self-top-inner"><a class="self-brand" href="#take/${esc(locationId)}" aria-label="First Aid บันทึกด้วยตนเอง">${icon('cross')}<span>First Aid <small>by EA SHE Tools</small></span></a><span class="self-demo">บันทึกการหยิบใช้</span></div></header><div class="self-point-heading"><div class="self-point-icon">${icon(location?.icon==='briefcase-medical'?'bag':location?.icon==='package'?'box':location?.icon||'pin')}</div><div><p class="self-overline">บันทึกการหยิบใช้ด้วยตนเอง</p><h1>${esc(location?.name || 'ไม่พบจุดปฐมพยาบาล')}</h1><p class="self-point-subtitle">${location?`${esc(location.type)} · ${esc(location.area)}`:'ลิงก์นี้ไม่มีจุดปฐมพยาบาลที่ตรงกัน'}</p></div></div>`;
  }

  function utilities() {return '<p class="self-local-note">ตรวจสอบชื่อ รายการ จำนวน และวันหมดอายุให้ตรงกับของที่หยิบจริง</p>';}

  function render() {
    const state = getState();
    const location = point();
    root.innerHTML = `<div class="self-shell">${header()}<main class="self-main" id="main" tabindex="-1">${!location?missing():location.issueMode!=='self_service'?controlled():receipt?receiptHtml():formHtml(state)}${utilities()}</main></div>`;


    if (!location || location.issueMode !== 'self_service') return;
    if (receipt) {
      find('#self-new').onclick = async () => {
        const newButton=find('#self-new');newButton.disabled=true;
        try{await refreshState();}catch{newButton.disabled=false;newButton.textContent='โหลดข้อมูลไม่สำเร็จ · กดลองใหม่';return;}
        draft = {requesterId:'manual',onBehalf:false,recipientId:'',manualRequester:{name:'',department:''},manualRecipient:{name:'',department:''},lines:[],note:''};
        receipt = null; idempotencyKey=crypto.randomUUID(); error=''; submitting=false;
        render(); find('#self-requester-name')?.focus();
      };
      return;
    }
    bindForm();
  }

  function missing() {
    return `<section class="self-state-card"><div class="self-state-symbol">${icon('pin')}</div><h2>ไม่พบจุดที่ต้องการ</h2><p>ตรวจสอบลิงก์ของตู้หรือกระเป๋าปฐมพยาบาลอีกครั้ง</p></section>`;
  }

  function controlled() {
    return `<section class="self-state-card"><div class="self-state-symbol">${icon('shield')}</div><span class="self-mode-tag">เจ้าหน้าที่เป็นผู้บันทึก</span><h2>จุดนี้ให้เจ้าหน้าที่บันทึก</h2><p>กรุณาติดต่อเจ้าหน้าที่ประจำจุดเพื่อรับยาและเวชภัณฑ์<br>หน้านี้ไม่เปิดให้บันทึกการหยิบใช้ด้วยตนเอง</p></section>`;
  }

  function formHtml(state) {
    const assigned = new Set([
      ...state.thresholds.filter(row => row.locationId === locationId).map(row => row.itemId),
      ...state.lots.filter(row => row.locationId === locationId).map(row => row.itemId),
    ]);
    const items = state.items.filter(row => assigned.has(row.id));
    return `<p class="self-intro">เลือกชื่อ เลือกของที่หยิบ แล้วบันทึกให้ครบในครั้งเดียว</p><form id="self-form"><div id="self-error" class="self-error" role="alert" tabindex="-1" ${error?'':'hidden'}>${esc(error)}</div><section class="self-section" aria-labelledby="self-person-title"><div class="self-section-heading"><span class="self-step">1</span><div><h2 id="self-person-title">ใครเป็นผู้หยิบ</h2><p>ระบุคนที่หยิบของออกจากจุดนี้</p></div></div><div class="self-field" ${state.employees.length?'':'hidden'}><label for="self-requester">ชื่อผู้เบิก / ผู้หยิบ <span aria-hidden="true">*</span></label><select id="self-requester" required aria-describedby="self-requester-info">${employeeOptions(draft.requesterId)}</select><p id="self-requester-info" class="self-field-hint">${employeeSummary(draft.requesterId)}</p></div>${draft.requesterId==='manual'?manualFields('requester'):''}<fieldset class="self-purpose"><legend>หยิบให้ใคร</legend><label class="${!draft.onBehalf?'selected':''}"><input type="radio" name="self-purpose" value="self" ${!draft.onBehalf?'checked':''}><span>ใช้เอง</span></label><label class="${draft.onBehalf?'selected':''}"><input type="radio" name="self-purpose" value="other" ${draft.onBehalf?'checked':''}><span>หยิบให้ผู้อื่น</span></label></fieldset>${draft.onBehalf?`<div class="self-field self-recipient-field"><div ${state.employees.length?'':'hidden'}><label for="self-recipient">ผู้รับจริง <span aria-hidden="true">*</span></label><select id="self-recipient" required aria-describedby="self-recipient-info">${employeeOptions(draft.recipientId,draft.requesterId)}</select><p id="self-recipient-info" class="self-field-hint">${employeeSummary(draft.recipientId)}</p></div>${draft.recipientId==='manual'?manualFields('recipient'):''}</div>`:''}</section><section class="self-section" aria-labelledby="self-items-title"><div class="self-section-heading"><span class="self-step">2</span><div><h2 id="self-items-title">หยิบอะไรไปบ้าง</h2><p>ใส่จำนวน และตรวจวันหมดอายุให้ตรงกับของจริง</p></div><span class="self-item-count">${items.length} รายการประจำจุด</span></div><div class="self-items">${items.map(row=>itemCard(row,state)).join('')||'<div class="self-no-items">ยังไม่มีรายการประจำจุด กรุณาติดต่อผู้ดูแล</div>'}</div></section><section class="self-section self-note-section"><div class="self-field"><label for="self-note">หมายเหตุ <small>(ถ้ามี)</small></label><textarea id="self-note" rows="2" maxlength="500" placeholder="เช่น ใช้ปฐมพยาบาล หรือหยิบให้ทีมงาน">${esc(draft.note)}</textarea></div><p class="self-privacy-note">${icon('info')} ชื่อผู้เบิกเป็นข้อมูลที่ระบุด้วยตนเอง ใช้เพื่อติดตามการหยิบใช้เฉพาะจุดนี้</p></section></form><div class="self-submitbar"><div class="self-submit-inner"><div class="self-submit-summary"><b id="self-summary">${draft.lines.length?`เลือก ${n(draft.lines.length)} รายการแล้ว`:'ยังไม่ได้เลือกรายการ'}</b><span>${date(state.asOf,true)} · ${draft.onBehalf?'หยิบให้ผู้อื่น':'ใช้เอง'}</span></div><button type="submit" form="self-form" id="self-confirm" ${!draft.lines.length||submitting?'disabled':''}>${icon('check')}<span>${submitting?'กำลังบันทึก…':'ยืนยันรายการที่หยิบใช้'}</span></button></div><p>ตรวจของและจำนวนให้ตรงกับที่หยิบจริงก่อนยืนยัน</p></div>`;
  }

  function itemCard(record,state) {
    const selected = draftLine(record.id);
    const lots = availableLots(state,record.id,locationId);
    const balance = itemBalance(state,record.id,locationId);
    const pending = pendingExpiryLots(state,record.id,locationId);
    const expired = state.lots.filter(lot=>lot.locationId===locationId&&lot.itemId===record.id&&lot.quantity>0&&lot.expiry&&expiryDays(lot.expiry,state.asOf)<0);
    const itemGlyph = {'droplets':'droplet','test-tube':'test'}[record.icon] || record.icon;
    return `<article class="self-item ${selected?'is-selected':''} ${!balance?'is-unavailable':''}"><div class="self-item-top"><span class="self-item-icon">${icon(itemGlyph)}</span><div class="self-item-name"><h3>${esc(record.name)}</h3><p>${esc(record.generic)}</p></div><div class="self-stock"><b>${n(balance)}</b><span>${esc(record.unit)} พร้อมใช้</span></div></div><div class="self-expiry-line">${icon('calendar')}${lots.length?`หมดอายุเร็วสุด ${(lots[0].expiry?date(lots[0].expiry,true):'ไม่กำหนดวันหมดอายุ')}${lots.length>1?` <span class="self-lot-count">${lots.length} ล็อต</span>`:''}`:pending.length?'รอยืนยันวันหมดอายุ · ไม่พร้อมจ่าย':expired.length?'พบล็อตหมดอายุ · ไม่พร้อมจ่าย':'ไม่มีล็อตพร้อมใช้'}</div>${selected?`<div class="self-picked"><div class="self-quantity-field"><label for="self-quantity-${record.id}">จำนวนที่หยิบ <small>(${esc(record.unit)})</small></label><div class="self-quantity"><button type="button" data-self-decrease="${record.id}" aria-label="ลดจำนวน ${esc(record.name)}" ${selected.quantity<=1?'disabled':''}>−</button><input id="self-quantity-${record.id}" data-self-quantity="${record.id}" type="number" min="1" step="1" inputmode="numeric" value="${selected.quantity}" required aria-label="จำนวนที่หยิบ ${esc(record.name)}"><button type="button" data-self-increase="${record.id}" aria-label="เพิ่มจำนวน ${esc(record.name)}">+</button></div></div><button type="button" class="self-remove" data-self-remove="${record.id}" aria-label="นำ ${esc(record.name)} ออกจากรายการ">นำออก</button></div>${lots.length>1?`<div class="self-field self-lot-field"><label for="self-lot-${record.id}">ล็อตที่หยิบจริง <span aria-hidden="true">*</span></label><select id="self-lot-${record.id}" data-self-lot="${record.id}" required><option value="">เลือกลอตให้ตรงกับบรรจุภัณฑ์</option>${lots.map(lot=>`<option value="${esc(lot.id)}" ${selected.lotId===lot.id?'selected':''}>${esc(lot.code)} · หมดอายุ ${date(lot.expiry,true)} · ${lot.quantity} ${esc(record.unit)}</option>`).join('')}</select><p class="self-field-hint">เลือกจากเลขล็อตและวันหมดอายุที่พบบนของจริง</p></div>`:`<div class="self-lot-single">${icon('check')}<div><b>ล็อต ${esc(lots[0]?.code||'—')}</b><span>หมดอายุ ${lots[0]?(lots[0].expiry?date(lots[0].expiry,true):'ไม่กำหนดวันหมดอายุ'):'—'} · ตรวจให้ตรงกับบรรจุภัณฑ์</span></div></div>`}`:`<button class="self-add" type="button" data-self-add="${record.id}" ${!balance?'disabled':''}>${icon('cross')}${balance?'เลือกรายการนี้':'ไม่พร้อมใช้'}</button>`}${pending.length?`<p class="self-expired-warning">รอยืนยันวันหมดอายุ ${n(pending.reduce((sum,lot)=>sum+lot.quantity,0))} ${esc(record.unit)} แยกจากยอดพร้อมใช้</p>`:''}${expired.length?`<p class="self-expired-warning">มีของหมดอายุ ${n(expired.reduce((sum,lot)=>sum+lot.quantity,0))} ${esc(record.unit)} แยกจากยอดพร้อมใช้</p>`:''}</article>`;
  }

  function bindForm() {
    find('#self-requester').onchange = event => {
      draft.requesterId=event.target.value;
      if(draft.recipientId===draft.requesterId&&draft.requesterId!=='manual')draft.recipientId='';
      render(); find('#self-requester-name')?.focus();
    };
    root.querySelectorAll('[name="self-purpose"]').forEach(input=>input.onchange=event=>{
      draft.onBehalf=event.target.value==='other';if(draft.onBehalf&&!draft.recipientId)draft.recipientId='manual';
      if(!draft.onBehalf)draft.recipientId='';
      render(); (draft.onBehalf?find('#self-recipient-name'):find('[name="self-purpose"]:checked'))?.focus();
    });
    if(find('#self-recipient'))find('#self-recipient').onchange=event=>{
      draft.recipientId=event.target.value;
      render(); find('#self-recipient').focus();
    };
    root.querySelectorAll('[data-self-manual]').forEach(input=>input.oninput=event=>{
      const value=input.dataset.selfManual==='requester'?draft.manualRequester:draft.manualRecipient;
      value[input.dataset.personField]=event.target.value;
    });
    find('#self-note').oninput=event=>{draft.note=event.target.value;};
    root.querySelectorAll('[data-self-add]').forEach(button=>button.onclick=()=>{
      if(draft.lines.length>=8)return showError('เพิ่มได้สูงสุด 8 รายการต่อครั้ง');
      const id=button.dataset.selfAdd;
      const lots=availableLots(getState(),id,locationId);
      if(!lots.length)return showError('รายการนี้ไม่มีล็อตพร้อมใช้ กรุณาติดต่อผู้ดูแล');
      draft.lines.push({itemId:id,quantity:1,lotId:lots.length===1?lots[0].id:''});
      error=''; render(); find(`#self-quantity-${id}`).focus({preventScroll:true});
    });
    root.querySelectorAll('[data-self-remove]').forEach(button=>button.onclick=()=>{
      const id=button.dataset.selfRemove;
      draft.lines=draft.lines.filter(row=>row.itemId!==id);
      error='';render();find(`[data-self-add="${id}"]`)?.focus({preventScroll:true});
    });
    root.querySelectorAll('[data-self-quantity]').forEach(input=>input.oninput=event=>{
      const line=draftLine(input.dataset.selfQuantity);
      line.quantity=event.target.value===''?0:Number(event.target.value);
      const decrease=find(`[data-self-decrease="${line.itemId}"]`);
      if(decrease)decrease.disabled=line.quantity<=1;
    });
    root.querySelectorAll('[data-self-decrease],[data-self-increase]').forEach(button=>button.onclick=()=>{
      const id=button.dataset.selfIncrease||button.dataset.selfDecrease;
      const line=draftLine(id);
      line.quantity=Math.max(1,(Number.isSafeInteger(line.quantity)?line.quantity:0)+(button.dataset.selfIncrease?1:-1));
      find(`#self-quantity-${id}`).value=line.quantity;
      find(`[data-self-decrease="${id}"]`).disabled=line.quantity<=1;
    });
    root.querySelectorAll('[data-self-lot]').forEach(select=>select.onchange=event=>{draftLine(select.dataset.selfLot).lotId=event.target.value;});
    find('#self-form').onsubmit=submit;
  }

  function showError(message) {
    error=message;
    const alert=find('#self-error');
    if(alert){alert.hidden=false;alert.textContent=message;alert.focus({preventScroll:true});alert.scrollIntoView({block:'center',behavior:'smooth'});}
  }

  async function submit(event) {
    event.preventDefault();
    if(submitting)return;
    submitting=true;
    const button=find('#self-confirm');
    button.disabled=true;button.querySelector('span').textContent='กำลังบันทึก…';
    try {
      const before=getState();
      const events=await submitIssue({
        locationId,mode:'self_service',requesterId:draft.requesterId,
        recipientId:draft.onBehalf?draft.recipientId:draft.requesterId,
        onBehalf:draft.onBehalf,date:before.asOf,
        requesterPerson:draft.requesterId==='manual'?{...draft.manualRequester}:undefined,
        recipientPerson:draft.onBehalf&&draft.recipientId==='manual'?{...draft.manualRecipient}:undefined,
        lines:draft.lines.map(row=>({...row})),note:draft.note,
      },idempotencyKey);
      if(!Array.isArray(events)||!events.length)throw new Error('ระบบไม่ส่งหลักฐานรายการกลับมา กรุณาลองยืนยันอีกครั้ง');
      receipt=events;delete root.dataset.pending;
      error='';submitting=false;render();find('#self-receipt-title').focus();
    } catch(failure) {
      submitting=false;
      if(failure.uncertain){root.dataset.pending='true';find('#self-form').querySelectorAll('input,select,textarea,button').forEach(el=>el.disabled=true);}else{delete root.dataset.pending;find('#self-form').querySelectorAll('input,select,textarea,button').forEach(el=>el.disabled=false);}
      button.disabled=!draft.lines.length;button.querySelector('span').textContent='ยืนยันรายการที่หยิบใช้';
      showError(failure.uncertain?'ยังยืนยันผลไม่ได้ ลองยืนยันคำขอเดิมอีกครั้ง โดยไม่เปลี่ยนรายการ':failure.message||'ยังบันทึกไม่ได้ กรุณาตรวจสอบรายการแล้วลองอีกครั้ง');
    }
  }

  function receiptHtml() {
    const first=receipt[0];
    return `<section class="self-receipt"><div class="self-receipt-symbol">${icon('checkCircle')}</div><p class="self-overline">บันทึกเรียบร้อย</p><h2 id="self-receipt-title" tabindex="-1">ขอบคุณที่ลงรายการ</h2><p class="self-receipt-subtitle">บันทึก ${n(receipt.length)} รายการ และอัปเดตสต็อกจุดนี้แล้ว</p><div class="self-receipt-reference"><span>${esc(first.documentId.toUpperCase())}</span><span>${date(first.date,true)}</span></div><dl class="self-receipt-people"><div><dt>ผู้หยิบ / ผู้เบิก</dt><dd>${esc(first.requester.name)}<small>${first.requester.code?`${esc(first.requester.code)} · `:''}${esc(first.requester.department)}</small></dd></div><div><dt>ผู้รับจริง</dt><dd>${esc(first.recipientPerson.name)}<small>${first.onBehalf?'หยิบให้ผู้อื่น':'ผู้เบิกใช้เอง'}</small></dd></div><div><dt>ผู้บันทึก</dt><dd>${esc(first.recordedBy.name)}<small>บันทึกด้วยตนเอง · ยังไม่ยืนยันตัวตน</small></dd></div></dl><div class="self-receipt-lines">${receipt.map(event=>`<div class="self-receipt-line"><div><b>${esc(item(event.itemId).name)}</b>${event.allocations.map(lot=>`<p>ล็อต ${esc(lot.code)} · หมดอายุ ${date(lot.expiry,true)}<br>${n(lot.quantity)} ${esc(item(event.itemId).unit)} จากล็อตนี้</p>`).join('')}</div><strong>${n(event.quantity)}<small>${esc(item(event.itemId).unit)}</small></strong></div>`).join('')}</div>${first.note?`<div class="self-receipt-note"><b>หมายเหตุ</b><p>${esc(first.note)}</p></div>`:''}<button class="self-new" id="self-new">${icon('cross')}บันทึกครั้งใหม่</button><p class="self-receipt-private">หน้านี้แสดงเฉพาะรายการที่เพิ่งบันทึก ไม่มีประวัติของพนักงานคนอื่น</p></section>`;
  }

  render();
}
