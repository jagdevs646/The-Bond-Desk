# The Bond Desk

The Bond Desk helps an INR fixed-income investor answer two questions: **What is the most I can pay for this bond at my required return? Which of my quoted bonds best meets my return and risk criteria?** It prices regular fixed-rate bullet bonds and dated installment schedules, handles a single optional call on bullet bonds, and compares up to 20 candidates.

## Try the example

Open **Compare** with the two fictional bonds loaded. Arbor offers the higher modeled return, but its BBB rating falls below the investor’s A minimum. Meridian qualifies and ranks first.

| Illustrative bond | Modeled annual return | Required return | Rating | Decision |
| --- | ---: | ---: | --- | --- |
| Meridian Infrastructure | 8.02% | 7.25% | AA | Consider purchase |
| Arbor Energy | 8.25% | 8.10% | BBB | Skip |

Select **Edit investment criteria** to change the holding horizon, minimum yield, rating floor, liquidity floor, or settlement date. Updating these assumptions recalculates every bond.

## Analyze your own bond

1. Open **Edit bond** or **Compare → Add bond**. Enter the face value, coupon, payment frequency, maturity, and risk assumptions. Saving your first custom bond replaces the samples.
2. For a valuation before obtaining a quote, leave **Total payable** blank. The result shows the maximum all-in amount per bond that meets your required return.
3. To evaluate an offer, copy the broker’s total payable, number of bonds, and fees included. The app derives the clean price from the cash amount and accrued interest. For two ₹1,000 bonds costing ₹2,040, including ₹10 in fees and ₹30 in accrued interest, the clean price is ₹100 per ₹100 face value.
4. Inspect the purchase verdict, price–yield curve, rate-shock table, and dated cash flows. Download the cash flows as CSV or add another bond for comparison.

**Drafts.** Clicking outside the editor keeps it open. Close, Escape, and a same-tab refresh preserve the draft. Reopen the same bond to resume. Apply changes to save it, or confirm **Discard draft** to clear it.

## Run locally

Use Python 3.12. The local server and pricing engine use the Python standard library.

```bash
git clone https://github.com/jagdevs646/The-Bond-Desk.git
cd The-Bond-Desk
python server.py
```

Open [localhost:8000](http://127.0.0.1:8000). On Windows, use `py -3.12 server.py` if your Python launcher is `py`. Node.js is optional and enables the cross-language calculation tests.

If you prefer manual setup, select **New → Web Service**, choose Python, and leave the root directory at the repository root. Use these settings from the Blueprint:

| Setting | Value |
| --- | --- |
| Build command | `pip install -r deploy/render-requirements.txt && python -m unittest discover` |
| Start command | `gunicorn --bind 0.0.0.0:$PORT --workers 1 --threads 4 server:application` |
| Health check path | `/api/analyze` |

[Render Blueprints](https://render.com/docs/infrastructure-as-code) · [Web service ports](https://render.com/docs/web-services#port-binding)

### Verify the deployment

Visit `/api/analyze` on the new domain. It should return `{"status":"ok","service":"bond-analysis"}`. Then open **Compare** in a fresh browser session and check that Meridian is the top qualifying sample. Together these checks cover the deployed Python route and the frontend’s calculation request. If you get a 404 at the API URL on Vercel, check that the project root contains both `api/` and `public/`.

## Pricing and screening

- **Cash flows and accrual.** Coupon dates are generated backwards from maturity, preserving month-end. Accrued interest uses the actual fraction of the current coupon period. Settlement on a coupon date excludes that payment.
- **Market yield.** The solver discounts the remaining payments to the dirty purchase price. Headline YTM is nominal annual yield compounded at coupon frequency. The comparison uses the lower modeled maturity or call yield after purchase fees, converted to an effective annual yield.
- **Required return.** The hurdle is the higher of the investor’s minimum return and the maturity-matched benchmark plus the user’s required risk premium. Fair clean price discounts the applicable redemption scenarios at this hurdle and deducts accrued interest and purchase fees.
- **Decision.** A bond must meet yield, credit, liquidity, and maturity limits to qualify. A known failure gives **Skip**. Missing information gives **Review** when all known checks pass. Among qualifying bonds, the largest excess over its hurdle wins. Candidates tied to the nearest basis point share the lead.
- **Stress testing.** Modified duration and rate shocks use maturity cash flows. The separate macro scenario reproduces the original calculator’s illustrative assumptions and has no effect on purchase rankings.

The model assumes contractual payments and pre-tax returns. Floating coupons, automatic irregular-coupon generation, optional calls on installment bonds, multiple call dates, defaults, and option-adjusted pricing are outside its scope. Supply a current executable quote, comparable credit ratings, and issue terms. The sample data and macro assumptions are illustrative.

## API and tests

`POST /api/analyze` accepts JSON with one shared `profile` and an array of 1–20 `bonds` (maximum body 2 MiB). Results follow request order. For broker orders, `order.quantity` counts bonds, `order.total` is the final payable amount in INR, and `order.fees` is the fee already included in that amount. Use `null` for an unavailable total. The API also supports saved clean-price quotes per ₹100 par. See [sample-request.json](sample-request.json) for both formats.

```bash
curl -H "Content-Type: application/json" --data-binary @sample-request.json http://127.0.0.1:8000/api/analyze
python -m unittest discover -v
```

Tests cover par pricing, accrual, zero coupons, negative yields, early calls, purchase fees, missing quotes, credit screens, Python/JavaScript parity, HTTP error handling, and asset serving.

## Project layout

| Path | Purpose |
| --- | --- |
| `public/` | HTML, CSS, browser workspace, chart rendering, and the JavaScript reference calculator |
| `engine.py` | Coupon schedule, pricing, yield solver, duration, and suitability checks |
| `api/analyze.py` | Shared Python API used on Vercel, Render, and localhost |
| `server.py` | Local launch command and Render WSGI application |
| `vercel.json`, `render.yaml` | Hosting settings |
| `test_engine.py`, `test_hosting.py` | Pricing and HTTP regression tests |

The app stores saved bonds and investor criteria in browser local storage and unapplied drafts in tab session storage. For calculations, it sends the bond terms and criteria to the same-origin Python API. The application does not write those requests to a database.

[MIT License](LICENSE)


## Multiple redemption dates

In **Edit bond → Principal repayment**, choose **Principal repaid in installments**. The **Payment schedule** section appears immediately below. Click **Add payment date** for each future payout and enter its date, interest and principal in rupees **per bond**. Include interest-only dates with zero principal. Unequal amounts and irregular dates are supported. Copy the contractual payout schedule; the app does not assume equal installments or generate interest from the coupon field.

Use the principal still outstanding at settlement in the face value field. Principal payments must sum to this value, dates must be after settlement, and the last principal repayment must match maturity. Duplicate dates must be combined. Up to 1,200 rows per bond are supported. Rows can be removed and the most recent removal undone. Unapplied schedule rows are saved with the editor draft.

Returns are effective annual XIRR using actual days / 365, with the all-in purchase amount as the negative settlement cash flow. The net return includes purchase fees. Prices for installment schedules include accrued interest; the app does not present an inferred clean price. The purchase limit discounts the same dated payments at the required effective annual return. Optional calls on installment bonds require review and are excluded from qualifying purchase rankings.

The API accepts `repayment: "Amortizing"` and `schedule: [{"date":"2027-11-05","interest":75,"principal":400}, {"date":"2031-11-05","interest":180,"principal":600}]`. This is an illustrative two-payment schedule for ₹1,000 outstanding principal, not the Keertana issue. Supply `order` and a matching maturity. Coupon/frequency are descriptive for this mode.

Validation includes the [Microsoft XIRR worked example](https://support.microsoft.com/en-us/excel/functions/xirr-function?nochrome=true), fee and quantity invariance, fair-value identities, invalid schedules, and agreement between Python and browser calculations.
