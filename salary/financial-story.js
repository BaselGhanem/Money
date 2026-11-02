(function financialModule(){
  'use strict';
  const ANCHOR=`17056177-1328-483d-91a0-0fb743ff1f89`;
  const cents=value=>Math.round((Number(value)||0)*100);
  const amount=value=>cents(value)/100;
  const nextMonth=month=>{const [y,m]=month.split(`-`).map(Number);const date=new Date(y,m,1);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,`0`)}`};
  const esc=value=>String(value??``).replace(/[&<>"']/g,c=>({'&':`&amp;`,'<':`&lt;`,'>':`&gt;`,'"':`&quot;`,"'":`&#39;`}[c]));
  const entries=st=>Object.entries(st.months||{}).flatMap(([month,data])=>(data.items||[]).map(item=>({month,item})));
  const anchor=item=>item?.type===`income`&&item.recurrenceId===ANCHOR;
  const ruleFor=(st,item)=>(st.recurrences||[]).find(rule=>rule.id===item?.recurrenceId);
  function allBalances(st,date,omitId=``){
    const balances=Object.fromEntries(Object.entries(st.accounts||{}).map(([name,data])=>[name,cents(data.opening)]));
    for(const data of Object.values(st.months||{})){
      for(const x of data.items||[]){
        if(x.completed!==true||x.id===omitId||x.date>date||!Object.hasOwn(balances,x.account))continue;
        balances[x.account]+=x.type===`expense`?-cents(x.amount):cents(x.amount);
      }
      for(const x of data.transfers||[]){
        if(x.completed!==true||x.date>date)continue;
        if(Object.hasOwn(balances,x.from))balances[x.from]-=cents(x.amount);
        if(Object.hasOwn(balances,x.to))balances[x.to]+=cents(x.amount);
      }
    }
    return Object.fromEntries(Object.entries(balances).map(([name,value])=>[name,value/100]));
  }
  function cycles(st){
    const events=st.salaryCycleEvents||[];
    const salaries=entries(st).filter(({item})=>(anchor(item)||Boolean(item.salaryInstallmentOf))&&item.completed===true&&item.date)
      .sort((a,b)=>a.item.date.localeCompare(b.item.date)||String(a.item.confirmedAt||a.item.createdAt||``).localeCompare(String(b.item.confirmedAt||b.item.createdAt||``)));
    const groups=new Map();
    for(const {item} of salaries){
      const month=item.recurrenceMonth||item.date.slice(0,7),label=nextMonth(month);
      const record=events.find(x=>x.anchorId===item.id);
      const group=groups.get(month)||{id:`cycle-${month}`,label,anchorMonth:month,startDate:item.date,startAt:record?.startedAt||item.confirmedAt||`${item.date}T00:00:00`,payments:[],snapshot:record?.opening||null,quality:record?.quality||`reconstructed`,reconciliation:record?.reconciliation||{},record};
      group.payments.push(item);
      if(item.date<group.startDate){group.startDate=item.date;group.startAt=record?.startedAt||item.confirmedAt||`${item.date}T00:00:00`;group.snapshot=record?.opening||null;group.quality=record?.quality||`reconstructed`;}
      groups.set(month,group);
    }
    const sorted=[...groups.values()].sort((a,b)=>a.startDate.localeCompare(b.startDate)||a.startAt.localeCompare(b.startAt));
    sorted.forEach((cycle,index)=>{
      cycle.endDate=sorted[index+1]?.startDate||null;
      cycle.closed=Boolean(cycle.endDate);
      cycle.endSnapshot=sorted[index+1]?.snapshot||null;
      cycle.snapshot||=allBalances(st,cycle.startDate,cycle.payments[0].id);
      cycle.quality=cycle.record?.quality||`reconstructed`;
    });
    return sorted;
  }
  const active=st=>cycles(st).at(-1)||null;
  function cycleAt(st,date){
    return cycles(st).findLast(cycle=>cycle.startDate<=date&&(!cycle.endDate||date<cycle.endDate))||null;
  }
  function isLocked(st,date){
    if(!date)return false;
    return cycles(st).some(cycle=>cycle.closed&&date>=cycle.startDate&&date<cycle.endDate);
  }
  function confirmSalary(st,item){
    if(!anchor(item)||item.completed!==true||item.salaryInstallmentOf)return false;
    st.salaryCycleEvents||=[];
    if(st.salaryCycleEvents.some(x=>x.anchorId===item.id))return false;
    const month=item.recurrenceMonth||item.date.slice(0,7);
    const old=cycles(st).find(cycle=>cycle.anchorMonth===month&&cycle.payments.some(payment=>payment.id!==item.id));
    const now=new Date().toISOString();
    item.confirmedAt||=now;
    const opening=old?.snapshot||allBalances(st,item.date,item.id);
    st.salaryCycleEvents.push({id:item.id,anchorId:item.id,anchorMonth:month,startedAt:item.confirmedAt,opening,quality:old?old.quality:(item.date===new Intl.DateTimeFormat(`en-CA`,{year:`numeric`,month:`2-digit`,day:`2-digit`,timeZone:`Asia/Amman`}).format(new Date())?`recorded`:`reconstructed`),reconciliation:{opening:{},closing:{}},createdAt:now});
    return true;
  }
  function status(st,item,today){
    if(item.completed===true)return `done`;
    if(item.type===`expense`&&!item.obligationId&&item.obligationTotal!==undefined){
      const total=cents(item.obligationTotal);
      const paid=entries(st).filter(({item:payment})=>payment.obligationId===item.id&&payment.completed===true).reduce((sum,{item:payment})=>sum+cents(payment.amount),0);
      if(total-paid<=0)return `done`;
    }
    const rule=ruleFor(st,item),linked=item.salaryLinked??rule?.salaryLinked;
    const targetMonth=item.recurrenceMonth||item.date?.slice(0,7);
    const intended=item.recurrenceMonth?nextMonth(item.recurrenceMonth):Number(item.date?.slice(-2))>=28?nextMonth(targetMonth):targetMonth;
    const target=linked&&targetMonth?intended:null;
    if(target){if(!cycles(st).some(cycle=>cycle.label===target))return `waitingSalary`;if(rule?.valueMode===`variable`&&item.invoiceConfirmed!==true)return `needsAmount`;return item.date<today?`overdue`:`due`}
    if(item.date>today)return `upcoming`;
    if(rule?.valueMode===`variable`&&item.invoiceConfirmed!==true)return `needsAmount`;
    return item.date<today?`overdue`:`due`;
  }
  const statusNames={done:`منفذ`,waitingSalary:`بانتظار الراتب`,upcoming:`قادم`,needsAmount:`تحتاج تحديد القيمة`,overdue:`متاخر`,due:`مطلوب الان`};
  function canPay(st,item){
    const rule=ruleFor(st,item);
    return !(rule?.valueMode===`variable`&&item.invoiceConfirmed!==true);
  }
  function lastConfirmed(st,ruleId){
    const candidates=entries(st).filter(({item})=>item.recurrenceId===ruleId&&(item.invoiceConfirmed===true||(item.completed===true&&item.invoiceConfirmed!==false))&&Number.isFinite(Number(item.obligationTotal??item.amount)))
      .sort((a,b)=>b.item.date.localeCompare(a.item.date));
    if(candidates.length)return amount(candidates[0].item.obligationTotal??candidates[0].item.amount);
    const rule=(st.recurrences||[]).find(x=>x.id===ruleId);
    return amount(rule?.lastConfirmedAmount??rule?.template?.amount??0);
  }
  function configure(st,id,linked,variable){
    const rule=(st.recurrences||[]).find(x=>x.id===id);
    if(!rule||anchor({type:`income`,recurrenceId:id}))throw Error(`لا يمكن تعديل قاعدة الراتب`);
    rule.salaryLinked=Boolean(linked);
    const previous=rule.valueMode||`fixed`;
    rule.valueMode=variable?`variable`:`fixed`;
    if(variable&&previous!==`variable`)rule.lastConfirmedAmount=lastConfirmed(st,id);
    for(const {item} of entries(st)){
      if(item.recurrenceId!==id||item.completed===true||item.obligationId||isLocked(st,item.date))continue;
      const hasPayment=entries(st).some(x=>x.item.obligationId===item.id&&x.item.completed===true);
      if(hasPayment)continue;
      if(variable){
        if(item.invoiceConfirmed===undefined){item.invoiceConfirmed=false;item.estimatedAmount=lastConfirmed(st,id);}
        if(item.invoiceConfirmed===false){item.obligationTotal=item.estimatedAmount;item.amount=item.estimatedAmount;}
      }else{delete item.invoiceConfirmed;delete item.estimatedAmount;}
    }
  }
  function confirmInvoice(st,id,value){
    const record=entries(st).find(({item})=>item.id===id);
    if(!record||record.item.type!==`expense`)throw Error(`الالتزام غير موجود`);
    const item=record.item,rule=ruleFor(st,item);
    if(rule?.valueMode!==`variable`)throw Error(`الالتزام ليس فاتورة متغيرة`);
    const total=amount(value);
    if(!Number.isFinite(Number(value))||String(value).trim()===``||total<=0)throw Error(`ادخل مبلغا صحيحا`);
    const paid=entries(st).filter(x=>x.item.obligationId===id&&x.item.completed===true).reduce((sum,x)=>sum+cents(x.item.amount),0)/100;
    if(total+0.005<paid)throw Error(`قيمة الفاتورة لا يمكن ان تقل عن المبلغ المدفوع`);
    item.obligationTotal=total;
    item.amount=amount(total-paid);
    item.invoiceConfirmed=true;
    delete item.estimatedAmount;
    item.completed=item.amount<0.005;
    item.invoiceConfirmedAt=new Date().toISOString();
    rule.lastConfirmedAmount=total;
    for(const {item:future} of entries(st)){
      if(future.id===id||future.recurrenceId!==rule.id||future.completed===true||future.invoiceConfirmed!==false||future.date<=item.date||isLocked(st,future.date))continue;
      if(entries(st).some(x=>x.item.obligationId===future.id&&x.item.completed===true))continue;
      future.estimatedAmount=total;future.obligationTotal=total;future.amount=total;
    }
  }
  function carry(st,today){
    const current=active(st);if(!current)return false;
    st.salaryCarryEvents||=[];
    let changed=false;
    for(const {month,item} of entries(st)){
      if(item.type!==`expense`||item.obligationId||item.completed===true||!item.date||item.date>=today)continue;
      const attached=cycleAt(st,item.date),target=current.id;
      if(attached?.id===target||st.salaryCarryEvents.some(event=>event.itemId===item.id&&event.toCycleId===target))continue;
      if(item.date>=current.startDate){
        const linked=ruleFor(st,item)?.salaryLinked;
        if(!linked)continue;
        const intended=nextMonth(item.recurrenceMonth||month);
        if(intended===current.label)continue;
      }
      const paid=entries(st).filter(x=>x.item.obligationId===item.id&&x.item.completed===true).reduce((total,x)=>total+cents(x.item.amount),0);
      const remaining=Math.max(0,cents(item.obligationTotal??item.amount)-paid)/100;
      if(remaining<=0)continue;
      st.salaryCarryEvents.push({id:`${item.id}:${target}`,itemId:item.id,fromCycleId:attached?.id||`pre-cycle`,toCycleId:target,originalDate:item.originalPlannedDate||item.date,remainingAtCarry:remaining,recordedAt:new Date().toISOString()});
      changed=true;
    }
    return changed;
  }
  function movementCycle(st,item){
    if(item.completed!==true)return null;
    return cycleAt(st,item.date);
  }
  function story(st,chosen){
    const cs=cycles(st);const selected=cs.find(x=>x.id===chosen)||cs.at(-1);
    if(!selected)return null;
    const next=selected.endDate;
    const start=selected.startDate;
    const included=entries(st).filter(({item})=>item.completed===true&&item.date>=start&&(!next||item.date<next));
    const incomers=included.filter(x=>x.item.type===`income`);
    const spenders=included.filter(x=>x.item.type===`expense`);
    const adjustments=included.filter(x=>![`income`,`expense`].includes(x.item.type));
    const sum=xs=>xs.reduce((v,x)=>v+cents(x.item.amount),0)/100;
    const income=sum(incomers),expense=sum(spenders),adj=sum(adjustments);
    const first=selected.snapshot||{},last=selected.endSnapshot||allBalances(st,new Date().toISOString().slice(0,10));
    const total=object=>Object.values(object).reduce((v,x)=>v+cents(x),0)/100;
    const byCategory={};
    for(const {item} of spenders){const cat=item.category||`غير مصنف`;byCategory[cat]=(byCategory[cat]||0)+cents(item.amount);}
    const carried=(st.salaryCarryEvents||[]).filter(x=>x.toCycleId===selected.id);
    return {cycle:selected,cycles:cs,income,expense,adjustments:adj,opening:total(first),closing:total(last),first,last,incomers,spenders,carried,categories:Object.entries(byCategory).map(([name,value])=>({name,value:value/100})).sort((a,b)=>b.value-a.value)};
  }
  function render(st,chosen){
    const el=document.getElementById(`financialStoryContent`);if(!el)return;
    if(chosen)window.FinancialStory.selectedCycle=chosen;
    const data=story(st,chosen||window.FinancialStory.selectedCycle);
    if(!data){el.innerHTML=`<div class="fs-empty"><h3>قصتك المالية تبدأ من الراتب</h3><p>عند تأكيد حركة إيداع الراتب من شركتي إلى بنكي ستظهر دورة الراتب هنا، ويمكن مراجعة الحركات السابقة من التقارير العادية</p></div>`;return;}
    const {cycle}=data,fmt=value=>`${Number(value||0).toLocaleString(`en-US`,{minimumFractionDigits:2,maximumFractionDigits:2})} د.أ`,diff=data.opening+data.income-data.expense+data.adjustments-data.closing;
    const badge=cycle.closed?`مغلقة · بانتظار المطابقة`:`مفتوحة`;
    const confidence=cycle.quality===`recorded`?`لقطة محفوظة`:`معاد بناؤها · تحتاج تدقيق`;
    const segments=[{key:`open`,tag:`01 / THE BEGINNING`,name:`قبل نزول الراتب`,value:data.opening,desc:confidence},
      {key:`income`,tag:`02 / THE ARRIVALS`,name:`كل ما دخل`,value:data.income,desc:`الراتب والدخل الاضافي المقبوض`},
      {key:`expense`,tag:`03 / THE SPENDING`,name:`كل ما خرج`,value:data.expense,desc:`مصاريف منفذة فقط`},
      {key:`end`,tag:`04 / THE OUTCOME`,name:`الرصيد في نهاية الدورة`,value:data.closing,desc:cycle.closed?`عند بداية الدورة التالية`:`الرصيد المحسوب حاليا`}];
    const accountRows=Object.keys(st.accounts||{}).map(name=>`<tr><td>${esc(name)}</td><td>${fmt(data.first[name])}</td><td>${fmt(data.last[name])}</td><td>${fmt((data.last[name]||0)-(data.first[name]||0))}</td></tr>`).join(``);
    const categoryRows=data.categories.map(cat=>`<details class="fs-category"><summary><span>${esc(cat.name)}</span><strong>${fmt(cat.value)}</strong></summary>${data.spenders.filter(x=>(x.item.category||`غير مصنف`)===cat.name).map(x=>`<div class="fs-line"><span>${esc(x.item.name)}<small>${esc(x.item.date)} · ${esc(x.item.account)}</small></span><b>${fmt(x.item.amount)}</b></div>`).join(``)}</details>`).join(``);
    const incomeRows=data.incomers.map(x=>`<div class="fs-line"><span>${esc(x.item.name)}<small>${esc(x.item.date)} · ${esc(x.item.account)}</small></span><b>${fmt(x.item.amount)}</b></div>`).join(``);
    el.innerHTML=`<header class="fs-header"><div><span class="fs-eyebrow">FINANCIAL STORY · ${esc(cycle.id)}</span><h2>قصة دورة ${esc(cycle.label)}</h2><p>${esc(cycle.startDate)} ${cycle.closed?`— ${esc(cycle.endDate)}`:`— حتى وصول الراتب التالي`}</p></div><div class="fs-heading-actions"><span class="fs-state">${badge}</span>${!cycle.closed?`<button class="btn ghost" type="button" data-fs-add-installment="${esc(cycle.id)}">تسجيل دفعة راتب مكملة</button>`:``}</div></header>
      <div class="fs-controls"><label>اختيار الدورة <select id="fsCycleSelect">${data.cycles.slice().reverse().map(c=>`<option value="${esc(c.id)}" ${c.id===cycle.id?`selected`:``}>${esc(c.label)} · ${c.closed?`مغلقة`:`مفتوحة`}</option>`).join(``)}</select></label><span class="fs-confidence">${confidence}</span></div>
      <div class="fs-opening"><span>THE MONEY JOURNEY</span><h3>من رصيد البداية الى اخر دينار</h3><p>كل رقم قابل للتتبع من الحركة والحساب والتاريخ</p></div>
      <div class="fs-chapters">${segments.map((x,i)=>`<article class="fs-chapter" style="--fs-order:${i}"><small>${x.tag}</small><h3>${x.name}</h3><strong class="moneyValue">${fmt(x.value)}</strong><p>${x.desc}</p></article>`).join(``)}</div>
      <section class="fs-panel"><div class="fs-panel-head"><h3>الارصدة حسب الحساب</h3><span>BEFORE / AFTER</span></div><div class="fs-table-scroll"><table><thead><tr><th>الحساب</th><th>قبل الراتب</th><th>نهاية الدورة</th><th>التغير</th></tr></thead><tbody>${accountRows}</tbody></table></div></section>
      <div class="fs-panel-grid"><section class="fs-panel"><div class="fs-panel-head"><h3>مصادر الدخل</h3><span>INCOME</span></div>${incomeRows||`<p class="fs-muted">لا يوجد دخل منفذ ضمن هذه الدورة</p>`}</section>
      <section class="fs-panel"><div class="fs-panel-head"><h3>اين صرفت مصاريك؟</h3><span>SPENDING</span></div>${categoryRows||`<p class="fs-muted">لا توجد مصاريف منفذة ضمن هذه الدورة</p>`}</section></div>
      <section class="fs-panel"><div class="fs-panel-head"><h3>الالتزامات المرحلة</h3><span>${data.carried.length} حركة</span></div>${data.carried.map(c=>{const x=entries(st).find(y=>y.item.id===c.itemId)?.item;return `<div class="fs-line"><span>${esc(x?.name||`التزام سابق`)}<small>مرحلة من ${esc(c.originalDate)}</small></span><b>${fmt(c.remainingAtCarry)}</b></div>`}).join(``)||`<p class="fs-muted">لا توجد التزامات مرحلة مسجلة</p>`}</section>
      <section class="fs-panel"><div class="fs-panel-head"><h3>مطابقة الارصدة</h3><span>${confidence}</span></div><p class="fs-muted">مطابقة رصيد البداية ورصيد النهاية، دون تغيير ارقام التقرير المقفل</p>
       <h4>رصيد ما قبل الراتب</h4><div class="fs-reconcile-grid">${Object.keys(st.accounts||{}).map(name=>`<label><span>${esc(name)} · المحسوب ${fmt(data.first[name])}</span><input type="number" step="0.01" inputmode="decimal" data-fs-opening="${esc(name)}" value="${data.cycle.record?.reconciliation?.opening?.[name]?.actual??``}" placeholder="الرصيد الفعلي"></label>`).join(``)}</div>
       <button type="button" class="btn ghost" data-fs-reconcile="opening">حفظ مطابقة بداية الدورة</button>
       <h4 style="margin-top:20px">رصيد نهاية الدورة</h4><div class="fs-reconcile-grid">${Object.keys(st.accounts||{}).map(name=>`<label><span>${esc(name)} · المحسوب ${fmt(data.last[name])}</span><input type="number" step="0.01" inputmode="decimal" data-fs-closing="${esc(name)}" value="${data.cycle.record?.reconciliation?.closing?.[name]?.actual??``}" placeholder="الرصيد الفعلي"></label>`).join(``)}</div>
       <button type="button" class="btn primary" data-fs-reconcile="closing">حفظ مطابقة نهاية الدورة</button></section>
      <div class="fs-footer-note">فرق مراجعة حركة الرصيد: ${fmt(diff)} · ${Math.abs(diff)<0.01?`المعادلة متوازنة`:`راجع التسويات او التوقيتات التاريخية`}</div>`;
    el.dataset.cycleId=cycle.id;
  }
  function renderPolicy(st,id){
    const rule=(st.recurrences||[]).find(x=>x.id===id),panel=document.getElementById(`fsPolicyPanel`);
    if(!panel)return;
    if(!rule){const record=entries(st).find(x=>x.item.id===id),item=record?.item;if(!item||item.type!==`expense`)return;panel.innerHTML=`<form id="fsPolicyForm"><h3>استحقاق ${esc(item.name)}</h3><input name="itemId" type="hidden" value="${esc(item.id)}"><label class="fs-check"><input type="checkbox" name="linked" ${item.salaryLinked?`checked`:``}> مرتبط بدورة الراتب</label><p>التغيير يخص هذه الحركة فقط، ولا ينشئ تكرارا جديدا</p><div class="fs-policy-actions"><button class="btn primary" type="submit">حفظ الارتباط</button><button class="btn ghost" type="button" data-fs-close-policy>اغلاق</button></div></form>`;panel.hidden=false;return;}
    const entry=entries(st).filter(x=>x.item.recurrenceId===id&&x.item.type===`expense`).sort((a,b)=>b.item.date.localeCompare(a.item.date))[0]?.item;
    panel.innerHTML=`<form id="fsPolicyForm"><h3>اعدادات ${esc(rule.template.name)}</h3><input type="hidden" name="ruleId" value="${esc(id)}"><label class="fs-check"><input type="checkbox" name="linked" ${rule.salaryLinked?`checked`:``}> مرتبط بنزول الراتب</label><label>نوع المبلغ <select name="mode"><option value="fixed" ${rule.valueMode!==`variable`?`selected`:``}>ثابت شهريا</option><option value="variable" ${rule.valueMode===`variable`?`selected`:``}>متغير · آخر مبلغ مؤكد كتقدير</option></select></label>${entry?`<p>آخر حركة: ${esc(entry.date)} · ${esc(entry.invoiceConfirmed===false?`تقديرية`:`معتمدة او ثابتة`)}</p>`:``}<div class="fs-policy-actions"><button class="btn primary" type="submit">حفظ القاعدة</button><button class="btn ghost" type="button" data-fs-close-policy>اغلاق</button></div></form>`;
    panel.hidden=false;
    panel.scrollIntoView({block:`nearest`,behavior:`smooth`});
  }
  document.addEventListener(`click`,event=>{
    const btn=event.target.closest(`[data-fs-rule],[data-fs-confirm],[data-fs-close-policy],[data-fs-reconcile],[data-fs-add-installment]`);
    if(!btn)return;
    if(btn.hasAttribute(`data-fs-close-policy`)){document.getElementById(`fsPolicyPanel`).hidden=true;return;}
    if(btn.hasAttribute(`data-fs-rule`)){const st=window.SalaryPlannerBridge?.snapshot();if(st)renderPolicy(st,btn.dataset.fsRule);return;}
    if(btn.hasAttribute(`data-fs-confirm`)){
      const id=btn.dataset.fsConfirm,st=window.SalaryPlannerBridge?.snapshot();
      const item=entries(st||{months:{}}).find(x=>x.item.id===id)?.item;
      const raw=prompt(`ادخل مبلغ الفاتورة الفعلي: ${item?.name||``}`,String(item?.obligationTotal??item?.amount??``));
      if(raw!==null)window.dispatchEvent(new CustomEvent(`salary:finance-action`,{detail:{type:`confirmInvoice`,id,amount:raw}}));
      return;
    }
    if(btn.hasAttribute(`data-fs-reconcile`)){const el=document.getElementById(`financialStoryContent`),side=btn.dataset.fsReconcile,actual={};el.querySelectorAll(`[data-fs-${side}]`).forEach(input=>{if(input.value.trim()!==``)actual[input.getAttribute(`data-fs-${side}`)]=input.value});window.dispatchEvent(new CustomEvent(`salary:finance-action`,{detail:{type:`reconcile`,cycleId:el.dataset.cycleId,side,actual}}));return;}
    if(btn.hasAttribute(`data-fs-add-installment`)){const raw=prompt(`مبلغ دفعة الراتب المكملة بالدينار`);if(raw!==null)window.dispatchEvent(new CustomEvent(`salary:finance-action`,{detail:{type:`installment`,cycleId:btn.dataset.fsAddInstallment,amount:raw}}));return;}
  });
  document.addEventListener(`submit`,event=>{if(event.target.id!==`fsPolicyForm`)return;event.preventDefault();const form=new FormData(event.target),itemId=form.get(`itemId`);window.dispatchEvent(new CustomEvent(`salary:finance-action`,{detail:itemId?{type:`itemPolicy`,itemId,linked:form.has(`linked`)}:{type:`policy`,ruleId:form.get(`ruleId`),linked:form.has(`linked`),variable:form.get(`mode`)===`variable`}}))});
  document.addEventListener(`change`,event=>{if(event.target.id===`fsCycleSelect`){const state=window.SalaryPlannerBridge?.snapshot();if(state)render(state,event.target.value)}});
function validation(stored,proposed){
 if(!stored?.months)return true;
 const protectedDate=x=>x?.date&&(window.FinancialStory.isLocked(stored,x.date)||window.FinancialStory.isLocked(proposed,x.date));
 const previous=new Map();
 for(const data of Object.values(stored.months)){
  for(const kind of [`items`,`transfers`])for(const item of data[kind]||[])previous.set(`${kind}:${item.id}`,item);
 }
 const following=new Map();
 for(const data of Object.values(proposed.months||{})){
  for(const kind of [`items`,`transfers`])for(const item of data[kind]||[])following.set(`${kind}:${item.id}`,item);
 }
 for(const [id,item] of previous){
  const next=following.get(id);
  if((protectedDate(item)||protectedDate(next))&&JSON.stringify(item)!==JSON.stringify(next))return false;
 }
 for(const [id,item] of following){
  if(!previous.has(id)&&protectedDate(item))return false;
 }
 return true;
}
  window.FinancialStory={ANCHOR,entries,anchor,validateLockedChanges:validation,cycles,active,cycleAt,isLocked,confirmSalary,status,statusNames,canPay,lastConfirmed,configure,confirmInvoice,carry,story,render,renderPolicy,amount};
})();