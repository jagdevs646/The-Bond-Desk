# The Bond Desk design context

## Overview
An INR bond decision tool with an engraved bond-certificate identity. Preserve the established restrained green/cream UI. Calculation and entry clarity take priority over decoration.

## Colors
Canonical tokens live in public/style.css: ink #192e29, green #104f40, forest #103b32, muted #596b63, line #d5dcd2, paper #f8f8f3, gold #ae9457.

## Typography
Georgia/Times New Roman for display headings and headline figures; Inter/Segoe UI/Arial for controls and explanatory copy. INR amounts use en-IN formatting and dates use en-GB display with UTC date-only calculations.

## Layout
Reuse the existing field helper, native select/date controls and native modal. Payment rows extend the edit form, stack at 600px, and scroll within a bounded region. Keep payment date, interest and principal in that order.

## Components
The app.mjs field helper owns standard fields; drawSchedule owns repeating payment rows with native labelled controls. openEditor owns drafts, save/error behavior and focus restoration. The shared notice function owns status feedback. Cash-flow tables and CSV use identical per-bond amounts. style.css owns all appearance. No framework or parallel component system.

## Do's and Don'ts
Preserve drafts on Close, Escape and accidental backdrop clicks. Keep invalid inputs editable after failed calculation. Never infer installment amounts or display dated XIRR as nominal YTM. Native controls use the browser locale; stored dates remain ISO.
