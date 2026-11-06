"""Check financial identities, screening behavior and JavaScript/Python agreement."""
import json
import math
from pathlib import Path
import shutil
import subprocess
import unittest
from engine import analyze

ROOT = Path(__file__).resolve().parent
sample = json.loads((ROOT / "sample-request.json").read_text())
base = sample["bonds"][0]
profile = sample["profile"]


class BondTest(unittest.TestCase):
    def dated_fixture(self):
        # Microsoft XIRR worked example: -10,000 then 2750, 4250, 3250, 2750.
        rows = [dict(date=d, interest=750, principal=v) for d,v in
                [("2008-03-01",2000),("2008-10-30",3500),("2009-02-15",2500),("2009-04-01",2000)]]
        return dict(base, repayment="Amortizing", face=10000, maturity="2009-04-01",
                    order=dict(quantity=1, fees=0, total=10000), schedule=rows), dict(profile, settlement="2008-01-01")

    def test_dated_xirr_and_fee_quantity_invariance(self):
        b,p = self.dated_fixture()
        r = analyze(b,p)
        self.assertAlmostEqual(r["net"],37.3362535,places=6)
        self.assertAlmostEqual(r["worst"],r["net"])
        self.assertEqual(r["totalInterest"],3000)
        self.assertEqual(sum(x["principal"] for x in r["flows"]),10000)
        six=analyze(dict(b,order=dict(quantity=6,fees=0,total=60000)),p)
        self.assertAlmostEqual(six["net"],r["net"])
        fee=analyze(dict(b,order=dict(quantity=6,fees=60,total=60060)),p)
        self.assertLess(fee["net"],r["net"])
        limit=analyze(dict(b,order=dict(quantity=1,fees=10,total=None)),p)
        at_limit=analyze(dict(b,order=dict(quantity=1,fees=10,total=(limit["fair"]+limit["fee"])*100)),p)
        self.assertAlmostEqual(at_limit["edge"],0,places=9)
        self.assertAlmostEqual(r["duration"],-(r["shocks"][5]["price"]-r["shocks"][3]["price"])/.01/r["dirty"],places=3)
        self.assertEqual(analyze(dict(b,call="Single date"),p)["verdict"],"Review")
        reversed_rows=analyze(dict(b,schedule=list(reversed(b["schedule"]))),p)
        self.assertAlmostEqual(reversed_rows["net"],r["net"])

    def test_dated_validation(self):
        b,p=self.dated_fixture()
        for change in [dict(date="2008-01-01"),dict(date="2010-01-01"),dict(date="2008-10-30"),
                       dict(interest=-1),dict(principal=100),dict(interest=0,principal=0)]:
            rows=[dict(x) for x in b["schedule"]];rows[0].update(change)
            with self.subTest(change=change), self.assertRaises(ValueError):
                analyze(dict(b,schedule=rows),p)
        with self.assertRaises(ValueError):analyze(dict(b,maturity="2009-05-01"),p)
        negative=analyze(dict(b,order=dict(quantity=1,total=20000,fees=0)),p)
        self.assertLess(negative["net"],0)

    def test_repayment_screen_and_quote_size(self):
        for fields in ({"repayment":"Amortizing"}, {"sample":False}):
            result = analyze(dict(base, **fields), profile)
            self.assertTrue(result["blocked"])
            self.assertNotIn("ytm", result)
            self.assertEqual(result["verdict"], "Review")
        b = dict(base, repayment="Bullet", face=10000, coupon=11.7, frequency=12, maturity="2028-12-16")
        single = analyze(dict(b, order=dict(quantity=1,total=9989.91,fees=0)),profile)
        six = analyze(dict(b, order=dict(quantity=6,total=59939.46,fees=0)),profile)
        self.assertAlmostEqual(single["ytm"],six["ytm"])
        mistaken = analyze(dict(b, order=dict(quantity=6,total=9989.91,fees=0)),profile)
        self.assertAlmostEqual(mistaken["ytm"],128.32,places=2)

    def test_par_and_clean_dirty(self):
        r = analyze(dict(base, price=100), profile)
        self.assertAlmostEqual(r["ytm"], base["coupon"], places=9)
        self.assertEqual(r["accrued"], 0)
        self.assertEqual(r["flows"][-1]["amount"], 103.75)
        mid = analyze(base, dict(profile, settlement="2027-02-05"))
        self.assertAlmostEqual(mid["accrued"], 3.75*92/181)
        self.assertAlmostEqual(mid["dirty"], base["price"]+mid["accrued"])

    def test_zero_negative_and_price_shock(self):
        zero = dict(base, coupon=0, frequency=1, price=110)
        r = analyze(zero, profile)
        self.assertAlmostEqual(r["ytm"],100*((100/110)**.2-1))
        self.assertLess(r["ytm"],0)
        self.assertAlmostEqual(r["shocks"][4]["price"],110)
        self.assertTrue(all(x["price"]>y["price"] for x,y in zip(r["shocks"],r["shocks"][1:])))

    def test_call_fee_and_fair_limit(self):
        b = dict(base, price=104, fee=.5, call="Single date", callDate="2027-11-05", callPrice=100)
        r = analyze(b, profile)
        self.assertLess(r["net"],r["ytm"])
        self.assertLess(r["callYield"],r["net"])
        self.assertAlmostEqual(r["worst"],100*((1+r["callYield"]/200)**2-1))
        self.assertAlmostEqual(analyze(dict(b,price=r["fair"]),profile)["edge"],0,places=8)
        with self.assertRaises(ValueError):
            analyze(dict(b, callDate="2027-11-06"), profile)

    def test_broker_order_between_coupons(self):
        settings = dict(profile, settlement="2027-02-05")
        quoted = analyze(dict(base, fee=.5), settings)
        total = quoted["cost"] * base["face"] / 100 * 3
        order = dict(quantity=3, fees=15, total=total)
        converted = analyze(dict(base, order=order), settings)
        for key in ("price", "fee", "cost", "net", "ytm", "fair", "edge"):
            self.assertAlmostEqual(converted[key], quoted[key])
        for invalid in [dict(quantity=1.5), dict(total=0), dict(fees=total+1)]:
            with self.assertRaises(ValueError):
                analyze(dict(base, order={**order, **invalid}), settings)

    def test_unquoted_bond_has_value_and_no_market_return(self):
        order = dict(quantity=2, fees=10, total=None)
        result = analyze(dict(base, order=order), profile)
        self.assertAlmostEqual(result["fair"], analyze(dict(base, fee=.5), profile)["fair"])
        self.assertEqual(result["verdict"], "Review")
        for key in ("price", "edge", "worst", "ytm", "duration", "cost"):
            self.assertIsNone(result[key])
        self.assertEqual(analyze(dict(base, order=order, rating="D"), profile)["verdict"], "Skip")

    def test_risk_gates(self):
        self.assertEqual(analyze(base, profile)["verdict"], "Consider purchase")
        for values in [dict(rating="BBB"),dict(rating="D"),dict(liquidity="Low"),dict(maturity="2040-11-05")]:
            self.assertEqual(analyze(dict(base,**values),profile)["verdict"],"Skip")
        for values in [dict(rating="Unknown"),dict(liquidity="Unknown"),dict(call="Unknown / other")]:
            self.assertEqual(analyze(dict(base,**values),profile)["verdict"],"Review")

    @unittest.skipUnless(shutil.which("node"),"Node.js is optional for browser parity tests")
    def test_browser_parity(self):
        inputs = [[dict(base, **fields),dict(profile, **criteria)] for fields,criteria in [
            ({"repayment":"Amortizing"},{}), ({"sample":False},{}),
            ({"order":{"quantity":3,"fees":15,"total":3120}},{"settlement":"2027-02-02"}),
            ({"order":{"quantity":2,"fees":10,"total":None},"call":"Single date","callDate":"2028-11-05"},{}),
            ({},{}),({"coupon":0,"price":125,"frequency":12},{}),
            ({"frequency":4,"maturity":"2032-02-29","fee":1},{"settlement":"2026-11-12"}),
            ({"call":"Single date","callDate":"2028-05-05","callPrice":101.3},{}),
            ({"price":140,"rating":"Unknown"},{}),({"call":"Unknown / other"},{}),
            ({"maturity":"2126-11-05","coupon":0,"frequency":12},{}),
        ]]
        dated, criteria = self.dated_fixture()
        inputs.extend([[dated,criteria], [dict(dated,order=dict(quantity=6,total=60060,fees=60)),criteria], [dict(dated,call='Unknown / other'),criteria]])
        js = 'import {analyze} from "./public/engine.mjs";import fs from "node:fs";console.log(JSON.stringify(JSON.parse(fs.readFileSync(0,"utf8")).map(x=>analyze(...x))));'
        actual = json.loads(subprocess.check_output(["node","--input-type=module","-e",js],cwd=ROOT,input=json.dumps(inputs).encode()))
        def compare(a,b):
            if isinstance(a,dict):
                self.assertEqual(a.keys(),b.keys())
                for k in a: compare(a[k],b[k])
            elif isinstance(a,list):
                self.assertEqual(len(a),len(b))
                for x,y in zip(a,b): compare(x,y)
            elif isinstance(a,(int,float)):
                self.assertTrue(math.isclose(a,b,rel_tol=1e-9,abs_tol=1e-8),(a,b))
            else: self.assertEqual(a,b)
        for pair,r in zip(inputs,actual): compare(analyze(*pair),r)


if __name__ == "__main__":
    unittest.main()
