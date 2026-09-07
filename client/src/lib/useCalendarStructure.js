import { useEffect, useState } from "react";
import { getReference, getProjection } from "../api.js";

// Backs GameDatePicker.jsx: every in-game date field needs the campaign's own month
// names and days-per-month (not the Gregorian calendar), plus the current calendar date
// to default a fresh picker to.
export function useCalendarStructure() {
  const [structure, setStructure] = useState(null);
  const [currentDate, setCurrentDate] = useState(null);

  useEffect(() => {
    getReference("calendarStructure").then(setStructure);
    getProjection("calendar").then((c) => setCurrentDate(c.currentDate));
  }, []);

  return { structure, currentDate };
}
