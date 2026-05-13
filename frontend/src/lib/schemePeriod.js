// 7-to-7 business period utilities
// A "period" runs from the 7th of one month to the 6th of the next month.
// Example: "May 2026 period" = 2026-05-07 to 2026-06-06

const pad = (n) => String(n).padStart(2, '0');

// Get the period that contains a given date
// Returns { label, startDate, endDate, periodMonth, periodYear }
export const getPeriodForDate = (date = new Date()) => {
  const d = new Date(date);
  const day = d.getDate();
  const month = d.getMonth(); // 0-indexed
  const year = d.getFullYear();

  // If day >= 7, this date falls in the period starting on the 7th of this month
  // If day < 7, this date falls in the period that started on the 7th of the previous month
  let periodMonth, periodYear;
  if (day >= 7) {
    periodMonth = month;
    periodYear = year;
  } else {
    // Go back one month
    if (month === 0) {
      periodMonth = 11;
      periodYear = year - 1;
    } else {
      periodMonth = month - 1;
      periodYear = year;
    }
  }

  return buildPeriod(periodMonth, periodYear);
};

// Build a period object from a given month (0-indexed) and year
export const buildPeriod = (month, year) => {
  const startDate = `${year}-${pad(month + 1)}-07`;

  // End date is the 6th of the next month
  let endMonth = month + 1;
  let endYear = year;
  if (endMonth > 11) {
    endMonth = 0;
    endYear = year + 1;
  }
  const endDate = `${endYear}-${pad(endMonth + 1)}-06`;

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const startLabel = `7 ${monthNames[month]}`;
  const endLabel = `6 ${monthNames[endMonth]}`;

  const label = endYear !== year
    ? `${startLabel} ${year} - ${endLabel} ${endYear}`
    : `${startLabel} - ${endLabel} ${year}`;

  return {
    label,
    startDate,
    endDate,
    periodMonth: month,
    periodYear: year,
  };
};

// Navigate to the next period
export const getNextPeriod = (periodMonth, periodYear) => {
  let m = periodMonth + 1;
  let y = periodYear;
  if (m > 11) { m = 0; y += 1; }
  return buildPeriod(m, y);
};

// Navigate to the previous period
export const getPrevPeriod = (periodMonth, periodYear) => {
  let m = periodMonth - 1;
  let y = periodYear;
  if (m < 0) { m = 11; y -= 1; }
  return buildPeriod(m, y);
};

// Get the current period
export const getCurrentPeriod = () => getPeriodForDate(new Date());
