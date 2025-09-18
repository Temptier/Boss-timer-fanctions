const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp();

// ⚠️ Keep this private — do not share publicly!
const DISCORD_WEBHOOK = "https://canary.discord.com/api/webhooks/1418184593047289956/d0xJb2P_tDCDzmQXuBDj09s6S5qN5we22Ub6-1qJvnPrt99taW97zSZtYfGg9iccPWVe";

// Notify 5 minutes before end
const NOTIFY_MIN = 5;
const NOTIFY_WINDOW_MS = 2 * 60 * 1000; // tolerance for scheduler

// Predefined boss hours
const PREDEFINED_HOURS = {
  manual_venatus: 10,
  manual_viorent: 10,
  manual_ego: 21,
  manual_levera: 24,
  manual_araneo: 24,
  manual_undomiel: 24,
  manual_lady_dalia: 18,
  manual_general_aquleus: 29,
  manual_amentis: 29,
  manual_baron_braudmore: 32,
  manual_wannitas: 48,
  manual_metus: 48,
  manual_duplican: 35,
  manual_shuliar: 35,
  manual_gareth: 32,
  manual_titore: 37,
  manual_larba: 35,
  manual_catena: 35
};

exports.checkTimers = functions.https.onRequest(async (req, res) => {
  try {
    const now = Date.now();

    const [timersSnap, manualDefsSnap, announcedSnap] = await Promise.all([
      admin.database().ref("timers").once("value"),
      admin.database().ref("manualDefs").once("value"),
      admin.database().ref("announced").once("value")
    ]);

    const timers = timersSnap.val() || {};
    const manualDefs = manualDefsSnap.val() || {};
    const announced = announcedSnap.val() || {};
    const announceRef = admin.database().ref("announced");

    const jobs = [];

    for (const id in timers) {
      const entry = timers[id];
      if (!entry || !entry.startedAt) continue;

      // Boss hours from manualDefs or predefined
      let hours = (manualDefs[id] && manualDefs[id].hours)
        ? manualDefs[id].hours
        : (PREDEFINED_HOURS[id] || 24);

      const endTime = Number(entry.startedAt) + hours * 3600 * 1000;
      const notifyAt = endTime - NOTIFY_MIN * 60 * 1000;
      const announceKey = `${id}_${endTime}`;

      if (announced && announced[announceKey]) continue;

      if (now >= notifyAt && now <= (notifyAt + NOTIFY_WINDOW_MS)) {
        const p = announceRef.child(announceKey).transaction(current => {
          if (current) return;
          return { sentAt: now, timerId: id };
        }).then(result => {
          if (result.committed) {
            const bossLabel = id.replace(/^manual_/, "");
            const userName = entry.user || "unknown";
            const guild = entry.guild || "";
            const content = `⏰ **${bossLabel}** will end in ${NOTIFY_MIN} minutes — last restarted by ${userName} [${guild}]`;

            return fetch(DISCORD_WEBHOOK, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ content })
            });
          }
        });
        jobs.push(p);
      }
    }

    await Promise.all(jobs);
    return res.status(200).send("checked");
  } catch (err) {
    console.error(err);
    return res.status(500).send("error");
  }
});
