// settings + toggle handler (init)
Hooks.once("init", () => {
  const refreshCharacters = () => {
    const characters = game.actors.filter(a => a.type === "character");
    characters.forEach(a => {
      a.prepareData();
      if (a.sheet?.rendered) a.sheet.render(true);
    });
  };

  const handleParadoxHpChange = async (enabled) => {
    const characters = game.actors.filter(a => a.type === "character");
    let updatedCount = 0;

    for (const actor of characters) {
      const data = actor.system;
      const level = data.details?.level?.value ?? 1;
      const conValue = data.attributes?.con?.value ?? 10;
      const conMod = data.attributes?.con?.mod ?? 0;

      const oldMax = 8 + conMod + (level - 1) * (4 + Math.ceil(conMod / 2));
      let newMax = conValue * 2;
      if (level > 1) newMax += (level - 1) * (conMod + Math.ceil(conValue / 2));

      const currentValue = data.health?.value ?? 0;

      if (enabled) {
        // one-time persistent proportional grant (preserve ratio by adding difference)
        const difference = Math.max(0, newMax - oldMax);
        const newValue = Math.min(currentValue + difference, newMax);
        if (newValue !== currentValue) {
          await actor.update({ "system.health.value": newValue });
          updatedCount++;
        }
      } else {
        // disable: clamp persistent value down to old system max
        const clampValue = Math.min(currentValue, oldMax);
        if (clampValue < currentValue) {
          await actor.update({ "system.health.value": clampValue });
          updatedCount++;
        }
      }
    }

    refreshCharacters();
    ui.notifications.info(`Paradoxical Archive HP ${enabled ? "enabled" : "disabled"} — ${updatedCount} character(s) adjusted and refreshed.`);
  };

  game.settings.register("godbound-pa-options", "paradoxHp", {
    name: "Paradoxical Archive HP",
    hint: "Double Con value as base HP + per-level bonus.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: handleParadoxHpChange
  });

  game.settings.register("godbound-pa-options", "paradoxDamage", {
    name: "Paradoxical Archive Damage",
    hint: "Placeholder.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: refreshCharacters
  });

  game.settings.register("godbound-pa-options", "startingEffort", {
    name: "Starting Effort Override",
    hint: "Set custom Effort at level 1 (0 = no override).",
    scope: "world",
    config: true,
    type: Number,
    default: 0,
    range: { min: 0, max: 20, step: 1 },
    onChange: refreshCharacters
  });
});

// register wrapper robustly (use libWrapper.Ready if available, otherwise ready)
const registerWrappers = () => {
  if (typeof libWrapper === "undefined" || typeof libWrapper.register !== "function") {
    ui.notifications.error("godbound-pa-options: libWrapper not found. Please install/enable the 'lib-wrapper' module.");
    console.error("godbound-pa-options: libWrapper missing; wrapper not registered.");
    return;
  }

  libWrapper.register(
    "godbound-pa-options",
    "CONFIG.Actor.documentClass.prototype.prepareLevelValues",
    function (wrapped, ...args) {
      // call original first
      wrapped(...args);

      if (this.type !== "character") return;

      const data = this.system;
      const level = data.details?.level?.value ?? 1;

      if (game.settings.get("godbound-pa-options", "paradoxHp")) {
        const conValue = data.attributes?.con?.value ?? 10;
        const conMod = data.attributes?.con?.mod ?? 0;

        let newMax = conValue * 2;
        if (level > 1) newMax += (level - 1) * (conMod + Math.ceil(conValue / 2));

        // ONLY set derived max and clamp — do NOT rescale every prepare
        data.health.max = newMax;
        data.health.value = Math.min(data.health.value, newMax);
      }

      // Effort override at level 1
      const effortOverride = game.settings.get("godbound-pa-options", "startingEffort");
      if (effortOverride > 0 && level === 1) {
        const committed = this.items.reduce((acc, item) => {
          if (["word", "gift"].includes(item.type)) {
            return acc + (item.system.effort || 0);
          }
          return acc;
        }, 0);

        data.resources.effort.max = effortOverride;
        data.resources.effort.value = Math.max(0, effortOverride - committed);
      }
    },
    "WRAPPER"
  );
};

// prefer libWrapper.Ready, fallback to ready
if (typeof Hooks !== "undefined") {
  Hooks.once?.("libWrapper.Ready", registerWrappers);
  Hooks.once?.("ready", () => {
    // if libWrapper.Ready fired then we already registered; otherwise try now
    if (typeof libWrapper !== "undefined" && libWrapper.register) {
      registerWrappers();
    }
  });
}
