// The Archive in transit: the numbers the whole site shares. The status strip and The Crossing both read them from
// here, so they can never disagree. Times are in years after the survey probe's launch ("Y+"), the way the story's own
// timeline counts.

/**
 * The ship's clock runs on today's date and time, shifted so that the Archive reaches orbit (22 October 3342 in the
 * story's calendar) on this real date. Change this one line and the strip and the chart follow.
 */
const ORBIT_ON = "2027-10-22";

const Voyage = (() => {
  /** 19 January 3310 is Y+20.39, so Y+0 falls in late August 3289. */
  const yearAtLaunch = 3310 + 18 / 365.25 - 20.39;

  /** The survey probe flies at half the speed of light; its report comes home at the speed of light. */
  const probe = { launch: 0, arrive: 8.68, transmit: 10.18, received: 14.52 };

  /** The day the Archive reaches orbit, in the story's calendar. */
  const orbitInStory = Date.UTC(3342, 9, 22);

  /** A 46-day burn at one gravity, a coast at 0.130 of light speed, a 46-day braking burn, a week's approach, then orbit
   *  on the calendar's day (the timeline's Y+53.15, rounded). The 32.63-year voyage is counted from the start of the
   *  coast, as the story counts it. */
  const archive = { depart: 20.39, coast: 20.52, brake: 53.0, approach: 53.13, cruise: 0.13, voyageYears: 32.63 };
  archive.arrive = fractionalYear(new Date(orbitInStory)) - yearAtLaunch;

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  /** How far the ship's calendar runs ahead of ours: the story's arrival minus the real date it falls on. */
  const [orbitYear, orbitMonth, orbitDay] = ORBIT_ON.split("-").map(Number);
  const aheadBy = orbitInStory - Date.UTC(orbitYear, orbitMonth - 1, orbitDay);

  /** The ship's clock at this moment. */
  function shipNow() {
    return new Date(Date.now() + aheadBy);
  }

  /** A calendar moment as a fractional year. */
  function fractionalYear(date) {
    const start = Date.UTC(date.getUTCFullYear(), 0, 1);
    const end = Date.UTC(date.getUTCFullYear() + 1, 0, 1);
    return date.getUTCFullYear() + (date.getTime() - start) / (end - start);
  }

  /** Where a moment on the ship's clock stands on the voyage's own scale. */
  function voyageTime(date) {
    return fractionalYear(date) - yearAtLaunch;
  }

  /** Where the ship's clock stood when the page opened. */
  const now = voyageTime(shipNow());

  /** "May 3341" for any moment on the voyage's scale. */
  function monthYear(y) {
    const calendar = yearAtLaunch + y;
    const whole = Math.floor(calendar);
    return `${months[Math.min(11, Math.floor((calendar - whole) * 12))]} ${whole}`;
  }

  /** "07 MAY 3341 · 21:47:05": the stamp format of the logs, with seconds for a running clock. */
  function stamp(date, withSeconds) {
    const two = (n) => String(n).padStart(2, "0");
    const time = `${two(date.getUTCHours())}:${two(date.getUTCMinutes())}${withSeconds ? `:${two(date.getUTCSeconds())}` : ""}`;
    return `${two(date.getUTCDate())} ${months[date.getUTCMonth()].toUpperCase()} ${date.getUTCFullYear()} · ${time}`;
  }

  /** Speed as a share of light: up through the first burn, level through the coast, down through the second. */
  function speedAt(y) {
    const { depart, coast, brake, approach, cruise } = archive;
    if (y <= depart || y >= approach) return 0;
    if (y < coast) return cruise * (y - depart) / (coast - depart);
    if (y < brake) return cruise;
    return cruise * (approach - y) / (approach - brake);
  }

  /** The share of the crossing covered: half speed through each burn, full speed between. */
  function progressAt(y) {
    const { depart, coast, brake, approach, arrive } = archive;
    const burn = coast - depart;
    const total = burn / 2 + (brake - coast) + burn / 2;
    if (y <= depart) return 0;
    if (y >= arrive) return 1;
    if (y < coast) { const t = y - depart; return (t * t / (2 * burn)) / total; }
    if (y < brake) return (burn / 2 + (y - coast)) / total;
    if (y < approach) { const t = approach - y; return (total - t * t / (2 * burn)) / total; }
    return 1;
  }

  /** Years of voyage, counted from the coast and capped at the voyage's length. */
  function voyageYearAt(y) {
    return Math.min(archive.voyageYears, Math.max(0, y - archive.coast));
  }

  return { probe, archive, now, shipNow, voyageTime, monthYear, stamp, speedAt, progressAt, voyageYearAt };
})();
