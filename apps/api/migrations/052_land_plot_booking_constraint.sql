-- Migration 052: Partial unique index to enforce one active booking per plot.
--
-- A plot can only have one booking that is NOT cancelled at any given time.
-- Cancelled bookings are excluded so a plot can be re-booked after cancellation.

CREATE UNIQUE INDEX IF NOT EXISTS idx_land_bookings_plot_active
ON land_bookings (plot_id)
WHERE status NOT IN ('cancelled');
