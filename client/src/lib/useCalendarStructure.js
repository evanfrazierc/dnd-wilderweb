import { useEffect, useState } from "react";
import { getReference, getProjection } from "../api.js";

// Backs GameDatePicker.jsx: every in-game date field needs the campaign's own month
// names and days-per-month (not the Gregorian calendar), plus the current calendar date
// to default a fresh picker to.
//
// A page can mount many pickers at once (one per settlement on Settlements), and each used
// to fire its own independent fetch of the same two resources -- 9 settlements meant 18
// duplicate requests on a single page load. These two module-level promises are shared
// across every hook instance instead, so concurrent mounts collapse into one real
// request each.
let structurePromise = null;
function fetchStructure() {
  if (!structurePromise) {
    structurePromise = getReference("calendarStructure").catch((e) => {
      structurePromise = null;
      throw e;
    });
  }
  return structurePromise;
}

let calendarPromise = null;
function fetchCalendar() {
  if (!calendarPromise) {
    calendarPromise = getProjection("calendar").catch((e) => {
      calendarPromise = null;
      throw e;
    });
  }
  return calendarPromise;
}

// A save anywhere (CalendarAdvanced most directly, but any event could in principle
// change reference data too) can make the cached calendar state stale for the next
// picker that mounts. Already-mounted pickers are unaffected -- they only apply
// currentDate once, on their own first mount, same as before this cache existed.
if (typeof window !== "undefined") {
  window.addEventListener("wilderweb:event-saved", () => {
    structurePromise = null;
    calendarPromise = null;
  });
}

export function useCalendarStructure() {
  const [structure, setStructure] = useState(null);
  const [currentDate, setCurrentDate] = useState(null);

  useEffect(() => {
    fetchStructure().then(setStructure).catch(() => {});
    fetchCalendar()
      .then((c) => setCurrentDate(c.currentDate))
      .catch(() => {});
  }, []);

  return { structure, currentDate };
}
