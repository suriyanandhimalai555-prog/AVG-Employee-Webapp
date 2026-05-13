---
name: 7-to-7 Business Calendar
description: Business months run 7th to 6th (not 1st to end-of-month) for all schemes, salaries, and incentives
type: project
---

All financial periods (salaries, incentives, gold scheme, trading academy, and all other schemes) use a 7-to-7 calendar instead of traditional calendar months.

A "period" starts on the 7th and ends on the 6th of the next month.
Example: "May 2026 period" = May 7 – Jun 6, 2026.

**Why:** This is a core business rule for this company — their financial cycle runs 7th to 7th.

**How to apply:** Always use the SchemeCalendar component and schemePeriod.js utilities when building period-aware features. Pass startDate/endDate from the period picker to API queries. All scheme dashboards should filter data by the selected 7-to-7 period.
