import {analyze,grades,defaults,examples} from './engine.mjs';
const $=s=>document.querySelector(s), main=$('#main'), dialog=$('#editor'), form=$('#editForm');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,n=2)=>v==null?'—':Number(v).toLocaleString('en-IN',{minimumFractionDigits:n,maximumFractionDigits:n}),pct=v=>v==null?'—':fmt(v)+'%',currency=v=>'₹'+fmt(v);
const dt=(s,short=false)=>new Date(s+'T00:00:00Z').toLocaleDateString('en-GB',{...(short?{}:{day:'2-digit'}),month:short?'long':'short',year:'numeric',timeZone:'UTC'});
const paths={edit:'M4 20l4-1 12-12-3-3L5 16z M14 7l3 3',check:'m5 12 4 4 10-10',info:'M12 10v6 M12 6v1',sliders:'M3 7h7m4 0h7M3 17h12m4 0h2M10 4v6m5 4v6',plus:'M12 4v16M4 12h16',close:'m6 6 12 12M18 6 6 18',chart:'M3 3v18h18M6 8l5 2 4 4 5 2',arrow:'M4 12h15m-5-5 5 5-5 5',download:'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4'};
const icon=k=>'<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="'+paths[k]+'"/></svg>';
const btn=(id,txt,i='',primary=false)=>'<button data-act="'+id+'" class="'+(primary?'primary':'')+'">'+(i?icon(i):'')+txt+'</button>';
const terms=rows=>'<div class="terms">'+rows.map(([a,b])=>'<div class="term"><span>'+a+'</span><b>'+b+'</b></div>').join('')+'</div>';
const metric=(a,b,c)=>'<div class="metric"><div class="lab">'+a+'</div><strong>'+b+'</strong><div class="hint">'+c+'</div></div>';
const freqs={1:'Annual',2:'Semiannual',4:'Quarterly',12:'Monthly'};
const KEY='bond-desk-workspace-v1';
let profile={...defaults}, bonds=structuredClone(examples), chosen=bonds[0].id, results=[], detail='Cash flows', expanded=false, editMode='',editId='',msgTimer;
let lastFocus=null;
function notice(msg){$('#notice').textContent=msg;clearTimeout(msgTimer);msgTimer=setTimeout(()=>$('#notice').textContent='',4500)}
function persist(){try{localStorage.setItem(KEY,JSON.stringify({profile,bonds,chosen}))}catch{notice('Browser storage is unavailable. Changes last for this session.')}}
function active(){return Math.max(0,bonds.findIndex(b=>b.id===chosen))}
function route(){return ['compare','methodology'].includes(location.hash.slice(1))?location.hash.slice(1):'analyze'}
async function calculate(bs,p){
 if(!window.BOND_API)return bs.map(b=>analyze(b,p));
 const r=await fetch(window.BOND_API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bonds:bs,profile:p})});
 const data=await r.json();if(!r.ok)throw Error(data.error||'Calculation failed.');return data;
}
function head(title,desc,actions=''){return '<section class="pagehead"><div><h1>'+title+'</h1><p>'+desc+'</p></div><div class="controls">'+actions+'</div></section>'}
function chart(r){
 const pts=r.shocks, y=pts.map(s=>s.price),lo=Math.min(...y),hi=Math.max(...y),x=i=>57+i*(520/(pts.length-1)),v=a=>135-(a-lo)/(hi-lo||1)*109;
 const line=pts.map((p,i)=>(i?'L':'M')+x(i)+' '+v(p.price)).join(' '), ci=pts.findIndex(p=>p.bp===0);
 let grid='';for(let i=0;i<=3;i++){const val=lo+(hi-lo)*i/3;grid+='<path d="M57 '+v(val)+'H577" stroke="#d7dfd5" stroke-dasharray="3 4"/><text x="46" y="'+(v(val)+4)+'" text-anchor="end">'+fmt(val,1)+'</text>'}
 return '<svg class="chart" role="img" aria-label="Price decreases as yield rises. Exact values are available under Rate scenarios." viewBox="0 0 610 170"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#9cbda4" stop-opacity=".48"/><stop offset="1" stop-color="#dce9d9" stop-opacity=".12"/></linearGradient></defs>'+grid+'<path d="'+line+' L577 135H57Z" fill="url(#area)"/><path d="M'+x(ci)+' 15V135" stroke="#a58c4d" stroke-dasharray="3 3"/><path d="'+line+'" fill="none" stroke="#245b46" stroke-width="2.8"/>'+pts.map((p,i)=>'<g><title>'+pct(r.ytm+p.bp/100)+' yield · '+fmt(p.price)+' clean price</title><circle cx="'+x(i)+'" cy="'+v(p.price)+'" r="'+(i===ci?5.4:3.3)+'" fill="'+(i===ci?'#ab8d52':'#245b46')+'"/>'+(i%2===0?'<text text-anchor="middle" x="'+x(i)+'" y="160">'+pct(r.ytm+p.bp/100)+'</text>':'')+'</g>').join('')+'</svg>'
}
function rec(b,r){
 const positive=r.verdict==='Consider purchase';
 const intro=positive?'The modeled return clears your hurdle by <b>'+fmt(r.edge*100,0)+' basis points</b>. Its rating, liquidity and maturity also meet your limits.':[...r.fail,...r.missing].map(esc).join(' ');
 return '<section class="panel recommend"><div class="plothead"><h2>Investor fit</h2><span class="symbol">'+icon('sliders')+'</span></div><div class="verdict '+(positive?'':'warn')+'"><i>'+icon(positive?'check':'info')+'</i>'+r.verdict+'</div><p class="reasons">'+intro+'</p><p class="screenline">Modeled return <b>'+pct(r.worst)+'</b> &nbsp; / &nbsp; Required <b>'+pct(r.required)+'</b><br>Effective annual yields, before tax.</p><button class="linkbtn" data-act="criteria">Edit investment criteria '+icon('arrow')+'</button></section>';
}
function analyzePage(){
 const ix=active(),b=bonds[ix],r=results[ix],priceLabel=r.dated?'Price incl. accrued':'Clean price';
 let html=head('Bond analysis','Evaluate the price, return and risk of a fixed-rate bond.',btn('edit','Edit bond','edit',true));
 html+='<section class="cert"><div class="copy"><span class="micro">'+(b.sample?'Illustrative bond':'Your bond')+'</span><h2>'+esc(b.name)+'</h2><p>'+pct(b.coupon)+' fixed coupon &nbsp;·&nbsp; INR &nbsp;·&nbsp; '+dt(b.maturity,true)+' <span class="rating">'+esc(b.rating)+'</span></p></div></section>';
 if(r.blocked)return html+'<section class="panel"><h2>Valuation on hold</h2><p class="after">'+esc(r.missing[0])+'</p><p class="sub">Choose the repayment type in Edit bond. For installments, add the payment dates, interest and principal in Payment schedule. Incomplete entries are excluded from purchase rankings.</p>'+btn('edit','Enter payment schedule','edit',true)+'</section><div class="after"><a href="#compare">View all bonds</a></div>';
 const metrics=r.price===null
   ? [metric(r.dated?'Purchase limit before fees':'Fair clean price',fmt(r.fair),'Per ₹100 '+(r.dated?'outstanding principal':'face value')),
      metric('Required yield',pct(r.required),'Effective annual hurdle'),
      metric(r.dated?'Remaining interest':'Annual coupon income',currency(r.dated?r.totalInterest:r.annualCoupon),'Per bond, before tax'),
      metric(r.dated?'Payments remaining':'Accrued interest',r.dated?r.flows.length:currency(r.accrued*b.face/100),r.dated?'From your schedule':'Per bond at settlement')]
   : [metric(r.dated?'Annual return (XIRR)':'Yield to maturity',pct(r.ytm),r.dated?'Effective annual · before fees':'Nominal annual · before fees'),
      metric('Required yield',pct(r.required),'Effective annual hurdle'),
      metric(r.dated?'Purchase limit before fees':'Fair clean price',fmt(r.fair),'Per ₹100 '+(r.dated?'outstanding principal':'face value')),
      metric('Modified duration',fmt(r.duration)+' <span class="unit">yrs</span>','To final maturity')];
 html+='<div class="metrics">'+metrics.join('')+'</div>';
 if(r.price===null){
   html+='<div class="cols"><section class="panel"><h2>Your purchase limit</h2><p class="sub">At a required return of '+pct(r.required)+', the maximum total payable for one bond is <b>'+currency((r.fair+r.accrued+r.fee)*b.face/100)+'</b>, including accrued interest and fees.</p><p class="after">Compare this with the total on your broker’s order screen.</p><button class="linkbtn after" data-act="edit">Enter broker amount '+icon('arrow')+'</button></section>'+rec(b,r)+'</div>';
 }else html+='<div class="cols"><section class="panel"><div class="plothead"><h2>Price–yield curve</h2><span class="symbol">'+icon('chart')+'</span></div><p class="sub">'+priceLabel+' per ₹100 as the market yield changes.</p>'+chart(r)+'<div class="chartnote"><span class="dot"></span> '+priceLabel+' '+fmt(r.price)+' at '+pct(r.ytm)+' yield</div></section>'+rec(b,r)+'</div>';
 html+='<section class="lower"><div class="tabs" aria-label="Analysis details">'+['Cash flows','Rate scenarios','Bond details','Macro scenario'].map(t=>'<button class="tab '+(t===detail?'active':'')+'" aria-pressed="'+(t===detail)+'" data-tab="'+t+'">'+t+'</button>').join('')+'</div><div class="bodypad">';
 if(detail==='Cash flows'){
 const rows=expanded?r.flows:r.flows.slice(0,4);
 html+='<div class="sectionhead tablehead"><div><h3>Expected cash flows</h3><p class="sub">One bond · '+currency(b.face)+' face value · held to maturity</p></div><button class="linkbtn" data-act="csv">'+icon('download')+' Download CSV</button></div><div class="scroll"><table><thead><tr><th>Payment date</th><th>Interest (₹)</th><th>Principal (₹)</th><th>Total (₹)</th></tr></thead><tbody>'+rows.map(x=>'<tr><td>'+dt(x.date)+'</td><td>'+fmt(x.interest??b.face*b.coupon/100/b.frequency)+'</td><td>'+fmt(x.principal??(x.date===b.maturity?b.face:0))+'</td><td>'+fmt(x.amount*b.face/100)+'</td></tr>').join('')+'</tbody></table></div>';
 if(r.flows.length>4)html+='<button class="linkbtn after" data-act="expand">'+(expanded?'Show fewer payments':'Show all '+r.flows.length+' payments')+'</button>';
 }else if(detail==='Rate scenarios' && r.price===null){
 html+='<p>Enter the broker’s total payable to stress-test the offered price.</p>';
 }else if(detail==='Rate scenarios'){
 html+='<h3>Interest-rate stress test</h3><p class="sub tablehead">Instant repricing of maturity cash flows. Credit quality and the settlement date stay fixed.</p><div class="scroll"><table><tr><th>Yield shock</th><th>Market yield</th><th>'+(r.dated?'Price incl. accrued':'Clean price')+'</th><th>Price change</th></tr>'+r.shocks.map(x=>'<tr><td>'+(x.bp>0?'+':'')+x.bp+' bp</td><td>'+pct(r.ytm+x.bp/100)+'</td><td>'+fmt(x.price)+'</td><td>'+pct((x.price/r.price-1)*100)+'</td></tr>').join('')+'</table></div>';
 }else if(detail==='Macro scenario'){html+=macroPanel(b,r)}else{
 html+='<h3>Quote and assumptions</h3>'+terms([['Settlement',dt(profile.settlement)],['Maturity',dt(b.maturity)],[r.dated?'Quote incl. accrued / ₹100':'Clean quote / ₹100',fmt(r.price)],['Accrued interest / ₹100',r.dated?'Included in broker quote':fmt(r.accrued)],['Dirty price / ₹100',fmt(r.dirty)],['Purchase fee / ₹100',fmt(r.fee)],['Total cost per bond',r.cost==null?'—':currency(r.cost*b.face/100)],['Coupon frequency',freqs[b.frequency]],['Current yield',pct(r.current)],[r.dated?'Net XIRR (effective)':'Net YTM (nominal)',pct(r.net)],['Call provision',esc(b.call)],['Net yield to call (nominal)',r.callYield==null?'—':pct(r.callYield)],...(r.callYield!=null?[['Call date',dt(b.callDate)],['Call price / ₹100',fmt(b.callPrice)]]:[]),['Benchmark (effective)',pct(b.benchmark)],['Required risk premium',pct(b.premium)],['Liquidity assessment',esc(b.liquidity)],['Credit rating',esc(b.rating)]]);
 }
 html+='</div></section><div class="bondlist"><label for="pick">Active bond</label><select id="pick">'+bonds.map(b=>'<option value="'+esc(b.id)+'" '+(b.id===chosen?'selected':'')+'>'+esc(b.name)+'</option>').join('')+'</select><button class="linkbtn" data-act="add">Add a bond '+icon('plus')+'</button></div>';
 return html;
}
function comparePage(){
 const ranked=bonds.map((b,i)=>({b,r:results[i]})).sort((a,b)=>(b.r.edge??-Infinity)-(a.r.edge??-Infinity));
 const qualified=ranked.filter(x=>x.r.verdict==='Consider purchase');
 const best=qualified[0],ties=best?qualified.filter(x=>Math.round(x.r.edge*100)===Math.round(best.r.edge*100)):[];
 let h=head('Compare bonds','Screen every bond against the same investment criteria.',btn('criteria','Investment criteria','sliders')+btn('add','Add bond','plus',true));
 h+='<section class="winner"><span class="lab">Comparison result</span><h2>'+(best?(ties.length>1?'Joint best fit':esc(best.b.name)):'No qualifying bond')+'</h2><p>'+(best?(ties.length>1?ties.map(x=>esc(x.b.name)).join(', ')+' meet your screens and tie to the nearest basis point.':(bonds.length===1?'The only bond in this comparison passes your screens. Add another to compare.':'Best fit among '+bonds.length+' bonds. It passes every screen and offers the largest yield above its hurdle.')):'Each candidate misses a requirement or needs more information. See the individual reasons below.')+'</p></section>';
 h+='<section class="comparebox"><div class="sectionhead tablehead"><h2>Side-by-side results</h2><span class="hint">'+bonds.length+' of 20 bonds · INR</span></div><div class="scroll"><table><thead><tr><th>Bond</th><th>Modeled return</th><th>Required</th><th>Excess yield</th><th>Duration</th><th>Investor fit</th><th>Manage</th></tr></thead><tbody>'+ranked.map(({b,r})=>'<tr><td><button class="namebtn" data-open="'+esc(b.id)+'">'+esc(b.name)+'</button><span class="small bondname">'+esc(b.rating)+' · '+dt(b.maturity,true)+(b.sample?' · Example':'')+'</span></td><td>'+pct(r.worst)+'</td><td>'+pct(r.required)+'</td><td>'+(r.edge==null?'—':fmt(r.edge*100,0)+' bp')+'</td><td>'+fmt(r.duration)+(r.duration==null?'':' yrs')+'</td><td><span class="pill '+(r.verdict==='Consider purchase'?'':'other')+'">'+r.verdict+'</span></td><td><div class="comparison-actions"><button class="linkbtn" data-edit="'+esc(b.id)+'">Edit</button>'+(bonds.length>1?'<button class="remove" data-remove="'+esc(b.id)+'" aria-label="Remove '+esc(b.name)+'">Remove</button>':'')+'</div></td></tr>').join('')+'</tbody></table></div><p class="sub footnote">Returns use the lower modeled redemption yield, after purchase fees and before tax, on an effective annual basis. One basis point (bp) is 0.01 percentage point.</p></section>';
 const others=ranked.filter(x=>x.r.verdict!=='Consider purchase');if(others.length)h+='<section class="bodypad"><h3>Why some bonds fall short</h3>'+others.map(({b,r})=>'<p class="after"><b>'+esc(b.name)+'</b> &nbsp;'+[...r.fail,...r.missing].join(' ')+'</p>').join('')+'</section>';
 return h;
}
function macroPanel(b,r){
 if(r.dated)return '<h3>Macro scenario</h3><p class="sub">Use Rate scenarios to reprice this dated payment schedule. The illustrative macro model applies only to regular bullet bonds.</p>';
 const values=macroInputs;
 const labels=['Inflation (%)','Government borrowing (% of GDP)','Fed funds rate (%)','USD/INR annual move (%)'];
 return '<h3>Macro scenario</h3><p class="sub tablehead">Explore the assumptions in the original calculator. These illustrative weights affect this scenario only. A positive FX move means a weaker rupee.</p><form id="macroForm"><div class="fields">'+labels.map((l,i)=>field('macro'+i,l,values[i],'number')).join('')+'</div><button class="after" type="submit">Reprice scenario</button></form><div id="macroResult" aria-live="polite" class="after">'+macroResult(b,r)+'</div><details><summary>How this scenario works</summary><p class="sub">Risk-free proxy = 1.5 + 0.75 × inflation + 0.12 × (borrowing − 6) + 0.25 × Fed rate + 0.15 × FX move, floored at 0.25%. Add the assumed rating spread (AAA 0.50, AA 1.00, A 1.50, BBB 2.50, BB 4.00, B 6.00, CCC 9.00 percentage points) and a term premium of 0.06 points per year capped at 1.50. Rating modifiers use their broad grade. Discount maturity payments at this nominal rate and deduct accrued interest. The coefficients are assumptions from the uploaded model.</p></details>';
}
let macroInputs=[5.5,6,5.25,3];
function macroResult(b,r){
 const [infl,borrow,fed,fx]=macroInputs, rf=Math.max(.25,1.5+.75*infl+.12*(borrow-6)+.25*fed+.15*fx);
 const spread=({AAA:.5,AA:1,A:1.5,BBB:2.5,BB:4,B:6,CCC:9})[b.rating.replace(/[+−]/g,'')];
 if(spread===undefined)return '<p class="note">The macro scenario requires a credit rating from AAA to CCC.</p>';
 const years=(new Date(b.maturity)-new Date(profile.settlement))/86400000/365.25;
 const rate=rf+spread+Math.min(years*.06,1.5), price=r.flows.reduce((sum,x)=>sum+x.amount*(1+rate/(100*b.frequency))**(-x.t),0)-r.accrued;
 return terms([['Risk-free proxy',pct(rf)],['Scenario discount rate',pct(rate)],['Scenario clean price / ₹100',fmt(price)],['Quoted clean price / ₹100',fmt(r.price)]]);
}
main.addEventListener('submit',e=>{
 if(e.target.id!=='macroForm')return;e.preventDefault();
 const v=Array.from(e.target.querySelectorAll('input')).map(x=>x.valueAsNumber);
 if(v.some(x=>!Number.isFinite(x)||Math.abs(x)>100)){notice('Enter macro inputs between −100 and 100.');return}
 macroInputs=v;$('#macroResult').innerHTML=macroResult(bonds[active()],results[active()]);
});

function methodology(){return head('Methodology','How to read the numbers and make a purchase decision.')+'<div class="method">'+[
 ['Start with the bond terms','Enter face value, coupon, payment frequency, maturity and your return assumptions to calculate a fair price. If you have a broker quote, copy the total payable for the order, the number of bonds and the fees included in that total. We subtract fees and accrued interest and convert the balance to a clean price per ₹100 of face value. An order of two ₹1,000 bonds costing ₹2,040 including ₹10 in fees and ₹30 in accrued interest implies a clean price of ₹100 per ₹100.'],
 ['Decide what return you need','Use a same-currency government yield of similar maturity, then add the premium you require for credit and liquidity risk. The hurdle is the higher of this sum and your personal minimum. Enter hurdle components as effective annual percentages. Sample inputs are hypothetical.'],
 ['Read the recommendation','Consider purchase means the modeled return meets your hurdle, the rating and liquidity pass your floors, and principal is due within your horizon (rounded to the nearest month). Skip identifies a failed screen. Review identifies missing risk inputs. Verify the rating, issuer finances, seniority, covenants and tradable quote against the issue documents before acting.'],
 ['Compare like with like','The comparison uses the lower of the fee-adjusted maturity yield and the modeled call yield, converted to an effective annual rate. Among qualifying INR bonds it selects the largest excess above each bond’s hurdle. Equal excess returns rounded to one basis point share the lead. Apply consistent benchmarks and risk premiums across candidates.'],
 ['Understand fair value and duration','Fair clean price is the maximum clean quote at your hurdle after accrual and fees, using the cheaper of call and maturity values. Modified duration estimates the percentage move in dirty price for a one-point change in yield (effective annual for installment schedules, nominal for bullet bonds). The rate scenarios reprice maturity cash flows exactly. Callable bonds can behave differently when exercise becomes likely.'],
 ['Check the modeling conventions','Regular fixed coupons, bullet repayment at par and Actual/Actual coupon-period accrual. Dates are anchored to maturity, preserving month-end. YTM is nominal annual yield compounded at coupon frequency and excludes fees. Yields assume promised payments and reinvestment at the indicated rate. Returns are pre-tax. For installments, enter every remaining payment in rupees per bond: date, interest and principal. Use outstanding principal at settlement as face value. Dates must follow settlement, principal must sum to face value, and the final principal payment must match maturity. XIRR uses actual days divided by 365 and includes purchase fees in the net return. The quote and purchase limit include accrued interest; clean price is not inferred. Coupon and frequency describe the bond but do not generate or change the entered schedule. Optional calls on installment bonds prevent a purchase recommendation. Floating rates, default losses, automatic business-day adjustments and multiple call dates are not modeled.'],
 ['Investor references','<a href="https://investor.sebi.gov.in/understanding_bonds.html" target="_blank" rel="noopener">SEBI · Understanding bonds ↗</a><br><a href="https://syndication.finra.org/content/bond-investing-and-due-diligence" target="_blank" rel="noopener">FINRA · Bond investing and due diligence ↗</a><br><a href="https://www.investor.gov/introduction-investing/investing-basics/glossary/callable-or-redeemable-bonds" target="_blank" rel="noopener">Investor.gov · Callable bonds ↗</a>'],
 ['Run your own copy','Your workspace is saved in this browser. Bond inputs are sent to the Python service for calculation. <a href="https://github.com/jagdevs646/The-Bond-Desk">Get the source and deployment instructions on GitHub</a>.']
 ].map(([t,body])=>'<article><h2>'+t+'</h2><p>'+body+'</p></article>').join('')+'</div>'}
function render(){
 const page=route();document.querySelectorAll('nav a').forEach(a=>{if(a.hash==='#'+page)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
 document.title=({analyze:'Bond analysis',compare:'Compare bonds',methodology:'Methodology'}[page])+' | The Bond Desk';
 main.innerHTML=page==='compare'?comparePage():page==='methodology'?methodology():analyzePage();
}
function field(k,label,value,type='text',choices=[],hint='',wide=false){
 const select=type==='select';
 const el=select?'<select id="f-'+k+'" name="'+k+'">'+choices.map(v=>{const [val,txt]=Array.isArray(v)?v:[v,v];return '<option value="'+esc(val)+'" '+(String(val)===String(value)?'selected':'')+'>'+esc(txt)+'</option>'}).join('')+'</select>':'<input id="f-'+k+'" name="'+k+'" type="'+type+'" value="'+esc(value??'')+'" '+(type==='number'?'step="any" ':'')+(k==='name'?'maxlength="80" ':'')+(['callDate','total'].includes(k)?'':'required')+'>';
 return '<label class="field '+(wide?'wide':'')+'" for="f-'+k+'">'+label+el+(hint?'<small>'+hint+'</small>':'')+'</label>'
}
function openEditor(mode,id=chosen){
 lastFocus=document.activeElement;editMode=mode;editId=id;removedPayment=null;
 const b=mode==='add'?{...examples[0],name:'',price:100,coupon:'',maturity:'',rating:'Unknown',liquidity:'Unknown',call:'Unknown / other',benchmark:'',premium:'',sample:false}:bonds.find(x=>x.id===id);
 const n=(k,l,h='')=>field(k,l,b[k],'number',[],h), sel=(k,l,choices)=>field(k,l,b[k],'select',choices);
 let body,title,save;
 if(mode==='criteria'){title='Investment criteria';save='Apply criteria';body='<p class="sub">These limits apply to every bond in your workspace.</p><div class="fields">'+field('settlement','Settlement date',profile.settlement,'date')+field('target','Minimum return (% effective annual)',profile.target,'number')+field('floor','Minimum credit rating',profile.floor,'select',grades.filter(x=>x!=='D'))+field('liquidity','Minimum liquidity',profile.liquidity,'select',['Low','Medium','High'])+field('horizon','Maximum holding horizon (years)',profile.horizon,'number')+'</div>'}
 else if(mode==='remove'){title='Remove bond';save='Remove bond';body='<p>Remove <b>'+esc(b.name)+'</b> from this workspace?</p>'}
 else{
 const original=mode==='edit'?results[bonds.findIndex(x=>x.id===id)]:null;
 const order=b.order??{quantity:1,total:original&&!original.blocked?Number((original.cost*b.face/100).toPrecision(15)):'',fees:original&&!original.blocked?Number((original.fee*b.face/100).toPrecision(15)):0};
 const basis=b.quoteBasis??(mode==='add'?'unit':'order');
 const amount=basis==='unit'&&order.total!=null&&order.total!==''?(order.total-order.fees)/order.quantity:order.total;
 const broker='<h3 class="after">Broker quote</h3><p class="sub">Have a quote? Copy the final order amount for settlement on '+dt(profile.settlement)+'. Leave it blank to calculate your purchase limit.</p><div class="fields">'+field('quoteBasis','Broker quote format',basis,'select',[['unit','Price per bond (including accrued interest, before fees)'],['order','Total for all bonds (including fees)']],'',true)+field('total','Quoted amount (₹, optional)',amount,'number',[],'Copy the amount for the selected format.',true)+field('quantity','Number of bonds',order.quantity,'number')+field('fees','Total order fees (₹)',order.fees,'number',[],'Enter zero if there are no fees.')+'</div>';
 title=mode==='add'?'Add a bond':'Edit bond';save=mode==='add'?'Add and analyze':'Apply changes';
 body='<div class="fields">'+field('name','Bond or issuer name',b.name,'text',[],'',true)+n('coupon','Annual coupon (%)')+n('face','Face value / outstanding principal per bond (₹)','For installments, use principal still outstanding at settlement.')+field('maturity','Maturity date',b.maturity,'date')+sel('frequency','Coupon frequency',Object.entries(freqs))+field('repayment','Principal repayment',b.repayment??'Unknown','select',[['Unknown','Select or verify repayment'],['Bullet','All principal at maturity'],['Amortizing','Principal repaid in installments']],'',true)+'</div><section id="scheduleSection" class="after"><h3>Payment schedule</h3><p class="sub">Enter every remaining interest and principal payment after '+dt(profile.settlement)+', in rupees for <b>one bond</b>. Add a row for each date, including interest-only dates. Use 0 when a component is not paid. Copy the issuer or broker payout schedule; installments need not be equal.</p><p class="sub after">Face value above must be the principal still outstanding at settlement. Final principal repayment must match maturity. Coupon and frequency do not generate these amounts.</p><div id="scheduleRows"></div><button type="button" data-add-payment>Add payment date</button> <button type="button" data-undo-payment hidden>Undo removal</button><p id="scheduleTotal" class="note" aria-live="polite"></p></section>'+broker+'<p id="quotePreview" class="note" aria-live="polite"></p><h3 class="after">Return and risk</h3><div class="fields">'+n('benchmark','Benchmark yield (%)','Effective annual rate for similar maturity.')+n('premium','Required risk premium (%)','Add to the benchmark for credit and liquidity risk.')+sel('rating','Issue credit rating',['Unknown',...grades])+sel('liquidity','Liquidity assessment',['Unknown','Low','Medium','High'])+sel('call','Call provision',['Unknown / other','None','Single date'])+'</div><div id="callFields" class="fields after">'+field('callDate','Optional call date',b.callDate,'date',[],'Use a future coupon date.')+n('callPrice','Call redemption per ₹100')+'</div>';
 if(bonds.every(x=>x.sample))body+='<p class="note">Saving your first bond replaces the illustrative workspace.</p>';
 }
 form.innerHTML='<div class="dialoghead"><h2 id="dialogTitle">'+title+'</h2><button type="button" data-close class="iconbtn" aria-label="Close">'+icon('close')+'</button></div><div class="dialogbody">'+body+'</div><div class="dialogfoot"><p class="error" role="alert"></p><button type="button" data-close>'+(['add','edit'].includes(mode)?'Close':'Cancel')+'</button><button class="primary" type="submit">'+save+'</button></div>';
 function showCall(){if(!$('#callFields'))return;const show=$('#f-call').value==='Single date';$('#callFields').style.display=show?'grid':'none';$('#callFields').querySelectorAll('input').forEach(el=>{el.disabled=!show;el.required=show})}
 if(isBondEditor()){
   const draft=readDraft();
   drawSchedule(draft?.paymentRows??b.schedule??[]);
   if(draft){
     for(const input of form.querySelectorAll('[name]')){
       if(Object.hasOwn(draft,input.name))input.value=draft[input.name];
     }
   }
   const status=document.createElement('div');
   status.className='draftline';status.innerHTML='<span role="status"></span><button type="button" class="linkbtn" data-discard hidden>Discard draft</button>';
   form.querySelector('.dialogfoot').prepend(status);
   if(draft)setDraftStatus('Draft restored.');
 }
 if(isBondEditor()){
   const preview=()=>{
     const value=form.elements.total.valueAsNumber, qty=form.elements.quantity.valueAsNumber, fees=form.elements.fees.valueAsNumber;
     const total=form.elements.quoteBasis.value==='unit'?value*qty+fees:value;
     const each=total/qty;
     $('#quotePreview').textContent=Number.isFinite(each)&&qty>0?'Order total '+currency(total)+' · '+currency(each)+' per bond including fees.'+(qty>1&&each<form.elements.face.valueAsNumber*.5?' Check the quote format: the amount per bond is below half its face value.':''):'';
   };
   form.oninput=()=>{preview();scheduleSummary()};preview();
   showSchedule();$('#f-repayment').addEventListener('change',showSchedule);
 }else form.oninput=null;
 showCall();$('#f-call')?.addEventListener('change',showCall);dialog.showModal();dialog.scrollTop=0;form.querySelector('input, select')?.focus({preventScroll:true});
}
let removedPayment=null;
function readSchedule(numeric){return Array.from(form.querySelectorAll('.payment-row'),row=>Object.fromEntries(['date','interest','principal'].map(key=>{const input=row.querySelector('[data-payment="'+key+'"]');return [key,numeric&&key!=='date'?input.valueAsNumber:input.value]})))}
function drawSchedule(rows){
 const box=$('#scheduleRows');if(!box)return;
 box.innerHTML=rows.map((row,i)=>'<fieldset class="payment-row"><legend>Payment '+(i+1)+'</legend>'+['date','interest','principal'].map(key=>'<label>'+({date:'Payment date',interest:'Interest (₹)',principal:'Principal repaid (₹)'}[key])+'<input data-payment="'+key+'" name="payment-'+i+'-'+key+'" type="'+(key==='date'?'date':'number')+'" '+(key==='date'?'':'min="0" step="0.01"')+' value="'+esc(row[key]??'')+'" required></label>').join('')+'<button type="button" data-remove-payment="'+i+'" aria-label="Remove payment '+(i+1)+'">Remove</button></fieldset>').join('');
 showSchedule();
}
function scheduleSummary(){
 const el=$('#scheduleTotal');if(!el)return;
 const rows=readSchedule(true),principal=rows.reduce((a,x)=>a+(Number.isFinite(x.principal)?x.principal:0),0),face=form.elements.face.valueAsNumber;
 el.textContent=rows.length+' payments · Principal entered '+currency(principal)+(Number.isFinite(face)?' / '+currency(face)+' outstanding.':'')+' Include all interest payments as well.';
}
function showSchedule(){
 const box=$('#scheduleSection');if(!box)return;
 const show=form.elements.repayment.value==='Amortizing';box.hidden=!show;
 box.querySelectorAll('input,button').forEach(x=>x.disabled=!show);scheduleSummary();
}
form.addEventListener('click',e=>{
 if(e.target.closest('[data-add-payment]')){
   const rows=readSchedule(false);if(rows.length>=1200){notice('Maximum 1,200 payments.');return}
   rows.push({date:'',interest:'',principal:0});drawSchedule(rows);saveDraft();$('#scheduleRows').lastElementChild.querySelector('input').focus();
 }
 const remove=e.target.closest('[data-remove-payment]');
 if(remove){const rows=readSchedule(false),index=Number(remove.dataset.removePayment);removedPayment={index,row:rows.splice(index,1)[0]};drawSchedule(rows);form.querySelector('[data-undo-payment]').hidden=false;saveDraft();}
 if(e.target.closest('[data-undo-payment]')&&removedPayment){const rows=readSchedule(false);rows.splice(removedPayment.index,0,removedPayment.row);drawSchedule(rows);removedPayment=null;form.querySelector('[data-undo-payment]').hidden=true;saveDraft();}
});
function closeEditor(){dialog.close()}
dialog.addEventListener('cancel',e=>{if(form.inert)e.preventDefault()});
dialog.addEventListener('close',()=>{if(lastFocus?.isConnected)lastFocus.focus();else main.querySelector('button')?.focus({preventScroll:true})});
// Backdrop clicks leave the native modal open. Explicit close and Escape keep a draft.
const draftCache=new Map();
function isBondEditor(){return editMode==='add'||editMode==='edit'}
function draftKey(){return KEY+'/draft/'+(editMode==='add'?'new':editId)}
function readDraft(){
 const key=draftKey();
 if(draftCache.has(key))return draftCache.get(key);
 try{return JSON.parse(sessionStorage.getItem(key))}catch{return null}
}
function clearDraft(){
 const key=draftKey();
 draftCache.delete(key);
 try{sessionStorage.removeItem(key)}catch{}
}
function setDraftStatus(message){
 const line=form.querySelector('.draftline');
 if(!line)return;
 line.querySelector('span').textContent=message;
 const discard=line.querySelector('button');discard.hidden=false;discard.textContent='Discard draft';discard.removeAttribute('data-confirm');
}
function saveDraft(){
 if(!isBondEditor()||!dialog.open)return;
 const values=Object.fromEntries(Array.from(form.querySelectorAll('[name]'),input=>[input.name,input.value]));
 values.paymentRows=readSchedule(false);
 const key=draftKey();
 draftCache.set(key,values);
 try{sessionStorage.setItem(key,JSON.stringify(values));setDraftStatus('Draft saved in this tab.')}
 catch{setDraftStatus('Draft kept until you reload this page.')}
}
form.addEventListener('input',saveDraft);
form.addEventListener('change',saveDraft);
form.addEventListener('click',e=>{
 if(e.target.closest('[data-close]')){closeEditor();return}
 const discard=e.target.closest('[data-discard]');
 if(!discard)return;
 if(discard.hasAttribute('data-confirm')){clearDraft();closeEditor();notice('Draft discarded.');return}
 discard.setAttribute('data-confirm','');discard.textContent='Confirm discard';
 form.querySelector('.draftline span').textContent='Discard these unapplied changes?';
});
form.addEventListener('submit',async e=>{
 e.preventDefault();const submit=form.querySelector('[type=submit]');submit.disabled=true;form.inert=true;
 try{
 let nextB=bonds.slice(),nextP={...profile},nextChosen=chosen;
 const data=Object.fromEntries(new FormData(form));for(const input of form.querySelectorAll('input[type=number]:enabled'))data[input.name]=input.valueAsNumber;
 if(editMode==='criteria')nextP={...nextP,...data};
 else if(editMode==='remove'){nextB=nextB.filter(b=>b.id!==editId);if(nextChosen===editId)nextChosen=nextB[0].id}
 else{
 const order={total:form.elements.total.value===''?null:(data.quoteBasis==='unit'?data.total*data.quantity+data.fees:data.total),quantity:data.quantity,fees:data.fees};
 data.schedule=readSchedule(true);
 for(const key of Object.keys(data))if(key.startsWith('payment-'))delete data[key];
 delete data.total;delete data.quantity;delete data.fees;
 const old=editMode==='edit'?bonds.find(b=>b.id===editId):{};const id=editMode==='edit'?editId:'bond-'+Array.from(crypto.getRandomValues(new Uint32Array(2))).join('-');const b={callDate:'',callPrice:100,...old,...data,order,frequency:Number(data.frequency),id,sample:false};delete b.price;delete b.fee;nextB=nextB.filter(b=>!b.sample);const index=nextB.findIndex(b=>b.id===id);if(index===-1)nextB.push(b);else nextB[index]=b;nextChosen=id}
 if(nextB.length>20)throw Error('Compare up to 20 bonds. Remove one before adding another.');
 const nextR=await calculate(nextB,nextP);results=nextR;bonds=nextB;profile=nextP;chosen=nextChosen;expanded=false;persist();if(isBondEditor())clearDraft();render();closeEditor();notice(editMode==='criteria'?'Criteria applied to every bond.':editMode==='remove'?'Bond removed.':'Analysis updated.');
 }catch(error){form.querySelector('.error').textContent=error.message}finally{form.inert=false;submit.disabled=false}
});
function download(){
 const b=bonds[active()],r=results[active()];
 const content='Date,Interest INR,Principal INR,Total INR\r\n'+r.flows.map(x=>[x.date,x.interest??b.face*b.coupon/100/b.frequency,x.principal??(x.date===b.maturity?b.face:0),x.amount*b.face/100].join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([content],{type:'text/csv'}));const a=document.createElement('a');a.href=url;a.download=b.name.replace(/[^a-zA-Z0-9-]+/g,'-')+'-cash-flows.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
main.addEventListener('click',e=>{const t=e.target.closest('button');if(!t)return;
 if(t.dataset.tab){detail=t.dataset.tab;render();main.querySelector('[data-tab="'+detail+'"]')?.focus({preventScroll:true});return}
 if(t.dataset.open){chosen=t.dataset.open;expanded=false;persist();location.hash='analyze';return}
 if(t.dataset.edit){openEditor('edit',t.dataset.edit);return}if(t.dataset.remove){openEditor('remove',t.dataset.remove);return}
 const a=t.dataset.act;if(['edit','add','criteria'].includes(a))openEditor(a);else if(a==='expand'){expanded=!expanded;render();main.querySelector('[data-act=expand]')?.focus({preventScroll:true})}else if(a==='csv')download();else if(a==='retry')location.reload();
});
main.addEventListener('change',e=>{if(e.target.id==='pick'){chosen=e.target.value;expanded=false;persist();render()}});
window.addEventListener('hashchange',()=>{if(results.length){render();window.scrollTo(0,0)}});
async function boot(){
 try{const s=JSON.parse(localStorage.getItem(KEY));if(s){if(!Array.isArray(s.bonds)||s.bonds.length<1||s.bonds.length>20)throw Error();s.bonds.forEach(b=>analyze(b,s.profile));bonds=s.bonds;profile=s.profile;chosen=bonds.some(b=>b.id===s.chosen)?s.chosen:bonds[0].id}}
 catch{notice('Saved data could not be loaded. Showing the illustrative workspace.')}
 try{results=await calculate(bonds,profile);render()}catch{main.innerHTML='<section class="pagehead"><div><h1>Analysis unavailable</h1><p>The pricing service could not complete the request. Try again in a moment.</p></div>'+btn('retry','Try again')+'</section>'}
}
boot();
