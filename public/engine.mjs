export const grades = ['AAA','AA+','AA','AA−','A+','A','A−','BBB+','BBB','BBB−','BB+','BB','BB−','B','CCC','D'];
export const defaults = {target:7.25, floor:'A', horizon:7, liquidity:'Medium', settlement:'2026-11-05'};
export const examples = [
 {id:'meridian',name:'Meridian Infrastructure',coupon:7.5,price:98.5,face:1000,maturity:'2031-11-05',frequency:2,rating:'AA',liquidity:'High',fee:0,benchmark:6.5,premium:0.75,call:'None',callDate:'',callPrice:100,sample:true},
 {id:'arbor',name:'Arbor Energy',coupon:8.6,price:101.5,face:1000,maturity:'2032-11-05',frequency:1,rating:'BBB',liquidity:'Medium',fee:0.1,benchmark:6.6,premium:1.5,call:'None',callDate:'',callPrice:100,sample:true}
];
const levels=['Low','Medium','High'];
function check(ok,msg){if(!ok) throw Error(msg)}
function number(obj,key,min,max){const x=obj[key];check(typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max,'Check '+key+' ('+min+' to '+max+').');return x}
function date(s){check(typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s),'Enter a complete date.');const t=new Date(s+'T00:00:00Z');check(!Number.isNaN(+t)&&iso(t)===s&&t.getUTCFullYear()>=1900,'Enter a valid date from 1900 onward.');return t}
function iso(t){return t.toISOString().slice(0,10)}
function monthAt(t,offset){
 const y=t.getUTCFullYear(),m=t.getUTCMonth(),d=t.getUTCDate();
 const last=new Date(Date.UTC(y,m+offset+1,0)).getUTCDate();
 const end=d===new Date(Date.UTC(y,m+1,0)).getUTCDate();
 return new Date(Date.UTC(y,m+offset,end?last:Math.min(d,last)));
}
function pv(flows,rate,f){return flows.reduce((sum,p)=>sum+(p.amount===0?0:p.amount*Math.exp(-p.t*Math.log1p(rate/(100*f)))),0)}
function solve(flows,cost,f){
 let lo=-100*f+1e-9, hi=100;
 while(pv(flows,hi,f)>cost&&hi<1e7) hi*=2;
 check(pv(flows,lo,f)>=cost&&pv(flows,hi,f)<=cost,'Yield is outside the supported range. Check the price and dates.');
 for(let i=0;i<110;i++){const mid=(lo+hi)/2;if(pv(flows,mid,f)>cost)lo=mid;else hi=mid}
 return (lo+hi)/2;
}
export function analyze(b,p){
 check(typeof b.name==='string'&&b.name.trim()&&b.name.length<=80,'Enter a bond name (up to 80 characters).');
 const f=b.frequency;check([1,2,4,12].includes(f),'Choose a payment frequency.');
 const face=number(b,'face',1,1e9),coupon=number(b,'coupon',0,50);
 const benchmark=number(b,'benchmark',-5,50),premium=number(b,'premium',0,50),target=number(p,'target',-5,50),horizon=number(p,'horizon',0.1,100);
 check(grades.includes(p.floor)&&levels.includes(p.liquidity),'Check your investor criteria.');
 check([...grades,'Unknown'].includes(b.rating)&&[...levels,'Unknown'].includes(b.liquidity),'Check rating and liquidity.');
 check(['None','Single date','Unknown / other'].includes(b.call),'Check call terms.');
 const s=date(p.settlement),m=date(b.maturity);check(m>s&&m<=monthAt(s,1200),'Maturity must be after settlement and within 100 years.');
 const dates=[];let prev=m;
 for(let k=0;prev>s;k++){dates.unshift(iso(prev));prev=monthAt(m,-(k+1)*12/f)}
 const elapsed=(s-prev)/(date(dates[0])-prev),periodCoupon=coupon/f,accrued=elapsed*periodCoupon;
 const flows=dates.map((d,i)=>({date:d,t:i+1-elapsed,amount:periodCoupon+(i===dates.length-1?100:0)}));
 // Older workspaces store a clean quote per 100. New entries store broker amounts in rupees.
 const usesOrder = b.order !== undefined;
 let price, fee;
 if (usesOrder) {
   const order = b.order;
   check(order && typeof order === 'object','Check the broker order details.');
   const quantity = number(order,'quantity',1,1000000);
   check(Number.isInteger(quantity),'Number of bonds must be a whole number.');
   const scale = 100 / (quantity * face);
   fee = number(order,'fees',0,1e15) * scale;
   check(fee <= 20,'Order fees exceed 20% of face value. Check the total and quantity.');
   price = order.total === null ? null : (number(order,'total',0.01,1e16) - order.fees) * scale - accrued;
   check(price === null || (price >= 0.1-1e-10 && price <= 500+1e-10),'The total payable must include accrued interest and fees. Check the amount, quantity and settlement date.');
 } else {
   price = number(b,'price',0.1,500);
   fee = number(b,'fee',0,20);
 }
 const quoted = price !== null;
 const dirty = quoted ? price + accrued : null;
 const cost = quoted ? dirty + fee : null;
 const ytm = quoted ? solve(flows,dirty,f) : null;
 const net = quoted ? solve(flows,cost,f) : null;
 let callYield=null, callFlows=null;
 if(b.call==='Single date'){const i=dates.indexOf(b.callDate);check(i>=0&&i<dates.length-1,'Call date must be a future coupon date before maturity.');const redemption=number(b,'callPrice',1,500);
 callFlows=flows.slice(0,i+1).map(x=>({...x}));callFlows[i].amount=periodCoupon+redemption;if(quoted)callYield=solve(callFlows,cost,f)}
 const effective=y=>100*Math.expm1(f*Math.log1p(y/(100*f)));
 const worst=quoted?effective(Math.min(net,callYield??net)):null,required=Math.max(target,benchmark+premium),edge=quoted?worst-required:null;
 const reqNom=100*f*Math.expm1(Math.log1p(required/100)/f);
 const fair=Math.min(pv(flows,reqNom,f),callFlows?pv(callFlows,reqNom,f):Infinity)-accrued-fee;
 const duration=quoted?flows.reduce((a,x)=>a+(x.t/f)*x.amount*(1+ytm/(100*f))**(-x.t),0)/dirty/(1+ytm/(100*f)):null;
 const shocks=quoted?[-200,-150,-100,-50,0,50,100,150,200].filter(bp=>ytm+bp/100>-100*f).map(bp=>({bp,price:pv(flows,ytm+bp/100,f)-accrued})):[];
 const fail=[],missing=[];
 if(b.rating==='Unknown')missing.push('Confirm the issue’s credit rating.');else if(b.rating==='D'||grades.indexOf(b.rating)>grades.indexOf(p.floor))fail.push('The '+b.rating+' rating falls outside your credit screen.');
 if(b.liquidity==='Unknown')missing.push('Verify secondary-market liquidity.');else if(levels.indexOf(b.liquidity)<levels.indexOf(p.liquidity))fail.push('Liquidity is below your '+p.liquidity.toLowerCase()+' minimum.');
 if(b.call==='Unknown / other')missing.push('Confirm all call terms; this model supports one optional call date.');
 if(m>monthAt(s,Math.round(horizon*12)))fail.push('Principal matures beyond your holding horizon.');
 if(edge < -1e-8)fail.push('The modeled return falls below your required yield.');
 if(!quoted)missing.push('Add the broker’s total payable to check the return at the offered price.');
 const verdict=fail.length?'Skip':missing.length?'Review':'Consider purchase';
 return {price,fee,ytm,net,callYield,worst,required,edge,fair,dirty,cost,accrued,duration,shocks,flows,fail,missing,verdict,current:quoted?coupon/price*100:null,face,annualCoupon:face*coupon/100};
}
