"""Fixed-rate bullet bond analysis. Rates are percentages, prices are per 100 par."""
import calendar
import math
from datetime import date

GRADES = "AAA AA+ AA AA− A+ A A− BBB+ BBB BBB− BB+ BB BB− B CCC D".split()
LEVELS = ["Low", "Medium", "High"]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def number(values, key, low, high):
    value = values.get(key)
    require(type(value) in (int, float) and math.isfinite(value) and low <= value <= high,
            f"Check {key} ({low} to {high}).")
    return value


def shift_months(anchor, months):
    year, month = divmod(anchor.year * 12 + anchor.month - 1 + months, 12)
    last = calendar.monthrange(year, month + 1)[1]
    end = anchor.day == calendar.monthrange(anchor.year, anchor.month)[1]
    return date(year, month + 1, last if end else min(anchor.day, last))


def present_value(flows, rate, frequency):
    log_discount = math.log1p(rate / (100 * frequency))
    try:
        return sum(row["amount"] * math.exp(-row["t"] * log_discount)
                   for row in flows if row["amount"])
    except OverflowError:
        return math.inf


def solve(flows, price, frequency):
    low, high = -100 * frequency + 1e-9, 100
    while present_value(flows, high, frequency) > price and high < 1e7:
        high *= 2
    require(present_value(flows, low, frequency) >= price >= present_value(flows, high, frequency),
            "Yield is outside the supported range. Check the price and dates.")
    for _ in range(110):
        mid = (low + high) / 2
        if present_value(flows, mid, frequency) > price:
            low = mid
        else:
            high = mid
    return (low + high) / 2


def analyze(b, p):
    require(isinstance(b["name"], str) and b["name"].strip() and len(b["name"]) <= 80, "Enter a bond name.")
    repayment = b.get("repayment", "Unknown" if b.get("sample") is False else "Bullet")
    if repayment != "Bullet":
        reason = ("Principal is repaid in installments. A dated principal and interest schedule is required for an XIRR calculation."
                  if repayment == "Amortizing" else "Confirm how principal is repaid before using this valuation.")
        return dict(blocked=True, verdict="Review", missing=[reason], fail=[], edge=None, worst=None, required=None, duration=None)
    f = b["frequency"]
    require(type(f) is int and f in (1, 2, 4, 12), "Choose a payment frequency.")
    face = number(b, "face", 1, 1e9)
    coupon = number(b, "coupon", 0, 50)
    benchmark, premium = number(b, "benchmark", -5, 50), number(b, "premium", 0, 50)
    target, horizon = number(p, "target", -5, 50), number(p, "horizon", .1, 100)
    require(p["floor"] in GRADES and p["liquidity"] in LEVELS, "Check your investor criteria.")
    require(b["rating"] in GRADES + ["Unknown"] and b["liquidity"] in LEVELS + ["Unknown"], "Check rating and liquidity.")
    require(b["call"] in ("None", "Single date", "Unknown / other"), "Check call terms.")
    s, m = map(date.fromisoformat, (p["settlement"], b["maturity"]))
    require(s.year >= 1900 and s < m <= shift_months(s, 1200), "Maturity must be after settlement and within 100 years.")
    dates, prev = [], m
    while prev > s:
        dates.append(prev)
        prev = shift_months(m, -len(dates) * (12 // f))
    dates.reverse()
    elapsed = (s-prev).days / (dates[0]-prev).days
    payment = coupon / f
    accrued = payment * elapsed
    flows = [dict(date=d.isoformat(), t=i+1-elapsed, amount=payment+(100 if d == m else 0))
             for i, d in enumerate(dates)]
    if "order" in b:
        order = b["order"]
        require(isinstance(order, dict), "Check the broker order details.")
        quantity = number(order, "quantity", 1, 1000000)
        require(quantity == int(quantity), "Number of bonds must be a whole number.")
        scale = 100 / (quantity * face)
        fee = number(order, "fees", 0, 1e15) * scale
        require(fee <= 20, "Order fees exceed 20% of face value.")
        price = None if order["total"] is None else (number(order, "total", .01, 1e16) - order["fees"]) * scale - accrued
        require(price is None or .1-1e-10 <= price <= 500+1e-10, "Check total payable, quantity and settlement date.")
    else:
        price, fee = number(b, "price", .1, 500), number(b, "fee", 0, 20)
    dirty = price + accrued if price is not None else None
    cost = dirty + fee if dirty is not None else None
    ytm = solve(flows, dirty, f) if dirty is not None else None
    net = solve(flows, cost, f) if cost is not None else None
    call_yield, call_flows = None, []
    if b["call"] == "Single date":
        call = date.fromisoformat(b["callDate"])
        require(call in dates[:-1], "Call date must be a future coupon date before maturity.")
        call_flows = [dict(row) for row in flows[:dates.index(call)+1]]
        call_flows[-1]["amount"] = payment + number(b, "callPrice", 1, 500)
        call_yield = solve(call_flows, cost, f) if cost is not None else None
    worst = 100 * math.expm1(f * math.log1p(min(net, call_yield if call_flows else net) / (100*f))) if net is not None else None
    required = max(target, benchmark + premium)
    edge = worst - required if worst is not None else None
    discount = 100*f*math.expm1(math.log1p(required/100)/f)
    fair = min(present_value(flows, discount, f), present_value(call_flows, discount, f) if call_flows else math.inf)-accrued-fee
    duration = sum(row["t"]/f * row["amount"] * (1+ytm/(100*f))**(-row["t"])
                   for row in flows) / dirty / (1+ytm/(100*f)) if ytm is not None else None
    shocks = [dict(bp=bp, price=present_value(flows, ytm+bp/100, f)-accrued)
              for bp in range(-200,201,50) if ytm+bp/100 > -100*f] if ytm is not None else []
    fail, missing = [], []
    if b["rating"] == "Unknown":
        missing.append("Confirm the issue’s credit rating.")
    elif b["rating"] == "D" or GRADES.index(b["rating"]) > GRADES.index(p["floor"]):
        fail.append(f"The {b['rating']} rating falls outside your credit screen.")
    if b["liquidity"] == "Unknown":
        missing.append("Verify secondary-market liquidity.")
    elif LEVELS.index(b["liquidity"]) < LEVELS.index(p["liquidity"]):
        fail.append(f"Liquidity is below your {p['liquidity'].lower()} minimum.")
    if b["call"] == "Unknown / other":
        missing.append("Confirm all call terms; this model supports one optional call date.")
    if m > shift_months(s, math.floor(horizon*12+.5)):
        fail.append("Principal matures beyond your holding horizon.")
    if edge is None:
        missing.append("Add the broker’s total payable to check the return at the offered price.")
    elif edge < -1e-8:
        fail.append("The modeled return falls below your required yield.")
    return dict(price=price, fee=fee, ytm=ytm, net=net, callYield=call_yield, worst=worst, required=required, edge=edge,
                fair=fair, dirty=dirty, cost=cost, accrued=accrued, duration=duration, shocks=shocks,
                flows=flows, fail=fail, missing=missing, verdict="Skip" if fail else "Review" if missing else "Consider purchase",
                current=coupon/price*100 if price is not None else None, face=face, annualCoupon=face*coupon/100)
