Hooks.once("init", () => {
  // General refresh function for sheets
  const refreshCharacters = () => {
    const characters = game.actors.filter(a => a.type === "character");
    characters.forEach(a => {
      a.prepareData();
      if (a.sheet?.rendered) a.sheet.render(true);
    });
  };

  // Specific handler for Paradox HP toggle — one-time proportional grant on enable
  const handleParadoxHpChange = async (enabled) => {
    const characters = game.actors.filter(a => a.type === "character");

    let updatedCount = 0;

    for (const actor of characters) {
      const data = actor.system; // Persistent data — no need to prepare first
      const level = data.details?.level?.value ?? 1;
      const conValue = data.attributes?.con?.value ?? 10;
      const conMod = data.attributes?.con?.mod ?? 0;

      // Hardcoded system default max (exact match to original formula)
      const oldMax = 8 + conMod + (level - 1) * (4 + Math.ceil(conMod / 2));

      // Your custom max
      let newMax = conValue * 2;
      if (level > 1) {
        newMax += (level - 1) * (conMod + Math.ceil(conValue / 2));
      }

      const currentValue = data.health?.value ?? 0;

      if (enabled) {
        const difference = Math.max(0, newMax - oldMax);
        const newValue = Math.min(currentValue + difference, newMax);

        if (newValue !== currentValue) {
          await actor.update({ "system.health.value": newValue });
          updatedCount++;
        }
      } else {
        // When disabling, clamp down to old system max
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

  // Register settings
  game.settings.register("godbound-pa-options", "paradoxHp", {
    name: "Paradoxical Archive HP",
    hint: "Double Con value as base HP + per-level bonus. On enable: grants proportional extra current HP (preserves relative health). On disable: clamps excess.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: handleParadoxHpChange
  });

  game.settings.register("godbound-pa-options", "paradoxDamage", {
    name: "Paradoxical Archive Damage",
    hint: "Placeholder checkbox for damage changes (not yet implemented).",
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

  // Wrap prepareDerivedData — override max HP + Effort (do NOT touch health.value here)
libWrapper.register(
  "godbound-pa-options",
  "CONFIG.Actor.documentClass.prototype.prepareDerivedData",
  function (wrapped, ...args) {
    wrapped(...args);
    if (this.type !== "character") return;

    const data = this.system;
    const level = data.details?.level?.value ?? 1;

    if (game.settings.get("godbound-pa-options", "paradoxHp")) {
      const conValue = data.attributes?.con?.value ?? 10;
      const conMod = data.attributes?.con?.mod ?? 0;

      // compute new max
      let newMax = conValue * 2;
      if (level > 1) newMax += (level - 1) * (conMod + Math.ceil(conValue / 2));

      // preserve the current % of HP relative to the OLD max (so characters don't lose ratio)
      const oldMax = data.health?.max ?? 1;
      const oldValue = data.health?.value ?? 0;
      const pct = oldMax > 0 ? (oldValue / oldMax) : 1;

      // set derived values for display (not persistent)
      data.health.max = newMax;
      data.health.value = Math.min(Math.round(pct * newMax), newMax);
    }
        return acc;
      }, 0);

      data.resources.effort.max = effortOverride;
      data.resources.effort.value = Math.max(0, effortOverride - committed);
    }
  }, "WRAPPER");
});
