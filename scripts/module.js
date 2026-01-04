Hooks.once("init", () => {
  // General refresh function for sheets
  const refreshCharacters = () => {
    const characters = game.actors.filter(a => a.type === "character");
    characters.forEach(a => {
      a.prepareData();
      if (a.sheet?.rendered) a.sheet.render(true);
    });
  };

  // Specific handler for Paradox HP toggle
  const handleParadoxHpChange = async (enabled) => {
    const characters = game.actors.filter(a => a.type === "character");

    for (const actor of characters) {
      await actor.prepareData(); // Ensure latest data

      const data = actor.system;
      const level = data.details?.level?.value ?? 1;
      const conValue = data.attributes?.con?.value ?? 10;
      const conMod = data.attributes?.con?.mod ?? 0;

      // System default max (duplicate original formula)
      const oldMax = 8 + conMod + (level - 1) * (4 + Math.ceil(conMod / 2));

      // Custom new max
      let newMax = conValue * 2;
      if (level > 1) {
        newMax += (level - 1) * (conMod + Math.ceil(conValue / 2));
      }

      if (enabled) {
        const difference = Math.max(0, newMax - oldMax);
        if (difference > 0) {
          const currentValue = data.health.value ?? 0;
          const newValue = Math.min(newMax, currentValue + difference);
          await actor.update({ "system.health.value": newValue });
        }
      } else {
        // When disabling, clamp down to system max
        const clampValue = Math.min(data.health.value ?? 0, oldMax);
        if (clampValue < data.health.value) {
          await actor.update({ "system.health.value": clampValue });
        }
      }
    }

    refreshCharacters();
    ui.notifications.info(`Paradoxical Archive HP ${enabled ? "enabled" : "disabled"} — adjustments applied.`);
  };

  // Register settings
  game.settings.register("godbound-pa-options", "paradoxHp", {
    name: "Paradoxical Archive HP",
    hint: "Double Constitution value as base HP, plus (Con mod + ceil(Con value / 2)) per level after 1. Grants extra current HP on enable.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: handleParadoxHpChange
  });

  game.settings.register("godbound-pa-options", "paradoxDamage", {
    name: "Paradoxical Archive Damage",
    hint: "Remove damage table for normal rolls; double total for straight damage. (Current implementation is placeholder — needs roll wrapper.)",
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

  // Wrap actor prepareDerivedData — ONLY override max HP (do NOT touch value here)
  libWrapper.register("godbound-pa-options", "CONFIG.Actor.documentClass.prototype.prepareDerivedData", function (wrapped, ...args) {
    wrapped(...args);

    if (this.type !== "character") return;

    const data = this.system;
    const level = data.details?.level?.value ?? 1;

    if (game.settings.get("godbound-pa-options", "paradoxHp")) {
      const conValue = data.attributes?.con?.value ?? 10;
      const conMod = data.attributes?.con?.mod ?? 0;

      let newMax = conValue * 2;
      if (level > 1) {
        newMax += (level - 1) * (conMod + Math.ceil(conValue / 2));
      }

      data.health.max = newMax;
      // NO value adjustment here — handled one-time on setting change
    }

    // Effort override — recompute current properly (grants extra if commitments allow)
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
  }, "WRAPPER");

  // Damage placeholder — your current item wrapper is incorrect (damage isn't in prepareDerivedData, and die size doubling won't work right)
  // We'll fix this properly once HP/Effort are confirmed good.
});
