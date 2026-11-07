// The Archive in transit: the numbers the whole site shares. The status strip and The Crossing both read them from
// here, so they can never disagree. Times are in years after the survey probe's launch ("Y+"), the way the story's own
// timeline counts.

/**
 * The ship's clock runs on today's date and time, shifted so that the Archive reaches orbit (22 October 3342 in the
 * story's calendar) on this real date. Change this one line and the strip and the chart follow.
 */
const ORBIT_ON = "2027-10-22";

/**
 * The Voyage Logs published so far, oldest first, each with the Earth date and time stamped on it. Add one line when a
 * log goes out, for example { log: "01", stamp: "3341-05-07 21:47", title: "…", url: "https://…", poster: "/assets/img/log-01.webp" }:
 * it joins The Crossing's milestones and its "Latest log" button, and gets a card in VOYAGE LOGS, which stays hidden
 * until this has its first line. The title, url (where the log plays) and poster are optional.
 */
const PUBLISHED_LOGS = [
  { log: "01", stamp: "3341-05-07 21:47", url: "https://youtu.be/3S6ZinguqzM", poster: "/assets/img/log-01.webp" },
];

/** The crew card in VOYAGE LOGS (CR-8): who records the logs, shown once a log is out. Her first name and her role
 *  only, never her surname, and a picture with her visor down, never her face. Set null to take the card down. */
const LOG_CREW = {
  name: "Sera",
  role: "Chief Engineer of Exploration",
  image: "/assets/img/crew-720.webp",
  alt: "Sera kneels at the foot of the VIGIL, welding, her visor down",
};

const Voyage = (() => {
  /** 19 January 3310 is Y+20.39, so Y+0 falls in late August 3289. */
  const yearAtLaunch = 3310 + 18 / 365.25 - 20.39;

  /** The survey probe flies at half the speed of light; its report comes home at the speed of light. */
  const probe = { launch: 0, arrive: 8.68, transmit: 10.18, received: 14.52 };

  /** The day the Archive reaches orbit, in the story's calendar. */
  const orbitInStory = Date.UTC(3342, 9, 22);

  /** A point on the voyage's scale from a date in the story's calendar. */
  const on = (year, month, day) => fractionalYear(new Date(Date.UTC(year, month - 1, day))) - yearAtLaunch;

  /** The phases, each starting on its day in the story's calendar: leaving Earth and a burn at one gravity of about 46
   *  days, a coast at 0.130 of light speed, a braking burn of about 46 days, a week's approach, then orbit. The
   *  32.63-year voyage is counted from the start of the coast, as the story counts it. */
  const archive = {
    depart: on(3310, 1, 19), coast: on(3310, 3, 7), brake: on(3342, 8, 30), approach: on(3342, 10, 15),
    arrive: fractionalYear(new Date(orbitInStory)) - yearAtLaunch, cruise: 0.13, voyageYears: 32.63,
  };

  /** The crossing's length in the voyage's own century (the stars have drawn closer since today's 4.34). */
  archive.lightYears = 4.25;

  /** The other ships and the signal, on the same scale, for The Crossing. The advance crew's ship and the supply ship fly at a
   *  quarter of light speed. The signal goes out once the crew has held the ground for three years, and light takes its own
   *  time to cross: The Crossing's check holds these two pairs to each other. */
  const ships = {
    advance: { leave: 18.52, land: 35.88 },
    signal: { on: 38.88, heard: 40.56, lastSent: 50.49, lastHeard: 50.80 },
    supply: { leave: 41.10, land: 47.51 },
  };

  /** One gravity, in metres per second squared, and the units the departure view measures in. */
  const gravity = 9.80665;
  const secondsPerYear = 365.25 * 86400;
  const metresPerAU = 1.495978707e11;

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  /** How far the ship's calendar runs ahead of ours: the story's arrival minus the real date it falls on. */
  const [orbitYear, orbitMonth, orbitDay] = ORBIT_ON.split("-").map(Number);
  const aheadBy = orbitInStory - Date.UTC(orbitYear, orbitMonth - 1, orbitDay);

  /** The real moment the ship's clock reads orbit, which the hero's countdown runs to: midnight UTC on ORBIT_ON, since
   *  the ship's clock keeps UTC. */
  const arrivesAt = orbitInStory - aheadBy;

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

  /** The calendar moment for a point on the voyage's scale. */
  function dateAt(y) {
    const calendar = yearAtLaunch + y;
    const whole = Math.floor(calendar);
    const start = Date.UTC(whole, 0, 1);
    // To the nearest minute, so a phase that starts at midnight is not read as the minute before it.
    const at = start + (calendar - whole) * (Date.UTC(whole + 1, 0, 1) - start);
    return new Date(Math.round(at / 60000) * 60000);
  }

  /** "02 NOV 3341". */
  function dayStamp(date) {
    return `${String(date.getUTCDate()).padStart(2, "0")} ${months[date.getUTCMonth()].toUpperCase()} ${date.getUTCFullYear()}`;
  }

  /** The flight phase at a moment: departure burn, cruise, braking burn, final approach, or orbit. */
  function phaseAt(y) {
    if (y < archive.coast) return "departure";
    if (y < archive.brake) return "cruise";
    if (y < archive.approach) return "braking";
    if (y < archive.arrive) return "approach";
    return "orbit";
  }

  /** How far from the Sun the Archive is during its departure burn, in astronomical units (one gravity from rest). */
  function departureDistanceAU(y) {
    const seconds = Math.max(0, Math.min(y, archive.coast) - archive.depart) * secondsPerYear;
    return 0.5 * gravity * seconds * seconds / metresPerAU;
  }

  /** The published logs, as points on the voyage's scale. */
  const logs = PUBLISHED_LOGS.map(({ log, stamp: text }) => {
    const [, ly, lm, ld, lh, lmin] = text.match(/^(\d+)-(\d+)-(\d+) (\d+):(\d+)$/).map(Number);
    const date = new Date(Date.UTC(ly, lm - 1, ld, lh, lmin));
    return { log, date, y: voyageTime(date) };
  });

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

  /** The final week's approach speed, about 5 km/s, as a share of light. */
  const approachSpeed = 5 / 299792.458;

  /** Speed as a share of light: up through the first burn, level through the coast, down through the second, then the
   *  slow final approach, and zero once in orbit. */
  function speedAt(y) {
    const { depart, coast, brake, approach, arrive, cruise } = archive;
    if (y <= depart || y >= arrive) return 0;
    if (y >= approach) return approachSpeed;
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

  return { probe, archive, ships, arrivesAt, logs, now, shipNow, voyageTime, dateAt, dayStamp, monthYear, stamp, phaseAt, departureDistanceAU,
    speedAt, progressAt, voyageYearAt };
})();
