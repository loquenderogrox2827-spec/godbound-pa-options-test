Hooks.once("init", () => {
  // Register settings
  game.settings.register("godbound-pa-options", "paradoxHp", {
    name: "Paradoxical Archive HP",
    hint: "Double Constitution score as base HP, plus (half Con score + Con mod) per level after 1.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register("godbound-pa-options", "paradoxDamage", {
    name: "Paradoxical Archive Damage",
    hint: "NOTE: Checkbox added, but damage modification requires extra code (see guide).",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register("godbound-pa-options", "startingEffort", {
    name: "Starting Effort Override",
    hint: "Set custom Effort at level 1 (0 = no override).",
    scope: "world",
    config: true,
    type: Number,
    default: 0,
    range: { min: 0, max: 20, step: 1 }
  });

  // Wrap actor prepareDerivedData for HP and Effort overrides
  libWrapper.register("godbound-pa-options", "CONFIG.Actor.documentClass.prototype.prepareDerivedData", function (wrapped, ...args) {
    wrapped(...args); // Run original calculation first

    // Skip if not a character/PC actor (adjust 'character' if the type is different, e.g., 'pc')
    if (this.type !== "character") return;

    const data = this.system;
    const level = data.details?.level?.value ?? 1;

    // Paradoxical Archive HP
    if (game.settings.get("godbound-pa-options", "paradoxHp")) {
      const conScore = data.attributes?.con?.score ?? 8; // Fallback to 8 if missing
      const conMod = data.attributes?.con?.mod ?? 0;
      let newMaxHp = 2 * conScore;
      if (level > 1) {
        newMaxHp += (level - 1) * (Math.floor(conScore / 2) + conMod);
      }
      data.hp.max = newMaxHp;
      // Optional: Heal to new max if current exceeds it
      // data.hp.value = Math.min(data.hp.value, newMaxHp);
    }

    // Starting Effort Override (only at level 1)
    const effortOverride = game.settings.get("godbound-pa-options", "startingEffort");
    if (effortOverride > 0 && level === 1) {
      data.effort.max = effortOverride;
      // If there's a current value, clamp it
      if (data.effort.value > effortOverride) data.effort.value = effortOverride;
    }
  }, "WRAPPER");
});
